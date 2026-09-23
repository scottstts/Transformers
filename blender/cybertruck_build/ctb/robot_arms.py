"""Arm endoskeleton: upper arm, forearm sleeve, hand and fingers (bone-local rest
coordinates, L side authored, R mirrored).

Datums shared with the car slices: rear-pod liner wall at upper-arm x = 0.20,
rear-door skin at forearm x = 0.25 (inner face 0.222), roof glass back face at
forearm f = 0.245. The hand retracts 0.40 into the forearm sleeve at the fold.
"""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, linkage
from .kit import V
from .rkit import Part
from .robot_legs import cheeks, axle_caps

ELBOW_R, ELBOW_W = 0.12, 0.19
ELBOW_CHEEK_IN = 0.115
SLEEVE_W, SLEEVE_D = 0.25, 0.29         # forearm cavity for the retracting wrist, palm and tucked thumb
WRIST_W, WRIST_D = 0.19, 0.25
ARM_MOUNT_X = 0.185     # rear-door cassette seats on these pads
ROOF_RAIL = (0.17, 0.30)   # raised deck rail on the forearm front (f): carries the roof lifters
POD_LIFT_TOP = 0.1995   # rear-pod carriage pad (linkage 'podlift') at rest: flush under the liner


def ball(r):
    return kit.revolve([(0.0, -r)] + [(r * math.sin(math.pi * k / 12), -r * math.cos(math.pi * k / 12)) for k in range(1, 12)] + [(0.0, r)], 28)


def upperarm():
    p = Part('R.upperarm.frame')
    p.add(rkit.frame([
        (-0.12, 0.22, 0.24, 0.05, 0.0),
        (-0.28, 0.32, 0.34, 0.08, 0.0),
        (-0.78, 0.30, 0.32, 0.07, 0.0),
        (-0.93, 0.24, 0.28, 0.06, 0.0),
    ], cap=0.02), 'graphite', cuts=linkage.bores_for('upperarm'))
    p.add(rkit.plate_f([(-0.11, -0.30), (0.11, -0.30), (0.10, -0.78), (0.0, -0.84), (-0.10, -0.78)], 0.15, 0.185, 0.008), 'mech')
    p.many(cheeks(-rig.UPPER, -0.90, 0.13, 0.14, ELBOW_CHEEK_IN, 0.04), 'graphite')
    p.many(axle_caps(-rig.UPPER, ELBOW_CHEEK_IN + 0.04, 0.06), 'darkSteel')
    # hydraulic line laid on the flat back face (the frame's back is at f = -0.16 at mid-length)
    p.add(rkit.hose([(-0.05, -0.135, -0.14), (-0.06, -0.172, -0.34), (-0.06, -0.172, -0.72), (-0.05, -0.15, -0.88)], 0.013), 'rubber')
    b = Part('R.upperarm.ball')
    b.add(ball(0.14), 'darkSteel')
    b.add(rkit.cylinder((0, 0, -0.12), 0.09, 0.08, 'z', 24), 'darkSteel')
    return [p, b]


def forearm():
    p = Part('R.forearm.sleeve')
    body = rkit.frame([
        # narrower than the elbow cheek gap inside their swing radius
        (-0.06, 0.20, 0.26, 0.05, 0.0),
        (-0.15, 0.21, 0.30, 0.05, 0.0),
        (-0.30, 0.32, 0.38, 0.09, 0.0),
        (-0.90, 0.32, 0.36, 0.08, 0.0),
        (-rig.FORE + 0.02, 0.30, 0.34, 0.07, 0.0),
    ], cap=0.015)
    cavity = rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(SLEEVE_W, SLEEVE_D, 0.03)], -rig.FORE - 0.1, -0.22, 0.0)
    p.add(body, 'graphite', cuts=[cavity] + linkage.bores_for('forearm'))
    # mouth ring of the sleeve
    ring_out = [(x, f) for x, f in kit.chamfer_rect(0.34, 0.38, 0.08)]
    ring_in = rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(SLEEVE_W, SLEEVE_D, 0.03)], -rig.FORE - 0.05, -0.9, 0.0)
    p.add(rkit.plate_z(ring_out, -rig.FORE + 0.005, -rig.FORE + 0.055, 0.008), 'darkSteel', cuts=[ring_in])
    # deck rail on the forearm front: the roof glass seats on its lifter pads; the rail is deep enough
    # for the lifter bores to stop short of the hand sleeve
    # inboard half only: in the truck the rear side glass lies over the outboard half
    rail = [(-0.135, -0.26), (-0.005, -0.26), (-0.005, -0.98), (-0.07, -1.01), (-0.135, -0.98)]
    p.add(rkit.plate_f(rail, *ROOF_RAIL, 0.01), 'graphite',
          cuts=linkage.pockets_for('forearm', ('rooflift.elbow', 'rooflift.wrist')) + linkage.bores_for('forearm'))
    d = Part('R.forearm.elbow')
    d.add(rkit.drum((0, 0, 0), ELBOW_R, ELBOW_W, 'x'), 'darkSteel')
    return [p, d]


