"""The Semi robot's super gun: a heavy cannon over a six-barrel rotary machine
gun, in the truck's language: clean white shells over graphite structure, a
black glass band with a light strip set into the receiver (the cab's glass
band and light bar), capacitor coils glowing round the cannon.

Sized for a 7.4 m robot whose fist closes round a 0.13 x 0.21 m pistol grip:
3.8 m overall. Weapon frame: +z runs along the barrels toward the muzzles, +x
is the gun's top, y is lateral; the pistol grip's centre is the origin. The
off hand holds the vertical foregrip under the rotary's clamp collar.

  stock      skeletal stock, battery cell, butt pad   z -1.13 .. -0.52
  receiver   crowned white shell, glass band, optic   z -0.55 .. 0.95
  cannon     turned coil core, vented shroud, brake    z  0.80 .. 2.72   axis x 0.56
  rotary     nacelle, six barrels in bored clamps      z  0.80 .. 2.32   axis x 0.20
  drum       ammunition drum growing out of the receiver underside

Detail is machined into the parts it belongs to: pockets, grooves, vents,
ports, bores and windows are boolean cuts into the solid that carries them,
and inserts (glass, lamp strip, coils, slats, radiator, cover, cell) sit
inside those openings with a reveal. Declared joins: barrels run through
their clamps and into the receiver; the grips, drum, nacelle, optic mounts
and stock are sunk into the receiver; bolts stand on their faces.
"""
import math
from mathutils import Vector, Matrix
from f1b import kit as K
from . import kit
from .kit import Part, hex_bolt, section_loft, chamfer_rect

NAME = 'gun'

CANNON_X = 0.56             # cannon bore axis (height above the grip centre)
ROTARY_X = 0.20             # rotary axis
REC_HW = 0.23               # receiver flat side (half width)
GRIP_RAKE = 14.0            # pistol grip leans back from the receiver (deg)
FOREGRIP_Z = 1.10
FOREGRIP_LEN = 0.44
MUZZLE_CANNON = (CANNON_X, 0.0, 2.72)
MUZZLE_ROTARY = (ROTARY_X, 0.0, 2.33)

# local frames for drawing outlines and extruding them:
# SIDE: outline in (z, x), extruded along y;  TOP: outline in (y, z), extruded along x
SIDE = Matrix(((0, 1, 0, 0), (0, 0, 1, 0), (1, 0, 0, 0), (0, 0, 0, 1)))
TOP = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


# -------------------------------------------------------------------- helpers
def rrect(xb, xt, hw, r, seg=4, yc=0.0):
    """Rounded rectangle section (x up, y lateral)."""
    return K.fillet_poly(K.rect(xt - xb, 2 * hw, (xb + xt) / 2, yc), r, seg)


def crowned(xb, xt, hw, r, crown_h, crown_hw, seg=3):
    """Receiver section: flat sides, a chamfered crown spine along the top."""
    xs = xt - crown_h
    pts = [(xb, -hw), (xs, -hw), (xt, -crown_hw), (xt, crown_hw), (xs, hw), (xb, hw)]          # counter-clockwise
    radii = [r, 0.03, 0.025, 0.025, 0.03, r]
    return K.fillet_poly(pts, 0.0, seg, radii=radii)


def stadium(a0, a1, bc, h, seg=6):
    """Slot outline with round ends: length along the first coordinate, height h."""
    return K.fillet_poly(K.rect(a1 - a0, h, (a0 + a1) / 2, bc), h / 2 - 1e-4, seg)


def side_prism(outline_zx, y0, y1, r=0.0):
    y0, y1 = sorted((y0, y1))
    return K.bevel_prism(K.ccw(outline_zx), y0, y1, r, 1, SIDE)


def top_prism(outline_yz, x0, x1, r=0.0):
    x0, x1 = sorted((x0, x1))
    return K.bevel_prism(K.ccw(outline_yz), x0, x1, r, 1, TOP)


def at_x(x0):
    return Matrix.Translation((x0, 0.0, 0.0))


