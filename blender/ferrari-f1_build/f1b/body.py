"""Body skins and panel cutting.

The outer surface is the continuous body cage (bodycage.py). A skin
is a solidified (inward) copy of it, with the cockpit, the sidepod inlets and the
airbox intake cut as real apertures. Every body panel is the intersection of the skin with
region prisms; neighbouring regions share exact seam lines and are each
shrunk by G, giving a uniform 2G reveal without gaps or overlaps.

Panel map (the car's section bands become the limbs lying face up in them):
    toe      f > 2.42                 instep ridge of the foot (nose tip half)
    shin     1.40 .. 2.42             shin plate (nose half)
    thigh    0.42 .. 1.40             thigh plate (survival-cell / cockpit side)
    hip      0.10 .. 0.42             hip guard (cockpit rear rim)
    chest    -0.70 .. 0.10  (top)     chest plate: roll hoop, airbox, engine-cover front
    belly    -0.70 .. 0.10  (bottom)  back plate
    hood     -1.40 .. -0.70 (top)     collar wings (the engine cover over the head)
    nape     -1.40 .. -0.70 (bottom)  back plate under the head
    tail     f < -1.40                backpack: gearbox, crash structure (rear corners ride it)
    podF     x > POD_SEAM, 0.18 .. 0.975   forearm (the inlet becomes the cuff)
    podM     x > POD_SEAM, -0.52 .. 0.18   upper arm
    podR     x > POD_SEAM, f < -0.52       pauldron
Livery (white) is painted by splitting faces along livery planes, never with seams.
"""
import math
import bmesh
import bpy
from mathutils import Vector
from . import kit, hull, dims as D
from .kit import V

G = D.G
POD_SEAM = 0.335
S_TOE, S_KNEE, S_HIP, S_WAIST, S_NECK, S_TAIL = 2.420, 1.400, 0.420, 0.100, -0.700, -1.400
S_POD_F, S_POD_R = 0.180, -0.520   # sidepod: forearm (inlet) / upper arm / pauldron
POD_FRONT = 0.975          # region line just ahead of the pod's flank station (0.96): the inlet face is the pod's
Z_BELLY = 0.360            # chest band: front (top) / back (bottom)
Z_HOOD = 0.400             # head band: collar wings (top) / nape (bottom)


