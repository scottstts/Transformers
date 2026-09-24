"""Curve and surface generators for the F1 bodywork (authoring coordinates).

Everything here works in design coordinates (x, f, z): x = car left, f =
forward, z = up, metres. Generators return (verts, faces) in Blender space
(via kit.V), ready for kit.Builder. Sections are sampled from named parameter
tracks (shape-preserving monotone cubics), so moving one design value slides
a feature along the car without changing topology or printing ripples.
"""
import math
from mathutils import Vector, Matrix
from .kit import V

TAU = 2 * math.pi


def clamp01(t):
    return 0.0 if t < 0 else 1.0 if t > 1 else t


def smooth01(t):
    t = clamp01(t)
    return t * t * (3 - 2 * t)


def smoother01(t):
    t = clamp01(t)
    return t * t * t * (t * (t * 6 - 15) + 10)


def lerp(a, b, t):
    return a + (b - a) * t


# --------------------------------------------------------------- 1D curves

def curve1(knots):
    """Fritsch-Carlson monotone cubic through (x, y) knots (C1, no overshoot)."""
    k = sorted(knots)
    n = len(k)
    if n == 1:
        return lambda x: k[0][1]
    d = [(k[i + 1][1] - k[i][1]) / (k[i + 1][0] - k[i][0]) for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        m[i] = 0.0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) * 0.5
    for i in range(n - 1):
        if d[i] == 0:
            m[i] = m[i + 1] = 0.0
            continue
        a, b = m[i] / d[i], m[i + 1] / d[i]
        s = a * a + b * b
        if s > 9:
            f = 3 / math.sqrt(s)
            m[i], m[i + 1] = f * a * d[i], f * b * d[i]

    def ev(x):
        if x <= k[0][0]:
            return k[0][1]
        if x >= k[-1][0]:
            return k[-1][1]
        i = 0
        while i < n - 2 and x > k[i + 1][0]:
            i += 1
        h = k[i + 1][0] - k[i][0]
        t = (x - k[i][0]) / h
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * k[i][1] + (t3 - 2 * t2 + t) * h * m[i]
                + (-2 * t3 + 3 * t2) * k[i + 1][1] + (t3 - t2) * h * m[i + 1])
    return ev


class Track:
    """Table of named monotone curves evaluated together: Track(...)(f) -> dict."""

    def __init__(self, **table):
        self.curves = {k: curve1(v) for k, v in table.items()}

    def __call__(self, f):
        return {k: c(f) for k, c in self.curves.items()}


def stations(a, b, count, ease=0.0):
    """count + 1 stations from a to b, optionally packed toward both ends."""
    out = []
    for i in range(count + 1):
        t = i / count
        e = lerp(t, 2 * t * t if t < 0.5 else 1 - 2 * (1 - t) * (1 - t), ease) if ease else t
        out.append(lerp(a, b, e))
    return out


# --------------------------------------------------------------- 2D curves

def spline2(points, count, closed=False, tension=0.5):
    """Catmull-Rom through 2D points, resampled to `count` points."""
    P = [tuple(p) for p in points]
    n = len(P)
    spans = n if closed else n - 1

    def at(i):
        return P[i % n] if closed else P[max(0, min(n - 1, i))]
    out = []
    for s in range(count):
        g = (s / (count if closed else count - 1)) * spans
        i = min(int(math.floor(g)), spans - 1)
        t = g - i
        p0, p1, p2, p3 = at(i - 1), at(i), at(i + 1), at(i + 2)
        t2, t3 = t * t, t * t * t
        o = []
        for c in range(2):
            m1 = tension * (p2[c] - p0[c])
            m2 = tension * (p3[c] - p1[c])
            o.append((2 * t3 - 3 * t2 + 1) * p1[c] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[c] + (t3 - t2) * m2)
        out.append(tuple(o))
    return out


