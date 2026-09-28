"""Torso endoskeleton and armour (bone-local rest coordinates): the pelvis girdle
with a pointed codpiece and angular hip skirts, the exposed mechanical waist
(stacked rings, copper rams, oblique ribs), the chest core the front clip's
chevron docks on (cheek plates as the pectorals, the beak as the keel), the
shoulder sockets, the collar and the back frame the canopy seats on and the
jet pod rides up.

In the car the torso lies face down on the legs, its back carrying the canopy,
so the chest core stays shallow; the chevron and its own collar plates are
its visible front in robot mode."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, hardsurf as hs
from .kit import V
from .rkit import Part
from .shape import lathe
from .rcommon import ram, items
from .robot_head import plate

CHEST_W = 1.44          # core width at the shoulder line (front face)
CHEST_FRONT = 0.30      # front face (f), under the chevron
CHEST_BACK = -0.30      # back face (f): the canopy is the torso's back shell over it
BACK_HW = 0.62          # half width of the back face (the section tapers to fit the canopy)
CHEST_TOP = rig.NECK_Z - rig.CHEST_Z - 0.04
SOCKET_X = 0.80         # shoulder socket face (x)


def facet_block(stations, bevel_frac=0.22):
    """Lofted faceted block: [(z, half width, front f, back f[, back half width])] bottom -> top;
    chamfered corners; the back face may be narrower (a tapered section)."""
    rings = []
    for st in stations:
        z, hw, f0, f1 = st[:4]
        hb = st[4] if len(st) > 4 else hw
        c = bevel_frac * min(hw, hb, (f0 - f1) / 2)
        pts = [(hw - c, f0), (-hw + c, f0), (-hw, f0 - c), (-hb, f1 + c), (-hb + c, f1), (hb - c, f1), (hb, f1 + c), (hw, f0 - c)]
        rings.append([V(x, f, z) for x, f in pts])
    return kit.loft(rings, True, True)


# -------------------------------------------------------------------- pelvis
def pelvis():
    p = Part('R.pelvis.girdle')
    p.add(facet_block([(-0.26, 0.30, 0.20, -0.26), (-0.06, 0.50, 0.28, -0.32), (0.16, 0.52, 0.26, -0.30), (0.30, 0.34, 0.18, -0.22)]), 'graphite')
    p.add(rkit.cylinder((0, 0, 0.0), 0.14, 2 * rig.HIP_X - 0.08, 'x', 32), 'darkSteel')
    top = rig.WAIST_Z - rig.HIP_Z
    p.add(lathe([(0.20, top - 0.08), (0.30, top - 0.08), (0.32, top - 0.06), (0.32, top - 0.01), (0.30, top), (0.20, top)], 40, 'z', closed=True), 'darkSteel')
    a = Part('R.pelvis.armor')
    # codpiece: a pointed black plate with a dark inset and a bronze keel line
    cod = [(-0.30, 0.22, 0.26), (0.30, 0.22, 0.26), (0.26, 0.30, -0.02), (0.10, 0.34, -0.26), (0.0, 0.35, -0.34), (-0.10, 0.34, -0.26),
           (-0.26, 0.30, -0.02)]
    a.add(plate(cod, 0.10), 'armor')
    a.add(plate([(x * 0.45, f + 0.012, z * 0.6 - 0.02) for x, f, z in cod], 0.02), 'armorDark')
    for s in (1, -1):
        # angular hip skirts over the outer hips, a butt plate behind
        sk = [(s * 0.36, 0.24, 0.26), (s * 0.66, 0.16, 0.20), (s * 0.72, 0.10, -0.12), (s * 0.58, 0.14, -0.30), (s * 0.40, 0.22, -0.08)]
        a.add(plate(sk, 0.08), 'armor')
        a.add(rkit.plate_f([(s * 0.10, 0.24), (s * 0.46, 0.24), (s * 0.42, -0.16), (s * 0.16, -0.10)], -0.33, -0.27, 0.02), 'armor')
    return [p, a]


# -------------------------------------------------------------------- spine
def spine():
    p = Part('R.spine.column')
    top = rig.CHEST_Z - rig.WAIST_Z
    p.add(kit.revolve([(0.0, -0.06), (0.16, -0.06), (0.18, -0.04), (0.18, top - 0.02), (0.0, top - 0.02)], 36,
                      M=Matrix.Translation(V(0, 0.0, 0))), 'darkSteel')
    for k, (z, r) in enumerate(((0.05, 0.27), (0.15, 0.24), (0.25, 0.26))):
        prof = [(0.17, z - 0.04), (r - 0.025, z - 0.04), (r, z - 0.02), (r, z + 0.02), (r - 0.025, z + 0.04), (0.17, z + 0.04)]
        p.add(lathe(prof, 16, 'z', closed=True, center=(0, 0.0, 0)), 'graphite' if k % 2 else 'mech')
    for s in (1, -1):
        for f in (0.14, -0.14):
            items(p, ram((s * 0.30, f, -0.10), (s * 0.28, f, top + 0.10), 0.04, 0.019))
        for k in range(3):
            z = 0.02 + k * 0.10
            p.add(plate([(s * 0.22, 0.30, z), (s * 0.44, 0.22, z + 0.08), (s * 0.48, 0.20, z + 0.13), (s * 0.26, 0.31, z + 0.05)], 0.05), 'darkSteel')
    # the abdominal keel: a narrow pointed plate the beak's tip rests over
    a = Part('R.spine.plate')
    a.add(plate([(-0.16, 0.34, 0.34), (0.16, 0.34, 0.34), (0.10, 0.36, 0.02), (0.0, 0.37, -0.10), (-0.10, 0.36, 0.02)], 0.06), 'armor')
    return [p, a]


# -------------------------------------------------------------------- chest
def chest():
    from .refine import chest as breastplate
    p = Part('R.chest.core')
    p.add(facet_block([(0.02, 0.46, 0.22, CHEST_BACK, 0.40), (0.30, 0.70, CHEST_FRONT, CHEST_BACK, 0.50),
                       (0.70, CHEST_W / 2, CHEST_FRONT, CHEST_BACK, BACK_HW), (1.00, CHEST_W / 2 - 0.08, 0.24, CHEST_BACK + 0.02, BACK_HW - 0.04)]),
          'graphite', cuts=[kit.box((0.40, 0.72, 0.96), (0, -0.20, 0.34))])
    # the slot's liner: a dark channel the nose box nests in
    p.add(rkit.plate_f([(-0.20, -0.14), (0.20, -0.14), (0.20, 0.82), (-0.20, 0.82)], -0.17, -0.15, 0.004), 'interior')
    for s in (1, -1):
        # shoulder sockets: drums facing out, the arm's ball seats against them
        p.add(rkit.drum((s * (SOCKET_X - 0.06), 0.06, rig.SHOULDER_Z - rig.CHEST_Z), 0.20, 0.20, 'x', 40, 0.012), 'darkSteel')
        # lat plates down the flanks, angled
        p.add(plate([(s * 0.80, 0.18, 0.72), (s * 0.66, -0.04, 0.72), (s * 0.58, -0.04, 0.20), (s * 0.60, 0.14, 0.24)], 0.02), 'mech')
    # back frame: a raised rectangular frame the canopy seats on, rails for the jet pod
    for s in (1, -1):
        # the jet pod's rails up the back
        # Stop the jet rails below the shoulder line. Their old square ends
        # protruded through both windshield panes in the folded car pose.
        p.add(rkit.plate_f([(s * 0.30 - 0.05, -0.30), (s * 0.30 + 0.05, -0.30), (s * 0.30 + 0.05, 0.68), (s * 0.30 - 0.05, 0.68)],
                           CHEST_BACK - 0.06, CHEST_BACK + 0.01, 0.01), 'darkSteel')
    a = Part('R.chest.armor')
    # collar plates between the chevron's top edge and the neck, bronze-lined (the concept's gold strakes)
    for s in (1, -1):
        a.add(plate([(s * 0.06, 0.30, 1.02), (s * 0.46, 0.26, 1.06), (s * 0.72, 0.14, 1.00), (s * 0.74, 0.12, 0.90),
                     (s * 0.40, 0.26, 0.93), (s * 0.20, 0.30, 0.93)], 0.06), 'armor')
        a.add(plate([(s * 0.30, 0.305, 0.96), (s * 0.62, 0.225, 0.985), (s * 0.62, 0.228, 0.965), (s * 0.30, 0.308, 0.940)], 0.012), 'bronze')
        # trapezius plates over the top, sloping to the collar
        trap = [(s * 0.26, -0.08), (s * 0.54, -0.06), (s * 0.74, 0.16), (s * 0.26, 0.20)]
        a.add(rkit.plate_z([(x, f) for x, f in trap], CHEST_TOP - 0.02, CHEST_TOP + 0.05, 0.02), 'armor')
    # the collar: a faceted half ring in front of the neck (the back of the neck is the canopy's collar)
    a.add(lathe([(0.20, CHEST_TOP - 0.06), (0.30, CHEST_TOP - 0.06), (0.33, CHEST_TOP + 0.03), (0.30, CHEST_TOP + 0.10),
                 (0.22, CHEST_TOP + 0.10)], 6, 'z', center=(0, -0.04, 0), arc=3.14159, phase=0.0, closed=True), 'mech')
    return [p, a, breastplate()]


# -------------------------------------------------------------------- neck
def neck():
    p = Part('R.neck.column')
    h = rig.HEAD_Z - rig.NECK_Z
    p.add(kit.revolve([(0.0, 0.0), (0.14, 0.0), (0.16, 0.03), (0.13, h + 0.05), (0.0, h + 0.05)], 28,
                      M=Matrix.Translation(V(0, -0.02, 0))), 'darkSteel')
    for k in range(2):
        z = 0.03 + k * 0.06
        p.add(lathe([(0.14, z), (0.19, z), (0.19, z + 0.03), (0.14, z + 0.03)], 12, 'z', closed=True, center=(0, -0.02, 0)), 'graphite')
    for s in (1, -1):
        p.add(rkit.hose([(s * 0.15, 0.04, -0.02), (s * 0.19, 0.02, 0.09), (s * 0.14, 0.0, h + 0.03)], 0.022), 'copper')
    return [p]


def build(coll):
    out = {}
    for bone, fn in (('pelvis', pelvis), ('spine', spine), ('chest', chest), ('neck', neck)):
        out[bone] = [part.build(coll, 0.006, 2, 30) for part in fn()]
    return out
