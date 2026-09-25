"""Gloved hands in their bone frames (wrist at the origin, fingers down -Z,
thumb on the front (-y) side). The left hand hangs relaxed with a slight curl;
the right hand is a closed grip around the energy blade's hilt, whose axis runs
along y through the fist (rig.BLADE). The palm faces the body: -x on the left
hand, +x on the right. Fingers are chamfered phalanx links with knuckle pins;
the back of the hand carries a gloss knuckle guard."""
import math
from mathutils import Vector
from f1b import kit as K
from . import kit as S
from . import rig

PALM_T = 0.056      # palm thickness (x)
PALM_W = 0.125      # across the knuckles (y)
PALM_TOP, PALM_BOT = -0.025, -0.148
FINGER_Y = (-0.043, -0.0145, 0.0145, 0.043)
FINGER_W = (0.025, 0.026, 0.025, 0.022)
FINGER_L = ((0.046, 0.036, 0.029), (0.05, 0.039, 0.031), (0.048, 0.037, 0.03), (0.04, 0.03, 0.025))
FINGER_T = 0.023

# the grip: finger centrelines run on a circle around the hilt (right hand, +x palm)
HILT = Vector((rig.BLADE[1][0], 0.0, rig.BLADE[1][2]))
HILT_R = 0.022


def _link(p0, p1, w, t, palm_sign):
    """One phalanx from p0 to p1 (XZ plane), width w along y, thickness t."""
    z = (p1 - p0).normalized()
    x = Vector((0, 1, 0)).cross(z).normalized()
    M = K.frame_from(p0, x, Vector((0, 1, 0)))
    L = (p1 - p0).length
    sec = K.chamfer_rect(t, w, t * 0.28)
    return K.bevel_prism(sec, 0.0, L, min(0.006, t * 0.25), 2, M=M)


def _finger(points, y, w, palm_sign, out):
    pts = [Vector((p.x, y, p.z)) for p in points]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        d = (b - a).normalized()
        gap = 0.004
        out.append((_link(a + d * gap, b - d * (gap if i < len(pts) - 2 else 0.0), w, FINGER_T * (1 - 0.08 * i), palm_sign), 'polymer'))
        out.append((S.cyl(a, 0.0105 - 0.001 * i, w * 0.92, 'Y', 14), 'mech'))
    # finger pad on the palm side of the last link
    return out


def _chain(root, angles, lengths, palm_sign):
    p = Vector(root)
    pts = [p.copy()]
    ang = 0.0
    for a, L in zip(angles, lengths):
        ang += math.radians(a)
        d = Vector((palm_sign * math.sin(ang), 0.0, -math.cos(ang)))
        p = p + d * L
        pts.append(p.copy())
    return pts


def _palm(palm_sign):
    out = []
    sec = K.chamfer_rect(PALM_T, PALM_W, 0.014)
    st = [(PALM_TOP, S.offset_poly(K.ccw(sec), -0.012)), (PALM_TOP + 0.03, sec), (PALM_BOT + 0.01, sec), (PALM_BOT, S.offset_poly(K.ccw(sec), -0.006))]
    palm = S.loft(st, cap=0.006)
    out.append((palm, 'polymer'))
    pb = S.bvh_of(palm)
    # palm pad and back-of-hand knuckle guard
    fp = S.tangent_frame((palm_sign * PALM_T / 2, 0.0, -0.09), (palm_sign, 0.0, 0.0))
    out.append((S.conform_plate(pb, fp, S.fillet_poly(S.ccw([(-0.05, -0.05), (0.05, -0.05), (0.05, 0.04), (-0.05, 0.04)]), 0.012, 2), 0.006, rings=2), 'rubber'))
    fb = S.tangent_frame((-palm_sign * PALM_T / 2, 0.0, -0.1), (-palm_sign, 0.0, 0.0))
    guard = S.fillet_poly(S.ccw([(-0.058, -0.045), (0.058, -0.045), (0.05, 0.05), (-0.05, 0.05)]), 0.012, 2)
    out.append((S.conform_plate(pb, fb, guard, 0.012, rings=3), 'shell'))
    for y in FINGER_Y:
        out.append((S.hex_bolt(Vector((-palm_sign * (PALM_T / 2 + 0.011), y, -0.132)), (-palm_sign, 0, 0), r=0.0065, h=0.005), 'steel'))
    # wrist: ball joint and cuff
    out.append((S.ball((0, 0, 0), 0.038, 13, 6), 'mech'))
    cuff = S.squircle(0.075, 0.1, 3.0, 20)
    out.append((S.loft([(-0.045, S.offset_poly(cuff, -0.006)), (-0.035, cuff), (-0.012, S.offset_poly(cuff, -0.012))], cap=0.0), 'polymer'))
    return out


def _thumb(pts, out):
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        d = (b - a).normalized()
        z = d
        up = Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))
        x = up.cross(z).normalized()
        M = K.frame_from(a + d * 0.004, x, z.cross(x))
        L = (b - a).length - 0.008
        out.append((K.bevel_prism(K.chamfer_rect(0.026, 0.026, 0.007), 0.0, L, 0.005, 2, M=M), 'polymer'))
        out.append((S.ball(a, 0.013, 12, 6), 'mech'))
    return out


def hand_left():
    """Relaxed left hand (palm -x)."""
    out = _palm(-1)
    for y, w, L, k in zip(FINGER_Y, FINGER_W, FINGER_L, range(4)):
        pts = _chain((0.0, 0.0, PALM_BOT + 0.002), (12 + 3 * k, 26, 18), L, -1)
        _finger(pts, y, w, -1, out)
    _thumb([Vector((-0.02, -0.062, -0.05)), Vector((-0.042, -0.085, -0.085)), Vector((-0.05, -0.092, -0.125)), Vector((-0.052, -0.088, -0.155))], out)
    return out


def hand_right_grip():
    """Right fist closed around the hilt (palm +x)."""
    out = _palm(1)
    rc = HILT_R + FINGER_T / 2 + 0.0015
    root = Vector((0.0, 0.0, PALM_BOT + 0.004))
    rel = root - HILT
    phi0 = math.atan2(rel.z, rel.x)
    rc = rel.length
    for y, w, k in zip(FINGER_Y, FINGER_W, range(4)):
        # joints spaced around the hilt: knuckle, then two links under and up the far side
        angs = [phi0, phi0 + math.radians(84), phi0 + math.radians(168), phi0 + math.radians(232 - 6 * k)]
        pts = [Vector((HILT.x + rc * math.cos(a), 0.0, HILT.z + rc * math.sin(a))) for a in angs]
        pts[0] = root
        _finger(pts, y, w, 1, out)
    _thumb([Vector((0.022, -0.062, -0.052)), Vector((0.052, -0.08, -0.098)), Vector((0.082, -0.07, -0.142)), Vector((0.09, -0.042, -0.16))], out)
    return out
