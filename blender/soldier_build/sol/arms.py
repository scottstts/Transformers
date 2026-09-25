"""Arms (left side, bone-local; the build mirrors them for the right).

Upper arm: black shoulder ball, a rounded alloy deltoid bell with the red unit
marking, a faceted upper-arm shell over a dark core and clevis cheeks around
the elbow. Forearm: the black elbow drum it pivots on, a two-band tapered shell
with a raised guard plate and a black wrist ring."""
from mathutils import Vector
from . import kit as S
from . import rig

UPPER_ST = [  # z, w, d, cf, cb, yc, keel, bulge
    (-0.17, 0.195, 0.200, 0.5, 0.45, 0.0, 0.006, 0.008),
    (-0.30, 0.190, 0.195, 0.5, 0.45, 0.0, 0.008, 0.010),
    (-0.47, 0.150, 0.160, 0.5, 0.45, 0.0, 0.004, 0.0),
]
FORE_ST = [
    (-0.07, 0.140, 0.150, 0.5, 0.45, 0.004, 0.006, 0.0),
    (-0.13, 0.172, 0.172, 0.5, 0.45, 0.004, 0.007, 0.010),
    (-0.22, 0.168, 0.170, 0.5, 0.45, 0.004, 0.008, 0.008),
    (-0.40, 0.120, 0.122, 0.5, 0.45, 0.000, 0.004, 0.0),
]


def _st(table, z0, z1, n=3):
    return [(z, S.sec(w, d, cf, cb, yc, keel=keel, bulge=bulge)) for z, (w, d, cf, cb, yc, keel, bulge) in S.interp_stations(table, z0, z1, n)]


def upperarm():
    out = []
    out.append((S.ball((0, 0, 0), 0.08, 16, 8), 'polymer'))
    # deltoid bell: rounded cap over the shoulder, slightly outboard
    st = [(0.112, S.squircle(0.15, 0.14, 2.6, 20, xc=0.02)),
          (0.09, S.squircle(0.225, 0.21, 2.6, 20, xc=0.022)),
          (0.03, S.squircle(0.26, 0.24, 2.8, 20, xc=0.024)),
          (-0.05, S.squircle(0.26, 0.24, 2.8, 20, xc=0.022)),
          (-0.115, S.squircle(0.235, 0.215, 2.8, 20, xc=0.016))]
    bell = S.loft(st, cap=0.02, seg=3)
    out.append((bell, 'alloy'))
    ring = S.squircle(0.215, 0.20, 2.8, 20, xc=0.012)
    out.append((S.loft([(-0.155, S.offset_poly(ring, -0.01)), (-0.128, ring)], cap=0.006), 'polymer'))
    bb = S.bvh_of(bell)
    # shell and core
    bands, core = S.bands(lambda a, b: _st(UPPER_ST, a, b), [-0.165, -0.32, -0.47], gap=0.012, core=0.016)
    out += [(m, 'alloy') for m in bands]
    out.append((core, 'mech'))
    out.append((S.loft([(-0.10, S.squircle(0.10, 0.10, 3, 20)), (-0.50, S.squircle(0.09, 0.09, 3, 20))], cap=0.006), 'mech'))
    sb = S.bvh_of(*bands)
    # red unit marking on the outer face below the bell, and its bolts
    f = S.tangent_frame((0.1, 0.0, -0.245), (1.0, 0.0, 0.0))
    mark = S.fillet_poly(S.ccw([(-0.06, -0.045), (0.06, -0.045), (0.06, 0.045), (-0.06, 0.045)]), 0.008, 2)
    out.append((S.conform_plate(sb, f, mark, 0.005, bevel=0.0015, rings=2), 'red'))
    out += [(m, 'steel') for m in S.bolts(sb, f, [(-0.072, 0.055), (0.072, 0.055), (-0.072, -0.055), (0.072, -0.055)], r=0.0065)]
    f = S.tangent_frame((0.0, -0.08, -0.36), (0.0, -1.0, 0.0))
    out.append((S.conform_plate(sb, f, S.fillet_poly(S.ccw([(-0.045, -0.1), (0.045, -0.1), (0.05, 0.08), (-0.05, 0.08)]), 0.012, 2), 0.012, rings=3), 'alloy'))
    # elbow clevis cheeks either side of the forearm drum
    for s in (1, -1):
        out.append((S.cheek(s * 0.07, s * 0.09, -0.44, -rig.UPPER, 0.055), 'alloy'))
    return out


def forearm():
    out = []
    out.append((S.drum((0, 0, 0), 0.066, 0.138, 'X', 19), 'polymer'))
    out.append((S.cyl((0, 0, 0), 0.026, 0.19, 'X', 18), 'steel'))
    out.append((S.ball((0.0, 0.035, -0.02), 0.05, 13, 6), 'polymer'))  # elbow point
    bands, core = S.bands(lambda a, b: _st(FORE_ST, a, b), [-0.065, -0.22, -0.40], gap=0.012, core=0.016)
    out += [(m, 'alloy') for m in bands]
    out.append((core, 'mech'))
    sb = S.bvh_of(*bands)
    # raised outer guard plate with a vent
    f = S.tangent_frame((0.08, 0.0, -0.17), (1.0, -0.15, 0.0))
    g = S.fillet_poly(S.ccw([(-0.05, -0.09), (0.05, -0.09), (0.055, 0.07), (-0.04, 0.08)]), 0.012, 2)
    guard = S.conform_plate(sb, f, g, 0.016, rings=3)
    out.append((guard, 'alloy'))
    gb = S.bvh_of(guard)
    out += S.vent(gb, S.tangent_frame((0.1, 0.0, -0.16), (1.0, -0.15, 0.0)), 0.06, 0.07, slats=3, t=0.01, frame_w=0.009)
    # wrist ring
    w = S.squircle(0.11, 0.11, 3.0, 20)
    out.append((S.loft([(-0.45, S.offset_poly(w, -0.008)), (-0.44, w), (-0.405, w), (-0.395, S.offset_poly(w, -0.008))], cap=0.0), 'polymer'))
    out.append((S.loft([(-0.47, S.squircle(0.07, 0.07, 3, 20)), (-0.38, S.squircle(0.08, 0.08, 3, 20))], cap=0.004), 'mech'))
    return out
