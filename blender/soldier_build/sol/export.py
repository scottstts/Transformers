"""Game export of the soldier: `public/models/soldier.{json,bin}`.

The soldier is drawn as a horde: every material slot is one merged geometry
for all parts, each vertex carrying the index of the bone it rides, positions
in that bone's frame (the parts are modelled there, see rig.py). The game
keeps one matrix per bone per soldier in a GPU buffer, so any number of
soldiers costs one draw per slot.

  lods      three detail tiers (LOD0 as built; LOD1 / LOD2 collapse-decimated
            before the weighted normals, so shading stays clean)
  shadow    one slot-less proxy (LOD2, emissive parts left out): the sun's
            shadow pass draws it instead of the lit meshes
  bones     name, parent, rest local translation and rotation (x, y, z, w)
  pieces    per bone: the part's box (centre, half extents in the bone frame)
            and mass, for the break-apart debris

Encoding as the transformers (src/content/transformer/asset/format.ts):
quantized int16 positions, octahedral int16 normals; bones as uint8.
"""
import json
import os
import numpy as np
import bpy
from . import rig, saber

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'public', 'models'))
LOD_RATIOS = (1.0, 0.24, 0.07)
SHADOW_SKIP = {'glow', 'blade', 'visor'}
PREFIX = 'soldier.'


class Blob:
    def __init__(self):
        self.parts = []
        self.size = 0

    def add(self, arr):
        b = np.ascontiguousarray(arr).tobytes()
        pad = (-self.size) % 4
        if pad:
            self.parts.append(b'\0' * pad)
            self.size += pad
        off = self.size
        self.parts.append(b)
        self.size += len(b)
        return off

    def bytes(self):
        return b''.join(self.parts)


def _evaluated(o, ratio):
    """Triangles of o (bone frame) by slot: {slot: (positions, normals)}."""
    added = None
    if ratio < 1.0:
        added = o.modifiers.new('lod', 'DECIMATE')
        added.decimate_type = 'COLLAPSE'
        added.ratio = ratio
        added.use_collapse_triangulate = True
        names = [m.name for m in o.modifiers]
        if 'wnormal' in names:
            with bpy.context.temp_override(object=o):
                bpy.ops.object.modifier_move_to_index(modifier='lod', index=names.index('wnormal'))
    try:
        dg = bpy.context.evaluated_depsgraph_get()
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        co = np.empty(len(me.vertices) * 3, np.float64)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        nl = len(me.loops)
        cn = np.empty(nl * 3, np.float64)
        me.corner_normals.foreach_get('vector', cn)
        cn = cn.reshape(-1, 3)
        lv = np.empty(nl, np.int32)
        me.loops.foreach_get('vertex_index', lv)
        nt = len(me.loop_triangles)
        tl = np.empty(nt * 3, np.int32)
        me.loop_triangles.foreach_get('loops', tl)
        tl = tl.reshape(-1, 3)
        tm = np.empty(nt, np.int32)
        me.loop_triangles.foreach_get('material_index', tm)
        slots = []
        for s in o.material_slots:
            if not (s.material and s.material.name.startswith(PREFIX)):
                raise ValueError('%s: material %r is not a soldier slot' % (o.name, s.material.name if s.material else None))
            slots.append(s.material.name[len(PREFIX):])
        ev.to_mesh_clear()
    finally:
        if added is not None:
            o.modifiers.remove(added)
    out = {}
    for mi in np.unique(tm):
        loops = tl[tm == mi].reshape(-1)
        p = co[lv[loops]]
        n = cn[loops]
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        prev = out.get(slots[mi])
        out[slots[mi]] = (np.concatenate([prev[0], p]), np.concatenate([prev[1], n])) if prev else (p, n)
    return out


def _weld(p, n, b):
    key = np.concatenate([np.round(p, 5), np.round(n, 3), b[:, None].astype(np.float64)], axis=1)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    first = np.zeros(len(uniq), np.int64)
    first[inv[::-1]] = np.arange(len(inv))[::-1]
    return p[first], n[first], b[first], inv.reshape(-1, 3)


def _oct(n):
    s = np.sum(np.abs(n), axis=1, keepdims=True)
    n = n / np.maximum(s, 1e-9)
    x, y, z = n[:, 0], n[:, 1], n[:, 2]
    neg = z < 0
    ox = np.where(neg, (1 - np.abs(y)) * np.sign(x + 1e-12), x)
    oy = np.where(neg, (1 - np.abs(x)) * np.sign(y + 1e-12), y)
    return np.stack([np.round(ox * 32767), np.round(oy * 32767)], axis=1).astype(np.int16)


