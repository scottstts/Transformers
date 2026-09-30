"""Skirt blades: long gunmetal feathers with crimson inlays and red tips,
authored for the left side and mirrored for the right.

Mantle (side fan): a hinge drum at the belt carries a sloped hip wing that
reaches out over the thigh; three blades hang from under its outer edge and bow
outward past the thigh and shin, overlapping front to back. Tail (rear fan):
a hinge under the rear tassets carries two blades: one falls behind the legs
near the centre, the outer one flares wide.
"""
import math
from mathutils import Vector
from . import kit as K


def _bezier(a, b, c, n):
    a, b, c = Vector(a), Vector(b), Vector(c)
    return [a * (1 - t) ** 2 + b * 2 * t * (1 - t) + c * t * t for t in (k / (n - 1) for k in range(n))]


def feather(root, mid, tip, face, wmax, t=.04, n=12):
    """[(mesh, slot)]: blade body, crimson inlay over the lower half, red tip line."""
    spine = _bezier(root, mid, tip, n)
    prof = [math.sin(math.pi * min(1, (k / (n - 1)) * 1.25)) ** .6 * (1 - (k / (n - 1)) ** 3) for k in range(n)]
    width = [wmax * (.45 + .55 * w) if k < n - 1 else .002 for k, w in enumerate(prof)]
    width[-1] = .002
    thick = [t * (1 - .6 * k / (n - 1)) for k in range(n)]
    out = [(K.blade(spine, width, thick, face, .3), 'structure')]
    lo = int(n * .66)
    out.append((K.blade(spine[lo:], [w * .3 for w in width[lo:]], [d * 1.25 for d in thick[lo:]], face, .3), 'crimson'))
    out.append((K.blade(spine[-4:], [.01, .008, .005, .001], [d * 1.5 for d in thick[-4:]], face, .5), 'glow'))
    return out


def mantle(side):
    p = K.Part('mantle.' + side, 'mantle.' + side, bevel=.01)
    m = side == 'R'
    p.add(K.drum((0, 0, 0), .11, .34, 'Y', 20), 'structure', m)
    # tasset: a pearl plate hanging outside the hip, pointed at the bottom, a black inlay and lamp
    down = Vector((.28, 0, -.44)).normalized()
    out = Vector((.44, 0, .28)).normalized()
    tas = [(.14, -.3, .08), (.14, .3, .08), (.42, .32, -.36), (.56, .02, -.62), (.42, -.3, -.36)]
    p.add(K.slab(tas, (0, 1, 0), down, .07), 'ceramic', m, True)
    inlay = [Vector(v) + out * .04 for v in [(.2, -.18, 0), (.2, .18, 0), (.4, .18, -.32), (.49, .02, -.5), (.4, -.18, -.32)]]
    p.add(K.slab(inlay, (0, 1, 0), down, .03), 'obsidian', m, True)
    lamp = [Vector(v) + out * .058 for v in [(.3, -.018, -.1), (.3, .018, -.1), (.44, .018, -.38), (.44, -.018, -.38)]]
    p.add(K.slab(lamp, (0, 1, 0), down, .02, .005), 'glow', m)
    for v in [(.2, -.25, .02), (.2, .25, .02)]:
        p.add(K.hex_bolt(Vector(v) + out * .035, out, .016, .012), 'steel', m)
    p.add(K.cyl((.46, .01, -.42), .04, .56, 'Y', 12), 'steel', m)
    for k, y in enumerate((-.16, .03, .2)):
        root = (.46, y, -.42)
        mid = (.72 + .04 * k, y + .06 * k, -1.3)
        tip = (.92 + .14 * k, y + .12 + .1 * k, -2.55 + .15 * k)
        face = Vector((.55, -.83 + .18 * k, 0)).normalized()
        for mesh, slot in feather(root, mid, tip, face, .27 - .02 * k):
            p.add(mesh, slot, m)
    return p


def tail(side):
    p = K.Part('tail.' + side, 'tail.' + side, bevel=.01)
    m = side == 'R'
    p.add(K.drum((0, 0, 0), .09, .26, 'X', 20), 'structure', m)
    p.add(K.rod((0, -.18, .14), (0, 0, 0), .05, 12), 'structure', m)
    for k, (x0, x1, yl) in enumerate(((-.12, -.12, .5), (.14, .6, .66))):
        root = (x0 + .06, .06, -.02)
        mid = ((x0 + x1) / 2 + .05 * k, .16 + .05 * k, -1.0)
        tip = (x1, yl, -2.3 + .14 * k)
        face = Vector((-.25 * k, 1, 0)).normalized()
        for mesh, slot in feather(root, mid, tip, face, .26 - .02 * k):
            p.add(mesh, slot, m)
    return p


def parts():
    return [mantle('L'), mantle('R'), tail('L'), tail('R')]
