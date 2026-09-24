"""Cybertruck body: surface definition, skins, and panel cutting.

The body is one continuous outer surface: two vertical side planes with an
inward lower band, ruled 'tumblehome' facets between the beltline and the roof
edge, a flat front deck (hood + windshield) rising to the apex, a flat rear deck
(roof glass + vault) falling to the tail, and vertical front and rear faces.

Skins are solidified copies of that surface. Every panel is the intersection of
a skin with region prisms; neighbouring regions share exact seam vertices and
are each shrunk by G, giving a uniform 2G reveal without gaps or overlaps.
"""
import math
from mathutils import Vector
from . import kit
from .kit import V

# ------------------------------------------------------------------ datums
NOSE, TAIL = 2.84, -2.84          # front / rear faces (forward coordinate)
APEX = 0.32                       # roof apex (windshield / roof glass break), ~43 % of the length from the nose
Z_NOSE, Z_APEX, Z_TAIL = 1.06, 1.80, 1.34
X_NOSE, X_APEX, X_TAIL = 0.93, 0.665, 0.82   # roof-edge half widths
XS = 1.0                          # side plane half width
FA, RA = 1.95, -1.86              # axle stations
WR, WX = 0.445, 0.86              # wheel radius, wheel centre half track
A_BASE = 1.22                     # cowl / A-pillar base station
B_SEAM = 0.05                     # B-pillar seam station (also the roof glass split)
WS_BASE = 2.00                    # windshield base / cowl station, just ahead of the front axle (short hood)
WS_SPLIT = 1.40                   # windshield split: upper glass rides the thigh, lower glass the shin
R_SEAM = -0.98                    # rear door / quarter seam station at the belt
R_SEAM_TOP = -0.92                # ... at the roof edge
F_SEAM_TOP = 1.04                 # front door leading edge at the roof edge
VAULT = -0.95                     # roof glass / vault cover break
LOW = 0.63                        # lower body crease
SILL = 0.50                       # bottom of the side skin
BAND = 0.045                      # lower band inset at the sill
BELT_NOSE, BELT_A, BELT_TAIL = 1.00, 1.17, 1.34   # the sail facet closes at the tail: full-width rear top edge
NOSE_SPLIT = 0.50                 # toe cap / foot guard split of the nose, bumper and light bar
COWL = 0.09                       # black cowl strip between windshield and hood
NOSE_CUT = 0.03                   # nose / hood seam distance behind the front face
FASCIA_BOTTOM = 0.80              # steel fascia / front bumper split
TAILGATE_BOTTOM = 0.72            # rear face 0.62 m tall
REAR_RAKE = 0.13                  # rear face leans back 7.4 deg (bottom edge 8 cm ahead of the top): the most the folded helmet clears
LIGHTBAR_BOTTOM, LIGHTBAR_TOP = 1.215, 1.32   # light band right under a 2 cm steel lip
LIGHTBAR_GROOVE = (1.2495, 1.2855)   # LED channel in the light band
G = 0.0025                        # half reveal (panel gap 5 mm)
SKIN = 0.028                      # stamped steel skin
GLASS = 0.012

ARCH_HW, ARCH_LEG, ARCH_TW, ARCH_TOP = 0.63, 0.61, 0.38, 0.985   # opening hexagon
FLARE_W = FA - ARCH_HW - (A_BASE + 2 * G)   # cladding band round the opening: its rear edge keeps the door reveal
BUMPER_F = FA + ARCH_HW + FLARE_W + 0.003         # front bumper / fender lower edge meets the flare
REAR_BUMPER_F = RA - ARCH_HW - FLARE_W - 0.003
TAIL_CLEAR = TAIL + 0.16          # first surface ring ahead of the raked rear face (clears its foot at the sill)


def rear_face_f(z):
    """Forward station of the raked rear face at height z."""
    return TAIL + (Z_TAIL - z) * REAR_RAKE


def rear_face_region(z0, z1, depth=0.04):
    """Side-view (f, z) region behind the rear face plane + depth, z0..z1 (vertical above the tail top)."""
    poly = [(-3.5, z0), (rear_face_f(z0) + depth, z0)]
    if z1 > Z_TAIL:
        poly += [(TAIL + depth, Z_TAIL), (TAIL + depth, z1)]
    else:
        poly.append((rear_face_f(z1) + depth, z1))
    return poly + [(-3.5, z1)]



def ztop(f):
    if f >= APEX:
        return Z_NOSE + (NOSE - f) / (NOSE - APEX) * (Z_APEX - Z_NOSE)
    return Z_APEX - (APEX - f) / (APEX - TAIL) * (Z_APEX - Z_TAIL)


def xtop(f):
    if f >= APEX:
        return X_NOSE - (NOSE - f) / (NOSE - APEX) * (X_NOSE - X_APEX)
    return X_APEX + (APEX - f) / (APEX - TAIL) * (X_TAIL - X_APEX)


def belt(f):
    if f >= A_BASE:
        return BELT_NOSE + (NOSE - f) / (NOSE - A_BASE) * (BELT_A - BELT_NOSE)
    return BELT_A + (A_BASE - f) / (A_BASE - TAIL) * (BELT_TAIL - BELT_A)


