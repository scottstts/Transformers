"""Game export: one binary asset (+ JSON manifest) for the three.js runtime.

Same container as the Cybertruck (src/content/transformer/asset/format.ts).
Nodes are the mechanism's rigid bodies:
  bone:*     skeleton joints with their fixed structure
  part:*     robot parts that move on their bone: stowed armour and carrier struts
  asm:*      car assemblies (a bone or another assembly carries each)
  wheel:*    hub-centred wheels on their corner assembly (spun and steered in game)
Geometry is stored per node and material slot in the node's frame (quantized
positions, octahedral normals). Every frame stores each node's local transform
relative to its parent, plus the ground lift.

Frames are playback time: frame f holds the pose at T = warp[f] (the density
warp the Blender timeline is baked with), so the game plays the same even pacing.
Event times are converted to playback time too.
"""
import json
import math
import os
import numpy as np
import bpy
from mathutils import Matrix, Vector
from . import bake, motion, rig, fold, stand

FRAMES = bake.FRAMES
NAME = 'ferrari-f1'
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'public', 'models'))
MAT_PREFIX = 'f1.'


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
    slots = []
    for s in o.material_slots:
        if not (s.material and s.material.name.startswith(MAT_PREFIX)):
            raise ValueError('%s: material slot %r is not an f1 slot' % (o.name, s.material.name if s.material else None))
        slots.append(s.material.name[len(MAT_PREFIX):])
    if not slots:
        raise ValueError('%s has no material' % o.name)
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


class Node:
    def __init__(self, name, parent, kind, objs, bone=None, hub=None):
        self.name, self.parent, self.kind, self.objs = name, parent, kind, objs
        self.bone = bone          # part nodes: the bone that carries them
        self.hub = hub            # wheel nodes: hub centre in the corner assembly's frame


def _node_table(sc):
    stow = getattr(sc, 'stow', {})
    nodes = []
    for n in sc.skel.names:
        p = sc.skel.parent[n]
        fixed = [(o, Matrix.Identity(4)) for o in sc.structure.get(n, []) if o not in stow]
        nodes.append(Node('bone:' + n, 'bone:' + p if p else None, 'bone', fixed))
    for n in sc.skel.names:
        for o in sc.structure.get(n, []):
            if o in stow:
                nodes.append(Node('part:' + o.name, 'bone:' + n, 'part', [(o, Matrix.Identity(4))], bone=n))
    for s in getattr(sc, 'carriers', []):
        for o in s.objs:
            nodes.append(Node('part:' + o.name, 'bone:' + s.bone, 'part', [(o, Matrix.Identity(4))], bone=s.bone))
    wheels = []
    for name, a in sc.asm.items():
        parent = 'asm:' + a.host[1:] if a.host.startswith('@') else 'bone:' + a.host
        objs = []
        for on in a.parts:
            o = bpy.data.objects[on]
            if on.startswith('wheel'):
                wheels.append((name, o))
            else:
                objs.append((o, o.matrix_basis.copy()))
        nodes.append(Node('asm:' + name, parent, 'asm', objs))
    for name, o in wheels:
        hub = o.matrix_basis.to_translation()
        nodes.append(Node('wheel:' + o.name, 'asm:' + name, 'wheel', [(o, Matrix.Translation(-hub) @ o.matrix_basis)], hub=hub))
    if getattr(sc, 'lifters', None):
        raise NotImplementedError('lifters are not exported for the F1')
    return nodes


def _check_coverage(nodes):
    """Every rendered mesh of the car and robot is in exactly one node."""
    seen = {}
    for nd in nodes:
        for o, _ in nd.objs:
            if o.name in seen:
                raise ValueError('%s in both %s and %s' % (o.name, seen[o.name], nd.name))
            seen[o.name] = nd.name
    missing = [o.name for c in ('CAR', 'ROBOT') for o in bpy.data.collections[c].all_objects
               if o.type == 'MESH' and not o.hide_render and len(o.data.polygons) and o.name not in seen]
    if missing:
        raise ValueError('meshes outside every node: %s' % missing[:20])


def _local(sc, nd, objs, W, N, down):
    if nd.kind == 'bone':
        b = nd.name[5:]
        p = sc.skel.parent[b]
        return (W[p].inverted() @ W[b]) if p else down @ W[b]
    if nd.kind == 'asm':
        a = sc.asm[nd.name[4:]]
        par = N[a.host[1:]] if a.host.startswith('@') else W[a.host]
        return par.inverted() @ N[a.name]
    if nd.kind == 'wheel':
        return Matrix.Translation(nd.hub)
    return W[nd.bone].inverted() @ objs[nd.objs[0][0]]


