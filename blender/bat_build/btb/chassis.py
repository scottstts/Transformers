"""Running gear: the exposed front double wishbones with copper coil-overs, the
steering knuckles, and the rear trailing arms and coil-overs beside the pod."""
import math
from mathutils import Vector
from . import kit, rkit, dims as D
from .kit import V
from .facet import solid


def _tube(a, b, r, slot='chassis', seg=12):
    return (kit.tube([V(*a), V(*b)], r, seg), slot)


def coilover(a, b, r=0.055, turns=7):
    """Coil-over damper between design points a (lower eye) and b (upper eye)."""
    A, B = V(*a), V(*b)
    d = B - A
    L = d.length
    u = d / L
    out = [(kit.tube([A + u * 0.04, A + u * (L * 0.62)], r * 0.55, 16), 'copper'),
           (kit.tube([A + u * (L * 0.55), B - u * 0.04], r * 0.28, 12), 'chrome')]
    side = u.orthogonal().normalized()
    w = u.cross(side)
    pts = []
    n = turns * 12
    z0, z1 = L * 0.18, L * 0.86
    for k in range(n + 1):
        t = k / n
        a_ = 2 * math.pi * turns * t
        pts.append(A + u * (z0 + (z1 - z0) * t) + (side * math.cos(a_) + w * math.sin(a_)) * r)
    out.append((kit.tube(pts, 0.011, 8), 'copper'))
    for p, k in ((A, 0.0), (B, 1.0)):
        out.append((kit.tube([p - side * 0.03, p + side * 0.03], 0.026, 12), 'darkSteel'))
    for z in (z0, z1):
        c = A + u * z
        out.append((kit.tube([c - u * 0.008, c + u * 0.008], r * 1.18, 20), 'darkSteel'))
    return out


def front(coll):
    """The front spindles: each wheel hangs on its arm's outer hub carrier."""
    out = {}
    for S, s in (('L', 1), ('R', -1)):
        # the spindle: from the rim's centre disc out through the tyre's open bore to the
        # arm's hub carrier on the outer face (the rims are dished inward)
        p = [_tube((s * 0.42, D.FA_F, D.FR_R), (s * 0.90, D.FA_F, D.FR_R), 0.042, 'steel'),
             (rkit.cylinder((s * 0.80, D.FA_F, D.FR_R), 0.085, 0.05, 'x', 24), 'darkSteel')]
        out['steer.' + S] = solid('steer.' + S, p, coll)
    return out


def rear(coll):
    out = {}
    for S, s in (('L', 1), ('R', -1)):
        p = []
        # the coil-over beside the pod (seen from behind)
        p += coilover((s * 0.36, D.f(4.10), 0.52), (s * 0.36, D.f(4.00), 1.08), 0.06, 8)
        out['rearArms.' + S] = solid('rearArms.' + S, p, coll)
    return out


def build(coll):
    out = {}
    out.update(front(coll))
    return out