def phalanx(length, w, t, knuckle=True, knuckle_axis='f'):
    """One finger segment hanging down its bone (-z), knuckle axis along f. The
    knuckle barrel fills the joint; the segment body stops 4 mm short of the next
    segment's barrel so curling never drives one segment through another."""
    rk = t * 0.48
    # sections: x = thickness t (curl direction), f = width w (finger pitch direction)
    m = [rkit.frame([(-(rk * 0.4), t * 0.86, w * 0.88, 0.012, 0.0), (-length * 0.5, t, w, 0.014, 0.0),
                     (-(length - rk - 0.004), t * 0.9, w * 0.9, 0.012, 0.0)], cap=0.006, seg=1)]
    if knuckle:
        m.append(rkit.cylinder((0, 0, 0), rk, w * 0.98, knuckle_axis, 16, 0.004))
    return m


def hand(s):
    parts = []
    wz = rig.SHOULDER_Z - rig.UPPER - rig.FORE
    p = Part('R.hand.palm')
    # wrist block rides in the forearm sleeve; wrist ball below it
    p.add(rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(WRIST_W - 0.012, WRIST_D - 0.012, 0.028)], 0.04, 0.34, 0.008), 'mech')
    p.add(ball(0.075), 'darkSteel')
    # palm: faceted block, palm faces -x (inward)
    p.add(rkit.frame([(-0.05, 0.11, 0.20, 0.03, 0.0), (-0.16, 0.12, 0.24, 0.035, 0.0), (-0.33, 0.115, 0.24, 0.03, 0.0)], cap=0.012), 'graphite')
    # back-of-hand armour and knuckle guard (inside the sleeve envelope when retracted)
    p.add(rkit.plate_x([(-0.11, -0.08), (0.11, -0.08), (0.118, -0.30), (0.0, -0.35), (-0.118, -0.30)], 0.058, 0.08, 0.006), 'steel')
    p.add(rkit.plate_x([(-0.122, -0.305), (0.122, -0.305), (0.122, -0.352), (-0.122, -0.352)], 0.035, 0.074, 0.006), 'darkSteel')
    parts.append(('hand', [p]))
    for i, fn in enumerate(rig.FINGERS):
        for k in range(3):
            q = Part('R.%s%d.seg' % (fn, k + 1))
            q.many(phalanx(rig.PHAL[k], 0.056, 0.064 - 0.004 * k, True), 'graphite' if k else 'darkSteel')
            parts.append(('%s%d' % (fn, k + 1), [q]))
    # thumb segments point along their joint chain
    sk = rig.Skeleton()
    chain = ['thumb1.L', 'thumb2.L', 'thumb3.L']
    for k, L in enumerate((0.13, 0.11, 0.09)):
        q = Part('R.thumb%d.seg' % (k + 1))
        a = sk.head[chain[k]]
        b = sk.head[chain[k + 1]] if k < 2 else a + (a - sk.head[chain[k - 1]]).normalized() * L
        L = (b - a).length if k < 2 else L
        d = (b - a).normalized()
        R = Vector((0, 0, -1)).rotation_difference(d).to_matrix().to_4x4()
        for m in phalanx(L, 0.056, 0.062, True, 'x'):
            q.add(kit.transform(m, R), 'graphite' if k else 'darkSteel')
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
                objs.append(part.build(coll, 0.004 if bone not in ('upperarm', 'forearm') else 0.005, 2, 30))
            out['%s.%s' % (bone, S)] = objs
    return out
