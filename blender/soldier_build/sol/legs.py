"""Legs and wheel feet (left side, bone-local; mirrored for the right).

Thigh: a two-band faceted shell over a dark core, an outer plate and clevis
cheeks around the knee. Shin: the black knee drum it pivots on with its steel
pin, the gloss-black knee cap, a calf-bulged two-band shell and a centre tongue
around the ankle pin. Foot: a fork around the tongue that runs down to the
axle. Wheel: two tyres with machined hubs on one steel axle (the wheel bone
spins them)."""
import math
from mathutils import Vector, Matrix
from . import kit as S
from . import rig

THIGH_ST = [  # z, w, d, cf, cb, yc, keel, bulge
    (-0.03, 0.225, 0.240, 0.5, 0.4, -0.004, 0.004, 0.0),
    (-0.10, 0.260, 0.275, 0.5, 0.4, -0.008, 0.010, 0.014),
    (-0.28, 0.250, 0.262, 0.5, 0.45, -0.008, 0.012, 0.014),
    (-0.46, 0.200, 0.215, 0.5, 0.45, -0.004, 0.008, 0.0),
]
SHIN_ST = [
    (-0.08, 0.175, 0.205, 0.55, 0.5, 0.004, 0.010, 0.0),
    (-0.20, 0.195, 0.235, 0.55, 0.5, 0.018, 0.010, 0.004),
    (-0.34, 0.165, 0.195, 0.55, 0.5, 0.012, 0.008, 0.0),
    (-0.44, 0.122, 0.150, 0.55, 0.5, 0.000, 0.005, 0.0),
]


def _st(table, z0, z1, n=4):
    return [(z, S.sec(w, d, cf, cb, yc, keel=keel, bulge=bulge)) for z, (w, d, cf, cb, yc, keel, bulge) in S.interp_stations(table, z0, z1, n)]


def thigh():
    out = []
    bands, core = S.bands(lambda a, b: _st(THIGH_ST, a, b), [-0.03, -0.26, -0.47], gap=0.013, core=0.018)
    out += [(m, 'alloy') for m in bands]
    out.append((core, 'mech'))
    out.append((S.loft([(0.0, S.squircle(0.11, 0.11, 3, 20)), (-0.52, S.squircle(0.10, 0.10, 3, 20))], cap=0.006), 'mech'))
    sb = S.bvh_of(*bands)
    # outer plate with bolts, rear vent
    f = S.tangent_frame((0.13, 0.0, -0.2), (1.0, 0.0, 0.0))
    pl = S.fillet_poly(S.ccw([(-0.07, -0.12), (0.06, -0.12), (0.075, 0.1), (-0.06, 0.11)]), 0.015, 2)
    plate = S.conform_plate(sb, f, pl, 0.016, rings=3)
    out.append((plate, 'alloy'))
    pb = S.bvh_of(plate)
    out += [(m, 'steel') for m in S.bolts(pb, f, [(-0.045, -0.095), (0.045, -0.095), (-0.04, 0.085), (0.05, 0.085)], r=0.0075)]
    out += S.vent(sb, S.tangent_frame((0.0, 0.14, -0.33), (0.0, 1.0, 0.0)), 0.1, 0.1, slats=4, t=0.012)
    # front seam strip
    ff = S.tangent_frame((0.0, -0.15, -0.2), (0.0, -1.0, 0.0))
    out.append((S.conform_plate(sb, ff, [(-0.012, -0.16), (0.012, -0.16), (0.012, 0.16), (-0.012, 0.16)], 0.01, rings=2), 'alloyDark'))
    # knee cheeks
    for s in (1, -1):
        out.append((S.cheek(s * 0.086, s * 0.108, -0.44, -rig.THIGH, 0.07, yc=0.005), 'alloy'))
    return out


