"""Leg castings (rest coordinates, per side s).

  thigh  dark faceted core with bronze rams behind, a tall keeled white front
         plate and an outer plate (concept: long diamond plates, a dark seam
         between them)
  shin   knee cap, a long white shin plate, the rear wheel on the outer calf
         under a white arch, dark calf mechanics
  foot   ankle drum and guards, white instep, black wedge sole and heel
  toe    white toe cap over a black sole (the toe hinge at rig.TOE_Y)
"""
import math
from mathutils import Vector
from . import kit as K, hs, rig

V = Vector


def side(s):
    X = rig.HIP_X
    H = rig.HIP_Z
    Kz = H - rig.THIGH
    A = rig.ANKLE_Z
    S = 'L' if s > 0 else 'R'

    def P(x, y, z):
        return V((s * (X + x), y, z))

    def limb(rings):
        """Sector rings authored about the limb's own axis -> absolute |x| centres."""
        return [(z, X + cx, cy, rx, ry) for z, cx, cy, rx, ry in rings]

    out = {}
    # ---- thigh
    c = K.Mesh()
    hs.shell(c, [[P(x, y, H - 0.12) for x, y in hs.octa(0.46, 0.50, 0.3, 0.3)],
                 [P(x, y, Kz + 0.40) for x, y in hs.octa(0.40, 0.44, 0.3, 0.3)],
                 [P(x, y, Kz + 0.14) for x, y in hs.octa(0.32, 0.36, 0.3, 0.3)]], 'graphite')
    hs.ram(c, P(-0.10, 0.27, H - 0.22), P(-0.08, 0.22, Kz + 0.06), 0.04)
    hs.ram(c, P(0.12, 0.25, H - 0.26), P(0.10, 0.21, Kz + 0.10), 0.034)
    hs.hose(c, [P(-0.20, 0.10, H - 0.20), P(-0.24, 0.14, (H + Kz) / 2), P(-0.18, 0.12, Kz + 0.16)], 0.018)
    out['thigh.%s.core' % S] = (c, 'mech', 'thigh.' + S)
    a = K.Mesh()
    # thigh armour wraps the front and outer side (the back stays open on the rams):
    # rings (z, centre x, centre y, rx, ry), widest a third of the way down
    rings = [(H - 0.06, 0.0, -0.02, 0.29, 0.29), (H - 0.42, 0.02, -0.04, 0.33, 0.33),
             (Kz + 0.42, 0.01, -0.03, 0.29, 0.30), (Kz + 0.16, 0.0, -0.01, 0.22, 0.25)]
    hs.sector(a, limb(rings), 222, 318, 0.07, s, 5, keel=(268, 0.05))
    hs.sector(a, limb([(z - 0.04, cx, cy, rx + 0.005, ry + 0.005) for z, cx, cy, rx, ry in rings[:3]]), -32, 38, 0.06, s, 5,
              keel=(2, 0.035))
    hs.sector(a, limb([(H - 0.30, 0.0, -0.02, 0.27, 0.28), (Kz + 0.36, 0.0, -0.02, 0.24, 0.26)]), 160, 214, 0.05, s, 4)
    out['thigh.%s.armour' % S] = (a, 'armour', 'thigh.' + S)

    # ---- shin
    k = K.Mesh()
    hs.drum(k, P(0, 0, Kz), (1, 0, 0), 0.17, 0.34, 'graphite', 0.025, 40, hub=(0.11, 0.03, 'bronze'))
    hs.shell(k, [[P(x, y + 0.04, Kz - 0.16) for x, y in hs.octa(0.36, 0.42, 0.3, 0.3)],
                 [P(x, y + 0.06, A + 0.70) for x, y in hs.octa(0.34, 0.44, 0.3, 0.3)],
                 [P(x, y + 0.02, A + 0.14) for x, y in hs.octa(0.24, 0.28, 0.3, 0.3)]], 'graphite')
    hs.ram(k, P(-0.04, 0.30, Kz - 0.12), P(-0.04, 0.22, A + 0.16), 0.042)
    hs.hose(k, [P(-0.19, 0.06, Kz - 0.18), P(-0.22, 0.14, (Kz + A) / 2), P(-0.15, 0.08, A + 0.18)], 0.018)
    out['shin.%s.core' % S] = (k, 'mech', 'shin.' + S)
    w = K.Mesh()
    # knee cap: a faceted shield over the joint, keeled
    hs.sector(w, limb([(Kz + 0.26, 0.0, -0.02, 0.21, 0.27), (Kz + 0.04, 0.0, -0.04, 0.24, 0.31),
                  (Kz - 0.16, 0.0, -0.02, 0.20, 0.27)]), 215, 325, 0.08, s, 5, keel=(270, 0.05))
    # shin: a long keeled front plate flaring toward the boot, an inner plate
    rings = [(Kz - 0.24, 0.0, 0.0, 0.25, 0.28), (Kz - 0.70, 0.0, -0.01, 0.29, 0.31),
             (A + 0.50, 0.0, 0.0, 0.30, 0.32), (A + 0.20, 0.0, 0.02, 0.27, 0.30)]
    hs.sector(w, limb(rings), 220, 322, 0.07, s, 5, keel=(270, 0.045))
    hs.sector(w, limb([(z, cx, cy, rx - 0.01, ry - 0.01) for z, cx, cy, rx, ry in rings[:3]]), 150, 216, 0.06, s, 4)
    out['shin.%s.armour' % S] = (w, 'armour', 'shin.' + S)
    # the rear wheel's arch on the outer calf: white plates over its top and front,
    # a dark wall behind it (dock.CALF_HUB)
    from . import dock
    hub = dock.CALF_HUB
    R = 0.392 + 0.05
    xi, xo = hub.x - 0.17, hub.x + 0.16
    arch = K.Mesh()
    # the fender over the wheel: from behind its top round to the front, deepest at the front-top
    hs.arch(arch, hub, s, R, xi, xo, [(55, 100), (100, 140), (140, 180), (180, 212)],
            lambda ang: R + 0.10 + 0.05 * math.sin(math.radians((ang - 55) * 180 / 157)), 'armour')
    hs.prism(arch, [(-R + 0.04, -R + 0.1), (R - 0.04, -R + 0.1), (R, 0.0), (R * 0.6, R), (-R * 0.6, R), (-R, 0.0)],
             V((s * xi, hub.y, hub.z)), V((0, 1, 0)), V((0, 0, 1)), V((s, 0, 0)), -0.03, 0.03, 0.01, 'graphite')
    hs.drum(arch, V((s * (xi + 0.05), hub.y, hub.z)), (1, 0, 0), 0.09, 0.10, 'gunmetal', 0.01, 32)
    # the arch's carrier: a faceted bracket from the calf to the arch's inner wall
    hs.chbox(arch, V((s * (X + (xi - X) / 2 + 0.02), hub.y + 0.02, hub.z + 0.10)), (xi - X + 0.06, 0.20, 0.30), 0.03, 'graphite')
    out['shin.%s.arch' % S] = (arch, 'armour', 'shin.' + S)

    # ---- foot (ankle at A; the toe hinge at TOE_Y)
    f = K.Mesh()
    ty, tz = rig.TOE_Y, rig.TOE_Z
    hs.drum(f, P(0, 0, A), (1, 0, 0), 0.15, 0.30, 'graphite', 0.02, 36, hub=(0.09, 0.03, 'bronze'))
    # sole: a black wedge from the heel to the toe hinge
    f.hull([P(x, y, z) for x in (-0.24, 0.26) for y, z in ((0.40, 0.0), (0.42, 0.20), (ty + 0.02, 0.0), (ty + 0.02, 0.24))] +
           [P(x, 0.44, 0.10) for x in (-0.20, 0.22)], 'satin')
    # instep: white faceted plate from the ankle down to the toe hinge
    hs.gem(f, [P(-0.20, -0.14, A + 0.14), P(0.20, -0.14, A + 0.14), P(0.24, ty + 0.03, 0.26), P(-0.22, ty + 0.03, 0.26)],
           (0, -0.6, 1), 0.10, 0.3, 0.7, ridge=[P(0.02, -0.34, 0.52)])
    for q in (-1, 1):
        # ankle guards
        hs.gem(f, [P(q * 0.18, -0.16, A + 0.20), P(q * 0.19, 0.24, A + 0.16), P(q * 0.24, 0.32, 0.24), P(q * 0.25, -0.20, 0.26)],
               (q, 0, 0), 0.05, 0.3, 0.7)
    # heel block
    hs.gem(f, [P(-0.20, 0.36, 0.52), P(0.20, 0.36, 0.52), P(0.24, 0.45, 0.20), P(-0.22, 0.45, 0.20)], (0, 1, 0), 0.10, 0.3,
           0.6, 'armour')
    out['foot.' + S] = (f, 'armour', 'foot.' + S)
    t = K.Mesh()
    t.hull([P(x, y, z) for x in (-0.23, 0.25) for y, z in ((ty, 0.0), (ty, 0.22), (-0.98, 0.0), (-1.00, 0.07))], 'satin')
    hs.gem(t, [P(-0.21, ty - 0.01, 0.27), P(0.23, ty - 0.01, 0.27), P(0.20, -0.96, 0.10), P(-0.18, -0.95, 0.10)],
           (0, -0.5, 1), 0.10, 0.3, 0.6, ridge=[P(0.02, -0.72, 0.30)])
    out['toe.' + S] = (t, 'armour', 'toe.' + S)
    return out
