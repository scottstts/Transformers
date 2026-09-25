"""The soldier's skeleton: rigid parts ride bones; nothing is skinned.

Authoring frame as the transformers: x = robot left, -y = forward, z = up,
metres. A bone frame has its origin at the joint; limbs hang along local -Z,
local -Y faces forward and local +X is the robot's left. Parts are modelled in
their bone's frame (build functions receive bone-local coordinates), so the
export stores them as-is and the game poses them with one matrix per bone.

The rest pose is the reference's front view: standing straight, arms hanging
slightly out with a soft elbow, legs splayed a little onto their wheel feet.
"""
import math
from mathutils import Matrix, Vector, Euler

# ---------------------------------------------------------------- proportions
WHEEL_R = 0.235          # tyre outer radius
WHEEL_W = 0.10           # one tyre's width (two per foot)
WHEEL_X = 0.115          # tyre centre either side of the foot's centre (the ankle fork sits between)
ANKLE_UP = 0.135         # ankle pivot above the axle
SHIN = 0.52
THIGH = 0.56
HIP_X = 0.185
SPLAY = 4.0              # leg splay (deg) in the rest pose
PELVIS_TO_WAIST = 0.17
WAIST = 0.19
CHEST = 0.76             # chest joint -> neck joint
NECK = 0.11
SHOULDER_X = 0.47
SHOULDER_DOWN = 0.21     # shoulder joint below the neck joint
UPPER = 0.58
FORE = 0.47
ABDUCT = 7.0             # arm abduction in the rest pose (deg)
ELBOW = 9.0              # rest elbow flexion (deg)

AXLE_Z = WHEEL_R
ANKLE_Z = AXLE_Z + ANKLE_UP
_leg = THIGH + SHIN
HIP_Z = ANKLE_Z + _leg * math.cos(math.radians(SPLAY))
STANCE_X = HIP_X + _leg * math.sin(math.radians(SPLAY))

# bone: (parent, joint position relative to the parent's joint in the parent frame
#        (None: world), rest rotation relative to the parent (Euler XYZ deg))
_LEFT = {
    'thigh': ('pelvis', (HIP_X, 0.0, 0.0), (0.0, -SPLAY, 0.0)),
    'shin': ('thigh', (0.0, 0.0, -THIGH), (0.0, 0.0, 0.0)),
    'foot': ('shin', (0.0, 0.0, -SHIN), (0.0, SPLAY, 0.0)),
    'wheel': ('foot', (0.0, 0.0, -ANKLE_UP), (0.0, 0.0, 0.0)),
    'upperarm': ('chest', (SHOULDER_X, 0.0, CHEST - SHOULDER_DOWN), (0.0, -ABDUCT, 0.0)),
    'forearm': ('upperarm', (0.0, 0.0, -UPPER), (-ELBOW, 0.0, 0.0)),
    'hand': ('forearm', (0.0, 0.0, -FORE), (0.0, 0.0, 0.0)),
}
_CENTRE = [
    ('pelvis', None, (0.0, 0.0, HIP_Z), (0.0, 0.0, 0.0)),
    ('spine', 'pelvis', (0.0, 0.0, PELVIS_TO_WAIST), (0.0, 0.0, 0.0)),
    ('chest', 'spine', (0.0, 0.0, WAIST), (0.0, 0.0, 0.0)),
    ('neck', 'chest', (0.0, 0.0, CHEST), (0.0, 0.0, 0.0)),
    ('head', 'neck', (0.0, 0.0, NECK), (0.0, 0.0, 0.0)),
]
# the energy blade's emitter axis runs along the hand's forward grip (+ hilt up the fist)
BLADE = ('hand.R', (0.030, -0.20, -0.165), (90.0, 0.0, 0.0))


def _bones():
    out = list(_CENTRE)
    for side, s in (('L', 1), ('R', -1)):
        for name in ('thigh', 'shin', 'foot', 'wheel', 'upperarm', 'forearm', 'hand'):
            parent, (x, y, z), (rx, ry, rz) = _LEFT[name]
            p = parent if parent in ('pelvis', 'chest') else '%s.%s' % (parent, side)
            out.append(('%s.%s' % (name, side), p, (s * x, y, z), (rx, s * ry, s * rz)))
    out.append(('blade', BLADE[0], BLADE[1], BLADE[2]))
    return out


BONES = _bones()
NAMES = [b[0] for b in BONES]
PARENT = {b[0]: b[1] for b in BONES}


def local_matrix(name):
    _, _, t, r = next(b for b in BONES if b[0] == name)
    return Matrix.Translation(Vector(t)) @ Euler([math.radians(a) for a in r], 'XYZ').to_matrix().to_4x4()


def rest_world():
    """World matrix of every bone frame in the rest pose."""
    W = {}
    for name, parent, _, _ in BONES:
        L = local_matrix(name)
        W[name] = L if parent is None else W[parent] @ L
    return W


def height_of_joints():
    W = rest_world()
    return {n: tuple(round(v, 3) for v in W[n].translation) for n in NAMES}
