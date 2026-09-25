"""The Cybertruck robot's great-axe, in the truck's language: flat, faceted
brushed stainless planes with hard creases, dark graphite structure layered
over them, and a light-bar strip set into the blade like the truck's front
light bar.

Sized for a 5.8 m robot whose fist closes around a 0.15 m haft: 3.7 m overall,
the main hand at the origin, the second hand 0.95 m up the haft. The head sits
2 m up: a bearded blade (x+) with a ground double bevel, lightening windows
and a bolted graphite armour plate over its root, a faceted back spike (x-)
and a spear point on top; langets run down the haft below the eye.

Declared joins: the haft runs through the eye; the blade, plate and spike
roots are sunk into the eye; plates, langets and the light-bar strip are sunk
1-2 mm into what carries them; wrap bands, ferrules and collars are proud of
the haft.
"""
from mathutils import Vector, Matrix
from f1b import kit as K
from . import kit
from .kit import Part, hex_bolt, bands, ring_band, section_loft, chamfer_rect, diamond

NAME = 'axe'

# local XY -> weapon XZ, local Z -> weapon Y (a reflection: parts recalc their normals)
XZ = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
# local XY -> weapon YZ, local Z -> weapon X
YZ = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

# haft
HAFT = chamfer_rect(0.15, 0.15, 0.042)
HAFT_Z = (-0.66, 2.46)
GRIP_MAIN = (-0.42, 0.40)
GRIP_OFF = (0.58, 1.34)
OFF_HAND = 0.95

# head
EYE = chamfer_rect(0.34, 0.21, 0.055)
EYE_STATIONS = [(1.70, chamfer_rect(0.25, 0.17, 0.045)), (1.80, EYE), (2.26, EYE), (2.36, chamfer_rect(0.27, 0.18, 0.045))]
EYE_FACE = 0.105
BLADE_T = 0.07          # blade thickness at the flats
BLADE_EDGE = 0.004      # half thickness of the land at the cutting edge
BLADE_BEVEL = 0.17      # width of the ground bevel
# (x, z), counter-clockwise seen from +Y; True = on the cutting edge
BLADE = [
    ((0.15, 1.80), False),
    ((0.40, 1.66), False),
    ((0.64, 1.44), False),
    ((0.95, 1.22), True),     # beard tip
    ((1.10, 1.64), True),
    ((1.16, 2.06), True),     # belly
    ((1.13, 2.40), True),
    ((1.03, 2.66), True),     # upper horn
    ((0.62, 2.50), False),
    ((0.15, 2.32), False),
]
WINDOWS = [[(0.30, 1.87), (0.51, 1.74), (0.49, 1.98)], [(0.30, 2.25), (0.49, 2.08), (0.51, 2.32)]]
# graphite armour plate over the blade root, a chevron toward the edge
PLATE = [(0.13, 1.84), (0.40, 1.72), (0.58, 1.55), (0.68, 1.95), (0.62, 2.41), (0.13, 2.28)]
PLATE_BOLTS = [(0.21, 1.86), (0.21, 2.22), (0.57, 1.66), (0.57, 2.33)]
# the cutting edge the game traces for trails: beard tip -> upper horn
EDGE = ((0.95, 0.0, 1.22), (1.03, 0.0, 2.66))


def _blade():
    outline = [p for p, _ in BLADE]
    edge = [e for _, e in BLADE]
    return kit.ground_blade(outline, edge, BLADE_T, BLADE_EDGE, BLADE_BEVEL)


def _groove_path():
    """Centre line of the light-bar groove: the cutting edge offset in past the ground
    bevel (interior lies left of the counter-clockwise outline), trimmed short of the tips."""
    idx = [i for i, (_, e) in enumerate(BLADE) if e]
    pts = [Vector(BLADE[i][0]) for i in idx]
    d = BLADE_BEVEL + 0.075
    out = []
    for k, p in enumerate(pts):
        a = pts[max(k - 1, 0)]
        b = pts[min(k + 1, len(pts) - 1)]
        t = (b - a).normalized()
        out.append(p + Vector((-t.y, t.x)) * d)
    start = out[0].lerp(out[1], 0.3)
    end = out[-2].lerp(out[-1], 0.55)
    return [(p.x, p.y) for p in [start] + out[1:-1] + [end]]


