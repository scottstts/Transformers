"""Robot skeleton: rest datums, forward kinematics, and Blender empties.

Rest pose = the standing robot, arms hanging straight, every bone's local axes
aligned with the character axes (+X left, -Y forward, +Z up). A pose gives each
bone a local rotation (about its joint) and a local slide (telescoping joints).

A heavy hauler, ~7.4 m to the crown (the Cybertruck robot is 5.8 m). In the
truck it sits upright in the cab facing forward, its legs straight back along
the frame rails: the cab front is its chest, the drive tandem rides its shins
and the rear crossmember halves are its heels (fold.py).
"""
import bpy
from mathutils import Vector, Matrix, Quaternion
from .kit import V


ANKLE_Z = 0.55
SHIN = 1.85
THIGH = 1.80
HIP_Z = ANKLE_Z + SHIN + THIGH          # 4.20
HIP_X = 0.64
WAIST_Z = HIP_Z + 0.40
CHEST_Z = WAIST_Z + 0.42
SHOULDER_Z = CHEST_Z + 1.28
SHOULDER_X = 1.62
CLAV_X = 0.60                           # shoulder slide pivot (the arm socket rides out of the chest)
UPPER = 1.40
FORE = 1.30
NECK_Z = CHEST_Z + 1.24
HEAD_Z = NECK_Z + 0.34
TOE_F = 0.50                            # toe hinge ahead of the ankle
ROBOT_F = -0.55                         # standing station: in front of the van box it docks with

FINGERS = ('index', 'middle', 'ring', 'pinky')
PALM = 0.30
PHAL = (0.170, 0.130, 0.110)


def bone_defs():
    """(name, parent, head (x, f, z) at rest)."""
    B = [
        ('pelvis', None, (0, 0, HIP_Z)),
        ('spine', 'pelvis', (0, 0, WAIST_Z)),
        ('chest', 'spine', (0, 0, CHEST_Z)),
        ('neck', 'chest', (0, 0.0, NECK_Z)),
        ('head', 'neck', (0, 0.0, HEAD_Z)),
    ]
    for S, s in (('L', 1), ('R', -1)):
        B += [
            ('clav.' + S, 'chest', (s * CLAV_X, 0, SHOULDER_Z)),              # prismatic shoulder slide
            ('upperarm.' + S, 'clav.' + S, (s * SHOULDER_X, 0, SHOULDER_Z)),
            ('forearm.' + S, 'upperarm.' + S, (s * SHOULDER_X, 0, SHOULDER_Z - UPPER)),
            ('hand.' + S, 'forearm.' + S, (s * SHOULDER_X, 0, SHOULDER_Z - UPPER - FORE)),
            ('hip.' + S, 'pelvis', (s * HIP_X, 0, HIP_Z)),
            ('thigh.' + S, 'hip.' + S, (s * HIP_X, 0, HIP_Z)),
            ('shin.' + S, 'thigh.' + S, (s * HIP_X, 0, HIP_Z - THIGH)),
            ('foot.' + S, 'shin.' + S, (s * HIP_X, 0, ANKLE_Z)),
            ('toe.' + S, 'foot.' + S, (s * HIP_X, TOE_F, 0.12)),
        ]
        wz = SHOULDER_Z - UPPER - FORE
        # fingers hang from the knuckle line; palm faces inward (-s x)
        for i, fn in enumerate(FINGERS):
            f0 = 0.120 - i * 0.080
            z = wz - PALM
            B.append(('%s1.%s' % (fn, S), 'hand.' + S, (s * SHOULDER_X, f0, z)))
            z -= PHAL[0]
            B.append(('%s2.%s' % (fn, S), '%s1.%s' % (fn, S), (s * SHOULDER_X, f0, z)))
            z -= PHAL[1]
            B.append(('%s3.%s' % (fn, S), '%s2.%s' % (fn, S), (s * SHOULDER_X, f0, z)))
        B.append(('thumb1.' + S, 'hand.' + S, (s * (SHOULDER_X - 0.13), 0.14, wz - 0.09)))
        B.append(('thumb2.' + S, 'thumb1.' + S, (s * (SHOULDER_X - 0.155), 0.215, wz - 0.25)))
        B.append(('thumb3.' + S, 'thumb2.' + S, (s * (SHOULDER_X - 0.165), 0.255, wz - 0.38)))
    return B


class Skeleton:
    def __init__(self):
        self.defs = bone_defs()
        self.names = [d[0] for d in self.defs]
        self.parent = {d[0]: d[1] for d in self.defs}
        self.head = {d[0]: V(*d[2]) for d in self.defs}
        self.offset = {}
        for n, p, _ in self.defs:
            self.offset[n] = self.head[n] - (self.head[p] if p else Vector((0, 0, 0)))
        self.children = {n: [] for n in self.names}
        for n, p, _ in self.defs:
            if p:
                self.children[p].append(n)

    def fk(self, pose, root=None):
        """pose: name -> (Quaternion rot, Vector slide) local. root: world matrix
        for the pelvis joint frame (defaults to rest at ROBOT_F).
        Returns name -> world Matrix of each joint frame."""
        W = {}
        for n in self.names:
            rot, slide = pose.get(n, (Quaternion(), Vector()))
            p = self.parent[n]
            if p is None:
                base = root if root is not None else Matrix.Translation(self.head[n] + V(0, ROBOT_F, 0))
                W[n] = base @ rot.to_matrix().to_4x4()
            else:
                W[n] = W[p] @ Matrix.Translation(self.offset[n] + slide) @ rot.to_matrix().to_4x4()
        return W


def sync_empties(skel, coll, W=None):
    """Create/refresh one empty per bone at world matrices W (rest if None)."""
    objs = {}
    for n in skel.names:
        name = 'bone.' + n
        o = bpy.data.objects.get(name)
        if o is None:
            o = bpy.data.objects.new(name, None)
            coll.objects.link(o)
            o.empty_display_type = 'PLAIN_AXES'
            o.empty_display_size = 0.12
        o.rotation_mode = 'QUATERNION'
        objs[n] = o
    for n in skel.names:
        o = objs[n]
        p = skel.parent[n]
        o.parent = objs[p] if p else None
        o.matrix_parent_inverse = Matrix.Identity(4)
    Wd = W or skel.fk({})
    for n in skel.names:
        p = skel.parent[n]
        objs[n].matrix_basis = (Wd[p].inverted() @ Wd[n]) if p else Wd[n]
    return objs
