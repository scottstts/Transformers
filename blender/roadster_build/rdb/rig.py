"""Robot skeleton: rest datums, forward kinematics, Blender empties.

Rest = the standing robot (arms hanging, every joint frame aligned with the
character axes: +X left, -Y forward, +Z up), standing at ROBOT_Y. A pose gives a
joint a local rotation about its head and a local slide (telescoping joints:
the clavicles slide inboard, the neck and the legs telescope while folded).

A 6.0 m robot (head top; the Cybertruck's size class). Datums come from the
concept sheet's front and side views at 0.00725 m per pixel (ground row 928):
head top 6.00, chin 5.35, chest top 5.42, light bar 4.67, chest bottom 4.44,
pelvis belt 4.02, knee 2.38, ankle 0.74, elbow 4.19, wrist 3.12, fingertips
2.60, shoulder joint 5.07 at |x| 1.04 on the sheet, moved out to 1.28 so the
pauldrons clear the nose clip's fenders (the chest's flanks) through the arms'
swing.
"""
from mathutils import Vector, Matrix, Quaternion
from . import kit as K

ROBOT_Y = 0.0
ANKLE_Z = 0.74
SHIN = 1.62
THIGH = 1.26
HIP_Z = ANKLE_Z + SHIN + THIGH          # 3.62
HIP_X = 0.50
WAIST_Z = 4.00
CHEST_Z = 4.42
NECK_Y, NECK_Z = 0.30, 5.24
HEAD_Z = 5.36                           # head pivot (skull base); sphere centre HEAD_C above it
HEAD_C = 0.30
HEAD_R = 0.27
SHOULDER_Y, SHOULDER_Z = 0.10, 5.07
SHOULDER_X = 1.28
CLAV_X = 0.40
UPPER = 0.89
FORE = 1.07
TOE_Y, TOE_Z = -0.50, 0.15              # toe hinge ahead of the ankle

FINGERS = ('index', 'middle', 'ring', 'pinky')
PALM = 0.235
PHAL = (0.115, 0.090, 0.075)


def defs():
    """(name, parent, head (x, y, z) at rest, world space)."""
    y0 = ROBOT_Y
    B = [('pelvis', None, (0, y0, HIP_Z)),
         ('spine', 'pelvis', (0, y0 + 0.04, WAIST_Z)),
         ('chest', 'spine', (0, y0 + 0.06, CHEST_Z)),
         ('neck', 'chest', (0, y0 + NECK_Y, NECK_Z)),
         ('head', 'neck', (0, y0 + NECK_Y - 0.06, HEAD_Z))]
    sy = y0 + SHOULDER_Y
    for S, s in (('L', 1), ('R', -1)):
        wz = SHOULDER_Z - UPPER - FORE
        B += [('clav.' + S, 'chest', (s * CLAV_X, sy, SHOULDER_Z)),
              ('upperarm.' + S, 'clav.' + S, (s * SHOULDER_X, sy, SHOULDER_Z)),
              ('forearm.' + S, 'upperarm.' + S, (s * SHOULDER_X, sy, SHOULDER_Z - UPPER)),
              ('hand.' + S, 'forearm.' + S, (s * SHOULDER_X, sy, wz)),
              ('hip.' + S, 'pelvis', (s * HIP_X, y0, HIP_Z)),
              ('thigh.' + S, 'hip.' + S, (s * HIP_X, y0, HIP_Z)),
              ('shin.' + S, 'thigh.' + S, (s * HIP_X, y0, HIP_Z - THIGH)),
              ('foot.' + S, 'shin.' + S, (s * HIP_X, y0, ANKLE_Z)),
              ('toe.' + S, 'foot.' + S, (s * HIP_X, y0 + TOE_Y, TOE_Z))]
        # fingers hang from the knuckle line, front to back; the palm faces inward (-s x)
        for i, fn in enumerate(FINGERS):
            fy = sy - 0.105 + i * 0.070
            z = wz - PALM
            B.append(('%s1.%s' % (fn, S), 'hand.' + S, (s * SHOULDER_X, fy, z)))
            z -= PHAL[0]
            B.append(('%s2.%s' % (fn, S), '%s1.%s' % (fn, S), (s * SHOULDER_X, fy, z)))
            z -= PHAL[1]
            B.append(('%s3.%s' % (fn, S), '%s2.%s' % (fn, S), (s * SHOULDER_X, fy, z)))
        B.append(('thumb1.' + S, 'hand.' + S, (s * (SHOULDER_X - 0.10), sy - 0.12, wz - 0.08)))
        B.append(('thumb2.' + S, 'thumb1.' + S, (s * (SHOULDER_X - 0.125), sy - 0.18, wz - 0.20)))
        B.append(('thumb3.' + S, 'thumb2.' + S, (s * (SHOULDER_X - 0.135), sy - 0.21, wz - 0.30)))
    return B


DEFS = defs()
NAMES = [n for n, p, h in DEFS]
HEADS = {n: Vector(h) for n, p, h in DEFS}
PARENT = {n: p for n, p, h in DEFS}
OFFSET = {n: HEADS[n] - (HEADS[p] if p else Vector()) for n, p, h in DEFS}


def rest(name):
    return Matrix.Translation(HEADS[name])


def worlds(pose=None, root=None):
    """pose: {name: (Quaternion, slide Vector)}; root: world matrix of the pelvis
    joint frame (default: its rest). Returns {name: Matrix}."""
    pose = pose or {}
    out = {}
    for n, p, h in DEFS:
        q, slide = pose.get(n, (Quaternion(), Vector()))
        if p is None:
            base = root if root is not None else Matrix.Translation(HEADS[n])
            out[n] = base @ Matrix.Translation(slide) @ q.to_matrix().to_4x4()
        else:
            out[n] = out[p] @ Matrix.Translation(OFFSET[n] + slide) @ q.to_matrix().to_4x4()
    return out


def create():
    for n, p, h in DEFS:
        o = K.node('robot.' + n, size=0.06)
        o.matrix_basis = Matrix.Translation(OFFSET[n])
    for n, p, h in DEFS:
        if p:
            K.NODES['robot.' + n].parent = K.NODES['robot.' + p]
    K.NODES['robot.pelvis'].matrix_basis = rest('pelvis')


def apply(W):
    """Write world matrices into the parented empties' bases."""
    for n, p, h in DEFS:
        o = K.NODES['robot.' + n]
        o.matrix_basis = (W[p].inverted() @ W[n]) if p else W[n]
