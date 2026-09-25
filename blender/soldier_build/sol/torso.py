"""Pelvis, waist, chest and neck (bone-local coordinates, see rig.py).

The chest is a broad faceted alloy cuirass over a dark core: a rib band and an
upper band split by a seam, a dark sternum module with slots under a black
cowl, a chest intake, flank vents, a backpack plate with a vent box and
shoulder mounts that carry the arms out to the shoulder joints. The waist is a
stack of black bellows rings over a steel spine column; the pelvis a belt band
with front and rear hip plates and the black hip joint housings.
"""
import math
from mathutils import Vector
from . import kit as S
from . import rig

# chest stations: z, w, d, cf, cb, yc, keel
CHEST_ST = [
    (0.00, 0.40, 0.27, 0.50, 0.45, 0.000, 0.000),
    (0.12, 0.54, 0.33, 0.50, 0.45, -0.005, 0.008),
    (0.28, 0.70, 0.38, 0.50, 0.45, -0.012, 0.016),
    (0.44, 0.78, 0.40, 0.52, 0.45, -0.015, 0.020),
    (0.56, 0.78, 0.38, 0.56, 0.50, -0.012, 0.016),
    (0.64, 0.72, 0.33, 0.70, 0.60, -0.006, 0.008),
    (0.70, 0.58, 0.27, 0.80, 0.70, 0.000, 0.000),
]


def _chest_sec(z, grow=0.0):
    for i in range(len(CHEST_ST) - 1):
        a, b = CHEST_ST[i], CHEST_ST[i + 1]
        if a[0] <= z <= b[0] or i == len(CHEST_ST) - 2:
            t = max(0.0, min(1.0, (z - a[0]) / (b[0] - a[0])))
            w, d, cf, cb, yc, keel = [S.lerp(a[k], b[k], t) for k in range(1, 7)]
            s = S.sec(w, d, cf, cb, yc, keel=keel)
            return S.offset_poly(s, grow) if grow else s
    raise ValueError(z)


def _stations(z0, z1, n=5, grow=0.0):
    return [(S.lerp(z0, z1, k / (n - 1)), _chest_sec(S.lerp(z0, z1, k / (n - 1)), grow)) for k in range(n)]


def chest():
    out = []
    lower = S.loft(_stations(0.02, 0.244, 4), cap=0.014)
    upper = S.loft(_stations(0.256, 0.72, 7), cap=0.03, seg=3)
    core = S.loft(_stations(0.03, 0.70, 7, grow=-0.02), cap=0.01)
    out += [(lower, 'alloy'), (upper, 'alloy'), (core, 'mech')]
    up = S.bvh_of(upper)
    lo = S.bvh_of(lower)

    for s in (1, -1):
        # under-arm intake on the flank
        fs = S.tangent_frame((s * 0.38, 0.02, 0.34), (s, 0.1, 0.0))
        out += S.vent(up, fs, 0.10, 0.12, slats=4, t=0.012)
        # rib band side plates
        fr2 = S.tangent_frame((s * 0.2, 0.0, 0.14), (s * 0.45, -1.0, 0.0))
        rib = [(-0.07, -0.08), (0.07, -0.08), (0.08, 0.08), (-0.06, 0.08)]
        if s < 0:
            rib = [(-a, b) for a, b in rib]
        out.append((S.conform_plate(lo, fr2, S.fillet_poly(S.ccw(rib), 0.012, 2), 0.016, rings=3), 'alloy'))
        # shoulder mount: a machined stub from the chest side to the shoulder joint
        x0, x1 = 0.3, rig.SHOULDER_X - 0.07
        zc = rig.CHEST - rig.SHOULDER_DOWN
        out.append((S.cyl((s * (x0 + x1) / 2, 0.0, zc), 0.055, x1 - x0, 'X', 24), 'mech'))
        out.append((S.drum((s * (x1 - 0.012), 0.0, zc), 0.07, 0.03, 'X', 19), 'polymer'))


    # sternum module: a raised dark panel with slots under the cowl, a chest intake below it
    fc = S.tangent_frame((0.0, 0.0, 0.53), (0.0, -1.0, 0.0))
    mod = S.conform_plate(up, fc, S.chamfer_rect(0.12, 0.15, 0.012), 0.02, rings=2)
    out.append((mod, 'alloyDark'))
    mb = S.bvh_of(mod)
    for k in range(4):
        out.append((S.conform_plate(mb, fc, [(-0.035, -0.05 + k * 0.03), (0.035, -0.05 + k * 0.03), (0.035, -0.05 + k * 0.03 + 0.009), (-0.035, -0.05 + k * 0.03 + 0.009)], 0.004, bevel=0.0012, rings=1), 'polymer'))
    out += [(m, 'steel') for m in S.bolts(mb, fc, [(-0.045, 0.06), (0.045, 0.06), (-0.045, -0.06), (0.045, -0.06)], r=0.006)]
    out += S.vent(up, S.tangent_frame((0.0, 0.0, 0.35), (0.0, -1.0, 0.0)), 0.16, 0.06, slats=3, t=0.012, frame_w=0.01)
    # facet seams: dark strips down the front facet breaks
    for s in (1, -1):
        fsm = S.tangent_frame((s * 0.2, 0.0, 0.47), (s * 0.2, -1.0, 0.0))
        out.append((S.conform_plate(up, fsm, [(-0.005, -0.17), (0.005, -0.17), (0.005, 0.17), (-0.005, 0.17)], 0.004, bevel=0.0012, rings=1), 'polymer'))
    # abdomen plate
    fa = S.tangent_frame((0.0, 0.0, 0.12), (0.0, -1.0, 0.0))
    ab = S.fillet_poly(S.ccw([(-0.07, -0.08), (0.07, -0.08), (0.085, 0.08), (-0.085, 0.08)]), 0.015, 2)
    out.append((S.conform_plate(lo, fa, ab, 0.018, rings=3), 'alloy'))
    out.append((S.conform_plate(lo, fa, [(-0.05, -0.004), (0.05, -0.004), (0.05, 0.004), (-0.05, 0.004)], 0.024, bevel=0.002, rings=1), 'polymer'))

    # backpack: raised plate with a vent box and a status light
    fb = S.tangent_frame((0.0, 0.0, 0.45), (0.0, 1.0, 0.0))
    bp = S.fillet_poly(S.ccw([(-0.17, -0.2), (0.17, -0.2), (0.2, 0.16), (-0.2, 0.16)]), 0.03, 2)
    back = S.conform_plate(up, fb, bp, 0.03, bevel=0.008, rings=3)
    out.append((back, 'alloy'))
    bb = S.bvh_of(back)
    fbv = S.tangent_frame((0.0, 0.2, 0.44), (0.0, 1.0, 0.0))
    out += S.vent(bb, fbv, 0.16, 0.13, slats=5, t=0.014)
    out += [(m, 'steel') for m in S.bolts(bb, fbv, [(-0.15, -0.16), (0.15, -0.16), (-0.17, 0.12), (0.17, 0.12)], r=0.009)]
    fl = S.tangent_frame((0.0, 0.2, 0.58), (0.0, 1.0, 0.0))
    out.append((S.conform_plate(bb, fl, [(-0.05, -0.006), (0.05, -0.006), (0.05, 0.006), (-0.05, 0.006)], 0.006, bevel=0.002, rings=1), 'glow'))
    # black cowl rising from the chest top around the neck
    st = [(0.60, S.sec(0.40, 0.30, 0.5, 0.5, 0.01)), (0.72, S.sec(0.33, 0.25, 0.5, 0.5, 0.01)), (0.80, S.sec(0.21, 0.18, 0.5, 0.5, 0.012))]
    out.append((S.loft(st, cap=0.01), 'shell'))
    return out


