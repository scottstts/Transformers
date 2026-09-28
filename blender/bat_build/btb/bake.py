"""Pose evaluation over T, ground lift, and keyframe baking.

object_worlds(T) is the single source of posed transforms for the timeline
bake, the clearance sweep, and the exporter."""
import math
import numpy as np
import bpy
from mathutils import Matrix, Vector
from bpy_extras import anim_utils
from . import motion, mech, carrier

FRAMES = 240              # T = frame / FRAMES (8 s at 30 fps)
_SUPPORT = {}


def support_points(o):
    """26-direction support vertices of an object's mesh (local space)."""
    key = o.name
    if key in _SUPPORT and _SUPPORT[key][0] is o.data:
        return _SUPPORT[key][1]
    n = len(o.data.vertices)
    if n == 0:
        _SUPPORT[key] = (o.data, np.zeros((0, 3)))
        return _SUPPORT[key][1]
    co = np.empty(n * 3)
    o.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    dirs = np.array([(x, y, z) for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1) if x or y or z], float)
    idx = np.unique(np.argmax(co @ dirs.T, axis=0))
    pts = co[idx]
    _SUPPORT[key] = (o.data, pts)
    return pts


def node_worlds(sc, T, W, follow=True):
    """World matrices of the assembly nodes for bone worlds W. follow=False ignores the
    hand-over of world-hosted assemblies to their carrying bone."""
    out = {}

    def depth(a):
        return 0 if not a.host.startswith('@') else 1 + depth(sc.asm[a.host[1:]])
    order = sorted(sc.asm.values(), key=depth)
    for a in order:
        local = mech.displacement(a.steps, T) @ a.A0
        if a.host.startswith('@'):
            parent = out[a.host[1:]]
        elif a.host == 'world':
            parent = Matrix.Identity(4)
        else:
            parent = W[a.host]
        M = parent @ local
        if follow and a.follow and a.K is not None and T > a.follow[1]:
            carried = W[a.follow[0]] @ a.K
            t0, t1 = a.follow[1], a.follow[2]
            u = 1.0 if T >= t1 else mech.smooth((T - t0) / (t1 - t0))
            M = blend(M, carried, u)
        out[a.name] = M
    return out


def blend(A, B, u):
    """Rigid blend of two world matrices (lerp translation, slerp rotation)."""
    t = A.to_translation().lerp(B.to_translation(), u)
    q = A.to_quaternion().slerp(B.to_quaternion(), u)
    return Matrix.Translation(t) @ q.to_matrix().to_4x4()


def object_worlds(sc, T):
    """Returns (objects -> world matrix, bone worlds, node worlds, lift) at T,
    with the ground lift applied (lowest support point on z = air(T): 0 on the
    ground, above it during the jump)."""
    W, P = motion.world(T, sc.skel)
    N = node_worlds(sc, T, W)
    objs = {}
    stow = getattr(sc, 'stow', {})
    for bone, lst in sc.structure.items():
        for o in lst:
            objs[o] = W[bone] @ stow[o].matrix(T) if o in stow else W[bone]
    for a in sc.asm.values():
        for on in a.parts:
            o = bpy.data.objects[on]
            objs[o] = N[a.name] @ o.matrix_basis
    carrier.pose(sc, objs, W, N, T)
    low = 1e9
    for o, M in objs.items():
        pts = support_points(o)
        if not len(pts):
            continue
        R = np.array(M.to_3x3())
        t = np.array(M.translation)
        z = (pts @ R.T + t)[:, 2]
        low = min(low, float(z.min()))
    h = motion.air(T) - low
    lift = Matrix.Translation((0, 0, h))
    for o in objs:
        objs[o] = lift @ objs[o]
    W = {k: lift @ m for k, m in W.items()}
    N = {k: lift @ m for k, m in N.items()}
    return objs, W, N, h


def node_local(sc, a, W, N):
    if a.host.startswith('@'):
        return N[a.host[1:]].inverted() @ N[a.name]
    if a.host == 'world':
        return N[a.name]
    return W[a.host].inverted() @ N[a.name]


def apply(sc, T):
    """Pose the Blender scene (empties) at T, lift included."""
    objs, W, N, lift = object_worlds(sc, T)
    for n in sc.skel.names:
        p = sc.skel.parent[n]
        sc.bones[n].matrix_basis = (W[p].inverted() @ W[n]) if p else W[n]
    for a in sc.asm.values():
        a.node.matrix_basis = node_local(sc, a, W, N)
    for o, st in getattr(sc, 'stow', {}).items():
        o.matrix_basis = st.matrix(T)
    for s in getattr(sc, 'carriers', []):
        for o in s.objs:
            o.matrix_basis = objs[o]
    bpy.context.view_layer.update()
    return lift