def top_prism(poly_xf, z0, z1, shrink=G):
    """Prism from a top-view polygon (x, f)."""
    p = kit.offset_poly(kit.ccw(poly_xf), -shrink) if shrink else poly_xf
    n = len(p)
    verts = [V(x, f, z0) for x, f in p] + [V(x, f, z1) for x, f in p]
    faces = [list(range(n)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return verts, faces


def side_prism(poly_fz, x0, x1, shrink=G):
    p = kit.offset_poly(kit.ccw(poly_fz), -shrink) if shrink else poly_fz
    n = len(p)
    verts = [V(x0, f, z) for f, z in p] + [V(x1, f, z) for f, z in p]
    faces = [list(range(n)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return verts, faces


def front_prism(poly_xz, f0, f1, shrink=0.0):
    p = kit.offset_poly(kit.ccw(poly_xz), -shrink) if shrink else poly_xz
    n = len(p)
    verts = [V(x, f0, z) for x, z in p] + [V(x, f1, z) for x, z in p]
    faces = [list(range(n)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return verts, faces


def mirror_xf(poly):
    return [(-x, f) for x, f in poly]


# ------------------------------------------------------------------ surface

def outer_body(coll):
    """The continuous body surface (bodycage: one subdivision cage, mirrored),
    evaluated to a closed manifold mesh."""
    from . import bodycage
    o = bodycage.build(coll, 'body.outer')
    kit.apply_modifiers(o)
    return o


COCKPIT = [(0.000, 1.080), (0.090, 1.070), (0.160, 1.030), (0.212, 0.960), (0.246, 0.860), (0.262, 0.720),
           (0.268, 0.520), (0.268, 0.300), (0.262, 0.190), (0.246, 0.130), (0.200, 0.104), (0.000, 0.098)]


def cockpit_cutter():
    half = COCKPIT
    poly = half + [(-x, f) for x, f in reversed(half[1:-1])]
    return top_prism(poly, 0.46, 1.30, shrink=0)


def inlet_outline(s=1):
    """Sidepod mouth (x, z): a letterbox under the overhanging shelf lip, its inboard
    edge clear of the chassis flank and its outer edge inside the pod's outer face."""
    pts = kit.fillet_poly([(0.372, 0.392), (0.586, 0.400), (0.590, 0.562), (0.372, 0.566)], 0.030, 4)
    return [(s * x, z) for x, z in pts]


def inlet_cutter(s=1):
    return front_prism(inlet_outline(s), D.POD_INLET - 0.24, D.POD_INLET + 0.30)


def intake_outline():
    """Roll-hoop intake mouth (x, z): a rounded triangle, wide at the base."""
    return kit.fillet_poly([(-0.084, 0.724), (0.084, 0.724), (0.050, 0.912), (-0.050, 0.912)], 0.022, 4)


def intake_cutter():
    return front_prism(intake_outline(), -0.40, 0.20)


def skin(outer, name, thickness, coll):
    o = outer.copy()
    o.data = outer.data.copy()
    o.name = name
    coll.objects.link(o)
    # the inner face and rims of the composite skin are bare carbon, the outer face is painted
    o.data.materials.append(kit.mats.get('carbonMatte'))
    m = kit.solidify(o, thickness, offset=-1.0)
    m.material_offset = len(o.data.materials) - 1
    m.material_offset_rim = len(o.data.materials) - 1
    kit.apply_modifiers(o)
    kit.cut(o, cockpit_cutter())
    kit.cut(o, inlet_cutter(1))
    kit.cut(o, inlet_cutter(-1))
    kit.cut(o, intake_cutter())
    return o


def cut_region(sk, name, cutters, coll):
    o = sk.copy()
    o.data = sk.data.copy()
    o.name = name
    coll.objects.link(o)
    for m in cutters:
        kit.boolean(o, kit.cutter_obj(m), 'INTERSECT')
    return o


# ------------------------------------------------------------------ regions (L side; R mirrored)
BIG = 2.0


def regions():
    """Sided regions: name -> (top-view polygon (x, f) of the L side, z band or None)."""
    R = {}
    R['toe'] = ([(0.0, S_TOE), (BIG, S_TOE), (BIG, 3.4), (0.0, 3.4)], None)
    R['shin'] = ([(0.0, S_KNEE), (BIG, S_KNEE), (BIG, S_TOE), (0.0, S_TOE)], None)
    R['thigh'] = ([(0.0, S_HIP), (POD_SEAM, S_HIP), (POD_SEAM, POD_FRONT), (BIG, POD_FRONT), (BIG, S_KNEE), (0.0, S_KNEE)], None)
    R['hip'] = ([(0.0, S_WAIST), (POD_SEAM, S_WAIST), (POD_SEAM, S_HIP), (0.0, S_HIP)], None)
    R['hood'] = ([(0.0, S_TAIL), (POD_SEAM, S_TAIL), (POD_SEAM, S_NECK), (0.0, S_NECK)], (Z_HOOD, 2.0))
    R['podF'] = ([(POD_SEAM, S_POD_F), (BIG, S_POD_F), (BIG, POD_FRONT), (POD_SEAM, POD_FRONT)], None)
    R['podM'] = ([(POD_SEAM, S_POD_R), (BIG, S_POD_R), (BIG, S_POD_F), (POD_SEAM, S_POD_F)], None)
    R['podR'] = ([(POD_SEAM, S_TAIL), (BIG, S_TAIL), (BIG, S_POD_R), (POD_SEAM, S_POD_R)], None)
    return R


def region_z(zr):
    """Horizontal seam band (with the standard reveal) for regions split by height."""
    if zr is None:
        return []
    z0, z1 = zr
    return [side_prism([(-3.0, z0), (3.5, z0), (3.5, z1), (-3.0, z1)], -BIG, BIG)]


def centre_regions():
    """Centre panels spanning the centreline: name -> (polygon, z0, z1)."""
    chest = [(-POD_SEAM, S_NECK), (POD_SEAM, S_NECK), (POD_SEAM, S_WAIST), (-POD_SEAM, S_WAIST)]
    nape = [(-POD_SEAM, S_TAIL), (POD_SEAM, S_TAIL), (POD_SEAM, S_NECK), (-POD_SEAM, S_NECK)]
    tail = [(-BIG, -3.4), (BIG, -3.4), (BIG, S_TAIL), (-BIG, S_TAIL)]
    return {
        'chest': (chest, Z_BELLY, 2.0),
        'belly': (chest, -1.0, Z_BELLY),
        'nape': (nape, -1.0, Z_HOOD),
        'tail': (tail, -1.0, 2.0),
    }


# ------------------------------------------------------------------ livery

def paint_split(o, planes, slot='paintWhite'):
    """Bisect o along each plane (co, no) and paint faces on the positive side of
    ALL planes with `slot` (red elsewhere). Clean painted edges, no seams."""
    me = o.data
    names = [m.name[3:] for m in me.materials]
    if slot not in names:
        me.materials.append(kit.mats.get(slot))
        names.append(slot)
    k = names.index(slot)
    red = names.index('paint') if 'paint' in names else 0
    bm = bmesh.new()
    bm.from_mesh(me)
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=V(*co), plane_no=V(*no).normalized())
    for f in bm.faces:
        if f.material_index != red:
            continue
        c = f.calc_center_median()
        if all((c - V(*co)).dot(V(*no)) > 0 for co, no in planes):
            f.material_index = k
    bm.to_mesh(me)
    bm.free()
    me.update()


def livery(parts):
    """SF-25 (HP) scheme: white engine cover from the roll hoop back over the legs,
    the edge falling toward the tail; red below and on the survival cell."""
    # white above a plane rising toward the roll hoop (normal: up, tilted rearward)
    plane = ((0.0, -0.30, 0.655), (0.0, -0.13, 1.0))     # design normal: boundary falls 0.13 m per metre aft
    for name, o in parts.items():
        base = name.split('.')[0]
        if base in ('chest', 'hood', 'tail', 'podR'):
            planes = [plane]
            if base == 'chest':
                planes.append(((0.0, -0.10, 0.0), (0.0, -1.0, 0.0)))     # white starts behind the roll hoop
            paint_split(o, planes)


# ------------------------------------------------------------------ joint notches
def joint_notches():
    """Side-view (f, z) notch prisms at the fold knee and elbow: the back of the
    knee and the inside of the elbow are windowed so the sleeves clear each
    other through deep flexion (the set position bends the knees ~110 deg)."""
    from . import rig, fold
    W = fold.world(rig.Skeleton())
    k = W['shin.L'].translation
    e = W['forearm.L'].translation
    fk, zk = -k.y, k.z
    fe, ze = -e.y, e.z
    knee = [(fk - 0.270, 1.40), (fk + 0.270, 1.40), (fk + 0.035, zk + 0.070), (fk - 0.035, zk + 0.070)]
    elbow = [(fe - 0.190, -0.60), (fe + 0.190, -0.60), (fe + 0.030, ze - 0.070), (fe - 0.030, ze - 0.070)]
    return {'knee': side_prism(knee, -BIG, BIG, shrink=0), 'elbow': side_prism(elbow, -BIG, BIG, shrink=0)}


NOTCHED = {}         # the supine fold keeps every limb straight: no sleeve crosses a joint


def notch(parts):
    cut = joint_notches()
    for name, o in parts.items():
        which = NOTCHED.get(name.split('.')[0])
        if which and len(o.data.polygons):
            kit.cut(o, cut[which])


# ------------------------------------------------------------------ build

def build(coll):
    outer = outer_body(coll)
    sk = skin(outer, 'skin.body', D.SKIN, coll)
    parts = {}
    for base, (poly, zr) in regions().items():
        for S, s in (('L', 1), ('R', -1)):
            p = poly if s > 0 else mirror_xf(poly)
            # the centreline seam: each half stops G short of x = 0
            cut = [top_prism(p, -1.0, 2.0)] + region_z(zr)
            o = cut_region(sk, '%s.%s' % (base, S), cut, coll)
            parts[o.name] = o
    for name, (poly, z0, z1) in centre_regions().items():
        cut = [top_prism(poly, -1.0, 2.0)]
        # the torso bands split top / bottom at Z_BELLY (a side prism with the same reveal)
        cut.append(side_prism([(-3.0, z0), (3.5, z0), (3.5, z1), (-3.0, z1)], -BIG, BIG))
        o = cut_region(sk, name, cut, coll)
        parts[name] = o
    notch(parts)
    livery(parts)
    for o in parts.values():
        kit.finish(o, 0.003, 2, 30)
    for ob in (outer, sk):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.meshes.remove(data)
    return parts
