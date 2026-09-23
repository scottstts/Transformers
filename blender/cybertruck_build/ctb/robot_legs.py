"""Leg endoskeleton (bone-local rest coordinates, L side authored, R mirrored).

Datums shared with the car slices: the door skin lands at thigh x = 0.315, the
windshield back face at thigh f = 0.33, the front-corner liner wall at shin
x = 0.225, and the bumper back face (toe cap) at foot f = 0.585.
"""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, linkage
from .kit import V
from .rkit import Part

THIGH_W, THIGH_D = 0.42, 0.52
SHIN_W, SHIN_D = 0.40, 0.48
KNEE_R, KNEE_W = 0.15, 0.22           # knee drum (shin), sits between the thigh cheeks
CHEEK_IN = 0.13                        # cheek inner face (x); 6 mm clear of the drum hubs
ANKLE_R, ANKLE_W = 0.12, 0.20
ANKLE_CHEEK_IN = 0.12
FOOT_W = 0.42
TOE_F = 0.585                          # toe cap (bumper) back face, foot frame
SOLE = -rig.ANKLE_Z


def mirror_mesh(m):
    return kit.mirror_x(m)


def cheeks(pivot_z, top_z, r, f_half, x_in, thick, fc=0.0):
    out = []
    outline = rkit.cheek_outline(top_z, pivot_z, f_half, r, fc)
    for s in (1, -1):
        x0, x1 = (x_in, x_in + thick) if s > 0 else (-x_in - thick, -x_in)
        out.append(rkit.plate_x(outline, x0, x1, 0.006))
    return out


def axle_caps(pivot_z, x_out, r=0.07, fc=0.0):
    out = []
    for s in (1, -1):
        out.append(rkit.cylinder((s * (x_out + 0.012), fc, pivot_z), r, 0.024, 'x', 24))
        out += rkit.bolt_ring((s * (x_out + 0.024), fc, pivot_z), (s, 0, 0), r * 0.62, 6, 0.009, 0.006)
    return out


def battery(x_half, f0, f1, z0, z1, ribs=6):
    """Back module: the truck's floor pan in the fold, the robot's back armour standing."""
    zc = (z0 + z1) / 2
    out = [rkit.plate_f([(x, z + zc) for x, z in kit.chamfer_rect(2 * x_half, z1 - z0, 0.03)], f0, f1, 0.008)]
    step = (z1 - z0) / (ribs + 1)
    for k in range(1, ribs + 1):
        z = z0 + step * k
        rib = [(x, zz + z) for x, zz in kit.chamfer_rect(2 * x_half - 0.08, 0.022, 0.006)]
        out.append(rkit.plate_f(rib, f0 - 0.012, f0 + 0.002, 0.003, 1))
    return out


def thigh():
    p = Part('R.thigh.frame')
    p.add(rkit.frame([
        (-0.12, 0.26, 0.30, 0.06, 0.0),
        (-0.30, 0.40, 0.50, 0.10, 0.0),
        (-0.74, THIGH_W, THIGH_D, 0.11, 0.0),
        (-1.00, 0.36, 0.44, 0.09, -0.01),
        (-1.10, 0.30, 0.38, 0.07, -0.02),
    ], cap=0.02), 'graphite', cuts=linkage.bores_for('thigh'))
    # quadriceps fairing: raised faceted front plate, pocketed for the windshield lifter pads
    p.add(rkit.plate_f([(-0.15, -0.36), (0.15, -0.36), (0.13, -0.92), (0.0, -0.99), (-0.13, -0.92)], 0.24, 0.285, 0.008), 'mech',
          cuts=linkage.pockets_for('thigh', ('wslift.hip', 'wslift.knee')))
    # knee clevis
    p.many(cheeks(-rig.THIGH, -0.96, 0.165, 0.17, CHEEK_IN, 0.05, -0.01), 'graphite')
    p.many(axle_caps(-rig.THIGH, CHEEK_IN + 0.05, 0.075, -0.01), 'darkSteel')
    # door and windshield mount pads are lifters (linkage): they carry the panels in transit
    # battery back module (truck floor pan)
    # starts 0.34 below the hip so the carriage clears it through the hip's flexion range
    p.many(battery(0.20, -0.39, -0.24, -1.06, -0.34, 4), 'graphite')
    # hydraulic lines down the outer-back corner
    p.add(rkit.hose([(0.20, -0.20, -0.18), (0.225, -0.21, -0.5), (0.215, -0.20, -0.9), (0.19, -0.16, -1.02)], 0.018), 'rubber')
    p.add(rkit.hose([(0.20, -0.14, -0.18), (0.228, -0.15, -0.5), (0.218, -0.14, -0.9), (0.19, -0.10, -1.02)], 0.014), 'rubber')
    ball = Part('R.thigh.ball')
    ball.add(kit.revolve([(0.0, -0.155)] + [(0.155 * math.sin(math.pi * k / 12), -0.155 * math.cos(math.pi * k / 12)) for k in range(1, 12)] + [(0.0, 0.155)], 28), 'darkSteel')
    ball.add(rkit.cylinder((0, 0, -0.14), 0.10, 0.08, 'z', 24), 'darkSteel')
    return [p, ball]


