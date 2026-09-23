"""Game export: one binary asset (+ JSON manifest) for the three.js runtime.

Nodes are the mechanism's rigid bodies: skeleton bones, car assemblies, wheels
(hub-centred so the game can spin and steer them) and lifter stages. Geometry is
stored per node and material slot in the node's own frame (quantized positions,
octahedral normals). The transformation is baked as each node's local transform
relative to its parent for every frame of T in [0, 1], plus the ground lift, so
the runtime replays exactly what the audits verified. The rig block carries the
robot's stand pose and dimensions for the live gait at T = 1; the event list
drives the procedural mechanism audio.

Blender frame (x = robot left, -y = forward, z = up) is kept; the runtime puts
the whole model under one -90 deg X rotation into three.js's y-up, +z-forward.
"""
import json
import math
import os
import struct
import numpy as np
import bpy
from mathutils import Matrix, Vector
from . import bake, motion, rig, fold, mech, choreo

FRAMES = bake.FRAMES
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'public', 'models'))


def _mesh_arrays(o, M):
    """Evaluated triangles of o, vertices transformed by M, split by material slot.
    Returns {slot: (positions (n,3), normals (n,3), indices (m,3))}."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    nv = len(me.vertices)
    co = np.empty(nv * 3, np.float64)
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
    slots = [s.material.name[3:] if s.material and s.material.name.startswith('ct.') else 'plastic' for s in o.material_slots] or ['plastic']
    ev.to_mesh_clear()

    R = np.array(M.to_3x3())
    t = np.array(M.translation)
    pos_all = co @ R.T + t
    Rn = np.array(M.to_3x3().inverted().transposed())
    out = {}
    for mi in np.unique(tm):
        tris = tl[tm == mi]
        loops = tris.reshape(-1)
        p = pos_all[lv[loops]]
        n = cn[loops] @ Rn.T
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        # weld corners that share position and normal
        key = np.concatenate([np.round(p, 5), np.round(n, 3)], axis=1)
        uniq, inv = np.unique(key, axis=0, return_inverse=True)
        first = np.zeros(len(uniq), np.int64)
        first[inv[::-1]] = np.arange(len(inv))[::-1]
        slot = slots[mi] if mi < len(slots) else slots[0]
        prev = out.get(slot)
        P, N_, I = p[first], n[first], inv.reshape(-1, 3)
        if prev is not None:
            I = np.concatenate([prev[2], I + len(prev[0])])
            P = np.concatenate([prev[0], P])
            N_ = np.concatenate([prev[1], N_])
        out[slot] = (P, N_, I)
    return out


def _oct(n):
    """Octahedral encoding to int16 pairs."""
    s = np.sum(np.abs(n), axis=1, keepdims=True)
    bad = s[:, 0] < 1e-9
    n = np.where(bad[:, None], np.array([[0.0, 0.0, 1.0]]), n / np.maximum(s, 1e-9))
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


def _node_table(sc):
    """[(name, parent name, kind, [(object, matrix into node frame)])]."""
    nodes = []
    for n in sc.skel.names:
        p = sc.skel.parent[n]
        nodes.append(('bone:' + n, 'bone:' + p if p else None, 'bone', [(o, Matrix.Identity(4)) for o in sc.structure.get(n, [])]))
    wheels = []
    for name, a in sc.asm.items():
        parent = 'asm:' + a.host[1:] if a.host.startswith('@') else 'bone:' + a.host
        objs = []
        for on in a.parts:
            o = bpy.data.objects[on]
            if on.startswith('wheel'):
                wheels.append((name, o))
                continue
            objs.append((o, o.matrix_basis.copy()))
        nodes.append(('asm:' + name, parent, 'asm', objs))
    for name, o in wheels:
        c = Vector(o.matrix_basis @ (sum((Vector(b) for b in o.bound_box), Vector()) / 8))
        nodes.append(('wheel:' + o.name, 'asm:' + name, 'wheel', [(o, Matrix.Translation(-c) @ o.matrix_basis)]))
        nodes[-1] = nodes[-1] + (c,)
    for L, S, bone, panel, objs in sc.lifters:
        for o in objs:
            nodes.append(('lift:' + o.name, 'bone:' + bone, 'lift', [(o, Matrix.Identity(4))]))
    return nodes


def _tracks(sc, nodes):
    """Per frame local (t, q) of every node, and the ground lift."""
    index = {n[0]: i for i, n in enumerate(nodes)}
    link = {o.name: (bone, o) for L, S, bone, panel, objs in sc.lifters for o in objs}
    tr = np.zeros((FRAMES + 1, len(nodes), 7), np.float32)
    lift = np.zeros(FRAMES + 1, np.float32)
    for f in range(FRAMES + 1):
        T = f / FRAMES
        objs, W, N, h = bake.object_worlds(sc, T)
        lift[f] = h
        down = Matrix.Translation((0, 0, -h))
        for i, node in enumerate(nodes):
            name, parent, kind = node[0], node[1], node[2]
            if kind == 'bone':
                b = name[5:]
                p = sc.skel.parent[b]
                L = (W[p].inverted() @ W[b]) if p else down @ W[b]
            elif kind == 'asm':
                a = sc.asm[name[4:]]
                par = N[a.host[1:]] if a.host.startswith('@') else W[a.host]
                L = par.inverted() @ N[a.name]
            elif kind == 'wheel':
                L = Matrix.Translation(node[4])
            else:
                bone, o = link[name[5:]]
                L = W[bone].inverted() @ objs[o]
            t = L.to_translation()
            q = L.to_quaternion()
            if f and np.dot(tr[f - 1, i, 3:], (q.x, q.y, q.z, q.w)) < 0:
                q.negate()
            tr[f, i] = (t.x, t.y, t.z, q.x, q.y, q.z, q.w)
    return tr, lift


def _events(sc):
    """Mechanism events for the audio: every step of every assembly, lifter
    strokes, and the skeleton's big actuations. Times in T."""
    ev = []
    for name, a in sc.asm.items():
        size = 0.0
        for on in a.parts:
            o = bpy.data.objects[on]
            d = o.dimensions
            size = max(size, d.x * d.y + d.y * d.z + d.x * d.z)
        for s in a.steps:
            if s.kind == 'pop':
                amt = s.vec.length
            elif s.kind == 'move':
                amt = s.vec.length
            else:
                amt = abs(s.deg)
            if amt < 1e-4:
                continue
            kind = 'hinge' if s.kind == 'rot' else 'slide'
            ev.append(dict(name=name, kind=kind, t0=round(s.at[0], 4), t1=round(s.at[1], 4), size=round(size, 3),
                           amount=round(amt, 4), side=1 if name.endswith('.L') else (-1 if name.endswith('.R') else 0)))
    # skeleton actuation windows (from the motion tracks)
    tr = motion.tracks()
    def span(ch, eps=1e-4):
        keys = tr[ch]
        ts = [t for (t, v), (t2, v2) in zip(keys, keys[1:]) if max(abs(a - b) for a, b in zip(v, v2)) > eps for t in (t, t2)]
        return (min(ts), max(ts)) if ts else None
    for ch, kind, size in (('rise', 'lift', 6.0), ('boom', 'telescope', 1.2), ('neck', 'telescope', 0.6), ('hipslide', 'telescope', 1.0),
                           ('forearm', 'joint', 0.8), ('upperarm', 'joint', 1.0), ('head', 'servo', 0.3), ('curl', 'servo', 0.2)):
        sp = span(ch)
        if sp:
            ev.append(dict(name='rig:' + ch, kind=kind, t0=round(sp[0], 4), t1=round(sp[1], 4), size=size, amount=1.0, side=0))
    ev.sort(key=lambda e: e['t0'])
    return ev


