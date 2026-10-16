"""Arm castings (rest coordinates, per side s = +1 left / -1 right).

  clav      the shoulder bridge from the chest socket out to the joint
  upperarm  the pauldron: faceted white plates arched round the front wheel
            (the wheel sits outboard of the joint, its face showing, as in the
            concept's front and side views), the joint drum, the bicep core with
            a white outer plate
  forearm   elbow drum, the forearm core (the door docks on its outer face as the
            shield), a white front plate, bronze rams inside
  hand      dark palm with a white back plate, segmented fingers on their bones
"""
import math
from mathutils import Vector
from . import kit as K, hs, rig

V = Vector


def side(s):
    X = rig.SHOULDER_X
    Y = rig.SHOULDER_Y
    Z = rig.SHOULDER_Z
    E = Z - rig.UPPER
    W = E - rig.FORE

    def P(x, y, z):
        return V((s * x, y, z))

    out = {}
    S = 'L' if s > 0 else 'R'
    # ---- clavicle: the bridge from the chest socket to the shoulder joint
    m = K.Mesh()
    hs.chbox(m, P((rig.CLAV_X + X) / 2 + 0.02, Y, Z + 0.02), (X - rig.CLAV_X - 0.10, 0.30, 0.26), 0.04, 'graphite')
    hs.ram(m, P(0.62, Y - 0.17, Z - 0.08), P(X - 0.12, Y - 0.17, Z - 0.02), 0.03)
    hs.ram(m, P(0.62, Y + 0.17, Z - 0.08), P(X - 0.12, Y + 0.17, Z - 0.02), 0.03)
    out['clav.' + S] = (m, 'mech', 'clav.' + S)

    # ---- upper arm
    j = K.Mesh()
    hs.drum(j, P(X - 0.02, Y, Z), (1, 0, 0), 0.22, 0.20, 'graphite', 0.025, 40)
    # bicep core: an octagonal faceted column
    hs.shell(j, [[P(X + x, Y + y, Z - 0.20) for x, y in hs.octa(0.34, 0.36, 0.3, 0.3)],
                 [P(X + x, Y + y, E + 0.12) for x, y in hs.octa(0.30, 0.32, 0.3, 0.3)]], 'graphite')
    hs.ram(j, P(X - 0.02, Y - 0.20, Z - 0.30), P(X - 0.02, Y - 0.16, E + 0.02), 0.032)
    hs.hose(j, [P(X - 0.14, Y + 0.12, Z - 0.18), P(X - 0.18, Y + 0.16, (Z + E) / 2), P(X - 0.14, Y + 0.12, E + 0.10)], 0.016)
    out['upperarm.%s.core' % S] = (j, 'mech', 'upperarm.' + S)

    p = K.Mesh()
    from . import dock
    HX = dock.PAULDRON_HUB.x                # the front wheel's hub (|x|): the dock is the interface
    hub = V((s * HX, Y, Z))
    R = 0.392 + 0.03            # the tyre plus clearance
    xi, xo = HX - 0.40, HX + 0.17  # inner wall face, outer lip (the tyre face stays open)
    # the arch: four faceted plates over the tyre from behind round to the front, the
    # outer radius peaking toward the top-back corner (concept side view)
    hs.arch(p, (s * HX, Y, Z), s, R, xi, xo, [(-8, 40), (40, 88), (88, 136), (136, 184), (184, 214)],
            lambda a: R + 0.09 + 0.06 * math.exp(-((a - 70) / 45) ** 2) - 0.03 * max(0.0, (a - 150) / 64), 'armour')
    # front plate dropping past the tyre (the pauldron reaches below the wheel at the front)
    hs.gem(p, [P(xi + 0.02, Y - R - 0.10, Z - 0.10), P(xo - 0.01, Y - R - 0.08, Z - 0.12), P(xo - 0.05, Y - R + 0.04, Z - 0.50),
               P(xi + 0.08, Y - R + 0.06, Z - 0.52)], (0, -1, -0.2), 0.08, 0.25, 0.7)
    # crown plate on top, peaked toward the outside
    hs.gem(p, [P(xi + 0.04, Y - 0.30, Z + R + 0.11), P(xo - 0.08, Y - 0.24, Z + R + 0.12),
               P(xo - 0.10, Y + 0.30, Z + R + 0.15), P(xi + 0.04, Y + 0.36, Z + R + 0.14)], (s * 0.2, 0, 1), 0.06,
           0.3, 0.9)
    # white outer plate on the upper arm, under the pauldron
    hs.gem(p, [P(X + 0.17, Y - 0.16, Z - 0.48), P(X + 0.19, Y + 0.14, Z - 0.48), P(X + 0.17, Y + 0.12, E + 0.16),
               P(X + 0.15, Y - 0.12, E + 0.12)], (s, 0, 0), 0.06, 0.3, 0.8)
    out['upperarm.%s.pauldron' % S] = (p, 'armour', 'upperarm.' + S)
    w = K.Mesh()
    # the wheel's inboard wall: a dark plate closing the arch behind the tyre, the hub carrier through it
    hs.prism(w, [(-R, -0.1), (R, -0.1), (R * 0.85, R * 0.7), (0, R + 0.06), (-R * 0.85, R * 0.7), (-R * 0.9, -R * 0.6),
                 (R * 0.9, -R * 0.6)], P(xi, Y, Z), V((0, 1, 0)), V((0, 0, 1)), V((s, 0, 0)), -0.03, 0.03, 0.01, 'graphite')
    hs.drum(w, P(X + 0.04, Y, Z), (1, 0, 0), 0.10, 0.12, 'gunmetal', 0.01, 32)
    out['upperarm.%s.wall' % S] = (w, 'mech', 'upperarm.' + S)

    # ---- forearm
    f = K.Mesh()
    hs.drum(f, P(X, Y, E), (1, 0, 0), 0.15, 0.30, 'graphite', 0.02, 36, hub=(0.09, 0.03, 'bronze'))
    hs.shell(f, [[P(X + x, Y + y, E - 0.10) for x, y in hs.octa(0.32, 0.36, 0.3, 0.3)],
                 [P(X + x, Y + y, W + 0.12) for x, y in hs.octa(0.26, 0.28, 0.3, 0.3)]], 'graphite')
    hs.ram(f, P(X - 0.12, Y + 0.05, E - 0.12), P(X - 0.10, Y + 0.04, W + 0.10), 0.03)
    hs.ram(f, P(X - 0.02, Y + 0.17, E - 0.10), P(X - 0.02, Y + 0.13, W + 0.12), 0.026)
    hs.drum(f, P(X, Y, W + 0.04), (0, 0, 1), 0.14, 0.08, 'gunmetal', 0.012, 24)     # wrist bearing
    out['forearm.%s.core' % S] = (f, 'mech', 'forearm.' + S)
    fa = K.Mesh()
    # Long swept vambrace with an elbow-side peak, tapered wrist and a single
    # broad diagonal facet. Its back seats on the existing forearm casting.
    hs.gem(fa, [P(X - 0.13, Y - 0.19, E - 0.13), P(X + 0.08, Y - 0.19, E - 0.035),
                P(X + 0.16, Y - 0.19, E - 0.30), P(X + 0.12, Y - 0.17, W + 0.23),
                P(X - 0.07, Y - 0.16, W + 0.12), P(X - 0.15, Y - 0.18, W + 0.34)],
           (0, -1, 0), 0.05, 0.24, 0.6,
           ridge=[P(X + 0.025, Y - 0.285, E - 0.30), P(X - 0.01, Y - 0.245, W + 0.29)])
    hs.gem(fa, [P(X - 0.16, Y - 0.10, E - 0.14), P(X - 0.17, Y + 0.10, E - 0.16), P(X - 0.15, Y + 0.08, W + 0.30),
                P(X - 0.14, Y - 0.08, W + 0.26)], (-s, 0, 0), 0.04, 0.3, 0.8)
    out['forearm.%s.armour' % S] = (fa, 'armour', 'forearm.' + S)

    # ---- hand: palm (on the hand bone), fingers on their own bones
    h = K.Mesh()
    hs.chbox(h, P(X, Y - 0.005, W - 0.11), (0.13, 0.34, 0.24), 0.025, 'graphite')
    hs.gem(h, [P(X + 0.07, Y - 0.15, W - 0.02), P(X + 0.07, Y + 0.14, W - 0.02), P(X + 0.075, Y + 0.12, W - 0.21),
               P(X + 0.075, Y - 0.14, W - 0.22)], (s, 0, 0), 0.03, 0.3, 0.8)
    for i in range(4):
        fy = Y - 0.105 + i * 0.070
        hs.drum(h, P(X, fy, W - rig.PALM), (0, 1, 0), 0.034, 0.05, 'gunmetal', 0.006, 16)
    out['hand.' + S] = (h, 'mech', 'hand.' + S)
    for i, fn in enumerate(rig.FINGERS):
        z = W - rig.PALM
        fy = Y - 0.105 + i * 0.070
        L = [rig.PHAL[0], rig.PHAL[1], rig.PHAL[2] * (0.85 if fn == 'pinky' else 1.0)]
        for k in range(3):
            seg = K.Mesh()
            top, bot = z, z - L[k]
            wy = 0.056 - k * 0.006
            wx = 0.070 - k * 0.006
            hs.chbox(seg, P(X, fy, (top + bot) / 2 - 0.004), (wx, wy, L[k] - 0.012), 0.012, 'graphite')
            # knuckle plate on the back of the segment
            hs.chbox(seg, P(X + 0.034 - k * 0.003, fy, (top + bot) / 2 - 0.004), (0.014, wy - 0.012, L[k] * 0.7), 0.005,
                     'gunmetal')
            if k < 2:
                hs.drum(seg, P(X, fy, bot), (0, 1, 0), 0.024, wy + 0.004, 'bronze', 0.004, 12)
            else:
                seg.hull([P(X + a, fy + b, bot - 0.004) for a in (-wx / 2, wx / 2) for b in (-wy / 2, wy / 2)] +
                         [P(X + 0.01, fy, bot - 0.035)], 'graphite')
            out['%s%d.%s' % (fn, k + 1, S)] = (seg, 'fine', '%s%d.%s' % (fn, k + 1, S))
            z = bot
    tb = [rig.HEADS['thumb1.' + S], rig.HEADS['thumb2.' + S], rig.HEADS['thumb3.' + S]]
    tip = tb[2] + (tb[2] - tb[1]).normalized() * 0.08
    for k, (a, b) in enumerate(zip(tb, tb[1:] + [tip])):
        seg = K.Mesh()
        seg.cyl(a, b, 0.036 - k * 0.004, 'graphite', 8)
        hs.drum(seg, a, (b - a).cross(V((1, 0, 0))).normalized() if k else V((0, 1, 0)), 0.03, 0.07, 'bronze', 0.005, 12)
        out['thumb%d.%s' % (k + 1, S)] = (seg, 'fine', 'thumb%d.%s' % (k + 1, S))
    return out
