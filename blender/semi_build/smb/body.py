"""The cab's outer surface as one parametric sheet, and panels cut from it.

The cab is described by horizontal plan outlines stacked along the centreline
profile (bumper face, hood, windshield, roof fairing), so every panel seam that
the real truck draws horizontally (glass band, light bar, sill) is a level line
and every vertical seam (doors) is a station line.

P(u, v):
  v in [0, 1]  arc length up the centreline profile (bottom of the bumper -> roof top)
  u in [0, 4]  round the left half of the plan outline at that level:
               [0, 1] front superellipse quadrant (centre -> side),
               [1, 2] side (straight, s linear), [2, 3] rear corner, [3, 4] rear wall
  u < 0 mirrors to the right side (x -> -x).

Panels are grids over (u, v) regions whose boundaries are given as functions of
v, so they conform to the semantic seams; they are solidified inward along the
surface normal and shrunk by half a seam gap on every edge.
"""
import math
from mathutils import Vector
from . import kit, dims as D
from .shape import lerp, curve1, spline2
from .kit import V

# centreline profile (s, z): bumper face, light bar, hood, windshield, glass top, fairing
PROFILE = [
    (0.070, 0.300), (0.030, 0.360), (0.008, 0.460), (0.000, 0.620), (0.004, 0.800), (0.022, 0.920),
    (0.055, 0.975), (0.090, 1.005),                                           # light bar crease
    (0.200, 1.100), (0.360, 1.260), (0.520, 1.420), (0.620, D.WS_BASE_Z),    # hood
    (0.700, 1.620), (0.950, 1.950), (1.220, 2.320), (1.470, D.GLASS_TOP_Z),  # windshield
    (1.580, 2.840), (1.760, 3.080), (2.020, 3.360), (2.380, 3.620), (2.800, 3.800),
    (3.250, 3.920), (3.700, 3.972), (4.000, D.ROOF_Z),                     # fairing to the roof
]
NV = 150            # levels up the profile

# plan parameters over z: half width, front depth (centre -> side tangent), superellipse exponent
_W = curve1([(0.30, 1.195), (0.42, 1.235), (0.55, D.BODY_W), (1.60, D.BODY_W), (1.90, 1.246),
             (D.GLASS_TOP_Z, 1.212), (3.20, 1.190), (3.70, 1.172)])
_DEPTH = curve1([(0.30, 0.60), (0.60, 0.58), (1.00, 0.52), (1.40, 0.44), (1.80, 0.38), (2.40, 0.38),
                 (2.80, 0.44), (3.40, 0.50), (3.98, 0.50)])
_EXP = curve1([(0.30, 2.9), (1.00, 3.1), (1.60, 3.5), (2.40, 3.6), (2.80, 3.2), (3.98, 2.6)])
TOP_R = 0.30        # fairing side -> roof rounding
REAR_TOP_R = 0.20   # roof -> back wall rounding
REAR_R = 0.13       # back corners in plan


def _profile():
    pts = spline2(PROFILE, 400, closed=False, tension=0.5)
    L = [0.0]
    for a, b in zip(pts, pts[1:]):
        L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return pts, L


_PTS, _LEN = _profile()


def level(v):
    """(s_centre, z) of level v."""
    t = max(0.0, min(1.0, v)) * _LEN[-1]
    lo, hi = 0, len(_LEN) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if _LEN[m] <= t:
            lo = m
        else:
            hi = m
    k = (t - _LEN[lo]) / max(1e-9, _LEN[hi] - _LEN[lo])
    a, b = _PTS[lo], _PTS[hi]
    return lerp(a[0], b[0], k), lerp(a[1], b[1], k)