def tube_z(x0, r, z0, z1, seg=40, chamfer=0.006):
    """Solid cylinder about an axis parallel to z at height x0."""
    c = min(chamfer, r * 0.3)
    return K.revolve([(0.0, z0), (r - c, z0), (r, z0 + c), (r, z1 - c), (r - c, z1), (0.0, z1)], seg, axis='Z', M=at_x(x0))


def ring_z(x0, r0, r1, z0, z1, seg=48, c=0.004):
    """Closed annulus solid about an axis parallel to z."""
    prof = [(r0, z0), (r1 - c, z0), (r1, z0 + c), (r1, z1 - c), (r1 - c, z1), (r0, z1)]
    return K.revolve(prof + [prof[0]], seg, axis='Z', M=at_x(x0))


def disc_y(center, r, y0, y1, seg=48, c=0.004):
    """Solid disc about an axis along y through center (x, z)."""
    x, z = center
    M = Matrix.Translation((x, 0.0, z)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')        # local z -> weapon +y
    prof = [(0.0, y0), (r - c, y0), (r, y0 + c), (r, y1 - c), (r - c, y1), (0.0, y1)]
    return K.revolve(prof, seg, axis='Z', M=M)


def pocketed(part_obj, slot, cutters):
    kit.cut(part_obj, NAME, slot, *cutters)
    return part_obj


# -------------------------------------------------------------------- receiver
REC = [(-0.55, crowned(0.30, 0.72, 0.185, 0.06, 0.06, 0.08)),
       (-0.44, crowned(0.24, 0.82, REC_HW, 0.08, 0.09, 0.11)),
       (0.62, crowned(0.24, 0.84, REC_HW, 0.08, 0.10, 0.12)),
       (0.80, crowned(0.26, 0.80, 0.225, 0.08, 0.09, 0.11)),
       (0.95, crowned(0.30, 0.74, 0.21, 0.07, 0.08, 0.10))]
BAND = [(-0.30, 0.47), (0.66, 0.49), (0.70, 0.67), (-0.26, 0.67)]          # glass band (z, x)
STRIP = (-0.22, 0.78, 0.428, 0.018)                                          # light groove z0, z1, x centre, height
VENT = [(-0.42, 0.29), (-0.30, 0.29), (-0.30, 0.43), (-0.42, 0.43)]


def _receiver(coll):
    p = Part(NAME, 'gun.receiver')
    p.add(section_loft([s for _, s in REC], [z for z, _ in REC], cap_round=0.02), 'paint')
    o = p.build(coll)
    cut = []
    for s in (1, -1):
        cut.append(side_prism(BAND, s * (REC_HW - 0.010), s * 0.40))
        z0, z1, xc, h = STRIP
        cut.append(side_prism(stadium(z0, z1, xc, h), s * (REC_HW - 0.008), s * 0.40))
        cut.append(side_prism(VENT, s * (REC_HW - 0.016), s * 0.40))
    # channel in the crown for the rail's base
    cut.append(K.bevel_prism(K.rect(0.02, 0.10, 0.84, 0.0), -0.37, 0.64, 0.0, 1))
    pocketed(o, 'trim', cut)
    return o


def _inserts():
    """Glass band, light strip and vent slats, each seated inside its pocket."""
    p = Part(NAME, 'gun.inserts')
    for s in (1, -1):
        p.add(side_prism(K.offset_poly(K.ccw(BAND), -0.005), s * (REC_HW - 0.010), s * (REC_HW - 0.004), 0.002), 'glass')
        z0, z1, xc, h = STRIP
        p.add(side_prism(stadium(z0 + 0.004, z1 - 0.004, xc, h - 0.006), s * (REC_HW - 0.008), s * (REC_HW - 0.003), 0.0015), 'lamp')
        for k in range(5):
            x = 0.305 + k * 0.026
            slat = [(-0.415, x), (-0.305, x), (-0.305, x + 0.012), (-0.415, x + 0.012)]
            p.add(side_prism(slat, s * (REC_HW - 0.016), s * (REC_HW - 0.004), 0.002), 'graphite')
    return p


def _frame():
    """Graphite lower receiver, trigger and guard."""
    p = Part(NAME, 'gun.frame')
    p.add(section_loft([rrect(0.16, 0.34, 0.20, 0.05)] * 2, [-0.46, 0.92], cap_round=0.02), 'graphite')
    p.add(K.bevel_prism(K.rect(0.10, 0.03, 0.14, 0.0), 0.10, 0.16, 0.008, 1), 'mech')
    guard = [Vector((0.17, 0.0, 0.34)), Vector((0.05, 0.0, 0.34)), Vector((-0.02, 0.0, 0.26)), Vector((-0.04, 0.0, 0.14))]
    p.add(K.tube(guard, 0.022, 12), 'graphite')
    return p


RAIL = [(0.0, -0.05), (0.0, 0.05), (0.035, 0.042), (0.045, 0.030), (0.045, -0.030), (0.035, -0.042)]     # (x rel, y)


def _rail(coll):
    """Top rail sunk 2 cm into the crown channel, cross slots machined in."""
    p = Part(NAME, 'gun.rail')
    sec = [(0.825 + x, y) for x, y in RAIL]
    p.add(section_loft([sec, sec], [-0.36, 0.63], cap_round=0.006), 'graphite')
    o = p.build(coll)
    slots = [K.bevel_prism(K.rect(0.03, 0.14, 0.87, 0.0), z - 0.018, z + 0.018, 0.0, 1) for z in [-0.30 + k * 0.09 for k in range(11)]]
    return pocketed(o, 'graphite', slots)


def _optic(coll):
    """Sculpted optic: a hooded housing on two rail clamps, the lens set back in its bore
    behind a lamp ring."""
    p = Part(NAME, 'gun.optic')
    secs = [rrect(0.905, 0.99, 0.070, 0.030), rrect(0.895, 1.03, 0.092, 0.045), rrect(0.895, 1.045, 0.098, 0.048), rrect(0.905, 1.05, 0.100, 0.048)]
    p.add(section_loft(secs, [-0.06, 0.04, 0.34, 0.46], cap_round=0.012), 'graphite')
    for z in (0.02, 0.30):
        p.add(section_loft([rrect(0.84, 0.91, 0.085, 0.02)] * 2, [z - 0.05, z + 0.05], cap_round=0.008), 'mech')
    o = p.build(coll)
    cut = [tube_z(0.975, 0.058, 0.36, 0.60, 32)]                        # lens bore
    cut.append(ring_z(0.975, 0.066, 0.078, 0.445, 0.60, 32))              # lamp groove round it
    rail = [(0.825 + x, y) for x, y in K.offset_poly(K.ccw(RAIL), 0.002)]
    cut.append(section_loft([rail, rail], [-0.10, 0.40]))                 # clamps engage the rail
    return pocketed(o, 'blackMatte', cut)


def _optic_glass():
    p = Part(NAME, 'gun.lens')
    p.add(K.revolve([(0.0, 0.40), (0.056, 0.40), (0.056, 0.412), (0.0, 0.418)], 32, axis='Z', M=at_x(0.975)), 'glass')
    p.add(ring_z(0.975, 0.067, 0.077, 0.449, 0.457, 32, 0.002), 'lamp')
    return p


# -------------------------------------------------------------------- stock
STOCK_WINDOW = stadium(-0.98, -0.66, 0.515, 0.17)


def _stock(coll):
    p = Part(NAME, 'gun.stock')
    secs = [rrect(0.32, 0.70, 0.185, 0.07), rrect(0.35, 0.68, 0.16, 0.07), rrect(0.34, 0.70, 0.15, 0.065), rrect(0.33, 0.71, 0.15, 0.065)]
    p.add(section_loft(secs, [-0.50, -0.66, -0.96, -1.06], cap_round=0.02), 'paint')
    o = p.build(coll)
    return pocketed(o, 'graphite', [side_prism(STOCK_WINDOW, -0.4, 0.4)])


def _stock_inserts(coll):
    """Battery cell spanning the stock's window (orange charge rings), grooved butt pad."""
    p = Part(NAME, 'gun.cell')
    x = 0.515
    prof = [(0.0, -1.02), (0.055, -1.02), (0.062, -1.00), (0.062, -0.93), (0.052, -0.925), (0.052, -0.905), (0.062, -0.90),
            (0.062, -0.74), (0.052, -0.735), (0.052, -0.715), (0.062, -0.71), (0.062, -0.64), (0.055, -0.62), (0.0, -0.62)]
    p.add(K.revolve(prof, 36, axis='Z', M=at_x(x)), 'graphite')
    for z0 in (-0.925, -0.735):
        p.add(ring_z(x, 0.050, 0.058, z0, z0 + 0.02, 36, 0.002), 'orange')
    p.build(coll)
    b = Part(NAME, 'gun.buttpad')
    b.add(section_loft([rrect(0.31, 0.72, 0.155, 0.07), rrect(0.31, 0.72, 0.155, 0.07), rrect(0.33, 0.70, 0.145, 0.06)],
                       [-1.05, -1.10, -1.13], cap_round=0.012), 'rubber')
    bo = b.build(coll)
    grooves = [K.bevel_prism(K.rect(0.016, 0.40, x, 0.0), -1.20, -1.115, 0.0, 1) for x in (0.40, 0.515, 0.63)]
    return pocketed(bo, 'rubber', grooves)


# -------------------------------------------------------------------- grips
def _swell_loft(M, z0, z1, depths, width, chamfer):
    """Grip with finger swells: the depth (front/back) varies along its length."""
    n = len(depths)
    zs = [z0 + (z1 - z0) * k / (n - 1) for k in range(n)]
    return section_loft([chamfer_rect(d, width, chamfer) for d in depths], zs, M=M, cap_round=0.012)


def _grip():
    p = Part(NAME, 'gun.grip')
    r = math.radians(GRIP_RAKE)
    M = kit.axis_frame(Vector((0, 0, 0)), (math.cos(r), 0.0, math.sin(r)), (0.0, 0.0, 1.0))
    p.add(_swell_loft(M, -0.20, 0.30, [0.21, 0.22, 0.195, 0.22, 0.195, 0.22, 0.20, 0.20, 0.20], 0.135, 0.045), 'rubber')
    p.add(section_loft([chamfer_rect(0.23, 0.15, 0.05), chamfer_rect(0.24, 0.16, 0.05), chamfer_rect(0.20, 0.13, 0.04)],
                       [-0.27, -0.23, -0.19], M=M, cap_round=0.008), 'graphite')
    return p


def _foregrip():
    p = Part(NAME, 'gun.foregrip')
    x = ROTARY_X
    p.add(ring_z(x, 0.150, 0.185, FOREGRIP_Z - 0.10, FOREGRIP_Z + 0.10), 'graphite')
    p.add(section_loft([rrect(-0.02, 0.06, 0.07, 0.02)] * 2, [FOREGRIP_Z - 0.09, FOREGRIP_Z + 0.09], cap_round=0.01), 'graphite')
    M = kit.axis_frame(Vector((0.0, 0.0, FOREGRIP_Z)), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0))
    p.add(_swell_loft(M, 0.02, FOREGRIP_LEN, [0.16, 0.175, 0.155, 0.175, 0.155, 0.17, 0.16], 0.125, 0.04), 'rubber')
    p.add(section_loft([chamfer_rect(0.18, 0.14, 0.045), chamfer_rect(0.19, 0.15, 0.045), chamfer_rect(0.15, 0.12, 0.035)],
                       [FOREGRIP_LEN - 0.01, FOREGRIP_LEN + 0.03, FOREGRIP_LEN + 0.07], M=M, cap_round=0.008), 'graphite')
    return p