def _keys(obj, frames, mats):
    obj.rotation_mode = 'QUATERNION'
    obj.animation_data_create()
    act = obj.animation_data.action
    if act is None or act.name != 'bat.' + obj.name:
        act = bpy.data.actions.get('bat.' + obj.name) or bpy.data.actions.new('bat.' + obj.name)
        obj.animation_data.action = act
    if act.slots:
        slot = act.slots[0]
    else:
        slot = act.slots.new(id_type='OBJECT', name=obj.name)
    obj.animation_data.action_slot = slot
    cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)
    for fc in list(cb.fcurves):
        cb.fcurves.remove(fc)
    loc = [m.to_translation() for m in mats]
    rot = [m.to_quaternion() for m in mats]
    for i in range(1, len(rot)):
        if rot[i].dot(rot[i - 1]) < 0:
            rot[i].negate()
    chans = [('location', 3, lambda i, k: loc[i][k]), ('rotation_quaternion', 4, lambda i, k: rot[i][k])]
    for path, n, get in chans:
        for k in range(n):
            fc = cb.fcurves.new(path, index=k)
            fc.keyframe_points.add(len(frames))
            co = []
            for i, f in enumerate(frames):
                co += [f, get(i, k)]
            fc.keyframe_points.foreach_set('co', co)
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
            fc.update()


def bake(sc, step=1, warp=True):
    frames = list(range(0, FRAMES + 1, step))
    sc.warp = density_warp(sc) if warp else [f / FRAMES for f in range(FRAMES + 1)]
    bone_m = {n: [] for n in sc.skel.names}
    node_m = {a: [] for a in sc.asm}
    stow_m = {o: [] for o in getattr(sc, 'stow', {})}
    carry_m = {o: [] for s in getattr(sc, 'carriers', []) for o in s.objs}
    for f in frames:
        T = sc.warp[f]
        objs, W, N, lift = object_worlds(sc, T)
        for o in stow_m:
            stow_m[o].append(sc.stow[o].matrix(T))
        for o in carry_m:
            carry_m[o].append(objs[o])
        for n in sc.skel.names:
            p = sc.skel.parent[n]
            bone_m[n].append((W[p].inverted() @ W[n]) if p else W[n])
        for name, a in sc.asm.items():
            node_m[name].append(node_local(sc, a, W, N))
    for n in sc.skel.names:
        _keys(sc.bones[n], frames, bone_m[n])
    for name, a in sc.asm.items():
        _keys(a.node, frames, node_m[name])
    for o, mats in list(stow_m.items()) + list(carry_m.items()):
        _keys(o, frames, mats)
    scn = bpy.context.scene
    scn.frame_start, scn.frame_end = 0, FRAMES
    scn.frame_set(0)
    return len(frames)


def density_warp(sc, samples=321, mix=0.88):
    """Invert a smoothed, regularized travel density without changing event order.

    Weight by visible part size, so tiny linkage pieces do not dictate pacing.
    Blend density BEFORE inversion; blending inverse time with linear time
    reintroduces the original bursts. Short endpoint ramps soften start/landing.
    """
    Ts = [i / (samples - 1) for i in range(samples)]
    prev, travel = None, []
    weights = {}
    for T in Ts:
        objs, W, N, lift = object_worlds(sc, T)
        cur = {}
        for o, M in objs.items():
            pts = support_points(o)
            if not len(pts):
                continue
            R = np.array(M.to_3x3())
            cur[o] = pts @ R.T + np.array(M.translation)
            if o not in weights:
                weights[o] = max(0.025, min(1.5, float(np.linalg.norm(np.ptp(pts, axis=0)))))
        if prev is not None:
            e = sum(weights[o] * float(np.linalg.norm(cur[o] - prev[o], axis=1).mean()) for o in cur if o in prev)
            travel.append(e)
        prev = cur
    kernel = np.array([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], dtype=float)
    kernel /= kernel.sum()
    density = np.convolve(np.pad(travel, (5, 5), mode='edge'), kernel, mode='valid')
    density = mix * density + (1 - mix) * max(float(density.mean()), 1e-9)
    cumulative = np.concatenate(([0.0], np.cumsum(density)))
    cumulative /= cumulative[-1]

    def eased_distance(x, ramp=0.045):
        if x < ramp:
            u = x / ramp
            return ramp * (u**3 - 0.5*u**4) / (1 - ramp)
        if x > 1 - ramp:
            return 1 - eased_distance(1 - x, ramp)
        return (x - ramp / 2) / (1 - ramp)

    return np.interp([eased_distance(f / FRAMES) for f in range(FRAMES + 1)], cumulative, Ts).tolist()