def _lifter_events(sc, samples=240):
    """Lifter strokes: windows where a lifter's extension changes."""
    out = []
    prev = None
    active = {}
    for k in range(samples + 1):
        T = k / samples
        objs, W, N, h = bake.object_worlds(sc, T)
        from . import linkage
        ext = {}
        for L, S, bone, panel, stage in sc.lifters:
            key = (L.name, S)
            ext[key] = (objs[stage[-1]].translation - (W[bone] @ Vector((0, 0, 0)))).length
        if prev is not None:
            for key, e in ext.items():
                moving = abs(e - prev[key]) > 2e-4
                if moving and key not in active:
                    active[key] = T - 1 / samples
                elif not moving and key in active:
                    t0 = active.pop(key)
                    out.append(dict(name='lift:%s.%s' % key, kind='hydraulic', t0=round(t0, 4), t1=round(T, 4), size=0.15, amount=1.0,
                                    side=1 if key[1] == 'L' else (-1 if key[1] == 'R' else 0)))
        prev = ext
    return out


def export(sc, out_dir=OUT_DIR):
    os.makedirs(out_dir, exist_ok=True)
    nodes = _node_table(sc)
    index = {n[0]: i for i, n in enumerate(nodes)}
    blob = Blob()
    manifest_nodes = []
    tri_total = 0
    for name, parent, kind, objs, *extra in nodes:
        meshes = {}
        for o, M in objs:
            if not len(o.data.polygons):
                continue
            for slot, (P, N_, I) in _mesh_arrays(o, M).items():
                if slot in meshes:
                    p0, n0, i0 = meshes[slot]
                    meshes[slot] = (np.concatenate([p0, P]), np.concatenate([n0, N_]), np.concatenate([i0, I + len(p0)]))
                else:
                    meshes[slot] = (P, N_, I)
        mlist = []
        for slot, (P, N_, I) in sorted(meshes.items()):
            lo, hi = P.min(0), P.max(0)
            span = np.maximum(hi - lo, 1e-6)
            q = np.round((P - lo) / span * 65535 - 32768).astype(np.int16)
            idx = I.astype(np.uint16 if len(P) < 65536 else np.uint32)
            mlist.append(dict(material=slot, count=int(len(P)), triangles=int(len(I)), min=[float(v) for v in lo], max=[float(v) for v in hi],
                              position=blob.add(q), normal=blob.add(_oct(N_)), index=blob.add(idx.reshape(-1)), index32=bool(len(P) >= 65536)))
            tri_total += len(I)
        manifest_nodes.append(dict(name=name, parent=index[parent] if parent else -1, kind=kind, meshes=mlist))
    tr, lift = _tracks(sc, nodes)
    tracks_off = blob.add(tr.reshape(-1))
    lift_off = blob.add(lift)

    # rig: dimensions and the stand pose (the handover to the live gait)
    W1, P1 = motion.world(1.0, sc.skel)
    stand = {}
    for n in sc.skel.names:
        q, s = P1.get(n, (None, None)) or (None, None)
        if q is None:
            continue
        stand[n] = [q.x, q.y, q.z, q.w, s.x, s.y, s.z]
    from . import stand as stand_mod
    rig_block = dict(
        bones=[dict(name=n, parent=sc.skel.parent[n], offset=list(sc.skel.offset[n])) for n in sc.skel.names],
        stand=stand,
        dims=dict(thigh=rig.THIGH, shin=rig.SHIN, upper=rig.UPPER, fore=rig.FORE, hipX=rig.HIP_X, hipZ=rig.HIP_Z, ankleZ=rig.ANKLE_Z,
                  robotF=rig.ROBOT_F, crouch=motion.STAND_CROUCH, wheelRadius=0.445,
                  armAbduct=stand_mod.ARM_ABDUCT, elbowBend=stand_mod.ELBOW_BEND, fingerCurl=list(stand_mod.FINGER_CURL),
                  duration=FRAMES / 30.0),
    )
    events = _events(sc) + _lifter_events(sc)
    events.sort(key=lambda e: e['t0'])
    manifest = dict(version=1, frames=FRAMES + 1, nodes=manifest_nodes, tracks=tracks_off, lift=lift_off, rig=rig_block, events=events,
                    triangles=int(tri_total))
    data = blob.bytes()
    with open(os.path.join(out_dir, 'cybertruck.bin'), 'wb') as fh:
        fh.write(data)
    with open(os.path.join(out_dir, 'cybertruck.json'), 'w') as fh:
        json.dump(manifest, fh, separators=(',', ':'))
    print('exported %d nodes, %d triangles, %.2f MB, %d events -> %s' % (len(nodes), tri_total, len(data) / 1e6, len(events), out_dir))
    return manifest