def grip_off():
    """Off-hand grip centre: the middle of the foregrip."""
    return (-(0.02 + FOREGRIP_LEN) / 2, 0.0, FOREGRIP_Z)


# -------------------------------------------------------------------- cannon
def _coil_core():
    """Turned capacitor core: collars and three grooves the coils sit in."""
    p = Part(NAME, 'gun.coilcore')
    prof = [(0.0, 0.80), (0.185, 0.80), (0.195, 0.81), (0.195, 0.86)]
    for z in (0.88, 1.03, 1.18):
        prof += [(0.195, z), (0.160, z + 0.006), (0.160, z + 0.094), (0.195, z + 0.10)]
    prof += [(0.195, 1.33), (0.205, 1.335), (0.205, 1.37), (0.0, 1.37)]
    p.add(K.revolve(prof, 56, axis='Z', M=at_x(CANNON_X)), 'graphite')
    for z in (0.88, 1.03, 1.18):
        p.add(ring_z(CANNON_X, 0.158, 0.186, z + 0.012, z + 0.088, 56, 0.003), 'glow')
    return p


def shroud_sec(k=1.0, grow=0.0):
    """Faceted shroud section about the cannon axis: flat sides, a ridged top spine."""
    pts = [(0.225, 0.045), (0.170, 0.165), (0.0, 0.200), (-0.140, 0.160), (-0.195, 0.060),
           (-0.195, -0.060), (-0.140, -0.160), (0.0, -0.200), (0.170, -0.165), (0.225, -0.045)]
    pts = K.offset_poly(K.ccw([(x * k, y * k) for x, y in pts]), grow) if grow else [(x * k, y * k) for x, y in pts]
    return [(CANNON_X + x, y) for x, y in pts]


