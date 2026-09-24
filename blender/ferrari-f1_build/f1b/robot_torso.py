"""Torso endoskeleton (bone-local rest coordinates): chest cage, shoulder yoke
and slides, segmented waist with its rams, pelvis with the hip beam.

The chest is a mechanical cage the armour sits on: a spine block at the back,
curved rib bars wrapping forward under the pecs, a transverse shoulder yoke,
lat plates tapering to the waist (the V), a vertebral ridge down the back.
The waist is a narrow column of stacked machined rings between two pairs of
rams; the pelvis is a cast block with the hip beam the leg carriages ride on.
"""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, mechkit
from .kit import V
from .rkit import Part
from .shape import lathe

BEAM_Z, BEAM_F, BEAM_H, BEAM_D = 0.160, -0.020, 0.070, 0.080     # hip beam axis / section (pelvis frame)
BEAM_X = 0.345
CUP_FLAT = math.radians(34)
SPINE_F = -0.040


def cup_flat(r_out):
    return r_out * math.cos(CUP_FLAT), r_out * math.sin(CUP_FLAT)


def sphere_cup(center, r_in, r_out, a0=0.0, a1=math.pi / 2, seg=28, n=8):
    """Spherical shell opening down with a machined top flat."""
    h, r = cup_flat(r_out)
    prof = [(0.0, h), (r, h)]
    for k in range(1, n + 1):
        a = CUP_FLAT + (a1 - CUP_FLAT) * k / n
        prof.append((r_out * math.sin(a), r_out * math.cos(a)))
    for k in range(n + 1):
        a = a1 - (a1 - a0) * k / n
        prof.append((r_in * math.sin(a), r_in * math.cos(a)))
    prof = [(max(rr, 0.0), hh) for rr, hh in prof]
    if a0 > 1e-6:
        prof.append(prof[0])
    return kit.revolve(prof, seg, M=Matrix.Translation(V(*center)))


# -------------------------------------------------------------------- pelvis
def pelvis():
    p = Part('R.pelvis.girdle')
    # cast block, narrow at the waist socket, flaring to the hip beam
    p.add(rkit.frame([(-0.120, 0.220, 0.200, 0.050, -0.030), (0.000, 0.300, 0.240, 0.060, -0.030),
                      (0.110, 0.360, 0.250, 0.060, -0.040), (0.200, 0.240, 0.200, 0.050, -0.040)], cap=0.016), 'graphite')
    beam = [(BEAM_F - BEAM_D / 2, BEAM_Z - BEAM_H / 2), (BEAM_F + BEAM_D / 2, BEAM_Z - BEAM_H / 2),
            (BEAM_F + BEAM_D / 2, BEAM_Z + BEAM_H / 2), (BEAM_F - BEAM_D / 2, BEAM_Z + BEAM_H / 2)]
    p.add(rkit.plate_x(beam, -BEAM_X, BEAM_X, 0.006), 'mech')
    for s in (1, -1):
        stop = [(BEAM_F - 0.062, BEAM_Z - 0.060), (BEAM_F + 0.062, BEAM_Z - 0.060), (BEAM_F + 0.062, BEAM_Z + 0.060), (BEAM_F - 0.062, BEAM_Z + 0.060)]
        p.add(rkit.plate_x(stop, *((BEAM_X, BEAM_X + 0.030) if s > 0 else (-BEAM_X - 0.030, -BEAM_X)), 0.006), 'darkSteel')
        # glute plates: carbon, angled, behind the hip joints
        p.add(rkit.plate_f([(s * 0.060, -0.140), (s * 0.250, -0.100), (s * 0.270, 0.100), (s * 0.080, 0.150)], -0.200, -0.176, 0.006), 'carbon')
    # waist socket collar
    top = rig.WAIST_Z - rig.HIP_Z
    p.add(lathe([(0.100, top - 0.090), (0.128, top - 0.090), (0.134, top - 0.080), (0.134, top - 0.040), (0.124, top - 0.030), (0.100, top - 0.030)],
                32, 'z', closed=True), 'darkSteel')
    p.many([m for m, s in mechkit.bolt_row((-0.10, 0.100, 0.060), (0.10, 0.100, 0.060), 4, (0, -1, 0))], 'gold')
    return [p]


# --------------------------------------------------------------------- spine
def spine():
    p = Part('R.spine.column')
    top = rig.CHEST_Z - rig.WAIST_Z
    # central column with stacked machined rings (the narrow mechanical waist)
    p.add(kit.revolve([(0.0, -0.090), (0.070, -0.090), (0.076, -0.080), (0.076, top - 0.020), (0.0, top - 0.020)], 28,
                      M=Matrix.Translation(V(0, SPINE_F, 0))), 'darkSteel')
    for k, (z, r) in enumerate(((0.020, 0.150), (0.085, 0.132), (0.150, 0.146), (0.212, 0.160))):
        prof = [(0.070, z - 0.022), (r - 0.010, z - 0.022), (r, z - 0.012), (r, z + 0.012), (r - 0.010, z + 0.022), (0.070, z + 0.022)]
        p.add(lathe(prof, 36, 'z', closed=True), 'graphite' if k % 2 else 'mech')
    # obliques: carbon side plates
    for s in (1, -1):
        p.add(rkit.plate_x([(-0.090, -0.040), (0.080, -0.030), (0.100, 0.230), (-0.110, 0.240)], *((0.150, 0.168) if s > 0 else (-0.168, -0.150)), 0.005), 'carbon')
    # two pairs of rams from the pelvis up to the chest
    for s in (1, -1):
        for f in (0.110, -0.150):
            for m, sl in mechkit.ram((s * 0.118, f, -0.100), (s * 0.150, f + 0.010, top + 0.050), 0.022, 0.010, 0.46):
                p.add(m, sl)
    for s in (1, -1):
        p.many([m for m, sl in mechkit.cable([(s * 0.060, -0.140, -0.080), (s * 0.090, -0.170, 0.100), (s * 0.070, -0.150, top + 0.020)], 0.010)], 'rubber')
    return [p]


