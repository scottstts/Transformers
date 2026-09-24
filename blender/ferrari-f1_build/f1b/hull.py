"""Outer body surface of the SF-25: one continuous hull loft (nose, survival
cell, engine cover, gearbox cover) and the two sidepod volumes.

Sections are fixed sets of named control points sampled from monotone
parameter tracks, so a design value moves a feature without changing
topology. The hull is closed over the cockpit: the opening is a real aperture
cut into the skin later (body.py), because the robot's head and arms sit in
it and the shell must be hollow underneath.
"""
from .shape import Track, stations, ring_half, ring_closed, pod_pts, loft_rings, lerp, smooth01, clamp01
from . import dims as D

# ------------------------------------------------------------------ hull tracks
# f stations run nose tip -> tail
HULL = Track(
    # deck height on the centreline (cockpit rim height through the opening)
    zTop=[(2.985, 0.298), (2.850, 0.338), (2.600, 0.408), (2.300, 0.474), (2.000, 0.536), (1.700, 0.578),
          (1.400, 0.597), (1.060, 0.604), (0.700, 0.604), (0.300, 0.600), (0.100, 0.606), (0.000, 0.650),
          (-0.100, 0.742), (-0.240, 0.838), (-0.400, 0.814), (-0.650, 0.752), (-0.950, 0.676), (-1.250, 0.606),
          (-1.550, 0.566), (-1.800, 0.556), (-2.050, 0.556), (-2.250, 0.550), (-2.430, 0.540)],
    # deck half width (where the crowned top rolls into the flank)
    wTop=[(2.985, 0.046), (2.850, 0.058), (2.600, 0.078), (2.300, 0.100), (2.000, 0.126), (1.700, 0.166),
          (1.400, 0.222), (1.060, 0.276), (0.700, 0.300), (0.300, 0.304), (0.100, 0.300), (0.000, 0.270),
          (-0.100, 0.224), (-0.240, 0.186), (-0.400, 0.184), (-0.650, 0.196), (-0.950, 0.210), (-1.250, 0.212),
          (-1.550, 0.200), (-1.800, 0.180), (-2.050, 0.170), (-2.250, 0.160), (-2.430, 0.150)],
    # maximum half width of the section
    halfW=[(2.985, 0.068), (2.850, 0.082), (2.600, 0.106), (2.300, 0.134), (2.000, 0.172), (1.700, 0.220),
           (1.400, 0.280), (1.060, 0.340), (0.700, 0.380), (0.300, 0.392), (0.100, 0.392), (0.000, 0.388),
           (-0.100, 0.374), (-0.240, 0.358), (-0.400, 0.350), (-0.650, 0.344), (-0.950, 0.336), (-1.250, 0.326),
           (-1.550, 0.312), (-1.800, 0.290), (-2.050, 0.266), (-2.250, 0.250), (-2.430, 0.240)],
    # height of the max-width line
    zSh=[(2.985, 0.262), (2.850, 0.286), (2.600, 0.326), (2.300, 0.362), (2.000, 0.386), (1.700, 0.388),
         (1.400, 0.378), (1.060, 0.366), (0.700, 0.356), (0.300, 0.350), (0.000, 0.356), (-0.240, 0.410),
         (-0.650, 0.418), (-0.950, 0.404), (-1.250, 0.386), (-1.550, 0.368), (-1.800, 0.358), (-2.100, 0.352),
         (-2.430, 0.348)],
    zBot=[(2.985, 0.212), (2.850, 0.208), (2.600, 0.206), (2.300, 0.206), (2.000, 0.204), (1.700, 0.180),
          (1.400, 0.148), (1.060, 0.126), (0.700, 0.118), (0.300, 0.116), (0.000, 0.118), (-0.400, 0.124),
          (-0.950, 0.136), (-1.300, 0.150), (-1.600, 0.176), (-1.900, 0.200), (-2.200, 0.232), (-2.430, 0.262)],
    wBot=[(2.985, 0.048), (2.850, 0.060), (2.600, 0.080), (2.300, 0.100), (2.000, 0.126), (1.700, 0.160),
          (1.400, 0.198), (1.060, 0.230), (0.700, 0.246), (0.300, 0.252), (0.000, 0.250), (-0.400, 0.246),
          (-0.950, 0.242), (-1.300, 0.234), (-1.600, 0.222), (-1.900, 0.204), (-2.200, 0.168), (-2.430, 0.116)],
    crown=[(2.985, 0.006), (2.300, 0.014), (1.700, 0.024), (1.060, 0.022), (0.300, 0.012), (-0.240, 0.020),
           (-0.950, 0.034), (-1.550, 0.030), (-2.430, 0.012)],
    waist=[(2.985, 0.000), (2.000, 0.004), (1.060, 0.020), (0.300, 0.026), (-0.400, 0.020), (-1.300, 0.012),
           (-2.430, 0.004)],
)