SHROUD_Z = [(1.34, 0.95), (1.42, 1.0), (1.96, 1.0), (2.10, 0.97), (2.22, 0.92)]


def _shroud(coll):
    p = Part(NAME, 'gun.shroud')
    p.add(section_loft([shroud_sec(k) for _, k in SHROUD_Z], [z for z, _ in SHROUD_Z], cap_round=0.012), 'paint')
    o = p.build(coll)
    cut = [section_loft([shroud_sec(k, -0.014) for _, k in SHROUD_Z], [1.30, 1.40, 1.96, 2.10, 2.30])]       # hollow
    for z in [1.50 + 0.10 * k for k in range(5)]:                                                         # top vents
        for y in (-0.105, 0.105):
            cut.append(top_prism(stadium(y - 0.065, y + 0.065, z, 0.048), CANNON_X + 0.05, CANNON_X + 0.40))
    for x in (CANNON_X + 0.07, CANNON_X - 0.07):                                                        # side vents
        cut.append(side_prism(stadium(1.50, 1.98, x, 0.052), -0.5, 0.5))
    return pocketed(o, 'graphite', cut)


def _radiator():
    """Finned radiator round the barrel, seen through the shroud's vents."""
    p = Part(NAME, 'gun.radiator')
    for k in range(17):
        z = 1.44 + k * 0.038
        p.add(ring_z(CANNON_X, 0.10, 0.165, z, z + 0.014, 40, 0.002), 'graphite')
    p.add(ring_z(CANNON_X, 0.070, 0.105, 0.95, 2.30), 'steel')                 # the barrel (hollow)
    return p


