"""Hard-surface kit for the robot (concept: faceted white armour over a dark
mechanical body with bronze actuators).

Armour pieces are convex faceted solids: every plate is the hull of its back
outline, its outer outline and a raised, inset crown, so it reads as a cut gem
with chamfered facets, never a slab. Mechanics are chamfered blocks, drums,
rams and hoses. All points are world rest coordinates (rig rest pose); every
helper writes into a kit Mesh and returns it.
"""
import math
from mathutils import Vector, Matrix
from . import kit as K


def V(*a):
    return Vector(a[0] if len(a) == 1 else a)


def centroid(pts):
    c = Vector()
    for p in pts:
        c += p
    return c / len(pts)


def plane_normal(pts):
    """Newell normal of a (roughly planar) loop."""
    n = Vector()
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        n.x += (p.y - q.y) * (p.z + q.z)
        n.y += (p.z - q.z) * (p.x + q.x)
        n.z += (p.x - q.x) * (p.y + q.y)
    return n.normalized()


def gem(m, outline, n, t, inset=0.35, rise=0.35, mat='armour', ridge=None, back_inset=0.0):
    """Faceted armour plate. outline: loop of points on the plate's outer edge;
    n: outward direction; t: thickness behind the outline. The crown is the
    outline pulled `inset` (fraction of the way to the centroid) toward its
    centre and raised `rise` * t along n; `ridge` adds points raised further
    (a keel line). back_inset shrinks the back face (a bevelled underside)."""
    pts = [V(p) for p in outline]
    n = V(n).normalized()
    c = centroid(pts)
    hull = [p - n * t + (c - p) * back_inset for p in pts]
    hull += pts
    hull += [p + (c - p) * inset + n * (rise * t) for p in pts]
    if ridge:
        hull += [V(p) for p in ridge]
    return m.hull(hull, mat)


def chbox(m, c, size, ch=0.02, mat='graphite', q=None):
    """Box with chamfered edges and corners (hull of three shrunken boxes)."""
    c = V(c)
    sx, sy, sz = (a / 2 for a in size)
    pts = []
    for ax, ay, az in ((sx - ch, sy - ch, sz), (sx - ch, sy, sz - ch), (sx, sy - ch, sz - ch)):
        for x in (-ax, ax):
            for y in (-ay, ay):
                for z in (-az, az):
                    p = Vector((x, y, z))
                    pts.append(c + (q @ p if q else p))
    return m.hull(pts, mat)


def frame(o, u, w):
    """Orthonormal (u, v, w) frame from a primary axis w and a hint u."""
    w = V(w).normalized()
    u = V(u)
    u = (u - w * u.dot(w)).normalized()
    return u, w.cross(u), w


def prism(m, poly, o, u, v, w, t0, t1, ch=0.01, mat='armour'):
    """Extruded 2D polygon poly [(a, b)] in plane o + a u + b v, from depth t0 to
    t1 along w, both caps chamfered by ch (hull: a convex prism)."""
    o = V(o)
    c = Vector((sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)))
    pts = []
    for a, b in poly:
        d = Vector((a, b)) - c
        k = max(0.0, 1 - ch / max(d.length, 1e-6))
        for (aa, bb), tt in (((a, b), t0 + ch), ((a, b), t1 - ch),
                             ((c.x + d.x * k, c.y + d.y * k), t0), ((c.x + d.x * k, c.y + d.y * k), t1)):
            pts.append(o + u * aa + v * bb + w * tt)
    return m.hull(pts, mat)


def drum(m, c, axis, r, w, mat='graphite', ch=0.012, sides=32, hub=None):
    """Chamfered joint drum centred on c; hub=(r, w, mat) adds a raised boss."""
    ch = min(ch, r * 0.3, w * 0.3)
    m.lathe([(-w / 2, 0.0), (-w / 2, r - ch), (-w / 2 + ch, r), (w / 2 - ch, r), (w / 2, r - ch), (w / 2, 0.0)],
            mat, c, axis, sides)
    if hub:
        hr, hw, hm = hub
        for s in (-1, 1):
            m.lathe([(s * w / 2, 0.0), (s * w / 2, hr), (s * (w / 2 + hw * 0.6), hr), (s * (w / 2 + hw), hr * 0.7),
                     (s * (w / 2 + hw), 0.0)], hm, c, axis, sides)
    return m


def ram(m, a, b, r, body='graphite', rod='chrome', split=0.55, eye='gunmetal'):
    """Hydraulic ram a -> b: a cylinder over `split` of the length with a gland
    collar, the rod on to b, eyes at both ends."""
    a, b = V(a), V(b)
    d = b - a
    L = d.length
    ax = d / L
    s = L * split
    m.lathe([(0.0, 0.0), (0.0, r * 0.8), (r * 0.4, r), (s - r * 0.5, r), (s - r * 0.5, r * 1.18), (s, r * 1.18),
             (s, 0.0)], body, a, ax, 20)
    m.lathe([(s - 0.01, 0.0), (s - 0.01, r * 0.5), (L - r * 0.3, r * 0.5), (L - r * 0.3, 0.0)], rod, a, ax, 16)
    u = ax.orthogonal().normalized()
    for p in (a, b):
        m.lathe([(-r * 0.7, 0.0), (-r * 0.7, r * 0.9), (r * 0.7, r * 0.9), (r * 0.7, 0.0)], eye, p, u, 16)
    return m


