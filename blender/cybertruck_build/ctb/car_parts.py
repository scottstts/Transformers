"""Cybertruck exterior hardware: cladding, bumpers, lamps, mirrors, wiper, wheels."""
import math
from mathutils import Vector, Matrix
from . import kit
from . import car_body as B
from .kit import V
from .car_body import (NOSE, XS, FA, RA, WR, WX, belt, ztop, xtop, ARCH_HW, ARCH_LEG, ARCH_TW,
                       ARCH_TOP, FLARE_W, FASCIA_BOTTOM, TAILGATE_BOTTOM, SILL, BAND, G)

GROUND_Z = 0.36          # lowest body line (rocker / bumper bottoms)


def arch_path(a, front_leg_bottom, rear_leg_bottom):
    """Opening outline as an open polyline, rear leg bottom -> front leg bottom
    (side view (f, z)); its left side faces away from the opening."""
    return [(a - ARCH_HW, rear_leg_bottom), (a - ARCH_HW, ARCH_LEG), (a - ARCH_TW, ARCH_TOP),
            (a + ARCH_TW, ARCH_TOP), (a + ARCH_HW, ARCH_LEG), (a + ARCH_HW, front_leg_bottom)]


def flare(name, a, s, legs, coll):
    """Wheel-arch cladding: a flat band proud of the skin with a return lip."""
    path = arch_path(a, *legs)
    # (offset from opening, lateral from side plane) - closed L profile
    prof = [(0.0, -0.085), (0.02, -0.085), (0.02, 0.001), (FLARE_W, 0.001), (FLARE_W, 0.030), (FLARE_W - 0.012, 0.046), (0.0, 0.046)]
    # the path runs rear leg -> over the top -> front leg; its left side faces away from the opening
    to3d = lambda p, w: V(s * (XS + w), p[0], p[1])
    m = kit.molding(path, prof, to3d)
    b = kit.Builder().add_mesh(m, 'plastic')
    o = b.build(name, coll)
    kit.finish(o, 0.004, 2, 30)
    return o


