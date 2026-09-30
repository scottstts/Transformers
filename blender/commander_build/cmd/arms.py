"""Arms, authored for the left side and mirrored for the right.

Upper arm: the shoulder drum it swings on, a two-band pearl bicep shell and the
elbow clevis. It carries the pauldron: a large angular pearl shell whose top
rises toward the outer edge, ending in a pointed lower corner, over a black
under-layer with red lamps. Forearm: the elbow drum, a flared two-band pearl
gauntlet with a swept fin over the outer elbow, a red strip and a black cuff
at the wrist.
"""
from mathutils import Vector
from . import kit as K, rig

UPPER_ST = [
    (-.24, .38, .40, .5, .45, .00, .02, .00),
    (-.5, .44, .44, .5, .45, -.01, .03, .03),
    (-.82, .40, .40, .5, .5, .00, .02, .02),
]
FORE_ST = [
    (-.12, .38, .40, .5, .45, .01, .02, .02),
    (-.36, .46, .46, .5, .45, .00, .04, .05),
    (-.68, .38, .38, .5, .5, .00, .03, .02),
    (-.84, .32, .32, .5, .5, .00, .02, .00),
]
# pauldron stations along x (outward): x, half depth, top z, bottom z
PAULDRON = [(-.04, .3, .2, -.1), (0.06, .38, .26, -.28), (.3, .4, .38, -.4), (.52, .36, .52, -.52), (.62, .26, .44, -.36)]


def _pauldron_sec(hy, zt, zb):
    return [(-hy, zt * .78), (-hy * .55, zt), (hy * .55, zt), (hy, zt * .78), (hy, zb * .35),
            (hy * .45, zb * .85), (0, zb), (-hy * .45, zb * .85), (-hy, zb * .35)]


def _pst(x0, x1, n, grow=0.0):
    """Pauldron stations sampled along x from the PAULDRON table."""
    table = [(x, hy, zt, zb, 0, 0, 0, 0) for x, hy, zt, zb in PAULDRON]
    out = []
    for k in range(n):
        x = K.lerp(x0, x1, k / (n - 1))
        hy, zt, zb = K.table_at(table, x)[:3]
        out.append((x, K.ccw(_pauldron_sec(hy + grow, zt + grow, zb - grow))))
    return out


def pauldron():
    """Two pearl segments split by a seam over a black core, an inset lamp panel on the flat front face and
    a silver plate on the outer face. Local z of the lofts runs outward (+x)."""
    out = []
    frame = K.frame_from(Vector((0, 0, 0)), (0, 1, 0), (0, 0, 1))
    inner = K.loft(_pst(-.04, .2, 4), .025, 2, frame)
    outer = K.loft(_pst(.235, .66, 5), .03, 2, frame)
    out += [(inner, 'ceramic', True), (outer, 'ceramic', True)]
    out.append((K.loft(_pst(0, .6, 6, -.035), .02, 1, frame), 'obsidian', True))
    ob = K.bvh_of(outer)
    # lamp panel inside the front face's flat facet (x .3..0.5)
    front = K.tangent_frame((.4, -.6, .02), (0, -1, 0))
    panel = K.conform_plate(ob, front, [(-.09, -.14), (.08, -.18), (.09, .16), (-.09, .2)], .02, bevel=.006, rings=1, keep_normal=True)
    out.append((panel, 'obsidian', False))
    pb = K.bvh_of(panel)
    out.append((K.conform_plate(pb, front, [(-.055, .03), (.055, .0), (.055, .035), (-.055, .065)], .012, bevel=.004, rings=1, keep_normal=True), 'glow', False))
    for bolt in K.bolts(ob, front, [(-.07, -.22), (.07, -.25), (.07, .25), (-.07, .27)], r=.014):
        out.append((bolt, 'steel', False))
    # silver plate on the flat outer face
    side = K.tangent_frame((.75, 0, .02), (1, 0, 0))
    plate = K.conform_plate(ob, side, [(-.16, .28), (.16, .28), (.18, -.04), (0, -.2), (-.18, -.04)], .025, rings=1, keep_normal=True)
    out.append((plate, 'silver', False))
    for bolt in K.bolts(K.bvh_of(plate), side, [(-.12, .22), (.12, .22), (.12, -.02), (-.12, -.02)], r=.014):
        out.append((bolt, 'steel', False))
    return out


