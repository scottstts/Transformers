"""Transformation program: which car parts move together, what carries them,
and the mechanism steps that take them from the car to the robot.

Hosts: a bone name, or '@assembly' for a sub-mechanism riding on another
assembly (its steps are then expressed in the vehicle frame, because the host
assembly's frame IS the vehicle frame at the fold).

Side-specific entries are authored for L (+x) and mirrored for R.
T: 0 = car, 1 = robot. Reverse transformation runs the same path backward.
"""
import math
from mathutils import Vector
from .mech import move, pop, rot, fit, seat
from .kit import V
from . import rig, fold, wheels, dims as D

_FW = {}


def fold_world(bone):
    if not _FW:
        _FW.update(fold.world(rig.Skeleton()))
    return _FW[bone]


def lpt(bone, p):
    """Vehicle-frame design point (x, f, z) -> host bone frame design point (fold).
    bone None: an assembly host, whose frame is the vehicle frame."""
    if bone is None:
        return tuple(p)
    q = fold_world(bone).inverted() @ V(*p)
    return (q.x, -q.y, q.z)


def lax(bone, a):
    """Vehicle-frame design axis (x, f, z) -> host bone frame Blender-space axis."""
    if bone is None:
        return V(*a).normalized()
    return (fold_world(bone).to_3x3().inverted() @ V(*a)).normalized()


def corner_fold(bone, front, deg, at):
    """Parallelogram fold of a wheel corner (L side) about its pickup lines (along f):
    each link group turns deg about its own inboard axis; the upright, brake drum,
    wheel and push/pull rod translate on the wishbones' arc (spin -deg about the
    upright, orbit +deg about the upper pickup)."""
    pv = wheels.pivots(front)
    ax = D.FA if front else D.RA
    axis = lax(bone, (0, 1, 0))
    steps = {}
    for g in ('up', 'lo', 'toe'):
        (px, pz), _ = pv[g]
        steps[g] = [rot(axis, deg, lpt(bone, (px, ax, pz)), at)]
    (px, pz), (ox, oz) = pv['up']
    steps['corner'] = [rot(axis, -deg, lpt(bone, (ox, ax, oz)), at), rot(axis, deg, lpt(bone, (px, ax, pz)), at)]
    return steps


def retract(front, group, at, frac=0.92, bone=None):
    """Suspension members slide in along their own axis (outboard end toward the pickup) until
    they disappear inside the bodywork they are pinned to (vehicle frame for '@' hosts, or the
    fold frame of `bone`)."""
    ms = wheels._members(front)[group]
    d, L = Vector(), 0.0
    for a, b, kw in ms:
        a, b = Vector(a), Vector(b)
        inner, outer = (a, b) if abs(a.x) < abs(b.x) else (b, a)
        d += (inner - outer).normalized()
        L += (inner - outer).length
    d = d.normalized() * (L / len(ms)) * frac
    if bone is not None:
        a = lax(bone, (d.x, d.y, d.z)) * d.length       # Blender-space axis in the bone frame
        return move((a.x, -a.y, a.z), at)
    return move((d.x, d.y, d.z), at)