def _strip(path, w, y0, y1):
    """A flat bar along a polyline in the XZ plane, from y0 to y1, pointed ends."""
    left, right = [], []
    for i, (x, z) in enumerate(path):
        a = Vector(path[max(i - 1, 0)])
        b = Vector(path[min(i + 1, len(path) - 1)])
        d = (b - a).normalized()
        n = Vector((-d.y, d.x))
        left.append(Vector((x, z)) + n * w / 2)
        right.append(Vector((x, z)) - n * w / 2)
    d0 = (Vector(path[1]) - Vector(path[0])).normalized() * w * 0.5
    d1 = (Vector(path[-1]) - Vector(path[-2])).normalized() * w * 0.5
    ring = [left[0] + d0] + left[1:-1] + [left[-1] - d1, Vector(path[-1]) + d1 * 0.4] + \
           [right[-1] - d1] + list(reversed(right[1:-1])) + [right[0] + d0, Vector(path[0]) - d0 * 0.4]
    return K.prism(kit.ccw([(p.x, p.y) for p in ring]), y0, y1, XZ)


def _windows(grow=0.0):
    """Faceted lightening windows through the blade (grown for the plate's reveal)."""
    return [K.prism(kit.offset_poly(kit.ccw(t), grow), -0.2, 0.2, XZ) for t in WINDOWS]


def _plates():
    """Armour plates on both flats, 2 mm sunk and 12 mm proud."""
    p = Part(NAME, 'axe.plates')
    for s in (1, -1):
        lo, hi = sorted((s * (BLADE_T / 2 - 0.002), s * (BLADE_T / 2 + 0.012)))
        p.add(K.bevel_prism(kit.ccw(PLATE), lo, hi, 0.004, 2, XZ), 'graphite')
    return p


def _eye():
    """Faceted lozenge socket: a graphite casting with stainless side plates and
    collars where the haft enters and leaves."""
    p = Part(NAME, 'axe.eye')
    p.add(section_loft([s for _, s in EYE_STATIONS], [z for z, _ in EYE_STATIONS], cap_round=0.008), 'graphite')
    p.add(ring_band(HAFT, 1.62, 1.74, 0.03, 0.008), 'darkSteel')
    p.add(ring_band(HAFT, 2.32, 2.43, 0.022, 0.008), 'darkSteel')
    for s in (1, -1):
        lo, hi = sorted((s * (EYE_FACE - 0.002), s * (EYE_FACE + 0.009)))
        p.add(K.bevel_prism(kit.ccw(chamfer_rect(0.20, 0.40, 0.035)), lo, hi, 0.003, 2, XZ @ Matrix.Translation((0.0, 2.03, 0.0))), 'steel')
    return p


def _langets():
    """Steel strips down both edge-facing sides of the haft below the eye."""
    p = Part(NAME, 'axe.langets')
    half = 0.075
    for s in (1, -1):
        outline = kit.ccw([(-0.03, 1.74), (-0.03, 1.47), (0.0, 1.41), (0.03, 1.47), (0.03, 1.74)])
        lo, hi = sorted((s * (half - 0.002), s * (half + 0.010)))
        p.add(K.bevel_prism(outline, lo, hi, 0.003, 2, YZ), 'steel')
    return p


def _fasteners():
    """Every bolt head on the head: eye plates, armour plates, langets."""
    p = Part(NAME, 'axe.fasteners')
    for s in (1, -1):
        for x in (-0.07, 0.07):
            for z in (1.87, 2.19):
                p.add(hex_bolt((x, s * (EYE_FACE + 0.009), z), (0, s, 0), 0.012, 0.007), 'chrome')
        for x, z in PLATE_BOLTS:
            p.add(hex_bolt((x, s * (BLADE_T / 2 + 0.012), z), (0, s, 0), 0.012, 0.007), 'chrome')
        for z in (1.52, 1.64):
            p.add(hex_bolt((s * 0.085, 0.0, z), (s, 0, 0), 0.01, 0.006), 'chrome')
    return p


def _spike():
    """Faceted back spike, drooping slightly: diamond sections stacked along -x
    (local X is weapon +z, local Y weapon +y)."""
    secs = [diamond(0.14, 0.32, 0.0, 2.04), diamond(0.11, 0.22, 0.0, 2.00), diamond(0.05, 0.08, 0.0, 1.93), diamond(0.008, 0.012, 0.0, 1.88)]
    secs = [[(z, y) for y, z in s] for s in secs]
    return section_loft(secs, [0.12, 0.30, 0.56, 0.72], M=kit.z_to('-x'), cap_round=0.0)


