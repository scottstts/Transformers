"""Neck and head. The head retracts with the neck 0.50 into the chest's head
well at the fold (well 0.60 x 0.62), so its plan stays inside 0.54 x 0.58."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig
from .kit import V
from .rkit import Part

HEAD_H = 0.58
# helmet stations (z, flank half width x, front ridge f, back f)
HELMET = [
    (0.02, 0.17, 0.19, -0.19),
    (0.12, 0.225, 0.255, -0.245),
    (0.33, 0.255, 0.275, -0.275),
    (0.47, 0.235, 0.215, -0.27),
    (HEAD_H, 0.17, 0.11, -0.225),
]
BALL_R = 0.085            # neck ball joint, centred on the head pivot; the head socket's cavity clears it by 4 mm


def outline(x, ff, fb, taper=0.62):
    """Top-view helmet outline (x, f): pointed front ridge, flat flanks, squared back."""
    return [(0.0, ff), (x * taper, ff - 0.04), (x, ff * 0.35), (x, fb * 0.55), (x * 0.72, fb),
            (-x * 0.72, fb), (-x, fb * 0.55), (-x, ff * 0.35), (-x * taper, ff - 0.04)]


def station(z):
    """Helmet (x, ff, fb) at height z (linear between stations)."""
    for (z0, *a), (z1, *b) in zip(HELMET, HELMET[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return tuple(p + (q - p) * t for p, q in zip(a, b))
    raise ValueError(z)


def helmet_mesh():
    return kit.loft([[V(px, pf, z) for px, pf in outline(x, ff, fb)] for z, x, ff, fb in HELMET], True, True)


def band(z0, z1, off):
    """Raised trim band conforming to the helmet facets between z0 and z1 (off proud)."""
    rings = []
    for z in (z0, z1):
        ring = kit.offset_poly(kit.ccw(outline(*station(z))), off)
        rings.append([V(px, pf, z) for px, pf in ring])
    return kit.loft(rings, True, True)


def facet_frame(za, zb, s, axis):
    """Shear onto a flat helmet facet between stations za..zb: plate-local 0 on the facet,
    positive outward. axis 'x' = flank facet (side s), 'f' = back facet."""
    (x0, _, b0), (x1, _, b1) = station(za), station(zb)
    M = Matrix.Identity(4)
    if axis == 'x':
        k = (x1 - x0) / (zb - za)
        M[0][2], M[0][3] = s * k, s * (x0 - k * za)
    else:
        k = (b1 - b0) / (zb - za)
        M[1][2], M[1][3] = -k, -(b0 - k * za)   # Blender y = -f; the back facet sits at f = fb(z)
    return M


def vent_plate(outline_uz, t, slots, bolts, axis, s=1):
    """Plate on a facet (plate-local: u in the facet, z up, outward from 0 to t), with recessed
    horizontal vent slots [(u0, u1, z0, z1)] and bolt heads [(u, z)]. Returns (plate, cuts, bolt meshes)."""
    if axis == 'x':
        plate = rkit.plate_x(outline_uz, *((-0.002, t) if s > 0 else (-t, 0.002)), 0.004)
        cuts = [rkit.plate_x([(u0, z0), (u1, z0), (u1, z1), (u0, z1)], *((t * 0.45, t + 0.01) if s > 0 else (-t - 0.01, -t * 0.45)), 0.002)
                for u0, u1, z0, z1 in slots]
        heads = [rkit.cylinder((s * (t + 0.002), u, z), 0.008, 0.006, 'x', 12, 0.002) for u, z in bolts]
    else:
        plate = rkit.plate_f(outline_uz, -t, 0.002, 0.004)
        cuts = [rkit.plate_f([(u0, z0), (u1, z0), (u1, z1), (u0, z1)], -t - 0.01, -t * 0.45, 0.002) for u0, u1, z0, z1 in slots]
        heads = [rkit.cylinder((u, -(t + 0.002), z), 0.008, 0.006, 'f', 12, 0.002) for u, z in bolts]
    return plate, cuts, heads


def neck():
    """Load-bearing neck: flared column, three vertebra plates, throat plate,
    cervical spine bar and side struts. Retracts into the chest's head well."""
    p = Part('R.neck.column')
    top = rig.HEAD_Z - rig.NECK_Z
    p.add(kit.revolve([(0.0, -0.075), (0.16, -0.075), (0.165, -0.06), (0.15, -0.03), (0.13, 0.0), (0.13, top - 0.03),
                       (0.112, top - 0.003), (0.0, top - 0.003)], 32), 'darkSteel')
    # ball joint on the head pivot, seated in the column's top cap; the head's socket rides on it
    ball = [(BALL_R * math.sin(math.pi * k / 16), top - BALL_R * math.cos(math.pi * k / 16)) for k in range(17)]
    p.add(kit.revolve(ball, 32), 'chrome')
    for z in (0.015, 0.075, 0.135):
        p.add(rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(0.38, 0.36, 0.09)], z - 0.014, z + 0.014, 0.006), 'graphite')
    # throat plate and cervical spine bar
    p.add(rkit.plate_f([(-0.10, -0.06), (0.10, -0.06), (0.12, 0.10), (0.07, 0.17), (-0.07, 0.17), (-0.12, 0.10)], 0.125, 0.165, 0.008), 'mech')
    p.add(rkit.plate_f([(-0.05, -0.06), (0.05, -0.06), (0.05, 0.17), (-0.05, 0.17)], -0.19, -0.125, 0.008), 'mech')
    # side struts from the base flange to the top vertebra
    for s in (1, -1):
        p.add(rkit.hose([(s * 0.165, 0.0, -0.05), (s * 0.15, 0.0, 0.06), (s * 0.13, 0.0, 0.15)], 0.02, 12, 4), 'chrome')
    # skirt: caps the chest's head well when the neck is raised
    p.add(rkit.plate_z([(x, f - 0.01) for x, f in kit.chamfer_rect(0.54, 0.56, 0.08)], -0.10, -0.075, 0.006), 'graphite')
    return [p]


