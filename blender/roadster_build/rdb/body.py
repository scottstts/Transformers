"""Measured body: one shell lofted through transverse stations, one glass canopy.

Every station value is read off the registered references (reference.py):
heights from the side frame, half-widths from the top view, the front facets
from the front photo. The half-section, bottom to top:

  p0 underbody edge, p1 black rocker band top, p2 widest / side crease,
  p3 upper edge (fender peak -> belt -> haunch), p4 inner edge (hood edge ->
  canopy base -> rear glass edge -> deck), c centre (hood crown -> hidden
  under the glass -> deck).

The shell is cut into panels afterwards (panels.py) with planes on the measured
seams, so every panel shares the same surface.
"""
import math
from mathutils import Vector
from . import kit as K

NOSE_Y, TAIL_Y = -2.19, 2.165
# Plan bow of the nose front (kept as a hook; 0: the light bar is straight).
NOSE_BOW, BOW_X, BOW_LEN = 0.0, 0.593, 0.40     # the 3/4 photo fits a straight light bar best


def bow(x, y):
    """Rearward plan shift of the nose at (x, y), fading out BOW_LEN behind the nose."""
    q = min(1.0, (x / BOW_X) ** 2)
    return NOSE_BOW * q * max(0.0, 1.0 - (y - NOSE_Y) / BOW_LEN)


CORNER_R = 0.0            # the lamp and shoulder terminate at the same nose vertex


def corner_inset(y):
    """How far the nose's outer edge has rounded in at station y (quarter circle)."""
    d = (NOSE_Y + CORNER_R) - y
    if d <= 0:
        return 0.0
    d = min(d, CORNER_R)
    return CORNER_R - math.sqrt(max(0.0, CORNER_R * CORNER_R - d * d))


def nose_y(x):
    """The nose front's y at lateral position x."""
    return NOSE_Y + NOSE_BOW * min(1.0, (x / BOW_X) ** 2)
AXLE_F, AXLE_R = -1.405, 1.506
WHEEL_R, RIM_R = 0.392, 0.28
ARCH_R = 0.405
# Wheel-opening edge measured on the side frame: radius from the hub (m) at angles
# from forward (0) over the top (90) to rearward (180). The rear opening sits
# behind its hub: tight at the front-top, wider behind.
ARCH_FRONT = [(-10, .405), (0, .4015), (10, .4005), (20, .3985), (30, .3960), (40, .3945), (50, .3940),
              (60, .3915), (70, .3905), (80, .3893), (90, .3890), (100, .3875), (110, .3866), (120, .3872),
              (130, .3870), (140, .3875), (150, .3895), (160, .3905), (170, .3955), (180, .4005), (190, .4105)]
ARCH_REAR = [(-10, .392), (0, .384), (10, .3775), (20, .3705), (30, .3675), (40, .3672), (50, .3675), (60, .3695),
             (70, .3725), (80, .3755), (90, .3795), (100, .3835), (110, .3858), (120, .3915), (130, .3965),
             (140, .3995), (150, .4030), (160, .4060), (170, .4090), (180, .4120), (190, .4150)]
WHEELS = {  # name: (x centre, y, z, tyre width)
    'wheelF.L': (0.76, AXLE_F, 0.397, 0.265), 'wheelF.R': (-0.76, AXLE_F, 0.397, 0.265),
    'wheelR.L': (0.79, AXLE_R, 0.392, 0.340), 'wheelR.R': (-0.79, AXLE_R, 0.392, 0.340),
}

