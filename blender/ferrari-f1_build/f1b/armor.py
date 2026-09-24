"""Robot armour toolkit: sculpted panels on parametric surfaces.

An armour panel is a thick shell cut from a smooth surface P(u, v): rows of
constant v carry their own u extents, so a panel's outline is authored as the
left / right boundary along v (tapers, points, notches) while the surface
supplies the curvature. The shell is the outer grid, an inner grid offset by
the thickness along the surface normal, and side walls; the angle-limited
bevel of Part.build crisps the border.

Surfaces are design-space functions (x, f, z) of (u, v). Helpers build the
common ones: a wrap around a limb axis, a bent sheet in front of the torso.
"""
import math
from mathutils import Vector
from .kit import V
from .shape import lerp, smooth01, clamp01


def _normal(P, u, v, du, dv, hint):
    a = Vector(P(u + du, v)) - Vector(P(u - du, v))
    b = Vector(P(u, v + dv)) - Vector(P(u, v - dv))
    n = a.cross(b)
    if n.length < 1e-12:
        n = Vector(hint(u, v))
    n.normalize()
    if n.dot(Vector(hint(u, v))) < 0:
        n = -n
    return n


def panel(P, rows, thick, hint, nu=10, lift=0.0):
    """Shell panel. P(u, v) -> (x, f, z); rows: [(v, u0, u1)] with v monotonic;
    hint(u, v) -> an outward direction (x, f, z) that fixes the normal's sign.
    lift raises the outer skin off the surface (layered plates sit on a base).
    Returns (verts, faces) in Blender space."""
    nv = len(rows)
    span_u = max(abs(r[2] - r[1]) for r in rows) or 1.0
    span_v = abs(rows[-1][0] - rows[0][0]) or 1.0
    du, dv = span_u * 1e-3, span_v * 1e-3
    outer, inner = [], []
    for v, u0, u1 in rows:
        ro, ri = [], []
        for j in range(nu + 1):
            u = lerp(u0, u1, j / nu)
            p = Vector(P(u, v))
            n = _normal(P, u, v, du, dv, hint)
            ro.append(p + n * lift)
            ri.append(p + n * (lift - thick))
        outer.append(ro)
        inner.append(ri)
    verts = []
    for grid in (outer, inner):
        for r in grid:
            verts += [V(p.x, p.y, p.z) for p in r]
    W = nu + 1
    io = lambda i, j: i * W + j
    ii = lambda i, j: nv * W + i * W + j
    faces = []
    for i in range(nv - 1):
        for j in range(nu):
            faces.append([io(i, j), io(i, j + 1), io(i + 1, j + 1), io(i + 1, j)])
            faces.append([ii(i, j), ii(i + 1, j), ii(i + 1, j + 1), ii(i, j + 1)])
    for j in range(nu):
        faces.append([io(0, j + 1), io(0, j), ii(0, j), ii(0, j + 1)])
        faces.append([io(nv - 1, j), io(nv - 1, j + 1), ii(nv - 1, j + 1), ii(nv - 1, j)])
    for i in range(nv - 1):
        faces.append([io(i, 0), io(i + 1, 0), ii(i + 1, 0), ii(i, 0)])
        faces.append([io(i + 1, nu), io(i, nu), ii(i, nu), ii(i + 1, nu)])
    # orient: the first outer quad must face along the outward normal
    a, b, c = (verts[k] for k in faces[0][:3])
    fn = (b - a).cross(c - a)
    p0 = outer[0][0]
    n0 = _normal(P, lerp(rows[0][1], rows[0][2], 0.0), rows[0][0], du, dv, hint)
    if fn.dot(V(n0.x, n0.y, n0.z) - V(0, 0, 0)) < 0:
        faces = [list(reversed(f)) for f in faces]
    return verts, faces


def outline_rows(v0, v1, left, right, n=12, ease=None):
    """Rows for panel(): v from v0 to v1, u extents left(t), right(t) with t in [0, 1]."""
    out = []
    for i in range(n + 1):
        t = i / n
        tt = ease(t) if ease else t
        out.append((lerp(v0, v1, tt), left(t), right(t)))
    return out


def pwl(knots):
    """Piecewise-linear function of t in [0, 1] through (t, value) knots."""
    ks = sorted(knots)

    def f(t):
        if t <= ks[0][0]:
            return ks[0][1]
        for (t0, a), (t1, b) in zip(ks, ks[1:]):
            if t <= t1:
                return lerp(a, b, (t - t0) / (t1 - t0) if t1 > t0 else 0.0)
        return ks[-1][1]
    return f


# ------------------------------------------------------------------ surfaces

def wrap(radius, fc=0.0, xc=0.0, squash=1.0):
    """Surface around a limb axis (the bone's z): u = angle from the front (+f)
    toward +x, v = z. radius(u, v) -> r; squash scales the depth (f)."""
    def P(u, v):
        r = radius(u, v)
        return (xc + r * math.sin(u), fc + squash * r * math.cos(u), v)

    def hint(u, v):
        return (math.sin(u), math.cos(u), 0.0)
    return P, hint


def sheet(depth, tilt=0.0):
    """Sheet facing +f: u = x, v = z, f = depth(u, v)."""
    def P(u, v):
        return (u, depth(u, v), v)

    def hint(u, v):
        return (0.0, 1.0, 0.0)
    return P, hint


def side_sheet(offset, sgn=1):
    """Sheet facing +x (sgn) : u = f, v = z, x = offset(u, v)."""
    def P(u, v):
        return (sgn * offset(u, v), u, v)

    def hint(u, v):
        return (float(sgn), 0.0, 0.0)
    return P, hint
