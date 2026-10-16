"""Torso castings (rest coordinates). The chest's outer shell is the car's nose
clip (dock.py); these are the robot's own parts around it:

  chest   the core filling the clip's cavity, the collar round the neck, the
          shoulder sockets and the back frame the floor tub and the flight pack
          (the tail) dock on
  spine   the exposed abdomen (concept: dark stacked chevron plates down the
          centre, white oblique plates at the flanks, bronze rams)
  pelvis  the girdle: white belt plates sweeping down to a long faceted codpiece,
          hip skirts over the hip drums, a black seat block behind
"""
from mathutils import Vector
from . import kit as K, hs, rig

V = Vector


def chest():
    core = K.Mesh()
    # the core filling the nose clip: a faceted block tapering to the waist
    hs.shell(core, [hs.loop_at(0, 0.02, 4.34, hs.octa(0.80, 0.62, 0.3, 0.2)),
                    hs.loop_at(0, 0.00, 4.70, hs.octa(1.20, 0.86, 0.3, 0.2)),
                    hs.loop_at(0, 0.06, 5.10, hs.octa(1.30, 0.80, 0.3, 0.25)),
                    hs.loop_at(0, 0.16, 5.24, hs.octa(1.00, 0.56, 0.3, 0.3))], 'graphite')
    # back frame: a raised plate with two rails the floor tub and flight pack slide on
    hs.chbox(core, (0, 0.47, 4.80), (1.10, 0.10, 0.80), 0.025, 'gunmetal')
    for s in (-1, 1):
        hs.chbox(core, (s * 0.36, 0.53, 4.80), (0.09, 0.06, 0.96), 0.012, 'graphite')
        # shoulder sockets: drums facing out, the clavicle slides through them
        hs.drum(core, (s * 0.66, 0.10, 5.07), (1, 0, 0), 0.21, 0.16, 'graphite', 0.02, 40,
                hub=(0.13, 0.04, 'gunmetal'))
        # lat struts from the socket down the flank to the waist
        hs.ram(core, (s * 0.64, 0.18, 4.86), (s * 0.40, 0.14, 4.30), 0.035)
        hs.ram(core, (s * 0.60, -0.04, 4.88), (s * 0.36, -0.10, 4.34), 0.030)
    collar = K.Mesh()
    # the collar round the neck base: a faceted dark ring with bronze strakes
    for s in (-1, 1):
        hs.gem(collar, [V((s * 0.10, 0.06, 5.24)), V((s * 0.34, 0.10, 5.26)), V((s * 0.44, 0.30, 5.24)),
                        V((s * 0.30, 0.50, 5.22)), V((s * 0.10, 0.52, 5.22))], (0, 0, 1), 0.05, 0.25, 0.6, 'graphite')
        hs.hose(collar, [V((s * 0.20, 0.06, 5.27)), V((s * 0.33, 0.14, 5.30)), V((s * 0.38, 0.32, 5.28))], 0.016, 'bronze')
    hs.chbox(collar, (0, 0.30, 5.20), (0.40, 0.40, 0.12), 0.03, 'gunmetal')
    return {'chest.core': (core, 'mech'), 'chest.collar': (collar, 'mech')}


def spine():
    mech = K.Mesh()
    z0, z1 = rig.WAIST_Z - 0.10, 4.48
    # flexible column: stacked rings round a centre drum
    mech.cyl((0, 0.06, z0), (0, 0.06, z1), 0.17, 'gunmetal', 24)
    hs.ribs(mech, (0, 0.06, z0), (0, 0.06, z1), 5, 0.27, 0.24, 0.06, 'graphite', sides=10)
    for s in (-1, 1):
        hs.ram(mech, (s * 0.26, 0.20, z0), (s * 0.30, 0.18, z1 + 0.04), 0.032)
        hs.ram(mech, (s * 0.22, -0.10, z0 + 0.02), (s * 0.30, -0.12, z1), 0.026)
        hs.hose(mech, [(s * 0.12, 0.30, z0 - 0.02), (s * 0.20, 0.32, (z0 + z1) / 2), (s * 0.14, 0.28, z1 + 0.04)], 0.018)
    arm = K.Mesh()
    # abs: chevron plates stacked down the centre, each a little proud of the one below
    for k in range(4):
        z = z1 - 0.06 - k * 0.115
        w = 0.43 - k * 0.045
        hs.gem(arm, [V((-w / 2, -0.27, z + 0.05)), V((w / 2, -0.27, z + 0.05)), V((w / 2 - 0.02, -0.28, z - 0.03)),
                     V((0, -0.30, z - 0.07)), V((-w / 2 + 0.02, -0.28, z - 0.03))], (0, -1, 0.1), 0.05, 0.25, 0.7,
               'satin')
    for s in (-1, 1):
        # white oblique plates on the flanks (concept: small white blades either side of the abs)
        hs.gem(arm, [V((s * 0.20, -0.22, 4.44)), V((s * 0.36, -0.14, 4.46)), V((s * 0.40, -0.06, 4.20)),
                     V((s * 0.30, -0.14, 4.02)), V((s * 0.22, -0.22, 4.14))], (s * 0.6, -1, 0), 0.04, 0.3, 0.8)
    return {'spine.mech': (mech, 'mech'), 'spine.armour': (arm, 'armour')}


