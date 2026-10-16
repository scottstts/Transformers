"""Telescopic grab braces: each carries one car assembly from where the robot
meets it to its dock.

A brace `link.<name>` (`pin.A`, `pin.B`, `stage.0..n`) runs from pin A on a
skeleton bone to pin B: nested stages of one constant length laid evenly along
the line between the pins (the game's braces.ts lays them again on the live
skeleton the same way). Closed, it lies along its docked line inside the limb.
From DEPLOY it reaches out (pin B travelling from its closed place to the
assembly's grab point); at GRAB the assembly hands over to the bone and rides
the brace in to its dock, where the brace is closed again. Its closed length is
its docked span, so the robot's final frame is the brace's rest.

Pin points are bone-local at full size and grow with their chain; the grab
point is the assembly's point that lies on the pin-B line at the dock.
"""
import math
import bpy
from mathutils import Matrix, Vector
from . import kit as K, rig, dock, choreo as C, flight as FL

COLL = '04_LINKAGE'
SPECS = {}
_CAR = {}


def definitions():
    SPECS.clear()
    for S, s in (('L', 1), ('R', -1)):
        rows = [
            # outer forearm to the door's inner card: closed along the forearm under the door
            ('door.' + S, 'forearm.' + S, (s * 0.10, 0.06, -0.36), (s * 0.10, 0.06, -0.66), 'door.' + S,
             C.DOOR_GRAB - 0.35, C.DOOR_GRAB, 0.030),
            # shoulder joint to the front hub: closed across the pauldron's inner wall
            ('wheelF.' + S, 'upperarm.' + S, (s * 0.04, 0.0, 0.0), (s * 0.30, 0.0, 0.0), 'wheelF.' + S,
             C.WHEEL_F_GRAB - 0.35, C.WHEEL_F_GRAB, 0.034),
            # calf bracket to the rear hub: closed across the calf arch's wall
            ('wheelR.' + S, 'shin.' + S, (s * 0.17, 0.14, -0.90), (s * 0.43, 0.14, -0.90), 'wheelR.' + S,
             C.WHEEL_R_GRAB - 0.35, C.WHEEL_R_GRAB, 0.034),
        ]
        for name, bone, a, b, carrier, t_d, t_g, r in rows:
            line = (Vector(b) - Vector(a)).normalized()
            # the pieces' x: the bone's own axis most square to the docked line
            ref = min((Vector(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))), key=lambda v: abs(v.dot(line)))
            SPECS[name] = {'bone': bone, 'a': Vector(a), 'b_dock': Vector(b), 'carrier': carrier,
                           'deploy': t_d, 'grab': t_g, 'radius': r, 'ref': ref}
    return SPECS


def bind(S):
    """Car matrices and the grab points (car space) of the scene being baked."""
    _CAR.clear()
    _CAR.update(S.car)
    for name, spec in SPECS.items():
        D = S.groups[spec['carrier']][1]
        spec['b_car'] = D.inverted() @ rig.rest(spec['bone']) @ spec['b_dock']
        spec['length'] = (spec['b_dock'] - spec['a']).length
        # the meeting point: where the grab point sits in the bone at the hand-over (full
        # size), what the brace reaches for while it deploys
        bone, t = spec['bone'], spec['grab']
        W = S.bones(t)
        target = _points(spec, t, W, S.carriers(t, W))[2]
        k = C.growth(bone, t)
        P = C.PIVOT.get(bone, Vector())
        spec['meet'] = P + (W[bone].inverted() @ target - P) / k


def _grown(bone, p, t):
    k = C.growth(bone, t)
    P = C.PIVOT.get(bone, Vector())
    return P + (p - P) * k


def _points(spec, t, W, cw):
    bone = spec['bone']
    a = W[bone] @ _grown(bone, spec['a'], t)
    closed = W[bone] @ _grown(bone, spec['b_dock'], t)
    c = spec['carrier']
    return a, closed, cw[c] @ _CAR[c].inverted() @ spec['b_car']


def ends(spec, t, W, cw):
    a, closed, target = _points(spec, t, W, cw)
    u = C.smooth(t, spec['deploy'], spec['grab'])
    if u >= 1.0:
        return a, target
    if u <= 0.0:
        return a, closed
    # the brace swings out about pin A from its closed line to the meeting point (fixed
    # in the bone) while it extends, and the part arrives there at the grab. Aimed at
    # the grab point itself it would chase it as the limb swings past the part (and a
    # straight run through pin A reverses it in a frame)
    meet = W[spec['bone']] @ _grown(spec['bone'], spec['meet'], t)
    dc, dm = closed - a, meet - a
    lc, lm = dc.length, dm.length
    axis = dc.cross(dm)
    rot = Matrix.Rotation(dc.angle(dm) * u, 3, axis.normalized()) if axis.length > 1e-9 else Matrix.Identity(3)
    return a, a + (rot @ dc.normalized()) * (lc + (lm - lc) * u)


def spans(S):
    out = {n: [] for n in SPECS}
    for f in range(0, FL.FRAMES + 1):
        t = f / FL.FPS
        W = S.bones(t)
        cw = S.carriers(t, W)
        for n, spec in SPECS.items():
            a, b = ends(spec, t, W, cw)
            out[n].append((b - a).length)
    return out


