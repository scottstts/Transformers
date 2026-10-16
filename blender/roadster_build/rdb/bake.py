"""Bake the transformation onto the timeline (frame f = t * FPS, 0 .. FRAMES).

Body-frame worlds come from choreo. The flight transform F(t) turns the whole
assembly about its centre (the chest-pelvis midpoint) through the launch pitch
and the backflip, then lifts it only as far as its lowest point needs to stay
on the ground (exact contact on the ground phases). The game adds the
altitude A(t) = W(t) - c(t) (flight.py), written here to the `flight.altitude`
empty and the scene's `roadster_flight` record for the export's lift track.
"""
import math
import bpy
from bpy_extras import anim_utils
from mathutils import Matrix, Vector, Quaternion
from . import kit as K, rig, dock, choreo as C, aero, flight as FL


# ---------------------------------------------------------------- interpolation

def screw(A, B, u):
    """Rigid interpolation A -> B (host frame): about the motion's screw axis when
    it turns more than 15 deg (a hinge swing), else a glide."""
    D = B @ A.inverted()
    q = D.to_quaternion()
    ang = 2 * math.acos(max(-1.0, min(1.0, abs(q.w))))
    if ang < math.radians(15):
        loc = A.translation.lerp(B.translation, u)
        rot = A.to_quaternion().slerp(B.to_quaternion(), u)
        return Matrix.Translation(loc) @ rot.to_matrix().to_4x4()
    if q.w < 0:
        q = -q
    axis = Vector((q.x, q.y, q.z)).normalized()
    R = q.to_matrix()
    t = D.translation
    along = axis * t.dot(axis)
    perp = t - along
    M = Matrix.Identity(3) - R
    M2 = M + Matrix(((axis.x * axis.x, axis.x * axis.y, axis.x * axis.z),
                     (axis.y * axis.x, axis.y * axis.y, axis.y * axis.z),
                     (axis.z * axis.x, axis.z * axis.y, axis.z * axis.z)))
    p = M2.inverted() @ perp
    Du = Matrix.Translation(p + along * u) @ Matrix.Rotation(ang * u, 4, axis) @ Matrix.Translation(-p)
    return Du @ A


def ease(u):
    return u * u * u * (u * (u * 6 - 15) + 10)


# ---------------------------------------------------------------- evaluation

