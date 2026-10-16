"""The flight pack's lid: a two-leaf tonneau that seals the tail's open mouth
(the pack's top) at the end of the transformation.

The pack's rim (near wall top, both side bands, the rear glass's top edge) lies
on one plane in the stand pose: z = Z0 - SLOPE (y - Y0) (world, frame END).
Both leaves lie on it closed. Folded face to face, the pair stands upright
inside the near wall (a solid 75 mm slab, 0.89 m deep), hidden in the car and
through the whole transformation. Towards the end it rises out of the wall top,
the front leaf swings back about the near rim onto the mouth carrying the rear
leaf, and the rear leaf unfolds onto the far half.

Only the lid's own nodes are keyed (children of the tail's node, local
matrices); no other track changes. Geometry and keys are authored in the stand
pose's world frame and stored in the tail's frame.
"""
import math
import bpy
from mathutils import Vector, Matrix
from . import kit as K, hs
from .bake import _keys, ease

END = 270
FPS = 30
Y0, Z0, SLOPE = 0.766, 5.3494, 0.351    # hinge line (on the near wall, its stowed stack inside it) and the rim plane (+3 mm)
HALF = 0.850                             # half width: over the side bands' inner edge (|x| 0.84)
T = 0.025                                # leaf thickness (the folded pair, 50 mm, inside the 75 mm wall)
RISE = 0.56                              # stowed depth below the hinge (inside the near wall)
SPLIT = 1.2535                           # world y of the leaves' joint (half the centre length)
# the far edge (rear glass top) seen from above, (|x|, y), less 10 mm (the glass's rounded edge
# stands a few mm proud of the plane); the corner reaches over the side band's end
FAR = [(0.0, 1.727), (0.30, 1.722), (0.50, 1.695), (0.60, 1.635), (0.70, 1.575), (0.80, 1.515), (HALF, 1.498)]
# timeline (seconds): rise, front leaf swings over, rear leaf unfolds. The head is tipped back
# over the near wall through the landing; the stack stands up only once it has come forward.
T_RISE, T_SWING, T_UNFOLD, T_DONE = 8.20, 8.45, 8.72, 8.97
ALPHA = math.atan(SLOPE)


def far_y(x):
    ax = abs(x)
    for (x0, y0), (x1, y1) in zip(FAR, FAR[1:]):
        if x0 <= ax <= x1:
            return y0 + (y1 - y0) * (ax - x0) / (x1 - x0)
    return FAR[-1][1]


def s_of(y):
    """Plane distance from the hinge line to world y."""
    return (y - Y0) / math.cos(ALPHA)


def leaf_outline(front):
    """(x, s) outline in the leaf's own frame (s along the plane from its hinge)."""
    xs = [-HALF + 2 * HALF * i / 16 for i in range(17)]
    s_split = s_of(SPLIT)
    if front:
        return [(x, 0.0) for x in xs] + [(x, s_split) for x in reversed(xs)]
    far = [(x, s_of(far_y(x)) - s_split) for x in reversed(xs)]
    return [(x, 0.0) for x in xs] + far


def slab(m, outline, z0, z1, ch, mat):
    """A leaf: the outline extruded from z0 to z1, its top edge chamfered."""
    n = len(outline)
    P = [Vector(p) for p in outline]
    area = sum(P[i].x * P[(i + 1) % n].y - P[(i + 1) % n].x * P[i].y for i in range(n))
    sg = 1 if area > 0 else -1          # inward normal of edge e is sg * (-e.y, e.x)
    top, bot = max(z0, z1), min(z0, z1)
    ring_t = []
    for i in range(n):
        e1 = (P[i] - P[i - 1]).normalized()
        e2 = (P[(i + 1) % n] - P[i]).normalized()
        n1 = Vector((-e1.y, e1.x)) * sg
        n2 = Vector((-e2.y, e2.x)) * sg
        bis = n1 + n2
        q = P[i] + bis.normalized() * (ch / max(0.2, bis.length / 2)) if bis.length > 1e-6 else P[i]
        ring_t.append(Vector((q.x, q.y, top)))
    ring_b = [Vector((p.x, p.y, bot)) for p in P]
    ring_m = [Vector((p.x, p.y, top - ch)) for p in P]
    return m.loft([ring_b, ring_m, ring_t], mat)


