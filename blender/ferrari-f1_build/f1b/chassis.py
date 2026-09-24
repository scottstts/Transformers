"""Cockpit and upper-body hardware: roll-hoop airbox with its intake throat,
T-cam, halo, cockpit rim pads, mirrors and the engine-cover shark fin.

The airbox shell, lip and throat are one folded loft (outside -> over the lip
-> back inside), so the intake is a real aperture that cannot separate from
the bodywork around it. Positions come from the hull tracks and dims.
"""
import math
from mathutils import Vector
from . import kit, hull, dims as D
from .shape import (lerp, smooth01, smoother01, clamp01, stations, ring_closed, loft_rings, sweep, squircle,
                    plate, spline2, tube)

AIRBOX_MOUTH = -0.030
AIRBOX_TAIL = -0.335


def deck_z(x, f):
    """Height of the hull deck at (x, f) (crowned top, inside the deck half width)."""
    p = hull.HULL(f)
    u = min(1.0, abs(x) / max(p['wTop'], 1e-4))
    return p['zTop'] + p['crown'] * (1 - u * u)


def _airbox_sec(w, hT, hB, squash=0.32, n=40):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        sx, cy = math.sin(a), math.cos(a)
        rx = w * math.copysign(abs(sx) ** 0.72, sx)
        c, r = (hT + hB) * 0.5, (hT - hB) * 0.5
        shape = abs(cy) ** 0.60 if cy > 0 else -abs(cy) ** 1.40
        pts.append((rx * (1 - squash * cy if cy > 0 else 1), c + r * shape))
    return pts


def airbox():
    """Roll hoop + intake: [(mesh, slot)]."""
    rows = []
    L = AIRBOX_MOUTH - AIRBOX_TAIL
    for f in stations(AIRBOX_TAIL, AIRBOX_MOUTH, 34):
        t = (AIRBOX_MOUTH - f) / L                     # 0 at the mouth, 1 at the tail
        w = lerp(0.128, 0.184, smooth01(min(t * 1.55, 1)))
        hT = lerp(0.948, deck_z(0, f) + 0.004, smooth01(t) ** 1.3)
        hB = lerp(0.620, 0.700, t)
        rows.append(ring_closed(_airbox_sec(w, hT, hB), f, 36))
    for i in range(1, 5):
        t = i / 5
        rows.append(ring_closed(_airbox_sec(lerp(0.128, 0.108, t), lerp(0.948, 0.926, t), lerp(0.620, 0.642, t)),
                                AIRBOX_MOUTH + 0.010 * math.sin(math.pi * t), 36))
    for i in range(13):
        t = i / 12
        f = lerp(AIRBOX_MOUTH - 0.004, -0.300, t)
        s = lerp(1.0, 0.52, smooth01(t))
        c = 0.785
        rows.append(ring_closed(_airbox_sec(0.106 * s, c + 0.140 * s, c - 0.140 * s), f, 36))
    v, f = loft_rings(rows, True, True, cap_segs=3, bulge=0.3)
    # quad strips come first (strip r joins ring r and r + 1); the start cap prepends
    # cap_segs - 1 rings. Strips from the second half of the lip inward are the throat.
    n = 36
    throat = (3 - 1) + 35 + 2
    nstrips = len(rows) + 2 * (3 - 1) - 1
    slots = []
    for k in range(len(f)):
        r = k // n
        inside = throat <= r < nstrips or k >= nstrips * n + n     # the end pole fan closes the throat
        slots.append('interior' if inside else 'paint')
    return v, f, slots


def tcam():
    rows = []
    x, fc, z, sc = 0.0, -0.205, 0.985, 1.2
    Lh = 0.108 * sc
    for i in range(15):
        t = i / 14
        taper = math.sin(math.pi * (0.10 + t * 0.86)) ** 0.55
        w, h = sc * 0.0215 * taper, sc * 0.0195 * taper
        ff = fc + Lh * (0.42 - t)
        rows.append([(x + math.copysign(abs(math.sin(a)) ** 0.78, math.sin(a)) * w, ff,
                      z + math.copysign(abs(math.cos(a)) ** 0.78, math.cos(a)) * h) for a in (2 * math.pi * k / 24 for k in range(24))])
    pod = loft_rings(rows, True, True, cap_segs=3)
    stalk = tube([(0.0, -0.215, 0.925), (0.0, -0.212, 0.972)], 0.008, 12)
    return [(pod, 'carbon'), (stalk, 'carbon')]


