"""Skeleton choreography, T = 0 (car) -> 1 (robot). (IK core; tracks below.)"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from .kit import V


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def solve_leg(W_hip, target, L1, L2, pole):
    """Two-bone IK. W_hip: world matrix of the joint's parent frame at the joint.
    Returns (upper bone local quat, lower joint flexion rad). The upper bone's
    frame: -Z along the bone, -Y (forward) toward the pole."""
    Hi = W_hip.inverted()
    t = Hi @ target
    p = (Hi.to_3x3() @ pole).normalized()
    D = min(t.length, L1 + L2 - 1e-5)
    D = max(D, abs(L1 - L2) + 1e-4)
    d = t.normalized()
    a = math.acos(max(-1.0, min(1.0, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))))
    knee = math.pi - math.acos(max(-1.0, min(1.0, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))))
    side = d.cross(p)
    if side.length < 1e-6:
        side = Vector((1, 0, 0))
    side.normalize()
    thigh_dir = (Quaternion(side, a) @ d).normalized()
    # the hinge axis comes from the leg plane (hip -> target, pole), never from the pole against
    # the thigh: that degenerates when the thigh lines up with the pole and flips the twist
    z = -thigh_dir
    x = -side
    y = z.cross(x)
    R = Matrix((x, y, z)).transposed()
    return R.to_quaternion(), knee


# ------------------------------------------------------------------ get-up
# The robot lies face up in the car. It sits up about the hips while the knees
# draw the feet (the front-wing halves) back under it into a crouch, then rises
# to the stand. Keys hold the root (pelvis) and the free joints; the legs are
# solved every frame so the planted feet never slide once they are down.

STANCE_X = 0.36                  # foot spacing in the stand (heroic, wider than the hips)
FOOT_PLANT_F = 1.19              # feet planted here from the crouch on: just behind the hips, so the
                                 # body's mass (the backpack behind the spine) sits over the soles


def _ease(u):
    u = max(0.0, min(1.0, u))
    return u * u * u * (u * (u * 6 - 15) + 10)


def _keys():
    """[(T, root_pos (x, f, z), pitch deg (0 = upright, -90 = lying face up), pose, feet (x, f, z), hip_slide)].
    Sit up about the hips with the legs still out along the car floor, draw the feet in to a
    crouch, rise, settle. Keys are passed through without stopping (see world())."""
    from . import fold, stand, rig
    P0 = fold.pose()
    Pf = {n: v for n, v in P0.items() if not n.startswith(('thigh', 'shin', 'foot'))}
    Ps = dict(stand.pose())
    ax, af, az = fold.ANKLE
    feet0 = (ax, af, az)
    feetS = (ax + 0.07, af, az)             # the feet part before they move: the nose-tip halves never cross
    Pc = {}
    for S, s in (('L', 1), ('R', -1)):
        Pc['upperarm.' + S] = (q(-78, -s * 12, 0), Vector())         # arms raised forward, above the knees and wheels
        Pc['forearm.' + S] = (q(-24, 0, 0), Vector())
        for fn in rig.FINGERS:
            for k in range(3):
                Pc['%s%d.%s' % (fn, k + 1, S)] = (q(0, s * (40, 50, 30)[k], 0), Vector())
    Pc['neck'] = (q(-10), Vector())
    Pc['spine'] = (q(12), Vector())
    names = set(Pf) | set(Pc) | set(Ps)
    Psit = _blend(Pf, Pc, 0.85, names)           # arms leave the thighs early
    Prise = _blend(Pc, Ps, 0.65, names)
    feet1 = (STANCE_X, FOOT_PLANT_F, rig.ANKLE_Z)
    PF, PZ = fold.PELVIS_F, fold.PELVIS_Z
    return [
        (0.00, (0, PF, PZ), -90.0, Pf, feet0, fold.HIP_TUCK),
        (0.05, (0, PF, PZ), -90.0, Pf, feet0, fold.HIP_TUCK),
        # the torso starts up with the arms still along it: they rise only once the sidepods and
        # cockpit panels over them have swung clear
        (0.22, (0, PF + 0.02, PZ + 0.04), -58.0, Pf, feetS, fold.HIP_TUCK * 0.7),
        (0.36, (0, PF + 0.05, PZ + 0.10), -24.0, Psit, feetS, fold.HIP_TUCK * 0.4),
        (0.56, (0, 0.80, 1.00), 12.0, Pc, feet1, 0.0),
        (0.76, (0, 1.12, 1.74), 8.0, Prise, feet1, 0.0),
        (1.00, (0, rig.ROBOT_F, rig.HIP_Z - STAND_CROUCH), 0.0, Ps, feet1, 0.0),
    ]


def _blend(P0, P1, u, names):
    P = {}
    for n in names:
        q0, s0 = P0.get(n, (Quaternion(), Vector()))
        q1, s1 = P1.get(n, (Quaternion(), Vector()))
        P[n] = (q0.slerp(q1, u), s0.lerp(s1, u))
    return P


STAND_CROUCH = 0.05


def K_FOOT_TUCK(T):
    """Feet telescope out of the shins while the legs lie on the car floor."""
    from . import fold
    return fold.FOOT_TUCK * (1.0 - _ease((T - 0.10) / 0.16))


def _cr(p0, p1, p2, p3, u):
    """Catmull-Rom between p1 and p2 (scalars or Vectors)."""
    u2, u3 = u * u, u * u * u
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)


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


def _pose_track(K, times, i, u, names):
    out = {}
    for name in names:
        keys = [k[3].get(name, (Quaternion(), Vector())) for k in K]
        rotations = [q.copy() for q, _ in keys]
        for j in range(1, len(rotations)):
            if rotations[j - 1].dot(rotations[j]) < 0:
                rotations[j].negate()
        rotation = Quaternion([_track(times, [q[c] for q in rotations], i, u) for c in range(4)])
        rotation.normalize()
        shift = Vector([_track(times, [s[c] for _, s in keys], i, u) for c in range(3)])
        out[name] = (rotation, shift)
    return out


def world(T, skel):
    """Bone worlds with continuous, time-aware tracks and exact authored holds."""
    K = _keys()
    T = max(0.0, min(1.0, T))
    i = max(k for k in range(len(K) - 1) if K[k][0] <= T) if T < 1.0 else len(K) - 2
    k0, k1 = K[i], K[i + 1]
    u = (T - k0[0]) / (k1[0] - k0[0])
    times = [k[0] for k in K]
    pos = V(*[_track(times, [k[1][c] for k in K], i, u) for c in range(3)])
    pitch = _track(times, [k[2] for k in K], i, u)
    slide = _track(times, [k[5] for k in K], i, u)
    ft = V(*[_track(times, [k[4][c] for k in K], i, u) for c in range(3)])
    P = _pose_track(K, times, i, u, skel.names)
    root = Matrix.Translation(pos) @ Matrix.Rotation(math.radians(pitch), 4, 'X')
    # feet lift clear of the ground while they travel in
    lift = 0.30 * math.sin(math.pi * u) ** 2 if (k0[4] != k1[4]) else 0.0     # soft lift-off and touch-down
    ft = ft + Vector((0, 0, lift))
    for S, s in (('L', 1), ('R', -1)):
        P['hip.' + S] = (Quaternion(), Vector((-s * slide, 0, 0)))
    W = skel.fk(P, root)
    # knee pole: pelvis front blended with pelvis up -- never parallel to the thigh, whether the
    # leg hangs (projects to the front), lies along the body or sits forward (projects to up)
    R3 = W['pelvis'].to_3x3()
    front = (R3 @ Vector((0, -1, 0)) + R3 @ Vector((0, 0, 1))).normalized()
    from . import rig
    for S, s in (('L', 1), ('R', -1)):
        target = Vector((s * ft.x, ft.y, ft.z))
        qt, knee = solve_leg(W['hip.' + S], target, rig.THIGH, rig.SHIN, front)
        P['thigh.' + S] = (qt, Vector())
        P['shin.' + S] = (q(math.degrees(knee)), Vector())
    W = skel.fk(P, root)
    tuck = K_FOOT_TUCK(T)
    for S in ('L', 'R'):
        P['foot.' + S] = (W['shin.' + S].to_quaternion().inverted(), Vector((0, 0, tuck)))     # soles stay level
    return skel.fk(P, root), P


def tracks():
    return {}