def _top_spike():
    secs = [diamond(0.13, 0.13, shoulder=0.3), diamond(0.10, 0.10, shoulder=0.3), diamond(0.012, 0.012, shoulder=0.3)]
    return section_loft(secs, [2.38, 2.52, 2.80], cap_round=0.0)


def _pommel():
    p = Part(NAME, 'axe.pommel')
    grown = lambda d: kit.offset_poly(kit.ccw(HAFT), d)  # noqa: E731
    secs = [grown(0.02), grown(0.035), grown(-0.01), chamfer_rect(0.05, 0.05, 0.015)]
    p.add(section_loft(secs, [-0.64, -0.72, -0.84, -0.90], cap_round=0.006), 'steel')
    p.add(ring_band(HAFT, -0.66, -0.60, 0.024, 0.006), 'darkSteel')
    return p


def _grip():
    p = Part(NAME, 'axe.grip')
    for z0, z1 in (GRIP_MAIN, GRIP_OFF):
        for m in bands(HAFT, z0, z1, 9, 0.009, 0.007, 0.003):
            p.add(m, 'rubber')
        p.add(ring_band(HAFT, z0 - 0.05, z0 + 0.005, 0.02, 0.006), 'darkSteel')
        p.add(ring_band(HAFT, z1 - 0.005, z1 + 0.05, 0.02, 0.006), 'darkSteel')
    p.add(ring_band(HAFT, GRIP_MAIN[1] + 0.07, GRIP_OFF[0] - 0.07, 0.008, 0.006), 'chrome')
    return p


def build(coll):
    """Every part of the axe in `coll`. Returns the export metadata."""
    haft = Part(NAME, 'axe.haft')
    haft.add(section_loft([HAFT, kit.offset_poly(kit.ccw(HAFT), -0.006)], [HAFT_Z[0], HAFT_Z[1]], cap_round=0.01), 'graphite')
    K.finish(haft.build(coll), width=0.004, seg=2, angle=30)
    K.finish(_grip().build(coll), width=0.0015, seg=1, angle=35)
    K.finish(_pommel().build(coll), width=0.004, seg=2, angle=30)
    K.finish(_eye().build(coll), width=0.005, seg=2, angle=30)
    K.finish(_langets().build(coll), width=0.002, seg=1, angle=35)

    bo = Part(NAME, 'axe.blade').add(_blade(), 'steel').build(coll)
    cutters = _windows()
    for s in (1, -1):
        y0, y1 = (BLADE_T / 2 - 0.014, BLADE_T / 2 + 0.05) if s > 0 else (-BLADE_T / 2 - 0.05, -BLADE_T / 2 + 0.014)
        cutters.append(_strip(_groove_path(), 0.042, y0, y1))
    kit.cut(bo, NAME, 'steel', *cutters)
    K.finish(bo, width=0.003, seg=2, angle=25)

    plates = _plates().build(coll)
    kit.cut(plates, NAME, 'graphite', *_windows(0.022))
    K.finish(plates, width=0.003, seg=2, angle=30)

    strip = Part(NAME, 'axe.lightbar')
    for s in (1, -1):
        y0, y1 = (BLADE_T / 2 - 0.015, BLADE_T / 2 - 0.007) if s > 0 else (-BLADE_T / 2 + 0.007, -BLADE_T / 2 + 0.015)
        strip.add(_strip(_groove_path(), 0.026, y0, y1), 'glow')
    K.finish(strip.build(coll), width=0.0015, seg=1, angle=40)

    K.finish(_fasteners().build(coll), width=0.0008, seg=1, angle=40)

    spikes = Part(NAME, 'axe.spikes')
    spikes.add(_spike(), 'steel')
    spikes.add(_top_spike(), 'steel')
    K.finish(spikes.build(coll), width=0.003, seg=2, angle=25)

    return {
        'grips': {'main': [0.0, 0.0, 0.0], 'off': [0.0, 0.0, OFF_HAND]},
        'edge': [list(EDGE[0]), list(EDGE[1])],
    }
