"""Torso endoskeleton: pelvis girdle + hip beam, hip carriages, spine, chest,
shoulder booms (bone-local rest coordinates).

Packaging datums from the fold: the hip carriages travel along the hip beam
from x = 0.24 (folded) to 0.40; the girdle mass sits behind the joint line so
the carriages can pass. The chest keeps a head well: the neck retracts 0.50 and
the head rides down into the chest top.
"""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, linkage
from .kit import V
from .rkit import Part

BALL_R = 0.155
CUP_R = 0.205
BEAM_Z = 0.265                # hip beam axis height above the hip joints (carriage seats on the cup flat)
CHEST_TOP = rig.NECK_Z - rig.CHEST_Z + 0.0   # 1.18
WELL_W, WELL_D = 0.60, 0.62   # head well opening (floor at 0.56: the tucked neck column clears it)
SPINE_F = -0.09               # spine column axis (clear of the girdle's front face)
PIVOT_H = 0.24                # boom pivot drum height; it sits below the telescope line
PIVOT_R = 0.10
SLEEVE = (-0.04, 0.16)        # outer sleeve on the pivot (clav frame x)
STAGE = (0.02, 0.36)          # middle stage at rest; retracted it stops short of the socket housing
PIVOT_ZC = -0.215             # drum centre (clav frame): its hub stays under the retracted stage
PIVOT_Z0 = PIVOT_ZC - PIVOT_H / 2 - 0.014   # drum bottom incl. hub
# shoulder telescope sections (f, z): sleeve outer / bore, middle stage outer / bore, inner stage.
# Sized as the arm's load path (a 2 m armoured arm on a 1.2 m reach), 5-8 mm running clearance.
BOOM_SECT = ((0.25, 0.21), (0.198, 0.163), (0.19, 0.155), (0.152, 0.122), (0.14, 0.11))
# tailgate swing arm (chest frame, fold pose): hinge axle on a bracket above the collar's front edge,
# turntable hub under the lid's inner face. A rigid arm: spin 180 deg on the hub, swing 90 deg over the edge.
TG_HINGE = (0.30, 1.29)
TG_HUB = (0.445, 1.462)
TG_ARM_W = 0.05
TG_YOKE_X = 0.35              # yoke arms outboard of the head well (0.30) and the head's ears


CUP_FLAT = math.radians(34)   # socket cups carry a machined flat on top for their bolt circle


# abdomen: three nested armour bands (pelvis, spine, chest), each outboard of the one below with
# 15 mm (x) / 30+ mm (f) running clearance for the spine and chest pitch, so the waist reads as
# one load path from the girdle to the chest
ABD_F = -0.10                  # band centreline (f)
ABD_T = 0.025                  # band wall
ABD_LOW = (0.37, 0.50, 0.70, 0.46)      # pelvis frame: z0, z1, outer w, outer d
ABD_MID = (0.06, 0.26, 0.78, 0.57)      # spine frame
ABD_TOP = (-0.22, 0.085, 0.86, 0.69)    # chest frame


def band(z0, z1, w, d, t=ABD_T, fc=ABD_F, lip=0.012):
    """Armour band: hollow chamfered ring with a slightly flared, rolled lower lip."""
    c = min(w, d) * 0.16
    outer = rkit.frame([(z0, w + lip, d + lip, c + lip * 0.5, fc), (z0 + 0.03, w, d, c, fc), (z1, w, d, c, fc)], cap=0.008)
    inner = rkit.plate_z([(x, f + fc) for x, f in kit.chamfer_rect(w - 2 * t, d - 2 * t, max(0.01, c - t * 0.6))], z0 - 0.05, z1 + 0.05, 0.0)
    return outer, inner


def cup_flat(r_out):
    """(height, radius) of a socket cup's machined top flat."""
    return r_out * math.cos(CUP_FLAT), r_out * math.sin(CUP_FLAT)