class Scene:
    def __init__(self):
        self.track = C.Track(C.pose_keys())
        self.groups = dock.groups_all()
        self.progs = C.programs()
        self.car = {}
        for o in bpy.data.objects:
            if o.type == 'EMPTY' and 'car_mw' in o:
                key = o.name[9:] if o.name.startswith('bone.asm.') else o.name[5:]
                self.car[key] = dock.car_matrix(o)
        self.rest = {n: rig.rest(n) for n in rig.NAMES}
        self.W0 = self.bones(0.0)
        self.held = {}

    def bones(self, t):
        return C.bones(self.track, t)

    def dock_rel(self, name, host):
        b, D = self.groups[name]
        if host in rig.HEADS:
            return self.rest[host].inverted() @ D @ self.car[name]
        hb, Dh = self.groups[host]
        return Dh.inverted() @ D @ self.car[name]

    def host_world(self, host, W, cw):
        if host == 'body':
            return Matrix.Identity(4)
        if host in W:
            return W[host]
        return cw[host] @ self.car[host].inverted()

    def host_car(self, host):
        """The host's frame at t = 0 (car frames: identity)."""
        if host in self.W0:
            return self.W0[host]
        return Matrix.Identity(4)

    def resolve(self, name, k):
        t, host, rel = self.progs[name][k]
        if isinstance(rel, tuple) and rel[0] == 'approach':
            # the dock, offset in the host bone's frame (an approach along the axle)
            return Matrix.Translation(rel[1]) @ self.dock_rel(name, host)
        if isinstance(rel, tuple) and rel[0] == 'hinge':
            return self.host_car(host).inverted() @ C.hinge(rel[1], rel[2], rel[3]) @ self.car[name]
        if isinstance(rel, tuple):
            return self.host_car(host).inverted() @ rel[1] @ self.car[name]
        if rel == 'car':
            return self.host_car(host).inverted() @ self.car[name]
        if rel == 'dock':
            return self.dock_rel(name, host)
        if rel == 'hold':
            key = (name, k)
            if key not in self.held:
                Wt = self.bones(t)
                cwt = self.carriers(t, Wt, upto=name)
                prev = self.world_at(name, t, Wt, cwt, before=k)
                self.held[key] = self.host_world(host, Wt, cwt).inverted() @ prev
            return self.held[key]
        raise ValueError(rel)

    def world_at(self, name, t, W, cw, before=None):
        prog = self.progs[name]
        n = len(prog) if before is None else before
        i = max([k for k in range(n) if prog[k][0] <= t] or [0])
        t0, host, _ = prog[i]
        A = self.resolve(name, i)
        if i + 1 < n and prog[i + 1][1] == host:
            t1 = prog[i + 1][0]
            u = ease(min(1.0, max(0.0, (t - t0) / (t1 - t0))))
            nxt = prog[i + 1][2]
            cur = prog[i][2]
            if isinstance(nxt, tuple) and nxt[0] == 'hinge':
                # a hinge: the angle eases about its pivot from the previous hinge angle
                a0 = cur[3] if isinstance(cur, tuple) and cur[0] == 'hinge' and cur[1] == nxt[1] else 0.0
                rel = self.host_car(host).inverted() @ C.hinge(nxt[1], nxt[2], a0 + (nxt[3] - a0) * u) @ self.car[name]
            else:
                B = self.resolve(name, i + 1)
                if (nxt == 'dock' or (isinstance(nxt, tuple) and nxt[0] == 'approach')) and name in C.BRACED:
                    # carried in on a telescope: straight along it, turning about its own centre
                    rel = Matrix.Translation(A.translation.lerp(B.translation, u)) @ \
                        A.to_quaternion().slerp(B.to_quaternion(), u).to_matrix().to_4x4()
                else:
                    rel = screw(A, B, u)
        else:
            rel = A
        H = self.host_world(host, W, cw)
        if name == 'cabin':
            return H @ C.cabin_stow(t) @ rel
        M = H @ rel
        if name.startswith('wheel') and host not in rig.HEADS:
            # on the car: the wheels hang on their suspension once airborne
            M = Matrix.Translation((0, 0, C.droop(t))) @ M
        return M

    def carriers(self, t, W, upto=None):
        cw = {}
        for name in C.ORDER:
            if name == upto:
                break
            if name in self.progs:
                cw[name] = self.world_at(name, t, W, cw)
        if upto is not None:
            return cw
        u = C.aero_u(t)
        for name, lead in C.FOLLOW.items():
            if name not in self.car or lead not in cw:
                continue
            mc = self.car[name]
            if name.startswith(C.AERO):
                mc = aero.deployed(name, mc, u)
            cw[name] = cw[lead] @ self.car[lead].inverted() @ mc
        return cw


def nests():
    out = {}
    for o in bpy.data.objects:
        if o.type == 'EMPTY' and o.name.startswith('bone.part.'):
            out[o.name[10:]] = (o, o['nest_bone'], Vector(o['nest_offset']))
    return out


_SUPPORT = {}


