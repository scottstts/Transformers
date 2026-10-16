"""Mesh-only refresh of robot castings; never rebuild or rebake the rig.

Existing nest offsets are the coordinate contract, including at frame zero.
Run sync() in the open roadster scene after reloading edited builder modules.
"""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix
from . import kit as K, rig, r_head, r_leg, r_arm, r_torso
from .robot import HEAD_FINISH


def sync(head_only=True):
    assert bpy.data.filepath.endswith('/blender/roadster.blend')
    K.MATERIALS.update({m.name[9:]: m for m in bpy.data.materials if m.name.startswith('roadster.')})
    meshes = {'head.' + n: m for n, m in r_head.build_meshes().items()}
    meshes['neck'] = r_head.neck_meshes()
    for s in (() if head_only else (-1, 1)):
        for n, (m, _, _) in r_leg.side(s).items():
            if n.endswith('.armour'):
                meshes[n] = m
        for n, (m, _, _) in r_arm.side(s).items():
            if n.startswith('forearm.') and n.endswith('.armour'):
                meshes[n] = m
    for n, (m, _) in ({} if head_only else r_torso.spine()).items():
        if n.endswith('.armour'):
            meshes[n] = m
    for name, mesh in meshes.items():
        obj = bpy.data.objects['robot.' + name]
        nest = obj.parent
        origin = rig.HEADS[nest['nest_bone']] + Vector(nest['nest_offset'])
        angle = HEAD_FINISH.get(name, (0, 12))[1]
        temp = mesh.build('refine.temp', '02_ROBOT', rest=Matrix.Translation(origin), bevel=0, smooth_angle=angle)
        if name.startswith('head.') or name == 'neck':
            bm = bmesh.new()
            bm.from_mesh(temp.data)
            defects = (sum(not e.is_manifold for e in bm.edges),
                       sum(f.calc_area() < 1e-10 for f in bm.faces),
                       sum(not v.link_faces for v in bm.verts))
            bm.free()
            if any(defects):
                bpy.data.objects.remove(temp, do_unlink=True)
                raise ValueError((name, 'nonmanifold / degenerate / loose', defects))
        old = obj.data
        obj.data = temp.data
        bpy.data.objects.remove(temp, do_unlink=True)
        if old.users == 0:
            bpy.data.meshes.remove(old)
        obj.data.name = obj.name
        if name in HEAD_FINISH:
            for modifier in obj.modifiers:
                if modifier.type == 'BEVEL':
                    modifier.width = HEAD_FINISH[name][0]
                    modifier.angle_limit = math.radians(angle)
    bpy.context.view_layer.update()
    return list(meshes)
