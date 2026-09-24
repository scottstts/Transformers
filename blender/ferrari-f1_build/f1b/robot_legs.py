"""Leg endoskeleton (bone-local rest coordinates, L side authored, R mirrored).

Sized from the fold: the thigh lies inside the engine-cover sleeve (inner half
width 0.32, depth 0.52), the shin inside the gearbox sleeve (0.27, 0.30), the
foot stands toes-down in the tail with its sole on the rear face of the car
(ankle to sole 0.24, heel 0.12 behind the ankle, toe tip 0.38 ahead).
The sleeves wrap the outer, front and back faces; the medial face shows the
structure, so the knee actuator runs down the inside of the thigh.
"""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig
from .kit import V
from .rkit import Part

KNEE_R, KNEE_W = 0.088, 0.140          # knee drum (shin), between the thigh cheeks
CHEEK_IN = 0.074                        # cheek inner face (x): 4 mm clear of the drum hubs
ANKLE_R, ANKLE_W = 0.074, 0.124
ANKLE_CHEEK_IN = 0.066
BALL_R = 0.100                          # thigh ball in the hip carriage's cup
SOLE = -rig.ANKLE_Z
HEEL_F, TOE_TIP_F = -0.125, 0.380


def mirror_part(part, name_side):
    part.b.verts = [Vector((-v.x, v.y, v.z)) for v in part.b.verts]
    part.b.faces = [list(reversed(f)) for f in part.b.faces]


def cheeks(pivot_z, top_z, r, f_half, x_in, thick, fc=0.0):
    out = []
    outline = rkit.cheek_outline(top_z, pivot_z, f_half, r, fc)
    for s in (1, -1):
        x0, x1 = (x_in, x_in + thick) if s > 0 else (-x_in - thick, -x_in)
        out.append(rkit.plate_x(outline, x0, x1, 0.005))
    return out


def axle_caps(pivot_z, x_out, r=0.05, fc=0.0):
    out = []
    for s in (1, -1):
        out.append(rkit.cylinder((s * (x_out + 0.010), fc, pivot_z), r, 0.020, 'x', 24))
        out += rkit.bolt_ring((s * (x_out + 0.020), fc, pivot_z), (s, 0, 0), r * 0.62, 6, 0.007, 0.005)
    return out


def ball(r, seg=28):
    return kit.revolve([(0.0, -r)] + [(r * math.sin(math.pi * k / 12), -r * math.cos(math.pi * k / 12)) for k in range(1, 12)] + [(0.0, r)], seg)


def actuator(p0, p1, r_body, r_rod, split=0.55):
    """Hydraulic ram between two design points: cylinder body, gland, chrome rod, eye ends."""
    a, b = V(*p0), V(*p1)
    d = (b - a)
    L = d.length
    u = d / L
    m = a + u * (L * split)
    out = []
    body = kit.bar(a, m, kit.chamfer_rect(r_body * 2, r_body * 2, r_body * 0.5), kit.chamfer_rect(r_body * 2, r_body * 2, r_body * 0.5))
    out.append((body, 'mech'))
    gland = kit.bar(m - u * 0.02, m + u * 0.015, kit.chamfer_rect(r_body * 2.3, r_body * 2.3, r_body * 0.7))
    out.append((gland, 'darkSteel'))
    rod = kit.tube([m - u * 0.03, b - u * 0.01], r_rod, 16)
    out.append((rod, 'chrome'))
    for p in (a, b):
        out.append((kit.tube([p - V(0.018, 0, 0), p + V(0.018, 0, 0)], r_body * 0.9, 16), 'darkSteel'))
    return out


# ---------------------------------------------------------------------- hip
def hip():
    """Carriage on the pelvis's hip beam carrying the socket cup over the thigh ball."""
    from .robot_torso import BEAM_Z, BEAM_F, BEAM_H, BEAM_D, sphere_cup, cup_flat
    p = Part('R.hip.carriage')
    slot = rkit.plate_x([(BEAM_F - BEAM_D / 2 - 0.004, BEAM_Z - BEAM_H / 2 - 0.004), (BEAM_F + BEAM_D / 2 + 0.004, BEAM_Z - BEAM_H / 2 - 0.004),
                         (BEAM_F + BEAM_D / 2 + 0.004, BEAM_Z + BEAM_H / 2 + 0.004), (BEAM_F - BEAM_D / 2 - 0.004, BEAM_Z + BEAM_H / 2 + 0.004)], -0.3, 0.3, 0.0)
    block = rkit.plate_x([(BEAM_F - BEAM_D / 2 - 0.012, BEAM_Z - 0.062), (BEAM_F + BEAM_D / 2 + 0.014, BEAM_Z - 0.062),
                          (BEAM_F + BEAM_D / 2 + 0.014, BEAM_Z + 0.056), (BEAM_F - BEAM_D / 2 - 0.012, BEAM_Z + 0.056)], -0.075, 0.075, 0.008)
    p.add(block, 'mech', cuts=[slot])
    p.add(sphere_cup((0, 0, 0), BALL_R + 0.004, 0.138, 0.0, math.radians(72)), 'darkSteel')
    h, r = cup_flat(0.138)
    p.many(rkit.bolt_ring((0, 0, h), 'z', r * 0.62, 8, 0.007, 0.005), 'titanium')
    # strut from the cup flat up into the carriage block
    p.add(rkit.plate_x([(-0.040, h - 0.004), (0.040, h - 0.004), (0.040, BEAM_Z - 0.060), (-0.040, BEAM_Z - 0.060)], -0.035, 0.035, 0.006), 'mech')
    return [p]


