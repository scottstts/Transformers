"""Game export: one binary asset (+ JSON manifest) for the three.js runtime.

Same container as the other transformers (src/content/transformer/asset/format.ts),
read from the baked timeline of blender/roadster.blend (frame 0 the car, frame 270
the stand; the animation is already paced, so frame f is playback time).

Nodes are the model's rigid bodies:
  bone:*     the skeleton's joints (rig.py), no geometry of their own
  part:*     robot castings on their nest nodes (robot.py), grown with their chain
             (the nests' scale is the scale track)
  asm:*      car assemblies, the lid's leaves and the telescopic braces
             (`asm:link.<name>.pin.A/B/stage.n`, the convention braces.ts lays live)
  wheel:*    hub-centred wheels on their carrier, spun and steered in game

The scene keys every car assembly and brace piece in world space. The game needs
them under a joint: each is hosted where the build docks it (dock.groups_all: a bone
or a carrier it rides with), a follower on its lead (choreo.FOLLOW), a brace piece
on its brace's bone (linkage.SPECS), and its track is the exact relative transform
to that host at every frame, so playback reproduces the authored world motion.

The lift track is the flight altitude the game adds (flight.py, the scene's
`roadster_flight`) plus, on the ground, whatever keeps the lowest point at z = 0.

Geometry is exported at authoring density, modifiers applied (full quality),
per node and material slot in the node's own frame (quantized positions,
octahedral normals).
"""
import json
import math
import os
import numpy as np
import bpy
from mathutils import Matrix, Vector, Quaternion
from . import rig, dock, linkage, choreo as C, flight as FL

FRAMES = FL.FRAMES
NAME = 'roadster'
MAT_PREFIX = 'roadster.'
TAG = 'roadster_build'
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'assets'))
WHEEL_NODES = ('bone.wheelF.', 'bone.wheelR.')


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


# ------------------------------------------------------------------ geometry

def _arrays(o, M, dg):
    """Evaluated object's triangles through M, split by material slot: {slot: (p, n)} per triangle corner."""
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
    for s in ev.material_slots:
        if not (s.material and s.material.name.startswith(MAT_PREFIX)):
            raise ValueError('%s: material %r is not a roadster slot' % (o.name, s.material.name if s.material else None))
        slots.append(s.material.name[len(MAT_PREFIX):])
    ev.to_mesh_clear()
    R = np.array(M.to_3x3())
    pos = co @ R.T + np.array(M.translation)
    Rn = np.array(M.to_3x3().inverted().transposed())
    out = {}
    # several material indices can name one slot (a cut's faces reassigned to one
    # material, the door posts and side pods): their triangles are gathered together,
    # never written over each other
    for slot in dict.fromkeys(slots):
        mine = [mi for mi, s in enumerate(slots) if s == slot]
        loops = tl[np.isin(tm, mine)].reshape(-1)
        if not len(loops):
            continue
        n = cn[loops] @ Rn.T
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        out[slot] = (pos[lv[loops]], n)
    return out


# ------------------------------------------------------------------ nodes

class Node:
    def __init__(self, name, kind, src=None, parent=None):
        self.name, self.kind = name, kind
        self.src = src            # the Blender empty whose world matrix is tracked (wheels: None)
        self.parent = parent      # Node: the node's host in the asset
        self.objs = []            # (mesh object, node-frame matrix)
        self.hub = None
        self.radius = 0.0


def _collect():
    """{blender node name: empty} and {name: [mesh objects]} of the build's rigid bodies."""
    nodes = {o.name: o for o in bpy.data.objects if o.type == 'EMPTY' and o.get(TAG) and o.name.startswith('bone.')}
    meshes = {}
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.get(TAG) and o.parent and o.parent.name in nodes and len(o.data.polygons):
            meshes.setdefault(o.parent.name, []).append(o)
    return nodes, meshes


def _asset_name(name):
    if name.startswith('bone.robot.'):
        return 'bone:' + name[11:]
    if name.startswith('bone.part.'):
        return 'part:' + name[10:]
    if name.startswith('bone.asm.'):
        return 'asm:' + name[9:]
    return 'asm:' + name[5:]            # bone.link.*, bone.wheelF/R.*


