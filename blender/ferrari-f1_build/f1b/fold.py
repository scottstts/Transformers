"""The folded (car) pose: the robot lies FACE UP with its head toward the tail.

It is the standing rest pose tipped back 90 deg about x, so every limb already
lies along the car: the feet are pointed forward flat inside the front-wing
halves, the shins run up the nose, the thighs lie in the survival cell under
the cockpit, the chest under the airbox and engine cover, the head under the
engine cover ahead of the gearbox, and the arms hang along the body inside the
sidepods with the fists behind the inlets. Its front faces up, so the red
bodywork above each limb becomes that limb's armour; the floor is its back.

Every value is a joint state of the same skeleton that stands in robot mode,
so the transformation is a continuous path between two joint states.
"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from .kit import V
from . import rig

# pelvis joint (vehicle frame) and the torso axis: the standing frame pitched
# -90 deg about x (body up -> rearward, body front -> up)
PELVIS_F = 0.45
PELVIS_Z = 0.325
HIP_TUCK = 0.165                # hip carriages slide in along the hip beam: legs together in the tub
ANKLE = (0.078, 2.255, 0.350)   # ankle target (vehicle frame, L): the shins climb the nose
SHOULDER_TUCK = 0.22            # shoulder sockets slide in: arms inside the sidepods
WRIST = (0.405, 0.560, 0.330)   # wrist target (vehicle frame, L): fists behind the inlet ducts
HAND_TUCK = 0.155               # hands retract fully behind the sidepod inlet lip
NECK_TUCK = 0.04
FOOT_TUCK = 0.20                # feet telescope up into the shins: the nose tip is too shallow for them


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def root_matrix():
    return Matrix.Translation(V(0, PELVIS_F, PELVIS_Z)) @ Matrix.Rotation(math.radians(-90), 4, 'X')


def aim_quat(parent_world, joint_local, target):
    """Local rotation turning a hanging bone (-Z) onto a world target."""
    Mj = parent_world @ Matrix.Translation(joint_local)
    d = (Mj.inverted() @ Vector(target)).normalized()
    return Vector((0, 0, -1)).rotation_difference(d)


def pose():
    """Fold pose: legs by two-bone IK with the knees up (the body front),
    straight arms aimed at the wrist targets, feet pointed flat."""
    from .motion import solve_leg
    sk = rig.Skeleton()
    P = {}
    P['neck'] = (Quaternion(), Vector((0, 0, -NECK_TUCK)))
    for S, s in (('L', 1), ('R', -1)):
        P['clav.' + S] = (Quaternion(), Vector((-s * SHOULDER_TUCK, 0, 0)))
        P['hand.' + S] = (Quaternion(), Vector((0, 0, HAND_TUCK)))
        P['hip.' + S] = (Quaternion(), Vector((-s * HIP_TUCK, 0, 0)))
        for fn in rig.FINGERS:
            for k in range(3):
                P['%s%d.%s' % (fn, k + 1, S)] = (q(0, s * (80, 90, 70)[k], 0), Vector())     # fists
        P['thumb1.' + S] = (q(34, s * 30, 0), Vector())
    W = sk.fk(P, root_matrix())
    for S, s in (('L', 1), ('R', -1)):
        wx, wf, wz = WRIST
        P['upperarm.' + S] = (aim_quat(W['clav.' + S], sk.offset['upperarm.' + S], V(s * wx, wf, wz)), Vector())
        ax, af, az = ANKLE
        qt, knee = solve_leg(W['hip.' + S], V(s * ax, af, az), rig.THIGH, rig.SHIN, Vector((0, 0, 1)))
        P['thigh.' + S] = (qt, Vector())
        P['shin.' + S] = (q(math.degrees(knee)), Vector())
    W = sk.fk(P, root_matrix())
    for S in ('L', 'R'):
        # pointed foot lying flat: toe forward, sole down (world identity orientation)
        P['foot.' + S] = (W['shin.' + S].to_quaternion().inverted(), Vector((0, 0, FOOT_TUCK)))
    return P


def world(skel):
    return skel.fk(pose(), root_matrix())
