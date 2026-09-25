"""The Ferrari F1 robot's longsword, built from the car's parts vocabulary: a
polished double-edged blade with a raised carbon inlay down its flats, a
crossguard shaped like the front wing (swept carbon main plane, a red flap
over it, painted endplates), a banded grip and a centre-lock wheel nut for a
pommel (yellow-anodised drive ring, as the car's nuts are colour-coded).

Sized for a 3.7 m robot: 2.7 m overall, the grip centred on the origin, a
1.9 m blade from 0.40 to 2.30.

Declared joins: the blade root is sunk into the ricasso collar; the carbon
inlay passes through the blade, 1.2 mm proud of each flat; the guard's planes
are sunk into the centre block; grip bands and ferrules are proud of the tang.
"""
import math
from mathutils import Vector, Matrix
from f1b import kit as K
from f1b import shape as S
from . import kit
from .kit import Part, hex_bolt, bands, ring_band, section_loft, chamfer_rect, revolve

NAME = 'sword'

TANG = chamfer_rect(0.078, 0.062, 0.018)
GRIP = (-0.27, 0.20)
OFF_HAND = -0.21
BLADE_Z = (0.34, 2.30)
# blade stations: (z, width, half thickness at the flat)
BLADE = [
    (0.34, 0.170, 0.016),
    (0.62, 0.168, 0.0155),
    (1.10, 0.158, 0.0145),
    (1.60, 0.146, 0.013),
    (1.96, 0.132, 0.011),
    (2.14, 0.100, 0.008),
    (2.25, 0.046, 0.005),
    (2.30, 0.006, 0.0015),
]
EDGE_LAND = 0.0012
FLAT = 0.3           # the central flat's share of the width
EDGE = ((0.0, 0.0, 0.42), (0.0, 0.0, 2.30))


def _blade_section(w, t):
    """Hexagonal ground section: a central flat at +-t, bevels down to a land at each edge."""
    hw = w / 2
    f = hw * FLAT
    e = min(EDGE_LAND, t * 0.5)
    return [(hw, -e), (hw, e), (f, t), (-f, t), (-hw, e), (-hw, -e), (-f, -t), (f, -t)]


def _blade():
    secs = [_blade_section(w, t) for _, w, t in BLADE]
    return section_loft(secs, [z for z, _, _ in BLADE], cap_round=0.0)


def _inlay():
    """Carbon strip through the blade, proud of both flats, tapering to points."""
    zs = [0.46, 0.56, 1.30, 1.72, 1.84]
    ws = [0.004, 0.05, 0.046, 0.034, 0.004]

    def t_at(z):
        for (z0, _, t0), (z1, _, t1) in zip(BLADE, BLADE[1:]):
            if z0 <= z <= z1:
                return t0 + (t1 - t0) * (z - z0) / (z1 - z0)
        return BLADE[-1][2]
    secs = [chamfer_rect(w, 2 * (t_at(z) + 0.0012), min(w * 0.3, 0.004)) for z, w in zip(zs, ws)]
    return section_loft(secs, zs, cap_round=0.0)


def _ricasso():
    p = Part(NAME, 'sword.ricasso')
    sec0 = chamfer_rect(0.21, 0.075, 0.022)
    sec1 = chamfer_rect(0.182, 0.046, 0.014)
    p.add(section_loft([sec0, sec0, sec1], [0.24, 0.33, 0.40], cap_round=0.006), 'titanium')
    for s in (1, -1):
        for x in (-0.07, 0.07):
            p.add(hex_bolt((x, s * 0.0375, 0.285), (0, s, 0), 0.009, 0.006), 'gold')
    return p


