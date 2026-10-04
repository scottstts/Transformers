"""The Impala robot's cavalry cutlass: a curved forged blade with a recessed
fuller and a ground edge, a grooved oval grip, a spring-steel D knuckle bow that
returns into a turned pommel, and a short swept quillon.

Sized for the 5.4 m robot at 3.4 m overall (blade 2.87 m), long as a
cutlass of a giant: the left hand's grip centre is the origin, +Z runs to the
tip, the edge faces +X and the blade curves back toward -X at the tip (a
sabre curves away from its edge), the knuckle bow rises on the spine side as in
the reference photo.

Declared joins: the blade root is sunk into the bolster; the bow's ends are
sunk into the pommel cap and the bolster; the quillon rises out of the bolster.
Every dimension is authored at reference scale and multiplied by SCALE.
"""
import math
from mathutils import Vector
from f1b import kit as K
from . import kit
from .kit import Part

NAME = 'cutlass'
SCALE = 1.5
GRIP_MID = -0.175          # reference-frame z of the grip centre (becomes the origin)

# reference-scale blade stations: (z, width)  and (z, centreline offset toward the spine)
WIDTH = [(.010, .037), (.032, .086), (.133, .087), (.260, .083), (.750, .078), (1.18, .073),
         (1.55, .067), (1.75, .048), (1.88, .021), (1.926, .0003)]
CENTRE = [(.010, 0), (.133, 0), (.60, .001), (1.18, .003), (1.48, .007), (1.72, .030), (1.88, .065), (1.926, .082)]
# fine section: (u across the width, v of half thickness); u -0.58 is the edge, +0.42 the spine
SECTION = [(-.58, 0), (-.44, .56), (-.16, 1), (.025, 1), (.105, None), (.245, None), (.330, .40), (.420, .40),
           (.420, -.40), (.330, -.40), (.245, None), (.105, None), (.025, -1), (-.16, -1), (-.44, -.56)]
EDGE_VERTS = (0, 1, 13, 14)


def _interp(table, z):
    if z <= table[0][0]:
        return table[0][1]
    for (z0, a), (z1, b) in zip(table, table[1:]):
        if z <= z1:
            return a + (b - a) * (z - z0) / (z1 - z0)
    return table[-1][1]


def _smooth(table, z):
    """Catmull-Rom over the station table so the curve has no kinks."""
    pts = table
    if z <= pts[0][0]:
        return pts[0][1]
    if z >= pts[-1][0]:
        return pts[-1][1]
    for i in range(len(pts) - 1):
        if pts[i][0] <= z <= pts[i + 1][0]:
            p0 = pts[max(i - 1, 0)]
            p1, p2 = pts[i], pts[i + 1]
            p3 = pts[min(i + 2, len(pts) - 1)]
            t = (z - p1[0]) / (p2[0] - p1[0])
            m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * (p2[0] - p1[0]) if p2[0] != p0[0] else 0
            m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * (p2[0] - p1[0]) if p3[0] != p1[0] else 0
            t2, t3 = t * t, t * t * t
            return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2
    return pts[-1][1]


def _lin(a, b, n):
    return [a + (b - a) * i / (n - 1) for i in range(n)]


def P(x, y, z):
    """Reference-frame point to weapon frame: edge toward +X, grip centre at the origin, metres."""
    return Vector((-x * SCALE, y * SCALE, (z - GRIP_MID) * SCALE))


def _add_slotted(part, mesh, slot_of_face):
    verts, faces = mesh
    base = len(part.verts)
    part.verts.extend(Vector(v) for v in verts)
    for k, f in enumerate(faces):
        slot = slot_of_face(k)
        if slot not in part.slots:
            part.slots.append(slot)
        part.faces.append([i + base for i in f])
        part.fslot.append(part.slots.index(slot))


def _blade():
    p = Part(NAME, 'cutlass.blade')
    n = len(SECTION)
    fz = lambda z: .52 * min(1, max(0, (z - .205) / .095), max(0, (1.79 - z) / .150))  # fuller depth
    # fuller rows carry v = +-(1 - fuller)
    rings = []
    for z in _lin(.010, 1.926, 193):
        w = max(_smooth(WIDTH, z), 3e-4)
        cx = _smooth(CENTRE, z)
        depth = .011 * min(1, w / .060)
        f = fz(z)
        ring = []
        for i, (u, v) in enumerate(SECTION):
            if v is None:
                v = (1 - f) * (1 if i < 7 else -1)
            ring.append(P(cx + u * w, v * depth, z))
        rings.append(ring)
    mesh = K.loft(rings, True, True)

    def slot(k):
        if k >= (len(rings) - 1) * n:
            return 'blade'
        return 'edge' if (k % n) in EDGE_VERTS else 'blade'
    _add_slotted(p, mesh, slot)
    return p


