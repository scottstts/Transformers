"""Legs and wheel feet, authored for the left side and mirrored for the right.

Thigh: a heavy two-band pearl shell over a dark core, black rear armour, a
silver outer plate and clevis cheeks carrying the knee pin. Shin: the knee drum
it pivots on, a pointed knee guard layered in front of the thigh's hem, a
calf-bulged two-band shell with a black front recess and red light. Foot: the
ankle drum, a keel housing between the paired tyres and pearl fenders arched
over them. Wheel: two tyres on one axle, black dished rims with red rings.
"""
import math
from mathutils import Vector, Matrix
from . import kit as K, rig

# z, w, d, cf, cb, yc, keel, bulge
THIGH_ST = [
    (-.12, .62, .56, .3, .45, -.01, .05, .02),
    (-.42, .64, .6, .3, .45, -.02, .07, .04),
    (-.82, .5, .52, .3, .45, -.03, .06, .02),
    (-1.22, .38, .42, .3, .5, -.02, .03, .00),
]
# knee guard: a V prow in front of the knee, pointed at the top
KNEE_ST = [
    (.22, .04, .05, .9, .3, -.33, .02, 0),
    (.1, .24, .1, .9, .3, -.33, .07, 0),
    (-.06, .42, .12, .9, .3, -.32, .09, 0),
    (-.22, .46, .12, .9, .3, -.3, .08, 0),
    (-.32, .42, .1, .9, .3, -.29, .06, 0),
]
SHIN_ST = [
    (-.18, .50, .52, .55, .5, .00, .04, .00),
    (-.44, .64, .64, .55, .45, .04, .06, .04),
    (-.82, .56, .56, .55, .5, .03, .05, .03),
    (-1.14, .44, .46, .55, .5, .01, .03, .00),
    (-1.32, .46, .48, .5, .5, .00, .02, .00),
]


def thigh(side):
    p = K.Part('thigh.' + side, 'thigh.' + side, bevel=.012)
    m = side == 'R'
    shells, core = K.bands(THIGH_ST, [-.12, -.92, -1.22], gap=.024, core=.035)

    def shape(v):
        # the hip line rises toward the outer flank; the hem drops to a V point over the knee
        v.z += .16 * v.x * max(0.0, min(1.0, (v.z + .4) / .28))
        v.z -= .16 * max(0.0, -v.y / .3) * max(0.0, 1 - abs(v.x) / .3) * max(0.0, min(1.0, (-.6 - v.z) / .3))
        return v
    # bands come bottom-up; the knee band sits inside the hem as a dark mechanism
    shells = [K.loft(K.sec_stations(THIGH_ST, -.935, -1.22, 4, grow=-.04), .012), K.warp(shells[1], shape)]
    p.add(shells[1], 'ceramic', m, True)
    p.add(shells[0], 'obsidian', m, True)
    p.add(core, 'structure', m, True)
    p.add(K.ball((0, 0, 0), .2, 20, 10), 'structure', m)
    p.add(K.loft([(-.05, K.squircle(.3, .3, 3, 20)), (-1.3, K.squircle(.26, .26, 3, 20))], .02), 'structure', m)
    bvh = K.bvh_of(*shells)
    # black rear armour wrapping the back of both bands
    fb = K.tangent_frame((0, .3, -.66), (0, 1, 0))
    rear = K.conform_plate(bvh, fb, K.fillet_poly(K.ccw([(-.2, -.5), (.2, -.5), (.24, .4), (-.22, .44)]), .05), .03, rings=2)
    p.add(rear, 'obsidian', m)
    # black inner flank (the reference shows dark mechanism between the legs)
    fi = K.tangent_frame((-.3, 0, -.6), (-1, 0, 0))
    p.add(K.conform_plate(bvh, fi, K.fillet_poly(K.ccw([(-.2, -.42), (.22, -.4), (.2, .36), (-.2, .4)]), .05), .03, rings=2), 'obsidian', m)
    # silver outer plate with bolts and a red slit
    fo = K.tangent_frame((.32, -.02, -.42), (1, -.1, 0))
    outer = K.conform_plate(bvh, fo, K.fillet_poly(K.ccw([(-.17, -.22), (.12, -.24), (.16, .18), (-.14, .2)]), .03), .03, rings=2)
    p.add(outer, 'silver', m)
    ob = K.bvh_of(outer)
    for bolt in K.bolts(ob, fo, [(-.12, -.17), (.09, -.19), (.11, .14), (-.1, .15)]):
        p.add(bolt, 'steel', m)
    p.add(K.conform_plate(ob, fo, [(-.015, -.12), (.015, -.12), (.015, .1), (-.015, .1)], .012, bevel=.004, rings=1), 'glow', m)
    # front: layered pearl plate on the upper band with a black diamond inset and a light
    ff = K.tangent_frame((.16, -.34, -.34), (.3, -1, 0))
    front = K.conform_plate(bvh, ff, K.fillet_poly(K.ccw([(-.08, -.16), (.1, -.18), (.11, .14), (0, .18), (-.08, .12)]), .02), .025, rings=2)
    p.add(front, 'ceramic', m)
    fr = K.bvh_of(front)
    dia = [(.01, -.08), (.05, 0), (.01, .07), (-.03, 0)]
    p.add(K.conform_plate(fr, ff, dia, .012, rings=1), 'obsidian', m)
    p.add(K.conform_plate(fr, ff, [(.01, -.04), (.025, 0), (.01, .035), (-.005, 0)], .02, bevel=.004, rings=1), 'glow', m)
    # black keel strip running down into the hem's point, with a red line
    p.add(K.keel_strip(THIGH_ST, -.5, -.9, lambda t: .12 * (1 - .7 * t), .02, .08), 'obsidian', m, True)
    p.add(K.keel_strip(THIGH_ST, -.56, -.84, lambda t: .03 * (1 - .6 * t), .032, .08), 'glow', m)
    # knee clevis: cheeks from the hem down around the knee pin
    for x0, x1 in ((.2, .25), (-.25, -.2)):
        p.add(K.cheek(x0, x1, -1.16, -rig.THIGH, .17), 'structure', m)
    return p


