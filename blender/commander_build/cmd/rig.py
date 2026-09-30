"""The commander's skeleton. Metres, +X left, -Y forward, +Z up.

A bone frame has its origin at the joint; limbs hang along local -Z, local -Y
faces forward and local +X is the commander's left. Parts are authored in their
bone's frame. The rest pose stands straight in a wide A-stance, both arms
hanging slightly out with a soft elbow, except the right arm, which carries the
lance: upper arm hanging, elbow bent so the forearm points forward, the fist's
grip axis vertical and the lance upright ahead of the right foot.
"""
import math
from mathutils import Matrix, Vector, Euler

# legs and wheel feet
WHEEL_R, WHEEL_W, WHEEL_X = .47, .24, .23   # tyre radius, one tyre's width, tyre centre either side of the foot
ANKLE_UP = .42                              # ankle pivot above the axle
THIGH, SHIN = 1.42, 1.56
HIP_X, SPLAY = .50, 12.0
LEG = THIGH + SHIN
HIP_Z = WHEEL_R + ANKLE_UP + LEG * math.cos(math.radians(SPLAY))
STANCE_X = HIP_X + LEG * math.sin(math.radians(SPLAY))
# trunk
SPINE, WAIST, CHEST, NECK = .30, .30, 1.20, .24
HEAD_C, HEAD_R = Vector((0, -.015, .20)), .27   # spherical head core in the head frame
# arms
SHOULDER = (.93, 0.0, .97)          # chest frame
UPPER, FORE = 1.0, .95
ABDUCT, ELBOW = 13.0, 18.0
# right (lance) arm: shoulder pitch, abduction and outward twist, elbow, wrist pitch
CARRY, ABDUCT_R, TWIST_R, ELBOW_R, WRIST = 6.0, 16.0, -28.0, 72.0, 12.0
# hand: palm from the wrist down to the knuckle row, fingers across y (index at -y)
HAND = 1.2                          # hand scale over the base proportions below
PALM_T, PALM_W, PALM_TOP, KNUCKLE = .12 * HAND, .27 * HAND, -.07 * HAND, -.31 * HAND
FINGER_Y = tuple(y * HAND for y in (-.1, -.034, .032, .096))
FINGER_W = tuple(w * HAND for w in (.058, .06, .058, .052))
FINGER_T = .056 * HAND
SHAFT_R = .052
GRIP = Vector((.08, .0, -.37)) * HAND   # lance axis point inside the right fist (hand frame)
# lance, measured from the grip centre along world up
TIP_Z, BUTT_Z = 7.05, .14           # world heights of the spear tip and butt
HEAD_LEN, BLADE_LEN, BLADE_R = 1.08, .86, .1

BONES = [
    ('pelvis', None, (0, 0, HIP_Z), (0, 0, 0)),
    ('spine', 'pelvis', (0, 0, SPINE), (0, 0, 0)),
    ('chest', 'spine', (0, 0, WAIST), (0, 0, 0)),
    ('neck', 'chest', (0, 0, CHEST), (0, 0, 0)),
    ('head', 'neck', (0, 0, NECK), (0, 0, 0)),
]
for side, s in (('L', 1), ('R', -1)):
    BONES += [
        ('thigh.' + side, 'pelvis', (s * HIP_X, 0, 0), (0, -s * SPLAY, 0)),
        ('shin.' + side, 'thigh.' + side, (0, 0, -THIGH), (0, 0, 0)),
        ('foot.' + side, 'shin.' + side, (0, 0, -SHIN), (0, s * SPLAY, 0)),
        ('wheel.' + side, 'foot.' + side, (0, 0, -ANKLE_UP), (0, 0, 0)),
        ('upperarm.' + side, 'chest', (s * SHOULDER[0], SHOULDER[1], SHOULDER[2]),
         (-CARRY, ABDUCT_R, TWIST_R) if side == 'R' else (0, -ABDUCT, 0)),
        ('forearm.' + side, 'upperarm.' + side, (0, 0, -UPPER), (-(ELBOW_R if side == 'R' else ELBOW), 0, 0)),
        ('hand.' + side, 'forearm.' + side, (0, 0, -FORE), (-WRIST if side == 'R' else 0, 0, 0)),
    ]
BONES += [('weapon', 'hand.R', tuple(GRIP), None),
          ('blade', 'weapon', None, (0, 0, 0))]
# skirt blades: side fans and rear fans on their own hinges under the belt
for side, s in (('L', 1), ('R', -1)):
    BONES += [('mantle.' + side, 'pelvis', (s * .6, 0, .18), (0, 0, 0)),
              ('tail.' + side, 'pelvis', (s * .2, .46, -.42), (0, 0, 0))]
NAMES = [b[0] for b in BONES]
PARENT = {b[0]: b[1] for b in BONES}
_BY = {b[0]: b for b in BONES}
_CACHE = {}


def local_matrix(name):
    if name in _CACHE:
        return _CACHE[name]
    _, parent, t, r = _BY[name]
    if name == 'weapon':
        # world-aligned: the lance stands vertical whatever the arm's rest angles
        rot = world_matrix('hand.R').to_3x3().inverted().to_4x4()
    elif name == 'blade':
        t = (0, 0, spear_up() - HEAD_LEN + .08)
        rot = Matrix.Identity(4)
    else:
        # the lance arm twists about its own long axis first, then abducts and pitches
        order = 'ZYX' if name == 'upperarm.R' else 'XYZ'
        rot = Euler([math.radians(a) for a in r], order).to_matrix().to_4x4()
    M = Matrix.Translation(Vector(t)) @ rot
    _CACHE[name] = M
    return M


def world_matrix(name):
    parent = PARENT[name]
    return (world_matrix(parent) if parent else Matrix.Identity(4)) @ local_matrix(name)


def rest_world():
    return {n: world_matrix(n) for n in NAMES}


def grip_world():
    return world_matrix('weapon').translation


def spear_up():
    return TIP_Z - grip_world().z


def spear_down():
    return grip_world().z - BUTT_Z


def grip_axis():
    """The lance axis (world up) expressed in the right hand's frame."""
    return (world_matrix('hand.R').to_3x3().inverted() @ Vector((0, 0, 1))).normalized()


def dims():
    return dict(height=6.34, wheelRadius=WHEEL_R, wheelX=WHEEL_X, ankleUp=ANKLE_UP,
                thigh=THIGH, shin=SHIN, upper=UPPER, fore=FORE, hipZ=HIP_Z,
                stanceX=STANCE_X, bladeLength=BLADE_LEN, bladeRadius=BLADE_R,
                reach=UPPER + FORE + (-GRIP.z) + spear_up(), bodyRadius=1.5)
