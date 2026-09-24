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


def world(T, skel):
    """Bone world matrices and the local pose at T. Root, pitch, feet and hip slide follow a
    Catmull-Rom curve through the keys (no stop at a key); joint poses blend with a C1 ramp
    per segment that keeps half speed at the keys."""
    K = _keys()
    T = max(0.0, min(1.0, T))
    i = max(k for k in range(len(K) - 1) if K[k][0] <= T) if T < 1.0 else len(K) - 2
    k0, k1 = K[i], K[i + 1]
    km, k2 = K[max(0, i - 1)], K[min(len(K) - 1, i + 2)]
    u = (T - k0[0]) / (k1[0] - k0[0])
    pos = _cr(V(*km[1]), V(*k0[1]), V(*k1[1]), V(*k2[1]), u)
    pitch = _cr(km[2], k0[2], k1[2], k2[2], u)
    slide = _cr(km[5], k0[5], k1[5], k2[5], u)
    ft = _cr(V(*km[4]), V(*k0[4]), V(*k1[4]), V(*k2[4]), u)
    ub = 0.5 * u + 0.5 * _ease(u)
    P = _blend(k0[3], k1[3], ub, skel.names)
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