# ------------------------------------------------------------------- halo
HALO_REAR = (0.296, 0.118, 0.640)     # tube axis above the deck: the mount blocks carry it
HALO_APEX = (0.0, 1.072, 0.918)


def halo():
    """Titanium hoop (painted body colour on the SF-25), centre pillar, rear mounts, vane."""
    out = []
    path = []
    for i in range(41):
        t = i / 40
        s = smooth01(t)
        x = lerp(HALO_REAR[0], HALO_APEX[0], s) + math.sin(t * math.pi) * 0.126
        z = lerp(HALO_REAR[2], HALO_APEX[2], smoother01(t)) + math.sin(t * math.pi) * 0.050
        f = lerp(HALO_REAR[1], HALO_APEX[1], t ** 0.86)
        path.append((x, f, z))
    sec = lambda t: squircle(lerp(0.0225, 0.0170, smooth01(t)), lerp(0.0330, 0.0250, smooth01(t)), 2.5, 16)
    for s in (1, -1):
        p = [(s * x, f, z) for x, f, z in path]
        out.append((sweep(p, sec, up=(0, 0, 1)), 'paint'))
    pil = [(0.0, lerp(1.070, 1.150, t * t), lerp(0.925, deck_z(0, 1.15) - 0.004, smooth01(t))) for t in (i / 14 for i in range(15))]
    out.append((sweep(pil, lambda t: squircle(lerp(0.024, 0.031, t), lerp(0.019, 0.026, t), 2.4, 14), up=(0, 1, 0)), 'paint'))
    for s in (1, -1):
        # mount block standing on the deck (2 mm clear: it lifts away with the halo)
        z0 = deck_z(HALO_REAR[0], HALO_REAR[1]) + 0.002
        blk = [(-0.046, z0), (0.046, z0), (0.040, HALO_REAR[2] + 0.010), (-0.034, HALO_REAR[2] + 0.018)]
        out.append((plate(blk, 0.034, warp=lambda u, v, w, s=s: (s * HALO_REAR[0] + w, HALO_REAR[1] + u, v)), 'titanium'))
    vane = spline2([(1.040, 0.912), (0.900, 0.936), (0.760, 0.944), (0.640, 0.938), (0.600, 0.925), (0.720, 0.915),
                    (0.870, 0.907), (1.020, 0.898)], 60, closed=True)
    out.append((plate(vane, 0.028, warp=lambda u, v, w: (w * 1.5, u, v)), 'carbon'))
    return out


# ------------------------------------------------------------------ cockpit rim
def rim_pad(s=1, part='front'):
    """Padded rim bead along one half of the cockpit opening, split at the hip
    station: 'front' rides the thigh plate, 'rear' the hip guard."""
    from .body import COCKPIT, S_HIP, G
    pts = spline2(COCKPIT, 60)
    keep = (lambda f: f > S_HIP + G) if part == 'front' else (lambda f: f < S_HIP - G)
    path = []
    for x, f in pts:
        if not keep(f):
            continue
        x2 = max(x, 0.004)
        path.append((s * (x2 + 0.004), f, deck_z(x2, f) + 0.006))
    sec = lambda t: squircle(0.017, 0.012, 2.6, 12)
    return sweep(path, sec, cap_segs=2, bulge=0.5, up=(0, 0, 1))


# ------------------------------------------------------------------- mirrors
def mirror(s=1):
    """Mirror housing on a faired stalk rising from the pod shelf (left: s = 1)."""
    out = []
    from .hull import POD
    f0 = 0.640
    base = (s * 0.470, f0, POD(f0)['zTop'] - 0.010)
    top = (s * 0.535, 0.690, 0.662)
    stalk = sweep([base, ((base[0] + top[0]) / 2, (f0 + 0.69) / 2, 0.625), top],
                  lambda t: squircle(lerp(0.030, 0.020, t), lerp(0.008, 0.007, t), 2.6, 12), up=(0, 1, 0))
    out.append((stalk, 'carbon'))
    rows = []
    for i in range(11):
        t = i / 10
        x = s * lerp(0.480, 0.600, t)
        sc = math.sin(math.pi * (0.22 + t * 0.60)) / math.sin(math.pi * 0.52)
        rows.append([(x, 0.700 + math.copysign(abs(math.sin(a)) ** 0.42, math.sin(a)) * 0.030 * sc,
                      0.672 + math.copysign(abs(math.cos(a)) ** 0.42, math.cos(a)) * 0.034 * sc) for a in (2 * math.pi * k / 28 for k in range(28))])
    out.append((loft_rings(rows, True, True, cap_segs=3, bulge=0.35), 'paint'))
    glass = plate([(-0.048, -0.024), (0.048, -0.024), (0.048, 0.024), (-0.048, 0.024)], 0.004,
                  warp=lambda u, v, w: (s * 0.540 + u, 0.670 - 0.002 + w, 0.672 + v))
    out.append((glass, 'mirror'))
    return out