def pelvis():
    core = K.Mesh()
    # girdle core and the hip axle
    hs.shell(core, [hs.loop_at(0, 0.02, 3.42, hs.octa(0.62, 0.50, 0.35, 0.3)),
                    hs.loop_at(0, 0.00, 3.80, hs.octa(0.96, 0.62, 0.3, 0.25)),
                    hs.loop_at(0, 0.04, 4.02, hs.octa(0.74, 0.56, 0.3, 0.25))], 'graphite')
    core.cyl((-0.66, 0, rig.HIP_Z), (0.66, 0, rig.HIP_Z), 0.11, 'gunmetal', 24)
    arm = K.Mesh()
    for s in (-1, 1):
        # belt plates: sweep from the waist side down and in toward the codpiece
        hs.gem(arm, [V((s * 0.13, -0.36, 4.04)), V((s * 0.56, -0.28, 4.10)), V((s * 0.62, -0.18, 3.94)),
                     V((s * 0.34, -0.34, 3.82)), V((s * 0.15, -0.37, 3.86))], (s * 0.25, -1, 0.15), 0.06, 0.3, 0.7)
        # hip skirts over the hip drums, angled out
        hs.gem(arm, [V((s * 0.60, -0.26, 4.00)), V((s * 0.76, -0.04, 3.98)), V((s * 0.78, 0.18, 3.84)),
                     V((s * 0.70, 0.10, 3.58)), V((s * 0.62, -0.20, 3.66))], (s, -0.2, 0.2), 0.05, 0.3, 0.7)
        # rear side plates flanking the seat block
        hs.gem(arm, [V((s * 0.22, 0.36, 4.00)), V((s * 0.50, 0.30, 3.98)), V((s * 0.54, 0.26, 3.70)),
                     V((s * 0.30, 0.34, 3.56))], (s * 0.3, 1, 0), 0.05, 0.3, 0.7)
    # codpiece: a long faceted shield from the belt down between the thighs, keeled
    cod = [V((-0.14, -0.38, 4.00)), V((0.14, -0.38, 4.00)), V((0.15, -0.40, 3.58)), V((0.0, -0.42, 3.32)),
           V((-0.15, -0.40, 3.58))]
    hs.gem(arm, cod, (0, -1, 0), 0.10, 0.3, 0.6, ridge=[V((0, -0.47, 3.86)), V((0, -0.47, 3.56))])
    seat = K.Mesh()
    hs.gem(seat, [V((-0.24, 0.34, 3.98)), V((0.24, 0.34, 3.98)), V((0.26, 0.40, 3.60)), V((0.0, 0.42, 3.46)),
                  V((-0.26, 0.40, 3.60))], (0, 1, 0), 0.12, 0.3, 0.6, 'satin')
    return {'pelvis.core': (core, 'mech'), 'pelvis.armour': (arm, 'armour'), 'pelvis.seat': (seat, 'armour')}


def hips():
    out = {}
    for S, s in (('L', 1), ('R', -1)):
        m = K.Mesh()
        c = V((s * rig.HIP_X, 0, rig.HIP_Z))
        # hip drum with a spoked face (the concept's side view shows a wheel-like hub at the hip)
        hs.drum(m, c + V((s * 0.10, 0, 0)), (1, 0, 0), 0.20, 0.16, 'graphite', 0.02, 40)
        hs.drum(m, c + V((s * 0.19, 0, 0)), (1, 0, 0), 0.15, 0.03, 'gunmetal', 0.008, 40)
        for k in range(6):
            import math
            a = k * math.tau / 6
            d = V((0, math.cos(a), math.sin(a)))
            m.box(c + V((s * 0.205, 0, 0)) + d * 0.085, (0.02, 0.03, 0.03), 'bronze')
        hs.drum(m, c + V((s * 0.21, 0, 0)), (1, 0, 0), 0.05, 0.03, 'bronze', 0.006, 24)
        out['hip.%s' % S] = (m, 'mech', 'hip.' + S)
    return out


def chest_shell():
    """Plates set into the nose clip (authored in car coordinates, mapped by the
    nose's dock): the gloss black top between the fenders behind the hood (the
    concept's black chest top) and the white covers closing the front wheel
    arches in the chest's flanks."""
    from . import dock
    D = dock.D_nose()
    top = K.Mesh()
    pts = [V((-0.64, -1.40, 0.86)), V((0.64, -1.40, 0.86)), V((0.70, -0.96, 0.885)), V((-0.70, -0.96, 0.885))]
    hs.gem(top, [D @ p for p in pts], (D.to_3x3() @ V((0, 0, 1))).normalized(), 0.10, 0.12, 0.35, 'trim')
    arch = K.Mesh()
    import math
    for s in (-1, 1):
        poly = []
        for k in range(13):
            a = math.radians(k * 15)
            poly.append((-1.405 - 0.395 * math.cos(a), 0.397 + 0.395 * math.sin(a)))
        poly += [(-1.40 + 0.38, 0.17), (-1.40 - 0.38, 0.17)]
        pts = []
        for y, z in poly:
            for x in (0.80, 0.872):
                pts.append(D @ V((s * x, y, z)))
        # a faceted cover: its face crowned 12 mm toward the hub
        c = D @ V((s * 0.885, -1.405, 0.36))
        arch.hull(pts + [c], 'armour')
        hs.drum(arch, D @ V((s * 0.885, -1.405, 0.397)), (D.to_3x3() @ V((s, 0, 0))).normalized(), 0.12, 0.03, 'graphite',
                0.006, 32)
    return {'chest.top': (top, 'armour'), 'chest.arch': (arch, 'armour')}