def hull_half(p):
    """Named half-section control points (x, z), top centreline -> bottom centreline."""
    wT, hw, wb = p['wTop'], p['halfW'], p['wBot']
    zT, zS, zB, cr, wa = p['zTop'], p['zSh'], p['zBot'], p['crown'], p['waist']
    return [
        (0.0, zT + cr),
        (wT * 0.50, zT + cr * 0.78),
        (wT * 0.88, zT + cr * 0.22),
        (wT, zT - 0.002),
        (lerp(wT, hw, 0.42), lerp(zT, zS, 0.30)),
        (lerp(wT, hw, 0.84), lerp(zT, zS, 0.74)),
        (hw, zS),
        (lerp(hw, wb, 0.30) - wa, lerp(zS, zB, 0.36)),
        (lerp(hw, wb, 0.72) - wa * 0.6, lerp(zS, zB, 0.78)),
        (wb, zB + 0.010),
        (wb * 0.52, zB + 0.002),
        (0.0, zB),
    ]


HULL_N = 34        # half-section samples (ring = 2 * (HULL_N - 1))
HULL_ROWS = 124


def hull_surface():
    fs = stations(D.NOSE_TIP, D.COVER_TAIL, HULL_ROWS, 0.3)
    rings = [ring_half(hull_half(HULL(f)), f, HULL_N) for f in fs]
    return loft_rings(rings, True, True, cap_segs=4, bulge=(0.35, 0.10))


# ----------------------------------------------------------------- sidepods
# SF-25 pods: high flat top shelf with the inlet set back, a deep undercut, a
# long downwash ramp falling to the floor ahead of the rear wheels
POD = Track(
    xIn=[(0.740, 0.280), (0.300, 0.280), (-0.400, 0.280), (-0.900, 0.270), (-1.350, 0.250)],
    xOut=[(0.740, 0.664), (0.600, 0.724), (0.300, 0.752), (0.000, 0.762), (-0.400, 0.726), (-0.800, 0.612),
          (-1.100, 0.470), (-1.350, 0.330)],
    zTop=[(0.740, 0.574), (0.600, 0.584), (0.300, 0.586), (0.000, 0.576), (-0.400, 0.546), (-0.800, 0.472),
          (-1.100, 0.372), (-1.350, 0.262)],
    zBot=[(0.740, 0.286), (0.600, 0.252), (0.300, 0.212), (0.000, 0.182), (-0.400, 0.156), (-0.800, 0.142),
          (-1.100, 0.136), (-1.350, 0.132)],
    undercut=[(0.740, 0.10), (0.600, 0.40), (0.300, 0.62), (0.000, 0.66), (-0.400, 0.60), (-0.800, 0.46),
              (-1.100, 0.30), (-1.350, 0.14)],
    ucZ=[(0.740, 0.26), (0.300, 0.21), (-0.400, 0.19), (-1.350, 0.24)],
    ucW=[(0.740, 0.42), (0.000, 0.38), (-1.350, 0.42)],
    shelf=[(0.740, 0.12), (0.300, 0.26), (0.000, 0.30), (-0.400, 0.26), (-0.800, 0.18), (-1.350, 0.05)],
    nTop=[(0.740, 5.2), (0.300, 6.4), (0.000, 6.6), (-0.600, 5.2), (-1.350, 3.4)],
    nBot=[(0.740, 3.0), (0.000, 3.4), (-1.350, 2.8)],
    nIn=[(0.740, 3.0), (0.000, 3.2), (-1.350, 2.8)],
)

POD_RING = 60


def pod_section(f, n=POD_RING):
    p = POD(f)
    return pod_pts(p['xIn'], p['xOut'], p['zTop'], p['zBot'], p['nTop'], p['nBot'], p['nIn'],
                   p['undercut'], p['ucZ'], p['ucW'], p['shelf'], 64)


def pod_surface(s=1):
    """Left pod (s = 1) or mirrored right pod as a closed loft from the inlet
    plane to its tail (the inlet is cut into the skin as a real aperture)."""
    fs = stations(D.POD_INLET, D.POD_END, 70, 0.25)
    rings = []
    for f in fs:
        r = ring_closed(pod_section(f), f, POD_RING)
        rings.append([(s * x, ff, z) for x, ff, z in r])
    return loft_rings(rings, True, True, cap_segs=4, bulge=0.5)
