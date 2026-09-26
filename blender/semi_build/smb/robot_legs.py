"""Leg endoskeleton and armour (bone-local rest coordinates, L side authored,
R mirrored).

In the truck the legs lie straight back along the frame rails, fronts down:
the thigh under the cab's rear half, the shin carrying the drive tandem
outboard, the foot standing toes-down with its sole as the rear face of the
frame. So the white front armour faces the road in truck mode, and the backs
of the shins carry the rails and fifth-wheel halves (car parts).
"""
import math
from mathutils import Vector
from . import kit, rkit, rig, hardsurf as hs
from .kit import V
from .rkit import Part
from .rcommon import cheeks, axle_caps, ball, ram, build_sided, items

KNEE_R, KNEE_W = 0.285, 0.46
KNEE_CHEEK_IN = 0.245
ANKLE_R, ANKLE_W = 0.225, 0.40
ANKLE_CHEEK_IN = 0.212
HIP_BALL = 0.25
SOLE = -rig.ANKLE_Z
HEEL_F, TOE_TIP_F = -0.42, 0.95
FOOT_HW = 0.37


# -------------------------------------------------------------------- hip
def hip():
    p = Part('R.hip.cup')
    p.add(rkit.cylinder((0, 0, 0.26), 0.30, 0.16, 'z', 40), 'graphite')
    p.add(kit.revolve([(0.0, 0.10), (0.30, 0.10), (0.30, 0.18), (0.27, 0.21), (0.0, 0.21)], 40), 'darkSteel')
    p.many([m for m in rkit.bolt_ring((0, 0, 0.35), 'z', 0.22, 10, 0.016, 0.010)], 'blackChrome')
    return [p]


# -------------------------------------------------------------------- thigh
def thigh_sec(z):
    t = max(0.0, min(1.0, (-z - 0.25) / 1.35))
    w = 0.86 - 0.10 * t
    d = 0.88 - 0.12 * t
    return hs.sec(w, d, cf=0.42, cb=0.22, fc=0.04, keel=0.06 * (1 - t))


def thigh():
    p = Part('R.thigh.frame')
    p.add(rkit.frame([(-0.16, 0.44, 0.50, 0.10, 0.0), (-0.40, 0.62, 0.68, 0.14, 0.0), (-1.30, 0.60, 0.66, 0.14, 0.0),
                      (-1.52, 0.52, 0.58, 0.12, 0.0), (-1.58, 0.44, 0.50, 0.10, 0.0)], cap=0.03), 'graphite')
    p.many(cheeks(-rig.THIGH, -1.45, 0.31, 0.31, KNEE_CHEEK_IN, 0.075), 'graphite')
    items(p, axle_caps(-rig.THIGH, KNEE_CHEEK_IN + 0.075, 0.13, 0.0, 10))
    # knee ram down the back
    items(p, ram((0.0, -0.40, -0.45), (0.0, -0.33, -1.62), 0.055, 0.026))
    a = Part('R.thigh.armor')
    items(a, hs.banded([(-0.30, -0.92), (-0.95, -1.44)], thigh_sec, gap=0.03, core_inset=0.03, slot='paint', core='graphite', cap=0.014))
    # layered quad plate on the front, a vented plate on the inner face
    o, u, n = hs.face_frame(thigh_sec(-0.62), -0.62, 0, lift=0.004)
    items(a, hs.plate_on(o, u, n, [(-0.18, -0.26), (0.18, -0.26), (0.14, 0.26), (-0.14, 0.26)], 0.025))
    items(a, hs.plate_on(o, u, n, [(-0.07, -0.20), (0.07, -0.20), (0.07, 0.20), (-0.07, 0.20)], 0.014, 'graphite', inset=-0.022))
    b = Part('R.thigh.ball')
    b.add(ball(HIP_BALL), 'darkSteel')
    b.add(rkit.cylinder((0, 0, -0.20), 0.17, 0.14, 'z', 32), 'darkSteel')
    return [p, a, b]


# -------------------------------------------------------------------- shin
def shin_sec(z):
    t = max(0.0, min(1.0, (-z - 0.28) / 1.25))
    w = 0.66 - 0.08 * t
    d = 0.66 - 0.06 * t
    return hs.sec(w, d, cf=0.55, cb=0.25, fc=0.08, keel=0.08)