def knuckles(m, axis_pt, spans, r, mat='gunmetal'):
    for x0, x1 in spans:
        m.cyl(axis_pt + Vector((x0, 0, 0)), axis_pt + Vector((x1, 0, 0)), r, mat, 20)


def meshes():
    a, b = K.Mesh(), K.Mesh()
    s_split = s_of(SPLIT)
    slab(a, leaf_outline(True), 0.0, T, 0.006, 'trim')
    slab(b, leaf_outline(False), -T, 0.0, 0.006, 'trim')
    # hinge rail under the front edge: seats on the near wall's flat top, which drops
    # below the rim plane toward the robot
    a.hull([Vector((x, s, z)) for x in (-HALF + 0.01, HALF - 0.01) for s, z in
            ((0.004, 0.0), (0.040, 0.0), (0.004, -0.012), (0.032, -0.012))], 'gunmetal')
    # front hinge (the near rim) and the joint, alternating knuckles
    knuckles(a, Vector((0, 0.0, 0.010)), [(-0.80, -0.62), (-0.10, 0.10), (0.62, 0.80)], 0.011)
    knuckles(a, Vector((0, s_split, T)), [(-0.80, -0.60), (-0.20, 0.20), (0.60, 0.80)], 0.009)
    knuckles(b, Vector((0, 0.0, 0.0)), [(-0.58, -0.22), (0.22, 0.58)], 0.009)
    return a, b


def frame_a(t):
    """The front leaf's frame in the stand pose's world: origin on the hinge line,
    y along the leaf, z its top face's normal."""
    r = RISE * (1 - ease(min(1.0, max(0.0, (t - T_RISE) / (T_SWING - T_RISE)))))
    u = ease(min(1.0, max(0.0, (t - T_SWING) / (T_UNFOLD - T_SWING))))
    phi = math.radians(90) + (-ALPHA - math.radians(90)) * u
    return Matrix.Translation((0, Y0, Z0 - r)) @ Matrix.Rotation(phi, 4, 'X')


def frame_b(t):
    """The rear leaf in the front leaf's frame: hinged on its top face at the joint,
    folded back over it (180 deg) until it unfolds."""
    u = ease(min(1.0, max(0.0, (t - T_UNFOLD) / (T_DONE - T_UNFOLD))))
    return Matrix.Translation((0, s_of(SPLIT), T)) @ Matrix.Rotation(math.radians(180) * (1 - u), 4, 'X')


def build():
    """Create (or rebuild) the lid's nodes and meshes and key them. Run after the
    transformation is baked: the tail's node track is the host."""
    sc = bpy.context.scene
    for n in ('car.lid.A', 'car.lid.B', 'bone.asm.lid.B', 'bone.asm.lid.A'):
        o = bpy.data.objects.get(n)
        if o is not None:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
    tail = bpy.data.objects['bone.asm.tail']
    f0 = sc.frame_current
    sc.frame_set(END)
    tail_end = tail.matrix_world.copy()
    na = K.node('asm.lid.A', size=0.1)
    na.parent = tail
    na.matrix_parent_inverse = Matrix.Identity(4)
    nb = K.node('asm.lid.B', size=0.1)
    nb.parent = na
    nb.matrix_parent_inverse = Matrix.Identity(4)
    a, b = meshes()
    for mesh, node, name in ((a, na, 'car.lid.A'), (b, nb, 'car.lid.B')):
        o = mesh.build(name, '01_CAR', parent=node, bevel=0.002, smooth_angle=30)
        K.PARTS.remove(o)
    frames = list(range(0, END + 1))
    inv = tail_end.inverted()
    _keys(na, frames, [inv @ frame_a(f / FPS) for f in frames])
    _keys(nb, frames, [frame_b(f / FPS) for f in frames])
    sc.frame_set(f0)
    return ['car.lid.A', 'car.lid.B']
