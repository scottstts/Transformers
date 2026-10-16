"""The rear end, measured from back.JPG at the tail plane (603 px per metre,
image centre column 1024 = x 0, deck edge row 608 = z 0.903) and cross-checked
against the side frame (lower lip bottom z 0.17, the lower tail's rake).

  light-bar housing  gloss black, z 0.822-0.900, |x| <= 0.806, inset in the tail
  red bar            z 0.858-0.879 at the centre, 0.011 lower at its ends (arched)
  smoked lenses      z 0.825-0.850, |x| 0.358-0.800
  tail panel         ledge z 0.822 -> 0.785, centre facet |x| 0.36 (top) - 0.47
                     (bottom) down to z 0.655, side facets folding back to the corners
  plate              |x| <= 0.143, z 0.620-0.757, embossed RDSTR; camera above it
  reflectors         z 0.600-0.610, |x| 0.645-0.806
  mask (U frame)     top z 0.61 flat to |x| 0.41, shoulders to (0.587, 0.52),
                     walls |x| 0.587 down to the lip
  nozzle slot        z 0.49-0.61, nozzles at |x| 0.118 / 0.343, z 0.551, ring r 0.040
  fan cells          z 0.294-0.477, walls at x 0, +-0.28; fans at |x| 0.14 / 0.42, z 0.386
  lower lip          z 0.17-0.294, centre tab to 0.155 for |x| < 0.25
  side pods          |x| 0.60 - body side, z 0.38 - 0.61, rounded lower outer corner
"""
import math
import bpy
from mathutils import Vector
from . import kit as K, body as B

FACE_Y = 2.163           # the tail's flat rear face (deck edge, band, top corners)
BAND = (0.822, 0.900)
MASK_TOP, MASK_X = 0.614, 0.594    # back.JPG at the tail plane
LIP = (0.170, 0.294)
SLOT = (0.485, 0.610)
NOZZLES = ((0.114, 0.543), (0.340, 0.543))
POD_BOTTOM = 0.38


def rake_y(z):
    """Lower tail face (side frame: y 2.135 at z 0.70, 2.033 at z 0.21): y at height z."""
    return 2.033 + (z - 0.21) * (0.102 / 0.49)


# The opening in the tail for the propulsion assembly (back.JPG, tail plane): the
# guard pillars' outer faces at |x| 0.594 below the shelf, the shroud's sides at
# 0.582 above it, its 45-degree top chamfers from (0.582, 0.535) to (0.505, 0.614).
MASK_POLY = [(0.594, 0.150), (0.594, 0.488), (0.582, 0.496), (0.582, 0.535), (0.505, 0.614)]


def mask_outline(n_arc=10):
    """The opening's outline (x, z), counter-clockwise from the bottom right."""
    pts = list(MASK_POLY)
    return pts + [(-x, z) for x, z in reversed(pts)]


def prism_xz(m, outline, y0, y1, mat, y_of=None):
    """Extrude an (x, z) outline along y; y_of(z) can rake the rear face."""
    front = [Vector((x, y0, z)) for x, z in outline]
    back = [Vector((x, (y_of(z) if y_of else y1), z)) for x, z in outline]
    return m.loft([front, back], mat)