def _brake(coll):
    """Muzzle brake: a faceted block with stadium ports each side and the crowned bore."""
    p = Part(NAME, 'gun.brake')
    x = CANNON_X
    blk = [rrect(x - 0.19, x + 0.19, 0.22, 0.06), rrect(x - 0.205, x + 0.205, 0.235, 0.07), rrect(x - 0.20, x + 0.20, 0.23, 0.07),
           rrect(x - 0.17, x + 0.17, 0.20, 0.05)]
    p.add(section_loft(blk, [2.20, 2.30, 2.64, 2.72], cap_round=0.02), 'graphite')
    o = p.build(coll)
    cut = [tube_z(x, 0.085, 2.10, 2.90, 36), K.revolve([(0.0, 2.69), (0.085, 2.69), (0.125, 2.73), (0.0, 2.73)], 36, axis='Z', M=at_x(x))]
    for z in (2.38, 2.52):
        cut.append(side_prism(stadium(z, z + 0.09, x, 0.24), -0.5, 0.5))
    return pocketed(o, 'blackMatte', cut)


# -------------------------------------------------------------------- rotary
BARREL_R = 0.078


def _barrel_xy(k):
    a = 2 * math.pi * k / 6 + math.pi / 6
    return ROTARY_X + BARREL_R * math.cos(a), BARREL_R * math.sin(a)