def shin():
    p = Part('R.shin.frame')
    p.add(rkit.frame([
        # inside the thigh cheeks' swing radius the shin stays narrower than the cheek gap
        (-0.06, 0.22, 0.28, 0.05, 0.0),
        (-0.20, 0.235, 0.34, 0.06, -0.01),
        (-0.34, SHIN_W, SHIN_D, 0.10, -0.02),
        (-0.80, 0.38, 0.44, 0.09, -0.02),
        (-1.10, 0.30, 0.34, 0.07, 0.0),
        (-1.18, 0.24, 0.30, 0.05, 0.0),
    ], cap=0.02), 'graphite', cuts=linkage.bores_for('shin'))
    p.many(cheeks(-rig.SHIN, -1.10, 0.135, 0.15, ANKLE_CHEEK_IN, 0.045), 'graphite')
    p.many(axle_caps(-rig.SHIN, ANKLE_CHEEK_IN + 0.045, 0.06), 'darkSteel')
    # tibial fairing
    p.add(rkit.plate_f([(-0.14, -0.30), (0.14, -0.30), (0.12, -0.95), (0.0, -1.02), (-0.12, -0.95)], 0.22, 0.255, 0.008), 'mech',
          cuts=linkage.pockets_for('shin', ('hoodlift.knee',)))
    # hood and front-corner pod mount pads are lifters (linkage)
    p.many(battery(0.18, -0.36, -0.22, -1.04, -0.24, 4), 'graphite')
    p.add(rkit.hose([(-0.19, -0.18, -0.16), (-0.215, -0.19, -0.5), (-0.205, -0.18, -0.95), (-0.17, -0.12, -1.12)], 0.016), 'rubber')
    knee = Part('R.shin.knee')
    knee.add(rkit.drum((0, 0, 0), KNEE_R, KNEE_W, 'x'), 'darkSteel')
    knee.many(rkit.bolt_ring((0, 0, 0), 'x', KNEE_R * 0.6, 8, 0.01, 0.006, KNEE_W / 2 - 0.001), 'chrome')
    knee.many(rkit.bolt_ring((0, 0, 0), (-1, 0, 0), KNEE_R * 0.6, 8, 0.01, 0.006, KNEE_W / 2 - 0.001), 'chrome')
    return [p, knee]


def foot():
    p = Part('R.foot.body')
    base = [(-0.30, SOLE + 0.02), (TOE_F - 0.004, SOLE + 0.02), (TOE_F - 0.004, -0.22), (0.30, -0.175), (-0.17, -0.175), (-0.30, -0.25)]
    p.add(rkit.plate_x(base, -FOOT_W / 2, FOOT_W / 2, 0.012, 2), 'graphite')
    # ankle tower between the shin's ankle cheeks
    tower = [(-0.13, -0.19), (0.14, -0.19), (0.12, -0.05), (0.0, 0.02), (-0.11, -0.05)]
    p.add(rkit.plate_x(tower, -ANKLE_CHEEK_IN + 0.012, ANKLE_CHEEK_IN - 0.012, 0.008), 'graphite')
    # heel guard + instep plate
    p.add(rkit.plate_x([(-0.315, SOLE + 0.03), (-0.26, SOLE + 0.03), (-0.19, -0.19), (-0.28, -0.22), (-0.315, -0.26)], -0.2, 0.2, 0.008), 'mech')
    p.add(rkit.plate_f([(-0.19, -0.19), (0.19, -0.19), (0.17, -0.165), (-0.17, -0.165)], 0.16, 0.52, 0.006), 'mech')
    # sole: rubber tread
    p.add(rkit.plate_z([(-0.215, -0.295), (0.215, -0.295), (0.215, TOE_F - 0.006), (-0.215, TOE_F - 0.006)], SOLE, SOLE + 0.024, 0.006), 'rubber')
    for k in range(7):
        f = -0.24 + k * 0.12
        p.add(rkit.plate_z([(-0.19, f), (0.19, f), (0.19, f + 0.05), (-0.19, f + 0.05)], SOLE - 0.004, SOLE + 0.002, 0.002, 1), 'rubber')
    ankle = Part('R.foot.ankle')
    ankle.add(rkit.drum((0, 0, 0), ANKLE_R, ANKLE_W, 'x'), 'darkSteel')
    return [p, ankle]


def build(coll):
    """Returns bone -> [objects]."""
    out = {}
    for S, s in (('L', 1), ('R', -1)):
        for bone, parts in (('thigh', thigh()), ('shin', shin()), ('foot', foot())):
            objs = []
            for part in parts:
                if s < 0:
                    part.b.verts = [Vector((-v.x, v.y, v.z)) for v in part.b.verts]
                    part.b.faces = [list(reversed(f)) for f in part.b.faces]
                part.name = part.name.replace('R.' + bone, 'R.%s.%s' % (bone, S))
                objs.append(part.build(coll, 0.005, 2, 30))
            out['%s.%s' % (bone, S)] = objs
    return out
