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
# Top view: the nose front is bowed in plan, 26 mm back at |x| 0.3, 51 mm at 0.45 and
# 80 mm at 0.55 behind its centre (y -2.19). The profile q(u) = u^2 (2 - u^2) levels
# off smoothly at |x| BOW_X and the bow fades smoothly over BOW_LEN: a profile with a
# slope break creased the corners into wrinkles as the sections widen. The fade runs
# the full length up to the windscreen base (the canopy is not bowed): a short fade
# bunched the hood's rise and streaked it.
NOSE_BOW, BOW_X, BOW_LEN = 0.10, 0.80, 0.68


def bow_q(x):
    u = min(1.0, abs(x) / BOW_X)
    return u * u * (2.0 - u * u)


def bow(x, y):
    """Rearward plan shift of the nose at (x, y), fading out BOW_LEN behind the nose."""
    t = min(1.0, max(0.0, (y - NOSE_Y) / BOW_LEN))
    return NOSE_BOW * bow_q(x) * (1.0 - t * t * (3.0 - 2.0 * t))


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
    return NOSE_Y + NOSE_BOW * bow_q(x)
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
    (-1.270, .87, .15, .900, .327, .921, .67, .845, .899, .785, .897, .901),
    (-1.120, .87, .148, .895, .322, .916, .69, .825, .890, .785, .889, .850),
    (-1.043, .866, .147, .893, .32, .915, .70, .815, .885, .79, .884, .850),
    (-0.950, .862, .146, .891, .318, .915, .72, .80, .878, .79, .877, .850),
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
RAIL = [(-0.342, .567), (0.000, .550), (0.300, .532),
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
_RAIL_ROOF = pchip([a for a, b in RAIL], [b for a, b in RAIL])
# Top view: the A-pillar (the windshield's side edge) is straight in plan from its
# foot (y -1.27, |x| 0.785) to the windshield's top corner (y -0.342, 0.567); a
# curve through intermediate points bellied 15 mm outward. It turns into the roof
# rail through a short blend around the corner.
A_PILLAR_X = ((-1.270, .785), (-0.342, .567))


def RAIL_X(y):
    (ya, xa), (yb, xb) = A_PILLAR_X
    line = xa + (xb - xa) * (y - ya) / (yb - ya)
    if y >= yb:
        roof = _RAIL_ROOF(y)
    else:
        m = (_RAIL_ROOF(yb + 0.005) - _RAIL_ROOF(yb)) / 0.005
        roof = xb + m * (y - yb)
    w = K.smooth(y, yb - 0.10, yb + 0.10)
    return line * (1 - w) + roof * w
RAIL_BAND = pchip([a for a, b in _RB], [b for a, b in _RB])
RAIL_SEAL = pchip([a for a, b in _RS], [b for a, b in _RS])


# Front photo: the black nose face widens downward; the white corner's inner edge
# runs straight from the light bar's end (|x| 0.548) out to |x| 0.583 at its
# bottom (p1), and the corner block below keeps that width.
NOSE_END = {'x2': .554, 'z2': .570, 'x3': .5535, 'z3': .5725, 'x4': .553, 'z4': .572}
# Front fender ahead of the wheel (front view): the shell hides the tyre, so at the
# wheel opening's front edge the side (p2 crease down to p0) stands at the tyre's
# outer face. From the nose each width runs out on a Hermite (start width, start
# slope) to (end width, level) at FENDER_Y; behind it, inside the opening, it eases
# back to the stations. The p2 crease stays outboard of the line p3-p1, so every
# section is convex.
FENDER_Y = -1.80
FENDER = {'x0': (.578, .55, .865), 'x1': (.583, .55, .872)}
# The side crease p2 in plan: one monotone curve whose outward slope only decreases
# rearward (a convex fender), from the lamp tip through the tyre's width at the
# wheel opening's front edge to the stations behind the wheel. Holding it level at
# the opening and then letting it climb into the stations made an S, a dent.
FENDER_X2 = pchip([NOSE_Y, -1.80, -1.70, -1.60, -1.50, -1.27], [.554, .885, .908, .918, .922, .921])


def fender_x(key, y):
    a, m0, b = FENDER[key]
    h = FENDER_Y - NOSE_Y
    t = (y - NOSE_Y) / h
    return (2 * t ** 3 - 3 * t * t + 1) * a + (t ** 3 - 2 * t * t + t) * h * m0 + (-2 * t ** 3 + 3 * t * t) * b
FRONT_LINES = ((3, -1.30), (4, -1.505))
P2_LINE_Y = -1.808


def sta(y):
    s = {k: f(y) for k, f in P.items()}
    # Preserve the registered station curves; only constrain their common
    # nose endpoint. The previous piecewise replacements jumped at y=-1.5.
    k = 1.0 - K.smooth(y, NOSE_Y, -2.037)
    for key, endpoint in NOSE_END.items():
        s[key] += (endpoint - P[key](NOSE_Y)) * k
    if y < FENDER_Y:
        for key in FENDER:
            s[key] = fender_x(key, y)
    else:
        for key, (a, m0, b) in FENDER.items():
            u = K.smooth(y, FENDER_Y, -1.05)
            s[key] = b * (1 - u) + s[key] * u
    if y < -1.27:
        s['x2'] = FENDER_X2(y)
    # Front photo: both edges of the fender-top facet are straight lines seen from
    # the front, the crease (p3) from the nose tip up to the fender peak and the
    # hood edge (p4) from the tip to where it turns out along the windshield base.
    # Their heights stay measured (side frame); x follows the line.
    for i, y_end in FRONT_LINES:
        xk, zk = 'x%d' % i, 'z%d' % i
        w = 1.0 - K.smooth(y, y_end - 0.08, y_end)
        if w > 0:
            x0, z0, x1, z1 = NOSE_END[xk], NOSE_END[zk], P[xk](y_end), P[zk](y_end)
            s[xk] = s[xk] * (1 - w) + (x0 + (s[zk] - z0) * (x1 - x0) / (z1 - z0)) * w
    # Front photo: the side crease p2 runs straight out from the lamp tip; its
    # height follows that line (by x) to the measured crease at P2_LINE_Y, so it
    # does not sag below the tip and back up.
    w = 1.0 - K.smooth(y, P2_LINE_Y, P2_LINE_Y + 0.06)
    if w > 0:
        x0, z0, x1, z1 = NOSE_END['x2'], NOSE_END['z2'], FENDER_X2(P2_LINE_Y), P['z2'](P2_LINE_Y)
        s['z2'] = s['z2'] * (1 - w) + (z0 + (s['x2'] - x0) * (z1 - z0) / (x1 - x0)) * w
    if y >= QUARTER_Y[0]:
        # Lower quarter-glass boundary traced in the registered side frame.
        t = K.smooth(y, QUARTER_Y[0], QUARTER_Y[1])
        qx, qz = quarter_p4(y)
        s['x4'] = s['x4'] * (1 - t) + qx * t
        s['z4'] = s['z4'] * (1 - t) + qz * t
        # p3 is a subdivision of the same sail surface, not a second ridge.
        # The old x3/z3 track turned sharply inward and upward over 77 mm.
        # Around the side glass's tip, where p4 turns a corner, it follows a
        # smoothed p4 so the corner does not crease the sail.
        ax, az = s['x4'], s['z4']
        g = K.smooth(y, 0.90, 0.98) * (1 - K.smooth(y, 1.30, 1.40))
        if g > 0:
            ws = [(d, math.exp(-0.5 * (d / 0.03) ** 2)) for d in (-0.06, -0.03, 0.0, 0.03, 0.06)]
            pts = [(quarter_p4(y + d), w) for d, w in ws]
            W = sum(w for d, w in ws)
            ax = ax * (1 - g) + sum(p[0] * w for p, w in pts) / W * g
            az = az * (1 - g) + sum(p[1] * w for p, w in pts) / W * g
        s['x3'] = s['x3'] * (1 - t) + (s['x2'] * .12 + ax * .88) * t
        s['z3'] = s['z3'] * (1 - t) + (s['z2'] * .12 + az * .88) * t
        if y > EDGE_CORNER[0]:
            # behind the rear glass edge's corner p3 is the sail's ridge
            v = K.smooth(y, EDGE_CORNER[0], EDGE_CORNER[0] + 0.15)
            rx, rz = RIDGE_X(y), RIDGE_Z(y)
            s['x3'] = s['x3'] * (1 - v) + rx * v
            s['z3'] = s['z3'] * (1 - v) + rz * v
        deck = K.smooth(y, 1.55, CANOPY_Y1)
        s['zc'] = s['zc'] * (1 - deck) + DECK_Z * deck
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
RUNOUT = 0.25     # length over which the roof rail runs out into the sail behind the tip


# The windscreen rises straight off the hood (SCREEN_Z0 at the cowl, SCREEN_Z1 at
# the A-pillar foot) and lies 11 mm above the side silhouette line there; behind
# the foot that lift eases out, matching height and slope, so the screen runs
# into the roof without a step (a lip at the A-pillar foot) or a sag.
SCREEN_Z0, SCREEN_Z1, SCREEN_LIFT_Y = 0.842, 0.905, -0.95


def screen_lift(y):
    y0 = -1.27
    if y >= SCREEN_LIFT_Y or y < y0:
        return 0.0
    d0 = SCREEN_Z1 - (SIL_Z(y0) - 0.005)
    m0 = (SCREEN_Z1 - SCREEN_Z0) / (y0 - CANOPY_Y0) - (SIL_Z(y0 + 0.005) - SIL_Z(y0)) / 0.005
    hl = SCREEN_LIFT_Y - y0
    u = (y - y0) / hl
    return (2 * u ** 3 - 3 * u * u + 1) * d0 + (u ** 3 - 2 * u * u + u) * hl * m0


def PILLAR_IN(y):
    """The A-pillar's inner edge (the windscreen's side edge) in plan."""
    return RAIL_X(y) - 0.001 - RAIL_BAND(y)


def SEAL_LINE(y):
    """Lower edge of the black seal under the roof rail: the side glass's top edge."""
    return RAIL_X(y) + 0.002, SIL_Z(y) - 0.0055 - RAIL_BAND(y) - SEAL_H(y)


def SEAL_H(y):
    """Height of the black seal under the rail; it runs out over the last 60 mm to
    the side glass's tip, so the window's top edge closes to a point."""
    return RAIL_SEAL(y) * (1 - K.smooth(y, SIDE_TIP - 0.06, SIDE_TIP))


def _glass_cot():
    """Inclination (dx / dz) of the side glass from its base up to the seal, at y 0.95."""
    sx, sz = SEAL_LINE(0.95)
    return (P['x4'](0.95) - 0.003 - sx) / (sz - QUARTER_Z(0.95) - 0.001)


def quarter_base(y):
    """Body edge under the side glass (x4, z4) up to its tip. The traced lower glass
    outline is eased onto the seal line at the tip, and from y 0.95 the plan line
    keeps the glass at one inclination, so the pane closes to a point without
    twisting flat."""
    tx, tz = SEAL_LINE(SIDE_TIP)
    shift = QUARTER_Z(SIDE_TIP) - (tz - 0.003)
    z = QUARTER_Z(y) - shift * K.smooth(y, QUARTER_Y[-3], SIDE_TIP)
    sx, sz = SEAL_LINE(min(y, SIDE_TIP))
    xg = sx + (sz - z - 0.001) * _glass_cot() + 0.003
    w = K.smooth(y, 0.95, SIDE_TIP)
    return P['x4'](y) * (1 - w) + xg * w, z


def quarter_p4(y):
    """Body edge p4 from the side glass back (y past QUARTER_Y[1])."""
    if y > SIDE_TIP:
        # behind the tip the body edge meets the white band edge to edge within
        # 30 mm (under glass it stays 3 mm out and 1 mm down from the glass base)
        fx, fz = REAR_FOOT(y)
        v = 1 - K.smooth(y, SIDE_TIP, SIDE_TIP + 0.03)
        return fx + 0.003 * v, fz - 0.001 * v
    return quarter_base(y)


# Top view (top.JPG, the dark-to-white edge from the centre out): behind the rear
# door joint the rail's top edge runs straight and slightly inward to a corner at
# y 1.20, then straight in to the deck. It is the rear glass's side edge throughout;
# the window's top edge (RAIL_X) stays outboard, so the white rail above the rear
# quarter window widens rearward into a shallow surface lying with the sail.
EDGE_CORNER, EDGE_END = (1.20, 0.446), (1.80, 0.2695)


# Rear photo, rear view (video 33 s) and top view: the white sails' ridges stand
# up above the rear glass edge (the glass does not sink). Each ridge carries the
# rail-top plan line straight back from the glass edge's corner, rising RIDGE_POP
# above the glass edge, with a concave outer flank down to the shoulder and an
# inner face down to the glass edge. On the wing lid the ridge runs down in a
# straight line to the deck at an apex by the lid's trailing edge; the inner face
# there is the triangle between the ridge and the glass's trailing corner.
DECK_Z, RIDGE_POP, RIDGE_APEX_Y = 0.903, 0.025, 2.15
SAIL_CONCAVE = (1.25, 1.50, -0.010)   # outer flank: y range of the change, sagitta


def RIDGE_X(y):
    """Plan line of the sail ridge: the rail-top line carried straight on."""
    y0, x0 = 0.551, RAIL_X(0.551) - 0.011
    y1, x1 = EDGE_CORNER
    return x0 + (x1 - x0) * (y - y0) / (y1 - y0)


def RIDGE_Z(y):
    """Ridge height: RIDGE_POP above the rear glass edge (eased in from the corner),
    then on the lid straight down to the deck at the apex."""
    if y > CANOPY_Y1:
        top = RIDGE_Z(CANOPY_Y1)
        return DECK_Z + (top - DECK_Z) * max(0.0, (RIDGE_APEX_Y - y) / (RIDGE_APEX_Y - CANOPY_Y1))
    return REAR_EDGE(y)[1] + RIDGE_POP * K.smooth(y, EDGE_CORNER[0], 1.55)


def EDGE_X(y):
    """Plan line of the rail's top edge from the rear door joint (y 0.551) back."""
    y0, x0 = 0.551, RAIL_X(0.551) - 0.001 - RAIL_BAND(0.551)
    (y1, x1), (y2, x2) = EDGE_CORNER, EDGE_END
    a = x0 + (x1 - x0) * (y - y0) / (y1 - y0)
    b = x1 + (x2 - x1) * (y - y1) / (y2 - y1)
    w = K.smooth(y, y1 - 0.015, y1 + 0.015)
    return a * (1 - w) + b * w


def REAR_RAIL(y):
    """The window's top edge (rail's lower edge) carried on behind the tip, parallel
    to the rear glass edge in plan."""
    ex, ez = REAR_EDGE(y)
    return RAIL_X(SIDE_TIP) + ex - EDGE_X(SIDE_TIP), ez - RAIL_BAND(y)


def REAR_FOOT(y):
    """Glass base behind the side glass's tip. It starts on the rail face, extended
    below the rail's lower edge as far as the closed pane's corner lies under it,
    and climbs the face over RUNOUT, ending 4 mm short of the rear glass edge in the
    sail facet: the rail runs out into the sail instead of carrying on as a strip,
    with one crease between them that fades."""
    u = K.smooth(y, SIDE_TIP, SIDE_TIP + RUNOUT)
    qx, qz = quarter_base(SIDE_TIP)
    tx, tz = REAR_RAIL(SIDE_TIP)
    drop = math.hypot(qx - 0.003 - tx, qz + 0.001 - tz)
    rx, rz = REAR_RAIL(y)
    ex, ez = REAR_EDGE(y)
    fx, fz = rx - ex, rz - ez
    F = math.hypot(fx, fz)
    x0, z0 = rx + fx / F * drop, rz + fz / F * drop
    # the sliver lies in the face below the edge: the sail facet from the shoulder,
    # then behind the corner the ridge's inner face
    dx, dz = ex - P['x2'](y), ez - P['z2'](y)
    L = math.hypot(dx, dz)
    dx, dz = dx / L, dz / L
    v = K.smooth(y, EDGE_CORNER[0] + 0.03, EDGE_CORNER[0] + 0.15)
    if v > 0:
        rx_, rz_ = ex - RIDGE_X(y), ez - RIDGE_Z(y)
        R = math.hypot(rx_, rz_)
        dx, dz = dx * (1 - v) + rx_ / R * v, dz * (1 - v) + rz_ / R * v
        L = math.hypot(dx, dz)
        dx, dz = dx / L, dz / L
    return x0 * (1 - u) + (ex - dx * 0.004) * u, z0 * (1 - u) + (ez - dz * 0.004) * u


def REAR_EDGE(y):
    """Side edge of the rear glass behind the side glass's tip (x, z after the deck
    flatten): the roof rail's top line carried on (EDGE_X). Behind the glass on
    the lid it is the channel floor's edge, turning out from the glass's trailing
    corner in a straight line to the ridge's apex."""
    x = EDGE_X(y)
    if y > CANOPY_Y1:
        x0, x1 = EDGE_X(CANOPY_Y1), RIDGE_X(RIDGE_APEX_Y) - 0.006
        x = x0 + (x1 - x0) * min(1.0, (y - CANOPY_Y1) / (RIDGE_APEX_Y - CANOPY_Y1))
    foot = QUARTER_Z(y) + 0.001
    deck = K.smooth(y, 1.55, CANOPY_Y1)
    return x, foot + (SIL_Z(y) - 0.0055 - foot) * (1 - deck)


def stations(a, b, step):
    """Sample [a, b] at `step`, always including the measured station ys inside.
    Grid samples closer than a third of a step to a measured station are dropped:
    sliver rings a fraction of a millimetre apart shaded as notches along creases."""
    meas = [round(y, 5) for y in _Y if a < y < b]
    n = max(1, int(math.ceil((b - a) / step)))
    grid = [round(a + (b - a) * i / n, 5) for i in range(n + 1)]
    pts = {grid[0], grid[-1]}
    pts.update(g for g in grid[1:-1] if all(abs(g - m) > step / 3 for m in meas))
    pts.update(meas)
    return sorted(pts)


def half(s):
    return [(s['x%d' % i], s['z%d' % i]) for i in range(5)]


def refine(pts, bulges, seg):
    """Subdivide a closed (x, z) section: each edge gets seg sub-edges (one count,
    or a list per edge) bowed outward by its bulge (sagitta, capped at 8 % of the
    edge). Returns the points and, per sub-edge, the index of the edge it came from."""
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
        n_i = seg[i] if isinstance(seg, (list, tuple)) else seg
        for k in range(n_i):
            t = k / n_i
            w = 4 * t * (1 - t) * h
            out.append((px + dx * t + nx * w, pz + dz * t + nz * w))
            src.append(i)
    return out, src


# outward bow of each half-section edge (m): rocker, side wall, shoulder / fender
# facet, upper facet, hood / deck; mirrored, then the flat floor
SHELL_BULGE = [0.003, 0.009, 0.005, 0.0, 0.004, 0.004, 0.0, 0.005, 0.009, 0.003, 0.0]
SEG = 4
# sub-edges per shell section edge: the nose bow shears the rings by up to 25 mm
# across an edge, so the wide hood and side edges are split finer (13 cm sub-edges
# on the hood zig-zagged its rise)
SHELL_SEG = [4, 8, 8, 8, 12, 12, 8, 8, 8, 4, 4]


def ring(y, flank=False):
    s = sta(y)
    h = half(s)
    pts = h + [(0.0, s['zc'])] + [(-x, z) for x, z in reversed(h)]
    # on the wing lid the deck outboard of the ridges and the channel floor are
    # flat planes: a bow there rose above the ridge and hid it
    lid = K.smooth(y, 1.80, 1.90)
    # at the nose the side wall p1-p2 is the face's straight edge (front photo)
    nose = 1.0 - K.smooth(y, NOSE_Y, -2.037)
    c = K.smooth(y, SAIL_CONCAVE[0], SAIL_CONCAVE[1])
    bulge = [b * (1 - c) + SAIL_CONCAVE[2] * c if i in (2, 7) else b for i, b in enumerate(SHELL_BULGE)]
    bulge = [b * (1 - lid) if i in (2, 4, 5, 7) else b for i, b in enumerate(bulge)]
    bulge = [b * (1 - nose) if i in (0, 1, 8, 9) else b for i, b in enumerate(bulge)]
    # ahead of the front wheel the crease p2 stands out at the tyre's face while the
    # fender-top crease p3 keeps its straight front-view line: the face between them
    # is crowned so it stays convex
    crown = K.smooth(y, -2.10, -1.95) * (1 - K.smooth(y, -1.55, -1.35))
    bulge = [b + 0.013 * crown if i in (2, 7) else b for i, b in enumerate(bulge)]
    pts, src = refine(pts, bulge, SHELL_SEG)
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
    return [i for i in range(n_edges) for _ in range(SHELL_SEG[i])]


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


GLASS_T = 0.006


def canopy_ring(y, t=GLASS_T):
    s = sta(y)
    bx, bz = s['x4'] - 0.003, s['z4'] + 0.001    # the glass edge sits on the body crease
    if y <= -1.27:
        u = (y - CANOPY_Y0) / (-1.27 - CANOPY_Y0)
        rx, rz = bx, bz + 0.004
        cz = SCREEN_Z0 + (SCREEN_Z1 - SCREEN_Z0) * u
    elif y < SIDE_TIP:
        rx, rz = RAIL_X(y), (SIL_Z(y) - 0.040 if y < 0.8 else 0.0)
        if y >= 0.8:  # side glass closes to its rear tip on the sail line
            rz = SIL_Z(y) - 0.040
        cz = SIL_Z(y) - 0.005 + screen_lift(y)
    else:
        rx, rz = bx, bz + 0.004    # the band behind the tip is set below
        cz = SIL_Z(y) - 0.005
    rz = max(rz, bz + 0.004)
    cz = max(cz, rz + 0.004)
    # the white roof rail seen from the side (side frame profiles): its top is the
    # silhouette, it is 22 mm tall at the A-pillar growing to 35 mm at the rear,
    # and a 12 mm black seal runs under it above the side glass. The rail is the
    # chamfer between the roof and the side glass (3/4 photo: its face looks up and
    # out), at 45 degrees; the seal lies in the side glass's plane.
    # The A-pillar is body, not trim (road-mode video): it keeps its full width down
    # to the windscreen's corner and runs into the white body there. Below it the
    # side glass and seal close on the belt line wherever the pillar reaches down to
    # it (r_bot and s_bot clamp at bz), so the side window's front tip ends behind
    # the pillar foot. Ahead of the foot the windscreen's side edge is the pillar's
    # inner line carried on until it meets the hood edge (PILLAR_IN).
    band = RAIL_BAND(y)
    seal = SEAL_H(y)
    if y <= -1.27:
        band = max(0.0, bx - 0.001 - PILLAR_IN(y))
        seal = 0.0
    # ahead of the foot the edge lies on the hood; behind it the pillar top follows
    # the roof line within 40 mm
    kk = K.smooth(y, -1.29, -1.25)
    # the rail's top edge is the side silhouette (the screen's centre lift is not
    # on it), kept above the body crease at the foot with a soft max
    top = cz - 0.0005 - (screen_lift(y) if y < SIDE_TIP else 0.0)
    lo = bz + 0.0055
    top = 0.5 * (top + lo + math.sqrt((top - lo) ** 2 + 0.004 ** 2))
    tz = top * kk + min(rz + 0.0015, cz - 0.001) * (1 - kk)
    r_top, r_bot = tz, max(bz + 0.003, tz - band)
    s_bot = max(bz + 0.002, r_bot - seal)
    tx = rx - 0.001 - band
    if y <= -1.27:
        tx = min(bx - 0.001, PILLAR_IN(y))
    if y > 0.551:
        tx = EDGE_X(y)     # the rail's top edge behind the rear door joint (top view)
    g = max(0.0, (bx - rx) / max(1e-6, r_bot - bz))      # side glass: run per rise
    rail_x, seal_x = rx, rx + (r_bot - s_bot) * g
    # the side glass's bow; where the pane closes to its rear tip the bows fall with
    # the square of its height (constant curvature), not linearly, which curled
    # the closing pane into a pinched fan
    q = min(1.0, (s_bot - bz) / 0.05) if y > 0.8 else 1.0
    mx = (bx + seal_x) / 2 + 0.02 * min(1.0, (s_bot - bz) / 0.15) * q
    mz = (bz + s_bot) / 2
    h = [(bx, bz), (mx, mz), (seal_x, s_bot), (rail_x, r_bot), (tx, r_top)]
    foot = bz
    bulge = [b * q * q if i in (0, 1, 8, 9) else b for i, b in enumerate(CANOPY_BULGE)]
    if y >= SIDE_TIP:
        # the band is straight across: the glass's bows made ridges in white paint
        bulge = [0.0 if i in (0, 1, 8, 9) else b for i, b in enumerate(CANOPY_BULGE)]
        # the white band from the body (REAR_FOOT) up to the rear glass edge: at the
        # tip the rail face over the closed pane's corner; over RUNOUT the body climbs
        # it until only a 4 mm sliver lying in the sail is left. h[:4] are final
        # positions, the edge point is given before the deck flatten like the roof.
        u = K.smooth(y, SIDE_TIP, SIDE_TIP + RUNOUT)
        bx, bz = REAR_FOOT(y)
        ex, ez = REAR_EDGE(y)
        foot = QUARTER_Z(y) + 0.001
        r0x, r0z = REAR_RAIL(y)
        r1x, r1z = bx + (ex - bx) * 0.75, bz + (ez - bz) * 0.75
        rbx, rbz = r0x + (r1x - r0x) * u, r0z + (r1z - r0z) * u
        h = [(bx, bz), (bx + (rbx - bx) / 3, bz + (rbz - bz) / 3),
             (bx + (rbx - bx) * 2 / 3, bz + (rbz - bz) * 2 / 3), (rbx, rbz), (ex, SIL_Z(y) - 0.0055)]
    pts = h + [(0.0, cz)] + [(-x, z) for x, z in reversed(h)]
    pts, src = refine(pts, bulge, SEG)
    # One shared deck datum closes the complete glass section. The old centre
    # crown ended above an independently depressed deck, leaving an open slot.
    # Only the roof half (edge point to edge point) is flattened; the band below
    # it is already final, and its sub-points to the edge are re-spaced after.
    deck = K.smooth(y, 1.55, CANOPY_Y1)
    a, b = src.index(4), src.index(6)
    pts = [(x, foot + (z - foot) * (1 - deck)) if a <= i <= b else (x, z) for i, (x, z) in enumerate(pts)]
    for lo, hi in ((src.index(3), a), (b, src.index(7))):
        for i in range(lo + 1, hi):
            w = (i - lo) / (hi - lo)
            pts[i] = (pts[lo][0] + (pts[hi][0] - pts[lo][0]) * w, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * w)
    # a thin shell: the outer surface from base to base, then the inner surface
    # t inside it (GLASS_T for glazing); the rims on the base are the only closing faces
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
        inner.append((px + nx * t, pz + nz * t))
    ring = outer + list(reversed(inner))
    rsrc = osrc + [10] + [11] * (len(inner) - 1) + [10]
    return [Vector((x, y, z)) for x, z in ring], rsrc


# glass bows: side glass, rail trim, roof (both halves), the hidden floor
CANOPY_BULGE = [0.002, 0.003, 0.0, 0.0, 0.006, 0.006, 0.0, 0.0, 0.003, 0.002, 0.0]


CANOPY_MATS = ['glass', 'glass', 'satin', 'paint', 'glass', 'glass', 'paint', 'satin', 'glass', 'glass', 'satin', 'glass']


def canopy_mesh(t=GLASS_T):
    m = K.Mesh()
    ys_ = sorted(set(stations(CANOPY_Y0, CANOPY_Y1, 0.012) + [SIDE_TIP]))
    rings = [canopy_ring(y, t) for y in ys_]
    # where the rail band has faded out (windshield base, rear glass) its
    # sliver segments are glass, not paint: they made a toothed edge
    glass_only = ['glass' if i in (2, 3, 6, 7) else mt for i, mt in enumerate(CANOPY_MATS)]

    def ring_mats(j):
        y = (ys_[j] + ys_[j + 1]) / 2
        if y >= SIDE_TIP:
            return ['paint' if i in (0, 1, 2, 3, 6, 7, 8, 9) else mt
                    for i, mt in enumerate(CANOPY_MATS)]
        if y > -1.27:
            return CANOPY_MATS
        # ahead of the pillar foot: glass, with the pillar's white face where it
        # still reaches out to the hood edge
        if PILLAR_IN(y) < sta(y)['x4'] - 0.006:
            return ['paint' if i in (3, 6) else mt for i, mt in enumerate(glass_only)]
        return glass_only
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
