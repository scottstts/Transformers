"""Game export: one binary asset (+ JSON manifest) for the three.js runtime.

Same container as the other transformers (src/content/transformer/asset/format.ts),
read from the baked timeline of blender/impala.blend (frame 0 the car, frame 240
the robot; the animation is already paced, so frame f is playback time).

Nodes are the model's rigid bodies:
  bone:*     the skeleton's joints (rig.py), no geometry of their own
  part:*     robot castings nested in their joint (stowage.py), carried by that joint
             and the telescopic stage nodes' parents
  asm:*      car assemblies, panels, folds and linkage stages
  wheel:*    hub-centred tyre, rim and hub, spun and steered in game; the brake drum
             rides with it, the leaf spring and axle stay on the assembly

The authoring scene hosts every car panel and linkage stage in world space. The game
needs them under a joint, so each is parented to the skeleton bone nearest it in the
finished robot, and its track is the exact relative transform to that bone at every
frame: playback reproduces the authored world motion, and in the live gait the panel
follows its bone. Armour and storage groups keep their stowed castings as children.

Geometry is stored per node and material slot in the node's own frame (quantized
positions, octahedral normals). The authoring density is not a runtime budget: each
mesh is reduced with a collapse decimation whose result is checked against the
original surface (`TOLERANCE`) and refined until it holds. IMPALA_TRI_BUDGET (default
900k triangles; 0 keeps the authoring density) sets the overall target.
"""
import json
import math
import os
import re
import numpy as np
import bpy
from mathutils import Matrix, Vector, Quaternion
from mathutils.bvhtree import BVHTree
from . import rig

FRAMES = 240
NAME = 'impala'
MAT_PREFIX = 'impala.'
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'assets'))
TRI_BUDGET = int(os.environ.get('IMPALA_TRI_BUDGET', '900000'))
TOLERANCE = 0.004            # largest distance (m) between a reduced mesh and its authored surface
POWER = 0.7                  # triangles kept grow with this power of a mesh's own count
MIN_KEEP = 150               # a mesh smaller than this is never reduced
WHEEL_PARTS = ('car.wheel.', 'car.brake.')


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

def _tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def _arrays(ev, M):
    """Evaluated object's triangles through M, split by material slot: {slot: (p, n)} per triangle corner."""
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
            raise ValueError('%s: material %r is not an impala slot' % (ev.name, s.material.name if s.material else None))
        slots.append(s.material.name[len(MAT_PREFIX):])
    ev.to_mesh_clear()
    R = np.array(M.to_3x3())
    pos = co @ R.T + np.array(M.translation)
    Rn = np.array(M.to_3x3().inverted().transposed())
    out = {}
    for mi in np.unique(tm):
        loops = tl[tm == mi].reshape(-1)
        n = cn[loops] @ Rn.T
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        out[slots[mi]] = (pos[lv[loops]], n)
    return out


def _tree(me):
    vs = [v.co.copy() for v in me.vertices]
    return BVHTree.FromPolygons(vs, [tuple(p.vertices) for p in me.polygons], epsilon=0.0), vs


