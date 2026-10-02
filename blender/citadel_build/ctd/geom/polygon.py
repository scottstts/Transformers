"""Convex differences, offset outlines and deterministic ear clipping."""

import math

EPS = 1e-8


class Profile(list):
    """A serialisable outline carrying analytic outward corner normals."""

    def __init__(self, vertices, normals):
        super().__init__(vertices)
        self.normals = normals


def rounded_profile(width, depth, radius=0.6, segments=4):
    r = min(radius, width / 2, depth / 2)
    out, normals = [], []
    for x, z, angle in ((width / 2 - r, depth / 2 - r, 0),
                         (-width / 2 + r, depth / 2 - r, math.pi / 2),
                         (-width / 2 + r, -depth / 2 + r, math.pi),
                         (width / 2 - r, -depth / 2 + r, math.pi * 1.5)):
        for j in range(segments + 1):
            a = angle + math.pi * 0.5 * j / segments
            out.append((x + r * math.cos(a), z + r * math.sin(a)))
            normals.append((math.cos(a), math.sin(a)))
    return Profile(out, normals)


def area(poly):
    return sum(a[0] * b[1] - b[0] * a[1]
               for a, b in zip(poly, poly[1:] + poly[:1])) * 0.5


def ccw(poly):
    p = [tuple(v) for v in poly]
    return p if area(p) > 0 else p[::-1]


def clean(poly):
    p = []
    for v in poly:
        if not p or math.dist(p[-1], v) > EPS:
            p.append(tuple(v))
    if len(p) > 1 and math.dist(p[0], p[-1]) < EPS:
        p.pop()
    if len(p) < 3 or abs(area(p)) < EPS:
        return []
    return p


def clip_halfplane(poly, a, b, inside=True):
    def side(v):
        s = (b[0] - a[0]) * (v[1] - a[1]) - (b[1] - a[1]) * (v[0] - a[0])
        return s if inside else -s

    out = []
    for p, q in zip(poly, poly[1:] + poly[:1]):
        sp, sq = side(p), side(q)
        pin, qin = sp >= -EPS, sq >= -EPS
        if pin:
            out.append(p)
        if pin != qin:
            t = sp / (sp - sq)
            out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return clean(out)


def difference(poly, hole):
    """Partition a convex polygon outside a convex hole, without overlaps."""
    rem, out = ccw(poly), []
    h = ccw(hole)
    # Early separation prevents remote hole edges from needlessly slicing floors.
    if (max(v[0] for v in rem) <= min(v[0] for v in h) + EPS
            or min(v[0] for v in rem) >= max(v[0] for v in h) - EPS
            or max(v[1] for v in rem) <= min(v[1] for v in h) + EPS
            or min(v[1] for v in rem) >= max(v[1] for v in h) - EPS):
        return [rem]
    for a, b in zip(h, h[1:] + h[:1]):
        if all((b[0] - a[0]) * (v[1] - a[1]) - (b[1] - a[1]) * (v[0] - a[0]) <= EPS for v in rem):
            return [rem]
    for a, b in zip(h, h[1:] + h[:1]):
        if not rem:
            break
        fragment = clip_halfplane(rem, a, b, False)
        if fragment:
            out.append(fragment)
        rem = clip_halfplane(rem, a, b, True)
    return out


def subtract_all(polys, holes):
    result = list(polys)
    for hole in holes:
        result = [piece for p in result for piece in difference(p, hole)]
    return result


def inset(poly, distance):
    """Mitred inward parallel offset of a convex outline."""
    p = ccw(poly)
    lines = []
    for a, b in zip(p, p[1:] + p[:1]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dz)
        nx, nz = -dz / length, dx / length
        lines.append(((a[0] + nx * distance, a[1] + nz * distance), (dx, dz)))
    out = []
    for (a, u), (b, v) in zip(lines[-1:] + lines[:-1], lines):
        den = u[0] * v[1] - u[1] * v[0]
        t = ((b[0] - a[0]) * v[1] - (b[1] - a[1]) * v[0]) / den
        out.append((a[0] + t * u[0], a[1] + t * u[1]))
    return out


def triangulate(poly):
    """Return triangle indices, respecting the caller's winding."""
    if len(poly) == 3:
        return [(0, 1, 2)]
    sign = 1 if area(poly) > 0 else -1
    indices, triangles = list(range(len(poly))), []

    def cross(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    def contains(p, a, b, c):
        return all(sign * cross(u, v, p) >= -EPS for u, v in ((a, b), (b, c), (c, a)))

    while len(indices) > 3:
        found = False
        for j, b in enumerate(indices):
            a, c = indices[j - 1], indices[(j + 1) % len(indices)]
            if sign * cross(poly[a], poly[b], poly[c]) <= EPS:
                continue
            if any(contains(poly[k], poly[a], poly[b], poly[c])
                   for k in indices if k not in (a, b, c)):
                continue
            triangles.append((a, b, c))
            indices.pop(j)
            found = True
            break
        if not found:
            # Collinear points are redundant, not fan-triangulated over a concavity.
            for j, b in enumerate(indices):
                a, c = indices[j - 1], indices[(j + 1) % len(indices)]
                if abs(cross(poly[a], poly[b], poly[c])) < EPS:
                    indices.pop(j)
                    found = True
                    break
            if not found:
                raise ValueError("Non-simple polygon in ear clipping")
    triangles.append(tuple(indices))
    return triangles


def rectangle(x0, x1, z0, z1):
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def circle(x, z, r, sides=32):
    return [(x + r * math.cos(i * math.tau / sides), z + r * math.sin(i * math.tau / sides))
            for i in range(sides)]


def transform(poly, at, yaw=0):
    c, s = math.cos(yaw), math.sin(yaw)
    vertices = [(at[0] + c * x + s * z, at[1] - s * x + c * z) for x, z in poly]
    if hasattr(poly, "normals"):
        return Profile(vertices, [(c * x + s * z, -s * x + c * z) for x, z in poly.normals])
    return vertices
