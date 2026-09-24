"""Aerodynamic surfaces: front wing, rear wing, beam wing, floor and diffuser.

Every element is a spanwise loft of cambered sections (chord, incidence,
camber, dihedral per station): inverted wings carry negative camber and
negative incidence, so the trailing edges curl up as on the real car.
Wings are authored for the left half (x >= 0) and split on the centreline:
the transformer carries each half separately, so the halves are distinct
objects that meet on x = 0 with the standard 2G reveal.
"""
import math
from mathutils import Vector
from . import kit, dims as D
from .shape import (subdivide, wing, plate, spline2, strut, lerp, clamp01, smooth01, Track, stations, loft_rings,
                    ring_closed, ring_half, squircle, pod_pts)

G = D.G


def _el(x0, x1, steps, le, z, chord, inc, thick, camber, dih=None, tips=(False, True)):
    st = []
    for i in range(steps + 1):
        t = i / steps
        st.append(dict(le=(lerp(x0, x1, t), le(t), z(t)), chord=chord(t), inc=inc(t), thick=thick(t), camber=camber(t),
                       dih=dih(t) if dih else 0.0))
    return wing(st, 30, tips)


def _rise(t, amt):
    return amt * clamp01((t - 0.56) / 0.44) ** 1.75


# ------------------------------------------------------------------ front wing
FW_TIP = D.FW_SPAN - 0.012        # element tips meet the endplate inner face


def front_wing_elements():
    """[(mesh, slot)] of the four elements, left half, root at x = G."""
    x0 = G
    out = []
    out.append((_el(x0, FW_TIP, 28,
                    lambda t: D.FW_LE - 0.013 - 0.028 * clamp01((t - 0.45) / 0.55) ** 1.6,
                    lambda t: 0.066 + 0.016 * smooth01((t - 0.14) / 0.44) + _rise(t, 0.040),
                    lambda t: 0.270 - 0.014 * smooth01((t - 0.6) / 0.4) - 0.03 * clamp01((t - 0.88) / 0.12) ** 2,
                    lambda t: -0.05 - 0.07 * smooth01((t - 0.14) / 0.6),
                    lambda t: 0.060 - 0.009 * t,
                    lambda t: -0.030 - 0.044 * smooth01((t - 0.14) / 0.58),
                    lambda t: -0.06 - 0.30 * clamp01((t - 0.7) / 0.3) ** 1.8), 'carbon'))
    out.append((_el(0.10, FW_TIP - 0.004, 24,
                    lambda t: 2.782 - 0.026 * clamp01((t - 0.45) / 0.55) ** 1.6,
                    lambda t: 0.124 + 0.018 * smooth01(t) + _rise(t, 0.042),
                    lambda t: 0.190 + 0.012 * math.sin(math.pi * t) - 0.03 * clamp01((t - 0.86) / 0.14) ** 2,
                    lambda t: -0.20 - 0.10 * smooth01(t),
                    lambda t: 0.052 - 0.008 * t,
                    lambda t: -0.070 - 0.026 * smooth01(t),
                    lambda t: -0.10 - 0.34 * clamp01((t - 0.68) / 0.32) ** 1.8, (True, True)), 'carbon'))
    out.append((_el(0.17, FW_TIP - 0.008, 22,
                    lambda t: 2.622 - 0.024 * clamp01((t - 0.45) / 0.55) ** 1.6,
                    lambda t: 0.192 + 0.018 * smooth01(t) + _rise(t, 0.044),
                    lambda t: 0.160 + 0.010 * math.sin(math.pi * t) - 0.028 * clamp01((t - 0.86) / 0.14) ** 2,
                    lambda t: -0.34 - 0.11 * smooth01(t),
                    lambda t: 0.046 - 0.007 * t,
                    lambda t: -0.084 - 0.024 * smooth01(t),
                    lambda t: -0.14 - 0.36 * clamp01((t - 0.66) / 0.34) ** 1.8, (True, True)), 'paintWhite'))
    out.append((_el(0.24, FW_TIP - 0.012, 20,
                    lambda t: 2.508 - 0.022 * clamp01((t - 0.45) / 0.55) ** 1.6,
                    lambda t: 0.262 + 0.016 * smooth01(t) + _rise(t, 0.046),
                    lambda t: 0.118 + 0.008 * math.sin(math.pi * t) - 0.022 * clamp01((t - 0.86) / 0.14) ** 2,
                    lambda t: -0.52 - 0.10 * smooth01(t),
                    lambda t: 0.042 - 0.006 * t,
                    lambda t: -0.090 - 0.02 * smooth01(t),
                    lambda t: -0.18 - 0.38 * clamp01((t - 0.64) / 0.36) ** 1.8, (True, True)), 'paintWhite'))
    return out


