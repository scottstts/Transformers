"""Robot skeleton: rest datums, forward kinematics, and Blender empties.

Rest pose = the standing robot, arms hanging straight, every bone's local axes
aligned with the character axes (+X left, -Y forward, +Z up). A pose gives each
bone a local rotation (about its joint) and a local slide (telescoping joints:
the thigh and shin telescope in the car, the spine and neck compress).

A 5.4 m heavy (the Cybertruck robot is 5.8 m): broad shoulders under the front
wheels, a narrow waist, long legs. In the car it lies face down in a pike: the
legs forward under the torso with the feet pointed behind the front wheels,
the torso on top carrying the canopy as its back (fold.py).
"""
import bpy
from mathutils import Vector, Matrix, Quaternion
from .kit import V


ANKLE_Z = 0.40
SHIN = 1.20
THIGH = 1.16
HIP_Z = ANKLE_Z + SHIN + THIGH          # 2.76
HIP_X = 0.40
WAIST_Z = HIP_Z + 0.32
CHEST_Z = WAIST_Z + 0.36
SHOULDER_Z = CHEST_Z + 0.96             # 4.40
SHOULDER_X = 1.18
CLAV_X = 0.44                           # shoulder slide pivot (the arm socket rides out of the chest)
UPPER = 0.98
FORE = 0.92
NECK_Z = CHEST_Z + 1.08
HEAD_Z = NECK_Z + 0.18
TOE_F = 0.46                            # toe hinge ahead of the ankle
ROBOT_F = -0.60                         # standing station

FINGERS = ('index', 'middle', 'ring', 'pinky')
PALM = 0.26
PHAL = (0.125, 0.100, 0.085)


def bone_defs():
    """(name, parent, head (x, f, z) at rest)."""
    B = [
        ('pelvis', None, (0, 0, HIP_Z)),
        ('spine', 'pelvis', (0, 0, WAIST_Z)),
        ('chest', 'spine', (0, 0, CHEST_Z)),
        ('neck', 'chest', (0, -0.02, NECK_Z)),
        ('head', 'neck', (0, -0.02, HEAD_Z)),
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
            ('toe.' + S, 'foot.' + S, (s * HIP_X, TOE_F, 0.10)),
        ]
        wz = SHOULDER_Z - UPPER - FORE
        # fingers hang from the knuckle line; palm faces inward (-s x)
        for i, fn in enumerate(FINGERS):
            f0 = 0.105 - i * 0.070
            z = wz - PALM
            B.append(('%s1.%s' % (fn, S), 'hand.' + S, (s * SHOULDER_X, f0, z)))
            z -= PHAL[0]
            B.append(('%s2.%s' % (fn, S), '%s1.%s' % (fn, S), (s * SHOULDER_X, f0, z)))
            z -= PHAL[1]
            B.append(('%s3.%s' % (fn, S), '%s2.%s' % (fn, S), (s * SHOULDER_X, f0, z)))
        B.append(('thumb1.' + S, 'hand.' + S, (s * (SHOULDER_X - 0.11), 0.12, wz - 0.08)))
        B.append(('thumb2.' + S, 'thumb1.' + S, (s * (SHOULDER_X - 0.135), 0.185, wz - 0.22)))
        B.append(('thumb3.' + S, 'thumb2.' + S, (s * (SHOULDER_X - 0.145), 0.22, wz - 0.33)))
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