def sphere_cup(center, r_in, r_out, a0=0.0, a1=math.pi / 2, seg=28, n=8):
    """Spherical shell between polar angles a0..a1 (0 = pole), opening down, with
    a flat machined top face (see cup_flat) so fasteners sit on a real surface."""
    h, r = cup_flat(r_out)
    prof = [(0.0, h), (r, h)]
    for k in range(1, n + 1):
        a = CUP_FLAT + (a1 - CUP_FLAT) * k / n
        prof.append((r_out * math.sin(a), r_out * math.cos(a)))
    for k in range(n + 1):
        a = a1 - (a1 - a0) * k / n
        prof.append((r_in * math.sin(a), r_in * math.cos(a)))
    prof = [(max(r, 0.0), h) for r, h in prof]
    if a0 > 1e-6:
        prof.append(prof[0])
    return kit.revolve(prof, seg, M=Matrix.Translation(V(*center)))


def pelvis():
    p = Part('R.pelvis.girdle')
    # rear girdle: sits behind the hip joint line (f < -0.21) so the carriages can slide past
    p.add(rkit.frame([
        (-0.10, 0.44, 0.26, 0.06, -0.35),
        (0.04, 0.64, 0.27, 0.07, -0.355),
        (0.16, 0.74, 0.27, 0.07, -0.355),
        (0.30, 0.60, 0.24, 0.06, -0.34),
    ], cap=0.02), 'graphite')
    # battery back module (floor pan)
    p.add(rkit.plate_f([(x, z + 0.0) for x, z in kit.chamfer_rect(0.86, 0.50, 0.04)], -0.525, -0.47, 0.01), 'graphite')
    for k in range(4):
        z = -0.17 + k * 0.11
        p.add(rkit.plate_f([(x, zz + z) for x, zz in kit.chamfer_rect(0.78, 0.022, 0.006)], -0.532, -0.52, 0.003, 1), 'graphite')
    # hip beam: square section across the front of the girdle, above the joints
    beam = [(-0.52, BEAM_Z - 0.06), (0.52, BEAM_Z - 0.06), (0.52, BEAM_Z + 0.06), (-0.52, BEAM_Z + 0.06)]
    p.add(rkit.plate_f(beam, -0.20, -0.08, 0.008), 'mech')
    # beam end stops and the beam's saddle on the girdle
    for s in (1, -1):
        p.add(rkit.plate_x([(-0.22, BEAM_Z - 0.09), (-0.06, BEAM_Z - 0.09), (-0.06, BEAM_Z + 0.09), (-0.22, BEAM_Z + 0.09)],
                           *((0.52, 0.56) if s > 0 else (-0.56, -0.52)), 0.008), 'graphite')
    p.add(rkit.plate_f([(-0.11, BEAM_Z - 0.12), (0.11, BEAM_Z - 0.12), (0.11, BEAM_Z + 0.05), (-0.11, BEAM_Z + 0.05)], -0.26, -0.07, 0.01), 'graphite')
    # codpiece bracket off the beam's front face, above and between the tucked hip cups
    p.add(rkit.plate_x([(-0.085, BEAM_Z + 0.03), (0.235, BEAM_Z + 0.03), (0.235, 0.14), (-0.085, 0.14)], -0.02, 0.02, 0.004), 'graphite')
    # abdomen lower band: floor on the waist socket's shoulder, rear gussets down onto the girdle
    z0, z1, w, d = ABD_LOW
    outer, inner = band(z0, z1, w, d)
    p.add(outer, 'graphite', cuts=[inner])
    hole = rkit.bore((0, SPINE_F, z0 + 0.011), 0.14, 0.08, 'z', 28)
    p.add(rkit.plate_z([(x, f + ABD_F) for x, f in kit.chamfer_rect(w - 0.01, d - 0.01, 0.08)], z0, z0 + 0.022, 0.006), 'darkSteel', cuts=[hole])
    for s in (1, -1):
        x0, x1 = (0.15, 0.23) if s > 0 else (-0.23, -0.15)
        p.add(rkit.plate_f([(x0, 0.29), (x1, 0.29), (x1, z0 + 0.01), (x0, z0 + 0.01)], -0.34, -0.25, 0.006), 'graphite')
    # waist socket
    # waist socket seated on the hip beam; the spine column stands 3 mm above it
    p.add(rkit.cylinder((0, SPINE_F, rig.WAIST_Z - rig.HIP_Z - 0.03), 0.12, 0.06, 'z', 28), 'darkSteel')
    # codpiece: faceted plate in front of the carriages' travel
    p.add(rkit.plate_f([(-0.10, -0.24), (0.10, -0.24), (0.14, 0.06), (0.09, 0.16), (-0.09, 0.16), (-0.14, 0.06)], 0.225, 0.27, 0.01), 'steel')
    return [p]