def head():
    shell = Part('R.head.helmet')
    face_cut = rkit.plate_z([(-0.175, 0.10), (0.175, 0.10), (0.175, 0.40), (-0.175, 0.40)], 0.04, 0.395, 0.0)
    shell.add(helmet_mesh(), 'steel', cuts=[face_cut])
    # crest: a thin raised ridge from the brow over the crown
    shell.add(rkit.plate_x([(0.10, HEAD_H - 0.02), (0.14, HEAD_H + 0.035), (-0.20, HEAD_H + 0.02), (-0.24, HEAD_H - 0.03)], -0.018, 0.018, 0.004), 'steel')
    # ears: machined discs with swept fins and a bolt circle on the recessed face
    for s in (1, -1):
        # ears sit forward of mid-depth: the retracted shoulder booms pass behind them at the fold
        # (hub faces 6 mm inside the chest's head-well walls as the head rises out of it)
        # (high on the helmet: the retracted shoulder booms pass under them at the fold)
        shell.add(rkit.drum((s * 0.255, 0.05, 0.39), 0.08, 0.05, 'x', 24), 'darkSteel')
        shell.add(rkit.plate_x([(0.07, 0.44), (0.11, 0.48), (-0.07, 0.60), (-0.11, 0.585), (-0.03, 0.48)],
                               *((0.251, 0.269) if s > 0 else (-0.269, -0.251)), 0.004), 'steel')
        shell.many(rkit.bolt_ring((s * 0.274, 0.05, 0.39), (s, 0, 0), 0.047, 6, 0.0055, 0.004, phase=math.pi / 6), 'chrome')
    # crown band: dark trim ring at brow height, the helmet's seam between face shell and crown
    shell.add(band(0.40, 0.435, 0.006), 'darkSteel')
    # brow: a faceted visor hood projecting over the face opening
    brow = [(-0.20, 0.12), (0.20, 0.12), (0.20, 0.205), (0.075, 0.288), (-0.075, 0.288), (-0.20, 0.205)]
    tilt = Matrix.Identity(4)                     # pitched 7 deg down toward its tip, rooted in the crown band
    tilt[2][1], tilt[2][3] = math.tan(math.radians(7)), -0.12 * math.tan(math.radians(7))   # Blender y = -f
    shell.add(kit.transform(rkit.plate_z(brow, 0.385, 0.414, 0.006), tilt), 'steel')
    shell.add(kit.transform(rkit.plate_z([(x * 0.93, f - 0.004) for x, f in brow], 0.379, 0.386, 0.002), tilt), 'graphite')   # dark underside lip
    # temple plates on the flank facets (below the ears) and a rear plate on the back facet: vented, bolted
    temple = [(0.07, 0.29), (-0.10, 0.29), (-0.125, 0.255), (-0.125, 0.17), (-0.09, 0.14), (0.04, 0.14), (0.08, 0.19)]
    t_slots = [(-0.095, 0.035, z, z + 0.012) for z in (0.176, 0.204, 0.232)]
    t_bolts = [(0.045, 0.272), (-0.105, 0.155)]
    for s in (1, -1):
        plate, cuts, heads = vent_plate(temple, 0.011, t_slots, t_bolts, 'x', s)
        M = facet_frame(0.12, 0.33, s, 'x')
        shell.add(kit.transform(plate, M), 'graphite', cuts=[kit.transform(c, M) for c in cuts])
        shell.many([kit.transform(h, M) for h in heads], 'chrome')
    back = [(-0.12, 0.305), (0.12, 0.305), (0.14, 0.265), (0.14, 0.17), (0.10, 0.13), (-0.10, 0.13), (-0.14, 0.17), (-0.14, 0.265)]
    b_slots = [(-0.09, 0.09, z, z + 0.012) for z in (0.165, 0.193, 0.221, 0.249)]
    b_bolts = [(-0.115, 0.285), (0.115, 0.285), (-0.115, 0.15), (0.115, 0.15)]
    plate, cuts, heads = vent_plate(back, 0.009, b_slots, b_bolts, 'f')
    M = facet_frame(0.12, 0.33, 1, 'f')
    shell.add(kit.transform(plate, M), 'graphite', cuts=[kit.transform(c, M) for c in cuts])
    shell.many([kit.transform(h, M) for h in heads], 'chrome')

    face = Part('R.head.face')
    # faceplate: dark mask set back inside the opening
    fp = []
    for z, x, fwd in ((0.05, 0.14, 0.17), (0.20, 0.165, 0.215), (0.36, 0.165, 0.215)):
        fp.append([V(px, pf, z) for px, pf in [(0.0, fwd), (x * 0.6, fwd - 0.03), (x, fwd - 0.09), (x, 0.0), (-x, 0.0), (-x, fwd - 0.09), (-x * 0.6, fwd - 0.03)]])
    face.add(kit.loft(fp, True, True), 'graphite')
    # visor band and LED slit
    face.add(rkit.plate_f([(-0.162, 0.30), (0.162, 0.30), (0.150, 0.345), (-0.150, 0.345)], 0.12, 0.215, 0.004), 'plastic')
    face.add(rkit.plate_f([(-0.140, 0.315), (0.140, 0.315), (0.132, 0.33), (-0.132, 0.33)], 0.14, 0.222, 0.002), 'visor')
    # mouthplate: steel guard with vertical slots
    mouth = rkit.plate_f([(-0.13, 0.06), (0.13, 0.06), (0.15, 0.20), (0.0, 0.24), (-0.15, 0.20)], 0.15, 0.225, 0.006)
    slots = [rkit.plate_f([(x - 0.008, 0.09), (x + 0.008, 0.09), (x + 0.008, 0.17), (x - 0.008, 0.17)], 0.2, 0.3, 0.0) for x in (-0.06, -0.02, 0.02, 0.06)]
    face.add(mouth, 'steel', cuts=slots)
    # cheek guards
    for s in (1, -1):
        face.add(rkit.plate_x([(0.10, 0.06), (0.21, 0.13), (0.21, 0.28), (0.12, 0.30)], *((0.155, 0.178) if s > 0 else (-0.178, -0.155)), 0.004), 'mech')
    # neck socket under the head: a spherical cavity around the neck's ball joint (4 mm clear), its rim
    # 1.8 cm over the neck column so the head pitches +-8 deg
    r_in, z_rim = BALL_R + 0.004, 0.015
    a0 = math.acos(z_rim / r_in)
    cavity = [(r_in * math.sin(a0 * (1 - k / 10)), r_in * math.cos(a0 * (1 - k / 10))) for k in range(11)]
    face.add(kit.revolve([(0.0, 0.10), (0.116, 0.10), (0.12, 0.096), (0.12, z_rim + 0.004), (0.116, z_rim)] + cavity, 32), 'darkSteel')
    return [shell, face]


def build(coll):
    out = {'neck': [p.build(coll, 0.005, 2, 30) for p in neck()],
           'head': [p.build(coll, 0.004, 2, 25) for p in head()]}
    return out
