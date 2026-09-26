"""Torso endoskeleton and armour (bone-local rest coordinates): pelvis girdle
with codpiece and hip skirts, the stacked mechanical waist with the white V
plate, the chest core the cab's front clip wraps, shoulder sockets, the collar
and the dock frame on the back that the van box locks onto.

The chest core stays inside the front clip in robot mode (the clip is the chest
armour) and inside the cab in truck mode, so its own dress is the top, the
flanks between clip and arms, and the back."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig, hardsurf as hs, mechkit
from .kit import V
from .rkit import Part
from .shape import lathe
from .rcommon import ram, items
from .robot_panels import shield
from .robot_head import plate

CHEST_W = 2.06          # chest core width (inside the clip's 2.5 m)
CHEST_BACK = -0.62      # back face (f)
CHEST_FRONT = 0.46      # front face under the clip
CHEST_TOP = 1.30
SOCKET_X = 1.16         # shoulder socket face (x): inside the cab width in truck mode


# -------------------------------------------------------------------- pelvis
def pelvis():
    p = Part('R.pelvis.girdle')
    p.add(rkit.frame([(-0.30, 0.78, 0.62, 0.14, -0.04), (-0.05, 1.18, 0.78, 0.18, -0.04),
                      (0.18, 1.30, 0.80, 0.18, -0.06), (0.36, 0.90, 0.66, 0.14, -0.06)], cap=0.03), 'graphite')
    # hip beam through the girdle to the cups
    p.add(rkit.cylinder((0, 0, 0.0), 0.16, 2 * rig.HIP_X - 0.10, 'x', 32), 'darkSteel')
    # waist socket collar
    top = rig.WAIST_Z - rig.HIP_Z
    p.add(lathe([(0.30, top - 0.10), (0.40, top - 0.10), (0.42, top - 0.08), (0.42, top - 0.02), (0.40, top), (0.30, top)],
                48, 'z', closed=True), 'darkSteel')
    a = Part('R.pelvis.armor')
    # codpiece: a faceted white V, a dark centre inset and a keel
    cod = [(-0.36, 0.30), (0.36, 0.30), (0.30, 0.02), (0.12, -0.34), (0.0, -0.44), (-0.12, -0.34), (-0.30, 0.02)]
    a.add(rkit.plate_f(cod, 0.40, 0.50, 0.025), 'paint')
    a.add(rkit.plate_f([(x * 0.45, z * 0.62 + 0.02) for x, z in cod], 0.50, 0.53, 0.01), 'graphite')
    # hip skirts: angled plates over the outer hip, and butt plates
    for s in (1, -1):
        skirt = [(s * 0.46, 0.34), (s * 0.84, 0.28), (s * 0.90, -0.10), (s * 0.66, -0.24), (s * 0.46, -0.06)]
        a.add(rkit.plate_f(skirt, 0.30, 0.36, 0.02), 'paint')
        a.add(rkit.plate_f([(s * 0.10, 0.30), (s * 0.62, 0.30), (s * 0.62, -0.20), (s * 0.18, -0.12)], -0.46, -0.40, 0.02), 'paint')
    return [p, a]


# -------------------------------------------------------------------- spine
def spine():
    p = Part('R.spine.column')
    top = rig.CHEST_Z - rig.WAIST_Z
    p.add(kit.revolve([(0.0, -0.06), (0.24, -0.06), (0.26, -0.04), (0.26, top - 0.02), (0.0, top - 0.02)], 40,
                      M=Matrix.Translation(V(0, -0.10, 0))), 'darkSteel')
    for k, (z, r) in enumerate(((0.05, 0.52), (0.17, 0.46), (0.29, 0.50))):
        prof = [(0.25, z - 0.05), (r - 0.03, z - 0.05), (r, z - 0.025), (r, z + 0.025), (r - 0.03, z + 0.05), (0.25, z + 0.05)]
        p.add(lathe(prof, 48, 'z', closed=True, center=(0, -0.10, 0)), 'graphite' if k % 2 else 'mech')
    for s in (1, -1):
        for f in (0.20, -0.38):
            items(p, ram((s * 0.44, f, -0.12), (s * 0.40, f, top + 0.10), 0.05, 0.024))
        # Exposed oblique ribs bridge the narrow waist to the broad chest.
        for k in range(3):
            z=0.02+k*0.115
            p.add(plate([(s*0.32,0.39,z),(s*0.61,0.29,z+0.10),
                         (s*0.66,0.27,z+0.16),(s*0.36,0.41,z+0.06)],0.055),'darkSteel')
    # the white V plate under the chest (concept): two layered chevrons
    a = Part('R.spine.plate')
    v1 = [(-0.52, 0.44), (0.52, 0.44), (0.40, 0.18), (0.0, -0.18), (-0.40, 0.18)]
    a.add(rkit.plate_f(v1, 0.36, 0.44, 0.02), 'paint')
    v2 = [(-0.30, 0.20), (0.30, 0.20), (0.0, -0.08)]
    a.add(rkit.plate_f(v2, 0.44, 0.47, 0.01), 'graphite')
    return [p, a]


# -------------------------------------------------------------------- chest
def chest():
    p = Part('R.chest.core')
    # cage: lofted block narrowing to the waist, the clip wraps its front
    p.add(rkit.frame([(0.04, 1.10, 0.86, 0.16, -0.10), (0.30, 1.80, 1.02, 0.20, -0.08),
                      (0.90, CHEST_W, 1.08, 0.22, -0.08), (1.22, CHEST_W - 0.08, 1.02, 0.20, -0.10)], cap=0.04), 'graphite')
    # shoulder sockets: drums facing out, the arm's ball seats against them
    for s in (1, -1):
        p.add(rkit.drum((s * (SOCKET_X - 0.12), -0.06, rig.SHOULDER_Z - rig.CHEST_Z), 0.34, 0.26, 'x', 48, 0.014), 'darkSteel')
        # lat plates, graphite, down the flanks
        p.add(rkit.plate_x([(-0.52, 0.20), (0.20, 0.30), (0.26, 1.02), (-0.56, 1.06)], *((0.98, 1.04) if s > 0 else (-1.04, -0.98)), 0.02), 'mech')
    # back: dock frame for the van box (a raised rectangular frame with two latch blocks)
    ring_o = rkit.plate_f([(-0.90, 0.10), (0.90, 0.10), (0.90, 1.20), (-0.90, 1.20)], CHEST_BACK - 0.08, CHEST_BACK + 0.02, 0.02)
    ring_i = rkit.plate_f([(-0.74, 0.24), (0.74, 0.24), (0.74, 1.06), (-0.74, 1.06)], CHEST_BACK - 0.2, CHEST_BACK + 0.1, 0.0)
    p.add(ring_o, 'mech', cuts=[ring_i])
    for s in (1, -1):
        p.add(rkit.plate_f([(s * 0.40 - 0.14, 0.52), (s * 0.40 + 0.14, 0.52), (s * 0.40 + 0.14, 0.80), (s * 0.40 - 0.14, 0.80)],
                           CHEST_BACK - 0.16, CHEST_BACK - 0.02, 0.02), 'darkSteel')
    # vertebral ridge
    p.add(rkit.plate_f([(-0.10, -0.02), (0.10, -0.02), (0.08, 1.22), (-0.08, 1.22)], CHEST_BACK - 0.05, CHEST_BACK + 0.05, 0.02), 'darkSteel')
    a = Part('R.chest.armor')
    # White clavicular surround above the dark windshield pectoral.
    for s in (-1,1):
        a.add(plate([(s*0.04,0.87,1.35),(s*0.55,0.83,1.47),
                     (s*1.05,0.63,1.51),(s*1.16,0.58,1.29),
                     (s*0.87,0.73,1.30),(s*0.04,0.895,1.29)],0.055),'paint')
        a.add(plate([(s*0.58,0.815,1.43),(s*0.84,0.73,1.455),
                     (s*0.83,0.739,1.42),(s*0.58,0.826,1.395)],0.015),'graphite')
        a.add(rkit.cylinder((s*0.96,0.686,1.386),0.022,0.015,'f',12),'darkSteel')
    # trapezius plates over the top, behind the clip, sloping up to the collar
    for s in (1, -1):
        trap = [(s * 0.34, -0.50), (s * 0.96, -0.46), (s * 1.02, 0.22), (s * 0.34, 0.26)]
        a.add(rkit.plate_z([(x, f) for x, f in trap], CHEST_TOP - 0.02, CHEST_TOP + 0.06, 0.02), 'paint')
        a.add(rkit.plate_z([(s * 0.42, -0.40), (s * 0.60, -0.40), (s * 0.60, 0.12), (s * 0.42, 0.12)], CHEST_TOP + 0.06, CHEST_TOP + 0.09, 0.01), 'graphite')
    # collar ring round the neck
    a.add(lathe([(0.28, CHEST_TOP - 0.06), (0.40, CHEST_TOP - 0.06), (0.44, CHEST_TOP + 0.04), (0.40, CHEST_TOP + 0.14),
                 (0.30, CHEST_TOP + 0.14)], 48, 'z', closed=True, center=(0, -0.06, 0)), 'mech')
    return [p, a]


# -------------------------------------------------------------------- neck
def neck():
    p = Part('R.neck.column')
    h = rig.HEAD_Z - rig.NECK_Z
    p.add(kit.revolve([(0.0, 0.0), (0.20, 0.0), (0.22, 0.03), (0.18, h + 0.06), (0.0, h + 0.06)], 32,
                      M=Matrix.Translation(V(0, -0.04, 0))), 'darkSteel')
    for k in range(3):
        z = 0.04 + k * 0.07
        p.add(lathe([(0.19, z), (0.25, z), (0.25, z + 0.035), (0.19, z + 0.035)], 32, 'z', closed=True, center=(0, -0.04, 0)), 'graphite')
    # cable runs either side
    for s in (1, -1):
        p.add(rkit.hose([(s * 0.20, 0.06, -0.02), (s * 0.26, 0.04, 0.12), (s * 0.20, 0.02, h + 0.04)], 0.03), 'rubber')
    return [p]


def build(coll):
    out = {}
    for bone, fn in (('pelvis', pelvis), ('spine', spine), ('chest', chest), ('neck', neck)):
        objs = []
        for part in fn():
            objs.append(part.build(coll, 0.008, 2, 30))
        out[bone] = objs
    return out