def front_endplate():
    """Endplate (outline in (f, z)) curled outboard toward its top rear, with the
    footplate turning the lower edge outboard around the tyre."""
    out = [(3.058, 0.058), (3.052, 0.150), (3.030, 0.224), (2.980, 0.270), (2.880, 0.298), (2.720, 0.312),
           (2.590, 0.310), (2.490, 0.296), (2.420, 0.262), (2.384, 0.200), (2.372, 0.130), (2.384, 0.066),
           (2.450, 0.040), (2.700, 0.034), (2.950, 0.042)]
    outline = spline2(out, 64, closed=True)
    x0 = D.FW_SPAN - 0.009

    def curl(f, z):
        return 0.050 * clamp01((z - 0.10) / 0.20) ** 1.7 * clamp01((3.0 - f) / 0.55) ** 1.2
    ep = plate(outline, 0.009, warp=lambda u, v, w: (x0 + w + curl(u, v), u, v))
    foot = [(3.020 - 0.64 * t, 0.034 + 0.008 * math.sin(math.pi * t)) for t in (i / 20 for i in range(21))]
    foot += [(3.020 - 0.64 * t, 0.010 + 0.003 * math.sin(math.pi * t)) for t in (i / 20 for i in range(20, -1, -1))]

    def fwarp(u, v, w):
        t = clamp01((3.02 - u) / 0.64)
        return (x0 - 0.012 + (w + 0.02) * (1 + 1.2 * t) + 0.022 * t ** 1.4, u, v)
    fp = plate(foot, 0.04, warp=fwarp)
    return ep, fp


def nose_pylon():
    """Faired pylon joining the left half of the wing to the nose underside."""
    st = []
    for i in range(9):
        t = i / 8
        st.append(dict(le=(lerp(0.062, 0.052, t), lerp(2.935, 2.860, t), lerp(0.105, 0.262, smooth01(t))), chord=lerp(0.22, 0.17, t),
                       inc=0.0, thick=0.12, camber=0.0, sdir=(0, 0, 1), udir=(1, 0, 0), cdir=(0, -1, 0)))
    return wing(st, 30, (False, False))


# ------------------------------------------------------------------- rear wing
RW_HALF = D.RW_SPAN - 0.010


def rear_wing_elements():
    main = _el(G, RW_HALF, 18,
               lambda t: D.RW_LE - 0.004 + 0.012 * t ** 2.2,
               lambda t: 0.705 + 0.030 * t ** 2.0,
               lambda t: 0.262 - 0.02 * clamp01((t - 0.8) / 0.2) ** 2,
               lambda t: -0.16 - 0.04 * t * t,
               lambda t: 0.082 - 0.010 * t,
               lambda t: -0.062)
    flap = _el(G, RW_HALF - 0.004, 16,
               lambda t: -2.205 + 0.010 * t ** 2.2,
               lambda t: 0.842 + 0.026 * t ** 2.0,
               lambda t: 0.190 - 0.016 * clamp01((t - 0.82) / 0.18) ** 2,
               lambda t: -0.46 - 0.04 * t * t,
               lambda t: 0.058 - 0.008 * t,
               lambda t: -0.086)
    return [(main, 'paintWhite'), (flap, 'paintWhite')]


def rear_endplate():
    """2022+ endplate: the top corner rolls over into the wing tip."""
    out = [(-1.930, 0.600), (-1.948, 0.740), (-1.962, 0.860), (-1.990, 0.920), (-2.060, 0.944), (-2.200, 0.944),
           (-2.310, 0.928), (-2.380, 0.884), (-2.402, 0.800), (-2.398, 0.690), (-2.370, 0.612), (-2.280, 0.570),
           (-2.100, 0.556), (-1.980, 0.566)]
    outline = spline2(out, 80, closed=True)
    x0 = RW_HALF + 0.006

    def warp(u, v, w):
        top = clamp01((v - 0.80) / 0.14)
        return (x0 + w + 0.022 * top ** 2 * clamp01((-1.95 - u) / 0.45) ** 1.2, u, v)
    return plate(outline, 0.010, warp=warp)


def swan_neck():
    """Left swan-neck pylon: rises from the heel mount (the rear structure) and
    hooks over onto the upper surface of the main plane."""
    # base on the heel block of the foot (the tail), 1 cm into it; top hooked onto the main plane
    return strut((0.112, -2.300, 0.550), (0.116, -2.012, 0.786), chord=0.10, ratio=0.26, taper=0.72, steps=12, bow=0.03, stream=(0, 1, 0))