def upperarm(side):
    p = K.Part('upperarm.' + side, 'upperarm.' + side, bevel=.012)
    m = side == 'R'
    p.add(K.drum((.03, 0, 0), .23, .26, 'X', 28), 'structure', m)
    p.add(K.cyl((.03, 0, 0), .07, .36, 'X', 16), 'steel', m)
    p.add(K.loft([(-.1, K.squircle(.3, .3, 3, 20)), (-.9, K.squircle(.26, .26, 3, 20))], .02), 'structure', m)
    shells, core = K.bands(UPPER_ST, [-.24, -.54, -.84], gap=.022, core=.03)
    for b in shells:
        p.add(b, 'ceramic', m, True)
    p.add(core, 'structure', m, True)
    bvh = K.bvh_of(*shells)
    ff = K.tangent_frame((0, -.22, -.42), (0, -1, 0))
    strip = K.conform_plate(bvh, ff, [(-.04, -.1), (.04, -.1), (.035, .1), (-.035, .1)], .02, rings=1)
    p.add(strip, 'obsidian', m)
    p.add(K.conform_plate(K.bvh_of(strip), ff, [(-.014, -.08), (.014, -.08), (.014, .08), (-.014, .08)], .012, bevel=.004, rings=1), 'glow', m)
    fo = K.tangent_frame((.22, 0, -.64), (1, 0, 0))
    op = K.conform_plate(bvh, fo, K.fillet_poly(K.ccw([(-.13, -.12), (.13, -.12), (.1, .12), (-.1, .12)]), .02, 1), .02, rings=1)
    p.add(op, 'silver', m)
    for b in K.bolts(K.bvh_of(op), fo, [(-.08, -.08), (.08, -.08), (.07, .08), (-.07, .08)], r=.013):
        p.add(b, 'steel', m)
    for x0, x1 in ((.15, .2), (-.2, -.15)):
        p.add(K.cheek(x0, x1, -.8, -rig.UPPER, .14), 'structure', m)
    for mesh, slot, sharp in pauldron():
        p.add(mesh, slot, m, sharp)
    return p


def forearm(side):
    p = K.Part('forearm.' + side, 'forearm.' + side, bevel=.012)
    m = side == 'R'
    p.add(K.drum((0, 0, 0), .17, .29, 'X', 24), 'structure', m)
    p.add(K.cyl((0, 0, 0), .06, .42, 'X', 16), 'steel', m)
    p.add(K.loft([(-.08, K.squircle(.24, .24, 3, 20)), (-.9, K.squircle(.2, .2, 3, 20))], .02), 'structure', m)
    shells, core = K.bands(FORE_ST, [-.12, -.46, -.84], gap=.022, core=.03)
    for b in shells:
        p.add(b, 'ceramic', m, True)
    p.add(core, 'structure', m, True)
    bvh = K.bvh_of(*shells)
    # swept fin over the outer elbow, carried by the upper band
    fin = K.slab([(.24, -.12, -.16), (.25, .16, -.1), (.27, .32, .16), (.25, .12, -.5), (.24, -.08, -.44)], (0, 1, 0), (0, 0, 1), .05)
    p.add(fin, 'ceramic', m, True)
    p.add(K.slab([(.275, .04, -.2), (.28, .16, -.14), (.285, .22, 0), (.28, .08, -.36)], (0, 1, 0), (0, 0, 1), .02), 'glow', m)
    fo = K.tangent_frame((.2, 0, -.66), (1, 0, 0))
    p.add(K.conform_plate(bvh, fo, [(-.02, -.12), (.02, -.12), (.02, .12), (-.02, .12)], .014, bevel=.004, rings=1), 'glow', m)
    ff = K.tangent_frame((0, -.22, -.3), (0, -1, 0))
    plate = K.conform_plate(bvh, ff, K.fillet_poly(K.ccw([(-.07, -.16), (.07, -.16), (.08, .12), (-.08, .12)]), .02, 1), .02, rings=1)
    p.add(plate, 'obsidian', m)
    for b in K.bolts(K.bvh_of(plate), ff, [(-.045, -.12), (.045, -.12), (.05, .08), (-.05, .08)], r=.012):
        p.add(b, 'steel', m)
    p.add(K.ring((0, 0, -.88), .17, .1, .06, 'Z', 28), 'structure', m)
    return p


def parts():
    out = []
    for side in ('L', 'R'):
        out += [upperarm(side), forearm(side)]
    return out
