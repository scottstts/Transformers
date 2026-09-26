"""The folded (truck) pose: the robot sits UPRIGHT in the cab facing forward,
legs straight back along the frame rails (hips extended 90 deg, knee fronts
down): the thighs under the cab's rear half, the knees just behind the cab,
the shins carrying the drive tandem, the feet standing toes-down at the rear
crossmember with their soles as the frame's rear face (toes folded under).

The shoulder carriages slide forward and in (the clav slide), so the arms
fold into the nose ahead of the chest: upper arms hanging, forearms reaching
forward over the front wheels, fists behind the light bar. The neck
telescopes down so the helmet clears the roof fairing.

Every value is a joint state of the skeleton that stands in robot mode, so
the transformation is a continuous path between two joint states."""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from .kit import V
from . import rig, dims as D

PELVIS_S = 3.45                          # hip joint station (behind the nose)
PELVIS_Z = 0.62
HIP_TUCK = 0.20                          # hips slide in: legs over the frame rails
ANKLE_S = PELVIS_S + rig.THIGH + rig.SHIN
KNEE_S = PELVIS_S + rig.THIGH
CLAV_IN = 1.15                           # shoulder carriages slide in ...
CLAV_FWD = 0.95                          # ... and forward, ahead of the chest core
NECK_TUCK = 0.40
UPPER_FWD = 8.0                          # upper arms hang slightly forward
ELBOW_FOLD = 70.0                        # forearms reach forward and a little down
FIST = (80.0, 90.0, 70.0)


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def root_pos():
    return (0.0, D.f(PELVIS_S), PELVIS_Z)


def feet():
    """Ankle targets (x, f, z) of the L leg in the truck."""
    return (rig.HIP_X - HIP_TUCK, D.f(ANKLE_S), PELVIS_Z)


def pose():
    """Joint state of everything the leg IK does not solve."""
    P = {}
    P['neck'] = (Quaternion(), Vector((0, 0, -NECK_TUCK)))
    for S, s in (('L', 1), ('R', -1)):
        P['clav.' + S] = (Quaternion(), V(-s * CLAV_IN, CLAV_FWD, 0))
        P['upperarm.' + S] = (q(-UPPER_FWD), Vector())
        P['forearm.' + S] = (q(-ELBOW_FOLD), Vector())
        P['toe.' + S] = (q(-90.0), Vector())
        for fn in rig.FINGERS:
            for k in range(3):
                P['%s%d.%s' % (fn, k + 1, S)] = (q(0, s * FIST[k], 0), Vector())
        P['thumb1.' + S] = (q(40, s * 30, 0), Vector())
        P['thumb2.' + S] = (q(0, s * 40, 0), Vector())
    return P