# --------------------------------------------------------------------- chest
def chest():
    p = Part('R.chest.core')
    # inner volume the pecs sit on
    p.add(rkit.frame([(0.000, 0.360, 0.280, 0.060, -0.030), (0.150, 0.600, 0.380, 0.080, -0.010), (0.450, 0.720, 0.400, 0.090, -0.010),
                      (0.660, 0.640, 0.340, 0.080, -0.020), (0.740, 0.380, 0.260, 0.060, -0.030)], cap=0.018), 'graphite')
    # spine block at the back with a vertebral ridge
    p.add(rkit.frame([(0.000, 0.240, 0.140, 0.040, -0.190), (0.720, 0.240, 0.140, 0.040, -0.190)], cap=0.014), 'mech')
    for k in range(8):
        z = 0.040 + k * 0.085
        p.add(rkit.plate_f([(x, zz + z) for x, zz in kit.chamfer_rect(0.110, 0.050, 0.012)], -0.290, -0.255, 0.005), 'darkSteel')
    # rib bars wrapping forward from the spine block under the pecs
    for s in (1, -1):
        for k in range(4):
            z = 0.090 + k * 0.095
            path = [(s * 0.100, -0.200, z), (s * 0.320, -0.140, z + 0.010), (s * 0.385, 0.000, z + 0.020), (s * 0.320, 0.150, z + 0.030)]
            p.add(rkit.hose(path, 0.020), 'mech')
    # lats: plates from under the arms tapering to the waist (the V)
    for s in (1, -1):
        out = [(0.200, 0.020), (-0.150, 0.040), (-0.180, 0.460), (0.160, 0.520)]
        p.add(rkit.plate_x(out, *((0.340, 0.362) if s > 0 else (-0.362, -0.340)), 0.006), 'carbon')
    # shoulder yoke: the transverse beam the clavicle slides run in
    yoke = [(-0.110, 0.550), (0.110, 0.550), (0.110, 0.700), (-0.110, 0.700)]
    p.add(rkit.plate_x(yoke, -0.480, 0.480, 0.010), 'mech')
    p.many([m for m, sl in mechkit.bolt_row((-0.440, 0.112, 0.625), (0.440, 0.112, 0.625), 10, (0, -1, 0))], 'gold')
    # back plate with ribs (the backpack docks on it)
    p.add(rkit.plate_f([(x, z + 0.360) for x, z in kit.chamfer_rect(0.560, 0.620, 0.06)], -0.250, -0.226, 0.008), 'carbon')
    # neck collar
    p.add(lathe([(0.120, 0.720), (0.170, 0.720), (0.182, 0.734), (0.182, 0.770), (0.168, 0.784), (0.120, 0.784)], 32, 'z', closed=True), 'darkSteel')
    return [p]


def clav():
    """Shoulder slide: bar running in the yoke, the socket housing and a gear disc at its end."""
    from .robot_legs import ball
    p = Part('R.clav.slide')
    L = rig.SHOULDER_X - rig.CLAV_X
    bar = [(-0.080, -0.050), (0.080, -0.050), (0.080, 0.050), (-0.080, 0.050)]
    p.add(rkit.plate_x(bar, 0.120, L - 0.100, 0.008), 'mech')
    p.add(sphere_cup((L, 0, 0), 0.089, 0.124, 0.0, math.radians(70)), 'darkSteel')
    p.add(rkit.plate_x([(-0.090, -0.080), (0.090, -0.080), (0.090, 0.090), (-0.090, 0.090)], L - 0.140, L - 0.096, 0.010), 'graphite')
    for m, sl in mechkit.gear_disc((L - 0.118, 0.0, 0.0), 'x', 0.100, 0.030, teeth=0, bolts=8):
        p.add(m, sl)
    return [p]


def build(coll):
    out = {}
    for bone, parts in (('pelvis', pelvis()), ('spine', spine()), ('chest', chest())):
        out[bone] = [pt.build(coll, 0.005, 2, 30) for pt in parts]
    for S, s in (('L', 1), ('R', -1)):
        objs = []
        for part in clav():
            if s < 0:
                part.b.verts = [Vector((-v.x, v.y, v.z)) for v in part.b.verts]
                part.b.faces = [list(reversed(f)) for f in part.b.faces]
            part.name = part.name.replace('R.clav', 'R.clav.' + S)
            objs.append(part.build(coll, 0.004, 2, 30))
        out['clav.' + S] = objs
    return out