def shin():
    p = Part('R.shin.frame')
    p.add(rkit.frame([(-0.10, 0.34, 0.40, 0.08, 0.0), (-0.34, 0.54, 0.56, 0.12, 0.0), (-1.40, 0.52, 0.54, 0.12, 0.0),
                      (-1.60, 0.42, 0.46, 0.10, 0.0), (-1.66, 0.34, 0.40, 0.08, 0.0)], cap=0.03), 'graphite')
    p.many(cheeks(-rig.SHIN, -1.56, 0.25, 0.25, ANKLE_CHEEK_IN, 0.065), 'graphite')
    items(p, axle_caps(-rig.SHIN, ANKLE_CHEEK_IN + 0.065, 0.10, 0.0, 8))
    a = Part('R.shin.armor')
    items(a, hs.banded([(-0.30, -0.88), (-0.92, -1.50)], shin_sec, gap=0.03, core_inset=0.03, slot='paint', core='graphite', cap=0.014))
    o, u, n = hs.face_frame(shin_sec(-0.62), -0.62, 0, lift=0.004)
    items(a, hs.vent_on(o, u, n, 0.20, 0.34, 5, 0.02, 'graphite', 'darkSteel'))
    items(a, hs.bolts_on(o, u, n, [(-0.12, 0.22), (0.12, 0.22), (-0.12, -0.22), (0.12, -0.22)], 0.016, 'darkSteel'))
    # kneecap: a pointed, faceted guard on the front of the knee
    k = Part('R.shin.kneecap')
    cap = [(-0.26, 0.28), (0.26, 0.28), (0.30, 0.02), (0.16, -0.26), (0.0, -0.36), (-0.16, -0.26), (-0.30, 0.02)]
    k.add(rkit.plate_f(cap, KNEE_R + 0.05, KNEE_R + 0.14, 0.02), 'paint')
    k.add(rkit.plate_f([(x * 0.55, z * 0.55 - 0.02) for x, z in cap], KNEE_R + 0.14, KNEE_R + 0.17, 0.01), 'graphite')
    k.add(rkit.plate_f([(-0.10, -0.05), (0.10, -0.05), (0.10, 0.12), (-0.10, 0.12)], KNEE_R - 0.02, KNEE_R + 0.06, 0.01), 'graphite')
    d = Part('R.shin.knee')
    d.add(rkit.drum((0, 0, 0), KNEE_R, KNEE_W, 'x', 48, 0.012), 'darkSteel')
    return [p, a, k, d]


# -------------------------------------------------------------------- foot
def foot():
    p = Part('R.foot.body')
    side = [(HEEL_F, SOLE + 0.05), (rig.TOE_F - 0.02, SOLE + 0.05), (rig.TOE_F - 0.02, SOLE + 0.24),
            (0.30, SOLE + 0.36), (0.14, -0.14), (-0.16, -0.14), (HEEL_F, SOLE + 0.30)]
    p.add(rkit.plate_x(side, -FOOT_HW + 0.03, FOOT_HW - 0.03, 0.02, 2), 'graphite')
    # white wedge shell over the instep, sides chamfered
    shell = [(HEEL_F + 0.02, SOLE + 0.30), (-0.14, -0.10), (0.18, -0.12), (0.34, SOLE + 0.38), (rig.TOE_F + 0.01, SOLE + 0.26),
             (rig.TOE_F + 0.01, SOLE + 0.18), (0.30, SOLE + 0.24), (0.10, SOLE + 0.20), (HEEL_F + 0.02, SOLE + 0.18)]
    p.add(rkit.plate_x(shell, -FOOT_HW, FOOT_HW, 0.03, 2), 'paint')
    # ankle tower between the shin cheeks
    tower = [(-0.20, -0.16), (0.22, -0.16), (0.18, -0.02), (0.0, 0.10), (-0.16, -0.02)]
    p.add(rkit.plate_x(tower, -ANKLE_CHEEK_IN + 0.02, ANKLE_CHEEK_IN - 0.02, 0.012), 'graphite')
    # black sole plate with tread pads (the rear face of the truck frame)
    p.add(rkit.plate_z([(-FOOT_HW, HEEL_F - 0.01), (FOOT_HW, HEEL_F - 0.01), (FOOT_HW, rig.TOE_F - 0.01), (-FOOT_HW, rig.TOE_F - 0.01)],
                       SOLE, SOLE + 0.05, 0.012), 'rubber')
    for k in range(4):
        f = HEEL_F + 0.08 + k * 0.22
        p.add(rkit.plate_z([(-FOOT_HW + 0.04, f), (FOOT_HW - 0.04, f), (FOOT_HW - 0.04, f + 0.12), (-FOOT_HW + 0.04, f + 0.12)],
                           SOLE - 0.012, SOLE + 0.002, 0.004), 'rubber')
    ankle = Part('R.foot.ankle')
    ankle.add(rkit.drum((0, 0, 0), ANKLE_R, ANKLE_W, 'x', 40, 0.010), 'darkSteel')
    return [p, ankle]


def toe():
    """Toe block hinged at the ball of the foot (toe frame: hinge at the origin, 0.12 above the sole)."""
    p = Part('R.toe.cap')
    L = TOE_TIP_F - rig.TOE_F
    prof = [(0.01, -0.12 + 0.05), (L - 0.06, -0.12 + 0.05), (L, -0.05), (L - 0.10, 0.10), (0.01, 0.13)]
    p.add(rkit.plate_x(prof, -FOOT_HW + 0.01, FOOT_HW - 0.01, 0.025, 2), 'blackChrome')
    p.add(rkit.plate_x([(0.06, 0.10), (L - 0.14, 0.07), (L - 0.06, -0.02), (0.06, 0.02)], -FOOT_HW + 0.08, FOOT_HW - 0.08, 0.012), 'paint')
    p.add(rkit.plate_z([(-FOOT_HW + 0.01, 0.02), (FOOT_HW - 0.01, 0.02), (FOOT_HW - 0.01, L - 0.07), (-FOOT_HW + 0.01, L - 0.07)],
                       -0.12, -0.07, 0.01), 'rubber')
    p.add(rkit.cylinder((0, 0.0, 0.0), 0.06, 2 * FOOT_HW - 0.06, 'x', 24), 'darkSteel')
    return [p]


def build(coll):
    return build_sided(coll, [('hip', hip), ('thigh', thigh), ('shin', shin), ('foot', foot), ('toe', toe)])