def hip():
    """Carriage riding the hip beam, carrying the socket cup over the thigh ball."""
    p = Part('R.hip.carriage')
    # slot clears the beam (-0.20..-0.08) by 5 mm; block stays 2.5 mm off the girdle face
    slot = rkit.plate_f([(-0.20, BEAM_Z - 0.065), (0.20, BEAM_Z - 0.065), (0.20, BEAM_Z + 0.065), (-0.20, BEAM_Z + 0.065)], -0.205, -0.075, 0.0)
    block = rkit.plate_f([(-0.11, BEAM_Z - 0.10), (0.11, BEAM_Z - 0.10), (0.11, BEAM_Z + 0.10), (-0.11, BEAM_Z + 0.10)], -0.215, -0.02, 0.01)
    p.add(block, 'graphite', cuts=[slot])
    p.add(sphere_cup((0, 0, 0), BALL_R + 0.004, CUP_R, 0.0, math.radians(72)), 'darkSteel')
    h, r = cup_flat(CUP_R)
    p.many(rkit.bolt_ring((0, 0, h), 'z', r * 0.62, 8, 0.009, 0.006), 'chrome')
    return [p]


def spine():
    p = Part('R.spine.column')
    top = rig.CHEST_Z - rig.WAIST_Z
    # column seated 3 mm above the waist socket, 5 mm under the chest
    # 3.5 cm under the chest: the chest pitches up to ~14 deg on the spine
    p.add(kit.revolve([(0.0, 0.003), (0.11, 0.003), (0.12, 0.02), (0.12, top - 0.055), (0.11, top - 0.035), (0.0, top - 0.035)], 28,
                      M=Matrix.Translation(V(0, SPINE_F, 0))), 'darkSteel')
    # abdomen middle band, carried on a roof plate clamped round the column
    z0, z1, w, d = ABD_MID
    outer, inner = band(z0, z1, w, d)
    p.add(outer, 'graphite', cuts=[inner])
    hole = rkit.bore((0, SPINE_F, z1 - 0.03), 0.119, 0.08, 'z', 28)
    p.add(rkit.plate_z([(x, f + ABD_F) for x, f in kit.chamfer_rect(w - 0.01, d - 0.01, 0.09)], z1 - 0.045, z1 - 0.02, 0.006), 'darkSteel', cuts=[hole])
    # clamp collar on the column under the roof plate
    p.add(rkit.cylinder((0, SPINE_F, z1 - 0.065), 0.145, 0.04, 'z', 28, 0.006), 'mech')
    return [p]


