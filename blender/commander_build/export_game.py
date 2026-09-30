"""Headless build and export of the approved commander.

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/commander.blend \
        --python-exit-code 1 --python blender/commander_build/export_game.py

The rebuilt mesh, shading and materials must match the loaded approved scene.
The .blend is never overwritten. Model conflicts abort before asset writes.
"""
import hashlib
import importlib
import json
from pathlib import Path
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
for path in (ROOT, ROOT.parent / 'soldier_build', ROOT.parent / 'ferrari-f1_build'):
    sys.path.insert(0, str(path))
for name in list(sys.modules):
    if name == 'cmd' or name.startswith('cmd.'):
        del sys.modules[name]

build = importlib.import_module('cmd.build')
rig = importlib.import_module('cmd.rig')
from sol import export as shared_export, rig as soldier_rig

SHADOW_SKIP = {'glow', 'blade', 'visor'}
# The user explicitly approved the current antenna-inclusive height.
APPROVED_HEIGHT = 6.914880275726318


def require(condition, message):
    if not condition:
        raise ValueError('Commander spec conflict: ' + message)


def parts(coll):
    return [o for o in coll.all_objects if o.type == 'MESH' and len(o.data.polygons)]


def snapshot(coll):
    """Hash the evaluated geometry and shading without changing the scene."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    result = {}
    for ob in sorted(coll.all_objects, key=lambda o: o.name):
        digest = hashlib.sha256()
        digest.update(np.asarray(ob.matrix_world, dtype=np.float32).tobytes())
        digest.update(str(ob.get('bone', '')).encode())
        if ob.type == 'MESH':
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            try:
                me.calc_loop_triangles()
                for data, prop, count, dtype in (
                    (me.vertices, 'co', len(me.vertices) * 3, np.float32),
                    (me.corner_normals, 'vector', len(me.loops) * 3, np.float32),
                    (me.loop_triangles, 'loops', len(me.loop_triangles) * 3, np.int32),
                    (me.loops, 'vertex_index', len(me.loops), np.int32),
                    (me.loop_triangles, 'material_index', len(me.loop_triangles), np.int32),
                ):
                    values = np.empty(count, dtype=dtype)
                    data.foreach_get(prop, values)
                    digest.update(values.tobytes())
                for material in me.materials:
                    digest.update(material.name.encode())
                    digest.update(repr(tuple(material.diffuse_color)).encode())
                    for node in material.node_tree.nodes:
                        digest.update(node.type.encode())
                        for socket in node.inputs:
                            if hasattr(socket, 'default_value'):
                                value = socket.default_value
                                if not isinstance(value, (str, int, float, bool)):
                                    value = tuple(value)
                                digest.update(repr((socket.identifier, value)).encode())
            finally:
                ev.to_mesh_clear()
        result[ob.name] = digest.hexdigest()
    return result


def inspect_source(coll):
    require(len(rig.NAMES) <= 32, 'more than 32 bones')
    require(len(set(rig.NAMES)) == len(rig.NAMES), 'duplicate bone names')
    require(set(soldier_rig.NAMES).issubset(rig.NAMES), 'required bones are missing')
    bones = {o.name.removeprefix('cmd.bone.'): o for o in coll.all_objects
             if o.name.startswith('cmd.bone.')}
    require(set(bones) == set(rig.NAMES), 'scene bones differ from cmd/rig.py')
    world = rig.rest_world()
    body, feet, wheels, head, energy = [], [], [], [], []
    non_blade_bones = set()
    used_slots = set()
    for ob in parts(coll):
        bone = ob.get('bone')
        require(bone in rig.NAMES, ob.name + ': invalid bone property')
        require(ob.parent == bones[bone], ob.name + ': parent is not its bone')
        require(np.allclose(np.asarray(ob.matrix_basis), np.eye(4), atol=1e-7),
                ob.name + ': geometry is not in its bone frame')
        require(not ob.vertex_groups and not ob.data.shape_keys and
                not any(m.type == 'ARMATURE' for m in ob.modifiers),
                ob.name + ': deformation is present')
        require(ob.modifiers and ob.modifiers[-1].name == 'wnormal' and
                ob.modifiers[-1].type == 'WEIGHTED_NORMAL' and
                ob.modifiers[-1].show_viewport and ob.modifiers[-1].show_render,
                ob.name + ': final enabled wnormal is missing')
        require(all(m.segments == 1 for m in ob.modifiers if m.type == 'BEVEL'),
                ob.name + ': bevel uses more than one segment')
        for slot, (positions, normals) in shared_export._evaluated(ob, 1.0, 'commander.').items():
            require(slot != '', ob.name + ': unnamed material slot')
            require(np.isfinite(positions).all() and np.isfinite(normals).all(),
                    ob.name + ': nonfinite geometry')
            used_slots.add(slot)
            w = np.asarray(world[bone], dtype=np.float64)
            points = positions @ w[:3, :3].T + w[:3, 3]
            if slot != 'blade':
                non_blade_bones.add(bone)
            if bone not in ('weapon', 'blade'):
                body.append(points)
            if bone.startswith(('foot.', 'wheel.')):
                feet.append(points)
            if bone.startswith('wheel.'):
                wheels.append(points)
            if bone == 'head':
                head.append(points)
            if slot == 'blade':
                require(bone == 'blade', ob.name + ': energy is not on the blade bone')
                energy.append(positions)
    require(rig.PARENT['weapon'] == 'hand.R', 'weapon is not under hand.R')
    for name in rig.NAMES:
        parent = rig.PARENT[name]
        require(parent is None or rig.NAMES.index(parent) < rig.NAMES.index(name),
                name + ': invalid hierarchy')
        if name in soldier_rig.PARENT and name != 'blade':
            require(parent == soldier_rig.PARENT[name], name + ': hierarchy differs from soldier')
    require(rig.PARENT['blade'] in ('weapon', 'hand.R'), 'blade is not carried by the right hand')
    body, feet, wheels, head, energy = map(np.concatenate, (body, feet, wheels, head, energy))
    axis = np.asarray(world['pelvis'].translation)[:2]
    dims = rig.dims()
    dims['height'] = float(head[:, 2].max())
    dims['bodyRadius'] = float(np.linalg.norm(feet[:, :2] - axis, axis=1).max())
    dims['bladeRadius'] = float(np.linalg.norm(energy[:, :2], axis=1).max())
    require(5.8 <= dims['height'] <= 6.6 or abs(dims['height'] - APPROVED_HEIGHT) < .01,
            'height differs from both the spec and the approved exception')
    require(dims['bodyRadius'] <= 1.9, 'footprint radius exceeds 1.9 m')
    require(5 <= dims['reach'] <= 8, 'reach is outside 5–8 m')
    require(float(np.ptp(body[:, 0])) <= 4.4, 'rest width exceeds 4.4 m')
    require(abs(float(wheels[:, 2].min())) <= .01, 'wheels do not touch the ground')
    require(float(body[:, 2].min()) >= float(wheels[:, 2].min()) - .001,
            'a body part is below the wheels')
    require(abs(float(energy[:, 2].min())) < 1e-5 and
            abs(float(energy[:, 2].max()) - dims['bladeLength']) < 1e-5,
            'energy does not run from 0 to bladeLength along local +Z')
    require(all(abs(world[n].translation.z - rig.WHEEL_R) <= .01 and
                abs((world[n].to_3x3() @ Vector((1, 0, 0))).x) > .999
                for n in rig.NAMES if n.startswith('wheel.')),
            'wheel axle origin or axis is invalid')
    print('commander: source checks passed; %d material slots, width %.6f m' %
          (len(used_slots), np.ptp(body[:, 0])))
    return dims, non_blade_bones


def validate_manifest(manifest, non_blade_bones):
    require(manifest['version'] == 1 and manifest['name'] == 'commander', 'manifest identity')
    require(len(manifest['lods']) == 3, 'expected three LOD tiers')
    for index, (lod, budget) in enumerate(zip(manifest['lods'], (140000, 34000, 10000))):
        require(lod['triangles'] <= budget, 'LOD%d exceeds %d triangles' % (index, budget))
    require(manifest['shadow']['triangles'] <= 9000, 'shadow exceeds 9000 triangles')
    require('normal' not in manifest['shadow'], 'shadow is not position-only')
    expected_shadow = sum(m['triangles'] for m in manifest['lods'][2]['meshes']
                          if m['material'] not in SHADOW_SKIP)
    require(manifest['shadow']['triangles'] == expected_shadow, 'shadow includes excluded slots')
    pieces = {manifest['bones'][p['bone']]['name'] for p in manifest['pieces']}
    require(pieces == non_blade_bones, 'piece coverage differs from non-blade bones')
    require(all(p['mass'] > 0 and all(h > 0 for h in p['half']) for p in manifest['pieces']),
            'a piece has nonpositive mass or extents')


t = time.time()
approved = bpy.data.collections.get('COMMANDER')
require(approved is not None and parts(approved), 'approved COMMANDER scene is missing')
before = snapshot(approved)
coll = build.build()
after = snapshot(coll)
changed = [name for name in sorted(set(before) | set(after)) if before.get(name) != after.get(name)]
require(not changed, 'build differs from the approved scene: ' + ', '.join(changed))
print('commander: rebuilt geometry, shading, transforms and materials match the approved scene')
dims, non_blade_bones = inspect_source(coll)
manifest = shared_export.export(
    coll, out_dir=str(PROJECT / 'public' / 'models'), name='commander',
    material_prefix='commander.', rig_module=rig, shadow_skip=SHADOW_SKIP, dims=dims,
    validate=lambda m: validate_manifest(m, non_blade_bones),
)
print('commander: LOD triangles %s, shadow %d, %d bones, %d pieces in %.1fs' % (
    [lod['triangles'] for lod in manifest['lods']], manifest['shadow']['triangles'],
    len(manifest['bones']), len(manifest['pieces']), time.time() - t))
print('commander: dims ' + json.dumps(manifest['dims'], sort_keys=True))
print('commander: exported public/models/commander.{json,bin}; approved .blend preserved')