# y | x0 z0 | x1 z1 | x2 z2 | x3 z3 | x4 z4 | zc
ST = [
    (-2.190, .5, .26, .52, .37, .566, .5, .556, .565, .553, .572, .575),
    (-2.110, .54, .245, .555, .36, .595, .52, .575, .62, .555, .605, .608),
    (-2.037, .6, .235, .615, .355, .662, .535, .65, .66, .55, .633, .636),
    (-1.960, .64, .225, .655, .35, .688, .55, .67, .7, .54, .663, .666),
    (-1.884, .68, .2, .72, .347, .752, .565, .695, .75, .53, .692, .695),
    (-1.808, .72, .19, .755, .345, .79, .58, .724, .79, .52, .721, .724),
    (-1.731, .75, .18, .785, .343, .822, .595, .76, .817, .505, .75, .753),
    (-1.655, .81, .17, .845, .34, .88, .61, .784, .846, .495, .78, .783),
    (-1.578, .85, .165, .885, .338, .918, .625, .81, .866, .48, .808, .811),
    (-1.500, .86, .16, .895, .335, .924, .64, .822, .88, .47, .835, .840),
    (-1.425, .865, .155, .9, .332, .926, .65, .836, .89, .582, .857, .861),
    (-1.350, .87, .152, .905, .33, .93, .66, .84, .896, .69, .878, .882),
    (-1.270, .87, .15, .905, .327, .93, .67, .845, .899, .785, .897, .901),
    (-1.120, .87, .148, .905, .322, .93, .69, .825, .890, .785, .889, .850),
    (-1.043, .86, .147, .895, .32, .911, .70, .815, .885, .79, .884, .850),
    (-0.950, .85, .146, .885, .318, .90, .72, .80, .878, .79, .877, .850),
    (-0.820, .86, .145, .89, .317, .915, .752, .805, .870, .795, .869, .845),
    (-0.710, .86, .145, .89, .318, .915, .762, .81, .867, .80, .866, .845),
    (-0.400, .86, .145, .89, .322, .915, .789, .82, .864, .81, .863, .840),
    (0.000, .86, .145, .89, .330, .915, .824, .82, .890, .81, .889, .860),
    (0.440, .86, .145, .89, .352, .915, .859, .82, .925, .81, .924, .890),
    (0.750, .87, .150, .90, .393, .93, .884, .80, .965, .79, .970, .920),
    (1.000, .88, .155, .91, .430, .94, .907, .80, .995, .64, 1.000, 1.000),
    (1.077, .885, .16, .915, .441, .945, .906, .586, 1.071, .551, 1.036, 1.024),
    (1.150, .887, .163, .918, .447, .948, .906, .555, 1.083, .52, 1.048, 1.036),
    (1.300, .89, .17, .925, .46, .956, .905, .502, 1.054, .467, 1.019, 1.007),
    (1.550, .89, .18, .925, .48, .956, .905, .409, .989, .374, .954, .942),
    (1.700, .87, .3, .905, .49, .93, .905, .355, .956, .32, .921, .909),
    (1.840, .85, .38, .885, .5, .915, .904, .3, .921, .265, .89, .878),
    (1.960, .82, .38, .855, .51, .885, .903, .60, .904, .3, .903, .903),
    (2.090, .79, .38, .82, .52, .842, .903, .60, .903, .3, .903, .903),
    (2.170, .76, .4, .79, .53, .815, .903, .60, .903, .3, .903, .903),
]

# Top silhouette from the side frame (y, z): the A-pillar / roof rail / rear glass.
SIL = [(-1.270, .899), (-1.215, .919), (-1.067, .965), (-0.919, 1.011), (-0.772, 1.055), (-0.624, 1.096),
       (-0.476, 1.135), (-0.328, 1.168), (-0.180, 1.196), (-0.032, 1.205), (0.116, 1.203), (0.264, 1.198),
       (0.411, 1.189), (0.559, 1.176), (0.707, 1.157), (0.855, 1.137), (1.003, 1.111), (1.151, 1.083),
       (1.299, 1.054), (1.447, 1.020), (1.594, .983), (1.742, .946), (1.840, .921)]
# Roof rail / A-pillar in plan (y, x) and the side glass's rear tip.
RAIL = [(-1.270, .785), (-1.100, .740), (-0.800, .690), (-0.342, .567), (0.000, .550), (0.300, .532),
        (0.551, .515), (0.800, .528), (1.077, .551)]
CANOPY_Y0, CANOPY_Y1 = -1.50, 1.84
# white roof rail band and the black seal under it, side frame (rail top is the
# silhouette less 5 mm)
_RB = [(-1.0, .030), (-0.6, .029), (-0.3, .024), (0.0, .024), (0.3, .030), (0.6, .035), (0.9, .037)]
_RS = [(-1.0, .005), (-0.6, .006), (-0.3, .014), (0.0, .015), (0.3, .016), (0.6, .011), (0.9, .005)]