def _ground(objs, skip):
    """Lowest support point of the posed objects, ignoring `skip`."""
    low = 1e9
    for o, M in objs.items():
        if o in skip:
            continue
        pts = bake.support_points(o)
        if len(pts):
            low = min(low, float((pts @ np.array(M.to_3x3()).T + np.array(M.translation))[:, 2].min()))
    return low


def _tracks(sc, nodes, warp):
    """Per frame local (t, q) of every node, and the ground lift.

    The game's ground contact ignores the carrier struts: they carry car parts, never the
    machine's weight, and a retracted stage stack may hang below a sole or the floor (the
    Blender bake lets them touch the ground; in game the soles and tyres do)."""
    struts = {o for s in getattr(sc, 'carriers', []) for o in s.objs}
    tr = np.zeros((FRAMES + 1, len(nodes), 7), np.float32)
    lift = np.zeros(FRAMES + 1, np.float32)
    for f in range(FRAMES + 1):
        objs, W, N, h = bake.object_worlds(sc, warp[f])
        down = Matrix.Translation((0, 0, -h))          # node tracks stay unlifted
        lift[f] = h - _ground(objs, struts)
        for i, nd in enumerate(nodes):
            L = _local(sc, nd, objs, W, N, down)
            t = L.to_translation()
            q = L.to_quaternion()
            if f and np.dot(tr[f - 1, i, 3:], (q.x, q.y, q.z, q.w)) < 0:
                q.negate()
            tr[f, i] = (t.x, t.y, t.z, q.x, q.y, q.z, q.w)
    return tr, lift


# ------------------------------------------------------------------ events

def _size(objs):
    size = 0.0
    for o in objs:
        d = o.dimensions
        size = max(size, d.x * d.y + d.y * d.z + d.x * d.z)
    return size


def _side(name):
    return 1 if name.endswith('.L') else (-1 if name.endswith('.R') else 0)


def _step_events(name, steps, size, T_of=lambda a, b: (a, b)):
    out = []
    for s in steps:
        amt = abs(s.deg) if s.kind == 'rot' else s.vec.length
        if amt < 1e-4:
            continue
        t0, t1 = T_of(*s.at)
        out.append(dict(name=name, kind='hinge' if s.kind == 'rot' else 'slide', t0=t0, t1=t1, size=round(size, 3),
                        amount=round(amt, 4), side=_side(name)))
    return out


def _windows(activity, frac=0.12, gap=6, min_len=4):
    """[(f0, f1)] frame windows where activity exceeds frac of its peak (short gaps merged)."""
    peak = max(activity) if len(activity) else 0.0
    if peak <= 0:
        return []
    on = [a > frac * peak for a in activity]
    out = []
    f = 0
    while f < len(on):
        if on[f]:
            g = f
            while g + 1 < len(on) and on[g + 1]:
                g += 1
            if out and f - out[-1][1] <= gap:
                out[-1] = (out[-1][0], g + 1)
            else:
                out.append((f, g + 1))
            f = g + 1
        else:
            f += 1
    return [(a, b) for a, b in out if b - a >= min_len]


RIG_GROUPS = (
    # name, kind, size, bone prefixes
    ('rise', 'lift', 6.0, ('pelvis',)),
    ('spine', 'joint', 1.2, ('spine', 'chest')),
    ('legs', 'joint', 1.0, ('hip.', 'thigh.', 'shin.', 'foot.', 'toe.')),
    ('arms', 'joint', 0.8, ('clav.', 'upperarm.', 'forearm.', 'hand.')),
    ('neck', 'telescope', 0.6, ('neck', 'head')),
    ('curl', 'servo', 0.2, ('index', 'middle', 'ring', 'pinky', 'thumb')),
)


def _rig_events(sc, warp):
    """Skeleton actuation windows (playback time) from the joint travel of each bone group."""
    prev = None
    act = {g[0]: [] for g in RIG_GROUPS}
    for f in range(FRAMES + 1):
        W, P = motion.world(warp[f], sc.skel)
        cur = {}
        for n in sc.skel.names:
            p = sc.skel.parent[n]
            cur[n] = (W[p].inverted() @ W[n]) if p else W[n]
        if prev is not None:
            for name, kind, size, pre in RIG_GROUPS:
                a = 0.0
                for n in sc.skel.names:
                    if not n.startswith(pre):
                        continue
                    a += cur[n].to_quaternion().rotation_difference(prev[n].to_quaternion()).angle
                    a += (cur[n].translation - prev[n].translation).length * 2.0
                act[name].append(a)
        prev = cur
    ev = []
    for name, kind, size, pre in RIG_GROUPS:
        for f0, f1 in _windows(act[name]):
            ev.append(dict(name='rig:' + name, kind=kind, t0=round(f0 / FRAMES, 4), t1=round(f1 / FRAMES, 4), size=size, amount=1.0, side=0))
    return ev