def _grip():
    p = Part(NAME, 'cutlass.grip')
    rings = []
    for z in _lin(-.334, -.016, 73):
        t = (z + .334) / .318
        radius = .028 + .004 * abs(2 * t - 1) ** 1.6
        groove = math.sin(math.pi * t) ** .55
        ring = []
        for a in _lin(0, math.tau, 97)[:-1]:
            rel = .0013 * math.cos(6 * a) * groove
            ring.append(P((radius + rel) * math.cos(a), (.026 + rel) * math.sin(a) / 1.0, z))
        rings.append(ring)
    p.add(K.loft(rings, True, True), 'grip')
    return p


def _turned(profile_zr, seg=64):
    """Reference (z, r) profile to a weapon-frame revolve about the blade axis."""
    prof = [(r * SCALE, (z - GRIP_MID) * SCALE) for z, r in profile_zr]
    return K.revolve(prof, seg)


def _fittings():
    p = Part(NAME, 'cutlass.fittings')
    # pommel cap and the ferrule under the bolster
    p.add(_turned([(-.348, 0), (-.348, .022), (-.342, .033), (-.329, .034), (-.322, .031), (-.322, 0)]), 'guard')
    p.add(_turned([(-.025, .024), (-.025, .033), (-.012, .033), (-.006, .028), (-.006, .023), (-.025, .024)]), 'guard')
    # blade heel bolster
    rr = lambda w, d, r: kit.chamfer_rect(w * SCALE, d * SCALE, r * SCALE)
    secs = [rr(.058, .046, .014), rr(.070, .043, .014), rr(.058, .034, .010)]
    zs = [(z - GRIP_MID) * SCALE for z in (-.017, .012, .024)]
    p.add(kit.section_loft([[(-x, y) for x, y in s] for s in secs], zs, cap_round=0.003, seg=2), 'guard')
    # through pin
    pin = K.tube([P(0, -.037, -.340), P(0, .037, -.340)], .009 * SCALE, 16)
    p.add(pin, 'guard')
    return p


def _strap(path_pts, half_t, half_w, taper_ends=8):
    """Flat strap swept along a path in the XZ plane: thickness in-plane, width along Y."""
    rings = []
    n = len(path_pts)
    for i, pt in enumerate(path_pts):
        tan = (path_pts[min(i + 1, n - 1)] - path_pts[max(i - 1, 0)]).normalized()
        normal = tan.cross(Vector((0, 1, 0))).normalized()
        w = half_w * min(1.0, (i + 1) / taper_ends, (n - i) / taper_ends)
        t = half_t
        prof = [(-t * .7, -w), (t * .7, -w), (t, -w * .55), (t, w * .55), (t * .7, w), (-t * .7, w)]
        rings.append([pt + normal * u + Vector((0, 1, 0)) * v for u, v in prof])
    return K.loft(rings, True, True)


def _catmull(pts, per):
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


def _guard():
    p = Part(NAME, 'cutlass.guard')
    ref = [(0, 0, -.334), (.081, 0, -.340), (.164, 0, -.295), (.204, 0, -.210), (.208, 0, -.110), (.179, 0, -.032), (.107, 0, .016), (.034, 0, .026)]
    path = _catmull([P(*v) for v in ref], 20)
    p.add(_strap(path, .0055 * SCALE, .021 * SCALE), 'guard')
    quill = _catmull([P(x, 0, z) for x, z in ((-.126, .041), (-.092, .061), (-.043, .042), (.013, .024), (.068, .023), (.113, .018))], 20)
    # the quillon lies toward the edge side and tapers to a point
    p.add(_strap(quill, .0050 * SCALE, .021 * SCALE, 10), 'guard')
    return p


def build(coll):
    """Every part of the cutlass in `coll`. Returns the export metadata."""
    K.finish(_blade().build(coll), width=0.0012, seg=1, angle=40)
    K.finish(_grip().build(coll), width=0, seg=1, angle=60)
    K.finish(_fittings().build(coll), width=0.002, seg=1, angle=35)
    K.finish(_guard().build(coll), width=0.0015, seg=1, angle=35)
    # the honed edge from just past the heel to the point; the second grip is the pommel end (one-handed weapon)
    z0 = .30
    heel = P(_smooth(CENTRE, z0) - .58 * _smooth(WIDTH, z0), 0, z0)
    tip = P(CENTRE[-1][1], 0, 1.926)
    return {
        'grips': {'main': [0.0, 0.0, 0.0], 'off': [0.0, 0.0, -0.20]},
        'edge': [[heel.x, 0.0, heel.z], [tip.x, 0.0, tip.z]],
    }
