"""Skeleton choreography, T = 0 (car) -> 1 (robot): the gargoyle rise.

The robot crouches low and wide inside the car (fold.py). Everything happens
on the ground, and the body only ever rises.
  plant     the feet drop to the ground and the fists press down, taking the
            car's weight; the wheels then draw up on their arms
  spread    the hips lift, the knees splay, each foot steps out wide in turn
            (one planted while the other moves)
  crouch    Batman's gargoyle crouch: fists still planted between the knees,
            torso pitched far forward, head up
  rise      the fists leave the ground and the robot stands up out of the
            crouch, torso rolling upright, arms coming to the sides

Keys hold the root (pelvis joint), the free joints, per-leg ankle targets and
knee poles, the planted wrists (arm IK weight) and elbow poles, and the leg
and arm telescoping; limbs are solved every frame, so a planted foot or fist
never slides. Tracks are time-aware monotone Hermite curves: keys are passed
through without stopping and nothing overshoots. The ground is z = 0 in the
key frame throughout (the bake's lift keeps the lowest point on it).
"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from .kit import V
from . import dims as D

STANCE_X = 0.86                 # planted hero stance, clear inner-leg negative space
STAND_F = -0.74                 # standing station (pelvis over the ankles)
FOOT_F = -0.72                  # planted feet station
STAND_CROUCH = 0.06


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def solve_limb(W_parent, target, L1, L2, pole, bend=1):
    """Two-bone IK. W_parent: world matrix of the upper joint's frame. pole: the world
    direction the limb's front (-Y local) faces. bend = +1 for a leg (the lower bone
    folds back, the knee leads), -1 for an arm. Returns (upper bone local quat, lower
    joint flexion rad)."""
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


FWD = (0.0, 1.0, 0.0)            # design (x, f, z)


def _keys():
    from . import fold, stand, rig
    Pf = fold.pose()
    Ps = stand.pose()
    names = set(Pf) | set(Ps)
    # spread: the waist and chest open up, the head lifts
    Pspread = _blend(Pf, Ps, 0.30, names)
    Pspread['spine'] = (q(9), Vector((0, 0, -fold.SPINE_IN * 0.5)))
    Pspread['chest'] = (q(5), Vector((0, 0, -fold.CHEST_IN * 0.5)))
    Pspread['neck'] = (q(-5), Vector((0, 0, -fold.NECK_TUCK * 0.4)))
    for S in ('L', 'R'):
        Pspread['clav.' + S] = (Quaternion(), Vector())
    # the gargoyle crouch: back rounded over the planted fists, head up, looking ahead
    Pcrouch = _blend(Pspread, Ps, 0.3, names)
    Pcrouch['spine'] = (q(10), Vector())
    Pcrouch['chest'] = (q(8), Vector())
    Pcrouch['neck'] = (q(-38), Vector())
    for S in ('L', 'R'):
        Pcrouch['toe.' + S] = (Quaternion(), Vector())
    Prise = _blend(Pcrouch, Ps, 0.6, names)
    Prise['neck'] = (q(-12), Vector())
    for S, s in (('L', 1), ('R', -1)):
        Prise['upperarm.' + S] = (q(-8, -s * 20, 0), Vector())
        Prise['forearm.' + S] = (q(-30, 0, 0), Vector())
    r0 = fold.root_pos()
    stand_z = rig.HIP_Z - STAND_CROUCH
    AZ = rig.ANKLE_Z
    carL, carR = fold.ankle(1), fold.ankle(-1)
    downL, downR = (carL[0], carL[1], AZ), (carR[0], carR[1], AZ)            # the feet planted on the ground
    wideL, wideR = (STANCE_X, FOOT_F, AZ), (-STANCE_X, FOOT_F, AZ)
    midL = ((carL[0] + STANCE_X) / 2, (carL[1] + FOOT_F) / 2, AZ + 0.16)
    midR = (-(carL[0] + STANCE_X) / 2, (carL[1] + FOOT_F) / 2, AZ + 0.16)
    w0 = fold.wrist(1)
    wg = (w0[0], w0[1], 0.15)                                                # fists pressed to the ground
    kp0 = fold.KNEE_POLE
    kpw = (1.00, 0.20, 0.05)          # the crouch's knees splay wide: the arms go down inside them
    ep0 = fold.ELBOW_POLE
    epm = (-1.0, 0.0, -0.10)          # the elbows swing round outward (the arms' fronts turn through inward)
    epc = (0.10, 1.00, -0.10)
    return [
        dict(T=0.00, root=r0, pitch=fold.PITCH, pose=Pf, L=carL, R=carR, k=kp0, H=w0, hw=1.0, e=ep0, arm=1.0, tele=1.0),
        dict(T=0.10, root=r0, pitch=fold.PITCH, pose=Pf, L=downL, R=downR, k=kp0, H=wg, hw=1.0, e=ep0, arm=1.0, tele=1.0),
        dict(T=0.24, root=(0, r0[1] + 0.03, r0[2] + 0.14), pitch=fold.PITCH - 3, pose=_blend(Pf, Pspread, 0.5, names), L=downL, R=downR,
             k=kpw, H=wg, hw=1.0, e=ep0, arm=0.6, tele=0.4),
        dict(T=0.31, root=(0, r0[1] + 0.05, r0[2] + 0.20), pitch=fold.PITCH - 4, pose=_blend(Pf, Pspread, 0.7, names), L=midL, R=downR,
             k=kpw, H=wg, hw=1.0, e=epm, arm=0.4, tele=0.0),
        dict(T=0.38, root=(0, r0[1] + 0.07, r0[2] + 0.25), pitch=fold.PITCH - 6, pose=Pspread, L=wideL, R=downR,
             k=kpw, H=wg, hw=1.0, e=epc, arm=0.25, tele=0.0),
        dict(T=0.45, root=(0, r0[1] + 0.09, r0[2] + 0.30), pitch=fold.PITCH - 8, pose=_blend(Pspread, Pcrouch, 0.5, names), L=wideL, R=midR,
             k=kpw, H=wg, hw=1.0, e=epc, arm=0.1, tele=0.0),
        dict(T=0.52, root=(0, STAND_F + 0.02, r0[2] + 0.50), pitch=fold.PITCH - 12, pose=Pcrouch, L=wideL, R=wideR,
             k=FWD, H=wg, hw=1.0, e=epc, arm=0.0, tele=0.0),
        dict(T=0.66, root=(0, STAND_F + 0.01, 1.95), pitch=38.0, pose=Prise, L=wideL, R=wideR, k=FWD, H=wg, hw=0.0, e=epc, arm=0.0, tele=0.0),
        dict(T=0.83, root=(0, STAND_F, stand_z - 0.18), pitch=12.0, pose=_blend(Prise, Ps, 0.6, names), L=wideL, R=wideR, k=FWD, H=wg,
             hw=0.0, e=epc, arm=0.0, tele=0.0),
        dict(T=1.00, root=(0, STAND_F, stand_z), pitch=0.0, pose=Ps, L=wideL, R=wideR, k=FWD, H=wg, hw=0.0, e=epc, arm=0.0, tele=0.0),
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


def _scalar(K, times, key, i, u):
    return _track(times, [k[key] for k in K], i, u)


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


def _seg(T):
    K = keys()
    T = max(0.0, min(1.0, T))
    i = max(k for k in range(len(K) - 1) if K[k]['T'] <= T) if T < 1.0 else len(K) - 2
    u = (T - K[i]['T']) / (K[i + 1]['T'] - K[i]['T'])
    return K, [k['T'] for k in K], i, u


def air(T):
    """Height of the lowest point above the ground: the gargoyle rise never leaves it."""
    return 0.0


def _arm_ik(skel, W, P, S, target, pole, L1, L2):
    """Solve the arm to put the wrist on `target`; returns (upperarm local quat, elbow flexion rad)."""
    Wj = W['clav.' + S] @ Matrix.Translation(skel.offset['upperarm.' + S] + P['upperarm.' + S][1])
    qu, bend = solve_limb(Wj, target, L1, L2, pole, -1)     # the forearm folds to the arm's front (the pole)
    return qu, bend


_CACHE = {}


def world(T, skel):
    """Bone worlds (and the local pose) at T."""
    key = (round(T, 9), id(skel))
    hit = _CACHE.get(key)
    if hit is not None:
        return hit
    from . import rig
    from .robot_legs import TELE
    from .robot_arms import ARM_TELE
    K, times, i, u = _seg(T)
    x, f, z = _vec(K, times, 'root', i, u)
    pitch = _scalar(K, times, 'pitch', i, u)
    tele = TELE * max(0.0, min(1.0, _scalar(K, times, 'tele', i, u)))
    atele = ARM_TELE * max(0.0, min(1.0, _scalar(K, times, 'arm', i, u)))
    hw = max(0.0, min(1.0, _scalar(K, times, 'hw', i, u)))
    P = _pose_track(K, times, i, u, skel.names)
    root = Matrix.Translation(V(x, f, z)) @ Matrix.Rotation(math.radians(pitch), 4, 'X')
    for S in ('L', 'R'):
        P['hip.' + S] = (Quaternion(), Vector())
        P['shin.' + S] = (Quaternion(), Vector((0, 0, tele)))
        P['foot.' + S] = (Quaternion(), Vector((0, 0, tele)))
        P['forearm.' + S] = (P['forearm.' + S][0], Vector((0, 0, atele)))
    W = skel.fk(P, root)
    kp = _vec(K, times, 'k', i, u)
    ep = _vec(K, times, 'e', i, u)
    h = _vec(K, times, 'H', i, u)
    for S, s in (('L', 1), ('R', -1)):
        a = _vec(K, times, S, i, u)
        target = V(a.x, a.y, a.z)
        pole = V(kp.x * s, kp.y, kp.z).normalized()
        qt, knee = solve_limb(W['hip.' + S], target, rig.THIGH - tele, rig.SHIN - tele, pole, 1)
        P['thigh.' + S] = (qt, Vector())
        P['shin.' + S] = (q(math.degrees(knee)), Vector((0, 0, tele)))
        if hw > 0.0:
            qa, bend = _arm_ik(skel, W, P, S, V(h.x * s, h.y, h.z), V(ep.x * s, ep.y, ep.z).normalized(), rig.UPPER - atele, rig.FORE)
            q_up0, s_up = P['upperarm.' + S]
            q_fo0, s_fo = P['forearm.' + S]
            q_fo = q(-math.degrees(bend))                       # elbow flexion folds the forearm forward
            if q_up0.dot(qa) < 0:
                qa.negate()
            if q_fo0.dot(q_fo) < 0:
                q_fo.negate()
            P['upperarm.' + S] = (q_up0.slerp(qa, hw), s_up)
            P['forearm.' + S] = (q_fo0.slerp(q_fo, hw), s_fo)
    W = skel.fk(P, root)
    for S in ('L', 'R'):
        P['foot.' + S] = (W['shin.' + S].to_quaternion().inverted(), Vector((0, 0, tele)))       # feet flat, toes ahead
    out = (skel.fk(P, root), P)
    if len(_CACHE) > 4096:
        _CACHE.clear()
    _CACHE[key] = out
    return out