def _carrier_events(sc, warp):
    """Telescoping strokes: windows where a carrier's span changes."""
    ev = []
    spans = {s.name: [] for s in getattr(sc, 'carriers', [])}
    for f in range(FRAMES + 1):
        W, _ = motion.world(warp[f], sc.skel)
        N = bake.node_worlds(sc, warp[f], W)
        for s in sc.carriers:
            A, B = s.ends(W, N, warp[f])
            spans[s.name].append((B - A).length)
    for s in getattr(sc, 'carriers', []):
        e = spans[s.name]
        speed = [abs(b - a) for a, b in zip(e, e[1:])]
        if max(speed, default=0.0) < 0.002:
            continue
        for f0, f1 in _windows(speed, frac=0.2):
            ev.append(dict(name='carrier:' + s.name, kind='telescope', t0=round(f0 / FRAMES, 4), t1=round(f1 / FRAMES, 4),
                           size=0.3, amount=round(max(e) - min(e), 4), side=_side(s.name)))
    return ev


def _events(sc, warp):
    """Mechanism events for the audio, in playback time."""
    frames = np.arange(FRAMES + 1) / FRAMES

    def play(t):
        return float(np.interp(t, warp, frames))

    def window(a, b):
        return round(play(a), 4), round(play(b), 4)

    ev = []
    for name, a in sc.asm.items():
        ev += _step_events(name, a.steps, _size([bpy.data.objects[on] for on in a.parts]), window)
    for o, st in getattr(sc, 'stow', {}).items():
        # stow steps run in tau = 1 - T
        ev += _step_events('stow:' + o.name, st.steps, _size([o]), lambda a, b: window(1.0 - b, 1.0 - a))
    ev = [e for e in ev if e['t1'] > e['t0']]
    ev += _rig_events(sc, warp) + _carrier_events(sc, warp)
    ev.sort(key=lambda e: (e['t0'], e['name']))
    return ev


# ------------------------------------------------------------------ export

def export(sc, out_dir=OUT_DIR):
    os.makedirs(out_dir, exist_ok=True)
    warp = getattr(sc, 'warp', None) or bake.density_warp(sc)
    sc.warp = warp
    nodes = _node_table(sc)
    _check_coverage(nodes)
    index = {nd.name: i for i, nd in enumerate(nodes)}
    blob = Blob()
    manifest_nodes = []
    tri_total = 0
    for nd in nodes:
        meshes = {}
        for o, M in nd.objs:
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
        manifest_nodes.append(dict(name=nd.name, parent=index[nd.parent] if nd.parent else -1, kind=nd.kind, meshes=mlist))
    tr, lift = _tracks(sc, nodes, warp)
    tracks_off = blob.add(tr.reshape(-1))
    lift_off = blob.add(lift)

    # rig: dimensions and the stand pose (the handover to the live gait)
    W1, P1 = motion.world(1.0, sc.skel)
    stand_pose = {}
    for n in sc.skel.names:
        q, s = P1.get(n, (None, None)) or (None, None)
        if q is None:
            continue
        stand_pose[n] = [q.x, q.y, q.z, q.w, s.x, s.y, s.z]
    from . import dims as D
    rig_block = dict(
        bones=[dict(name=n, parent=sc.skel.parent[n], offset=list(sc.skel.offset[n])) for n in sc.skel.names],
        stand=stand_pose,
        dims=dict(thigh=rig.THIGH, shin=rig.SHIN, upper=rig.UPPER, fore=rig.FORE, hipX=rig.HIP_X, hipZ=rig.HIP_Z, ankleZ=rig.ANKLE_Z,
                  robotF=rig.ROBOT_F, crouch=motion.STAND_CROUCH, wheelRadius=D.FR_R,
                  armAbduct=stand.ARM_ABDUCT, elbowBend=stand.ELBOW_BEND, fingerCurl=list(stand.FINGER_CURL),
                  duration=FRAMES / 30.0,
                  # F1 stance: feet wider than the hips, planted a little behind them; the knee
                  # pole is the pelvis front blended with pelvis up (motion.world)
                  stanceX=motion.STANCE_X, footF=motion.FOOT_PLANT_F, kneePoleUp=1.0),
    )
    events = _events(sc, warp)
    manifest = dict(version=1, frames=FRAMES + 1, nodes=manifest_nodes, tracks=tracks_off, lift=lift_off, rig=rig_block, events=events,
                    triangles=int(tri_total))
    data = blob.bytes()
    with open(os.path.join(out_dir, NAME + '.bin'), 'wb') as fh:
        fh.write(data)
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as fh:
        json.dump(manifest, fh, separators=(',', ':'))
    print('exported %d nodes, %d triangles, %.2f MB, %d events -> %s' % (len(nodes), tri_total, len(data) / 1e6, len(events), out_dir))
    return manifest
