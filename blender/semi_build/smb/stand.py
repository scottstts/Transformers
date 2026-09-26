"""Robot-mode neutral stand: the pose the transformation ends in and locomotion
starts from. A heavy, planted stance: arms held a little out from the hips so
the forearm wheels clear the thighs, fists half closed, knees soft (the legs
are solved to the stance)."""
import math
from mathutils import Vector, Quaternion, Euler

ARM_ABDUCT = 14.0         # degrees, shoulder abduction
ELBOW_BEND = 12.0         # degrees, relaxed elbow flexion
SPINE_LEAN = 4.0          # degrees forward
FINGER_CURL = (42.0, 52.0, 36.0)


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def pose():
    from . import rig
    P = {}
    P['spine'] = (q(SPINE_LEAN, 0, 0), Vector())
    P['neck'] = (q(-SPINE_LEAN, 0, 0), Vector())
    for S, s in (('L', 1), ('R', -1)):
        P['upperarm.' + S] = (q(0, -s * ARM_ABDUCT, 0), Vector())
        P['forearm.' + S] = (q(-ELBOW_BEND, 0, 0), Vector())
        for fn in rig.FINGERS:
            for k in range(3):
                P['%s%d.%s' % (fn, k + 1, S)] = (q(0, s * FINGER_CURL[k], 0), Vector())
        P['thumb1.' + S] = (q(20, s * 20, 0), Vector())
    return P
