"""Black gauntlet hands in their bone frames: wrist at the origin, fingers down
-Z, index finger and thumb on the front (-y) side, the palm facing the body
(-x on the left hand, +x on the right).

Each finger is three chamfered phalanx links with knuckle pins; the back of
the hand carries a gloss knuckle guard. The left hand hangs relaxed with a
soft curl. The right hand is a closed fist around the lance: each finger's
joints lie on a circle about the lance axis (rig.grip_axis through rig.GRIP),
starting at its knuckle and wrapping under and up the far side, with the
thumb closing over them from the front.
"""
import math
from mathutils import Vector
from . import kit as K, rig

LINKS = tuple(L * rig.HAND for L in (.11, .085, .065))


def _link(a, b, wdir, w, t, taper=1.0):
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    x = (Vector(wdir) - d * Vector(wdir).dot(d)).normalized()
    gap = .006
    L = (b - a).length - 2 * gap
    sec = K.chamfer_rect(w, t, t * .28)
    st = [(0, sec), (L * .8, sec), (L, K.chamfer_rect(w * taper, t * taper, t * taper * .28))]
    return K.loft(st, min(.008, t * .2), 1, K.frame_from(a + d * gap, x, d.cross(x)))


def _finger(p, pts, wdir, w, t):
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        last = i == len(pts) - 2
        p.add(_link(a, b, wdir, w * (1 - .06 * i), t * (1 - .08 * i), .72 if last else 1.0), 'obsidian')
        # knuckle pin across the joint
        p.add(K.revolve([(0, -w * .43), (t * .38, -w * .43), (t * .44, -w * .38), (t * .44, w * .38), (t * .38, w * .43), (0, w * .43)],
                        12, 'Z', K.axis_frame(Vector(a), Vector(a) + Vector(wdir))), 'steel' if i == 0 else 'structure')


def _palm(p, ps):
    """Palm block, back-of-hand guard and wrist ball; ps = palm side (+1 = +x)."""
    st = [(rig.PALM_TOP + .02, K.chamfer_rect(rig.PALM_T * .8, rig.PALM_W * .7, .02)),
          (rig.PALM_TOP - .04, K.chamfer_rect(rig.PALM_T, rig.PALM_W * .92, .025)),
          (rig.KNUCKLE + .02, K.chamfer_rect(rig.PALM_T, rig.PALM_W, .025)),
          (rig.KNUCKLE - .01, K.chamfer_rect(rig.PALM_T * .9, rig.PALM_W * .96, .02))]
    palm = K.loft(st, .012, 1)
    p.add(palm, 'structure', False, True)
    pb = K.bvh_of(palm)
    back = K.tangent_frame((-ps * rig.PALM_T / 2, 0, -.19), (-ps, 0, 0))
    guard = K.conform_plate(pb, back, K.fillet_poly(K.ccw([(-.12, -.1), (.12, -.1), (.13, .09), (-.13, .09)]), .02, 1), .03, rings=2)
    p.add(guard, 'obsidian')
    gb = K.bvh_of(guard)
    p.add(K.conform_plate(gb, back, [(-.09, -.012), (.09, -.012), (.09, .012), (-.09, .012)], .01, bevel=.003, rings=1), 'glow')
    for b in K.bolts(gb, back, [(-.09, .06), (.09, .06), (-.09, -.07), (.09, -.07)], r=.011):
        p.add(b, 'steel')
    p.add(K.ball((0, 0, 0), .085, 16, 8), 'structure')
    p.add(K.ring((0, 0, -.06), .1, .06, .04, 'Z', 24), 'steel')


def _thumb(p, pts):
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        p.add(K.rod(a, b, .034 - i * .003, 10, .008), 'obsidian')
        p.add(K.ball(a, .038 - i * .003, 12, 6), 'structure')


def hand_left():
    p = K.Part('hand.L', 'hand.L', bevel=0)
    _palm(p, -1)
    for k, (y, w) in enumerate(zip(rig.FINGER_Y, rig.FINGER_W)):
        pts, pos, ang = [Vector((0, y, rig.KNUCKLE))], Vector((0, y, rig.KNUCKLE)), 0.0
        for a, L in zip((10 + 3 * k, 24, 18), LINKS):
            ang += math.radians(a)
            pos = pos + Vector((-math.sin(ang), 0, -math.cos(ang))) * L * (1 - .05 * abs(k - 1.2))
            pts.append(pos.copy())
        _finger(p, pts, (0, 1, 0), w, rig.FINGER_T)
    _thumb(p, [Vector(v) * rig.HAND for v in ((-.03, -.12, -.12), (-.07, -.17, -.2), (-.1, -.18, -.28), (-.11, -.16, -.34))])
    return p


def hand_right():
    """Fist closed round the lance axis (palm +x)."""
    p = K.Part('hand.R', 'hand.R', bevel=0)
    _palm(p, 1)
    A, G = rig.grip_axis(), rig.GRIP
    rho0 = rig.SHAFT_R + rig.FINGER_T / 2 + .007
    for k, (y, w) in enumerate(zip(rig.FINGER_Y, rig.FINGER_W)):
        Kn = Vector((0, y, rig.KNUCKLE))
        c = G + A * (Kn - G).dot(A)
        e1 = (Kn - c)
        rk = e1.length
        e1.normalize()
        e2 = A.cross(e1)
        if e2.z > 0:
            e2 = -e2
        pts = [Kn]
        for phi, tip in ((95, 0), (185, 0), (262 - 6 * k, 1)):
            r = rho0 + (rk - rho0) * (0.35 if phi == 95 else 0.0)
            a = math.radians(phi)
            pts.append(c + (e1 * math.cos(a) + e2 * math.sin(a)) * r)
        _finger(p, pts, A, w, rig.FINGER_T)
    # thumb: from the palm's front edge over the index and middle fingers
    top = rig.FINGER_Y[0] - rig.FINGER_W[0] * .9
    c = G + A * (Vector((0, top, rig.KNUCKLE)) - G).dot(A)
    e1 = (Vector((0, top, rig.KNUCKLE)) - c).normalized()
    e2 = A.cross(e1)
    if e2.z > 0:
        e2 = -e2
    r = rho0 + .015
    ring = [c + (e1 * math.cos(math.radians(a)) + e2 * math.sin(math.radians(a))) * r + A * .02 for a in (205, 255, 300)]
    _thumb(p, [Vector(v) * rig.HAND for v in ((.03, -.12, -.12), (.08, -.16, -.2))] + ring)
    return p


def parts():
    return [hand_left(), hand_right()]