def _host_names():
    """Blender node -> Blender node of its host, for the world-keyed roots."""
    hosts = {}
    groups = dock.groups_all()
    progs = C.programs()

    def node_of(host):
        if host in rig.HEADS:
            return 'bone.robot.' + host
        return dock.node_name(host)
    for carrier, (host, _) in groups.items():
        hosts[dock.node_name(carrier)] = node_of(host)
    for carrier, lead in C.FOLLOW.items():
        hosts[dock.node_name(carrier)] = node_of(lead)
    for carrier, prog in progs.items():
        hosts.setdefault(dock.node_name(carrier), node_of(prog[-1][1]))
    specs = linkage.SPECS or linkage.definitions()
    for name, spec in specs.items():
        for piece in ['pin.A', 'pin.B'] + ['stage.%d' % i for i in range(16)]:
            hosts['bone.link.%s.%s' % (name, piece)] = 'bone.robot.' + spec['bone']
    return hosts


def _table(nodes, meshes):
    hosts = _host_names()
    table, made = [], {}

    def make(name):
        if name in made:
            return made[name]
        o = nodes[name]
        if o.parent is not None:
            parent = make(o.parent.name)
        elif name == 'bone.robot.pelvis':
            parent = None
        else:
            if name not in hosts:
                raise ValueError('%s has no host' % name)
            parent = make(hosts[name])
        nm = _asset_name(name)
        kind = nm.split(':', 1)[0]
        nd = Node(nm, 'asm' if kind == 'asm' else kind, o, parent)
        made[name] = nd
        table.append(nd)
        return nd
    for name in sorted(nodes, key=lambda s: (not s.startswith('bone.robot.'), s)):
        make(name)
    for nd in table:
        for o in meshes.get(nd.src.name, []):
            nd.objs.append((o, o.matrix_basis.copy()))
    # wheels: the carrier keeps the track, a hub-centred child carries the spinning geometry
    out = []
    for nd in table:
        out.append(nd)
        if not nd.src.name.startswith(WHEEL_NODES):
            continue
        pts = [M @ Vector(c) for o, M in nd.objs for c in o.bound_box]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        ext = hi - lo
        if not (ext.x < ext.y and ext.x < ext.z):
            raise ValueError('%s: the wheel axis is not X (extent %s)' % (nd.name, tuple(ext)))
        hub = (lo + hi) / 2
        w = Node('wheel:' + nd.src.name[5:], 'wheel', None, nd)
        w.objs = [(o, Matrix.Translation(-hub) @ M) for o, M in nd.objs]
        w.hub, w.radius = hub, ext.z / 2
        nd.objs = []
        out.append(w)
    return out


def _check_coverage(table):
    """Every rendered mesh of the car, robot and braces is in exactly one node."""
    seen = {}
    for nd in table:
        for o, _ in nd.objs:
            if o.name in seen:
                raise ValueError('%s in both %s and %s' % (o.name, seen[o.name], nd.name))
            seen[o.name] = nd.name
    missing = [o.name for c in ('01_CAR', '02_ROBOT', '04_LINKAGE') for o in bpy.data.collections[c].all_objects
               if o.type == 'MESH' and not o.hide_render and len(o.data.polygons) and o.name not in seen]
    if missing:
        raise ValueError('meshes outside every node: %s' % missing[:20])


# ------------------------------------------------------------------ tracks

def _world_matrices(nodes):
    scene = bpy.context.scene
    W = []
    for f in range(FRAMES + 1):
        scene.frame_set(f)
        W.append({name: o.matrix_world.copy() for name, o in nodes.items()})
    return W


def _world(nd, W):
    if nd.kind == 'wheel':
        return W[nd.parent.src.name] @ Matrix.Translation(nd.hub)
    return W[nd.src.name]


def _tracks(table, W):
    """Per frame local (t, q) and scale of every node relative to its host."""
    n = len(table)
    tr = np.zeros((FRAMES + 1, n, 7), np.float32)
    sc = np.ones((FRAMES + 1, n, 3), np.float32)
    for f in range(FRAMES + 1):
        for i, nd in enumerate(table):
            if nd.kind == 'wheel':
                L = Matrix.Translation(nd.hub)
            elif nd.parent is None:
                L = W[f][nd.src.name]
            else:
                L = _world(nd.parent, W[f]).inverted() @ W[f][nd.src.name]
            t, q, s = L.decompose()
            if f and np.dot(tr[f - 1, i, 3:], (q.x, q.y, q.z, q.w)) < 0:
                q.negate()
            tr[f, i] = (t.x, t.y, t.z, q.x, q.y, q.z, q.w)
            sc[f, i] = (s.x, s.y, s.z)
    return tr, sc


