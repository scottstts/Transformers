"""The Bat robot's spear: a slim, sleek lance. A glossy black lacquered shaft
carries brushed bronze fittings (the Tumbler's bronze accents): a ringed
socket collar, a diamond-knurled grip bulb and a knurled neck under the head,
a knurled grip band between two rings where the main hand holds it, and a
ribbed butt ferrule with a rounded end. The head is a long fluted leaf
blade with angled shoulders; its flutes run parallel to the edges and
converge at the point, patinated dark, and the edges are honed bright.

Sized for the 5.4 m Bat robot and longer than it stands, as a pike: 6.5 m
overall (1.2 times its height), a 0.105 m shaft, the main hand at the origin
a quarter of the way up from the butt (it is held one-handed at the side, the
long end ahead), the off hand 1.0 m up the shaft, the tip 4.9 m up.

  ferrule   ribbed bronze butt cap          z -1.60 .. -1.26
  shaft     black lacquer                   z -1.28 .. 3.60
  grip      knurled band between two rings  z -0.30 .. 0.30
  collar    rings, knurled bulb, knurled neck, socket cone   z 3.54 .. 4.11
  blade     fluted leaf blade               z 4.07 .. 4.90

Declared joins: the shaft runs into the ferrule, the grip rings and the
collar sleeves; the knurled bands sit over the collar's core and the shaft;
the blade root is sunk into the socket cone.
"""
import math
from mathutils import Vector
from f1b import kit as K
from .kit import Part, revolve

NAME = 'spear'

SHAFT_R = 0.0525
OFF_HAND = 1.0
# the head's fittings and blade are drawn at their first length (tip 3.02) and carried up the longer
# shaft by HEAD_DZ, the blade lengthened by BLADE_STRETCH about its root; the butt carried down by BUTT_DZ
HEAD_DZ = 1.742
BLADE_STRETCH = 1.2
BUTT_DZ = -0.3
SHAFT_Z = (-0.98 + BUTT_DZ, 1.86 + HEAD_DZ)
# the grip band: rings (r, z) either side of a knurled band just over the shaft, fitting the fist's curl
GRIP_Z = 0.26
GRIP_RING = [(0.0, 0.0), (0.056, 0.0), (0.060, 0.01), (0.060, 0.03), (0.056, 0.04), (0.0, 0.04)]

# the collar under the head, (r, z) from the sleeve over the shaft to the socket cone
COLLAR = [(0.0, 1.80), (0.056, 1.80), (0.056, 1.84), (0.064, 1.85), (0.064, 1.87), (0.057, 1.875), (0.064, 1.88), (0.064, 1.90),
          (0.057, 1.905), (0.064, 1.91), (0.064, 1.93), (0.056, 1.945), (0.048, 1.99), (0.048, 2.16), (0.058, 2.165), (0.060, 2.175),
          (0.058, 2.185), (0.045, 2.19), (0.045, 2.27), (0.058, 2.275), (0.062, 2.285), (0.057, 2.29), (0.062, 2.295), (0.062, 2.31),
          (0.052, 2.325), (0.034, 2.36), (0.0, 2.365)]
COLLAR = [(r, z + HEAD_DZ) for r, z in COLLAR]
BULB_Z = (2.02 + HEAD_DZ, 2.16 + HEAD_DZ)
NECK_Z = (2.19 + HEAD_DZ, 2.27 + HEAD_DZ)


def _ferrule():
    prof = [(0.0, -0.96), (0.056, -0.96), (0.056, -1.00), (0.063, -1.01), (0.063, -1.03), (0.057, -1.035), (0.063, -1.04),
            (0.063, -1.06), (0.057, -1.075)]
    z = -1.09
    while z > -1.23:                                   # ribs
        prof += [(0.055, z), (0.055, z - 0.006), (0.051, z - 0.008)]
        z -= 0.014
    prof += [(0.047, -1.25), (0.040, -1.28), (0.026, -1.297), (0.0, -1.302)]
    return [(r, z + BUTT_DZ) for r, z in prof]


# blade stations: (z, half width, half thickness at the ridge); the point closes at BLADE_TIP
# a short neck out of the socket, angled shoulders flaring to the widest point, a slight waist, then the long taper
BLADE = [(2.33, 0.028, 0.019), (2.37, 0.030, 0.019), (2.41, 0.088, 0.019), (2.45, 0.090, 0.018), (2.52, 0.078, 0.017),
         (2.66, 0.066, 0.014), (2.80, 0.048, 0.011), (2.93, 0.026, 0.007), (2.99, 0.010, 0.004)]
BLADE_TIP = 3.02


def _blade_z(z):
    return 2.33 + HEAD_DZ + (z - 2.33) * BLADE_STRETCH


BLADE = [(_blade_z(z), hw, t) for z, hw, t in BLADE]
BLADE_TIP = _blade_z(BLADE_TIP)
EDGE_LAND = 0.0012
# across each face from the edge bevel to the ridge: (u = share of the half width, groove?, slot of the
# side arriving at this point); three narrow flutes between broad flats
FACE = [(0.80, False, 'edge'), (0.70, False, 'bronze'), (0.66, True, 'bronzeDark'), (0.62, False, 'bronzeDark'),
        (0.44, False, 'bronze'), (0.40, True, 'bronzeDark'), (0.36, False, 'bronzeDark'),
        (0.16, False, 'bronze'), (0.12, True, 'bronzeDark'), (0.08, False, 'bronzeDark')]
FLUTE_DEPTH = 0.25                                     # share of the local thickness

