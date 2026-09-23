"""Skeleton choreography, T = 0 (truck) -> 1 (robot).

Body mechanics, not keyframed flourish: the robot lies on its back in the truck
with its feet in the nose. It rises about its planted feet like a drawbridge:
the hips lift the torso off the floor, the pelvis swings up an arc about the
ankles with the legs nearly straight and the torso leaning into the rise, then
settles upright over the feet. Knees stay inside ~40 deg and hips inside ~30 deg
so the limb armour (door / pod, windshield / hood) never sweeps through itself.

Channels are scalar tuples keyed on T with shape-preserving cubic interpolation
(no overshoot between keys). Legs are solved by IK to ankle targets with the
feet held world-level (they already are at the fold). The first key of every
channel reproduces the fold pose exactly, the last one the stand pose.
Per-side channels are authored for L and mirrored.
"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from .kit import V
from . import rig, fold, stand

STAND_CROUCH = 0.08       # idle stance: pelvis this far below the straight-leg hip height


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


# --------------------------------------------------------------- interpolation

def _monotone(keys, T):
    n = len(keys)
    if T <= keys[0][0]:
        return list(keys[0][1])
    if T >= keys[-1][0]:
        return list(keys[-1][1])
    i = 0
    while keys[i + 1][0] < T:
        i += 1
    t0, v0 = keys[i]
    t1, v1 = keys[i + 1]
    h = t1 - t0
    u = (T - t0) / h
    tp, vp = keys[i - 1] if i > 0 else (t0 - h, v0)
    tn, vn = keys[i + 2] if i + 2 < n else (t1 + h, v1)
    out = []
    for k in range(len(v0)):
        d0 = (v0[k] - vp[k]) / (t0 - tp)
        d1 = (v1[k] - v0[k]) / h
        d2 = (vn[k] - v1[k]) / (tn - t1)
        m0 = 0.0 if d0 * d1 <= 0 else 2 * d0 * d1 / (d0 + d1)
        m1 = 0.0 if d1 * d2 <= 0 else 2 * d1 * d2 / (d1 + d2)
        u2, u3 = u * u, u * u * u
        out.append((2 * u3 - 3 * u2 + 1) * v0[k] + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1[k] + (u3 - u2) * h * m1)
    return out


# --------------------------------------------------------------------- tracks

def fold_ankle():
    sk = rig.Skeleton()
    W = sk.fk(fold.pose(), fold.root_matrix())
    a = W['foot.L'].translation
    return (a.x, -a.y, a.z)


def tracks():
    fa = fold_ankle()
    dx, df = fold.SHOULDER_FOLD
    yaw0 = math.degrees(math.atan2(df, dx))
    hand = (1.42, -1.62, 0.50)                         # wrist target while the fists push off
    phi0, r0 = rise_start()
    r1 = rig.HIP_Z - STAND_CROUCH - rig.ANKLE_Z
    return {
        # pelvis on an arc about the ankles: elevation (deg), hip-ankle reach (m), torso lean into the rise (deg)
        # legs stay straight (reach r0) until the thigh and shin armour has docked, then settle into the stance
        'rise': [(0.00, (phi0, r0, 0.0)), (0.30, (phi0, r0, 0.0)), (0.38, (13.0, r0, 2.0)),
                 (0.48, (30.0, r0, 6.0)), (0.58, (50.0, r0, 8.0)), (0.68, (70.0, r0, 6.0)),
                 (0.76, (82.0, r0, 3.0)), (0.88, (89.0, r1, 1.5)), (1.00, (90.0, r1, 0.0))],
        'spine': [(0.00, (0.0,)), (0.38, (0.0,)), (0.52, (5.0,)), (0.64, (6.0,)), (0.76, (2.0,)), (1.00, (0.0,))],
        'chest': [(0.00, (0.0,)), (0.42, (0.0,)), (0.56, (3.0,)), (0.68, (4.0,)), (0.80, (-1.5,)), (1.00, (0.0,))],
        # neck: slide (m), pitch (deg)
        # the head rises clear of the well before it nods
        'neck': [(0.00, (-fold.NECK_TUCK, 0.0)), (0.80, (-fold.NECK_TUCK, 0.0)), (0.88, (0.02, 0.0)), (0.93, (0.0, -6.0)), (0.97, (0.0, 2.0)), (1.00, (0.0, 0.0))],
        # head: pitch, yaw
        'head': [(0.00, (0.0, 0.0)), (0.86, (0.0, 0.0)), (0.90, (-6.0, 0.0)), (0.94, (2.0, -16.0)), (0.97, (0.0, 5.0)), (1.00, (0.0, 0.0))],
        # shoulder boom: yaw (deg, forward), telescope extension (0 retracted .. 1)
        'boom': [(0.00, (yaw0, 0.0)), (0.46, (yaw0, 0.0)), (0.54, (yaw0 * 0.45, 0.55)), (0.60, (0.0, 1.0)), (1.00, (0.0, 1.0))],
        # FK arms: upper arm pitch (+ back), abduction (+ out); forearm flex (- forward). The arms ride
        # along the torso through the rise (the hips lift the body) and swing out with the booms
        'upperarm': [(0.00, (0.0, 0.0)), (0.48, (0.0, 0.0)), (0.58, (4.0, 30.0)), (0.70, (4.0, 30.0)), (0.80, (-6.0, 16.0)),
                     (0.90, (-3.0, 10.0)), (1.00, (0.0, stand.ARM_ABDUCT))],
        # the elbows flex as the arms swing out so the fists pass over the parked doors
        # the elbows flex just enough to lift the fists into the open side-window apertures (between the
        # belt and the windshield), then the booms carry the arms out through them
        'forearm': [(0.00, (0.0,)), (0.38, (0.0,)), (0.46, (-18.0,)), (0.62, (-18.0,)), (0.74, (-24.0,)), (0.84, (-26.0,)), (1.00, (-stand.ELBOW_BEND,))],
        'armik': [(0.00, (0.0,)), (1.00, (0.0,))],
        'wrist': [(0.00, hand), (1.00, hand)],
        # hand: slide out of the sleeve, wrist pitch
        'hand': [(0.00, (fold.HAND_TUCK, 0.0)), (0.56, (fold.HAND_TUCK, 0.0)), (0.64, (0.0, 0.0)), (1.00, (0.0, 0.0))],
        'thumb': [(0.00, (fold.THUMB_TUCK,)), (0.58, (fold.THUMB_TUCK,)), (0.66, (0.0,)), (1.00, (0.0,))],
        # finger curl as a fraction of the stand curl
        # fists close before the arms thread out
        'curl': [(0.00, (0.0,)), (0.30, (0.0,)), (0.38, (2.4,)), (0.66, (2.4,)), (0.76, (0.6,)), (0.90, (1.3,)), (1.00, (1.0,))],
        'hipslide': [(0.00, (-fold.HIP_TUCK,)), (0.76, (-fold.HIP_TUCK,)), (0.86, (0.0,)), (1.00, (0.0,))],
        # ankle target (x, f, z) in the vehicle frame: feet spread to the hip track and plant; the body
        # settles onto them as the front wheels lift (the ground lift puts the lowest point on z = 0)
        'ankle': [(0.00, fa), (0.40, (fa[0], fa[1], (fa[2] + rig.ANKLE_Z) / 2)), (0.66, (fa[0], fa[1], rig.ANKLE_Z)),
                  (0.76, (fa[0], fa[1], rig.ANKLE_Z)), (0.86, (rig.HIP_X, fa[1], rig.ANKLE_Z)), (1.00, (rig.HIP_X, fa[1], rig.ANKLE_Z))],
    }


def rise_start():
    """(elevation deg, reach) of the fold hip joint about the fold ankle."""
    fa = fold_ankle()
    dfz = (fa[1] - fold.PELVIS_F, fold.PELVIS_Z - fa[2])
    return math.degrees(math.atan2(dfz[1], dfz[0])), math.hypot(*dfz)


def root_from_rise(v):
    """Pelvis joint frame (vehicle frame) from the rise channel and the ankle target."""
    phi, reach, lean = v['rise']
    phi0, _ = rise_start()
    _, af, az = v['ankle']
    f = af - reach * math.cos(math.radians(phi))
    z = az + reach * math.sin(math.radians(phi))
    # the pelvis pitches with the legs (-90 lying .. 0 upright), plus the lean into the rise
    pitch = -90.0 + (phi - phi0) * 90.0 / (90.0 - phi0) + lean
    return Matrix.Translation(V(0, f, z)) @ Matrix.Rotation(math.radians(pitch), 4, 'X')


def pose(T):
    """Returns (bone -> (quat, slide) local pose, root matrix before ground lift, channel values)."""
    tr = tracks()
    v = {k: _monotone(keys, T) for k, keys in tr.items()}
    root = root_from_rise(v)
    P = {}
    P['spine'] = (q(v['spine'][0]), Vector())
    P['chest'] = (q(v['chest'][0]), Vector())
    P['neck'] = (q(v['neck'][1]), Vector((0, 0, v['neck'][0])))
    P['head'] = (q(v['head'][0], 0, v['head'][1]), Vector())
    yaw, ext = v['boom']
    reach_rest = rig.SHOULDER_X - rig.CLAV_X
    dx, df = fold.SHOULDER_FOLD
    retract = (reach_rest - math.hypot(dx, df)) * (1.0 - ext)
    for S, s in (('L', 1), ('R', -1)):
        P['clav.' + S] = (q(0, 0, -s * yaw), Vector())
        P['boom.' + S] = (Quaternion(), Vector((-s * retract / 2, 0, 0)))
        P['yoke.' + S] = (Quaternion(), Vector((-s * retract / 2, 0, 0)))
        up, ab = v['upperarm']
        # the arm frame counter-yaws the boom so the arm stays square to the chest
        P['upperarm.' + S] = (q(0, 0, s * yaw) @ q(up, -s * ab, 0), Vector())
        P['forearm.' + S] = (q(v['forearm'][0]), Vector())
        P['hand.' + S] = (q(v['hand'][1]), Vector((0, 0, v['hand'][0])))
        P['thumb1.' + S] = (q(v['thumb'][0]), Vector())
        for fn in rig.FINGERS:
            for k in range(3):
                P['%s%d.%s' % (fn, k + 1, S)] = (q(0, s * stand.FINGER_CURL[k] * v['curl'][0], 0), Vector())
        P['hip.' + S] = (Quaternion(), Vector((s * v['hipslide'][0], 0, 0)))
    return P, root, v


# ------------------------------------------------------------------------- IK

def solve_leg(W_hip, target, L1, L2, pole):
    """Two-bone leg IK. W_hip: world matrix of the hip joint frame (the thigh's
    parent frame at the joint). Returns (thigh local quat, knee flexion rad)."""
    Hi = W_hip.inverted()
    t = Hi @ target
    p = (Hi.to_3x3() @ pole).normalized()
    D = min(t.length, L1 + L2 - 1e-5)
    D = max(D, abs(L1 - L2) + 1e-4)
    d = t.normalized()
    cos_a = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)
    a = math.acos(max(-1.0, min(1.0, cos_a)))
    cos_k = (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)
    knee = math.pi - math.acos(max(-1.0, min(1.0, cos_k)))
    # bend plane: contains d and the pole
    side = d.cross(p)
    if side.length < 1e-6:
        side = Vector((1, 0, 0))
    side.normalize()
    thigh_dir = (Quaternion(side, a) @ d).normalized()
    # thigh frame: -Z along the bone, -Y (forward) toward the pole
    z = -thigh_dir
    y = -(p - thigh_dir * p.dot(thigh_dir)).normalized()
    x = y.cross(z)
    R = Matrix((x, y, z)).transposed()
    return R.to_quaternion(), knee


# --------------------------------------------------------------------- posing

def solve_arm(W_parent, shoulder_local, target, L1, L2, pole):
    """Two-bone arm IK in the parent (yoke) frame; elbow toward `pole`, forearm
    flexing forward. Returns (upper-arm local quat, elbow flexion rad)."""
    M = W_parent @ Matrix.Translation(shoulder_local)
    # the upper arm leans toward the pole so the elbow sits behind; the solver frames -Y toward
    # the pole, so spin the frame half a turn about the bone to keep -Y forward (outer side out)
    qt, bend = solve_leg(M, target, L1, L2, pole)
    flip = Quaternion((0, 0, 1), math.pi)
    return qt @ flip, bend


def world(T, skel):
    """Full skeleton world matrices at T (legs and supporting arms by IK, feet
    world-level), before the ground lift."""
    P, root, v = pose(T)
    W = skel.fk(P, root)
    w = v['armik'][0]
    if w > 1e-4:
        hx, hf, hz = v['wrist']
        for S, s in (('L', 1), ('R', -1)):
            target = V(s * hx, hf, hz)
            parentW = W['yoke.' + S]
            chestR = W['chest'].to_3x3()
            pole = (chestR @ Vector((s * 0.6, 1.0, 0.0))).normalized()      # elbows back and out
            qa, bend = solve_arm(parentW, skel.offset['upperarm.' + S], target, rig.UPPER, rig.FORE, pole)
            fk_up = P['upperarm.' + S][0]
            fk_fore = P['forearm.' + S][0]
            P['upperarm.' + S] = (fk_up.slerp(qa, w), Vector())
            P['forearm.' + S] = (fk_fore.slerp(q(-math.degrees(bend)), w), Vector())
        W = skel.fk(P, root)
    ax, af, az = v['ankle']
    for S, s in (('L', 1), ('R', -1)):
        target = V(s * ax, af, az)
        hipW = W['hip.' + S]
        pole = W['pelvis'].to_3x3() @ Vector((0, -1, 0))        # knees point where the pelvis faces
        qt, knee = solve_leg(hipW, target, rig.THIGH, rig.SHIN, pole)
        P['thigh.' + S] = (qt, Vector())
        P['shin.' + S] = (q(math.degrees(knee)), Vector())
    W = skel.fk(P, root)
    for S in ('L', 'R'):
        # foot held world-level: local = inverse(shin world rotation)
        shinR = W['shin.' + S].to_quaternion()
        P['foot.' + S] = (shinR.inverted(), Vector())
    W = skel.fk(P, root)
    return W, P
