"""Leg endoskeleton and armour (bone-local rest coordinates, L side authored,
R mirrored).

The legs telescope: in the car they lie forward under the torso, each thigh
and shin shortened (the knee and ankle joints slide in, rig slides on the
shin and foot bones). A thigh is an upper sleeve (the armoured section on the
thigh bone) and a lower section carrying the knee clevis ('R.thigh.lower',
which follows the knee's slide, stow.Follow); the shin likewise. So the
joints stay whole while the sections slide over each other, and the exposed
lower sections read as the concept's long piston legs.

The rear corners (dual tyres, fenders, flaps) dock on the calves; the knee and
the front of the shin carry the robot's own angular guards."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, hardsurf as hs
from .kit import V
from .rkit import Part
from .rcommon import cheeks, axle_caps, ball, ram, build_sided, items
from .robot_head import plate
from .robot_arms import slab
from .refine import foot_detail

KNEE_R, KNEE_W = 0.23, 0.38
KNEE_CHEEK_IN = 0.20
ANKLE_R, ANKLE_W = 0.18, 0.32
ANKLE_CHEEK_IN = 0.17
HIP_BALL = 0.21
SOLE = -rig.ANKLE_Z
HEEL_F, TOE_TIP_F = -0.32, 0.92
FOOT_HW = 0.30
TELE = 0.20                      # telescoping travel of the thigh and the shin (car)


# -------------------------------------------------------------------- hip
def hip():
    p = Part('R.hip.cup')
    p.add(rkit.cylinder((0, 0, 0.22), 0.25, 0.14, 'z', 32), 'graphite')
    p.add(kit.revolve([(0.0, 0.08), (0.25, 0.08), (0.25, 0.15), (0.22, 0.18), (0.0, 0.18)], 32), 'darkSteel')
    p.many([m for m in rkit.bolt_ring((0, 0, 0.30), 'z', 0.18, 8, 0.013, 0.008)], 'blackChrome')
    return [p]


# -------------------------------------------------------------------- thigh
def thigh():
    p = Part('R.thigh.frame')
    # the upper sleeve: a hollow-looking boxed section the lower section slides into
    p.add(rkit.frame([(-0.12, 0.38, 0.42, 0.08, 0.0), (-0.30, 0.52, 0.56, 0.11, 0.0), (-0.78, 0.50, 0.54, 0.11, 0.0),
                      (-0.84, 0.48, 0.52, 0.10, 0.0)], cap=0.02), 'graphite')
    p.add(rkit.frame([(-0.80, 0.54, 0.58, 0.12, 0.0), (-0.86, 0.54, 0.58, 0.12, 0.0)], cap=0.008), 'mech')     # sleeve lip
    a = Part('R.thigh.armor')

    def sec(z):
        t = max(0.0, min(1.0, (-z - 0.15) / 0.62))
        return hs.sec(0.66 - 0.06 * t, 0.66 - 0.06 * t, cf=0.46, cb=0.26, fc=0.04, keel=0.08 * (1 - t), bulge_x=0.03)
    zs = [-0.14, -0.40, -0.76]
    a.add(hs.loft(zs, [sec(z) for z in zs], 0.012), 'armor')
    a.add(hs.loft([-0.44, -0.448], [hs.offset(sec(-0.44), 0.012)] * 2, 0.002), 'armorDark')
    # a raised angular plate over the outer front, bronze-edged
    a.add(slab([(0.20, 0.30, -0.18), (0.36, 0.20, -0.22), (0.36, 0.14, -0.66), (0.20, 0.26, -0.72)], 0.03, (0.6, 0.8, 0)), 'armor')
    a.add(slab([(0.21, 0.312, -0.60), (0.35, 0.215, -0.62), (0.35, 0.21, -0.64), (0.21, 0.305, -0.62)], 0.01, (0.6, 0.8, 0)), 'bronze')
    b = Part('R.thigh.ball')
    b.add(ball(HIP_BALL), 'darkSteel')
    b.add(rkit.cylinder((0, 0, -0.16), 0.14, 0.12, 'z', 28), 'darkSteel')
    lo = Part('R.thigh.lower')
    # the lower section: a narrower boxed section, exposed piston pair, the knee clevis
    lo.add(rkit.frame([(-0.66, 0.40, 0.44, 0.08, 0.0), (-1.04, 0.40, 0.44, 0.08, 0.0), (-1.10, 0.34, 0.38, 0.07, 0.0)], cap=0.02), 'mech')
    lo.many(cheeks(-rig.THIGH, -1.02, 0.25, 0.25, KNEE_CHEEK_IN, 0.06), 'graphite')
    items(lo, axle_caps(-rig.THIGH, KNEE_CHEEK_IN + 0.06, 0.11, 0.0, 10))
    for x in (-0.15, 0.15):
        items(lo, ram((x, 0.24, -0.60), (x, 0.25, -1.10), 0.036, 0.018))
    items(lo, ram((0.0, -0.30, -0.40), (0.0, -0.26, -1.12), 0.045, 0.022))
    return [p, a, b, lo]


# -------------------------------------------------------------------- shin
def shin():
    p = Part('R.shin.frame')
    p.add(rkit.frame([(-0.10, 0.30, 0.34, 0.07, 0.0), (-0.30, 0.46, 0.50, 0.10, 0.0), (-0.80, 0.46, 0.50, 0.10, 0.0),
                      (-0.86, 0.44, 0.48, 0.10, 0.0)], cap=0.02), 'graphite')
    p.add(rkit.frame([(-0.82, 0.50, 0.54, 0.11, 0.0), (-0.88, 0.50, 0.54, 0.11, 0.0)], cap=0.008), 'mech')
    a = Part('R.shin.armor')
    # an angular shin guard: a faceted keel down the front, flaring toward the ankle
    def sec(z):
        t = max(0.0, min(1.0, (-z - 0.28) / 0.55))
        return hs.sec(0.54 + 0.06 * t, 0.54, cf=0.60, cb=0.25, fc=0.06, keel=0.10, bulge_x=0.02)
    zs = [-0.28, -0.56, -0.84]
    a.add(hs.loft(zs, [sec(z) for z in zs], 0.012), 'armor')
    a.add(hs.loft([-0.58, -0.588], [hs.offset(sec(-0.58), 0.012)] * 2, 0.002), 'armorDark')
    k = Part('R.shin.kneecap')
    # a pointed faceted knee guard
    kc = [(-0.20, 0.28, 0.24), (0.20, 0.28, 0.24), (0.24, 0.34, 0.02), (0.14, 0.40, -0.22), (0.0, 0.43, -0.32), (-0.14, 0.40, -0.22),
          (-0.24, 0.34, 0.02)]
    k.add(plate(kc, 0.14), 'armor')
    k.add(plate([(x * 0.5, f + 0.015, z * 0.6 - 0.02) for x, f, z in kc], 0.02), 'armorDark')
    for x in (-0.16, 0.16):
        k.add(rkit.cylinder((x, 0.34, 0.12), 0.018, 0.015, 'f', 12), 'bronze')
    d = Part('R.shin.knee')
    d.add(rkit.drum((0, 0, 0), KNEE_R, KNEE_W, 'x', 40, 0.012), 'darkSteel')
    lo = Part('R.shin.lower')
    lo.add(rkit.frame([(-0.70, 0.36, 0.40, 0.07, 0.0), (-1.08, 0.36, 0.40, 0.07, 0.0), (-1.14, 0.30, 0.34, 0.06, 0.0)], cap=0.02), 'mech')
    lo.many(cheeks(-rig.SHIN, -1.08, 0.20, 0.20, ANKLE_CHEEK_IN, 0.055), 'graphite')
    items(lo, axle_caps(-rig.SHIN, ANKLE_CHEEK_IN + 0.055, 0.09, 0.0, 8))
    for x in (-0.13, 0.13):
        items(lo, ram((x, 0.20, -0.66), (x, 0.21, -1.12), 0.032, 0.016))
    return [p, a, k, d, lo]


# -------------------------------------------------------------------- foot
def foot():
    p = Part('R.foot.body')
    side = [(HEEL_F, SOLE + 0.05), (rig.TOE_F - 0.02, SOLE + 0.05), (rig.TOE_F - 0.02, SOLE + 0.20),
            (0.24, SOLE + 0.30), (0.12, -0.12), (-0.14, -0.12), (HEEL_F, SOLE + 0.24)]
    p.add(rkit.plate_x(side, -FOOT_HW + 0.03, FOOT_HW - 0.03, 0.02, 2), 'graphite')
    # angular black shell over the instep, the sides chamfered, a heel spur behind
    shell = [(HEEL_F + 0.02, SOLE + 0.26), (-0.12, -0.08), (0.14, -0.10), (0.28, SOLE + 0.32), (rig.TOE_F + 0.01, SOLE + 0.22),
             (rig.TOE_F + 0.01, SOLE + 0.15), (0.26, SOLE + 0.20), (0.08, SOLE + 0.17), (HEEL_F + 0.02, SOLE + 0.15)]
    p.add(rkit.plate_x(shell, -FOOT_HW, FOOT_HW, 0.025, 2), 'armor')
    for s in (1, -1):
        spur = [(HEEL_F - 0.16, SOLE + 0.10), (HEEL_F + 0.04, SOLE + 0.08), (HEEL_F + 0.06, SOLE + 0.24), (HEEL_F - 0.02, SOLE + 0.26)]
        x0 = s * (FOOT_HW - 0.02)
        p.add(rkit.plate_x(spur, min(x0, x0 - s * 0.06), max(x0, x0 - s * 0.06), 0.006), 'armor')
    tower = [(-0.16, -0.12), (0.18, -0.12), (0.15, -0.02), (0.0, 0.08), (-0.13, -0.02)]
    p.add(rkit.plate_x(tower, -ANKLE_CHEEK_IN + 0.02, ANKLE_CHEEK_IN - 0.02, 0.01), 'graphite')
    p.add(rkit.plate_z([(-FOOT_HW, HEEL_F - 0.01), (FOOT_HW, HEEL_F - 0.01), (FOOT_HW, rig.TOE_F - 0.01), (-FOOT_HW, rig.TOE_F - 0.01)],
                       SOLE, SOLE + 0.05, 0.01), 'rubber')
    ankle = Part('R.foot.ankle')
    ankle.add(rkit.drum((0, 0, 0), ANKLE_R, ANKLE_W, 'x', 36, 0.010), 'darkSteel')
    foot_detail(p)
    return [p, ankle]


def toe():
    """The pointed toe block, hinged at the ball of the foot (hinge at the origin, 0.10 above the sole)."""
    p = Part('R.toe.cap')
    L = TOE_TIP_F - rig.TOE_F
    prof = [(0.01, -0.10 + 0.04), (L - 0.10, -0.10 + 0.04), (L, -0.07), (L - 0.16, 0.07), (0.01, 0.11)]
    p.add(rkit.plate_x(prof, -FOOT_HW + 0.02, FOOT_HW - 0.02, 0.02, 2), 'armor')
    # the tip narrows to a point: a keel plate along the top
    p.add(rkit.plate_x([(0.04, 0.10), (L - 0.14, 0.07), (L - 0.02, -0.04), (0.04, 0.04)], -0.05, 0.05, 0.008), 'blackChrome')
    p.add(rkit.plate_z([(-FOOT_HW + 0.02, 0.02), (FOOT_HW - 0.02, 0.02), (FOOT_HW - 0.02, L - 0.10), (-FOOT_HW + 0.02, L - 0.10)],
                       -0.10, -0.06, 0.01), 'rubber')
    p.add(rkit.cylinder((0, 0.0, 0.0), 0.05, 2 * FOOT_HW - 0.06, 'x', 20), 'darkSteel')
    return [p]


def build(coll):
    return build_sided(coll, [('hip', hip), ('thigh', thigh), ('shin', shin), ('foot', foot), ('toe', toe)])
