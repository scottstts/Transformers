"""Arm endoskeleton and armour (bone-local rest coordinates, L side authored,
R mirrored): the shoulder slide, the upper arm with its angular shell and
exposed copper rams, the forearm (a faceted gauntlet; the flank plates dock on
its outer face as the blade), the clawed hand.

In the car the arms lie along the flanks: upper arms back along the torso,
forearms folded forward under them, fists by the shoulders."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, hardsurf as hs
from .kit import V
from .rkit import Part
from .rcommon import cheeks, axle_caps, ball, ram, build_sided, items
from .robot_panels import shield, inset, surface_forward
from .robot_head import plate
from .refine import limb_detail


def slab(points, depth, out):
    """A plate from design points, thickened by `depth` against the outward direction `out` (x, f, z)."""
    n = V(*out).normalized()
    v = [V(*p) for p in points]
    k = len(v)
    verts = v + [p - n * depth for p in v]
    faces = [list(range(k)), list(reversed(range(k, 2 * k)))] + [[i, k + i, k + (i + 1) % k, (i + 1) % k] for i in range(k)]
    return verts, faces

SHOULDER_BALL = 0.20
ELBOW_R, ELBOW_W = 0.18, 0.30
ELBOW_CHEEK_IN = 0.16
WRIST_R = 0.12


def clav():
    """The shoulder slide carriage: rides out of the chest to set the arm's socket."""
    p = Part('R.clav.slide')
    ox = rig.SHOULDER_X - rig.CLAV_X
    p.add(rkit.plate_x([(-0.20, -0.16), (0.20, -0.16), (0.20, 0.16), (-0.20, 0.16)], 0.26, ox - 0.20, 0.02), 'mech')
    p.add(kit.revolve([(0.0, -0.05), (0.24, -0.05), (0.24, 0.05), (0.0, 0.05)], 36, axis='X',
                      M=Matrix.Translation(V(ox - 0.16, 0, 0))), 'darkSteel')
    for k in range(3):
        p.add(rkit.hose([(0.40, -0.18 + k * 0.08, 0.20), (0.56, -0.20 + k * 0.08, 0.34), (0.74, -0.14 + k * 0.08, 0.20)], 0.022), 'copper')
    # pauldron: an angular black shell over the socket, under the wheel pod
    a = Part('R.clav.pauldron')
    pts = [(0.44, 0.30, 0.30), (0.86, 0.28, 0.36), (1.02, 0.18, 0.18), (1.00, 0.20, -0.10), (0.78, 0.30, -0.02), (0.52, 0.32, 0.12)]
    a.add(plate(pts, 0.56), 'armor')
    a.add(plate([(0.70, 0.305, 0.22), (0.92, 0.29, 0.26), (0.94, 0.28, 0.20), (0.72, 0.30, 0.16)], 0.02), 'bronze')
    return [p, a]


ARM_TELE = 0.40                  # the upper arm telescopes by this much in the car