EDGE = ((0.0, 0.0, _blade_z(2.40)), (0.0, 0.0, BLADE_TIP))


def _face_height(u, t, groove):
    h = t * (1.0 - u ** 1.6)
    return h - t * FLUTE_DEPTH if groove else h


def _blade_ring(hw, t):
    """One section, counter-clockwise, and the slot of each side (point j -> j + 1)."""
    e = EDGE_LAND
    top = [(hw, e)] + [(u * hw, _face_height(u, t, g)) for u, g, _ in FACE] + [(0.0, t)] + \
          [(-u * hw, _face_height(u, t, g)) for u, g, _ in reversed(FACE)] + [(-hw, e)]
    top_slots = [s for _, _, s in FACE] + ['bronze'] + ['bronze'] + [s for _, _, s in reversed(FACE[1:])] + ['edge']
    ring = top + [(x, -y) for x, y in reversed(top)]
    slots = top_slots + ['edge'] + list(reversed(top_slots)) + ['edge']
    return ring, slots


def _blade():
    rings, slots = [], None
    for z, hw, t in BLADE:
        ring, slots = _blade_ring(hw, t)
        rings.append([Vector((x, y, z)) for x, y in ring])
    n = len(rings[0])
    verts = [v for r in rings for v in r]
    faces, fs = [], []
    for i in range(len(rings) - 1):
        for j in range(n):
            j2 = (j + 1) % n
            faces.append([i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j])
            fs.append(slots[j])
    faces.append(list(reversed(range(n))))             # the root, inside the socket
    fs.append('bronze')
    tip = len(verts)
    verts.append(Vector((0.0, 0.0, BLADE_TIP)))
    last = (len(rings) - 1) * n
    for j in range(n):
        faces.append([last + j, last + (j + 1) % n, tip])
        fs.append(slots[j])
    return (verts, faces), fs


def _knurl(z0, z1, radius, rows, n=20, amp=0.003):
    """A diamond-knurled band: rows offset half a pitch, alternate rows raised by amp,
    triangulated into diamond facets; closed by fans at both ends."""
    verts, faces = [], []
    for k in range(rows + 1):
        z = z0 + (z1 - z0) * k / rows
        r = radius(z) + (amp if k % 2 else 0.0)
        ph = 0.5 if k % 2 else 0.0
        for i in range(n):
            a = 2 * math.pi * (i + ph) / n
            verts.append(Vector((r * math.cos(a), r * math.sin(a), z)))
    for k in range(rows):
        a, b = k * n, (k + 1) * n
        for i in range(n):
            i2 = (i + 1) % n
            if k % 2 == 0:      # the upper row sits between i and i + 1
                faces += [[a + i, a + i2, b + i], [b + i, a + i2, b + i2]]
            else:               # this row sits between the upper row's i and i + 1
                faces += [[a + i, a + i2, b + i2], [a + i, b + i2, b + i]]
    lo, hi = len(verts), len(verts) + 1
    verts += [Vector((0, 0, z0)), Vector((0, 0, z1))]
    top = rows * n
    for i in range(n):
        i2 = (i + 1) % n
        faces += [[i2, i, lo], [top + i, top + i2, hi]]
    return verts, faces


def _bulb_r(z):
    return 0.050 + 0.026 * math.sin(math.pi * (z - BULB_Z[0]) / (BULB_Z[1] - BULB_Z[0]))


def build(coll):
    """Every part of the spear in `coll`. Returns the export metadata."""
    shaft = Part(NAME, 'spear.shaft')
    shaft.add(revolve([(0.0, SHAFT_Z[0]), (SHAFT_R, SHAFT_Z[0]), (SHAFT_R, SHAFT_Z[1]), (0.0, SHAFT_Z[1])], 40), 'lacquer')
    K.finish(shaft.build(coll), width=0.003, seg=2, angle=30)

    fit = Part(NAME, 'spear.fittings')
    fit.add(revolve(COLLAR, 40), 'bronze')
    fit.add(revolve(_ferrule(), 40), 'bronze')
    for z0 in (-GRIP_Z - 0.04, GRIP_Z):
        fit.add(revolve([(r, z + z0) for r, z in GRIP_RING], 40), 'bronze')
    K.finish(fit.build(coll), width=0.0012, seg=1, angle=30)

    knurl = Part(NAME, 'spear.knurl')
    knurl.add(_knurl(BULB_Z[0], BULB_Z[1], _bulb_r, 12, 20, 0.004), 'bronze')
    knurl.add(_knurl(NECK_Z[0], NECK_Z[1], lambda z: 0.047, 6, 20, 0.003), 'bronze')
    knurl.add(_knurl(-GRIP_Z - 0.01, GRIP_Z + 0.01, lambda z: SHAFT_R + 0.001, 32, 24, 0.002), 'bronze')  # ends sunk in the rings
    o = knurl.build(coll)
    o.data.shade_flat()
    K.finish(o, width=0.0006, seg=1, angle=15)

    blade = Part(NAME, 'spear.blade')
    (verts, faces), fs = _blade()
    for s in fs:
        if s not in blade.slots:
            blade.slots.append(s)
    blade.verts.extend(verts)
    blade.faces.extend(faces)
    blade.fslot.extend(blade.slots.index(s) for s in fs)
    K.finish(blade.build(coll), width=0.0008, seg=1, angle=20)

    return {
        'grips': {'main': [0.0, 0.0, 0.0], 'off': [0.0, 0.0, OFF_HAND]},
        'edge': [list(EDGE[0]), list(EDGE[1])],
    }
