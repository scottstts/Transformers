"""Chest, waist, pelvis and neck (bone-local; see rig.py).

The chest is a gloss-black faceted core flaring from a narrow waist to a broad
ribcage. Pearl pectoral plates sweep from the collar out to the shoulders and
down into a V that frames the red crystal in its black diamond socket. Below
it black chevron plates run to the waist. The flanks carry angular pearl plates; the back carries pearl shoulder-blade plates either side of a black spine with a
red light. A black collar rises round the neck with two pointed flaps. The
waist is a stack of dark bellows rings behind gloss-black abdominal plates.
The pelvis carries a silver belt, the long pearl V fauld, hip housings and a
rear plate.
"""
import math
from mathutils import Vector, Matrix
from . import kit as K, rig

# z, w, d, cf, cb, yc, keel, bulge
CHEST_ST = [
    (0.00, .74, .54, .5, .5, .00, .02, 0),
    (0.24, 1.00, .68, .5, .45, -.01, .05, 0),
    (0.52, 1.30, .78, .5, .45, -.02, .08, 0),
    (0.82, 1.46, .80, .55, .5, -.02, .08, 0),
    (1.02, 1.34, .72, .6, .55, -.01, .05, 0),
    (1.16, .74, .52, .6, .6, .00, .02, 0),
]
SX, SZ = rig.SHOULDER[0], rig.SHOULDER[2]


def _plate(p, bvh, frame, outline, t, slot, rings=2, mirrored=(False, True), **kw):
    """Left-side plate plus its mirror; returns the left plate mesh."""
    mesh = K.conform_plate(bvh, frame, outline, t, rings=rings, **kw)
    for m in mirrored:
        p.add(mesh, slot, m)
    return mesh


def _gem(centre, w, h, depth):
    """Cut red crystal: a diamond girdle, a stepped crown and a table, facing -y."""
    c = Vector(centre)
    girdle = [(0, -h / 2), (w * .3, -h * .22), (w / 2, 0), (w * .3, h * .22), (0, h / 2), (-w * .3, h * .22), (-w / 2, 0), (-w * .3, -h * .22)]
    rings = []
    for s, lift in ((1.0, -.03), (1.0, 0.0), (.62, depth * .7), (.3, depth)):
        rings.append([c + Vector((x * s, -lift, z * s)) for x, z in girdle])
    return K.ring_loft(rings)