def _deviation(t_org, v_org, decimated, samples=1500):
    """Largest distance (m) between the two meshes' vertex sets and the other's surface."""
    t_dec, v_dec = _tree(decimated)
    worst = 0.0
    for tr, pts in ((t_dec, v_org), (t_org, v_dec)):
        step = max(1, len(pts) // samples)
        for p in pts[::step]:
            hit = tr.find_nearest(p)
            if hit[0] is not None:
                worst = max(worst, hit[3])
    return worst


def _reduced(o, M, target, dg):
    """Arrays of o (placed by M) reduced to about `target` triangles, never worse than TOLERANCE from the
    original surface. Returns (arrays by slot, triangle count, deviation)."""
    n = _tri_count(o)
    if target >= n * 0.97:
        return _arrays(o.evaluated_get(dg), M), n, 0.0
    ratio = max(0.001, target / n)
    t_org, v_org = _tree(o.data)
    for _ in range(7):
        mod = o.modifiers.new('export.reduce', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = min(1.0, ratio)
        mod.use_collapse_triangulate = True
        dg.update()
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        dev = _deviation(t_org, v_org, me)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        ev.to_mesh_clear()
        if dev <= TOLERANCE or ratio >= 1.0:
            arrays = _arrays(ev, M)
            o.modifiers.remove(mod)
            return arrays, tris, dev
        o.modifiers.remove(mod)
        ratio = min(1.0, ratio * 1.7)
    return _arrays(o.evaluated_get(dg), M), n, 0.0


def _plan(counts):
    """Per-mesh triangle targets: floor + c * n^POWER, c solved for the overall budget."""
    if TRI_BUDGET <= 0:
        return list(counts)
    def total(c):
        return sum(min(n, max(min(n, MIN_KEEP), c * n ** POWER)) for n in counts)
    lo, hi = 0.0, 1.0
    while total(hi) < TRI_BUDGET and hi < 1e6:
        hi *= 2
    for _ in range(60):
        mid = (lo + hi) / 2
        if total(mid) < TRI_BUDGET:
            lo = mid
        else:
            hi = mid
    return [min(n, max(min(n, MIN_KEEP), hi * n ** POWER)) for n in counts]


# ------------------------------------------------------------------ nodes

class Node:
    def __init__(self, name, kind, src=None, parent=None):
        self.name, self.kind = name, kind
        self.src = src            # the Blender empty whose world matrix is tracked
        self.parent = parent      # Node, or None for the skeleton root
        self.objs = []            # (mesh object, node-frame matrix)
        self.hub = None
        self.world_of = None      # wheel nodes: the hub placement in the assembly


def _short(name):
    return name[5:] if name.startswith('bone.') else name


def _collect():
    """{blender node name: empty} and {name: [mesh objects]} of the build's rigid bodies."""
    nodes = {o.name: o for o in bpy.data.objects if o.type == 'EMPTY' and o.get('impala_build') and o.name.startswith('bone.')}
    meshes = {}
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.get('impala_build') and o.parent and o.parent.name in nodes and len(o.data.polygons):
            meshes.setdefault(o.parent.name, []).append(o)
    return nodes, meshes


def _subtree_has_geometry(name, meshes, children):
    return bool(meshes.get(name)) or any(_subtree_has_geometry(c, meshes, children) for c in children.get(name, ()))


def _build_nodes(nodes, meshes):
    skeleton = {n for n, _, _ in rig.definitions()}
    children = {}
    for name, o in nodes.items():
        if o.parent:
            children.setdefault(o.parent.name, []).append(name)
    keep = [n for n in nodes if (n.startswith('bone.robot.') and n[11:] in skeleton) or _subtree_has_geometry(n, meshes, children)]
    table, by_blender = [], {}

    def make(name):
        if name in by_blender:
            return by_blender[name]
        o = nodes[name]
        short = _short(name)
        parent = make(o.parent.name) if o.parent else None
        if short.startswith('robot.') and short[6:] in skeleton:
            nd = Node('bone:' + short[6:], 'bone', o, parent)
        elif short.startswith('robot.stowed.'):
            host = parent.name.split(':', 1)[1]
            base, k = 'part:' + host, 1
            names = {n.name for n in table}
            nm = base
            while nm in names:
                nm = '%s.%d' % (base, k)
                k += 1
            nd = Node(nm, 'part', o, parent)
        else:
            nd = Node('asm:' + short, 'asm', o, parent)
        by_blender[name] = nd
        table.append(nd)
        return nd

    for n in sorted(keep, key=lambda s: (s.count('.'), s)):
        make(n)
    for nd in table:
        for o in meshes.get(nd.src.name, []):
            nd.objs.append((o, o.matrix_basis.copy()))
    return table


def _split_wheels(table):
    """Wheel assemblies: the wheel proper becomes a hub-centred child node."""
    out = []
    for nd in table:
        out.append(nd)
        if not nd.name.startswith('asm:wheel.'):
            continue
        spin = [(o, M) for o, M in nd.objs if o.name.startswith(WHEEL_PARTS)]
        rest = [(o, M) for o, M in nd.objs if not o.name.startswith(WHEEL_PARTS)]
        tyre = next(o for o, _ in spin if o.name.endswith('.molded.tyre'))
        M0 = next(M for o, M in spin if o is tyre)
        pts = [M0 @ Vector(c) for c in tyre.bound_box]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        ext = hi - lo
        if not (ext.x < ext.y and ext.x < ext.z):
            raise ValueError('%s: the tyre axis is not X (extent %s)' % (nd.name, tuple(ext)))
        hub = (lo + hi) / 2
        side = nd.name[-1]
        front = '.front.' in nd.name
        w = Node('wheel:wheel%s.%s' % ('F' if front else 'R', side), 'wheel', None, nd)
        w.objs = [(o, Matrix.Translation(-hub) @ M) for o, M in spin]
        w.hub = hub
        w.radius = ext.z / 2
        nd.objs = rest
        out.append(w)
    return out


# ------------------------------------------------------------------ hosts

# bone segments in the bone's frame: (candidate, tip): the casting nearest a segment hosts there
TIPS = {
    'pelvis': (0, -.05, .35), 'spine': (0, -.08, .67), 'chest': (0, .155, .88), 'neck': (0, 0, .075), 'head': (0, 0, .50),
    'clav': (.78, 0, 0), 'shoulder': (0, 0, -.35), 'upperarm': (0, 0, -rig.UPPER), 'forearm': (0, 0, -rig.FORE),
    'hand': (0, 0, -.40), 'hip': (0, 0, -.25), 'thigh': (0, 0, -rig.THIGH), 'shin': (0, 0, -rig.SHIN),
    'foot': (0, -.22, -.29), 'toe': (0, -.30, 0),
}


def _segment_distance(p, a, b):
    ab = b - a
    t = 0.0 if ab.length_squared < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def _hosts(table, W, centres):
    """Skeleton bone each world-hosted root assembly docks on in the finished robot."""
    bones = {nd.name[5:]: nd for nd in table if nd.kind == 'bone'}
    segs = []
    for name, nd in bones.items():
        base = name.split('.')[0]
        if base not in TIPS:
            continue
        m = W[nd.src.name]
        tip = Vector(TIPS[base])
        if base == 'clav':
            tip.x *= 1 if name.endswith('.L') else -1
        segs.append((nd, m.translation, m @ tip))
    out = {}
    for nd in table:
        if nd.parent is not None or nd.kind == 'bone' or nd.name not in centres:
            continue
        c = centres[nd.name]
        out[nd.name] = min(segs, key=lambda s: _segment_distance(c, s[1], s[2]))[0]
    return out


# ------------------------------------------------------------------ export

def _tracks(table, hosts, W):
    """Per frame local (t, q, s) of every node, and the ground lift."""
    n = len(table)
    tr = np.zeros((FRAMES + 1, n, 7), np.float32)
    sc = np.ones((FRAMES + 1, n, 3), np.float32)
    for f in range(FRAMES + 1):
        for i, nd in enumerate(table):
            if nd.kind == 'wheel':
                L = Matrix.Translation(nd.hub)
            else:
                world = W[f][nd.src.name]
                host = nd.parent or hosts.get(nd.name)
                if host is not None:
                    hw = W[f][host.src.name]
                    L = hw.inverted() @ world
                else:
                    L = world
            t, q, s = L.decompose()
            if f and np.dot(tr[f - 1, i, 3:], (q.x, q.y, q.z, q.w)) < 0:
                q.negate()
            tr[f, i] = (t.x, t.y, t.z, q.x, q.y, q.z, q.w)
            sc[f, i] = (s.x, s.y, s.z)
    return tr, sc


def _world_matrices(nodes):
    """{frame: {blender node name: world matrix}} over the whole timeline."""
    scene = bpy.context.scene
    W = []
    for f in range(FRAMES + 1):
        scene.frame_set(f)
        W.append({name: o.matrix_world.copy() for name, o in nodes.items()})
    scene.frame_set(0)
    return W


def _lift(table, hosts, W, geometry):
    """Ground offset per frame: the lowest support point of the model on z = 0 (linkage stages, which only
    carry panels, never the machine's weight, are ignored)."""
    lift = np.zeros(FRAMES + 1, np.float32)
    owners = [(nd, geometry[nd.name]) for nd in table if nd.name in geometry and not nd.name.startswith('asm:link.')]
    for f in range(FRAMES + 1):
        low = 1e9
        for nd, pts in owners:
            if nd.kind == 'wheel':
                m = W[f][nd.parent.src.name] @ Matrix.Translation(nd.hub)
            else:
                m = W[f][nd.src.name]
            row = np.array(m.to_3x3())[2]
            low = min(low, float((pts @ row).min() + m.translation.z))
        lift[f] = -low
    return lift


def _events(table, tr, sc, areas):
    """Mechanism events for the audio: every family of nodes that moves relative to its parent, in T."""
    index = {nd.name: i for i, nd in enumerate(table)}
    families = {}
    for nd in table:
        if nd.kind in ('bone', 'wheel'):
            continue
        key = nd.name
        if key.startswith('asm:link.'):
            key = key.rsplit('.stage.', 1)[0].rsplit('.pin.', 1)[0]
        elif key.startswith('part:'):
            key = 'stow:' + re.sub(r'\.\d+$', '', key[5:])
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
        if telescope:
            activity[:4] = 0.0      # the stages leave their nests in the first frames; their stroke is what follows
        for f0, f1 in _windows(activity):
            m = float(move[f0:f1].sum())
            d = math.degrees(float(turn[f0:f1].sum()))
            if m < 1e-3 and d < 0.5:
                continue
            kind = 'telescope' if telescope else ('hinge' if d > 20.0 * max(m, 1e-6) else 'slide')
            ev.append(dict(name=key, kind=kind, t0=round(f0 / FRAMES, 4), t1=round(f1 / FRAMES, 4),
                           size=0.3 if telescope else round(size, 3), amount=round(d if kind == 'hinge' else m, 4),
                           side=1 if key.endswith('.L') else (-1 if key.endswith('.R') else 0)))
    return ev


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
            ev.append(dict(name='rig:' + name, kind=kind, t0=round(f0 / FRAMES, 4), t1=round(f1 / FRAMES, 4), size=size, amount=1.0, side=0))
    return ev


def _rig_block(table, tr, W):
    """Joint offsets, the stand pose (frame 240 relative to rest) and the dimensions the live gait solves with."""
    defs = rig.definitions()
    index = {nd.name[5:]: i for i, nd in enumerate(table) if nd.kind == 'bone'}
    offset = {n: Vector(o) for n, p, o in defs}
    stand = {}
    for n, p, o in defs:
        i = index[n]
        t = tr[FRAMES, i]
        slide = (Vector(t[:3]) - offset[n]) if p else Vector()
        stand[n] = [float(t[3]), float(t[4]), float(t[5]), float(t[6]), slide.x, slide.y, slide.z]
    worlds = {nd.name[5:]: W[FRAMES][nd.src.name] for nd in table if nd.kind == 'bone'}
    pelvis, foot = worlds['pelvis'].translation, worlds['foot.L'].translation

    def quat(name):
        x, y, z, w = (float(v) for v in tr[FRAMES, index[name]][3:7])
        return Quaternion((w, x, y, z))
    # the forearm is Rx(elbow) @ Rz(turn-in); the upper arm abducts about Y; the fingers flex about X
    fore = quat('forearm.L').to_matrix()
    elbow = math.degrees(math.atan2(-fore[1][2], fore[2][2]))
    arm = quat('upperarm.L').to_euler('XYZ')
    curl = [math.degrees(quat('index%d.L' % k).to_euler('XYZ').x) for k in (1, 2, 3)]
    dims = dict(thigh=rig.THIGH, shin=rig.SHIN, upper=rig.UPPER, fore=rig.FORE, hipX=offset['hip.L'].x, hipZ=rig.HIP_Z,
                ankleZ=round(foot.z, 4), robotF=round(-pelvis.y, 4), crouch=round(rig.HIP_Z - pelvis.z, 4), wheelRadius=0.0,
                armAbduct=round(-math.degrees(arm.y), 3), elbowBend=round(-elbow, 3), fingerCurl=[round(c, 3) for c in curl],
                duration=FRAMES / 30.0, stanceX=round(foot.x, 4), footF=round(-foot.y, 4), kneePoleUp=0.12)
    return dict(bones=[dict(name=n, parent=p, offset=list(o)) for n, p, o in defs], stand=stand, dims=dims)


def export(out_dir=OUT_DIR):
    os.makedirs(out_dir, exist_ok=True)
    bpy.context.scene.frame_set(0)
    nodes, meshes = _collect()
    table = _split_wheels(_build_nodes(nodes, meshes))
    all_objs = [o for nd in table for o, _ in nd.objs]
    counts = [_tri_count(o) for o in all_objs]
    targets = dict(zip((o.name for o in all_objs), _plan(counts)))
    print('authoring %d triangles in %d meshes, target %s' % (sum(counts), len(all_objs), TRI_BUDGET or 'full'))

    dg = bpy.context.evaluated_depsgraph_get()
    blob = Blob()
    manifest_nodes, geometry, areas = [], {}, {}
    tri_total, worst = 0, []
    for nd in table:
        merged = {}
        for o, M in nd.objs:
            arrays, tris, dev = _reduced(o, M, targets[o.name], dg)
            if dev > 0:
                worst.append((dev, o.name, _tri_count(o), tris))
            for slot, (p, n) in arrays.items():
                prev = merged.get(slot)
                merged[slot] = (np.concatenate([prev[0], p]), np.concatenate([prev[1], n])) if prev else (p, n)
        mlist, pts = [], []
        for slot, (p, n) in sorted(merged.items()):
            key = np.concatenate([np.round(p, 5), np.round(n, 3)], axis=1)
            uniq, inv = np.unique(key, axis=0, return_inverse=True)
            first = np.zeros(len(uniq), np.int64)
            first[inv[::-1]] = np.arange(len(inv))[::-1]
            P, N_, I = p[first], n[first], inv.reshape(-1, 3)
            lo, hi = P.min(0), P.max(0)
            span = np.maximum(hi - lo, 1e-6)
            q = np.round((P - lo) / span * 65535 - 32768).astype(np.int16)
            idx = I.astype(np.uint16 if len(P) < 65536 else np.uint32)
            mlist.append(dict(material=slot, count=int(len(P)), triangles=int(len(I)), min=[float(v) for v in lo], max=[float(v) for v in hi],
                              position=blob.add(q), normal=blob.add(_oct(N_)), index=blob.add(idx.reshape(-1)), index32=bool(len(P) >= 65536)))
            tri_total += len(I)
            pts.append(P)
        if pts:
            P = np.concatenate(pts)
            geometry[nd.name] = P
            d = P.max(0) - P.min(0)
            areas[nd.name] = float(d[0] * d[1] + d[1] * d[2] + d[0] * d[2])
        manifest_nodes.append(dict(name=nd.name, parent=-1, kind=nd.kind, meshes=mlist))
    worst.sort(reverse=True)
    for dev, name, before, after in worst[:6]:
        print('  largest reduction error %.2f mm: %s (%d -> %d triangles)' % (dev * 1000, name, before, after))

    W = _world_matrices(nodes)
    centres = {}
    for nd in table:
        if nd.name in geometry and nd.kind != 'wheel':
            P = geometry[nd.name]
            centres[nd.name] = W[FRAMES][nd.src.name] @ Vector((P.min(0) + P.max(0)) / 2)
    # an assembly with no mesh of its own sits where what it carries sits
    carried = {}
    for nd in table:
        if nd.parent is not None and nd.parent.name not in centres:
            carried.setdefault(nd.parent.name, []).append(
                W[FRAMES][nd.parent.src.name] @ nd.hub if nd.kind == 'wheel' else centres[nd.name] if nd.name in centres else None)
    for name, cs in carried.items():
        cs = [c for c in cs if c is not None]
        if cs:
            centres[name] = sum(cs, Vector()) / len(cs)
    hosts = _hosts(table, W[FRAMES], centres)
    for nd in table:
        if nd.parent is None and nd.kind != 'bone' and nd.name not in hosts:
            raise ValueError('%s has no geometry to place on a bone' % nd.name)

    # parents before children, bones first
    names = {nd.name: nd for nd in table}
    ordered, done = [], set()

    def visit(nd):
        if nd.name in done:
            return
        parent = nd.parent or hosts.get(nd.name)
        if parent is not None:
            visit(parent)
        done.add(nd.name)
        ordered.append(nd)
    for nd in sorted(table, key=lambda n: (n.kind != 'bone',)):
        visit(nd)
    table = ordered
    manifest_nodes = sorted(manifest_nodes, key=lambda m: [nd.name for nd in table].index(m['name']))
    index = {nd.name: i for i, nd in enumerate(table)}
    for m, nd in zip(manifest_nodes, table):
        parent = nd.parent or hosts.get(nd.name)
        m['parent'] = index[parent.name] if parent else -1

    tr, sc = _tracks(table, hosts, W)
    lift = _lift(table, hosts, W, geometry)
    print('lift %.3f .. %.3f m; hosts: %s' % (lift.min(), lift.max(), _host_summary(hosts)))
    _check_continuity(table, tr)
    tracks_off = blob.add(tr.reshape(-1))
    scales_off = blob.add(sc.reshape(-1))
    lift_off = blob.add(lift)

    rig_block = _rig_block(table, tr, W)
    rig_block['dims']['wheelRadius'] = round(max(nd.radius for nd in table if nd.kind == 'wheel' and nd.name.startswith('wheel:wheelR')), 4)
    events = _events(table, tr, sc, areas) + _rig_events(table, tr)
    events.sort(key=lambda e: (e['t0'], e['name']))
    manifest = dict(version=1, frames=FRAMES + 1, nodes=manifest_nodes, tracks=tracks_off, scales=scales_off, lift=lift_off,
                    rig=rig_block, events=events, triangles=int(tri_total))
    data = blob.bytes()
    with open(os.path.join(out_dir, NAME + '.bin'), 'wb') as fh:
        fh.write(data)
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as fh:
        json.dump(manifest, fh, separators=(',', ':'))
    print('exported %d nodes, %d triangles, %.2f MB, %d events -> %s' % (len(table), tri_total, len(data) / 1e6, len(events), out_dir))
    return manifest


def _host_summary(hosts):
    count = {}
    for h in hosts.values():
        count[h.name] = count.get(h.name, 0) + 1
    return ', '.join('%s %d' % (k[5:], v) for k, v in sorted(count.items(), key=lambda kv: -kv[1]))


def _check_continuity(table, tr):
    """Largest frame-to-frame jump of any node's local translation / rotation (a snap would show here)."""
    d = np.linalg.norm(np.diff(tr[:, :, :3], axis=0), axis=2)
    a = 2 * np.degrees(np.arccos(np.abs(np.sum(tr[:-1, :, 3:] * tr[1:, :, 3:], axis=2)).clip(0, 1)))
    for label, arr, unit in (('translation', d, 'm'), ('rotation', a, 'deg')):
        f, i = np.unravel_index(np.argmax(arr), arr.shape)
        print('  largest %s step %.3f %s: %s frame %d' % (label, arr[f, i], unit, table[i].name, f))