def upperarm():
    p = Part('R.upperarm.frame')
    # the upper sleeve (the elbow section slides up into it in the car)
    p.add(rkit.frame([(-0.12, 0.28, 0.32, 0.07, 0.0), (-0.30, 0.42, 0.46, 0.09, 0.0), (-0.60, 0.40, 0.44, 0.09, 0.0),
                      (-0.64, 0.38, 0.42, 0.09, 0.0)], cap=0.02), 'graphite')
    p.add(rkit.frame([(-0.60, 0.44, 0.48, 0.10, 0.0), (-0.66, 0.44, 0.48, 0.10, 0.0)], cap=0.008), 'mech')
    a = Part('R.upperarm.armor')
    shell = hs.sec(0.50, 0.50, cf=0.45, cb=0.30, fc=0.0, bulge_x=0.03)
    a.add(hs.loft([-0.18, -0.40, -0.60], [shell, hs.offset(shell, -0.01), hs.offset(shell, -0.03)], 0.01), 'armor')
    a.add(hs.loft([-0.395, -0.405], [hs.offset(shell, 0.004)] * 2, 0.002), 'armorDark')
    # a swept blade plate on the outer face, bronze-edged, rooted into the shell
    a.add(slab([(0.24, 0.14, -0.20), (0.34, 0.08, -0.24), (0.36, -0.20, -0.58), (0.23, -0.12, -0.56)], 0.03, (1, 0, 0)), 'armor')
    a.add(slab([(0.335, 0.075, -0.25), (0.35, 0.06, -0.27), (0.355, -0.17, -0.55), (0.345, -0.16, -0.54)], 0.012, (1, 0, 0)), 'bronze')
    # deltoid: a stepped faceted cap over the ball
    for k, (r, z0) in enumerate(((0.34, 0.0), (0.29, 0.10))):
        prof = [(0.0, z0 + 0.16), (r * 0.55, z0 + 0.15), (r * 0.85, z0 + 0.10), (r, z0 - 0.04), (r, z0 - 0.20), (r - 0.04, z0 - 0.20),
                (r - 0.04, z0 - 0.05), (r * 0.8, z0 + 0.06), (r * 0.5, z0 + 0.11), (0.0, z0 + 0.12)]
        a.add(kit.revolve(prof, 8, M=Matrix.Translation(V(0.04, 0, 0))), 'armor' if k == 0 else 'graphite')
    a.add(rkit.drum((0.30, 0, -0.04), 0.18, 0.10, 'x', 36, 0.012), 'darkSteel')
    a.many(rkit.bolt_ring((0.365, 0, -0.04), 'x', 0.13, 8, 0.011, 0.007), 'bronze')
    b = Part('R.upperarm.ball')
    b.add(ball(SHOULDER_BALL), 'darkSteel')
    lo = Part('R.upperarm.lower')
    # the elbow section: a narrower boxed section, exposed rams, the elbow clevis
    lo.add(rkit.frame([(-0.46, 0.34, 0.38, 0.07, 0.0), (-0.88, 0.34, 0.38, 0.07, 0.0), (-0.94, 0.28, 0.32, 0.06, 0.0)], cap=0.02), 'mech')
    lo.many(cheeks(-rig.UPPER, -0.90, 0.20, 0.20, ELBOW_CHEEK_IN, 0.05), 'graphite')
    items(lo, axle_caps(-rig.UPPER, ELBOW_CHEEK_IN + 0.05, 0.085, 0.0, 8))
    items(lo, ram((0.0, -0.22, -0.46), (0.0, -0.20, -0.98), 0.036, 0.017))
    for x in (-0.15, 0.15):
        items(lo, ram((x, 0.18, -0.48), (x, 0.19, -0.92), 0.030, 0.015))
    limb_detail(a, 'upperarm')
    return [p, a, b, lo]