def cham(f, u, s=1):
    """Point on the tumblehome facet: u = 0 at the beltline, 1 at the roof edge."""
    a = V(s * XS, f, belt(f))
    b = V(s * xtop(f), f, ztop(f))
    return a.lerp(b, u)


def arch_opening(a):
    """Wheel-arch opening hexagon in side view (f, z), CCW."""
    return [(a - ARCH_HW, 0.2), (a + ARCH_HW, 0.2), (a + ARCH_HW, ARCH_LEG), (a + ARCH_TW, ARCH_TOP),
            (a - ARCH_TW, ARCH_TOP), (a - ARCH_HW, ARCH_LEG)]


# ----------------------------------------------------------------- surface

def f_samples(step=0.09):
    # the tail ring is sheared onto the raked rear face; the next ring must lie ahead of its foot
    assert rear_face_f(SILL) < TAIL_CLEAR
    breaks = [TAIL_CLEAR, R_SEAM, VAULT, B_SEAM, APEX, A_BASE, NOSE]
    out = [TAIL]
    for i in range(len(breaks) - 1):
        a, b = breaks[i], breaks[i + 1]
        n = max(1, int(math.ceil((b - a) / step)))
        for k in range(n):
            out.append(a + (b - a) * k / n)
    out.append(NOSE)
    return out


def section(f):
    """Cross-section polyline, right sill -> left sill (x, z)."""
    return [(-(XS - BAND), SILL), (-XS, LOW), (-XS, belt(f)), (-xtop(f), ztop(f)),
            (xtop(f), ztop(f)), (XS, belt(f)), (XS, LOW), (XS - BAND, SILL)]


def outer_surface():
    fs = f_samples()
    rings = [[V(x, rear_face_f(z) if f == TAIL else f, z) for (x, z) in section(f)] for f in fs]
    verts, faces = kit.loft(rings, cap_start=False, cap_end=False, close=False)
    n = len(rings[0])
    # front / rear faces close each end (bottom edge left open like the sides)
    last = (len(fs) - 1) * n
    faces.append([last + j for j in range(n)])
    faces.append([j for j in reversed(range(n))])
    return verts, faces


def make_skin(name, thickness, slot, coll):
    v, f = outer_surface()
    o = kit.obj_from_pydata(name, v, f, [slot], coll=coll, smooth=True)
    kit.fix_normals(o)
    # outward check: the top-most face must point up
    me = o.data
    top = max(me.polygons, key=lambda p: p.center.z)
    if top.normal.z < 0:
        me.flip_normals()
    kit.solidify(o, thickness, offset=-1.0)
    kit.apply_modifiers(o)
    return o


# ----------------------------------------------------------------- regions

def side_prism(poly_fz, x0, x1, shrink=G):
    p = kit.offset_poly(kit.ccw(poly_fz), -shrink) if shrink else poly_fz
    n = len(p)
    verts = [V(x0, f, z) for f, z in p] + [V(x1, f, z) for f, z in p]
    faces = [list(range(n)), list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    return verts, faces


def top_prism(poly_xf, z0, z1, shrink=G):
    p = kit.offset_poly(kit.ccw(poly_xf), -shrink) if shrink else poly_xf
    n = len(p)
    verts = [V(x, f, z0) for x, f in p] + [V(x, f, z1) for x, f in p]
    faces = [list(range(n)), list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    return verts, faces


def mirror_poly_x(poly_xf):
    return [(-x, f) for x, f in poly_xf]


def cut_region(skin, name, slot_meshes, coll):
    """Intersect a copy of `skin` with each cutter mesh in turn."""
    o = skin.copy()
    o.data = skin.data.copy()
    o.name = name
    coll.objects.link(o)
    for m in slot_meshes:
        c = kit.cutter_obj(m)
        kit.boolean(o, c, 'INTERSECT')
    return o


def cut_away(o, meshes):
    for m in meshes:
        c = kit.cutter_obj(m)
        kit.boolean(o, c, 'DIFFERENCE')
    return o


# -------------------------------------------------------------- seam network

def s1_x(f):
    """Hood / fender seam (top view), 20 mm inboard of the roof edge."""
    return xtop(f) - 0.02


def line_f_at_z(p0, p1, z):
    (f0, z0), (f1, z1) = p0, p1
    return f0 + (f1 - f0) * (z - z0) / (z1 - z0)


def door_front_seam():
    """Front door leading edge, side view, bottom -> top (beyond the roof)."""
    a = (A_BASE, belt(A_BASE))
    b = (F_SEAM_TOP, ztop(F_SEAM_TOP))
    return [(A_BASE, 0.1), a, b, (line_f_at_z(a, b, 3.2), 3.2)]


def door_rear_seam():
    a = (R_SEAM, belt(R_SEAM))
    b = (R_SEAM_TOP, ztop(R_SEAM_TOP))
    return [(R_SEAM, 0.1), a, b, (line_f_at_z(a, b, 3.2), 3.2)]


NOSE_SEAM_F = NOSE - NOSE_CUT
MITER = NOSE - XS                 # front corner miter: f = x + MITER


def nose_seam():
    """Top-view polyline separating the nose from hood/fender, x ascending."""
    xc = NOSE_SEAM_F - MITER
    return [(0.0, NOSE_SEAM_F), (s1_x(NOSE_SEAM_F), NOSE_SEAM_F), (xc, NOSE_SEAM_F), (1.4, 1.4 + MITER)]