def shin(side):
    p = K.Part('shin.' + side, 'shin.' + side, bevel=.012)
    m = side == 'R'
    p.add(K.drum((0, 0, 0), .2, .38, 'X', 28), 'structure', m)
    p.add(K.cyl((0, 0, 0), .07, .52, 'X', 20), 'steel', m)
    for x in (.262, -.262):
        p.add(K.ring((x, 0, 0), .1, .06, .02, 'X', 24), 'crimson', m)
    # knee guard: pointed pearl cap in front of the knee, with a black keel and red eye
    cap = K.loft(K.sec_stations(KNEE_ST, -.32, .22, 7), .012, 1)
    p.add(cap, 'ceramic', m, True)
    p.add(K.keel_strip(KNEE_ST, -.26, .1, lambda t: .05 * (1 - .8 * t), .012, .05), 'glow', m)
    # shell
    shells, core = K.bands(SHIN_ST, [-.18, -1.32], gap=.024, core=.035)
    for b in shells:
        p.add(b, 'ceramic', m, True)
    p.add(core, 'structure', m, True)
    p.add(K.loft([(-.1, K.squircle(.26, .26, 3, 20)), (-1.44, K.squircle(.2, .22, 3, 20))], .02), 'structure', m)
    bvh = K.bvh_of(*shells)
    # front recess with a light strip (the reference's red shin lamp)
    p.add(K.keel_strip(SHIN_ST, -.34, -.9, lambda t: .2 * (1 - .75 * t), .014, .08), 'obsidian', m, True)
    p.add(K.keel_strip(SHIN_ST, -.4, -.78, lambda t: .04 * (1 - .6 * t), .028, .08), 'glow', m)
    # outer silver plate, rear black calf plate and pistons
    fo = K.tangent_frame((.3, 0, -.95), (1, 0, 0))
    outer = K.conform_plate(bvh, fo, K.fillet_poly(K.ccw([(-.16, -.2), (.16, -.18), (.12, .22), (-.14, .2)]), .03), .025, rings=2)
    p.add(outer, 'silver', m)
    for b in K.bolts(K.bvh_of(outer), fo, [(-.11, -.14), (.11, -.13), (.08, .16), (-.1, .15)]):
        p.add(b, 'steel', m)
    fb = K.tangent_frame((0, .34, -.5), (0, 1, 0))
    p.add(K.conform_plate(bvh, fb, K.fillet_poly(K.ccw([(-.18, -.26), (.18, -.26), (.2, .26), (-.2, .26)]), .04), .03, rings=2), 'obsidian', m)
    fl = K.tangent_frame((0, .28, -1.05), (0, 1, 0))
    p.add(K.conform_plate(bvh, fl, [(-.012, -.14), (.012, -.14), (.012, .14), (-.012, .14)], .012, bevel=.004, rings=1), 'glow', m)
    # ankle yoke: cheeks from the hem down around the ankle pin
    for x0, x1 in ((.17, .22), (-.22, -.17)):
        p.add(K.cheek(x0, x1, -1.26, -rig.SHIN, .15), 'structure', m)
    return p


FENDER_R0, FENDER_R1 = .52, .6