def _nacelle():
    """White motor nacelle lofted out of the receiver's lower front."""
    p = Part(NAME, 'gun.nacelle')
    x = ROTARY_X
    secs = [rrect(0.06, 0.34, 0.19, 0.08), rrect(x - 0.155, x + 0.155, 0.165, 0.10), rrect(x - 0.15, x + 0.15, 0.15, 0.145),
            rrect(x - 0.135, x + 0.135, 0.135, 0.13)]
    p.add(section_loft(secs, [0.86, 1.00, 1.24, 1.30], cap_round=0.012), 'paint')
    return p


def _rotary(coll):
    p = Part(NAME, 'gun.rotary')
    x = ROTARY_X
    p.add(tube_z(x, 0.050, 1.26, 2.28), 'graphite')                             # spindle
    for k in range(6):
        cx, cy = _barrel_xy(k)
        prof = [(0.013, 1.25), (0.030, 1.25), (0.030, 2.30), (0.024, 2.32), (0.013, 2.32)]
        p.add(K.revolve(prof + [prof[0]], 20, axis='Z', M=Matrix.Translation((cx, cy, 0.0))), 'steel')
    p.build(coll)
    clamps = Part(NAME, 'gun.clamps')
    for z0, z1 in ((1.30, 1.36), (1.66, 1.72), (2.14, 2.20)):
        clamps.add(tube_z(x, 0.125, z0, z1, 48), 'graphite')
    o = clamps.build(coll)
    holes = [K.revolve([(0.0, 1.0), (0.031, 1.0), (0.031, 2.5), (0.0, 2.5)], 20, axis='Z', M=Matrix.Translation((*_barrel_xy(k), 0.0)))
             for k in range(6)]
    holes.append(tube_z(x, 0.052, 1.0, 2.5, 32))
    return pocketed(o, 'mech', holes)


# -------------------------------------------------------------------- drum
DRUM_C = (0.04, 0.60)          # (x, z) of the drum axis (clear of the trigger guard)
DRUM_R = 0.235
DRUM_HW = 0.17


def _drum(coll):
    """D-shaped drum housing: flat top grown into the receiver's underside, a round
    belly, ribbed rim, a recessed cover each side."""
    p = Part(NAME, 'gun.drum')
    x0, z0 = DRUM_C
    pts = []
    for k in range(25):
        a = math.pi * (0.10 + 0.80 * k / 24)            # from the front round the belly to the back
        pts.append((z0 + DRUM_R * math.cos(a), x0 - DRUM_R * math.sin(a)))
    pts = [(z0 - DRUM_R * 0.95, 0.27), (z0 + DRUM_R * 0.95, 0.27)] + pts       # top edge, then the belly front to back
    p.add(side_prism(pts, -DRUM_HW, DRUM_HW, 0.03), 'paint')
    o = p.build(coll)
    cut = []
    for s in (1, -1):
        cut.append(disc_y((x0, z0), 0.180, s * (DRUM_HW - 0.016), s * 0.4))
    for k in range(9):                                   # rim ribs: grooves across the belly
        a = math.pi * (0.22 + 0.56 * k / 8)
        radial = Vector((-math.sin(a), 0.0, math.cos(a)))
        c = Vector((x0, 0.0, z0)) + radial * (DRUM_R + 0.01)
        M = kit.axis_frame(c, (0.0, 1.0, 0.0), radial)
        cut.append(K.bevel_prism(K.rect(0.05, 0.012), -(DRUM_HW - 0.035), DRUM_HW - 0.035, 0.0, 1, M))
    return pocketed(o, 'graphite', cut)