def chest():
    p = K.Part('chest', 'chest', bevel=.014, angle=28)
    # smooth core: the armour plates are projected onto it and sink into it
    rings = []
    for k in range(13):
        z = 1.16 * k / 12
        w, d, cf, cb, yc, keel, bulge = K.table_at(CHEST_ST, z)
        rings.append((z, K.squircle(w, d + keel, 2.4, 32, yc=yc - keel / 2)))
    core = K.loft(rings, .03, 2)
    p.add(core, 'obsidian')
    bvh = gb = K.bvh_of(core)
    front = K.tangent_frame((0, -.5, .7), (0, -1, 0))
    # pectoral plates: collar to shoulder, down into the V round the crystal
    pec = [(.16, .38), (.46, .4), (.64, .3), (.7, .04), (.54, -.14), (.28, -.32), (.2, -.16), (.24, .14)]
    pm = _plate(p, gb, front, K.fillet_poly(K.ccw(pec), .025, 1), .075, 'ceramic', rings=3, sink=.05)
    pb = K.bvh_of(pm)
    for m in (False, True):
        # red lamp and fasteners
        p.add(K.conform_plate(pb, front, [(.46, .02), (.58, .1), (.56, .15), (.44, .07)], .014, bevel=.004, rings=1), 'glow', m)
        for b in K.bolts(pb, front, [(.2, .34), (.58, .26), (.48, -.06), (.28, -.2)]):
            p.add(b, 'steel', m)
    # flank plates under the pecs: angular pearl armour with a lamp slit
    fr = K.tangent_frame((.46, -.12, .3), (.8, -.6, 0))
    flank = _plate(p, gb, fr, K.fillet_poly(K.ccw([(-.17, .15), (.18, .2), (.2, -.04), (.06, -.26), (-.15, -.12)]), .02, 1), .055, 'ceramic', rings=2, sink=.05)
    fb = K.bvh_of(flank)
    for m in (False, True):
        p.add(K.conform_plate(fb, fr, [(-.08, .06), (.1, .09), (.1, .065), (-.08, .035)], .012, bevel=.004, rings=1), 'glow', m)
        for b in K.bolts(fb, fr, [(-.12, .1), (.14, .14), (.05, -.18)], r=.013):
            p.add(b, 'steel', m)
    # black chevrons down the sternum with red slits
    for i, z in enumerate((.4, .24, .08)):
        f = K.tangent_frame((0, -.5, z), (0, -1, 0))
        w = .2 - i * .04
        ch = K.conform_plate(bvh, f, [(-w, .05), (0, -.05), (w, .05), (w * .8, .09), (0, .0), (-w * .8, .09)], .03, rings=1)
        p.add(ch, 'structure')
    for m in (False, True):
        p.add(K.conform_plate(bvh, front, [(.04, -.6), (.2, -.4), (.19, -.36), (.03, -.55)], .035, bevel=.008, rings=1), 'glow', m)
    # the crystal: black diamond socket, crimson bezel, cut red gem
    fg = K.tangent_frame((0, -.5, .84), (0, -1, 0))
    sock = K.conform_plate(bvh, fg, [(0, -.3), (.19, 0), (0, .26), (-.19, 0)], .09, bevel=.02, rings=2)
    p.add(sock, 'obsidian')
    sb = K.bvh_of(sock)
    p.add(K.conform_plate(sb, fg, [(0, -.22), (.14, 0), (0, .19), (-.14, 0)], .015, bevel=.005, rings=1), 'crimson')
    tip = K._project(sb, fg[0], fg[3])[0]
    p.add(_gem(tip + Vector((0, -.005, 0)), .22, .36, .07), 'glow')
    # back: pearl shoulder blades, black spine with a red light
    back = K.tangent_frame((0, .5, .7), (0, 1, 0))      # u = -x here
    blade = [(-.12, .42), (-.6, .36), (-.64, -.04), (-.42, -.4), (-.14, -.18)]
    bm = _plate(p, gb, back, K.fillet_poly(K.ccw(blade), .03, 1), .06, 'ceramic', rings=3, sink=.05)
    for m in (False, True):
        for b in K.bolts(K.bvh_of(bm), back, [(-.2, .3), (-.56, .24), (-.44, -.18)]):
            p.add(b, 'steel', m)
        p.add(K.conform_plate(K.bvh_of(bm), back, [(-.3, .1), (-.5, .12), (-.5, .08), (-.3, .06)], .012, bevel=.004, rings=1), 'glow', m)
    spine = K.conform_plate(bvh, back, [(-.09, .5), (.09, .5), (.07, -.34), (0, -.44), (-.07, -.34)], .05, rings=2)
    p.add(spine, 'structure')
    p.add(K.conform_plate(K.bvh_of(spine), back, [(-.018, .4), (.018, .4), (.018, -.3), (-.018, -.3)], .012, bevel=.004, rings=1), 'glow')
    # shoulder sockets: faceted housings out of the chest, their end faces flush
    # with the arm's joint drum across a thin bearing ring
    along_x = K.frame_from(Vector((0, 0, SZ)), (0, 1, 0), (0, 0, 1))
    sock = K.loft([(.44, K.sec(.46, .46, .35, .35)), (.62, K.sec(.48, .48, .35, .35)), (SX - .15, K.sec(.46, .46, .35, .35))], .02, 1, along_x)
    for m in (False, True):
        p.add(sock, 'structure', m, True)
        p.add(K.ring((SX - .14, 0, SZ), .21, .1, .025, 'X', 28), 'steel', m)
    # The open gorget is a separate rigid part, authored in collar.py.
    return p


def waist():
    p = K.Part('waist', 'spine', bevel=.01)
    col = K.squircle(.36, .3, 3, 20)
    p.add(K.loft([(-.1, col), (.36, col)], .02), 'steel')
    for i, (a, b) in enumerate(((-.02, .08), (.1, .2), (.22, .32))):
        r = K.squircle(.7 + i * .04, .5, 3.2, 24)
        p.add(K.loft([(a, K.offset_poly(r, -.02)), (a + .02, r), (b - .02, r), (b, K.offset_poly(r, -.02))], 0), 'structure')
    # gloss-black abdominal plates, overlapping downward
    for i, z in enumerate((.26, .13, .0)):
        w = .3 - i * .03
        st = [(z - .06, K.sec(w * 1.6, .1, .5, .5, -.25 - i * .005, keel=.03)), (z + .07, K.sec(w * 2, .1, .5, .5, -.27, keel=.04))]
        p.add(K.loft(st, .012), 'obsidian', False, True)
    for m in (False, True):
        p.add(K.rod((.3, -.05, -.02), (.34, -.05, .33), .03), 'steel', m)
    return p