# ---------------------------------------------------------------------- fin
def shark_fin():
    top = [(-0.470, 0.842), (-0.700, 0.818), (-0.950, 0.768), (-1.200, 0.700), (-1.420, 0.628), (-1.580, 0.580)]
    bot = [(-1.580, 0.560), (-1.400, 0.600), (-1.150, 0.640), (-0.900, 0.690), (-0.650, 0.748), (-0.470, 0.790)]
    # bottom edge sinks 12 mm into the deck along its length
    bot = [(f, deck_z(0, f) - 0.012) for f, _ in bot]
    outline = spline2(top + bot, 90, closed=True)
    return plate(outline, 0.014, warp=lambda u, v, w: (w * (1 - 0.3 * clamp01((u + 1.58) / 1.1)), u, v))


# ---------------------------------------------------------------- inlet duct
def inlet_duct(s=1):
    """Sidepod intake throat: an open duct from just inside the aperture, contracting
    inboard and back to the radiator face, which carries vertical cooling louvres."""
    from .body import inlet_outline
    from .shape import resample
    mouth = [(x, z) for x, z in inlet_outline(1)]
    cx = sum(p[0] for p in mouth) / len(mouth)
    cz = sum(p[1] for p in mouth) / len(mouth)
    loop = resample(mouth, 40)
    rows = []
    f0, f1 = D.POD_INLET + 0.012, D.POD_INLET - 0.090       # short throat: the upper arm runs inboard of it
    for i in range(9):
        t = i / 8
        k = lerp(0.985, 0.80, smooth01(t))
        shift = 0.0
        rows.append([(s * (cx + (x - cx) * k + shift), lerp(f0, f1, t), cz + (z - cz) * k - 0.010 * t) for x, z in loop])
    v, f = loft_rings(rows, False, True)
    out = [((v, f), 'interior')]
    # radiator louvres standing on the core face
    core_f = f1 + 0.004
    last = rows[-1]
    xs = [p[0] for p in last]
    zs = [p[2] for p in last]
    x0, x1 = min(xs) * s, max(xs) * s
    for i in range(7):
        x = lerp(x0 + 0.018, x1 - 0.018, i / 6)
        slat = [(-0.004, min(zs) + 0.016), (0.004, min(zs) + 0.016), (0.004, max(zs) - 0.016), (-0.004, max(zs) - 0.016)]
        out.append((plate(slat, 0.030, warp=lambda u, v, w, x=x: (s * (x + u), core_f + 0.015 + w, v)), 'carbonMatte'))
    return out


# ------------------------------------------------------------------ cockpit liner
def cockpit_liner():
    """Empty seat shell filling the cockpit opening just below the rim: the car
    shows no driver; the robot's head lies face down beneath it."""
    from .body import COCKPIT
    from .kit import offset_poly, ccw
    half = COCKPIT
    poly = half + [(-x, f) for x, f in reversed(half[1:-1])]
    inner = offset_poly(ccw(poly), -0.012)
    # dished seat: lowest at mid-cockpit, rising to the headrest and toward the front bulkhead
    def warp(u, v, w):
        t = clamp01((v - 0.10) / 0.98)
        z = 0.582 - 0.012 * math.sin(math.pi * t) + 0.010 * (u / 0.27) ** 2     # above the prone chest and head
        return (u, v, z + w)
    return plate(inner, 0.012, warp=warp)


def intake_duct():
    """Airbox throat behind the intake mouth: lofted from the mouth outline back
    into the roll-hoop structure, contracting, closed at the plenum."""
    from .body import intake_outline
    from .shape import resample
    loop = resample(intake_outline(), 36)
    cx = 0.0
    cz = sum(z for _, z in loop) / len(loop)
    rows = []
    for i in range(9):
        t = i / 8
        k = lerp(0.985, 0.55, smooth01(t))
        f = lerp(-0.092, -0.330, t)
        rows.append([(cx + x * k, f, cz + (z - cz) * k - 0.03 * t) for x, z in loop])
    return [(loft_rings(rows, False, True), 'interior')]