def _lift(table, W, geometry):
    """The flight altitude, and on the ground the offset that keeps the lowest support point
    on z = 0 (brace pieces, which only carry parts, never the machine's weight, are ignored)."""
    alt = list(bpy.context.scene['roadster_flight']['altitude'])
    owners = [(nd, geometry[nd.name]) for nd in table if nd.name in geometry and not nd.name.startswith('asm:link.')]
    lift = np.zeros(FRAMES + 1, np.float32)
    ground = []
    for f in range(FRAMES + 1):
        low = 1e9
        for nd, pts in owners:
            m = _world(nd, W[f])
            row = np.array(m.to_3x3())[2]
            low = min(low, float((pts @ row).min() + m.translation.z))
        if abs(alt[f]) < 1e-9:
            lift[f] = -low
            ground.append(-low)
        else:
            lift[f] = alt[f]
    return lift, ground


# ------------------------------------------------------------------ events

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


def _events(table, tr, sc, areas):
    """Mechanism events for the audio: every family of nodes that moves relative to its host, in T."""
    index = {nd.name: i for i, nd in enumerate(table)}
    families = {}
    for nd in table:
        if nd.kind in ('bone', 'wheel'):
            continue
        key = nd.name
        if key.startswith('asm:link.'):
            key = key.rsplit('.stage.', 1)[0].rsplit('.pin.', 1)[0]
        elif key.startswith('part:'):
            key = 'stow:' + key[5:]
        families.setdefault(key, []).append(index[nd.name])
    ev = []
    for key, members in families.items():
        move = np.zeros(FRAMES)
        turn = np.zeros(FRAMES)
        grow = np.zeros(FRAMES)
        for i in members:
            move += np.linalg.norm(np.diff(tr[:, i, :3], axis=0), axis=1)
            dot = np.abs(np.sum(tr[:-1, i, 3:] * tr[1:, i, 3:], axis=1)).clip(0, 1)
            turn += 2 * np.arccos(dot)
            grow += np.linalg.norm(np.diff(sc[:, i, :], axis=0), axis=1)
        activity = move + 0.6 * turn + grow
        size = max((areas.get(table[i].name, 0.0) for i in members), default=0.0)
        telescope = key.startswith('asm:link.')
        for f0, f1 in _windows(activity):
            m = float(move[f0:f1].sum())
            d = math.degrees(float(turn[f0:f1].sum()))
            g = float(grow[f0:f1].sum())
            if m < 1e-3 and d < 0.5 and g < 1e-3:
                continue
            kind = 'telescope' if telescope else ('hinge' if d > 20.0 * max(m, 1e-6) else 'slide')
            ev.append(dict(name=key, kind=kind, t0=round(f0 / FRAMES, 4), t1=round(f1 / FRAMES, 4),
                           size=0.3 if telescope else round(size, 3), amount=round(d if kind == 'hinge' else m, 4),
                           side=1 if key.endswith('.L') else (-1 if key.endswith('.R') else 0)))
    return ev


RIG_GROUPS = (
    ('rise', 'lift', 6.0, ('pelvis',)),
    ('spine', 'joint', 1.2, ('spine', 'chest')),
    ('legs', 'joint', 1.0, ('hip.', 'thigh.', 'shin.', 'foot.', 'toe.')),
    ('arms', 'joint', 0.8, ('clav.', 'upperarm.', 'forearm.', 'hand.')),
    ('neck', 'telescope', 0.6, ('neck', 'head')),
    ('curl', 'servo', 0.2, ('index', 'middle', 'ring', 'pinky', 'thumb')),
)