def waist():
    out = []
    col = S.squircle(0.22, 0.16, 3.0, 20)
    out.append((S.loft([(-0.04, col), (0.23, col)], cap=0.006), 'steel'))
    ring = S.squircle(0.30, 0.215, 3.2, 20)
    zs = [(0.005, 0.055), (0.07, 0.12), (0.135, 0.185)]
    for i, (a, b) in enumerate(zs):
        r = S.offset_poly(ring, -0.01 * abs(i - 1))
        out.append((S.loft([(a, S.offset_poly(r, -0.012)), (a + 0.012, r), (b - 0.012, r), (b, S.offset_poly(r, -0.012))], cap=0.0), 'polymer'))
    # front/back struts: a flat link plate across the bellows either side
    for s in (1, -1):
        for yy in (-0.112, 0.112):
            out.append((S.bevel_prism(S.chamfer_rect(0.03, 0.012, 0.003), -0.02, 0.21, 0.003,
                                      M=S.frame_from(Vector((s * 0.095, yy, 0.0)), (1, 0, 0), (0, 1, 0))), 'mech'))
    return out


def pelvis():
    out = []
    core = S.squircle(0.36, 0.24, 3.0, 20)
    out.append((S.loft([(-0.07, core), (0.20, core)], cap=0.01), 'mech'))
    belt = S.sec(0.43, 0.29, 0.55, 0.5)
    out.append((S.loft([(0.075, belt), (0.17, S.offset_poly(belt, -0.01))], cap=0.012), 'alloy'))
    # front hip plate (tapering codpiece) and rear plate
    for yc, sgn in ((-0.105, -1), (0.10, 1)):
        st = [(0.065, S.sec(0.34, 0.10, 0.6, 0.6, yc)),
              (-0.03, S.sec(0.24, 0.095, 0.6, 0.6, yc + sgn * 0.002)),
              (-0.12, S.sec(0.11, 0.075, 0.6, 0.6, yc - sgn * 0.012))]
        out.append((S.loft(st, cap=0.012), 'alloy'))
    b = S.bvh_of(S.loft([(0.075, belt), (0.17, belt)], cap=0.0))
    for s in (1, -1):
        # hip joint housing: black drum across the hip axis with a machined cap
        out.append((S.ball((s * rig.HIP_X, 0.0, 0.0), 0.085, 16, 8), 'polymer'))
        out.append((S.drum((s * 0.16, 0.0, 0.02), 0.09, 0.05, 'X', 19), 'mech'))
        f = S.tangent_frame((s * 0.2, 0.0, 0.12), (s, 0.0, 0.0))
        out += [(m, 'steel') for m in S.bolts(b, f, [(-0.08, 0.0), (0.08, 0.0)], r=0.008)]
    fb = S.tangent_frame((0.0, 0.0, 0.12), (0.0, -1.0, 0.0))
    out.append((S.conform_plate(b, fb, S.chamfer_rect(0.08, 0.05, 0.01), 0.01, rings=2), 'polymer'))
    return out


def neck():
    out = []
    out.append((S.cyl((0.0, 0.0, 0.03), 0.045, 0.24, 'Z', 20), 'steel'))
    for z in (-0.02, 0.03, 0.08):
        prof = [(0.0, -0.022), (0.055, -0.022), (0.068, -0.012), (0.068, 0.012), (0.055, 0.022), (0.0, 0.022)]
        out.append((S.revolve(prof, 24, axis='Z', M=S.Matrix.Translation(Vector((0, 0, z)))), 'rubber'))
    return out
