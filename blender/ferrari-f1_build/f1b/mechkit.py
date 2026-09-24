"""Mechanical detail kit for the endoskeleton: rams, gear discs, cable runs,
louvre stacks and fastener rows. All take design points (x, f, z) and return
[(mesh, slot)] so builders can drop them straight into a Part."""
import math
from mathutils import Vector
from . import kit, rkit
from .kit import V
from .shape import lathe


def ram(p0, p1, r_body=0.024, r_rod=0.011, split=0.56):
    """Hydraulic ram: chamfered cylinder body, gland collar, chrome rod, clevis eyes."""
    a, b = V(*p0), V(*p1)
    d = b - a
    L = d.length
    u = d / L
    m = a + u * (L * split)
    out = [(kit.tube([a + u * 0.012, m], r_body, 16), 'mech'),
           (kit.tube([m - u * 0.012, m + u * 0.020], r_body * 1.22, 16), 'darkSteel'),
           (kit.tube([m, b - u * 0.012], r_rod, 14), 'chrome')]
    side = u.orthogonal().normalized()
    for p in (a, b):
        out.append((kit.tube([p - side * 0.016, p + side * 0.016], r_body * 0.85, 14), 'darkSteel'))
    return out


def gear_disc(center, axis, r, w, teeth=0, bolts=8, slot_face='darkSteel', hub_slot='gold'):
    """Machined joint disc: stepped face, raised hub, optional teeth, gold bolt ring on the face."""
    h = w / 2
    prof = [(0.0, -h - 0.008), (r * 0.30, -h - 0.008), (r * 0.34, -h), (r * 0.80, -h), (r * 0.86, -h + 0.006), (r, -h + 0.010),
            (r, h - 0.010), (r * 0.86, h - 0.006), (r * 0.80, h), (r * 0.34, h), (r * 0.30, h + 0.008), (0.0, h + 0.008)]
    ax = {'x': 'x', 'f': 'y', 'z': 'z'}[axis] if isinstance(axis, str) else 'x'
    M = kit.frame_from(V(*center), *_basis(axis))
    out = [(kit.transform(lathe(prof, 36, 'z'), M), slot_face)]
    out.append((kit.transform(lathe([(0.0, h + 0.006), (r * 0.26, h + 0.006), (r * 0.26, h + 0.020), (r * 0.20, h + 0.026), (0.0, h + 0.026)], 24, 'z'), M), hub_slot))
    if teeth:
        for k in range(teeth):
            a = 2 * math.pi * k / teeth
            c = Vector((math.cos(a) * (r + 0.008), math.sin(a) * (r + 0.008), 0.0))
            t = kit.prism(kit.rect(0.020, 0.016), -h * 0.7, h * 0.7,
                          M=M @ kit.frame_from(c, (math.cos(a), math.sin(a), 0), (-math.sin(a), math.cos(a), 0)))
            out.append((t, 'darkSteel'))
    if bolts:
        axv = M.to_3x3() @ Vector((0, 0, 1))
        for m in rkit.bolt_ring(tuple(_design(M @ Vector((0, 0, 0)))), tuple(axv), r * 0.58, bolts, r * 0.07, 0.008, h):
            out.append((m, 'gold'))
    return out


def _basis(axis):
    """(xaxis, yaxis) of a frame whose z is the design axis."""
    if isinstance(axis, str):
        z = {'x': Vector((1, 0, 0)), 'f': Vector((0, -1, 0)), 'z': Vector((0, 0, 1))}[axis]
    else:
        z = V(*axis).normalized()
    x = z.orthogonal().normalized()
    y = z.cross(x)
    return tuple(x), tuple(y)


def _design(p):
    return (p.x, -p.y, p.z)


def cable(pts, r=0.008, slot='rubber'):
    return [(rkit.hose(pts, r), slot)]


def louvres(x0, x1, f, z0, z1, n, depth=0.018, slot='carbon'):
    """Horizontal slat stack on a plane of constant f (front view)."""
    out = []
    h = (z1 - z0) / n
    for k in range(n):
        z = z0 + k * h
        out.append((rkit.plate_f([(x0, z), (x1, z), (x1, z + h * 0.55), (x0, z + h * 0.55)], f - depth, f, 0.003), slot))
    return out


def bolt_row(p0, p1, n, axis, r=0.007, slot='gold'):
    a, b = V(*p0), V(*p1)
    out = []
    for k in range(n):
        p = a.lerp(b, (k + 0.5) / n)
        out += [(m, slot) for m in rkit.bolt_ring(_design(p), axis, 0.0001, 1, r, 0.006)]
    return out