def liner(name, a, s, legs, depth, coll):
    """Wheel-well tunnel and inner wall, seen through the arch around the tyre.
    depth: inner wall distance from the side plane (front wells clear full steering lock)."""
    path = arch_path(a, *legs)
    prof = [(0.020, -0.085), (0.042, -0.085), (0.042, -depth), (0.020, -depth)]
    to3d = lambda p, w: V(s * (XS + w), p[0], p[1])
    b = kit.Builder()
    b.add_mesh(kit.molding(path, prof, to3d), 'interior')
    # inner wall closing the well
    wall = kit.offset_poly(kit.ccw(B.arch_opening(a)), 0.036)
    wall = [(f, max(z, legs[0] if f > a else legs[1])) for f, z in wall]
    xw0, xw1 = XS - depth, XS - depth + 0.02
    verts = [V(s * xw0, f, z) for f, z in wall] + [V(s * xw1, f, z) for f, z in wall]
    n = len(wall)
    faces = [list(range(n)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    b.add(verts, faces, 'interior')
    o = b.build(name, coll)
    kit.finish(o, 0.003, 1, 40)
    return o


def rocker(name, s, f0, f1, coll):
    """Black sill cladding under the doors (profile extruded along f)."""
    top = SILL - 0.003
    prof = [(XS - BAND - 0.02, top), (XS - 0.026, top), (XS - 0.014, 0.455), (XS - 0.03, GROUND_Z + 0.012),
            (XS - 0.055, GROUND_Z), (XS - 0.075, GROUND_Z + 0.01), (XS - 0.075, top)]
    verts = [V(s * x, f0, z) for x, z in prof] + [V(s * x, f1, z) for x, z in prof]
    n = len(prof)
    faces = [list(range(n)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    o = kit.Builder().add(verts, faces, 'plastic').build(name, coll)
    kit.finish(o, 0.004, 2, 25)
    return o


CASSETTE_IN = 0.12        # door inner panel depth behind the side plane
GLASS_SLOT = (0.902, 0.970)   # x band between the inner panel frame and the skin's inner face
# (the tumblehome glass is a ruled surface: +-2 deg twist at its ends needs the 5 cm slot)


def cassette(name, s, f0, f1, coll):
    """Door inner structure: inner panel + perimeter frame, with an open slot between
    frame and skin for the roll-down window. Seated on the skin's inner face through
    the bottom rail only (the glass runs in the slot at the ends)."""
    b = kit.Builder()
    x_in0, x_in1 = XS - CASSETTE_IN, XS - CASSETTE_IN + 0.022
    fa, fb = f0 + 0.018, f1 - 0.018
    top = lambda f: belt(f) - 0.035
    panel = [(fa, 0.535), (fb, 0.535), (fb, top(fb)), (fa, top(fa))]
    xs = lambda a, c: (min(s * a, s * c), max(s * a, s * c))
    M, d = None, None
    b.add_mesh(_plate_x(panel, *xs(x_in0, x_in1)), 'graphite')
    # end frames: inner panel out to the slot's inner edge
    for f_lo, f_hi in ((fa, fa + 0.04), (fb - 0.04, fb)):
        b.add_mesh(_plate_x([(f_lo, 0.535), (f_hi, 0.535), (f_hi, top(f_hi)), (f_lo, top(f_lo))], *xs(x_in1 - 0.004, GLASS_SLOT[0] - 0.002)), 'graphite')
    # bottom rail: full depth to the lower band's inner face (below the glass travel)
    b.add_mesh(_plate_x([(fa, 0.515), (fb, 0.515), (fb, 0.553), (fa, 0.553)], *xs(x_in1 - 0.004, XS - BAND * 0.55 - 0.028 - 0.003)), 'graphite')
    o = b.build(name, coll)
    kit.finish(o, 0.004, 2, 30)
    return o


def _plate_x(outline_fz, x0, x1):
    verts = [V(x0, f, z) for f, z in outline_fz] + [V(x1, f, z) for f, z in outline_fz]
    n = len(outline_fz)
    faces = [list(range(n)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return verts, faces


def block(top_poly_xf, side_poly_fz, slot, name, coll, z=(0.2, 1.5), x=(-1.6, 1.6)):
    """Solid = top-view prism ∩ side-view prism (profile in two views)."""
    a = kit.cutter_obj(B.top_prism(top_poly_xf, z[0], z[1], shrink=0), name)
    a.hide_viewport = False
    a.hide_render = False
    a.data.materials.clear()
    a.data.materials.append(kit.mats.get(slot))
    kit.boolean(a, kit.cutter_obj(B.side_prism(side_poly_fz, x[0], x[1], shrink=0)), 'INTERSECT')
    if a.users_collection and a.users_collection[0] != coll:
        for c in list(a.users_collection):
            c.objects.unlink(a)
        coll.objects.link(a)
    return a


def front_bumper(S, s, coll):
    """Black front bumper half, split at NOSE_SPLIT into toe-cap and foot-guard pieces."""
    f_back = B.BUMPER_F
    fn = NOSE + 0.012
    xm = B.NOSE_SPLIT
    side = [(f_back, GROUND_Z), (NOSE - 0.12, GROUND_Z), (fn, 0.47), (fn, FASCIA_BOTTOM - G), (f_back, FASCIA_BOTTOM - G)]
    tops = {
        'fbumper.' + S: [(G, f_back), (xm - G, f_back), (xm - G, fn), (G, fn)],
        'fbumperO.' + S: [(xm + G, f_back), (XS + 0.004, f_back), (XS + 0.004, NOSE - 0.07), (XS - 0.07, fn), (xm + G, fn)],
    }
    sx = lambda x0, x1: (min(s * x0, s * x1), max(s * x0, s * x1))
    floor_i, floor_l = fn - 0.06, fn - 0.028
    intake = B.side_prism([(floor_i, 0.45), (fn + 0.1, 0.45), (fn + 0.1, 0.62), (floor_i, 0.62)], *sx(0.012, 0.66), shrink=0)
    lamp = B.side_prism([(floor_l, 0.69), (fn + 0.1, 0.69), (fn + 0.1, 0.748), (floor_l, 0.748)], *sx(0.64, 0.905), shrink=0)
    out = []
    for name, top in tops.items():
        o = block(top if s > 0 else B.mirror_poly_x(top), side, 'plastic', name, coll)
        outer = name.startswith('fbumperO')
        kit.cut(o, intake, lamp) if outer else kit.cut(o, intake)
        # grille slats rooted in the pocket floor, lamp lens seated on its pocket floor
        b = kit.Builder()
        x0, x1 = (xm + G + 0.006, 0.654) if outer else (0.018, xm - G - 0.006)
        for i in range(4):
            z = 0.478 + i * 0.037
            b.add_mesh(kit.box((x1 - x0, 0.05, 0.012), (s * (x0 + x1) / 2, -(floor_i + 0.021), z)), 'graphite')
        if outer:
            b.add_mesh(kit.box((0.245, 0.02, 0.04), (s * 0.7725, -(floor_l + 0.0095), 0.719)), 'lightWhite')
        kit.append_builder(o, b)
        kit.finish(o, 0.005, 2, 30)
        out.append(o)
    return out


def rear_bumper(S, s, coll):
    """Black rear bumper half: a raked wedge standing 5 cm proud of the tailgate's foot, its underside
    rising from the wheel arch to the tail."""
    f_front = B.REAR_BUMPER_F
    z_top, z_low = TAILGATE_BOTTOM - G, 0.48
    ft = B.rear_face_f(TAILGATE_BOTTOM) - 0.05             # rearmost edge (top)
    face = lambda z: ft + (z_top - z) * B.REAR_RAKE         # raked parallel to the rear face
    top = [(G, ft), (XS - 0.06, ft), (XS + 0.004, ft + 0.08), (XS + 0.004, f_front), (G, f_front)]
    side = [(face(z_low), z_low), (f_front, GROUND_Z), (f_front, z_top), (ft, z_top)]
    o = block(top if s > 0 else B.mirror_poly_x(top), side, 'plastic', 'rbumper.' + S, coll)
    sx = lambda x0, x1: (min(s * x0, s * x1), max(s * x0, s * x1))
    recess = lambda z0, z1, d: [(ft - 0.1, z0), (face(z0) + d, z0), (face(z1) + d, z1), (ft - 0.1, z1)]
    plate = B.side_prism(recess(0.525, 0.675, 0.018), *sx(0.012, 0.17), shrink=0)
    refl = B.side_prism(recess(0.61, 0.642, 0.012), *sx(0.76, 0.92), shrink=0)
    # hidden pocket in the inboard top behind a 6 cm outer wall: the folded robot's helmet sits there
    pocket = [(-0.01, ft + 0.06), (0.34, ft + 0.06), (0.34, f_front + 0.1), (-0.01, f_front + 0.1)]
    pocket = B.top_prism(pocket if s > 0 else B.mirror_poly_x(pocket), 0.595, 1.0, shrink=0)
    kit.cut(o, plate, refl, pocket)
    b = kit.Builder()
    zr = 0.626
    M = Matrix.Translation(V(s * 0.84, face(zr) + 0.0055, zr)) @ Matrix.Rotation(-math.atan(B.REAR_RAKE), 4, 'X')
    b.add_mesh(kit.box((0.144, 0.013, 0.024), M=M), 'reflector')
    kit.append_builder(o, b)
    kit.finish(o, 0.005, 2, 30)
    return [o]


def front_lightbar(nose_objs, S, s, coll):
    """Groove along the top of both fascia pieces, black channel and LED strip in each."""
    sx = (min(s * 0.0, s * 0.978), max(s * 0.0, s * 0.978))
    groove = B.side_prism([(NOSE - 0.018, 1.022), (NOSE + 0.1, 1.022), (NOSE + 0.1, 1.048), (NOSE - 0.018, 1.048)], *sx, shrink=0)
    for nose_obj in nose_objs:
        # bevel/wnormal were added by panel(); booleans must precede them
        nose_obj.modifiers.clear()
        kit.cut(nose_obj, groove)
        kit.finish(nose_obj, 0.004, 2, 15)
    xm = B.NOSE_SPLIT
    out = []
    for name, (a, b_) in (('lightbar.' + S, (G + 0.006, xm - G - 0.006)), ('lightbarO.' + S, (xm + G + 0.006, 0.971))):
        b = kit.Builder()
        x0, x1 = s * a, s * b_
        # channel seated on the groove floor, LED strip proud of the channel, both 5 mm clear of the groove walls
        b.add_mesh(kit.box((abs(x1 - x0), 0.006, 0.016), ((x0 + x1) / 2, -(NOSE - 0.015), 1.035)), 'plastic')
        b.add_mesh(kit.box((abs(x1 - x0) - 0.004, 0.006, 0.008), ((x0 + x1) / 2, -(NOSE - 0.009), 1.035)), 'lightWhite')
        o = b.build(name, coll)
        kit.finish(o, 0.0015, 1, 30)
        out.append(o)
    return out


def rear_lightbar(coll):
    b = kit.Builder()
    # LED lens seated in the light-band groove (floor 4 mm into the raked face), 1 mm proud
    z = sum(B.LIGHTBAR_GROOVE) / 2
    M = Matrix.Translation(V(0.0, B.rear_face_f(z) + 0.0015, z)) @ Matrix.Rotation(-math.atan(B.REAR_RAKE), 4, 'X')
    b.add_mesh(kit.box((1.89, 0.005, 0.026), M=M), 'lightRed')
    o = b.build('taillight', coll)
    kit.finish(o, 0.002, 1, 30)
    return o


def side_marker(name, s, f, slot, coll):
    """Lens seated in the fender pocket (pocket floor at XS - 0.004), 1 mm proud."""
    b = kit.Builder()
    b.add_mesh(kit.box((0.005, 0.12, 0.016), (s * (XS - 0.0015), -f, 0.885)), slot)
    o = b.build(name, coll)
    kit.finish(o, 0.0015, 1, 30)
    return o


def mirror(S, s, coll):
    """Door mirror: faceted wedge housing on a short arm rooted in the door's top edge."""
    f0 = 1.02
    zb = belt(f0)
    center = V(s * (XS + 0.105), f0, zb + 0.085)
    b = kit.Builder()
    # arm: embedded in the door skin below the seal, rising out into the housing
    p0 = V(s * (XS - 0.012), f0 - 0.01, zb - 0.02)
    p1 = center + V(-s * 0.012, 0.0, -0.01)
    b.add_mesh(kit.bar(p0, p1, kit.chamfer_rect(0.044, 0.03, 0.009), kit.chamfer_rect(0.034, 0.026, 0.008)), 'plastic')
    # housing: lofted faceted wedge, long axis along f, tapered to the rear
    secs = [kit.chamfer_rect(0.045, 0.075, 0.012), kit.chamfer_rect(0.07, 0.105, 0.02), kit.chamfer_rect(0.062, 0.095, 0.018), kit.chamfer_rect(0.03, 0.06, 0.01)]
    M = Matrix.Translation(center) @ Matrix.Rotation(math.radians(90), 4, 'X')
    b.add_mesh(kit.section_loft(secs, [-0.13, -0.08, 0.04, 0.09], M=M), 'plastic')
    o = b.build('mirror.' + S, coll)
    kit.finish(o, 0.003, 2, 30)
    return o


def wiper(S, s, coll):
    """Wiper parked along the windshield base, pivoting on the cowl near the outer edge.
    One per half: each lower windshield half rides its own shin, and the blade stays inside it."""
    slope = (B.Z_APEX - B.Z_NOSE) / (NOSE - B.APEX)
    n = Vector((0, -slope, 1)).normalized()          # front deck: z = c + slope * Y
    f_piv, f_tip = B.WS_BASE + B.COWL / 2, B.WS_BASE - 0.10
    pivot = V(s * 0.66, f_piv, ztop(f_piv))
    tip = V(s * 0.07, f_tip, ztop(f_tip))
    d = (tip - pivot)
    d = d - n * d.dot(n)
    L = d.length
    M = kit.frame_from(pivot, d, n)                     # x along the blade, y = deck normal
    b = kit.Builder()
    # pivot boss: shaft seated 1 mm into the cowl, boss clear of the cowl edges
    b.add_mesh(kit.revolve([(0, -0.001), (0.03, -0.001), (0.03, 0.018), (0.02, 0.032), (0, 0.032)], 20,
                           M=kit.frame_from(pivot, (1, 0, 0), n) @ Matrix.Rotation(-math.pi / 2, 4, 'X')), 'graphite')
    b.add_mesh(kit.box((L - 0.02, 0.016, 0.02), ((L + 0.02) / 2, 0.003 + 0.008, 0.0), M=M), 'plastic')
    b.add_mesh(kit.box((L * 0.62, 0.012, 0.016), (L * 0.31, 0.019 + 0.006, 0.0), M=M), 'graphite')
    o = b.build('wiper.' + S, coll)
    kit.finish(o, 0.002, 1, 30)
    return o


# -------------------------------------------------------------------- wheels

def tyre_and_wheel(name, coll):
    """35-inch all-terrain tyre on a 20-inch rim with the aero cover.
    Local frame: axle along +X (outer face +X), centre at the origin."""
    b = kit.Builder()
    R, W = WR, 0.285
    hw = W / 2
    # carcass profile (r, x) from the inner bead around the crown to the outer bead
    prof = [(0.262, -hw + 0.02), (0.30, -hw - 0.004), (0.36, -hw - 0.008), (0.405, -hw + 0.004), (0.424, -hw + 0.02),
            (0.428, -hw + 0.05), (0.428, hw - 0.05), (0.424, hw - 0.02), (0.405, hw - 0.004), (0.36, hw + 0.008),
            (0.30, hw + 0.004), (0.262, hw - 0.02)]
    tyre = kit.revolve([(r, x) for r, x in prof], 72, axis='X')
    b.add_mesh(tyre, 'rubber')
    # tread: two staggered rows of blocks + shoulder lugs
    npitch = 36
    blk = kit.bevel_prism(kit.chamfer_rect(0.095, 0.058, 0.012), 0.0, 0.022, 0.004, 1)
    shoulder = kit.bevel_prism(kit.chamfer_rect(0.05, 0.045, 0.01), 0.0, 0.03, 0.004, 1)
    for i in range(npitch):
        for row, (xc, off) in enumerate(((-0.058, 0.0), (0.058, 0.5))):
            ang = 2 * math.pi * (i + off) / npitch
            Mb = Matrix.Rotation(ang, 4, 'X') @ Matrix.Translation((xc, 0, 0.424)) @ Matrix.Rotation(math.radians(8 if row else -8), 4, 'Z')
            b.add_mesh(kit.transform(blk, Mb), 'rubber')
        for side in (-1, 1):
            ang = 2 * math.pi * (i + 0.25) / npitch
            Ms = Matrix.Rotation(ang, 4, 'X') @ Matrix.Translation((side * (hw - 0.004), 0, 0.408)) @ Matrix.Rotation(math.radians(90 * side), 4, 'Y') @ Matrix.Translation((0, 0, -0.012))
            b.add_mesh(kit.transform(shoulder, Ms), 'rubber')
    # rim barrel and back face
    b.add_mesh(kit.revolve([(0.0, -0.11), (0.255, -0.11), (0.262, -0.1), (0.262, 0.1), (0.0, 0.1)], 48, axis='X'), 'aeroDark')
    # aero cover: shallow dish with six raised angular spokes and a hex cap
    cover = kit.revolve([(0.0, 0.118), (0.12, 0.118), (0.24, 0.112), (0.262, 0.104), (0.262, 0.096), (0.0, 0.096)], 48, axis='X')
    b.add_mesh(cover, 'aeroDark')
    spoke = kit.bevel_prism([(0.07, -0.032), (0.245, -0.07), (0.245, 0.01), (0.07, 0.032)], 0.0, 0.014, 0.004, 1)
    for k in range(6):
        Mk = Matrix.Rotation(2 * math.pi * k / 6, 4, 'X') @ Matrix.Rotation(math.radians(90), 4, 'Y') @ Matrix.Rotation(math.radians(-90), 4, 'Z')
        b.add_mesh(kit.transform(spoke, Matrix.Translation((0.116, 0, 0)) @ Mk), 'aero')
    b.add_mesh(kit.revolve([(0.0, 0.14), (0.052, 0.14), (0.06, 0.13), (0.06, 0.115), (0.0, 0.115)], 6, axis='X'), 'graphite')
    b.add_mesh(kit.revolve([(0.0, 0.146), (0.028, 0.146), (0.028, 0.138), (0.0, 0.138)], 6, axis='X'), 'darkSteel')
    o = b.build(name, coll)
    o.data.set_sharp_from_angle(angle=math.radians(35))
    return o


def build(coll, body):
    parts = {}
    legs_front = (GROUND_Z + 0.06, GROUND_Z + 0.04)
    legs_rear = (GROUND_Z + 0.04, GROUND_Z + 0.06)
    for S, s in (('L', 1), ('R', -1)):
        parts['flareF.' + S] = flare('flareF.' + S, FA, s, legs_front, coll)
        parts['flareR.' + S] = flare('flareR.' + S, RA, s, legs_rear, coll)
        parts['linerF.' + S] = liner('linerF.' + S, FA, s, legs_front, 0.54, coll)
        # rear wheels do not steer: 5 cm tyre clearance, and the folded shoulder rides above the shallower well
        parts['linerR.' + S] = liner('linerR.' + S, RA, s, legs_rear, 0.34, coll)
        # rockers end at the door seams: each door carries only its own cladding; the quarter keeps the
        # short piece between the rear door and the rear flare
        parts['rockerQ.' + S] = rocker('rockerQ.' + S, s, RA + ARCH_HW + FLARE_W - 0.02, B.R_SEAM - G, coll)
        parts['rockerR.' + S] = rocker('rockerR.' + S, s, B.R_SEAM + G, B.B_SEAM - G, coll)
        parts['rockerF.' + S] = rocker('rockerF.' + S, s, B.B_SEAM + G, min(B.A_BASE, FA - ARCH_HW - FLARE_W) - G - 0.003, coll)
        parts['doorIn.' + S] = cassette('doorIn.' + S, s, B.B_SEAM + G, B.A_BASE - G, coll)
        parts['rdoorIn.' + S] = cassette('rdoorIn.' + S, s, B.R_SEAM + G, B.B_SEAM - G, coll)
        for o in front_bumper(S, s, coll) + rear_bumper(S, s, coll):
            parts[o.name] = o
        for o in front_lightbar([body['nose.' + S], body['noseO.' + S]], S, s, coll):
            parts[o.name] = o
        parts['marker.' + S] = side_marker('marker.' + S, s, NOSE - 0.16, 'lightAmber', coll)
        parts['mirror.' + S] = mirror(S, s, coll)
        parts['wiper.' + S] = wiper(S, s, coll)
    parts['taillight'] = rear_lightbar(coll)
    for S, s in (('L', 1), ('R', -1)):
        for axle, f in (('F', FA), ('R', RA)):
            w = tyre_and_wheel('wheel%s.%s' % (axle, S), coll)
            if s < 0:
                w.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
                w.data.flip_normals()
            w.location = V(s * WX, f, WR)
            parts[w.name] = w
    return parts
