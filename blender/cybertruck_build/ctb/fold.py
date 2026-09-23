"""The folded (vehicle) pose: the robot lies on its back inside the truck,
head toward the tailgate, feet in the nose, arms along its sides.

Every value here is a joint state of the same skeleton that stands in robot
mode, so the transformation is a continuous path between two joint states.
"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from .kit import V
from . import rig

PELVIS_F = rig.FOLD_PELVIS_F     # hip joint station in the truck
PELVIS_Z = rig.FOLD_PELVIS_Z     # hip joint height in the truck (girdle clears the floor pan)
# legs slope down to the nose so the toe-cap bumper bottom (car z 0.36) sits at sole level
LEG_SLOPE = math.degrees(math.asin((PELVIS_Z - (rig.FOLD_SOLE_Z + rig.ANKLE_Z)) / (rig.THIGH + rig.SHIN)))
FOOT_FOLD_F = PELVIS_F + (rig.THIGH + rig.SHIN) * math.cos(math.radians(LEG_SLOPE))   # ankle station
HIP_TUCK = 0.16                  # hip carriages telescope inward to clear the front wheel wells
NECK_TUCK = 0.58                 # neck retracts into the chest
THUMB_TUCK = 30.0                # degrees
HAND_TUCK = 0.10                 # hands retract into the forearms
# shoulder booms swing forward and telescope in so the arms ride above the rear wheel wells
SHOULDER_X_FOLD = 0.69              # folded shoulder joint station (x), arms above the rear wells
SHOULDER_FOLD = (SHOULDER_X_FOLD - rig.CLAV_X, 0.32)   # shoulder joint relative to the boom pivot at the fold (x, f)


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def root_matrix():
    return Matrix.Translation(V(0, PELVIS_F, PELVIS_Z)) @ Matrix.Rotation(math.radians(-90), 4, 'X')


def pose():
    P = {}
    P['neck'] = (Quaternion(), Vector((0, 0, -NECK_TUCK)))
    P['head'] = (Quaternion(), Vector())
    for S, s in (('L', 1), ('R', -1)):
        dx, df = SHOULDER_FOLD
        yaw = math.degrees(math.atan2(df, dx))
        reach = math.hypot(dx, df)
        P['clav.' + S] = (q(0, 0, -s * yaw), Vector())
        half = (reach - (rig.SHOULDER_X - rig.CLAV_X)) / 2
        P['boom.' + S] = (Quaternion(), Vector((s * half, 0, 0)))
        P['yoke.' + S] = (Quaternion(), Vector((s * half, 0, 0)))
        P['upperarm.' + S] = (q(0, 0, s * yaw), Vector())
        P['hand.' + S] = (Quaternion(), Vector((0, 0, HAND_TUCK)))
        P['hip.' + S] = (Quaternion(), Vector((-s * HIP_TUCK, 0, 0)))
        P['thigh.' + S] = (q(LEG_SLOPE), Vector())
        P['foot.' + S] = (q(90 - LEG_SLOPE), Vector())
        # thumbs swing down in line with the palm to retract into the forearm sleeve
        P['thumb1.' + S] = (q(THUMB_TUCK), Vector())
    return P


def world(skel):
    return skel.fk(pose(), root_matrix())
