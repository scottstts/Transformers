"""Arm endoskeleton: upper arm, forearm sleeve, hand and fingers (bone-local
rest coordinates, L side authored, R mirrored).

In the car the arms reach forward through the survival cell (upper arms in
the cockpit sides, forearms in the tub, fists in the nose root), so their
sections stay inside 0.20 x 0.24. The hand retracts 0.08 into the forearm
sleeve; the cavity is sized for the palm and the curled fist.
"""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig
from .kit import V
from .rkit import Part
from .robot_legs import cheeks, axle_caps, ball, actuator

ELBOW_R, ELBOW_W = 0.070, 0.110
ELBOW_CHEEK_IN = 0.059
SLEEVE_W, SLEEVE_D = 0.140, 0.222      # forearm cavity for the retracting wrist block
WRIST_W, WRIST_D = 0.124, 0.206


def upperarm():
    p = Part('R.upperarm.frame')
    p.add(rkit.frame([
        (-0.080, 0.130, 0.140, 0.035, 0.0),
        (-0.170, 0.190, 0.205, 0.050, 0.0),
        (-0.500, 0.190, 0.200, 0.050, 0.0),
        (-0.590, 0.150, 0.170, 0.040, 0.0),
        (-0.622, 0.120, 0.150, 0.032, 0.0),       # ends 12 mm above the elbow drum
    ], cap=0.016), 'carbon')
    p.many(cheeks(-rig.UPPER, -0.620, 0.080, 0.080, ELBOW_CHEEK_IN, 0.030), 'carbon')
    p.many(axle_caps(-rig.UPPER, ELBOW_CHEEK_IN + 0.030, 0.040), 'darkSteel')
    # biceps plate (front) and a painted deltoid cap on the outer face
    p.add(rkit.plate_f([(-0.070, -0.20), (0.070, -0.20), (0.062, -0.50), (0.0, -0.54), (-0.062, -0.50)], 0.100, 0.118, 0.005), 'mech')
    p.add(rkit.plate_x([(-0.080, -0.100), (0.080, -0.100), (0.070, -0.300), (-0.070, -0.300)], 0.095, 0.112, 0.005), 'paint')
    # elbow ram down the back of the arm
    for m, s in actuator((0.0, -0.118, -0.150), (0.0, -0.096, -0.610), 0.022, 0.010, 0.55):
        p.add(m, s)
    b = Part('R.upperarm.ball')
    b.add(ball(0.085), 'darkSteel')
    b.add(rkit.cylinder((0, 0, -0.075), 0.055, 0.050, 'z', 24), 'darkSteel')
    return [p, b]


def forearm():
    p = Part('R.forearm.sleeve')
    body = rkit.frame([
        (-0.050, 0.108, 0.140, 0.030, 0.0),      # narrower than the elbow cheek gap inside their swing radius
        (-0.150, 0.190, 0.230, 0.050, 0.0),
        (-0.560, 0.188, 0.224, 0.050, 0.0),
        (-rig.FORE + 0.012, 0.176, 0.212, 0.046, 0.0),
    ], cap=0.012)
    cavity = rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(SLEEVE_W, SLEEVE_D, 0.024)], -rig.FORE - 0.1, -0.330, 0.0)
    p.add(body, 'carbon', cuts=[cavity])
    ring_in = rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(SLEEVE_W, SLEEVE_D, 0.024)], -rig.FORE - 0.05, -0.5, 0.0)
    p.add(rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(0.200, 0.236, 0.056)], -rig.FORE + 0.004, -rig.FORE + 0.040, 0.006),
          'darkSteel', cuts=[ring_in])
    # knuckle-side ridge and a hose along the ulna
    p.add(rkit.plate_f([(-0.050, -0.20), (0.050, -0.20), (0.046, -0.58), (-0.046, -0.58)], -0.126, -0.110, 0.005), 'mech')
    d = Part('R.forearm.elbow')
    d.add(rkit.drum((0, 0, 0), ELBOW_R, ELBOW_W, 'x', 28), 'darkSteel')
    return [p, d]


def phalanx(length, w, t, knuckle=True, knuckle_axis='f'):
    rk = t * 0.48
    m = [rkit.frame([(-(rk * 0.4), t * 0.86, w * 0.88, 0.009, 0.0), (-length * 0.5, t, w, 0.011, 0.0),
                     (-(length - rk - 0.003), t * 0.9, w * 0.9, 0.009, 0.0)], cap=0.005, seg=1)]
    if knuckle:
        m.append(rkit.cylinder((0, 0, 0), rk, w * 0.98, knuckle_axis, 14, 0.003))
    return m


def hand(s):
    parts = []
    wz = rig.SHOULDER_Z - rig.UPPER - rig.FORE
    p = Part('R.hand.palm')
    p.add(rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(WRIST_W - 0.010, WRIST_D - 0.010, 0.022)], 0.030, 0.300, 0.006), 'mech')
    p.add(ball(0.052), 'darkSteel')
    p.add(rkit.frame([(-0.040, 0.096, 0.160, 0.024, 0.0), (-0.120, 0.106, 0.190, 0.028, 0.0), (-0.190, 0.100, 0.196, 0.026, 0.0)], cap=0.012), 'graphite')
    p.add(rkit.plate_x([(-0.090, -0.050), (0.090, -0.050), (0.098, -0.170), (0.0, -0.194), (-0.098, -0.170)], 0.050, 0.068, 0.005), 'paint')
    parts.append(('hand', [p]))
    for i, fn in enumerate(rig.FINGERS):
        for k in range(3):
            q = Part('R.%s%d.seg' % (fn, k + 1))
            q.many(phalanx(rig.PHAL[k], 0.044, 0.058 - 0.004 * k, True), 'graphite' if k else 'darkSteel')
            parts.append(('%s%d' % (fn, k + 1), [q]))
    sk = rig.Skeleton()
    chain = ['thumb1.L', 'thumb2.L', 'thumb3.L']
    for k, L in enumerate((0.12, 0.10, 0.085)):
        q = Part('R.thumb%d.seg' % (k + 1))
        a = sk.head[chain[k]]
        b = sk.head[chain[k + 1]] if k < 2 else a + (a - sk.head[chain[k - 1]]).normalized() * L
        L = (b - a).length if k < 2 else L
        d = (b - a).normalized()
        R = Vector((0, 0, -1)).rotation_difference(d).to_matrix().to_4x4()
        for m in phalanx(L, 0.054, 0.058, True, 'x'):
            q.add(kit.transform(m, R), 'carbon' if k else 'darkSteel')
        parts.append(('thumb%d' % (k + 1), [q]))
    return parts


def build(coll):
    out = {}
    for S, s in (('L', 1), ('R', -1)):
        groups = [('upperarm', upperarm()), ('forearm', forearm())] + hand(s)
        for bone, parts in groups:
            objs = []
            for part in parts:
                if s < 0:
                    part.b.verts = [Vector((-v.x, v.y, v.z)) for v in part.b.verts]
                    part.b.faces = [list(reversed(f)) for f in part.b.faces]
                part.name = part.name.replace('R.' + bone, 'R.%s.%s' % (bone, S))
                objs.append(part.build(coll, 0.003 if bone not in ('upperarm', 'forearm') else 0.004, 2, 30))
            out['%s.%s' % (bone, S)] = objs
    return out