def sided():
    A = {}
    # ---------------------------------------------------------------- legs
    # feet: until the stance is wide the whole front-wing half (and the nose tip on its pylons)
    # rides the foot as in the car -- the crouching robot stands on it. Then the inner wing half
    # rises on its carrier and stands up behind the heel as a fin cluster, the sole platform
    # unfolds under the foot, the outer half slides in on its carrier and lies on the sole
    # (endplate upright outboard), and last the nose tip settles onto the instep as the toe cap
    FOOT = move((-0.640, -0.210, 0.150), (0.60, 0.76))
    A['foot'] = dict(host='foot', parts=['fwingOut'], steps=[FOOT])
    A['heelfin'] = dict(host='foot', parts=['fwingIn'], steps=[move((0.0, 0.0, 0.30), (0.56, 0.62)), rot('x', 90.0, 'c', (0.60, 0.68)),
                                                                fit({'xc': 0.0, 'fc': -0.300, 'zc': 0.040}, (0.66, 0.74))])
    A['toecap'] = dict(host='foot', parts=['toe', 'pylon'], steps=[move((0.040, -0.080, 0.185), (0.78, 0.90))])
    # the nose half lifts straight off the shin's front and stays there as the shin guard
    A['shin'] = dict(host='shin', parts=['shin', 'floorShin'], steps=[move((0.0, NOSE_LIFT, NOSE_RISE), (0.14, 0.24))])
    # front corner: wheel, upright and wishbones stay together; once the shin stands up, the
    # wishbones fold back about their pickups (a parallelogram: the upright keeps its attitude) and
    # carry the wheel round to the outer back of the calf
    FF = corner_fold('shin.L', True, FRONT_FOLD, (0.40, 0.58))
    RAIL = move((0.0, 0.0, FRONT_RAIL), (0.56, 0.70))        # the corner's pickups ride a rail up the calf
    FF = {g: s + [RAIL] for g, s in FF.items()}
    A['fsuspU'] = dict(host='shin', parts=['suspFUp'], steps=FF['up'])
    A['fsuspL'] = dict(host='shin', parts=['suspFLo', 'suspFRod'], steps=FF['lo'])
    A['fsuspT'] = dict(host='shin', parts=['suspFToe'], steps=FF['toe'])
    A['wheelF'] = dict(host='shin', parts=['wheelF', 'cornerF'], steps=FF['corner'])
    # car panels over the legs fold round to the backs of the limbs (the robot's own shells are in front)
    # car panels over the thighs and hips lift off, swing round the outside and stack on the back
    # of the waist as the tail skirt (hidden from the front)
    SWING_BACK = lambda at: rot('z', 180.0, ['c', 0.34, -0.10, 0.0], at)
    A['thigh'] = dict(host='chest', parts=['thigh', 'floorThigh', 'rimF'], steps=[
        move((0.0, 0.34, 0.0), (0.06, 0.16)), SWING_BACK((0.16, 0.30)), fit({'xc': 0.18, 'fc': -0.62, 'zc': -0.05}, (0.42, 0.58))])
    # the hip panel stays joined to the cockpit side it adjoins in the car and rides with it
    A['hip'] = dict(host='@thigh', parts=['hip', 'floorHip', 'rimR'], steps=[])
    # ---------------------------------------------------------------- sidepods -> back wings
    # each sidepod lifts off the arm inside it, swings round the shoulder and docks behind the
    # shoulder blade, its red top facing back, angled out like a wing
    # the three sidepod shells nest like stacking cups behind the shoulder blade
    for name, parts, tgt, t0 in (('podF', ['podF', 'floorPodF', 'duct', 'mirror'], (0.30, -0.62, 0.52), 0.00),
                                 ('podM', ['podM', 'floorPodM'], (0.31, -0.58, 0.56), 0.02),
                                 ('podR', ['podR', 'floorPodR'], (0.32, -0.54, 0.60), 0.04)):
        A[name] = dict(host='chest', parts=parts, steps=[
            move((0.0, 0.32, 0.0), (0.04 + t0, 0.14 + t0)), rot('z', 180.0, ['c', 0.40, -0.12, 0.0], (0.12 + t0, 0.26 + t0)),
            fit(dict(zip(('xc', 'fc', 'zc'), tgt)), (0.38, 0.54)), rot('z', -22.0, 'c', (0.82, 0.94))])
    # ---------------------------------------------------------------- backpack
    # The rear of the car is one unit: gearbox, rear wing, uprights, wishbones and wheels never
    # part company (the wheels are always on their hubs). First the engine cover and the nape
    # telescope back over / into the gearbox, sliding straight away from the head. The unit then
    # flips over on the hinge mast behind the neck and lowers onto the back; last, the rear
    # corners fold forward on their wishbones so the wheels ride high behind the shoulders.
    A['hood'] = dict(host='@tail', parts=['hood'], steps=[move((0.0, -0.52, 0.0), (0.03, 0.14))])
    # the rear wing folds forward on its swan-neck roots so it lies up the back of the pack
    A['rwing'] = dict(host='@tail', parts=['rwing'], steps=[rot('x', RWING_FOLD, (0.0, -2.05, 0.60), (0.40, 0.56))])
    RF = corner_fold(None, False, REAR_FOLD, (0.84, 0.96))
    A['rsuspU'] = dict(host='@tail', parts=['suspRUp'], steps=RF['up'])
    A['rsuspL'] = dict(host='@tail', parts=['suspRLo', 'suspRRod'], steps=RF['lo'])
    A['rsuspT'] = dict(host='@tail', parts=['suspRToe'], steps=RF['toe'])
    A['rcorner'] = dict(host='@tail', parts=['cornerR', 'wheelR'], steps=RF['corner'])
    return A


