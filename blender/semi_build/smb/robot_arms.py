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
from .robot_panels import shield, inset, surface_forward

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
    a=Part('R.clav.pauldron')
    # A compound shield closes the fairing's open front; the truck shell
    # remains its curved outer/back skin rather than dictating its silhouette.
    a.add(shield([(0.92,0.96,0.27,0.31,0.42),(0.76,1.10,0.42,0.49,0.63),
                  (0.20,1.18,0.44,0.53,0.69),(-0.17,1.23,0.33,0.46,0.57)],0.06),'paint')
    a.add(shield([(-0.18,1.23,0.33,0.445,0.555),(-0.25,1.20,0.28,0.41,0.52)],0.05),'graphite')
    for x,z,f in [(0.80,0.70,0.53),(1.42,0.60,0.565),(1.41,-0.08,0.535)]:
        a.add(rkit.cylinder((x,f,z),0.024,0.018,'f',12),'darkSteel')
    a.add(rkit.plate_f([(1.34,-0.08),(1.43,-0.05),(1.43,0.005),(1.34,-0.02)],0.558,0.573,0.008),'amber')
    # Cables visibly connect the arm socket to the chest-side carriage.
    for k in range(3):
        p.add(rkit.hose([(0.53,-0.24+k*0.10,0.25),(0.74,-0.28+k*0.10,0.42),
                         (1.02,-0.19+k*0.10,0.24)],0.028),'rubber')
    return [p,a]


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
    a.add(shield([(-0.31,0.02,0.26,0.23,0.34),(-0.46,0.02,0.33,0.25,0.42),
                  (-0.80,0.04,0.27,0.25,0.38),(-1.08,0.06,0.13,0.23,0.30)]),'paint')
    # Paired exposed actuators under the shoulder armor.
    for x in (-0.21,0.21):
        items(p, ram((x,0.22,-0.44),(x,0.23,-1.14),0.043,0.021))
    # deltoid cap: a layered white shell over the ball, stepped like the cab's roof corner
    for k, (r, z0) in enumerate(((0.46, -0.02), (0.40, 0.10))):
        prof = [(0.0, z0 + 0.20), (r * 0.55, z0 + 0.19), (r * 0.85, z0 + 0.12), (r, z0 - 0.04), (r, z0 - 0.24), (r - 0.04, z0 - 0.24),
                (r - 0.04, z0 - 0.06), (r * 0.8, z0 + 0.08), (r * 0.5, z0 + 0.14), (0.0, z0 + 0.15)]
        a.add(kit.revolve(prof, 40, M=Matrix.Translation(V(0.05, 0, 0))), 'graphite' if k == 0 else 'darkSteel')
    a.add(rkit.drum((0.38,0,-0.05),0.26,0.14,'x',40,0.014),'darkSteel')
    a.many(rkit.bolt_ring((0.465,0,-0.05),'x',0.20,10,0.014,0.009),'silver')
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
    surface=[(-0.17,0.035,0.12,0.26,0.32),(-0.35,0.015,0.31,0.28,0.46),
                  (-0.60,0.00,0.36,0.29,0.50),(-0.98,-0.02,0.26,0.27,0.42),
                  (-1.19,-0.025,0.18,0.24,0.31)]
    a.add(shield(surface),'paint')
    for s in (-1,1):
        a.add(shield([(-0.40,s*0.285,0.07,0.23,0.29),(-0.70,s*0.30,0.085,0.23,0.31),
                      (-1.09,s*0.22,0.05,0.23,0.30)],0.03),'silver')
        p.add(rkit.hose([(s*0.22,-0.26,-0.24),(s*0.28,-0.30,-0.70),(s*0.18,-0.25,-1.12)],0.027),'rubber')
    a.add(inset(surface,[(-0.07,-0.89),(0.055,-0.89),(0.025,-1.065),(-0.055,-1.065)]),'graphite')
    for x in (-0.18,0.18):
        a.add(rkit.cylinder((x,surface_forward(surface,x,-0.43)+0.008,-0.43),0.021,0.014,'f',12),'darkSteel')
    a.add(inset(surface,[(0.22,-0.54),(0.26,-0.55),(0.24,-0.70),(0.20,-0.69)]),'orange')
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