def pchip(xs, ys):
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [d[0]] + [0.0] * (n - 2) + [d[-1]]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        x = max(xs[0], min(xs[-1], x))
        i = 0
        while i < n - 2 and x > xs[i + 1]:
            i += 1
        t = (x - xs[i]) / h[i]
        return ((2 * t ** 3 - 3 * t * t + 1) * ys[i] + (t ** 3 - 2 * t * t + t) * h[i] * m[i] +
                (-2 * t ** 3 + 3 * t * t) * ys[i + 1] + (t ** 3 - t * t) * h[i] * m[i + 1])
    return f


KEYS = ('x0', 'z0', 'x1', 'z1', 'x2', 'z2', 'x3', 'z3', 'x4', 'z4', 'zc')
_Y = [r[0] for r in ST]
# Feature curves: pchip through the stations, then Gaussian-smoothed along y on a
# dense grid. pchip alone is only C1; its curvature jumps at every station showed
# as vertical bands in the reflections. Sharp, deliberate transitions (the hood
# edge turning out along the windshield base) get a small sigma.
SMOOTH = {'x4': 0.012, 'z4': 0.06, 'zc': 0.06, 'x3': 0.035, 'z3': 0.06}


def smoothed(xs, ys, sigma, step=0.004):
    import numpy as np
    f = pchip(xs, ys)
    g = np.arange(xs[0], xs[-1] + step / 2, step)
    v = np.array([f(t) for t in g])
    r = int(3 * sigma / step)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) * step / sigma) ** 2)
    k /= k.sum()
    pad = np.concatenate([2 * v[0] - v[r:0:-1], v, 2 * v[-1] - v[-2:-r - 2:-1]])
    sv = np.convolve(pad, k, mode='valid')

    def fn(t):
        t = min(max(t, g[0]), g[-1])
        i = min(len(g) - 2, int((t - g[0]) / step))
        u = (t - g[i]) / step
        return float(sv[i] * (1 - u) + sv[i + 1] * u)
    return fn


P = {k: smoothed(_Y, [r[i + 1] for r in ST], SMOOTH.get(k, 0.045)) for i, k in enumerate(KEYS)}
SIL_Z = pchip([a for a, b in SIL], [b for a, b in SIL])
RAIL_X = pchip([a for a, b in RAIL], [b for a, b in RAIL])
RAIL_BAND = pchip([a for a, b in _RB], [b for a, b in _RB])
RAIL_SEAL = pchip([a for a, b in _RS], [b for a, b in _RS])


def sta(y):
    s = {k: f(y) for k, f in P.items()}
    # Preserve the registered station curves; only constrain their common
    # nose endpoint. The previous piecewise replacements jumped at y=-1.5.
    k = 1.0 - K.smooth(y, NOSE_Y, -2.037)
    for key, endpoint in {'x2': .554, 'z2': .570, 'x3': .5535,
                          'z3': .5725, 'x4': .553, 'z4': .572}.items():
        s[key] += (endpoint - P[key](NOSE_Y)) * k
    if y >= QUARTER_Y[0]:
        # Lower quarter-glass boundary traced in the registered side frame.
        # Behind its tip this curve is the foot of the white roof-edge strip.
        t = K.smooth(y, QUARTER_Y[0], QUARTER_Y[1])
        s['z4'] = s['z4'] * (1 - t) + QUARTER_Z(y) * t
        # p3 is a subdivision of the same sail surface, not a second ridge.
        # The old x3/z3 track turned sharply inward and upward over 77 mm.
        s['x3'] = s['x3'] * (1 - t) + (s['x2'] * .12 + s['x4'] * .88) * t
        s['z3'] = s['z3'] * (1 - t) + (s['z2'] * .12 + s['z4'] * .88) * t
        deck = K.smooth(y, 1.55, CANOPY_Y1)
        s['zc'] = s['zc'] * (1 - deck) + .903 * deck
    return s


# Pixel coordinates in side_ref.png, 541 px/m. Upper/lower glass outlines
# must be distinguished from the bright sky reflection inside the window.
QUARTER_PX = [(1500, 249), (1600, 238), (1700, 228), (1750, 224),
              (1800, 217), (1825, 208), (1850, 192), (1877, 177)]