def _rig_events(table, tr):
    index = {nd.name[5:]: i for i, nd in enumerate(table) if nd.kind == 'bone'}
    ev = []
    for name, kind, size, prefixes in RIG_GROUPS:
        act = np.zeros(FRAMES)
        for n, i in index.items():
            if not n.startswith(prefixes):
                continue
            dot = np.abs(np.sum(tr[:-1, i, 3:] * tr[1:, i, 3:], axis=1)).clip(0, 1)
            act += 2 * np.arccos(dot) + 2.0 * np.linalg.norm(np.diff(tr[:, i, :3], axis=0), axis=1)
        for f0, f1 in _windows(act):
            ev.append(dict(name='rig:' + name, kind=kind, t0=round(f0 / FRAMES, 4), t1=round(f1 / FRAMES, 4), size=size,
                           amount=1.0, side=0))
    return ev


# ------------------------------------------------------------------ rig

def _rig_block(table, tr, W):
    """Joint offsets, the stand pose (the last frame relative to rest) and the dimensions the live gait solves with."""
    index = {nd.name[5:]: i for i, nd in enumerate(table) if nd.kind == 'bone'}
    stand = {}
    for n, p, h in rig.DEFS:
        t = tr[FRAMES, index[n]]
        slide = (Vector(t[:3]) - rig.OFFSET[n]) if p else Vector()
        stand[n] = [float(t[3]), float(t[4]), float(t[5]), float(t[6]), slide.x, slide.y, slide.z]
    worlds = {nd.name[5:]: W[FRAMES][nd.src.name] for nd in table if nd.kind == 'bone'}
    pelvis, foot = worlds['pelvis'].translation, worlds['foot.L'].translation

    def quat(name):
        x, y, z, w = (float(v) for v in tr[FRAMES, index[name]][3:7])
        return Quaternion((w, x, y, z))
    fore = quat('forearm.L').to_matrix()
    elbow = math.degrees(math.atan2(-fore[1][2], fore[2][2]))
    arm = quat('upperarm.L').to_euler('XYZ')
    curl = [math.degrees(quat('index%d.L' % k).to_euler('XYZ').x) for k in (1, 2, 3)]
    dims = dict(thigh=rig.THIGH, shin=rig.SHIN, upper=rig.UPPER, fore=rig.FORE, hipX=rig.OFFSET['hip.L'].x, hipZ=rig.HIP_Z,
                ankleZ=round(foot.z, 4), robotF=round(-pelvis.y, 4), crouch=round(rig.HIP_Z - pelvis.z, 4), wheelRadius=0.0,
                armAbduct=round(-math.degrees(arm.y), 3), elbowBend=round(-elbow, 3), fingerCurl=[round(c, 3) for c in curl],
                duration=FL.DURATION, stanceX=round(foot.x, 4), footF=round(-foot.y, 4), kneePoleUp=0.12)
    return dict(bones=[dict(name=n, parent=p, offset=list(rig.OFFSET[n])) for n, p, h in rig.DEFS], stand=stand, dims=dims)


# ------------------------------------------------------------------ export