def resample(poly, count, closed=True):
    """Uniform arc-length resample of a polyline (keeps sharp corners approximately)."""
    pts = [tuple(p) for p in poly]
    if closed:
        pts = pts + [pts[0]]
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    L = sum(seg)
    out = []
    n = count if closed else count - 1
    j, acc = 0, 0.0
    for k in range(count):
        s = L * k / n
        while j < len(seg) - 1 and acc + seg[j] < s:
            acc += seg[j]
            j += 1
        t = 0.0 if seg[j] < 1e-12 else (s - acc) / seg[j]
        a, b = pts[j], pts[j + 1]
        out.append(tuple(a[c] + (b[c] - a[c]) * t for c in range(len(a))))
    return out


def squircle(hw, hh, exp=3.2, segs=28, cx=0.0, cy=0.0):
    o = []
    for i in range(segs):
        a = TAU * i / segs
        ca, sa = math.cos(a), math.sin(a)
        o.append((cx + math.copysign(abs(ca) ** (2 / exp), ca) * hw, cy + math.copysign(abs(sa) ** (2 / exp), sa) * hh))
    return o


def pod_pts(xIn, xOut, zTop, zBot, nTop=3.6, nBot=2.4, nIn=2.6, undercut=0.0, ucZ=0.5, ucW=0.3, shelf=0.0, n=64):
    """Offset closed (x, z) section: four superellipse quadrants + an outboard
    undercut Gaussian (the coke-bottle) + a flattened aero shelf on top."""
    cx, cz = (xIn + xOut) * 0.5, (zTop + zBot) * 0.5
    rOut, rIn, rTop, rBot = xOut - cx, cx - xIn, zTop - cz, cz - zBot
    sp = lambda v, e: max(v, 0.0) ** (2 / e)
    nq = max(6, n // 4)
    pts = []
    for i in range(nq):
        a = i / nq * math.pi / 2
        pts.append([cx + rOut * sp(math.sin(a), nTop), cz + rTop * sp(math.cos(a), nTop)])
    for i in range(nq):
        a = i / nq * math.pi / 2
        pts.append([cx + rOut * sp(math.cos(a), nBot), cz - rBot * sp(math.sin(a), nBot)])
    for i in range(nq):
        a = i / nq * math.pi / 2
        pts.append([cx - rIn * sp(math.sin(a), nBot), cz - rBot * sp(math.cos(a), nBot)])
    for i in range(nq):
        a = i / nq * math.pi / 2
        pts.append([cx - rIn * sp(math.cos(a), nIn), cz + rTop * sp(math.sin(a), nIn)])
    if undercut or shelf:
        zU = lerp(zBot, zTop, ucZ)
        h = (zTop - zBot) * ucW
        for p in pts:
            out = clamp01((p[0] - cx) / max(rOut, 1e-4))
            if undercut and out > 0:
                p[0] -= undercut * rOut * math.exp(-((p[1] - zU) / h) ** 2) * out
            if shelf and out > 0.25 and p[1] > cz:
                g = clamp01((p[1] - cz) / max(rTop, 1e-4))
                p[1] -= shelf * rTop * g * g * out
    return [tuple(p) for p in pts]


# --------------------------------------------------------------- 3D surfaces

def subdivide(pts, alloc):
    """Open polyline with segment i split into alloc[i] equal parts (keeps every
    control point; a fixed allocation keeps loft topology constant)."""
    out = []
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        for k in range(alloc[i]):
            t = k / alloc[i]
            out.append(tuple(a[c] + (b[c] - a[c]) * t for c in range(len(a))))
    out.append(tuple(pts[-1]))
    return out


def ring_half(half_pts, f, n, smooth=True, alloc=None):
    """Open half section (x >= 0, top centreline -> bottom centreline) -> closed
    mirrored ring at station f (design (x, z) points). With `alloc` the control
    polygon is kept exactly (per-segment subdivision) instead of splined."""
    if alloc is not None:
        h = subdivide(half_pts, alloc)
        n = len(h)
    else:
        h = spline2(half_pts, n) if smooth else resample(half_pts, n, closed=False)
    ring = [(p[0], f, p[1]) for p in h]
    ring += [(-h[i][0], f, h[i][1]) for i in range(n - 2, 0, -1)]
    return ring


def ring_closed(pts, f, n, smooth=True):
    q = spline2(pts, n, closed=True) if smooth else resample(pts, n)
    return [(p[0], f, p[1]) for p in q]


def _centroid(loop):
    return sum((Vector(p) for p in loop), Vector()) / len(loop)


def _cap_rows(loop, inner, segs, bulge):
    """Domed terminal rows beyond `loop`, pushing away from the neighbouring ring `inner`."""
    c = _centroid(loop)
    nrm = c - _centroid(inner)
    nrm = nrm.normalized() if nrm.length > 1e-9 else Vector((0, 0, 1))
    radius = max((Vector(p) - c).length for p in loop)
    rows = []
    for s in range(1, segs + 1):
        a = s / segs * math.pi / 2
        rows.append([tuple(c + (Vector(p) - c) * math.cos(a) + nrm * (math.sin(a) * radius * bulge)) for p in loop])
    return rows, c


def loft_rings(rings, cap_start=True, cap_end=True, cap_segs=0, bulge=0.5, close=True):
    """Loft closed rings of design points (x, f, z). cap_segs > 0 closes each end
    with a domed terminal (contracting rings to a pole) instead of a flat n-gon.
    bulge: dome height factor, or (start, end)."""
    rings = [list(r) for r in rings]
    b0, b1 = bulge if isinstance(bulge, (tuple, list)) else (bulge, bulge)
    head_pole = tail_pole = None
    if cap_start and cap_segs:
        rows, c = _cap_rows(rings[0], rings[1], cap_segs, b0)
        rings = list(reversed(rows[:-1])) + rings
        head_pole = rows[-1]
    if cap_end and cap_segs:
        rows, c = _cap_rows(rings[-1], rings[-2], cap_segs, b1)
        rings = rings + rows[:-1]
        tail_pole = rows[-1]
    n = len(rings[0])
    verts = [V(*p) for r in rings for p in r]
    faces = []
    for i in range(len(rings) - 1):
        for j in range(n if close else n - 1):
            j2 = (j + 1) % n
            faces.append([i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j])
    if cap_start:
        if head_pole is not None:
            pc = sum((Vector(p) for p in head_pole), Vector()) / n
            verts.append(V(*pc))
            k = len(verts) - 1
            faces += [[j, k, (j + 1) % n][::-1] for j in range(n)]
        else:
            faces.append(list(reversed(range(n))))
    if cap_end:
        base = (len(rings) - 1) * n
        if tail_pole is not None:
            pc = sum((Vector(p) for p in tail_pole), Vector()) / n
            verts.append(V(*pc))
            k = len(verts) - 1
            faces += [[base + j, base + (j + 1) % n, k] for j in range(n)]
        else:
            faces.append([base + j for j in range(n)])
    return verts, faces


def grid(rows, close_u=False):
    """Open or u-closed quad grid from rows of design points."""
    n = len(rows[0])
    verts = [V(*p) for r in rows for p in r]
    faces = []
    for i in range(len(rows) - 1):
        for j in range(n if close_u else n - 1):
            j2 = (j + 1) % n
            faces.append([i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j])
    return verts, faces


def transport_frames(path):
    """Parallel-transport frames along a design-space path: (T, N, B) lists."""
    P = [Vector(p) for p in path]
    n = len(P)
    T = []
    for i in range(n):
        t = P[min(n - 1, i + 1)] - P[max(0, i - 1)]
        T.append(t.normalized() if t.length > 1e-12 else T[-1])
    up = Vector((0, 0, 1)) if abs(T[0].z) < 0.94 else Vector((1, 0, 0))
    N = [T[0].cross(up.cross(T[0])).normalized()]
    for i in range(1, n):
        q = T[i - 1].rotation_difference(T[i])
        N.append((q @ N[-1]).normalized())
    B = [T[i].cross(N[i]).normalized() for i in range(n)]
    return T, N, B


def sweep(path, section_at, cap_start=True, cap_end=True, cap_segs=0, bulge=0.5, roll=None, up=None):
    """Sweep a 2D section (callable t -> [(u, v)]) along a design-space path.
    u runs along N, v along B. `up` pins N toward a fixed design direction
    instead of parallel transport (for members that must keep a face level)."""
    P = [Vector(p) for p in path]
    T, N, B = transport_frames(path)
    if up is not None:
        U = Vector(up)
        N = [(U - t * U.dot(t)).normalized() for t in T]
        B = [T[i].cross(N[i]).normalized() for i in range(len(T))]
    rings = []
    for i, p in enumerate(P):
        t = i / (len(P) - 1)
        n_, b_ = N[i], B[i]
        if roll is not None:
            a = roll(t)
            n_, b_ = n_ * math.cos(a) + b_ * math.sin(a), -n_ * math.sin(a) + b_ * math.cos(a)
        rings.append([tuple(p + n_ * u + b_ * v) for u, v in section_at(t)])
    return loft_rings(rings, cap_start, cap_end, cap_segs, bulge)


def tube(path, radius_at, segs=16, **kw):
    rf = (lambda t: radius_at) if isinstance(radius_at, (int, float)) else radius_at
    return sweep(path, lambda t: [(math.cos(TAU * i / segs) * rf(t), math.sin(TAU * i / segs) * rf(t)) for i in range(segs)], **kw)


# --------------------------------------------------------------- airfoils

def airfoil(n, thick=0.11, camber=0.06, camber_pos=0.4, te=0.004):
    """NACA-style closed loop (chord 0..1, thickness), LE at (0, 0), TE at (1, 0)."""
    half = max(6, n // 2)
    xs = [0.5 - 0.5 * math.cos(math.pi * i / half) for i in range(half + 1)]
    p = min(max(camber_pos, 0.05), 0.95)

    def yt(x):
        return 5 * thick * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4) + te * 0.5 * x

    def yc(x):
        return camber / (p * p) * (2 * p * x - x * x) if x < p else camber / ((1 - p) ** 2) * ((1 - 2 * p) + 2 * p * x - x * x)

    def dyc(x):
        return 2 * camber / (p * p) * (p - x) if x < p else 2 * camber / ((1 - p) ** 2) * (p - x)
    up, lo = [], []
    for x in xs:
        th = math.atan(dyc(x))
        t, c = yt(x), yc(x)
        up.append((x - t * math.sin(th), c + t * math.cos(th)))
        lo.append((x + t * math.sin(th), c - t * math.cos(th)))
    return up + list(reversed(lo[1:-1]))


def wing(st, pts=48, tips=(True, True), tip_len=0.006):
    """Spanwise airfoil loft. st: list of dicts with le (x, f, z), chord, inc
    (rad, + = trailing edge down), thick, camber, dih (rad), and optional
    span/up/chord unit vectors (design). Returns (verts, faces)."""
    rings = []
    for s in st:
        loop = airfoil(pts, s.get('thick', 0.1), s.get('camber', 0.04), s.get('camber_pos', 0.42), s.get('te', 0.0035))
        inc, dih = s.get('inc', 0.0), s.get('dih', 0.0)
        ci, si = math.cos(inc), math.sin(inc)
        cd, sd = math.cos(dih), math.sin(dih)
        cdir = Vector(s.get('cdir', (0, -1, 0)))       # trailing direction (rearward)
        udir = Vector(s.get('udir', (0, 0, 1)))
        sdir = Vector(s.get('sdir', (1, 0, 0)))
        le = Vector(s['le'])
        ring = []
        for px, py in loop:
            cx = px * ci + py * si
            cy = -px * si + py * ci
            x, y = cx * s['chord'], cy * s['chord']
            ring.append(tuple(le + cdir * x + udir * (y * cd) + sdir * (y * sd)))
        rings.append(ring)

    def tip(loop, d):
        c = sum((Vector(p) for p in loop), Vector()) / len(loop)
        return [[tuple(c + (Vector(p) - c) * math.cos(a) + d * math.sin(a) * tip_len) for p in loop]
                for a in (math.pi / 2 * k / 3 for k in (1, 2))]
    if tips[1]:
        d1 = (Vector(rings[-1][0]) - Vector(rings[-2][0])).normalized()
        rings += tip(rings[-1], d1)
    if tips[0]:
        d0 = (Vector(rings[0][0]) - Vector(rings[1][0])).normalized()
        rings = list(reversed(tip(rings[0], d0))) + rings
    return loft_rings(rings, True, True)


def strut(a, b, chord=0.06, ratio=0.28, taper=1.0, steps=8, bow=0.0, stream=(0, 1, 0)):
    """Faired member between design points a and b: a symmetric airfoil section
    (leading edge facing `stream`, i.e. forward) lofted along the member."""
    a, b = Vector(a), Vector(b)
    ax = (b - a)
    L = ax.length
    ax.normalize()
    s = Vector(stream)
    s = (s - ax * s.dot(ax)).normalized()          # chord direction (toward the leading edge)
    w = ax.cross(s).normalized()
    loop = airfoil(24, ratio, 0.0, 0.4, 0.0022)
    rings = []
    for i in range(steps + 1):
        t = i / steps
        c = a.lerp(b, t) + w * math.sin(math.pi * t) * bow
        ch = chord * lerp(1, taper, t)
        rings.append([tuple(c + s * (-(px - 0.34) * ch) + w * (py * ch)) for px, py in loop])
    return loft_rings(rings, True, True)


# --------------------------------------------------------------- plates

def plate(outline, thickness, warp=None, center=True, bevel=None):
    """Authored 2D outline (u, v) extruded to a slab w in [-t/2, t/2] (or [0, t]),
    then mapped through warp(u, v, w) -> design point (x, f, z). Default warp
    lays the plate in the design x-z plane at f = w. Returns (verts, faces).
    The outline edge is chamfered natively (bevel, default 22 % of the thickness)
    so plates need no bevel modifier. Holes are cut afterwards with booleans."""
    from .kit import offset_poly
    pts = [tuple(p) for p in outline]
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if area < 0:
        pts.reverse()
    n = len(pts)
    w0, w1 = (-thickness / 2, thickness / 2) if center else (0.0, thickness)
    r = thickness * 0.22 if bevel is None else min(bevel, thickness * 0.45)
    wf = warp or (lambda u, v, w: (u, w, v))
    if r > 1e-6:
        inner = offset_poly(pts, -r)
        rings = [(inner, w0), (pts, w0 + r), (pts, w1 - r), (inner, w1)]
    else:
        rings = [(pts, w0), (pts, w1)]
    verts = []
    for poly, w in rings:
        verts += [V(*wf(u, v, w)) for u, v in poly]
    m = len(rings)
    faces = [list(reversed(range(n))), [(m - 1) * n + i for i in range(n)]]
    for k in range(m - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append([k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i])
    return verts, faces


def lathe(profile, segs=48, axis='x', center=(0, 0, 0), arc=TAU, phase=0.0, closed=False):
    """Revolve an (r, h) profile about a design axis through `center`.
    axis 'x': h along x (wheels); 'z': h along z; 'f': h along f.
    closed: the profile is a loop (last point joins the first) -> a closed ring solid."""
    close = abs(arc - TAU) < 1e-6
    nseg = segs if close else segs + 1
    verts, rows, poles = [], [], {}
    cx, cf, cz = center
    for s in range(nseg):
        a = phase + arc * s / segs
        ca, sa = math.cos(a), math.sin(a)
        row = []
        for j, (r, h) in enumerate(profile):
            if r < 1e-9:
                if j not in poles:
                    p = {'x': (h, 0, 0), 'z': (0, 0, h), 'f': (0, h, 0)}[axis]
                    verts.append(V(cx + p[0], cf + p[1], cz + p[2]))
                    poles[j] = len(verts) - 1
                row.append(poles[j])
                continue
            if axis == 'x':
                p = (h, r * ca, r * sa)
            elif axis == 'z':
                p = (r * ca, r * sa, h)
            else:
                p = (r * ca, h, r * sa)
            verts.append(V(cx + p[0], cf + p[1], cz + p[2]))
            row.append(len(verts) - 1)
        rows.append(row)
    faces = []
    for s in range(len(rows) if close else len(rows) - 1):
        r0, r1 = rows[s], rows[(s + 1) % len(rows)]
        m = len(profile)
        for j in range(m if closed else m - 1):
            j2 = (j + 1) % m
            q = []
            for k in (r0[j], r1[j], r1[j2], r0[j2]):
                if k not in q:
                    q.append(k)
            if len(q) >= 3:
                faces.append(q)
    return verts, faces