def v_at_z(z):
    """Level whose z is `z` (the profile's z is monotone)."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        m = (lo + hi) / 2
        if level(m)[1] < z:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def plan(z):
    """(half width, front depth, exponent, rear station) at height z."""
    W = _W(min(z, 3.70))
    zt = D.ROOF_Z
    if z > zt - TOP_R:
        dz = min(TOP_R, z - (zt - TOP_R))
        W -= TOP_R - math.sqrt(max(0.0, TOP_R * TOP_R - dz * dz))
    rear = D.CAB_REAR_S
    if z > zt - REAR_TOP_R:
        dz = min(REAR_TOP_R, z - (zt - REAR_TOP_R))
        rear -= REAR_TOP_R - math.sqrt(max(0.0, REAR_TOP_R * REAR_TOP_R - dz * dz))
    return W, _DEPTH(z), _EXP(z), rear


def outline_point(u, v):
    """(x, s, z) on the half outline (x >= 0) at parameter u in [0, 4]."""
    sc, z = level(v)
    W, depth, n, rear = plan(z)
    side0 = sc + depth
    side1 = rear - REAR_R
    if side1 < side0 + 0.02:            # near the roof top the outline closes in
        side1 = side0 + 0.02
    if u <= 1.0:
        phi = u * math.pi / 2
        x = W * math.sin(phi) ** (2.0 / n)
        s = sc + depth * (1.0 - math.cos(phi) ** (2.0 / n))
    elif u <= 2.0:
        x, s = W, lerp(side0, side1, u - 1.0)
    elif u <= 3.0:
        th = (u - 2.0) * math.pi / 2
        x = W - REAR_R + REAR_R * math.cos(th)
        s = side1 + REAR_R * math.sin(th)
    else:
        x, s = lerp(W - REAR_R, 0.0, u - 3.0), side1 + REAR_R
    return x, s, z


def P(u, v):
    """Surface point (Blender space); u < 0 is the right side."""
    x, s, z = outline_point(abs(u), v)
    return V(x if u >= 0 else -x, D.f(s), z)


def normal(u, v, h=1e-4):
    pu = P(u + h, v) - P(u - h, v)
    pv = P(u, v + h) - P(u, v - h)
    n = pu.cross(pv) if u >= 0 else pv.cross(pu)
    n.normalize()
    return n


# ------------------------------------------------------------------ seam solvers

def u_at_s(v, s):
    """Side parameter of station s at level v (clamped to the side segment)."""
    sc, z = level(v)
    W, depth, n, rear = plan(z)
    side0, side1 = sc + depth, max(sc + depth + 0.02, rear - REAR_R)
    return 1.0 + max(0.0, min(1.0, (s - side0) / (side1 - side0)))


def u_at_x(v, x):
    """Front parameter of lateral x at level v."""
    sc, z = level(v)
    W, depth, n, rear = plan(z)
    k = max(0.0, min(1.0, x / W))
    return math.asin(k ** (n / 2.0)) / (math.pi / 2)


def u_at_front_s(v, s):
    """Front parameter where the front curve reaches station s (clamped)."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        m = (lo + hi) / 2
        if outline_point(m, v)[1] < s:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


# ------------------------------------------------------------------ panels

def _du(u, v, d):
    """Parameter step along u that covers distance d at (u, v)."""
    h = 1e-3
    L = (P(u + h, v) - P(u - h, v)).length / (2 * h)
    return d / max(L, 1e-6)


def _dv(u, v, d):
    h = 1e-3
    L = (P(u, v + h) - P(u, v - h)).length / (2 * h)
    return d / max(L, 1e-6)


def region_grid(v0, v1, ua, ub, nu, nv, gap=0.006, vgap=None, ugap=None, rows=None):
    """Rows of (u, v) samples covering the region, shrunk by half a seam gap.
    ua, ub: callables v -> u (u ascending from ua to ub). rows: optional explicit v list."""
    vg = gap if vgap is None else vgap
    ug = gap if ugap is None else ugap
    if isinstance(vg, (int, float)):
        vg = (vg, vg)
    if isinstance(ug, (int, float)):
        ug = (ug, ug)
    um = (ua((v0 + v1) / 2) + ub((v0 + v1) / 2)) / 2
    a = v0 + _dv(um, v0, vg[0] / 2)
    b = v1 - _dv(um, v1, vg[1] / 2)
    vs = rows or [lerp(a, b, i / nv) for i in range(nv + 1)]
    grid = []
    for v in vs:
        u0, u1 = ua(v), ub(v)
        u0 += _du(u0, v, ug[0] / 2)
        u1 -= _du(u1, v, ug[1] / 2)
        grid.append([(lerp(u0, u1, j / nu), v) for j in range(nu + 1)])
    return grid


def shell(grid, thick, offset=0.0, fn=None):
    """Closed solid from a (u, v) grid: outer surface (pushed out by `offset`),
    inner surface `thick` below it along the surface normal, rims.
    fn(u, v) -> Vector overrides the surface point (e.g. a recessed or bulged panel)."""
    rows = []
    inner = []
    for row in grid:
        r0, r1 = [], []
        for u, v in row:
            p = fn(u, v) if fn else P(u, v)
            n = normal(u, v)
            r0.append(p + n * offset)
            r1.append(p + n * (offset - thick))
        rows.append(r0)
        inner.append(r1)
    nr, nc = len(rows), len(rows[0])
    verts = [p for r in rows for p in r] + [p for r in inner for p in r]
    N = nr * nc
    faces = []
    for i in range(nr - 1):
        for j in range(nc - 1):
            a = i * nc + j
            faces.append([a, a + 1, a + nc + 1, a + nc])
            faces.append([N + a + nc, N + a + nc + 1, N + a + 1, N + a])
    rim = list(range(nc)) + [i * nc + nc - 1 for i in range(1, nr)] + \
        list(range(N - 2, N - nc - 1, -1)) + [i * nc for i in range(nr - 2, 0, -1)]
    for a, b in zip(rim, rim[1:] + rim[:1]):
        faces.append([b, a, a + N, b + N])
    return verts, faces


def mirror_region(ua, ub):
    """Mirror a left-side region's bounds onto the right (u -> -u, order swapped)."""
    return (lambda v: -ub(v)), (lambda v: -ua(v))


def panel(name, coll, grid, slot, thick=0.02, offset=0.0, bevel=0.004, fn=None, cutters=()):
    b = kit.Builder()
    m = shell(grid, thick, offset, fn)
    if cutters:
        m = kit.cut_mesh(m, cutters)
    b.add_mesh(m, slot)
    o = b.build(name, coll)
    kit.finish(o, bevel, 2, 35)
    return o