def shin():
    out = []
    out.append((S.drum((0, 0, 0), 0.074, 0.166, 'X', 22), 'polymer'))
    out.append((S.cyl((0, 0, 0), 0.032, 0.24, 'X', 20), 'steel'))
    # knee cap: gloss-black rounded pad over the front of the knee
    st = [(0.095, S.squircle(0.10, 0.06, 2.2, 20, yc=-0.065)),
          (0.06, S.squircle(0.19, 0.12, 2.3, 20, yc=-0.08)),
          (-0.01, S.squircle(0.21, 0.13, 2.4, 20, yc=-0.088)),
          (-0.08, S.squircle(0.19, 0.12, 2.3, 20, yc=-0.092)),
          (-0.13, S.squircle(0.11, 0.07, 2.2, 20, yc=-0.085))]
    cap = S.loft(st, cap=0.02, seg=3)
    out.append((cap, 'shell'))
    cb = S.bvh_of(cap)
    f = S.tangent_frame((0.0, -0.16, -0.02), (0.0, -1.0, 0.0))
    out.append((S.conform_plate(cb, f, S.fillet_poly(S.ccw([(-0.05, -0.035), (0.05, -0.035), (0.04, 0.035), (-0.04, 0.035)]), 0.012, 2), 0.006, rings=3), 'shell'))
    # shell
    bands, core = S.bands(lambda a, b: _st(SHIN_ST, a, b), [-0.08, -0.27, -0.45], gap=0.013, core=0.018)
    out += [(m, 'alloy') for m in bands]
    out.append((core, 'mech'))
    out.append((S.loft([(-0.04, S.squircle(0.1, 0.1, 3, 20)), (-0.47, S.squircle(0.06, 0.07, 3, 20))], cap=0.006), 'mech'))
    sb = S.bvh_of(*bands)
    ff = S.tangent_frame((0.0, -0.1, -0.24), (0.0, -1.0, 0.0))
    shin_plate = S.fillet_poly(S.ccw([(-0.05, -0.13), (0.05, -0.13), (0.06, 0.1), (-0.06, 0.1)]), 0.015, 2)
    sp = S.conform_plate(sb, ff, shin_plate, 0.016, rings=3)
    out.append((sp, 'alloy'))
    out += S.vent(S.bvh_of(sp), S.tangent_frame((0.0, -0.12, -0.2), (0.0, -1.0, 0.0)), 0.06, 0.09, slats=4, t=0.01, frame_w=0.009)
    out += [(m, 'steel') for m in S.bolts(S.bvh_of(sp), ff, [(-0.035, -0.11), (0.035, -0.11)], r=0.007)]
    # calf light
    fc = S.tangent_frame((0.0, 0.12, -0.2), (0.0, 1.0, 0.0))
    out.append((S.conform_plate(sb, fc, [(-0.006, -0.05), (0.006, -0.05), (0.006, 0.05), (-0.006, 0.05)], 0.005, bevel=0.0015, rings=1), 'glow'))
    # ankle tongue around the ankle pin
    out.append((S.cheek(-0.024, 0.024, -0.42, -rig.SHIN, 0.05), 'alloyDark'))
    return out


def foot():
    out = []
    # ankle pin through the fork cheeks that carry it
    out.append((S.cyl((0, 0, 0), 0.02, 0.13, 'X', 16), 'steel'))
    for s in (1, -1):
        out.append((S.cheek(s * 0.027, s * 0.058, -0.075, 0.0, 0.062), 'alloy'))
        out.append((S.cyl((s * 0.06, 0, 0), 0.03, 0.008, 'X', 20), 'mech'))
    # axle housing below the fork, rounded around the axle
    out.append((S.cheek(-0.058, 0.058, -0.06, -rig.ANKLE_UP, 0.07), 'alloy'))
    hb = S.bvh_of(S.cheek(-0.058, 0.058, -0.06, -rig.ANKLE_UP, 0.07, r=0.0))
    for s in (1, -1):
        out.append((S.drum((s * 0.058, 0.0, -rig.ANKLE_UP), 0.048, 0.012, 'X', 16), 'mech'))
    for yy in (-1, 1):
        f = S.tangent_frame((0.0, yy * 0.07, -0.1), (0.0, yy, 0.0))
        out.append((S.conform_plate(hb, f, [(-0.03, -0.012), (0.03, -0.012), (0.03, 0.012), (-0.03, 0.012)], 0.006, bevel=0.002, rings=1), 'polymer'))
    return out


def _tyre():
    R, W = rig.WHEEL_R, rig.WHEEL_W
    h = W / 2
    prof = [(0.12, -h + 0.004), (0.15, -h), (R - 0.03, -h - 0.002), (R - 0.01, -h + 0.008), (R, -h + 0.022),
            (R, -0.018), (R - 0.008, -0.013), (R - 0.008, -0.007), (R, -0.002), (R, 0.002), (R - 0.008, 0.007), (R - 0.008, 0.013), (R, 0.018),
            (R, h - 0.022), (R - 0.01, h - 0.008), (R - 0.03, h + 0.002), (0.15, h), (0.12, h - 0.004)]
    return S.revolve(prof + [prof[0]], 32, axis='X')


def _hub():
    W = rig.WHEEL_W
    h = W / 2
    prof = [(0.0, -h + 0.006), (0.03, -h + 0.006), (0.04, -h + 0.012), (0.075, -h + 0.012), (0.085, -h + 0.004),
            (0.118, -h + 0.004), (0.126, -h + 0.012), (0.126, h - 0.012), (0.118, h - 0.004), (0.085, h - 0.004),
            (0.075, h - 0.012), (0.04, h - 0.012), (0.03, h - 0.006), (0.0, h - 0.006)]
    return S.revolve(prof, 24, axis='X')


def wheel():
    """Both tyres of one foot, hubs, lug bolts and the axle (wheel-bone frame at the axle)."""
    out = []
    out.append((S.cyl((0, 0, 0), 0.022, 2 * (rig.WHEEL_X + rig.WHEEL_W / 2) - 0.02, 'X', 20), 'steel'))
    for s in (1, -1):
        T = Matrix.Translation(Vector((s * rig.WHEEL_X, 0, 0)))
        out.append((S.transform(_tyre(), T), 'rubber'))
        out.append((S.transform(_hub(), T), 'mech'))
        face = s * (rig.WHEEL_X + rig.WHEEL_W / 2 - 0.012)
        for k in range(6):
            a = 2 * math.pi * k / 6
            p = Vector((face, 0.058 * math.cos(a), 0.058 * math.sin(a)))
            out.append((S.hex_bolt(p, (s, 0, 0), r=0.009, h=0.007), 'steel'))
        out.append((S.cyl((face + s * 0.004, 0, 0), 0.028, 0.012, 'X', 24), 'steel'))
    return out