def forearm():
    p = Part('R.forearm.frame')
    p.add(rkit.frame([(-0.06, 0.26, 0.28, 0.06, 0.0), (-0.24, 0.40, 0.44, 0.09, 0.0), (-0.80, 0.38, 0.42, 0.09, 0.0),
                      (-rig.FORE + 0.05, 0.30, 0.34, 0.07, 0.0)], cap=0.02), 'graphite')
    for s_ in (-1, 1):
        p.add(rkit.hose([(s_ * 0.18, -0.22, -0.20), (s_ * 0.23, -0.25, -0.56), (s_ * 0.15, -0.21, -0.86)], 0.022), 'copper')
    a = Part('R.forearm.armor')

    def sec(z):
        t = max(0.0, min(1.0, (-z - 0.18) / 0.70))
        return hs.sec(0.50 + 0.10 * t, 0.52 + 0.08 * t, cf=0.42, cb=0.36, fc=0.02, keel=0.05, bulge_x=0.04)
    zs = (-0.16, -0.42, -0.66, -0.84)
    a.add(hs.loft(list(zs), [sec(z) for z in zs], 0.012), 'armor')
    a.add(hs.loft([-0.30, -0.305], [hs.offset(sec(-0.30), 0.006)] * 2, 0.002), 'armorDark')
    a.add(hs.loft([-0.62, -0.625], [hs.offset(sec(-0.62), 0.006)] * 2, 0.002), 'armorDark')
    a.add(rkit.frame([(-rig.FORE + 0.02, 0.44, 0.46, 0.10, 0.0), (-rig.FORE + 0.10, 0.46, 0.50, 0.11, 0.0)], cap=0.01), 'mech')
    # the bat blades: swept fins standing out of the gauntlet's outer face (rooted 3 cm into it),
    # raking up and back past the elbow; thickness across the forearm. They retract into the
    # gauntlet in the car (stow.py).
    bl = Part('R.forearm.blades')
    for k, (z0, z1, reach, rise, f0) in enumerate(((-0.30, -0.62, 0.24, 0.40, 0.08), (-0.52, -0.80, 0.18, 0.26, -0.08))):
        fin = [(0.26, f0, z1), (0.26, f0, z0), (0.26 + reach * 0.55, f0, z0 + rise * 0.7), (0.26 + reach, f0, z0 + rise),
               (0.26 + reach * 0.85, f0, z0 + rise * 0.55), (0.26 + reach * 0.35, f0, z1 + 0.06)]
        bl.add(slab(fin, 0.04, (0, 1, 0)), 'armor')
        bl.add(slab([(x + 0.004, f0 + 0.004, z) for x, _, z in fin[2:5]] + [(0.26 + reach * 0.5, f0 + 0.004, z0 + rise * 0.4)], 0.008, (0, 1, 0)),
               'armorDark')
    a.add(slab([(0.285, 0.04, -0.34), (0.30, 0.02, -0.36), (0.30, -0.20, -0.62), (0.285, -0.18, -0.60)], 0.01, (1, 0, 0)), 'bronze')
    d = Part('R.forearm.elbow')
    d.add(rkit.drum((0, 0, 0), ELBOW_R, ELBOW_W, 'x', 36, 0.010), 'darkSteel')
    return [p, a, d, bl]


def hand():
    p = Part('R.hand.palm')
    p.add(rkit.frame([(-0.02, 0.18, 0.28, 0.04, 0.0), (-0.11, 0.22, 0.36, 0.05, 0.02), (-rig.PALM + 0.02, 0.20, 0.34, 0.05, 0.03)], cap=0.015),
          'graphite')
    p.add(rkit.plate_x([(-0.16, -0.03), (0.22, -0.03), (0.20, -rig.PALM + 0.03), (-0.16, -rig.PALM + 0.03)], 0.10, 0.13, 0.010), 'armor')
    p.add(rkit.cylinder((0, 0, 0), WRIST_R, 0.24, 'x', 28), 'darkSteel')
    return [p]


def finger(bone_prefix, k, L, w, claw=False):
    """One phalanx part (hangs down its bone's -z); the tip phalanx ends in a claw."""
    q = Part('R.%s%d.seg' % (bone_prefix, k))
    q.add(rkit.frame([(-0.010, w * 0.9, w * 0.86, 0.016, 0.0), (-L * 0.5, w, w * 0.94, 0.018, 0.0), (-L + 0.010, w * 0.85, w * 0.82, 0.016, 0.0)],
                     cap=0.008), 'armor' if k == 1 else 'graphite')
    q.add(rkit.cylinder((0, 0, 0), w * 0.42, w * 0.95, 'x', 14), 'darkSteel')
    if claw:
        tip = [(-w * 0.45, -L + 0.02), (w * 0.45, -L + 0.02), (0.0, -L - 0.07)]
        q.add(rkit.plate_x([(f, z) for f, z in [(-0.035, -L + 0.02), (0.045, -L + 0.02), (0.015, -L - 0.07)]], -w * 0.35, w * 0.35, 0.004), 'blackChrome')
    return q


def fingers_for(fn):
    L = list(rig.PHAL) if fn != 'thumb' else [0.13, 0.115, 0.10]
    w = 0.056 if fn in ('index', 'middle') else 0.052
    if fn == 'thumb':
        w = 0.072
    return [(('%s%d' % (fn, k + 1)), (lambda k=k: [finger(fn, k + 1, L[k], w, claw=(k == 2))])) for k in range(3)]


def build(coll):
    specs = [('clav', clav), ('upperarm', upperarm), ('forearm', forearm), ('hand', hand)]
    for fn in rig.FINGERS + ('thumb',):
        specs += fingers_for(fn)
    return build_sided(coll, specs, bevel=0.005)