# -------------------------------------------------------------------- thigh
def thigh():
    p = Part('R.thigh.frame')
    p.add(rkit.frame([
        (-0.095, 0.150, 0.180, 0.040, 0.0),
        (-0.200, 0.200, 0.240, 0.055, 0.0),
        (-0.520, 0.210, 0.235, 0.055, 0.0),
        (-0.690, 0.180, 0.220, 0.050, -0.010),
        (-0.745, 0.150, 0.210, 0.045, -0.012),
    ], cap=0.018), 'carbon')
    # knee clevis (the drum sits between the cheeks)
    p.many(cheeks(-rig.THIGH, -0.700, 0.100, 0.100, CHEEK_IN, 0.036, -0.010), 'carbon')
    p.many(axle_caps(-rig.THIGH, CHEEK_IN + 0.036, 0.052, -0.010), 'darkSteel')
    # front plate (quadriceps) and rear plate (hamstring) standing on the frame
    p.add(rkit.plate_f([(-0.070, -0.24), (0.070, -0.24), (0.065, -0.62), (0.0, -0.67), (-0.065, -0.62)], 0.110, 0.130, 0.004), 'mech')
    p.add(rkit.plate_f([(-0.070, -0.26), (0.070, -0.26), (0.060, -0.60), (-0.060, -0.60)], -0.130, -0.110, 0.004), 'mech')
    # knee ram down the back of the thigh, over the hamstring plate (the legs lie together in the car)
    for m, s in actuator((0.0, -0.196, -0.215), (0.0, -0.160, -0.705), 0.026, 0.012, 0.58):
        p.add(m, s)
    b = Part('R.thigh.ball')
    b.add(ball(BALL_R), 'darkSteel')
    b.add(rkit.cylinder((0, 0, -0.085), 0.066, 0.060, 'z', 24), 'darkSteel')
    return [p, b]


# --------------------------------------------------------------------- shin
def shin():
    p = Part('R.shin.frame')
    p.add(rkit.frame([
        (-0.060, 0.120, 0.160, 0.035, 0.0),       # narrower than the cheek gap inside their swing radius
        (-0.170, 0.215, 0.265, 0.060, -0.010),
        (-0.540, 0.205, 0.250, 0.058, -0.010),
        (-0.660, 0.165, 0.200, 0.048, 0.000),
        (-0.705, 0.120, 0.170, 0.036, 0.000),     # ends 12 mm above the ankle drum
    ], cap=0.016), 'carbon')
    p.many(cheeks(-rig.SHIN, -0.700, 0.080, 0.082, ANKLE_CHEEK_IN, 0.032), 'carbon')
    p.many(axle_caps(-rig.SHIN, ANKLE_CHEEK_IN + 0.032, 0.044), 'darkSteel')
    # tibial plate: faceted, painted (a livery accent visible between the sleeve halves)
    p.add(rkit.plate_f([(-0.085, -0.22), (0.085, -0.22), (0.075, -0.60), (0.0, -0.645), (-0.075, -0.60)], 0.110, 0.130, 0.006), 'paint')
    p.add(rkit.hose([(-0.094, -0.080, -0.190), (-0.116, -0.090, -0.40), (-0.110, -0.080, -0.60), (-0.084, -0.050, -0.690)], 0.012), 'rubber')
    knee = Part('R.shin.knee')
    knee.add(rkit.drum((0, 0, 0), KNEE_R, KNEE_W, 'x'), 'darkSteel')
    knee.many(rkit.bolt_ring((0, 0, 0), 'x', KNEE_R * 0.6, 8, 0.008, 0.005, KNEE_W / 2 - 0.001), 'titanium')
    knee.many(rkit.bolt_ring((0, 0, 0), (-1, 0, 0), KNEE_R * 0.6, 8, 0.008, 0.005, KNEE_W / 2 - 0.001), 'titanium')
    return [p, knee]