QUARTER_Y = [-1.405 + (x - 540) / 541 for x, z in QUARTER_PX]
SIDE_TIP = QUARTER_Y[-1]
QUARTER_Z = pchip(QUARTER_Y + [1.30, 1.55, 1.84, 1.96, TAIL_Y],
                  [.397 + (535 - z) / 541 - .001 for x, z in QUARTER_PX]
                  + [1.019, .954, .902, .903, .903])


def stations(a, b, step):
    """Sample [a, b] at `step`, always including the measured station ys inside."""
    pts = {round(a, 5), round(b, 5)}
    n = max(1, int(math.ceil((b - a) / step)))
    pts.update(round(a + (b - a) * i / n, 5) for i in range(n + 1))
    pts.update(round(y, 5) for y in _Y if a < y < b)
    return sorted(pts)


def half(s):
    return [(s['x%d' % i], s['z%d' % i]) for i in range(5)]


def refine(pts, bulges, seg):
    """Subdivide a closed (x, z) section: each edge gets seg sub-edges bowed
    outward by its bulge (sagitta, capped at 8 % of the edge). Returns the
    points and, per sub-edge, the index of the edge it came from."""
    zs = [z for x, z in pts]
    ref = (0.0, (min(zs) + max(zs)) / 2)
    out, src = [], []
    n = len(pts)
    for i in range(n):
        (px, pz), (qx, qz) = pts[i], pts[(i + 1) % n]
        dx, dz = qx - px, qz - pz
        L = math.hypot(dx, dz)
        nx, nz = (dz / L, -dx / L) if L > 1e-9 else (0.0, 0.0)
        mx, mz = (px + qx) / 2, (pz + qz) / 2
        if nx * (mx - ref[0]) + nz * (mz - ref[1]) < 0:
            nx, nz = -nx, -nz
        h = min(bulges[i], 0.08 * L)
        for k in range(seg):
            t = k / seg
            w = 4 * t * (1 - t) * h
            out.append((px + dx * t + nx * w, pz + dz * t + nz * w))
            src.append(i)
    return out, src


# outward bow of each half-section edge (m): rocker, side wall, shoulder / fender
# facet, upper facet, hood / deck; mirrored, then the flat floor
SHELL_BULGE = [0.003, 0.009, 0.005, 0.0, 0.004, 0.004, 0.0, 0.005, 0.009, 0.003, 0.0]
SEG = 4


def ring(y, flank=False):
    s = sta(y)
    h = half(s)
    pts = h + [(0.0, s['zc'])] + [(-x, z) for x, z in reversed(h)]
    pts, src = refine(pts, SHELL_BULGE, SEG)
    ins = corner_inset(y)
    if ins > 0:
        xmax = max(abs(p[0]) for p in pts)
        out = []
        for x_, z_ in pts:
            t = max(0.0, min(1.0, (abs(x_) - (xmax - 0.22)) / 0.22))
            t = t * t * (3 - 2 * t)
            out.append((x_ - math.copysign(ins * t, x_), z_))
        pts = out
    k = 0.0  # all panels share the same faceted section at their shut lines
    if k > 0:
        # the fender flank: one quadratic arc from p1 to p3 passing through p2
        # (its control point is 2 p2 - (p1 + p3) / 2), blended with the facets
        n = len(pts)
        for side in (1, -1):
            p1, p2, p3 = [(side * h[i][0], h[i][1]) for i in (1, 2, 3)]
            cx_ = 2 * p2[0] - 0.5 * (p1[0] + p3[0])
            cz_ = 2 * p2[1] - 0.5 * (p1[1] + p3[1])
            for i in range(SEG, 3 * SEG + 1):
                t = (i - SEG) / (2 * SEG)
                bx = (1 - t) ** 2 * p1[0] + 2 * t * (1 - t) * cx_ + t * t * p3[0]
                bz = (1 - t) ** 2 * p1[1] + 2 * t * (1 - t) * cz_ + t * t * p3[1]
                j = i if side == 1 else (n - SEG - i) % n     # mirrored index (point k -> 10 - k)
                ox, oz = pts[j]
                pts[j] = (ox + (bx - ox) * k, oz + (bz - oz) * k)
    return [Vector((x, y + bow(x, y), z)) for x, z in pts]


def ring_src(n_edges=11):
    return [i for i in range(n_edges) for _ in range(SEG)]


