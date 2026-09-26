"""Arm endoskeleton and armour (bone-local rest coordinates, L side authored,
R mirrored): shoulder slide, upper arm with its deltoid cap, the big blocky
forearm (the door's lower panel docks on its outer face), the hand.

In the truck the arms stand in the cab sides: upper arms hanging behind the
doors, forearms reaching forward inside the fenders, fists closed."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, hardsurf as hs
from .kit import V
from .rkit import Part
from .rcommon import cheeks, axle_caps, ball, ram, build_sided, items

SHOULDER_BALL = 0.24
ELBOW_R, ELBOW_W = 0.22, 0.36
ELBOW_CHEEK_IN = 0.19
WRIST_R = 0.15


def clav():
    """The shoulder slide carriage: rides out of the chest to set the arm's socket."""
    p = Part('R.clav.slide')
    ox = rig.SHOULDER_X - rig.CLAV_X
    p.add(rkit.plate_x([(-0.24, -0.20), (0.24, -0.20), (0.24, 0.20), (-0.24, 0.20)], 0.30, ox - 0.26, 0.02), 'mech')
    p.add(kit.revolve([(0.0, -0.06), (0.30, -0.06), (0.30, 0.06), (0.0, 0.06)], 40, axis='X',
                      M=Matrix.Translation(V(ox - 0.20, 0, 0))), 'darkSteel')
    return [p]


def upper_sec(z):
    t = max(0.0, min(1.0, (-z - 0.30) / 0.80))
    return hs.sec(0.70 - 0.06 * t, 0.72 - 0.06 * t, cf=0.40, cb=0.30, fc=0.0)


def upperarm():
    p = Part('R.upperarm.frame')
    p.add(rkit.frame([(-0.14, 0.34, 0.38, 0.08, 0.0), (-0.34, 0.50, 0.54, 0.11, 0.0), (-1.06, 0.48, 0.52, 0.11, 0.0),
                      (-1.18, 0.40, 0.44, 0.09, 0.0), (-1.22, 0.32, 0.36, 0.07, 0.0)], cap=0.025), 'graphite')
    p.many(cheeks(-rig.UPPER, -1.12, 0.24, 0.24, ELBOW_CHEEK_IN, 0.06), 'graphite')
    items(p, axle_caps(-rig.UPPER, ELBOW_CHEEK_IN + 0.06, 0.10, 0.0, 8))
    items(p, ram((0.0, -0.33, -0.30), (0.0, -0.27, -1.20), 0.045, 0.021))
    a = Part('R.upperarm.armor')
    items(a, hs.banded([(-0.36, -0.74), (-0.77, -1.08)], upper_sec, gap=0.028, core_inset=0.028, slot='paint', core='graphite', cap=0.012))
    # deltoid cap: a layered white shell over the ball, stepped like the cab's roof corner
    for k, (r, z0) in enumerate(((0.46, -0.02), (0.40, 0.10))):
        prof = [(0.0, z0 + 0.20), (r * 0.55, z0 + 0.19), (r * 0.85, z0 + 0.12), (r, z0 - 0.04), (r, z0 - 0.24), (r - 0.04, z0 - 0.24),
                (r - 0.04, z0 - 0.06), (r * 0.8, z0 + 0.08), (r * 0.5, z0 + 0.14), (0.0, z0 + 0.15)]
        a.add(kit.revolve(prof, 40, M=Matrix.Translation(V(0.05, 0, 0))), 'paint' if k == 0 else 'graphite')
    b = Part('R.upperarm.ball')
    b.add(ball(SHOULDER_BALL), 'darkSteel')
    return [p, a, b]


def fore_sec(z):
    t = max(0.0, min(1.0, (-z - 0.22) / 0.90))
    return hs.sec(0.66 + 0.10 * t, 0.70 + 0.10 * t, cf=0.36, cb=0.30, fc=0.02, bulge_x=0.03)


def forearm():
    p = Part('R.forearm.frame')
    p.add(rkit.frame([(-0.08, 0.30, 0.34, 0.07, 0.0), (-0.28, 0.48, 0.52, 0.11, 0.0), (-1.14, 0.46, 0.50, 0.11, 0.0),
                      (-rig.FORE + 0.06, 0.36, 0.40, 0.09, 0.0)], cap=0.025), 'graphite')
    a = Part('R.forearm.armor')
    items(a, hs.banded([(-0.24, -0.66), (-0.70, -1.16)], fore_sec, gap=0.03, core_inset=0.03, slot='paint', core='graphite', cap=0.014))
    o, u, n = hs.face_frame(fore_sec(-0.92), -0.92, 0, lift=0.004)
    items(a, hs.vent_on(o, u, n, 0.22, 0.26, 4, 0.02, 'graphite', 'darkSteel'))
    # wrist cuff
    a.add(rkit.frame([(-rig.FORE + 0.02, 0.52, 0.56, 0.12, 0.0), (-rig.FORE + 0.12, 0.56, 0.60, 0.13, 0.0)], cap=0.012), 'mech')
    d = Part('R.forearm.elbow')
    d.add(rkit.drum((0, 0, 0), ELBOW_R, ELBOW_W, 'x', 40, 0.010), 'darkSteel')
    return [p, a, d]


def hand():
    p = Part('R.hand.palm')
    # palm block: the palm faces inward (-x), knuckles forward-down
    p.add(rkit.frame([(-0.02, 0.22, 0.34, 0.05, 0.0), (-0.12, 0.26, 0.44, 0.06, 0.02), (-rig.PALM + 0.02, 0.24, 0.42, 0.06, 0.03)], cap=0.02), 'graphite')
    p.add(rkit.plate_x([(-0.20, -0.04), (0.26, -0.04), (0.24, -rig.PALM + 0.03), (-0.20, -rig.PALM + 0.03)], 0.12, 0.16, 0.012), 'blackChrome')
    p.add(rkit.cylinder((0, 0, 0), WRIST_R, 0.30, 'x', 32), 'darkSteel')
    parts = [p]
    return parts


def finger(bone_prefix, k, L, w):
    """One phalanx part for a finger bone (hangs down its bone's -z)."""
    q = Part('R.%s%d.seg' % (bone_prefix, k))
    q.add(rkit.frame([(-0.012, w * 0.9, w, 0.018, 0.0), (-L * 0.5, w, w * 1.08, 0.02, 0.0), (-L + 0.012, w * 0.9, w, 0.018, 0.0)], cap=0.01),
          'blackChrome' if k == 1 else 'graphite')
    q.add(rkit.cylinder((0, 0, 0), w * 0.42, w * 0.95, 'x', 16), 'darkSteel')
    return q


def fingers_for(fn):
    L = list(rig.PHAL) if fn != 'thumb' else [0.16, 0.14, 0.12]
    w = 0.090 if fn in ('index', 'middle') else 0.082
    if fn == 'thumb':
        w = 0.10
    return [(('%s%d' % (fn, k + 1)), (lambda k=k: [finger(fn, k + 1, L[k], w)])) for k in range(3)]


def build(coll):
    specs = [('clav', clav), ('upperarm', upperarm), ('forearm', forearm), ('hand', hand)]
    for fn in rig.FINGERS + ('thumb',):
        specs += fingers_for(fn)
    return build_sided(coll, specs, bevel=0.006)