def _guard():
    """Front-wing crossguard: per side a swept carbon main plane with a red flap above
    it, closed by a painted endplate; chord runs along Y (through the flats)."""
    main = Part(NAME, 'sword.guard')
    foil = S.airfoil(28, thick=0.22, camber=0.05)
    for side in (1, -1):
        stations = []
        for k in range(7):
            u = k / 6
            x = side * (0.09 + 0.36 * u)
            chord = 0.12 - 0.03 * u
            zc = 0.28 - 0.07 * u ** 1.5
            inc = math.radians(6 + 10 * u)
            stations.append((x, chord, zc, inc))
        for elem, (scale, dz, dy, slot) in enumerate(((1.0, 0.0, 0.0, 'carbon'), (0.6, 0.05, -0.02, 'paint'))):
            rings = []
            for x, chord, zc, inc in stations:
                c = chord * scale
                ring = []
                for fx, fy in foil:
                    # chord along y (leading edge at +y), thickness along z; incidence tips the trailing edge down
                    yy = (0.5 - fx) * c
                    zz = fy * c
                    ry = yy * math.cos(inc) - zz * math.sin(inc)
                    rz = yy * math.sin(inc) + zz * math.cos(inc)
                    ring.append(Vector((x, ry + dy, zc + rz + dz * (1 - 0.3 * abs(x) / 0.45))))
                rings.append(ring)
            if side < 0:
                rings.reverse()
            main.add(K.loft(rings, True, True), slot)
        # endplate at the tip: a raked vertical plate in the YZ plane
        x_tip = side * 0.455
        outline = kit.ccw([(-0.058, 0.165), (0.066, 0.172), (0.074, 0.265), (0.03, 0.292), (-0.05, 0.278)])
        M = Matrix(((0, 0, 1, x_tip - 0.006), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        main.add(K.bevel_prism(outline, 0.0, 0.012, 0.003, 2, M), 'paint')
    return main


def _pommel():
    """Centre-lock wheel nut: a turned body with six drive lugs and a yellow drive ring."""
    p = Part(NAME, 'sword.pommel')
    body = [(0.0, -0.42), (0.052, -0.42), (0.064, -0.408), (0.066, -0.36), (0.058, -0.33), (0.046, -0.30), (0.046, -0.26), (0.0, -0.26)]
    p.add(revolve(body, 32), 'titanium')
    ring = [(0.0, -0.366), (0.0705, -0.366), (0.0705, -0.334), (0.0, -0.334)]
    p.add(revolve(ring, 32), 'yellow')
    for k in range(6):
        a = 2 * math.pi * k / 6 + math.pi / 6
        c = Vector((math.cos(a) * 0.058, math.sin(a) * 0.058, -0.395))
        M = kit.axis_frame(c, (math.cos(a), math.sin(a), 0), (0, 0, 1))
        p.add(K.bevel_prism(chamfer_rect(0.034, 0.03, 0.006), -0.008, 0.016, 0.002, 1, M), 'blackChrome')
    cap = [(0.0, -0.435), (0.03, -0.435), (0.036, -0.425), (0.036, -0.41), (0.0, -0.41)]
    p.add(revolve(cap, 24), 'paint')
    return p


def build(coll):
    """Every part of the sword in `coll`. Returns the export metadata."""
    blade = Part(NAME, 'sword.blade')
    blade.add(_blade(), 'blade')
    K.finish(blade.build(coll), width=0.0012, seg=1, angle=40)

    inlay = Part(NAME, 'sword.inlay')
    inlay.add(_inlay(), 'carbon')
    K.finish(inlay.build(coll), width=0.0008, seg=1, angle=40)

    K.finish(_ricasso().build(coll), width=0.003, seg=2, angle=30)
    K.finish(_guard().build(coll), width=0.002, seg=1, angle=35)

    grip = Part(NAME, 'sword.grip')
    grip.add(section_loft([TANG, TANG], [-0.30, 0.26], cap_round=0.006), 'blackChrome')
    for m in bands(TANG, GRIP[0], GRIP[1], 5, 0.012, 0.009, 0.004):
        grip.add(m, 'rubber')
    for z0, z1 in ((GRIP[0] - 0.035, GRIP[0]), (GRIP[1], GRIP[1] + 0.04)):
        grip.add(ring_band(TANG, z0, z1, 0.016, 0.005), 'titanium')
    K.finish(grip.build(coll), width=0.0015, seg=1, angle=35)

    K.finish(_pommel().build(coll), width=0.002, seg=1, angle=30)

    return {
        'grips': {'main': [0.0, 0.0, 0.0], 'off': [0.0, 0.0, OFF_HAND]},
        'edge': [list(EDGE[0]), list(EDGE[1])],
    }