# per ring edge: p0-p1 rocker, p1..p4 paint, centre, mirrored, bottom
RING_MATS = ['satin', 'paint', 'paint', 'paint', 'paint', 'paint', 'paint', 'paint', 'paint', 'satin', 'carbon']


def loft_mats(m, rings, mats, caps=('satin', 'satin'), src=None, ring_mats=None):
    """mats: per original section edge; src maps each ring edge to its section edge;
    ring_mats(j) may return a per-ring replacement for mats."""
    n = len(rings[0])
    src = src or list(range(n))
    base = len(m.v)
    m.v.extend(p for r in rings for p in r)

    def slot(name):
        if name not in m.slots:
            m.slots.append(name)
        return m.slots.index(name)
    for j in range(len(rings) - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            m.band[len(m.f)] = src[i] + 1
            m.f.append((base + a, base + b, base + b + n, base + a + n))
            mm = ring_mats(j) if ring_mats else mats
            m.mi.append(slot(mm[src[i]]))
    if caps:
        m.f.append(tuple(base + i for i in reversed(range(n))))
        m.mi.append(slot(caps[0]))
        m.f.append(tuple(base + (len(rings) - 1) * n + i for i in range(n)))
        m.mi.append(slot(caps[1]))
    return m


def shell_mesh(flank=False):
    """flank=True: the front fender shell, its flank one smooth arc from the
    rocker to the fender-top crease; the panels ahead of the fender / door shut
    line are cut from it. flank=False: the faceted shell with the side crease,
    for everything behind that seam. The two meet only inside the shut line."""
    m = K.Mesh()
    y1 = -0.55 if flank else TAIL_Y
    y0 = NOSE_Y if flank else -1.30
    ys_ = set(stations(y0, y1, 0.012))
    if flank:   # dense stations round the nose corner's quarter circle
        ys_.update(round(NOSE_Y + CORNER_R * (1 - math.sin(math.radians(a))), 5) for a in range(0, 91, 6))
    ys_ = sorted(ys_)
    def materials_at(j):
        mats = list(RING_MATS)
        if flank and (ys_[j] + ys_[j + 1]) / 2 < -1.884:
            # The lens is the complete tip of the fender facet. Its perimeter
            # IS the shoulder/hood boundary, with no overlapping lens triangle
            # and no normal-extruded cutter breaking through the flank.
            mats[3] = mats[6] = 'lens'
        return mats
    return loft_mats(m, [ring(y, flank) for y in ys_], RING_MATS,
                     src=ring_src(), ring_mats=materials_at)


def canopy_ring(y):
    s = sta(y)
    bx, bz = s['x4'] - 0.003, s['z4'] + 0.001    # the glass edge sits on the body crease
    if y <= -1.27:
        u = (y - CANOPY_Y0) / (-1.27 - CANOPY_Y0)
        rx, rz = bx, bz + 0.004
        cz = 0.842 + (0.905 - 0.842) * u
    elif y < SIDE_TIP:
        rx, rz = RAIL_X(y), (SIL_Z(y) - 0.040 if y < 0.8 else 0.0)
        if y >= 0.8:  # side glass closes to its rear tip on the sail line
            rz = SIL_Z(y) - 0.040
        cz = SIL_Z(y) - 0.005
    else:
        # the rear glass lies in the saddle between the white sails
        tip_offset = sta(SIDE_TIP)['x4'] - 0.003 - RAIL_X(SIDE_TIP)
        rx, rz = bx - tip_offset, bz + 0.004
        # blends from the roof line at the side-glass tip into the saddle, so the
        # glass carries on without a kink
        cz = SIL_Z(y) - 0.005
    rz = max(rz, bz + 0.004)
    cz = max(cz, rz + 0.004)
    # the white roof rail seen from the side (side frame profiles): its top is the
    # silhouette, it is 22 mm tall at the A-pillar growing to 35 mm at the rear,
    # and a 12 mm black seal runs under it above the side glass. It fades out
    # where the side glass closes and at the A-pillar foot.
    k = max(0.0, min(1.0, (y + 1.29) / 0.04))
    band = RAIL_BAND(y) * k
    seal = RAIL_SEAL(y) * k
    kk = k * k * (3 - 2 * k)       # the rail top settles onto the glass edge as the band fades
    tz = (cz - 0.0005) * kk + min(rz + 0.0015, cz - 0.001) * (1 - kk)
    r_top, r_bot = tz, max(bz + 0.003, tz - band)
    s_bot = max(bz + 0.002, r_bot - seal)
    tx = rx - 0.001 - 0.010 * k
    rail_x, seal_x = rx, rx + 0.002 * k
    mx = (bx + seal_x) / 2 + 0.02 * min(1.0, (s_bot - bz) / 0.15)
    mz = (bz + s_bot) / 2
    h = [(bx, bz), (mx, mz), (seal_x, s_bot), (rail_x, r_bot), (tx, r_top)]
    pts = h + [(0.0, cz)] + [(-x, z) for x, z in reversed(h)]
    pts, src = refine(pts, CANOPY_BULGE, SEG)
    # One shared deck datum closes the complete glass section. The old centre
    # crown ended above an independently depressed deck, leaving an open slot.
    deck = K.smooth(y, 1.55, CANOPY_Y1)
    pts = [(x, bz + (z - bz) * (1 - deck)) for x, z in pts]
    # a thin shell: the outer surface from base to base, then the inner surface
    # GLASS_T inside it; the rims on the base are the only closing faces
    outer, osrc = pts[:len(pts) - SEG + 1], src[:len(pts) - SEG]
    cx, cz0 = 0.0, bz - 0.2
    inner = []
    for i, (px, pz) in enumerate(outer):
        a = outer[max(i - 1, 0)]
        b = outer[min(i + 1, len(outer) - 1)]
        tx_, tz_ = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx_, tz_) or 1.0
        nx, nz = -tz_ / L, tx_ / L
        if nx * (cx - px) + nz * (cz0 - pz) < 0:
            nx, nz = -nx, -nz
        inner.append((px + nx * GLASS_T, pz + nz * GLASS_T))
    ring = outer + list(reversed(inner))
    rsrc = osrc + [10] + [11] * (len(inner) - 1) + [10]
    return [Vector((x, y, z)) for x, z in ring], rsrc