# --------------------------------------------------------------------- foot
def foot():
    p = Part('R.foot.body')
    # side profile: heel block, instep rising to the ankle tower, forefoot to the toe hinge
    base = [(HEEL_F, SOLE + 0.024), (rig.TOE_F - 0.006, SOLE + 0.024), (rig.TOE_F - 0.006, SOLE + 0.130),
            (0.140, SOLE + 0.150), (0.060, -0.085), (-0.080, -0.085), (HEEL_F, SOLE + 0.150)]
    p.add(rkit.plate_x(base, -0.085, 0.085, 0.010, 2), 'graphite')
    tower = [(-0.075, -0.100), (0.080, -0.100), (0.066, -0.020), (0.0, 0.030), (-0.060, -0.020)]
    p.add(rkit.plate_x(tower, -ANKLE_CHEEK_IN + 0.010, ANKLE_CHEEK_IN - 0.010, 0.006), 'carbon')
    # heel counter and instep plate
    p.add(rkit.plate_x([(HEEL_F - 0.012, SOLE + 0.030), (HEEL_F + 0.050, SOLE + 0.030), (HEEL_F + 0.090, -0.090),
                        (HEEL_F + 0.020, -0.105), (HEEL_F - 0.012, -0.130)], -0.112, 0.112, 0.006), 'mech')
    p.add(rkit.plate_f([(-0.092, -0.095), (0.092, -0.095), (0.084, -0.080), (-0.084, -0.080)], 0.02, 0.15, 0.004), 'mech')
    # sole: in the car it is the rear face (the soles stand side by side as the tail), so it is a
    # carbon plate with rubber tread pads and a recessed rain-light lens in the heel
    lens_pocket = rkit.plate_z([(-0.072, HEEL_F + 0.012), (0.072, HEEL_F + 0.012), (0.072, HEEL_F + 0.058), (-0.072, HEEL_F + 0.058)],
                               SOLE - 0.02, SOLE + 0.012, 0.0)
    p.add(rkit.plate_z([(-0.108, HEEL_F - 0.004), (0.108, HEEL_F - 0.004), (0.108, rig.TOE_F - 0.008), (-0.108, rig.TOE_F - 0.008)],
                       SOLE, SOLE + 0.024, 0.005), 'carbon', cuts=[lens_pocket])
    p.add(rkit.plate_z([(-0.066, HEEL_F + 0.018), (0.066, HEEL_F + 0.018), (0.066, HEEL_F + 0.052), (-0.066, HEEL_F + 0.052)],
                       SOLE + 0.006, SOLE + 0.014, 0.002, 1), 'lightRed')
    for k in range(3):
        f = HEEL_F + 0.090 + k * 0.080
        p.add(rkit.plate_z([(-0.096, f), (0.096, f), (0.096, f + 0.046), (-0.096, f + 0.046)], SOLE - 0.005, SOLE + 0.002, 0.0015, 1), 'rubber')
    for x in (-0.096, 0.056):
        p.add(rkit.plate_z([(x, HEEL_F + 0.004), (x + 0.040, HEEL_F + 0.004), (x + 0.040, HEEL_F + 0.066), (x, HEEL_F + 0.066)],
                           SOLE - 0.005, SOLE + 0.002, 0.0015, 1), 'rubber')
    ankle = Part('R.foot.ankle')
    ankle.add(rkit.drum((0, 0, 0), ANKLE_R, ANKLE_W, 'x'), 'darkSteel')
    return [p, ankle]


def toe():
    """Toe block hinged at the ball of the foot (bone-local: hinge at the origin)."""
    p = Part('R.toe.cap')
    tz = SOLE + 0.07 - 0.07          # hinge sits 0.07 above the sole: toe frame z = 0 there
    prof = [(0.004, -0.070 + 0.024), (TOE_TIP_F - rig.TOE_F - 0.030, -0.070 + 0.024), (TOE_TIP_F - rig.TOE_F, -0.030),
            (TOE_TIP_F - rig.TOE_F - 0.040, 0.050), (0.004, 0.058)]
    p.add(rkit.plate_x(prof, -0.100, 0.100, 0.010, 2), 'carbon')
    p.add(rkit.plate_z([(-0.100, 0.006), (0.100, 0.006), (0.100, TOE_TIP_F - rig.TOE_F - 0.030), (-0.100, TOE_TIP_F - rig.TOE_F - 0.030)],
                       -0.070, -0.046, 0.005), 'rubber')
    p.add(rkit.cylinder((0, 0.0, 0.0), 0.030, 0.19, 'x', 20), 'darkSteel')
    return [p]


def build(coll):
    """Returns bone -> [objects]."""
    out = {}
    for S, s in (('L', 1), ('R', -1)):
        for bone, parts in (('hip', hip()), ('thigh', thigh()), ('shin', shin()), ('foot', foot()), ('toe', toe())):
            objs = []
            for part in parts:
                if s < 0:
                    mirror_part(part, S)
                part.name = part.name.replace('R.' + bone, 'R.%s.%s' % (bone, S))
                objs.append(part.build(coll, 0.004, 2, 30))
            out['%s.%s' % (bone, S)] = objs
    return out
