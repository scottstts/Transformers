"""The folded (car) pose: the robot crouches low and wide inside the Tumbler.

The feet stand flat on the floor pan at the rear, just ahead of the rear tyres,
toe blocks folded up; the hips sit low over them and the knees splay wide and
forward inside the flanks (a gargoyle's crouch pressed flat). The torso lies
face down between the knees, its chest core under the canopy (the canopy is its
back shell), the head tucked low behind the beak. The shoulders slide in; the
arms reach forward and down, upper arms telescoped, and fold back under the
chest with the fists knuckle-down on the floor pan.

So when the wheels draw up, the car settles onto the robot's own feet and
fists: the rise starts from a real crouch on the ground.

Every value is a joint state of the skeleton that stands in robot mode, so the
transformation is a continuous path between two joint states."""
import math
from mathutils import Vector, Quaternion, Euler
from .kit import V
from . import rig, dims as D

PELVIS_S = 3.02                          # hip joint station
PELVIS_Z = 0.86
PITCH = 80.0                             # pelvis pitched forward
SPINE_CURL = 10.0                        # the spine and chest curl the torso level
CHEST_CURL = 8.0
SPINE_IN, CHEST_IN = 0.12, 0.12          # waist compression
NECK_TUCK = 0.20
NECK_PITCH = 22.0                        # the head pitched down behind the beak
CLAV_IN, CLAV_DOWN = 0.26, 0.22          # the shoulders slide in and toward the chest front
ANKLE = (0.45, 3.10, 0.66)               # L ankle (x, s, z): feet flat on the floor pan
KNEE_POLE = (0.45, 0.88, -0.30)          # knees splayed wide and forward
WRIST = (0.55, 2.10, 0.50)               # L wrist: the fists knuckle-down under the chest
ELBOW_POLE = (0.40, -1.0, 0.0)           # the arm's front (the forearm folds to it) faces back: elbows forward
TOE_FOLD = -85.0                         # toe blocks folded up
FIST = (80.0, 90.0, 70.0)


def q(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def root_pos():
    return (0.0, D.f(PELVIS_S), PELVIS_Z)


def ankle(side=1):
    return (side * ANKLE[0], D.f(ANKLE[1]), ANKLE[2])


def wrist(side=1):
    return (side * WRIST[0], D.f(WRIST[1]), WRIST[2])


def pose():
    """Joint state of everything the leg and arm IK do not solve."""
    P = {}
    P['spine'] = (q(SPINE_CURL), Vector((0, 0, -SPINE_IN)))
    P['chest'] = (q(CHEST_CURL), Vector((0, 0, -CHEST_IN)))
    P['neck'] = (q(NECK_PITCH), Vector((0, 0, -NECK_TUCK)))
    for S, s in (('L', 1), ('R', -1)):
        P['clav.' + S] = (Quaternion(), V(-s * CLAV_IN, CLAV_DOWN, 0))
        P['toe.' + S] = (q(TOE_FOLD), Vector())
        for fn in rig.FINGERS:
            for k in range(3):
                P['%s%d.%s' % (fn, k + 1, S)] = (q(0, s * FIST[k], 0), Vector())
        for k, a in enumerate((50, 70, 60)):                  # the thumb wrapped across the fist
            P['thumb%d.%s' % (k + 1, S)] = (q(-20 if k == 0 else 0, -s * a, 0), Vector())
    return P
