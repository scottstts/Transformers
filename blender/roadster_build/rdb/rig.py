"""Robot skeleton: rest datums, forward kinematics, Blender empties.

Rest = the standing robot (arms hanging, every joint frame aligned with the
character axes: +X left, -Y forward, +Z up), standing at ROBOT_Y. A pose gives a
joint a local rotation about its head and a local slide (telescoping joints:
the legs and neck telescope and the shoulders slide inboard in the car).

A ~5.5 m robot, the Cybertruck's size class: very broad shoulders under the
front wheels, a deep chest that wears the car's nose, long legs.
"""
from mathutils import Vector, Matrix, Quaternion
from . import kit as K

ROBOT_Y = -1.00
ANKLE_Z = 0.40
SHIN = 1.30
THIGH = 1.24
HIP_Z = ANKLE_Z + SHIN + THIGH          # 2.94
HIP_X = 0.42
WAIST_Z = HIP_Z + 0.34
CHEST_Z = WAIST_Z + 0.40                # 3.68
SHOULDER_Z = CHEST_Z + 0.92             # 4.60
SHOULDER_X = 1.10
CLAV_X = 0.42
UPPER = 1.00
FORE = 0.95
NECK_Z = CHEST_Z + 1.02
HEAD_Z = NECK_Z + 0.16
TOE_Y = -0.34

FINGERS = ('index', 'middle', 'ring', 'pinky')
PALM = 0.22
PHAL = (0.105, 0.085, 0.070)


def defs():
    """(name, parent, head (x, y, z) at rest, world space)."""
    y0 = ROBOT_Y
    B = [('pelvis', None, (0, y0, HIP_Z)),
         ('spine', 'pelvis', (0, y0, WAIST_Z)),
         ('chest', 'spine', (0, y0, CHEST_Z)),
         ('neck', 'chest', (0, y0 + 0.02, NECK_Z)),
         ('head', 'neck', (0, y0 + 0.02, HEAD_Z))]
    for S, s in (('L', 1), ('R', -1)):
        wz = SHOULDER_Z - UPPER - FORE
        B += [('clav.' + S, 'chest', (s * CLAV_X, y0, SHOULDER_Z)),
              ('upperarm.' + S, 'clav.' + S, (s * SHOULDER_X, y0, SHOULDER_Z)),
              ('forearm.' + S, 'upperarm.' + S, (s * SHOULDER_X, y0, SHOULDER_Z - UPPER)),
              ('hand.' + S, 'forearm.' + S, (s * SHOULDER_X, y0, wz)),
              ('hip.' + S, 'pelvis', (s * HIP_X, y0, HIP_Z)),
              ('thigh.' + S, 'hip.' + S, (s * HIP_X, y0, HIP_Z)),
              ('shin.' + S, 'thigh.' + S, (s * HIP_X, y0, HIP_Z - THIGH)),
              ('foot.' + S, 'shin.' + S, (s * HIP_X, y0, ANKLE_Z)),
              ('toe.' + S, 'foot.' + S, (s * HIP_X, y0 + TOE_Y, 0.10))]
        # fingers hang from the knuckle line, front to back; the palm faces inward (-s x)
        for i, fn in enumerate(FINGERS):
            fy = y0 - 0.090 + i * 0.060
            z = wz - PALM
            B.append(('%s1.%s' % (fn, S), 'hand.' + S, (s * SHOULDER_X, fy, z)))
            z -= PHAL[0]
            B.append(('%s2.%s' % (fn, S), '%s1.%s' % (fn, S), (s * SHOULDER_X, fy, z)))
            z -= PHAL[1]
            B.append(('%s3.%s' % (fn, S), '%s2.%s' % (fn, S), (s * SHOULDER_X, fy, z)))
        B.append(('thumb1.' + S, 'hand.' + S, (s * (SHOULDER_X - 0.09), y0 - 0.10, wz - 0.07)))
        B.append(('thumb2.' + S, 'thumb1.' + S, (s * (SHOULDER_X - 0.11), y0 - 0.16, wz - 0.18)))
        B.append(('thumb3.' + S, 'thumb2.' + S, (s * (SHOULDER_X - 0.12), y0 - 0.19, wz - 0.27)))
    return B


DEFS = defs()
HEADS = {n: Vector(h) for n, p, h in DEFS}
PARENT = {n: p for n, p, h in DEFS}


def rest(name):
    return Matrix.Translation(HEADS[name])


def worlds(pose=None, root=None):
    """pose: {name: (Quaternion, slide Vector)}; root: world matrix override for
    the pelvis (rotation and position of its head). Returns {name: Matrix}."""
    pose = pose or {}
    out = {}
    for n, p, h in DEFS:
        q, slide = pose.get(n, (Quaternion(), Vector()))
        if p is None:
            base = root if root is not None else Matrix.Translation(HEADS[n])
            out[n] = base @ Matrix.Translation(slide) @ q.to_matrix().to_4x4()
        else:
            off = HEADS[n] - HEADS[p]
            out[n] = out[p] @ Matrix.Translation(off + slide) @ q.to_matrix().to_4x4()
    return out


def create():
    for n, p, h in DEFS:
        o = K.node('robot.' + n, size=0.06)
        o.matrix_basis = Matrix.Translation(HEADS[n] - (HEADS[p] if p else Vector()))
    for n, p, h in DEFS:
        if p:
            K.NODES['robot.' + n].parent = K.NODES['robot.' + p]


def apply(W):
    """Write world matrices into the parented empties' bases."""
    for n, p, h in DEFS:
        o = K.NODES['robot.' + n]
        o.matrix_basis = (W[p].inverted() @ W[n]) if p else W[n]