def chest():
    p = Part('R.chest.core')
    core = rkit.frame([
        (0.00, 0.60, 0.38, 0.08, -0.12),
        (0.20, 0.96, 0.58, 0.12, -0.08),
        (0.56, 1.04, 0.80, 0.14, 0.0),
        (0.92, 1.04, 0.80, 0.14, 0.0),
        (1.10, 0.98, 0.78, 0.12, -0.01),
        (CHEST_TOP, 0.90, 0.76, 0.10, -0.01),
    ], cap=0.02)
    well = rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(WELL_W, WELL_D, 0.08)], 0.494, CHEST_TOP + 0.2, 0.0)   # 6 mm under the tucked neck skirt
    sleeves = []
    for s in (1, -1):
        # shoulder boom pivot pockets
        # open shoulder bay: pivot pocket plus the arc the boom sleeve sweeps when it swings forward
        bay = [(s * (rig.CLAV_X - 0.145), -0.24), (s * 0.70, -0.24), (s * 0.70, 0.46), (s * (rig.CLAV_X - 0.145), 0.46)]
        sleeves.append(rkit.plate_z(bay, PIVOT_Z0 - 0.003 + 1.0, 1.40, 0.0))
    lifts = linkage.bores_for('chest') + linkage.pockets_for('chest', ('vaultlift.low', 'vaultlift.high'))
    p.add(core, 'graphite', cuts=[well] + sleeves + lifts + tailgate_arm_slot())
    # tailgate yoke brackets on the collar, outboard of the head well (the head rises between them)
    hf, hz = TG_HINGE
    for s_ in (1, -1):
        for x0 in (TG_YOKE_X - 0.045, TG_YOKE_X + 0.027):
            xa, xb = (x0, x0 + 0.018) if s_ > 0 else (-x0 - 0.018, -x0)
            cheek = [(hf - 0.06, CHEST_TOP + 0.04), (hf + 0.05, CHEST_TOP + 0.04)] + \
                    [(hf + 0.05 * math.cos(math.pi * k / 10), hz + 0.05 * math.sin(math.pi * k / 10)) for k in range(11)] + \
                    [(hf - 0.06, hz)]
            p.add(rkit.plate_x(cheek, xa, xb, 0.004), 'graphite')
    # abdomen upper band hung from the chest's underside (its top plate closes the band into the frame)
    z0, z1, w, d = ABD_TOP
    outer, inner = band(z0, z1, w, d)
    p.add(outer, 'graphite', cuts=[inner])
    p.add(rkit.plate_z([(x, f + ABD_F) for x, f in kit.chamfer_rect(w - 0.01, d - 0.01, 0.10)], z1 - 0.028, z1, 0.006), 'darkSteel')
    # back: spine housing + battery module (floor pan)
    p.add(rkit.plate_f([(x, z + 0.62) for x, z in kit.chamfer_rect(1.02, 1.00, 0.06)], -0.505, -0.38, 0.012), 'graphite',
          cuts=linkage.bores_for('chest'))
    for k in range(6):
        z = 0.20 + k * 0.16
        p.add(rkit.plate_f([(x, zz + z) for x, zz in kit.chamfer_rect(0.92, 0.024, 0.006)], -0.517, -0.503, 0.003, 1), 'graphite')
    # well collar: faceted flange around the head well
    collar_in = rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(WELL_W, WELL_D, 0.08)], CHEST_TOP - 0.1, CHEST_TOP + 0.2, 0.0)
    p.add(rkit.plate_z([(x, f - 0.01) for x, f in kit.chamfer_rect(0.80, 0.80, 0.14)], CHEST_TOP - 0.012, CHEST_TOP + 0.05, 0.008), 'darkSteel',
          cuts=[collar_in] + tailgate_arm_slot())
    return [p]


def tailgate_arm_final():
    """Hub centre of the swung arm (f, z): the arm swings +90 deg about the hinge axle."""
    hf, hz = TG_HINGE
    uf, uz = TG_HUB
    return hf + (uz - 0.036 - hz), hz - (uf - hf)


def tailgate_arm_slot():
    """Reliefs in the chest's top-front edge for the swung yoke arms (8 mm clear all round)."""
    hf, hz = TG_HINGE
    ef, ez = tailgate_arm_final()
    w = TG_ARM_W + 0.016
    out = []
    for s_ in (1, -1):
        x = s_ * TG_YOKE_X
        out.append(kit.bar(V(x, hf, hz), V(x, ef + 0.02 * (ef - hf), ez + 0.02 * (ez - hz)), kit.chamfer_rect(w, 0.066, 0.01), up=(1, 0, 0)))
    return out


def tailgate_arm():
    """Swing yoke (moving): two arms on axle knuckles outboard of the head well, a crossbar under
    the lid, and the turntable hub at its centre."""
    p = Part('tgarm')
    hf, hz = TG_HINGE
    uf, uz = TG_HUB
    hub = (uf, uz - 0.036)
    for s_ in (1, -1):
        x = s_ * TG_YOKE_X
        p.add(rkit.cylinder((x, hf, hz), 0.034, 0.046, 'x', 24, 0.004), 'darkSteel')
        p.add(kit.bar(V(x, hf, hz), V(x, *hub), kit.chamfer_rect(TG_ARM_W, 0.05, 0.012), kit.chamfer_rect(TG_ARM_W - 0.008, 0.042, 0.01), up=(1, 0, 0)), 'mech')
    # crossbar under the lid joining the arm ends; the hub rides on it
    p.add(kit.bar(V(-TG_YOKE_X - TG_ARM_W / 2, *hub), V(TG_YOKE_X + TG_ARM_W / 2, *hub), kit.chamfer_rect(0.05, 0.042, 0.01), up=(0, 0, 1)), 'mech')
    # hub: bearing ring + turntable disc bolted to the lid (stops 2 mm under the inner face; the
    # tonneau's tail edge is 4 mm beyond its rim at the fold)
    p.add(rkit.cylinder((0.0, uf, uz - 0.03), 0.034, 0.03, 'z', 24, 0.004), 'darkSteel')
    p.add(rkit.cylinder((0.0, uf, uz - 0.0105), 0.045, 0.013, 'z', 28, 0.003), 'mech')
    p.many(rkit.bolt_ring((0.0, uf, uz - 0.004), 'z', 0.031, 5, 0.006, 0.0035), 'chrome')
    return p