def drs_pod():
    rows = []
    for i in range(13):
        t = i / 12
        f = lerp(-2.040, -2.230, t)
        w = math.sin(math.pi * (0.12 + t * 0.76)) * 0.040
        rows.append([(math.sin(a) * w, f, 0.842 + math.cos(a) * w * 0.8) for a in (2 * math.pi * k / 20 for k in range(20))])
    return loft_rings(rows, True, True, cap_segs=3)


def beam_wing():
    up = _el(G, 0.380, 12, lambda t: -2.055 - 0.016 * t * t, lambda t: 0.336 + 0.012 * t * t,
             lambda t: 0.160, lambda t: -0.30, lambda t: 0.070, lambda t: -0.070)
    lo = _el(G, 0.360, 10, lambda t: -2.095 - 0.014 * t * t, lambda t: 0.262 + 0.010 * t * t,
             lambda t: 0.132, lambda t: -0.23, lambda t: 0.066, lambda t: -0.058)
    return [(up, 'carbon'), (lo, 'carbon')]


# ----------------------------------------------------------------------- floor
FLOOR = Track(
    # plank nose under the tub, tunnel inlets behind the front wheels, straight edge,
    # inward sweep ahead of the rear tyres into the diffuser
    halfW=[(1.42, 0.280), (1.30, 0.300), (1.20, 0.500), (1.06, 0.640), (0.80, 0.740), (0.40, 0.800), (-0.20, 0.820),
           (-0.90, 0.816), (-1.15, 0.760), (-1.32, 0.640), (-1.46, 0.548), (-1.70, 0.520), (-2.175, 0.505)],
    topZ=[(1.42, 0.112), (1.20, 0.100), (0.80, 0.094), (-0.40, 0.094), (-1.00, 0.102), (-1.40, 0.130),
          (-1.80, 0.226), (-2.175, 0.340)],
    botZ=[(1.42, 0.056), (1.20, 0.048), (0.80, 0.046), (-0.40, 0.048), (-1.00, 0.056), (-1.40, 0.070),
          (-1.80, 0.106), (-2.12, 0.156)],
    tunH=[(1.42, 0.004), (1.20, 0.016), (0.90, 0.034), (0.30, 0.046), (-0.50, 0.056), (-1.00, 0.084), (-1.40, 0.124),
          (-1.80, 0.156), (-2.12, 0.166)],
)


def floor_half_section(f):
    """Floor half section (x, z): flat top, edge lip, venturi tunnel roof, keel and
    the skid plank. x is monotonic by construction (tunnel points sit between the
    keel and the edge wall). Aft of the tunnel throat every underside point kicks
    up toward the top skin, so the diffuser exit is a thin trailing lip over the
    open tunnels, not a solid block."""
    p = FLOOR(f)
    e, top, bot, tun = p['halfW'], p['topZ'], p['botZ'], p['tunH']
    wall = e - 0.070
    rise = smooth01((-1.40 - f) / 0.78)
    lip = top - 0.014

    def up(z):
        return lerp(z, lip, rise * 0.94)
    plank = lerp(D.PLANK_Z, bot, smooth01((-1.40 - f) / 0.30))
    return [
        (0.0, top),
        (e * 0.60, top - 0.002),
        (e - 0.030, top - 0.004),
        (e, top - 0.016),
        (e + 0.003, up(top - 0.034)),
        (e - 0.008, up(bot + tun * 0.20 - 0.004)),
        (wall, up(bot + tun * 0.55)),
        (lerp(0.18, wall, 0.62), up(bot + tun)),
        (lerp(0.18, wall, 0.22), up(bot + tun * 0.80)),
        (0.170, up(bot + 0.004)),
        (0.150, up(bot)),
        (0.146, up(plank + 0.004)),          # skid plank under the centreline
        (0.140, up(plank)),
        (0.0, up(plank)),
    ]


def floor_surface():
    fs = stations(1.42, -2.175, 120, 0.25)
    # top x3, lip x2, edge wall, tunnel wall, roof x2, keel, plank side, plank edge, plank
    alloc = [6, 4, 2, 2, 2, 2, 3, 3, 3, 1, 1, 1, 3]
    rings = [ring_half(floor_half_section(f), f, 0, alloc=alloc) for f in fs]
    return loft_rings(rings, True, True)          # flat end faces (bevelled at finish)