def foot(side):
    p = K.Part('foot.' + side, 'foot.' + side, bevel=.01)
    m = side == 'R'
    A = -rig.ANKLE_UP
    p.add(K.drum((0, 0, 0), .15, .34, 'X', 24), 'structure', m)
    p.add(K.cyl((0, 0, 0), .06, .46, 'X', 16), 'steel', m)
    # keel housing between the tyres: from the ankle down around the axle bearing
    prof = K.fillet_poly(K.ccw([(-.2, .06), (.16, .1), (.3, -.1), (.26, A - .12), (.05, A - .2), (-.2, A - .14),
                                 (-.38, A + .02), (-.34, -.1)]), .05)
    house = K.side_prism(prof, -.095, .095, .015)
    p.add(house, 'ceramic', m)
    hb = K.bvh_of(house)
    for s in (1, -1):
        fs = K.tangent_frame((s * .095, -.05, A + .14), (s, 0, 0), up=(0, 0, 1))
        p.add(K.conform_plate(hb, fs, K.fillet_poly(K.ccw([(-.16, -.14), (.16, -.12), (.14, .16), (-.18, .12)]), .03), .012, rings=1), 'obsidian', m)
        p.add(K.drum((s * .095, 0, A), .1, .02, 'X', 20), 'structure', m)
    fn = K.tangent_frame((0, -.3, A + .1), (0, -1, .3))
    p.add(K.conform_plate(hb, fn, [(-.02, -.1), (.02, -.1), (.02, .12), (-.02, .12)], .012, bevel=.004, rings=1), 'glow', m)
    # fenders arched over each tyre, carried by the housing's flanks
    for s in (1, -1):
        xo = rig.WHEEL_X + rig.WHEEL_W / 2 + .03
        x0, x1 = (.085, xo) if s > 0 else (-xo, -.085)
        fender = K.arc_band(x0, x1, (0, A), FENDER_R0, FENDER_R1, -16, 138, 24, .02)
        p.add(fender, 'ceramic', m)
        t0, t1 = (x1 - .012, x1 + .016) if s > 0 else (x0 - .016, x0 + .012)
        p.add(K.arc_band(t0, t1, (0, A), FENDER_R0 - .025, FENDER_R1 + .012, -12, 134, 24, .008), 'silver', m)
        for a in (5, 45, 85, 125):
            r = (FENDER_R0 + FENDER_R1) / 2
            c = Vector(((x0 + x1) / 2, -r * math.cos(math.radians(a)), A + r * math.sin(math.radians(a))))
            n = Vector((0, -math.cos(math.radians(a)), math.sin(math.radians(a))))
            p.add(K.hex_bolt(c + n * (FENDER_R1 - r) + Vector((s * .06, 0, 0)), n, .014, .012), 'steel', m)
    return p


def _tyre():
    R, h = rig.WHEEL_R, rig.WHEEL_W / 2
    g = .012
    prof = [(.31, -h + .012), (.33, -h), (R - .06, -h), (R - .02, -h + .018), (R, -h + .05),
            (R, -.045), (R - g, -.04), (R - g, -.024), (R, -.019), (R, .019), (R - g, .024), (R - g, .04), (R, .045),
            (R, h - .05), (R - .02, h - .018), (R - .06, h), (.33, h), (.31, h - .012)]
    return K.revolve(prof + [prof[0]], 48, 'X')


def _rim(s):
    """Dished black rim with a red ring on its outer face (sign s)."""
    h = rig.WHEEL_W / 2
    out = []
    prof = [(.315, -h + .004), (.30, -h - .006), (.2, -h + .02), (.13, -h + .02), (.12, -h - .004), (.0, -h - .004)]
    prof += [(.0, h + .004), (.12, h + .004), (.13, h - .02), (.2, h - .02), (.30, h + .006), (.315, h - .004)]
    out.append((K.revolve(prof, 40, 'X'), 'obsidian'))
    out.append((K.ring((s * (h - .002), 0, 0), .292, .262, .016, 'X', 48), 'glow'))
    out.append((K.cyl((s * (h - .004), 0, 0), .105, .03, 'X', 24), 'silver'))
    for k in range(6):
        a = math.tau * k / 6
        out.append((K.hex_bolt((s * (h + .01), .072 * math.cos(a), .072 * math.sin(a)), (s, 0, 0), .012, .01), 'steel'))
    return out


def wheels(side):
    p = K.Part('wheels.' + side, 'wheel.' + side, bevel=0)
    m = side == 'R'
    p.add(K.cyl((0, 0, 0), .05, 2 * rig.WHEEL_X + .1, 'X', 20), 'steel', m)
    for s in (1, -1):
        T = Matrix.Translation(Vector((s * rig.WHEEL_X, 0, 0)))
        p.add(K.transform(_tyre(), T), 'rubber', m)
        for mesh, slot in _rim(s):
            p.add(K.transform(mesh, T), slot, m)
    return p


def parts():
    out = []
    for side in ('L', 'R'):
        out += [thigh(side), shin(side), foot(side), wheels(side)]
    return out