NOSE_LIFT = 0.20
NOSE_RISE = 0.08         # up the shin: the nose tip clears the foot
FRONT_FOLD = -55.0
FRONT_RAIL = 0.26
# the backpack's hinge: on the gearbox underside in the car, on top of the mast (chest frame)
PACK_HINGE = (0.0, -0.27, 1.55)
PACK_LOWER = 0.45
PACK_BACK = 0.60
REAR_FOLD = -40.0
RWING_FOLD = 60.0
# the airbox swing arms' hinge on the upper back (chest frame)
AIRBOX_HINGE = (0.0, -0.25, 0.86)


def singles():
    # the airbox / roll-hoop panel over the chest flips back over the head onto the back, on swing
    # arms hinged behind the neck
    FLIP = rot('x', -180.0, AIRBOX_HINGE, (0.12, 0.32))
    return {
        'chest': dict(host='chest', parts=['chest', 'intake', 'tcam'], steps=[FLIP, fit({'fc': -0.46, 'zc': 0.40}, (0.34, 0.46))]),
        'belly': dict(host='chest', parts=['belly', 'floorBelly'], steps=[move((0, -0.14, 0), (0.20, 0.32))]),
        # the halo slides back on the cockpit rim until its pillar meets the airbox, then rides it
        'halo': dict(host='@chest', parts=['halo'], steps=[move((0.0, -1.00, 0.0), (0.05, 0.16))]),
        'liner': dict(host='pelvis', parts=['liner'], steps=[fit({'xc': 0.0, 'fc': -0.02, 'zc': 0.02}, (0.26, 0.42))]),
        'nape': dict(host='@tail', parts=['nape', 'floorNape'], steps=[move((0.0, -0.62, 0.0), (0.03, 0.14))]),
        'tail': dict(host='chest', parts=['tail', 'floorTail'], steps=[
            rot('x', -180.0, PACK_HINGE, (0.30, 0.50)), move((0.0, 0.0, -PACK_LOWER), (0.56, 0.70)), move((0.0, -PACK_BACK, 0.0), (0.62, 0.76))]),
    }


def carriers():
    """Carrier struts (L side authored, sided ones mirrored): the backpack's hinge mast and the
    airbox's swing arms."""
    from .carrier import Strut
    hx, hf, hz = PACK_HINGE
    ax, af, az = AIRBOX_HINGE
    # hinge on the gearbox underside in vehicle coordinates (chest frame at the fold: f -> car up)
    return [(Strut('mast.L', 'chest', (0.12, hf, 0.70), 'tail', (0.12, -0.03 - hz, 0.325 + hf), r=0.030), True),
            (Strut('airArm.L', 'chest', (0.27, af, az), 'chest', (0.27, -0.62, 0.54), r=0.022), True),
            # feet: arms reach out of the foot, carry a wing half to its place, and retract
            (Strut('heelArm.L', 'foot.L', (0.0, -0.10, -0.12), 'heelfin.L', (0.25, 2.45, 0.15), r=0.016, window=(0.56, 0.74), engage=0.06), True),
            (Strut('wingArm.L', 'foot.L', (0.09, 0.08, -0.14), 'foot.L', (0.55, 2.50, 0.10), r=0.016, window=(0.60, 0.76), engage=0.06), True)]