def clav(s):
    """Boom pivot: vertical drum seated in the chest pocket, carrying the outer sleeve."""
    p = Part('R.clav.pivot')
    p.add(rkit.drum((0.0, 0.0, PIVOT_ZC), PIVOT_R, PIVOT_H, 'z'), 'darkSteel')
    hole = rkit.plate_x(kit.chamfer_rect(*BOOM_SECT[1], 0.02), -0.3, 0.9, 0.0)
    p.add(rkit.plate_x(kit.chamfer_rect(*BOOM_SECT[0], 0.035), SLEEVE[0], SLEEVE[1], 0.008), 'graphite', cuts=[hole])
    # gland collar at the sleeve mouth
    p.add(rkit.plate_x(kit.chamfer_rect(BOOM_SECT[0][0] + 0.02, BOOM_SECT[0][1] + 0.02, 0.04), SLEEVE[1] - 0.035, SLEEVE[1], 0.006), 'darkSteel', cuts=[hole])
    return [p]


def boom(s):
    """Telescope middle stage."""
    p = Part('R.boom.stage')
    hole = rkit.plate_x(kit.chamfer_rect(*BOOM_SECT[3], 0.016), -0.3, 0.9, 0.0)
    p.add(rkit.plate_x(kit.chamfer_rect(*BOOM_SECT[2], 0.024), STAGE[0], STAGE[1], 0.006), 'mech', cuts=[hole])
    return [p]


def yoke(s):
    """Telescope inner stage and the shoulder socket at its end."""
    p = Part('R.yoke.boom')
    L = rig.SHOULDER_X - rig.CLAV_X
    p.add(rkit.plate_x(kit.chamfer_rect(*BOOM_SECT[4], 0.018), STAGE[0] + 0.16, L - 0.20, 0.004), 'chrome')
    # socket housing around the shoulder ball
    p.add(sphere_cup((L, 0, 0), 0.144, 0.19, 0.0, math.radians(70)), 'darkSteel')
    # socket housing flange; its rear lip is trimmed so the retracted housing clears the rear wheel-well liner
    p.add(rkit.plate_x([(-0.075, -0.09), (0.14, -0.09), (0.14, 0.14), (-0.075, 0.14)], L - 0.22, L - 0.15, 0.01), 'graphite')
    h, r = cup_flat(0.19)
    p.many(rkit.bolt_ring((L, 0, h), 'z', r * 0.62, 8, 0.008, 0.006), 'chrome')
    return [p]


def build(coll):
    out = {}
    for bone, parts in (('pelvis', pelvis()), ('spine', spine()), ('chest', chest())):
        out[bone] = [pt.build(coll, 0.006, 2, 30) for pt in parts]
    arm = tailgate_arm().build(coll, 0.003, 2, 30)
    arm['bone_local'] = 'chest'          # mechanism node (choreo 'tgarm'), not rigid structure
    for S, s in (('L', 1), ('R', -1)):
        for bone, parts in (('hip', hip()), ('clav', clav(s)), ('boom', boom(s)), ('yoke', yoke(s))):
            objs = []
            for part in parts:
                if s < 0:
                    part.b.verts = [Vector((-v.x, v.y, v.z)) for v in part.b.verts]
                    part.b.faces = [list(reversed(f)) for f in part.b.faces]
                part.name = part.name.replace('R.' + bone, 'R.%s.%s' % (bone, S))
                objs.append(part.build(coll, 0.005, 2, 30))
            out['%s.%s' % (bone, S)] = objs
    return out
