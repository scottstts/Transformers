"""Robot-mode neutral stand: the pose the transformation ends in and locomotion
starts from. Heavy armoured arms hang in a slight A-pose so the forearm
gauntlets clear the thigh armour."""
import math
from mathutils import Vector, Quaternion, Euler

ARM_ABDUCT = 9.0          # degrees, shoulder abduction
ELBOW_BEND = 12.0         # degrees, relaxed elbow flexion
KNEE_BEND = 6.0           # degrees
FINGER_CURL = (18.0, 22.0, 16.0)


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def pose():
    from . import rig
    P = {}
    for S, s in (('L', 1), ('R', -1)):
        P['upperarm.' + S] = (q(0, -s * ARM_ABDUCT, 0), Vector())
        P['forearm.' + S] = (q(-ELBOW_BEND, 0, 0), Vector())   # down-pointing bone: -x flexes forward
        for fn in rig.FINGERS:
            for k in range(3):
                P['%s%d.%s' % (fn, k + 1, S)] = (q(0, s * FINGER_CURL[k], 0), Vector())   # curl toward the palm (-s x)
    return P
