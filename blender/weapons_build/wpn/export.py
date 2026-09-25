"""Game export of a weapon: `public/models/<asset>.{json,bin}`.

One rigid body in the weapon frame (see kit.py), stored per material slot with
the characters' mesh encoding (quantized positions, octahedral normals; see
src/content/transformer/asset/format.ts). The manifest also carries the grip
points and the cutting edge the game traces.
"""
import json
import os
import numpy as np
import bpy

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'public', 'models'))


def _mesh_arrays(o, weapon):
    """Evaluated triangles of o in the weapon frame, split by material slot."""
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
    prefix = weapon + '.'
    slots = []
    for s in o.material_slots:
        if not (s.material and s.material.name.startswith(prefix)):
            raise ValueError('%s: material %r is not a %s slot' % (o.name, s.material.name if s.material else None, weapon))
        slots.append(s.material.name[len(prefix):])
    ev.to_mesh_clear()
    M = o.matrix_world
    R = np.array(M.to_3x3())
    pos_all = co @ R.T + np.array(M.translation)
    Rn = np.array(M.to_3x3().inverted().transposed())
    out = {}
    for mi in np.unique(tm):
        loops = tl[tm == mi].reshape(-1)
        p = pos_all[lv[loops]]
        n = cn[loops] @ Rn.T
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        prev = out.get(slots[mi])
        out[slots[mi]] = (np.concatenate([prev[0], p]), np.concatenate([prev[1], n])) if prev else (p, n)
    return out


def _weld(p, n):
    """Weld triangle corners that share position and normal."""
    key = np.concatenate([np.round(p, 5), np.round(n, 3)], axis=1)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    first = np.zeros(len(uniq), np.int64)
    first[inv[::-1]] = np.arange(len(inv))[::-1]
    return p[first], n[first], inv.reshape(-1, 3)


def _oct(n):
    s = np.sum(np.abs(n), axis=1, keepdims=True)
    n = n / np.maximum(s, 1e-9)
    x, y, z = n[:, 0], n[:, 1], n[:, 2]
    neg = z < 0
    ox = np.where(neg, (1 - np.abs(y)) * np.sign(x + 1e-12), x)
    oy = np.where(neg, (1 - np.abs(x)) * np.sign(y + 1e-12), y)
    return np.stack([np.round(ox * 32767), np.round(oy * 32767)], axis=1).astype(np.int16)


class Blob:
    def __init__(self):
        self.parts = []
        self.size = 0

    def add(self, arr):
        b = arr.tobytes()
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


def export(weapon, coll, asset, meta, out_dir=OUT_DIR):
    by_slot = {}
    for o in coll.all_objects:
        if o.type != 'MESH' or o.hide_render or not len(o.data.polygons):
            continue
        for slot, (p, n) in _mesh_arrays(o, weapon).items():
            by_slot.setdefault(slot, []).append((p, n))
    blob = Blob()
    meshes = []
    tris = 0
    lo_all, hi_all = np.full(3, 1e9), np.full(3, -1e9)
    radius = 0.0
    for slot in sorted(by_slot):
        p = np.concatenate([a for a, _ in by_slot[slot]])
        n = np.concatenate([b for _, b in by_slot[slot]])
        P, N, I = _weld(p, n)
        lo, hi = P.min(0), P.max(0)
        lo_all, hi_all = np.minimum(lo_all, lo), np.maximum(hi_all, hi)
        radius = max(radius, float(np.sqrt((P[:, 0] ** 2 + P[:, 1] ** 2).max())))
        span = np.maximum(hi - lo, 1e-9)
        q = np.round((P - lo) / span * 65535 - 32768).astype(np.int16)
        idx = I.astype(np.uint16 if len(P) < 65536 else np.uint32)
        meshes.append(dict(material=slot, count=int(len(P)), triangles=int(len(I)), min=[float(v) for v in lo], max=[float(v) for v in hi],
                           position=blob.add(q), normal=blob.add(_oct(N)), index=blob.add(idx.reshape(-1)), index32=bool(len(P) >= 65536)))
        tris += len(I)
    manifest = dict(version=1, name=weapon, meshes=meshes, triangles=int(tris),
                    extent=[float(lo_all[2]), float(hi_all[2])], radius=radius, **meta)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, asset + '.bin'), 'wb') as f:
        f.write(blob.bytes())
    with open(os.path.join(out_dir, asset + '.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    return manifest
