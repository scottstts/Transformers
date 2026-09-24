"""Hard-surface kit for the robot's armour: pieces read as machined parts, not
bottles and cardboard.

Principles (apply to every shell):
  - faceted sections with unequal chamfers, never plain cylinders or cones
  - segmented: a shell is a stack of bands with seams between them, a dark core
    showing through the seams (panel lines for free)
  - layered: raised plates on the bands, recessed vents with slats, trim bands
  - fastened: bolt heads at plate corners and band ends
All builders take bone-local design coordinates (x, f, z) and return
[(mesh, slot)] lists; sections are (x, f) polygons at a given z.
"""
import math
from mathutils import Vector, Matrix
from . import kit, rkit
from .kit import V
from .shape import lerp, clamp01, smooth01


def sec(w, d, cf=0.3, cb=0.2, fc=0.0, xc=0.0, keel=0.0, bulge_x=0.0):
    """Irregular octagon: width w (x), depth d (f); cf / cb = front / back chamfer as a
    fraction of the half depth; keel pushes the front centre forward (a V ridge);
    bulge_x pushes the outer (+x) flank out (asymmetric limb shells)."""
    hw, hd = w / 2, d / 2
    a, b = hd * cf, hd * cb
    pts = [(0.0, hd + keel), (hw - a, hd), (hw + bulge_x, hd - a), (hw + bulge_x, -hd + b), (hw - b, -hd), (0.0, -hd),
           (-hw + b, -hd), (-hw, -hd + b), (-hw, hd - a), (-hw + a, hd)]
    return [(x + xc, f + fc) for x, f in pts]


def offset(poly, d):
    return kit.offset_poly(kit.ccw(poly), d)


def loft(zs, secs, cap=0.006):
    """Solid loft of design sections at z stations (any order)."""
    order = sorted(range(len(zs)), key=lambda i: zs[i])
    zs = [zs[i] for i in order]
    secs = [[(x, -f) for x, f in secs[i]] for i in order]
    return kit.section_loft(secs, zs, cap_round=cap, seg=1)


def banded(zs_bands, secfn, gap=0.016, core_inset=0.018, slot='paint', core='graphite', cap=0.008, n=3):
    """Segmented shell: each band (z0, z1) a faceted loft of secfn(z) sampled n times,
    seams of `gap` between bands, a core (inset) running through all of them."""
    out = []
    for z0, z1 in zs_bands:
        a, b = sorted((z0, z1))
        a, b = a + gap / 2, b - gap / 2
        zs = [lerp(a, b, k / (n - 1)) for k in range(n)]
        out.append((loft(zs, [secfn(z) for z in zs], cap), slot))
    lo = min(min(z0, z1) for z0, z1 in zs_bands)
    hi = max(max(z0, z1) for z0, z1 in zs_bands)
    zs = [lerp(lo + 0.004, hi - 0.004, k / 4) for k in range(5)]
    out.append((loft(zs, [offset(secfn(z), -core_inset) for z in zs], 0.004), core))
    return out


def face_frame(poly, z, side, lift=0.0):
    """Frame on the flat face of a section polygon: the edge `side` (index of its first vertex)
    at height z. Returns (origin, u along the edge, n outward) in design coordinates."""
    p = kit.ccw([tuple(q) for q in poly])
    a, b = Vector((*p[side], 0)), Vector((*p[(side + 1) % len(p)], 0))
    u = (b - a).normalized()
    n = Vector((u.y, -u.x, 0))
    o = (a + b) / 2 + n * lift
    return (o.x, o.y, z), (u.x, u.y, 0.0), (n.x, n.y, 0.0)


def plate_on(origin, u, n, outline_uz, thick, slot='paint', inset=0.0):
    """A plate lying on a face: outline in (along-edge u, z) around origin; extruded along n."""
    o, uu, nn = Vector(origin), Vector(u), Vector(n)
    zz = Vector((0, 0, 1))
    from .shape import plate
    m = plate(outline_uz, thick, warp=lambda a, b, w: tuple(o + uu * a + zz * b + nn * (w + thick / 2 - inset)))
    return [(m, slot)]


def vent_on(origin, u, n, w, h, slats=4, depth=0.012, slot_back='graphite', slot_slat='darkSteel'):
    """Recessed intake: dark back plate sunk into the face, slats across it."""
    out = plate_on(origin, u, n, [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)], 0.006, slot_back, inset=depth)
    for k in range(slats):
        zc = -h / 2 + h * (k + 0.5) / slats
        out += plate_on(origin, u, n, [(-w / 2 + 0.004, zc - 0.005), (w / 2 - 0.004, zc - 0.005), (w / 2 - 0.004, zc + 0.005),
                                       (-w / 2 + 0.004, zc + 0.005)], 0.010, slot_slat, inset=depth - 0.004)
    return out


def bolts_on(origin, u, n, pts_uz, r=0.007, slot='gold'):
    o, uu, nn = Vector(origin), Vector(u), Vector(n)
    out = []
    for a, b in pts_uz:
        p = o + uu * a + Vector((0, 0, b))
        out += [(m, slot) for m in rkit.bolt_ring((p.x, p.y, p.z), (nn.x, -nn.y, nn.z), 0.0001, 1, r, 0.006)]
    return out


def ring_band(z, secfn, h=0.030, grow=0.010, slot='paintWhite', cap=0.004):
    """Trim band proud of the shell at z (a thin loft of the grown section)."""
    return [(loft([z - h / 2, z + h / 2], [offset(secfn(z), grow)] * 2, cap), slot)]
