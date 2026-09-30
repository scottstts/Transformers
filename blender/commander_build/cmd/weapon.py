"""The lance, in the weapon frame: origin on the shaft axis inside the right
fist, +Z world up at rest (rig.local_matrix('weapon')).

A gloss-black shaft with steel collars and red light bands, a ribbed grip under
the fist, a long barbed spearhead of two crossed black blades and a barbed
counter-spike at the butt. The spearhead's luminous core rides the blade bone
in slot `blade`, running up its local +Z from the origin to BLADE_LEN; it
stands proud of both blade faces so the game's glow reads from every side.
"""
import math
from mathutils import Matrix, Vector
from . import kit as K, rig


def _head_outline(scale_w, length, barb=True):
    """Half outline (x, s) along the head; s from 0 (base) to 1 (tip)."""
    pts = [(0.0, 0.0), (.05, .02), (.07, .1)]
    if barb:
        pts += [(.17, -.06), (.1, .2)]
    pts += [(.1, .42), (.05, .78), (0.0, 1.0)]
    half = [(x * scale_w, s * length) for x, s in pts]
    return half + [(-x, s) for x, s in reversed(half[1:-1])]


def _crossed_head(z0, length, w, t, flip=False):
    out = []
    o = _head_outline(w, length)
    sgn = -1 if flip else 1
    for rot, scale in ((0, 1.0), (90, .72)):
        R = Matrix.Rotation(math.radians(rot), 4, 'Z')
        pts = [R @ Vector((x * scale, 0, z0 + sgn * s)) for x, s in o]
        out.append(K.slab(pts, R @ Vector((1, 0, 0)), (0, 0, 1), t * (1 if rot == 0 else .9), t * .45))
    return out


def lance():
    p = K.Part('lance', 'weapon', bevel=.006)
    up, down = rig.spear_up(), rig.spear_down()
    top = up - rig.HEAD_LEN
    r = rig.SHAFT_R
    p.add(K.cyl((0, 0, (top - down) / 2), r, top + down, 'Z', 18, .01), 'obsidian')
    # ribbed grip under the fist
    for k in range(9):
        p.add(K.ring((0, 0, -.28 + k * .07), r + .012, r - .005, .045, 'Z', 18), 'structure')
    # collars and light bands along the shaft
    for z, glow in ((-.42, True), (.26, False), (1.2, True), (top - .12, True), (-1.5, True), (-down + 1.04, False)):
        p.add(K.cyl((0, 0, z), r + .022, .09, 'Z', 18, .008), 'steel')
        if glow:
            p.add(K.ring((0, 0, z + .07), r + .012, r - .004, .03, 'Z', 18), 'glow')
    # spearhead: socket ferrule, crimson ring, crossed barbed blades
    p.add(K.revolve([(0, top - .2), (r + .02, top - .2), (r + .04, top - .14), (r + .04, top + .02), (.03, top + .12), (0, top + .12)], 18, 'Z'), 'steel')
    p.add(K.ring((0, 0, top - .05), r + .05, r + .01, .04, 'Z', 18), 'crimson')
    for m in _crossed_head(top, rig.HEAD_LEN, 1.0, .05):
        p.add(m, 'obsidian', False, True)
    # butt: counter-spike with a red core and a steel ferrule
    b0 = -down + .95
    p.add(K.cyl((0, 0, b0 + .08), r + .03, .16, 'Z', 18, .01), 'steel')
    for m in _crossed_head(b0, .95, .7, .045, flip=True):
        p.add(m, 'obsidian', False, True)
    p.add(K.slab([(0, 0, b0 - .12), (.028, 0, b0 - .3), (0, 0, b0 - .82), (-.028, 0, b0 - .3)], (1, 0, 0), (0, 0, 1), .06, .015), 'glow')
    return p


def energy():
    """Luminous core of the spearhead on the blade bone (+Z, 0..BLADE_LEN)."""
    p = K.Part('lance-energy', 'blade', bevel=0)
    L = rig.BLADE_LEN
    for rot, t in ((0, .066), (90, .062)):
        R = Matrix.Rotation(math.radians(rot), 4, 'Z')
        pts = [R @ Vector(v) for v in ((0, 0, 0), (.036, 0, .12), (.03, 0, L * .55), (0, 0, L), (-.03, 0, L * .55), (-.036, 0, .12))]
        p.add(K.slab(pts, R @ Vector((1, 0, 0)), (0, 0, 1), t, .012), 'blade')
    return p


def parts():
    return [lance(), energy()]