def hose(m, pts, r, mat='bronze', sides=10, n=6):
    """Smooth Catmull-Rom tube through pts."""
    P = [V(p) for p in pts]
    path = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    path.append(P[-1])
    return m.tube(path, r, mat, sides)


def bolts(m, pts, n, r=0.012, h=0.008, mat='gunmetal'):
    """Hex bolt heads standing h proud along n."""
    n = V(n).normalized()
    for p in pts:
        m.lathe([(0.0, 0.0), (0.0, r), (h * 0.7, r), (h, r * 0.75), (h, 0.0)], mat, V(p) - n * 0.002, n, 6)
    return m


def ribs(m, a, b, count, r0, r1, w, mat='graphite', axis_hint=(1, 0, 0), sides=8):
    """Stacked faceted rings from a to b (segmented actuator / flex joint)."""
    a, b = V(a), V(b)
    ax = (b - a).normalized()
    for k in range(count):
        c = a + (b - a) * ((k + 0.5) / count)
        rr = r0 + (r1 - r0) * (k + 0.5) / count
        m.lathe([(-w / 2, 0.0), (-w / 2, rr * 0.86), (-w / 4, rr), (w / 4, rr), (w / 2, rr * 0.86), (w / 2, 0.0)],
                mat, c, ax, sides)
    return m


def loop_at(cx, cy, z, pts2d):
    """2D (x, y) loop offset to (cx, cy) at height z."""
    return [Vector((cx + x, cy + y, z)) for x, y in pts2d]


def octa(w, d, cf=0.25, cb=0.25, keel=0.0):
    """Irregular octagon section (x, y), y = forward(-) / back(+): width w, depth
    d, front / back chamfers as fractions of the half extents, keel = a V ridge
    pushed forward at the front centre."""
    hw, hd = w / 2, d / 2
    a, b = min(hw, hd) * cf * 2, min(hw, hd) * cb * 2
    pts = [(0.0, -hd - keel), (hw - a, -hd), (hw, -hd + a), (hw, hd - b), (hw - b, hd), (-hw + b, hd), (-hw, hd - b),
           (-hw, -hd + a), (-hw + a, -hd)]
    return pts


def shell(m, rings, mat='armour'):
    """Convex faceted shell through stacked rings (lists of 3D points)."""
    pts = [V(p) for r in rings for p in r]
    return m.hull(pts, mat)


def mirror_pts(pts):
    return [Vector((-p[0], p[1], p[2])) for p in pts]


def sector(m, rings, a0, a1, thick, s=1, n=5, mat='armour', keel=None, gap=0.0):
    """Armour wrapped round a limb: rings [(z, cx, cy, rx, ry)] (cx, cy the limb's
    centre, x outward for side s), angles a0..a1 in degrees from outward (+x)
    toward back (+y); front is 270. The outer surface follows the rings, the
    inner surface sits `thick` inside; `keel` (angle, height) raises a ridge.
    The hull of the samples gives a faceted, convex wrap."""
    pts = []
    a0g, a1g = a0 + gap, a1 - gap
    for z, cx, cy, rx, ry in rings:
        for k in range(n):
            a = math.radians(a0g + (a1g - a0g) * k / (n - 1))
            d = Vector((math.cos(a) * s, math.sin(a), 0))
            o = Vector((s * cx + d.x * rx, cy + d.y * ry, z))
            pts.append(o)
            pts.append(Vector((s * cx + d.x * (rx - thick), cy + d.y * (ry - thick), z)))
        if keel:
            a = math.radians(keel[0])
            d = Vector((math.cos(a) * s, math.sin(a), 0))
            pts.append(Vector((s * cx + d.x * (rx + keel[1]), cy + d.y * (ry + keel[1]), z)))
    return m.hull(pts, mat)


def arch(m, hub, s, R, xi, xo, spans, rout, mat='armour', lip=0.035):
    """Arched fender round a wheel whose axle is x: hub (x, y, z) world; spans
    [(a0, a1)] in degrees from +y (back) through up (90) to front (180);
    rout(a) the outer radius at angle a; R the inner radius. Each span is one
    convex plate, its outer face (x = xo) chamfered by `lip`."""
    hub = Vector(hub)
    for a0, a1 in spans:
        pts = []
        for a in (a0, (a0 + a1) / 2, a1):
            r = math.radians(a)
            d = Vector((0, math.cos(r), math.sin(r)))
            ro = rout(a)
            base = Vector((0, hub.y, hub.z))
            for x, rr in ((xi, R), (xi, ro), (xo - lip, R), (xo, R + lip), (xo, ro - lip), (xo - lip, ro)):
                pts.append(base + Vector((s * x, 0, 0)) + d * rr)
        m.hull(pts, mat)
    return m