def export(out_dir=OUT_DIR):
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    f_user = scene.frame_current
    scene.frame_set(0)
    nodes, meshes = _collect()
    table = _table(nodes, meshes)
    _check_coverage(table)
    # parents before children
    ordered, done = [], set()

    def visit(nd):
        if nd.name in done:
            return
        if nd.parent is not None:
            visit(nd.parent)
        done.add(nd.name)
        ordered.append(nd)
    for nd in sorted(table, key=lambda n: n.kind != 'bone'):
        visit(nd)
    table = ordered
    index = {nd.name: i for i, nd in enumerate(table)}

    dg = bpy.context.evaluated_depsgraph_get()
    blob = Blob()
    manifest_nodes, geometry, areas = [], {}, {}
    tri_total = 0
    for nd in table:
        merged = {}
        for o, M in nd.objs:
            for slot, (p, n) in _arrays(o, M, dg).items():
                prev = merged.get(slot)
                merged[slot] = (np.concatenate([prev[0], p]), np.concatenate([prev[1], n])) if prev else (p, n)
        mlist, pts = [], []
        for slot, (p, n) in sorted(merged.items()):
            # weld corners that share position and normal
            key = np.concatenate([np.round(p, 5), np.round(n, 3)], axis=1)
            uniq, inv = np.unique(key, axis=0, return_inverse=True)
            first = np.zeros(len(uniq), np.int64)
            first[inv[::-1]] = np.arange(len(inv))[::-1]
            P, N_, I = p[first], n[first], inv.reshape(-1, 3)
            lo, hi = P.min(0), P.max(0)
            span = np.maximum(hi - lo, 1e-6)
            q = np.round((P - lo) / span * 65535 - 32768).astype(np.int16)
            idx = I.astype(np.uint16 if len(P) < 65536 else np.uint32)
            mlist.append(dict(material=slot, count=int(len(P)), triangles=int(len(I)), min=[float(v) for v in lo],
                              max=[float(v) for v in hi], position=blob.add(q), normal=blob.add(_oct(N_)),
                              index=blob.add(idx.reshape(-1)), index32=bool(len(P) >= 65536)))
            tri_total += len(I)
            pts.append(P)
        if pts:
            P = np.concatenate(pts)
            geometry[nd.name] = P
            d = P.max(0) - P.min(0)
            areas[nd.name] = float(d[0] * d[1] + d[1] * d[2] + d[0] * d[2])
        manifest_nodes.append(dict(name=nd.name, parent=index[nd.parent.name] if nd.parent else -1, kind=nd.kind,
                                   meshes=mlist))

    W = _world_matrices(nodes)
    tr, sc = _tracks(table, W)
    lift, ground = _lift(table, W, geometry)
    print('ground contact correction %.4f .. %.4f m; altitude peak %.2f m' % (min(ground), max(ground), float(lift.max())))
    _check_continuity(table, tr)
    _check_replay(table, tr, sc, W)
    tracks_off = blob.add(tr.reshape(-1))
    scales_off = blob.add(sc.reshape(-1))
    lift_off = blob.add(lift)

    rig_block = _rig_block(table, tr, W)
    rig_block['dims']['wheelRadius'] = round(max(nd.radius for nd in table if nd.name.startswith('wheel:wheelR')), 4)
    events = _events(table, tr, sc, areas) + _rig_events(table, tr)
    events.sort(key=lambda e: (e['t0'], e['name']))
    manifest = dict(version=1, frames=FRAMES + 1, nodes=manifest_nodes, tracks=tracks_off, scales=scales_off, lift=lift_off,
                    rig=rig_block, events=events, triangles=int(tri_total))
    data = blob.bytes()
    with open(os.path.join(out_dir, NAME + '.bin'), 'wb') as fh:
        fh.write(data)
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as fh:
        json.dump(manifest, fh, separators=(',', ':'))
    scene.frame_set(f_user)
    print('exported %d nodes, %d triangles, %.2f MB, %d events -> %s' % (len(table), tri_total, len(data) / 1e6, len(events),
                                                                       out_dir))
    return manifest


def _check_continuity(table, tr):
    """Largest frame-to-frame jump of any node's local translation / rotation (a snap would show here)."""
    d = np.linalg.norm(np.diff(tr[:, :, :3], axis=0), axis=2)
    a = 2 * np.degrees(np.arccos(np.abs(np.sum(tr[:-1, :, 3:] * tr[1:, :, 3:], axis=2)).clip(0, 1)))
    for label, arr, unit in (('translation', d, 'm'), ('rotation', a, 'deg')):
        f, i = np.unravel_index(np.argmax(arr), arr.shape)
        print('  largest %s step %.3f %s: %s frame %d' % (label, arr[f, i], unit, table[i].name, f))


def _check_replay(table, tr, sc, W):
    """The tracks, composed down the hierarchy, give back every node's authored world matrix."""
    worst = (0.0, None, 0)
    for f in range(0, FRAMES + 1, 10):
        world = []
        for i, nd in enumerate(table):
            t, q, s = tr[f, i, :3], tr[f, i, 3:], sc[f, i]
            L = Matrix.LocRotScale(Vector(t), Quaternion((q[3], q[0], q[1], q[2])), Vector(s))
            world.append(world[[n.name for n in table].index(nd.parent.name)] @ L if nd.parent else L)
        for i, nd in enumerate(table):
            ref = _world(nd, W[f])
            err = max(abs(a - b) for ra, rb in zip(world[i], ref) for a, b in zip(ra, rb))
            if err > worst[0]:
                worst = (err, nd.name, f)
    print('  replay error %.2e: %s frame %d' % worst)
    if worst[0] > 1e-3:
        raise ValueError('tracks do not reproduce the authored motion: %s frame %d (%.4f)' % (worst[1], worst[2], worst[0]))