# glass bows: side glass, rail trim, roof (both halves), the hidden floor
CANOPY_BULGE = [0.002, 0.003, 0.0, 0.0, 0.006, 0.006, 0.0, 0.0, 0.003, 0.002, 0.0]


CANOPY_MATS = ['glass', 'glass', 'satin', 'paint', 'glass', 'glass', 'paint', 'satin', 'glass', 'glass', 'satin', 'glass']
GLASS_T = 0.006


def canopy_mesh():
    m = K.Mesh()
    ys_ = sorted(set(stations(CANOPY_Y0, CANOPY_Y1, 0.012) + [SIDE_TIP]))
    rings = [canopy_ring(y) for y in ys_]
    # where the rail band has faded out (windshield base, rear glass) its
    # sliver segments are glass, not paint: they made a toothed edge
    glass_only = ['glass' if i in (2, 3, 6, 7) else mt for i, mt in enumerate(CANOPY_MATS)]

    def ring_mats(j):
        y = (ys_[j] + ys_[j + 1]) / 2
        if y >= SIDE_TIP:
            return ['paint' if i in (0, 1, 2, 3, 6, 7, 8, 9) else mt
                    for i, mt in enumerate(CANOPY_MATS)]
        k = max(0.0, min(1.0, (y + 1.29) / 0.04))
        return CANOPY_MATS if k > 0.15 else glass_only
    return loft_mats(m, [r for r, s in rings], CANOPY_MATS, caps=('glass', 'glass'), src=rings[0][1],
                     ring_mats=ring_mats)


def canopy_seat_mesh():
    """Through-aperture inside the glazing footprint with a 1 mm support rim.

    Cutting only the volume BELOW the glass left a second body skin anywhere
    the body rose above the glass. The aperture owns the whole vertical column.
    """
    m = K.Mesh()
    rings = []
    for y in stations(CANOPY_Y0 - 0.002, CANOPY_Y1 + 0.002, 0.012):
        yy = min(max(y, CANOPY_Y0), CANOPY_Y1)
        ring, _ = canopy_ring(yy)
        x0 = ring[0].x - 0.001
        pts = [Vector((x0, y, .30)), Vector((x0, y, 2.0)),
               Vector((-x0, y, 2.0)), Vector((-x0, y, .30))]
        rings.append(pts)
    return m.loft(rings, 'satin')
