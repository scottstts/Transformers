"""Skeleton choreography, T = 0 (truck) -> 1 (robot): the knight's rise.

The robot sits upright in the cab with its legs straight back along the rails.
  kneel-up  the thighs swing up about the knees (the shins stay on the road on
            their drive wheels), carrying the cab up and back into a tall kneel
  lunge     the right leg swings through under the body and plants its foot
            ahead: a knight's kneel
  rise      the body rises over the front foot; the left knee lifts and the
            left foot steps through beside the right
  settle    the stance, arms at the sides

Keys hold the root (pelvis joint), the free joints, per-leg ankle targets,
knee poles and foot attitudes; the legs are solved every frame, so a planted
foot never slides. Tracks are time-aware monotone Hermite curves: keys are
passed through without stopping and nothing overshoots.
"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from .kit import V
from . import dims as D

STANCE_X = 1.04                 # planted hero stance, clear inner-leg negative space
STAND_S = 4.35                  # standing station (pelvis over the ankles)
STAND_CROUCH = 0.07


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def solve_limb(W_parent, target, L1, L2, pole, bend=1):
    """Two-bone IK. W_parent: world matrix of the upper joint's frame. pole: the world
    direction the limb's front (-Y local) faces. bend = +1 for a leg (the lower bone
    folds back, the knee leads), -1 for an arm (the lower bone folds forward, the elbow
    trails). Returns (upper bone local quat, lower joint flexion rad)."""
    Hi = W_parent.inverted()
    t = Hi @ target
    p = (Hi.to_3x3() @ pole).normalized()
    Dd = min(t.length, L1 + L2 - 1e-5)
    Dd = max(Dd, abs(L1 - L2) + 1e-4)
    d = t.normalized()
    a = math.acos(max(-1.0, min(1.0, (L1 * L1 + Dd * Dd - L2 * L2) / (2 * L1 * Dd))))
    knee = math.pi - math.acos(max(-1.0, min(1.0, (L1 * L1 + L2 * L2 - Dd * Dd) / (2 * L1 * L2))))
    side = d.cross(p)
    if side.length < 1e-6:
        side = Vector((1, 0, 0))
    side.normalize()
    upper = (Quaternion(side, a * bend) @ d).normalized()
    z = -upper
    x = -side
    y = z.cross(x)
    R = Matrix((x, y, z)).transposed()
    return R.to_quaternion(), knee


def _blend(P0, P1, u, names):
    P = {}
    for n in names:
        q0, s0 = P0.get(n, (Quaternion(), Vector()))
        q1, s1 = P1.get(n, (Quaternion(), Vector()))
        P[n] = (q0.slerp(q1, u), s0.lerp(s1, u))
    return P


DOWN = (0.0, 0.0, -1.0)
FWD = (0.0, 1.0, 0.0)            # design (x, f, z)


def _keys():
    """Keys: dict(T, root (x, f, z), pitch deg (+ leans forward), pose, ankles L/R (x, f, z),
    foot pitch L/R deg (world, +90 = toes down, the truck attitude), knee poles L/R (x, f, z),
    hip tuck)."""
    from . import fold, stand, rig
    Pf = fold.pose()
    Ps = stand.pose()
    names = set(Pf) | set(Ps)
    # arms out: the carriages slide back and out, the arms swing out through the door openings
    Pout = dict(Pf)
    for S, s in (('L', 1), ('R', -1)):
        Pout['clav.' + S] = (Quaternion(), Vector())
        Pout['upperarm.' + S] = (q(-20, -s * 38, 0), Vector())
        Pout['forearm.' + S] = (q(-55, 0, 0), Vector())
    Pout['neck'] = (Quaternion(), Vector((0, 0, -fold.NECK_TUCK * 0.6)))
    Pkneel = _blend(Pout, Ps, 0.35, names)
    for S, s in (('L', 1), ('R', -1)):
        Pkneel['upperarm.' + S] = (q(-10, -s * 30, 0), Vector())      # arms out for balance
    Prise = _blend(Pkneel, Ps, 0.7, names)
    ax, af, az = fold.feet()
    fk = D.f(fold.KNEE_S)
    kneel_z = fold.PELVIS_Z + rig.THIGH
    fs = D.f(STAND_S)
    stand_z = rig.HIP_Z - STAND_CROUCH
    feet0 = (ax, af, az)
    feet0R = (-ax, af, az)
    footS = (STANCE_X, fs + 0.05, rig.ANKLE_Z)
    return [
        dict(T=0.00, root=(0, D.f(fold.PELVIS_S), fold.PELVIS_Z), pitch=0.0, pose=Pf, L=feet0, R=feet0R,
             pL=90.0, pR=90.0, kL=DOWN, kR=DOWN, tuck=fold.HIP_TUCK),
        dict(T=0.12, root=(0, fk + 1.80 * math.cos(math.radians(10)), fold.PELVIS_Z + 1.80 * math.sin(math.radians(10))), pitch=-3.0, pose=_blend(Pf, Pout, 0.4, names),
             L=feet0, R=feet0R, pL=90.0, pR=90.0, kL=DOWN, kR=DOWN, tuck=fold.HIP_TUCK),
        # kneel-up: hips arc over the knees, the shins stay on the road
        dict(T=0.28, root=(0, fk + 1.80 * math.cos(math.radians(48)), fold.PELVIS_Z + 1.80 * math.sin(math.radians(48))), pitch=-4.0, pose=Pout, L=feet0, R=feet0R,
             pL=90.0, pR=90.0, kL=(0, 0.5, -1.0), kR=(0, 0.5, -1.0), tuck=fold.HIP_TUCK * 0.7),
        dict(T=0.40, root=(0, fk, kneel_z), pitch=0.0, pose=Pkneel, L=feet0, R=feet0R,
             pL=90.0, pR=90.0, kL=FWD, kR=FWD, tuck=fold.HIP_TUCK * 0.4),
        # lunge: the right foot swings through under the body and plants ahead
        dict(T=0.47, root=(0, fk + 0.05, kneel_z - 0.10), pitch=4.0, pose=Pkneel, L=feet0,
             R=(-(STANCE_X - 0.10), fk - 0.60, 1.10), pL=90.0, pR=40.0, kL=FWD, kR=FWD, tuck=0.0),
        dict(T=0.56, root=(0, fk + 0.25, kneel_z - 0.05), pitch=6.0, pose=Pkneel, L=feet0,
             R=(-STANCE_X, fs + 0.05, rig.ANKLE_Z), pL=90.0, pR=0.0, kL=FWD, kR=FWD, tuck=0.0),
        # rise over the front foot; the left knee lifts, the left foot steps through
        dict(T=0.70, root=(0, fs - 0.35, stand_z - 0.85), pitch=10.0, pose=Prise, L=(ax + 0.2, fk - 0.10, 1.25),
             R=(-STANCE_X, fs + 0.05, rig.ANKLE_Z), pL=45.0, pR=0.0, kL=FWD, kR=FWD, tuck=0.0),
        dict(T=0.84, root=(0, fs - 0.05, stand_z - 0.12), pitch=3.0, pose=_blend(Prise, Ps, 0.7, names), L=footS,
             R=(-STANCE_X, fs + 0.05, rig.ANKLE_Z), pL=0.0, pR=0.0, kL=FWD, kR=FWD, tuck=0.0),
        dict(T=1.00, root=(0, fs, stand_z), pitch=0.0, pose=Ps, L=footS, R=(-STANCE_X, fs + 0.05, rig.ANKLE_Z),
             pL=0.0, pR=0.0, kL=FWD, kR=FWD, tuck=0.0),
    ]


_K = []


def keys():
    if not _K:
        _K.extend(_keys())
    return _K


def _track(times, values, i, u):
    """Time-aware monotone Hermite: shared velocities, no recoil out of holds."""
    h = [b - a for a, b in zip(times, times[1:])]
    d = [(b - a) / dt for a, b, dt in zip(values, values[1:], h)]

    def slope(k):
        if k == 0 or k == len(values) - 1:
            return 0.0
        if d[k - 1] * d[k] <= 0:
            return 0.0
        w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
        return (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])

    a, b = values[i:i + 2]
    return ((2*u**3 - 3*u*u + 1)*a + (u**3 - 2*u*u + u)*h[i]*slope(i)
            + (-2*u**3 + 3*u*u)*b + (u**3 - u*u)*h[i]*slope(i + 1))


def _vec(K, times, key, i, u):
    return Vector([_track(times, [k[key][c] for k in K], i, u) for c in range(3)])


def _pose_track(K, times, i, u, names):
    out = {}
    for name in names:
        keys_ = [k['pose'].get(name, (Quaternion(), Vector())) for k in K]
        rotations = [qq.copy() for qq, _ in keys_]
        for j in range(1, len(rotations)):
            if rotations[j - 1].dot(rotations[j]) < 0:
                rotations[j].negate()
        rotation = Quaternion([_track(times, [qq[c] for qq in rotations], i, u) for c in range(4)])
        rotation.normalize()
        shift = Vector([_track(times, [s[c] for _, s in keys_], i, u) for c in range(3)])
        out[name] = (rotation, shift)
    return out


def world(T, skel):
    """Bone worlds (and the local pose) at T."""
    from . import rig
    K = keys()
    T = max(0.0, min(1.0, T))
    i = max(k for k in range(len(K) - 1) if K[k]['T'] <= T) if T < 1.0 else len(K) - 2
    u = (T - K[i]['T']) / (K[i + 1]['T'] - K[i]['T'])
    times = [k['T'] for k in K]
    x, f, z = _vec(K, times, 'root', i, u)
    pitch = _track(times, [k['pitch'] for k in K], i, u)
    tuck = _track(times, [k['tuck'] for k in K], i, u)
    P = _pose_track(K, times, i, u, skel.names)
    root = Matrix.Translation(V(x, f, z)) @ Matrix.Rotation(math.radians(pitch), 4, 'X')
    for S, s in (('L', 1), ('R', -1)):
        P['hip.' + S] = (Quaternion(), Vector((-s * tuck, 0, 0)))
    W = skel.fk(P, root)
    for S, s in (('L', 1), ('R', -1)):
        a = _vec(K, times, S, i, u)
        target = V(a.x * s if S == 'L' else a.x, a.y, a.z)
        kp = _vec(K, times, 'k' + S, i, u)
        pole = V(kp.x, kp.y, kp.z).normalized()
        qt, knee = solve_limb(W['hip.' + S], target, rig.THIGH, rig.SHIN, pole, 1)
        P['thigh.' + S] = (qt, Vector())
        P['shin.' + S] = (q(math.degrees(knee)), Vector())
    W = skel.fk(P, root)
    for S in ('L', 'R'):
        pitch_f = _track(times, [k['p' + S] for k in K], i, u)
        wrot = Matrix.Rotation(math.radians(pitch_f), 4, 'X').to_quaternion()
        P['foot.' + S] = (W['shin.' + S].to_quaternion().inverted() @ wrot, Vector())
    return skel.fk(P, root), P