def support(o):
    """A mesh's support points: its farthest vertex along 98 directions (cached),
    so the lowest point under any rotation is found from ~100 points."""
    if o.name not in _SUPPORT:
        import numpy as np
        nv = len(o.data.vertices)
        if not nv:
            _SUPPORT[o.name] = []
            return []
        dirs = []
        n = 7
        for i in range(n):
            for j in range(2 * n):
                th = math.pi * (i + 0.5) / n
                ph = math.pi * j / n
                dirs.append((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
        co = np.empty(nv * 3)
        o.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        idx = np.unique(np.argmax(co @ np.array(dirs).T, axis=0))
        _SUPPORT[o.name] = [Vector(co[i]) for i in idx]
    return _SUPPORT[o.name]


def lowest(objs_world):
    z = 1e9
    for o, M in objs_world:
        for c in support(o):
            z = min(z, (M @ c).z)
    return z


def centre(W):
    return (W['chest'].translation + W['pelvis'].translation) / 2


def F_matrix(t, W, lift):
    """Launch pitch and the backflip about the centre, then the
    ground lift."""
    c = centre(W)
    ang = FL.flip_angle(t) + C.launch_pitch(t)
    return Matrix.Translation((0, 0, lift)) @ Matrix.Translation(c) @ \
        Matrix.Rotation(ang, 4, 'X') @ Matrix.Translation(-c)


def _keys(obj, frames, mats):
    obj.rotation_mode = 'QUATERNION'
    obj.animation_data_create()
    name = 'roadster.' + obj.name
    act = bpy.data.actions.get(name) or bpy.data.actions.new(name)
    obj.animation_data.action = act
    slot = act.slots[0] if act.slots else act.slots.new(id_type='OBJECT', name=obj.name)
    obj.animation_data.action_slot = slot
    cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)
    for fc in list(cb.fcurves):
        cb.fcurves.remove(fc)
    loc, rot, scl = [], [], []
    for m in mats:
        l, r, s = m.decompose()
        loc.append(l)
        rot.append(r)
        scl.append(s)
    for i in range(1, len(rot)):
        if rot[i].dot(rot[i - 1]) < 0:
            rot[i].negate()
    for path, arr, n in (('location', loc, 3), ('rotation_quaternion', rot, 4), ('scale', scl, 3)):
        for k in range(n):
            fc = cb.fcurves.new(path, index=k)
            fc.keyframe_points.add(len(frames))
            co = []
            for i, f in enumerate(frames):
                co += [f, arr[i][k]]
            fc.keyframe_points.foreach_set('co', co)
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
            fc.update()


def evaluate(S, frames):
    """Body-frame worlds, carrier worlds, brace worlds and nest matrices per frame,
    and the lowest point of the flipped (unlifted) assembly."""
    from . import linkage
    NS = nests()
    car_objs = [(o, o.parent.name) for o in bpy.data.objects
                if o.type == 'MESH' and o.parent is not None and o.users_collection and
                o.users_collection[0].name == '01_CAR']
    rob_objs = [(o, o.parent.name[10:]) for o in bpy.data.objects
                if o.type == 'MESH' and o.parent is not None and o.parent.name.startswith('bone.part.')]
    data, minz = [], []
    for f in frames:
        t = f / FL.FPS
        W = S.bones(t)
        cw = S.carriers(t, W)
        nm = {name: C.casting_matrix(bone, off, t) for name, (o, bone, off) in NS.items()}
        lw = linkage.worlds(t, W, cw)
        F0 = F_matrix(t, W, 0.0)
        ow = []
        for o, pn in car_objs:
            key = pn[9:] if pn.startswith('bone.asm.') else pn[5:]
            if key in cw:
                ow.append((o, F0 @ cw[key] @ o.matrix_parent_inverse @ o.matrix_basis))
        for o, part in rob_objs:
            ow.append((o, F0 @ W[NS[part][1]] @ nm[part] @ o.matrix_basis))
        minz.append(lowest(ow))
        data.append((t, W, cw, nm, lw))
    return NS, data, minz


def ground_lift(frames, minz):
    """Exact contact on the ground phases; in the air a smooth upper envelope of
    what keeps the lowest point at the ground (the Blender view only: the game's
    altitude cancels it, flight.py)."""
    need = [max(0.0, -z) for z in minz]
    n = len(need)
    env = [max(need[max(0, i - 8):i + 9]) for i in range(n)]
    sm = []
    for i in range(n):
        acc = wsum = 0.0
        for j in range(max(0, i - 10), min(n, i + 11)):
            w = math.exp(-((i - j) / 5.0) ** 2)
            acc += env[j] * w
            wsum += w
        sm.append(max(acc / wsum, need[i]))
    out = []
    for i, f in enumerate(frames):
        t = f / FL.FPS
        contact = -minz[i]
        k = max(1 - K.smooth(t, FL.LIFTOFF, FL.LIFTOFF + 0.6), K.smooth(t, FL.TOUCH - 0.5, FL.TOUCH))
        out.append(sm[i] * (1 - k) + contact * k)
    return out


def bake(step=1):
    sc = bpy.context.scene
    S = Scene()
    frames = list(range(0, FL.FRAMES + 1, step))
    NS, data, minz = evaluate(S, frames)
    lift = ground_lift(frames, minz)
    bone_m = {n: [] for n in rig.NAMES}
    car_m, link_m = {}, {}
    nest_m = {name: [] for name in NS}
    cz = []
    for i, (t, W, cw, nm, lw) in enumerate(data):
        F = F_matrix(t, W, lift[i])
        cz.append((F @ centre(W)).z)
        for nme, pn, h in rig.DEFS:
            bone_m[nme].append(F @ W[nme] if pn is None else W[pn].inverted() @ W[nme])
        for key, M in cw.items():
            car_m.setdefault(key, []).append(F @ M)
        for key, M in lw.items():
            link_m.setdefault(key, []).append(F @ M)
        for name in NS:
            nest_m[name].append(nm[name])
    for n in rig.NAMES:
        _keys(bpy.data.objects['bone.robot.' + n], frames, bone_m[n])
    for key, mats in car_m.items():
        o = bpy.data.objects.get(dock.node_name(key))
        if o is not None:
            o.parent = None
            _keys(o, frames, mats)
    for key, mats in link_m.items():
        o = bpy.data.objects.get('bone.' + key)
        if o is not None:
            _keys(o, frames, mats)
    for name, (o, bone, off) in NS.items():
        _keys(o, frames, nest_m[name])
    alt = altitude(frames, cz)
    sc.frame_start, sc.frame_end = 0, FL.FRAMES
    sc.render.fps = FL.FPS
    sc.timeline_markers.clear()
    for tm, label in ((0.0, 'car'), (FL.LIFTOFF, 'lift-off'), (FL.BOOST, 'boost end'), (FL.FLIP_IN, 'flip'),
                      (FL.APEX, 'apex'), (FL.FLIP_OUT, 'flip end'), (FL.TOUCH, 'touch-down'), (7.3, 'hero landing'),
                      (FL.DURATION, 'stand')):
        sc.timeline_markers.new(label, frame=round(tm * FL.FPS))
    sc.frame_set(0)
    rec = sc['roadster_flight']
    return {'frames': len(frames), 'car_min': round(minz[0], 3), 'end_min': round(minz[-1], 3),
            'max_ground_lift': round(max(lift), 2), 'apex_alt': round(max(alt), 2), 'min_alt': round(min(alt), 2),
            'g': round(rec['g'], 2), 'boost_a': round(rec['a'], 2), 'c0': round(rec['c0'], 2), 'c1': round(rec['c1'], 2)}


def altitude(frames, cz):
    """The altitude the game adds (flight.py): W(t) - c(t) in the air, 0 on the
    ground; keyed on `flight.altitude` (z) and recorded on the scene."""
    sc = bpy.context.scene
    i0 = frames.index(round(FL.LIFTOFF * FL.FPS))
    i1 = frames.index(round(FL.TOUCH * FL.FPS))
    c0, c1 = cz[i0], cz[i1]
    alt = []
    for i, f in enumerate(frames):
        t = f / FL.FPS
        alt.append(FL.W(t, c0, c1) - cz[i] if FL.LIFTOFF < t < FL.TOUCH else 0.0)
    a, g, Wa = FL.solve(c0, c1)
    sc['roadster_flight'] = {'fps': FL.FPS, 'frames': FL.FRAMES, 'liftoff': FL.LIFTOFF, 'boost': FL.BOOST,
                             'apex': FL.APEX, 'touch': FL.TOUCH, 'c0': c0, 'c1': c1, 'a': a, 'g': g,
                             'apex_height': Wa, 'altitude': alt}
    o = bpy.data.objects.get('flight.altitude')
    if o is None:
        o = bpy.data.objects.new('flight.altitude', None)
        bpy.data.collections['03_RIG'].objects.link(o)
        o[K.TAG] = True
        o.empty_display_type = 'SINGLE_ARROW'
        o.empty_display_size = 1.0
    o['note'] = 'the altitude the game adds to the whole model (z, m); the scene itself has none'
    _keys(o, frames, [Matrix.Translation((0, 0, v)) for v in alt])
    return alt


def flight_preview(on=True):
    """Review aid (never saved on): hang every root node under a `flight.preview`
    empty that carries the altitude, so the timeline plays as in the game."""
    sc = bpy.context.scene
    pv = bpy.data.objects.get('flight.preview')
    if on:
        roots = [o for o in bpy.data.objects if o.get(K.TAG) and o.type == 'EMPTY' and o.parent is None and
                 o.name.startswith(('bone.robot.pelvis', 'bone.asm.', 'bone.wheel', 'bone.link.'))]
        if pv is None:
            pv = bpy.data.objects.new('flight.preview', None)
            bpy.data.collections['03_RIG'].objects.link(pv)
        src = bpy.data.objects['flight.altitude']
        pv.animation_data_create()
        pv.animation_data.action = src.animation_data.action
        pv.animation_data.action_slot = src.animation_data.action_slot
        for o in roots:
            o.parent = pv
            o.matrix_parent_inverse = Matrix.Identity(4)
        bpy.data.objects['stage.ground'].hide_set(True)
    else:
        for o in bpy.data.objects:
            if o.parent is not None and o.parent.name == 'flight.preview':
                o.parent = None
                o.matrix_parent_inverse = Matrix.Identity(4)
        if pv is not None:
            bpy.data.objects.remove(pv, do_unlink=True)
        bpy.data.objects['stage.ground'].hide_set(False)
    sc.frame_set(sc.frame_current)


def preview_pose(pose):
    """Pose the robot (castings full size, car parts docked) without the timeline."""
    S = Scene()
    for o in bpy.data.objects:
        if o.animation_data and o.get(K.TAG) and o.type == 'EMPTY':
            o.animation_data.action = None
    p, root = C.Track([(0.0, pose), (1.0, pose)]).sample(0.5)
    W = rig.worlds(p, root)
    for n, pn, h in rig.DEFS:
        o = bpy.data.objects['bone.robot.' + n]
        o.matrix_basis = W[n] if pn is None else W[pn].inverted() @ W[n]
    for name, (o, bone, off) in nests().items():
        o.matrix_basis = Matrix.Translation(off)
    for name, (host, D) in S.groups.items():
        o = bpy.data.objects.get(dock.node_name(name))
        if o is None:
            continue
        hb = host if host in W else S.groups[host][0]
        o.parent = None
        o.matrix_world = W[hb] @ S.rest[hb].inverted() @ D @ S.car[name]
    for name, lead in C.FOLLOW.items():
        o = bpy.data.objects.get(dock.node_name(name))
        L = bpy.data.objects.get(dock.node_name(lead))
        if o is not None and L is not None and name not in S.groups:
            o.matrix_world = L.matrix_world @ S.car[lead].inverted() @ S.car[name]
    c = bpy.data.objects.get('bone.asm.cabin')
    if c is not None:
        c.matrix_world = Matrix.Diagonal((0.001, 0.001, 0.001, 1.0))
    bpy.context.view_layer.update()
    return W