def _record(blob, material, p, n, b):
    P, N, B, I = _weld(p, n, b)
    lo, hi = P.min(0), P.max(0)
    span = np.maximum(hi - lo, 1e-9)
    q = np.round((P - lo) / span * 65535 - 32768).astype(np.int16)
    big = len(P) >= 65536
    idx = I.astype(np.uint32 if big else np.uint16).reshape(-1)
    rec = dict(material=material, count=int(len(P)), triangles=int(len(I)), min=[float(v) for v in lo], max=[float(v) for v in hi],
               position=blob.add(q), index=blob.add(idx), index32=bool(big), bone=blob.add(B.astype(np.uint8)))
    if n is not None:
        rec['normal'] = blob.add(_oct(N))
    return rec


def export(coll, out_dir=OUT_DIR, name='soldier'):
    bone_index = {b: i for i, b in enumerate(rig.NAMES)}
    parts = [o for o in coll.all_objects if o.type == 'MESH' and len(o.data.polygons)]
    blob = Blob()
    lods = []
    shadow = None
    pieces = {}
    for li, ratio in enumerate(LOD_RATIOS):
        by_slot = {}
        for o in parts:
            b = bone_index[o['bone']]
            for slot, (p, n) in _evaluated(o, ratio).items():
                by_slot.setdefault(slot, []).append((p, n, np.full(len(p), b, np.uint8)))
                if li == 0 and slot not in ('blade',):
                    pieces.setdefault(o['bone'], []).append(p)
        meshes = []
        tris = 0
        for slot in sorted(by_slot):
            p = np.concatenate([a for a, _, _ in by_slot[slot]])
            n = np.concatenate([c for _, c, _ in by_slot[slot]])
            bb = np.concatenate([c for _, _, c in by_slot[slot]])
            rec = _record(blob, slot, p, n, bb)
            meshes.append(rec)
            tris += rec['triangles']
        lods.append(dict(meshes=meshes, triangles=tris))
        if li == len(LOD_RATIOS) - 1:
            keep = [s for s in by_slot if s not in SHADOW_SKIP]
            p = np.concatenate([a for s in keep for a, _, _ in by_slot[s]])
            bb = np.concatenate([c for s in keep for _, _, c in by_slot[s]])
            # positions only: the proxy is welded on position and bone
            shadow = _record(blob, 'shadow', p, np.zeros_like(p), bb)
            del shadow['normal']
    bones = []
    for nm in rig.NAMES:
        L = rig.local_matrix(nm)
        t, q = L.translation, L.to_quaternion()
        bones.append(dict(name=nm, parent=bone_index[rig.PARENT[nm]] if rig.PARENT[nm] else -1,
                          t=[float(t.x), float(t.y), float(t.z)], q=[float(q.x), float(q.y), float(q.z), float(q.w)]))
    piece_list = []
    for nm in rig.NAMES:
        if nm not in pieces:
            continue
        p = np.concatenate(pieces[nm])
        lo, hi = p.min(0), p.max(0)
        c, h = (lo + hi) / 2, (hi - lo) / 2
        # alloy shells over light cores: a filled box at ~1.1 t/m^3 effective density
        mass = float(8 * h[0] * h[1] * h[2] * 1100)
        piece_list.append(dict(bone=bone_index[nm], center=[float(v) for v in c], half=[float(v) for v in h], mass=round(mass, 2)))
    manifest = dict(
        version=1, name=name, bones=bones, lods=lods, shadow=shadow, pieces=piece_list,
        dims=dict(height=3.0, wheelRadius=rig.WHEEL_R, wheelX=rig.WHEEL_X, ankleUp=rig.ANKLE_UP, thigh=rig.THIGH, shin=rig.SHIN,
                  upper=rig.UPPER, fore=rig.FORE, hipZ=rig.HIP_Z, stanceX=rig.STANCE_X, bladeLength=saber.BLADE_LEN, bladeRadius=saber.CORE_R),
    )
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, name + '.bin'), 'wb') as f:
        f.write(blob.bytes())
    with open(os.path.join(out_dir, name + '.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    return manifest