def pelvis():
    p = K.Part('pelvis', 'pelvis', bevel=.012)
    core = K.squircle(.84, .6, 3, 24)
    p.add(K.loft([(-.24, K.squircle(.5, .44, 3, 24)), (-.05, core), (.26, core)], .03), 'structure', False, True)
    belt_st = [(.1, K.sec(1.04, .7, .55, .5, keel=.03)), (.3, K.sec(1.0, .68, .55, .5, keel=.03))]
    belt = K.loft(belt_st, .02)
    p.add(belt, 'silver', False, True)
    bb = K.bvh_of(belt)
    front = K.tangent_frame((0, -.4, .2), (0, -1, 0))
    buckle = K.conform_plate(bb, front, [(-.16, -.08), (.16, -.08), (.12, .08), (-.12, .08)], .04, rings=1)
    p.add(buckle, 'obsidian')
    p.add(K.conform_plate(K.bvh_of(buckle), front, [(-.07, -.012), (.07, -.012), (.07, .012), (-.07, .012)], .012, bevel=.004, rings=1), 'glow')
    # the fauld: a long pearl V hanging in front, bent round a guide in front of the thighs
    guide = K.loft([(-1.0, K.squircle(.9, .9, 2.2, 32, yc=.02)), (.3, K.squircle(1.02, .84, 2.2, 32, yc=.02))], 0)
    gb = K.bvh_of(guide)
    fv = K.tangent_frame((0, -.5, -.3), (0, -1, 0))
    fauld = K.conform_plate(gb, fv, [(0, -.56), (.13, -.24), (.3, .3), (.33, .44), (-.33, .44), (-.3, .3), (-.13, -.24)], .06, rings=3)
    p.add(fauld, 'ceramic')
    fb = K.bvh_of(fauld)
    p.add(K.conform_plate(fb, fv, [(0, -.44), (.05, -.2), (.1, .3), (0, .36), (-.1, .3), (-.05, -.2)], .016, rings=1), 'obsidian')
    p.add(K.conform_plate(fb, fv, [(0, -.3), (.02, -.14), (.03, .24), (-.03, .24), (-.02, -.14)], .026, bevel=.006, rings=1), 'glow')
    for m in (False, True):
        p.add(K.conform_plate(fb, fv, [(.2, .2), (.26, .28), (.23, .33), (.17, .25)], .02, bevel=.005, rings=1), 'glow', m)
        for b in K.bolts(fb, fv, [(.25, .38), (.14, -.1)]):
            p.add(b, 'steel', m)
    # hip housings round the thigh balls, side plates and the rear plate
    for m in (False, True):
        p.add(K.drum((.36, 0, 0), .24, .14, 'X', 24), 'structure', m)
        side = K.tangent_frame((.5, 0, .2), (1, 0, 0))
        p.add(K.conform_plate(bb, side, K.fillet_poly(K.ccw([(-.22, -.08), (.22, -.08), (.18, .09), (-.18, .09)]), .02, 1), .03, rings=1), 'obsidian', m)
    back = K.tangent_frame((0, .4, 0), (0, 1, 0))      # u = -x here
    rear = K.conform_plate(gb, back, K.fillet_poly(K.ccw([(-.34, .3), (.34, .3), (.24, -.28), (-.24, -.28)]), .04, 1), .05, rings=2)
    p.add(rear, 'obsidian')
    # rear tassets: pearl points either side of the tail hinges, with a lamp
    tas = K.conform_plate(gb, back, [(-.3, .28), (-.62, .24), (-.6, -.12), (-.46, -.5), (-.3, -.1)], .05, rings=2, sink=.03)
    tb = K.bvh_of(tas)
    for m in (False, True):
        p.add(tas, 'ceramic', m)
        p.add(K.conform_plate(tb, back, [(-.44, .1), (-.5, .1), (-.47, -.26), (-.43, -.2)], .014, bevel=.004, rings=1), 'glow', m)
    return p


def neck():
    from .collar import neck as cervical
    return cervical()


def parts():
    from .collar import collar
    return [chest(), waist(), pelvis(), neck(), collar()]
