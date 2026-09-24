"""Robot-mode neutral stand: the pose the transformation ends in and locomotion
starts from. Heroic: arms held out in an A-pose clear of the sidepod forearms'
flare, fists half closed, knees soft (the legs are solved to the stance)."""
import math
from mathutils import Vector, Quaternion, Euler

ARM_ABDUCT = 16.0         # degrees, shoulder abduction
ELBOW_BEND = 14.0         # degrees, relaxed elbow flexion
KNEE_BEND = 6.0
SPINE_LEAN = 8.0          # degrees forward
FINGER_CURL = (48.0, 56.0, 40.0)


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def pose():
    from . import rig
    P = {}
    # the backpack sits behind the spine: the torso leans a touch forward over the feet, the
    # head levels itself
    P['spine'] = (q(SPINE_LEAN, 0, 0), Vector())
    P['neck'] = (q(-SPINE_LEAN, 0, 0), Vector())
    for S, s in (('L', 1), ('R', -1)):
        P['upperarm.' + S] = (q(0, -s * ARM_ABDUCT, 0), Vector())
        P['forearm.' + S] = (q(-ELBOW_BEND, 0, 0), Vector())   # down-pointing bone: -x flexes forward
        for fn in rig.FINGERS:
            for k in range(3):
                P['%s%d.%s' % (fn, k + 1, S)] = (q(0, s * FINGER_CURL[k], 0), Vector())
    return P