def reset():
    for o in list(bpy.data.objects):
        if o.get(K.TAG) and o.name.startswith(('bone.link.', 'robot.linkage.')):
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)


def build(S):
    """Fit and build every brace's stages and pins (nodes `bone.link.<name>.*`)."""
    reset()
    K.collection(COLL, K.collection('ROADSTER'))
    definitions()
    bind(S)
    sp = spans(S)
    report = {}
    for name, spec in SPECS.items():
        L = spec['length']
        high = max(sp[name])
        count = max(2, math.ceil((high - L) / (L * 0.86)) + 1)
        spec['stages'] = count
        report[name] = {'closed': round(L, 3), 'min': round(min(sp[name]), 3), 'max': round(high, 3), 'stages': count}
        r0 = spec['radius']
        for i in range(count):
            node = K.node('link.%s.stage.%d' % (name, i), COLL, size=0.04)
            m = K.Mesh()
            r = r0 * 0.84 ** i
            if i < count - 1:
                m.lathe([(0.0, r * 0.80), (0.0, r), (0.012, r * 1.10), (L - 0.012, r * 1.10), (L, r), (L, r * 0.80)],
                        'graphite' if i == 0 else 'gunmetal', (0, 0, 0), (0, 0, 1), 32, ring=True)
                for z in (0.010, L - 0.022):
                    m.lathe([(z, r * 1.08), (z, r * 1.22), (z + 0.012, r * 1.22), (z + 0.012, r * 1.08)], 'bronze',
                            (0, 0, 0), (0, 0, 1), 32, ring=True)
            else:
                m.lathe([(0.0, r), (L - 0.01, r), (L, r * 0.7)], 'chrome', (0, 0, 0), (0, 0, 1), 32)
            m.build('robot.linkage.%s.stage.%d' % (name, i), COLL, parent=node, rest=Matrix.Identity(4), bevel=0.0008)
        for end in ('A', 'B'):
            node = K.node('link.%s.pin.%s' % (name, end), COLL, size=0.04)
            m = K.Mesh()
            r = r0 * 1.15
            m.lathe([(-r * 1.2, 0.0), (-r * 1.2, r), (r * 1.2, r), (r * 1.2, 0.0)], 'graphite', (0, 0, 0), (1, 0, 0), 32)
            m.lathe([(-r * 1.4, 0.0), (-r * 1.4, r * 0.32), (r * 1.4, r * 0.32), (r * 1.4, 0.0)], 'bronze', (0, 0, 0),
                    (1, 0, 0), 20)
            m.build('robot.linkage.%s.pin.%s' % (name, end), COLL, parent=node, rest=Matrix.Identity(4), bevel=0.0008)
    return report


def frame(axis, ref):
    """The pieces' rotation: z along the brace, x the bone's reference axis made square
    to it. Tied to the limb, it turns continuously with the brace (a shortest arc from
    a fixed axis flips as the brace swings past that axis's opposite)."""
    x = (ref - axis * ref.dot(axis)).normalized()
    return Matrix((x, axis.cross(x), axis)).transposed()


def worlds(t, W, cw):
    """Every brace node's body-frame world at time t: the stages spread evenly
    between the pins (all coincide when closed), each grown with its chain."""
    out = {}
    for name, spec in SPECS.items():
        if 'stages' not in spec:
            continue
        a, b = ends(spec, t, W, cw)
        d = b - a
        span = d.length
        axis = d / max(span, 1e-6)
        k = C.growth(spec['bone'], t)
        R = frame(axis, W[spec['bone']].to_3x3() @ spec['ref']).to_4x4() @ Matrix.Diagonal((k, k, k, 1.0))
        n = spec['stages']
        Lk = spec['length'] * k
        step = min(Lk, max(0.0, (span - Lk) / (n - 1)))
        for i in range(n):
            out['link.%s.stage.%d' % (name, i)] = Matrix.Translation(a + axis * (i * step)) @ R
        out['link.%s.pin.A' % name] = Matrix.Translation(a) @ R
        out['link.%s.pin.B' % name] = Matrix.Translation(b) @ R
    return out


def rekey():
    """Rebuild and key only the braces on the baked timeline: the flight transform of
    each frame is taken from the baked pelvis (F = pelvis_baked @ W_pelvis^-1), so
    every other track stays as it is."""
    from . import bake as B
    sc = bpy.context.scene
    f_user = sc.frame_current
    pelvis = []
    for f in range(FL.FRAMES + 1):
        sc.frame_set(f)
        pelvis.append(bpy.data.objects['bone.robot.pelvis'].matrix_world.copy())
    S = B.Scene()
    report = build(S)
    frames = list(range(FL.FRAMES + 1))
    mats = {}
    for f in frames:
        t = f / FL.FPS
        W = S.bones(t)
        F = pelvis[f] @ W['pelvis'].inverted()
        for key, M in worlds(t, W, S.carriers(t, W)).items():
            mats.setdefault(key, []).append(F @ M)
    for key, ms in mats.items():
        B._keys(bpy.data.objects['bone.' + key], frames, ms)
    sc.frame_set(f_user)
    return report