def _drum_covers(coll):
    """Cover plates seated in the recesses: bolt ring, hub, and a counter window with the
    orange round indicator inside."""
    p = Part(NAME, 'gun.drumcover')
    x0, z0 = DRUM_C
    for s in (1, -1):
        p.add(disc_y((x0, z0), 0.172, *sorted((s * (DRUM_HW - 0.016), s * (DRUM_HW - 0.006)))), 'graphite')
        p.add(disc_y((x0, z0), 0.048, *sorted((s * (DRUM_HW - 0.008), s * (DRUM_HW + 0.004)))), 'darkSteel')
    o = p.build(coll)
    windows = []
    for s in (1, -1):
        windows.append(side_prism(stadium(z0 - 0.09, z0 + 0.09, x0 - 0.11, 0.045), s * (DRUM_HW - 0.012), s * 0.4))
    pocketed(o, 'blackMatte', windows)
    w = Part(NAME, 'gun.drumwindow')
    for s in (1, -1):
        w.add(side_prism(stadium(z0 - 0.08, z0 + 0.02, x0 - 0.11, 0.028), s * (DRUM_HW - 0.013), s * (DRUM_HW - 0.011)), 'orange')
        w.add(side_prism(stadium(z0 - 0.087, z0 + 0.087, x0 - 0.11, 0.041), s * (DRUM_HW - 0.009), s * (DRUM_HW - 0.007)), 'glass')
        for k in range(6):
            a = 2 * math.pi * k / 6 + math.pi / 6
            p2 = (x0 + 0.135 * math.sin(a), s * (DRUM_HW - 0.006), z0 + 0.135 * math.cos(a))
            w.add(hex_bolt(p2, (0, s, 0), 0.012, 0.007), 'chrome')
    return w


# -------------------------------------------------------------------- fasteners
def _fasteners():
    p = Part(NAME, 'gun.fasteners')
    for s in (1, -1):
        for x, z in ((0.30, 0.86), (0.72, 0.86), (0.30, -0.24), (0.72, -0.34)):
            p.add(hex_bolt((x, s * REC_HW, z), (0, s, 0), 0.014, 0.008), 'chrome')
        for z in (0.02, 0.30):
            p.add(hex_bolt((0.875, s * 0.085, z), (0, s, 0), 0.010, 0.006), 'chrome')
        for z in (2.26, 2.68):
            p.add(hex_bolt((CANNON_X + 0.12, s * 0.232, z), (0, s, 0), 0.012, 0.007), 'chrome')
    return p


def build(coll):
    """Every part of the gun in `coll`. Returns the export metadata."""
    K.finish(_receiver(coll), width=0.006, seg=2, angle=30)
    K.finish(_inserts().build(coll), width=0.0015, seg=1, angle=35)
    K.finish(_frame().build(coll), width=0.004, seg=2, angle=30)
    K.finish(_rail(coll), width=0.003, seg=1, angle=35)
    K.finish(_optic(coll), width=0.004, seg=2, angle=30)
    K.finish(_optic_glass().build(coll), width=0.001, seg=1, angle=40)
    K.finish(_stock(coll), width=0.005, seg=2, angle=30)
    K.finish(_stock_inserts(coll), width=0.004, seg=2, angle=30)
    for o in coll.objects:
        if o.name.startswith('gun.cell') and not o.modifiers:
            K.finish(o, width=0.002, seg=1, angle=35)
    K.finish(_grip().build(coll), width=0.003, seg=2, angle=30)
    K.finish(_foregrip().build(coll), width=0.003, seg=2, angle=30)
    K.finish(_coil_core().build(coll), width=0.002, seg=1, angle=35)
    K.finish(_shroud(coll), width=0.004, seg=2, angle=30)
    K.finish(_radiator().build(coll), width=0.001, seg=1, angle=40)
    K.finish(_brake(coll), width=0.004, seg=2, angle=30)
    K.finish(_nacelle().build(coll), width=0.005, seg=2, angle=30)
    K.finish(_rotary(coll), width=0.002, seg=1, angle=35)
    for o in coll.objects:
        if o.name.startswith('gun.rotary') and not o.modifiers:
            K.finish(o, width=0.002, seg=1, angle=35)
    K.finish(_drum(coll), width=0.005, seg=2, angle=30)
    K.finish(_drum_covers(coll).build(coll), width=0.001, seg=1, angle=40)
    for o in coll.objects:
        if o.name.startswith('gun.drumcover') and not o.modifiers:
            K.finish(o, width=0.002, seg=1, angle=35)
    K.finish(_fasteners().build(coll), width=0.0008, seg=1, angle=40)
    return {
        'grips': {'main': [0.0, 0.0, 0.0], 'off': list(grip_off())},
        'muzzles': {'cannon': list(MUZZLE_CANNON), 'rotary': list(MUZZLE_ROTARY)},
    }