def rounded_rect(hw, z0, z1, r, n=4):
    """(x, z) outline of a rounded rectangle centred on x = 0."""
    pts = []
    for cx, cz, a0 in ((hw - r, z0 + r, -90), (hw - r, z1 - r, 0), (-hw + r, z1 - r, 90), (-hw + r, z0 + r, 180)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def cutters():
    """Solids cut from the shell before panelling: band housing recess and the mask."""
    m = K.Mesh()
    hw = 0.808
    m.hull([(sx * hw, y, z) for sx in (-1, 1) for y in (FACE_Y - 0.020, FACE_Y + 0.2) for z in BAND], 'satin')
    mm = K.Mesh()
    prism_xz(mm, mask_outline(), 1.62, 2.6, 'satin')   # deep enough for the ducts and engines
    pm = K.Mesh()   # the tail panel sits in its own recess
    pm.hull([(sx * 0.802, y, z) for sx in (-1, 1) for y in (FACE_Y - 0.060, FACE_Y + 0.2) for z in (0.635, BAND[0] + 0.001)], 'satin')
    return [m, mm, pm]


def light_bar(node):
    m = K.Mesh()
    yb = FACE_Y - 0.020
    # gloss black housing, its ends cut square to the tail corners
    m.hull([(sx * 0.806, y, z) for sx in (-1, 1) for y in (yb, FACE_Y - 0.004) for z in (BAND[0] + 0.002, BAND[1] - 0.002)],
           'carbon')
    # red bar: arched, its ends 11 mm lower than its centre
    n = 24
    top, bot = [], []
    for i in range(n + 1):
        x = -0.800 + 1.600 * i / n
        dz = -0.011 * (x / 0.8) ** 2
        top.append((x, 0.879 + dz))
        bot.append((x, 0.858 + dz))
    ring_f = [Vector((x, FACE_Y - 0.002, z)) for x, z in bot] + [Vector((x, FACE_Y - 0.002, z)) for x, z in reversed(top)]
    ring_b = [p - Vector((0, 0.010, 0)) for p in ring_f]
    m.loft([ring_b, ring_f], 'tail')
    # smoked lower lenses
    for sx in (-1, 1):
        m.hull([(sx * x, y, z) for x in (0.358, 0.800) for y in (FACE_Y - 0.012, FACE_Y - 0.003) for z in (0.826, 0.849)],
               'smoke')

    m.build('car.tail.lightbar', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0012)
    # a small chrome script centred under the bar
    lettering(node, 'TESLA', (0.0, FACE_Y - 0.0045, 0.836), 0.006, 0.0010, 'chrome', 'car.tail.script')


def tail_panel(node):
    """The body-colour panel under the bar (back.JPG): a ledge sloping out from
    the bar housing to a crease at z 0.785, a near-vertical face below it, and
    outboard of |x| 0.45 the panel folds back toward the corners. Lofted across
    the car from per-x sections so the folds are true creases on one surface."""
    m = K.Mesh()
    top, ledge, bot = BAND[0], 0.785, 0.638
    back = FACE_Y - 0.052
    # back.JPG: diagonal facet boundaries run from columns 807/1241 at
    # the ledge to 741/1307 at the lower edge (603 px/m, centre 1024).
    # Build these as edges of the surface, not a constant-x fold or shading.
    rows = [(top, -.016, .360), (ledge + .004, .001, .360),
            (ledge, .003, .360), (ledge - .007, -.009, .365),
            (bot + .004, .003, .470), (bot, -.001, .470)]
    verts = []
    for z, offset, crease in rows:
        for x in (-.800, -crease, 0.0, crease, .800):
            fold = max(0.0, (abs(x) - crease) / (.800 - crease)) * .030
            verts.append((x, FACE_Y + offset - fold, z))
    n = len(verts)
    verts += [(x, back, z) for x, y, z in verts]
    faces = []
    for j in range(len(rows) - 1):
        for i in range(4):
            a = j * 5 + i
            faces += [(a, a + 1, a + 6, a + 5),
                      (a + n, a + 5 + n, a + 6 + n, a + 1 + n)]
    perimeter = list(range(5)) + [j * 5 + 4 for j in range(1, len(rows))] \
        + list(range(n - 2, n - 6, -1)) + [j * 5 for j in range(len(rows) - 2, 0, -1)]
    for a, b in zip(perimeter, perimeter[1:] + perimeter[:1]):
        faces.append((a, a + n, b + n, b))
    m.add(verts, faces, 'paint')
    m.build('car.tail.panel', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0008, smooth_angle=1)
    # plate: rounded, with a raised border and embossed lettering
    p = K.Mesh()
    yp = FACE_Y + 0.004
    outer = rounded_rect(0.143, 0.620, 0.757, 0.012, 5)
    p.loft([[Vector((x, yp, z)) for x, z in outer], [Vector((x, yp + 0.008, z)) for x, z in outer]], 'plate')
    p.loft([[Vector((x, yp + 0.0105, z)) for x, z in rounded_rect(0.141, 0.622, 0.755, 0.011, 5)],
            [Vector((x, yp + 0.0105, z)) for x, z in rounded_rect(0.136, 0.627, 0.750, 0.009, 5)],
            [Vector((x, yp + 0.007, z)) for x, z in rounded_rect(0.136, 0.627, 0.750, 0.009, 5)],
            [Vector((x, yp + 0.007, z)) for x, z in rounded_rect(0.141, 0.622, 0.755, 0.011, 5)],
            [Vector((x, yp + 0.0105, z)) for x, z in rounded_rect(0.141, 0.622, 0.755, 0.011, 5)]], 'plate', cap=False)
    p.build('car.tail.plate', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0008)
    lettering(node, 'RDSTR', (0.0, yp + 0.008, 0.6885), 0.060, 0.0025, 'plate', 'car.tail.plate.text')
    # camera: a small black pod under the ledge, above the plate
    c = K.Mesh()
    rr = rounded_rect(0.026, 0.767, 0.785, 0.007, 4)
    c.loft([[Vector((x, FACE_Y - 0.004, z)) for x, z in rr],
            [Vector((x, FACE_Y + 0.008, z)) for x, z in rr],
            [Vector((x * 0.92, FACE_Y + 0.011, 0.776 + (z - 0.776) * 0.80)) for x, z in rr]], 'carbon')
    c.lathe([(0.0, 0.0), (0.0, 0.0055), (0.0015, 0.0052), (0.0025, 0.004), (0.003, 0.0)], 'glass',
            (0, FACE_Y + 0.0108, 0.776), (0, 1, 0), 20)
    c.build('car.tail.camera', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.001)
    # red reflector strips on the lower black band
    r = K.Mesh()
    for sx in (-1, 1):
        r.hull([(sx * x, rake_y(z) + depth, z) for x in (0.645, 0.806)
                for depth in (-0.004, 0.0008) for z in (0.600, 0.610)],
               'tail')
    r.build('car.tail.reflectors', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.001)


def lettering(node, text, centre, height, depth, mat, name):
    """Embossed text: a font curve converted to a closed mesh, centred, reading
    from behind the car (text x -> world -X, text up -> +Z, extrusion -> +Y)."""
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = text
    cu.extrude = 0.05
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.resolution_u = 8
    tmp = bpy.data.objects.new(name + '.tmp', cu)
    bpy.data.collections['90_REVIEW_STAGE'].objects.link(tmp)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    s = height / (max(ys) - min(ys))
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    inv = node.matrix_basis.inverted()
    c = Vector(centre)
    for v in me.vertices:
        x, yv, z = v.co
        v.co = inv @ (c + Vector((-(x - cx) * s, (z + 0.05) / 0.10 * depth, (yv - cy) * s)))
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(K.MATERIALS[mat])
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.data.collections['01_CAR'].objects.link(o)
    o.parent = node
    o[K.TAG] = True
    K.PARTS.append(o)
    return o


def build(node):
    light_bar(node)
    tail_panel(node)
    from . import propulsion
    propulsion.build(node)
