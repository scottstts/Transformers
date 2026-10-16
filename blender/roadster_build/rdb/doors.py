"""Gullwing door inner cards and the flush handle pockets.

The door shell's inner face is the x = +-0.70 panel cut; the card sits on it:
an alcantara pad with a pull, and the red ambient sweep the interior photo shows
continuing from the dash. The handle pocket (side frame, door's rear top
corner) is a small recessed tab on the shoulder, y 0.443-0.500, z 0.87-0.915.
"""
from mathutils import Vector
from . import kit as K, body as B
from .interior import sweep, squircle


def card(m, sx):
    """Door card (interior.avif): a carbon-weave panel, a long grey alcantara
    blade sweeping from high at the front down toward the rear, and the red
    ambient strip lighting the card under the blade's lower edge."""
    x = sx * 0.695
    up = Vector((1, 0, 0))
    # carbon card from the sill up to the belt, its top following the glass line
    panel = []
    secs = []
    for y in (-0.95, -0.70, -0.40, -0.10, 0.15, 0.30):
        top = B.sta(y)['z4'] - 0.015
        bot = 0.36
        panel.append(Vector((x, y, (top + bot) / 2)))
        secs.append(squircle(0.008, (top - bot) / 2, 6.0, 24))
    sweep(m, panel, secs, 'weave', up=up)
    blade = [Vector((x - sx * 0.02, y, z)) for y, z in ((-1.00, 0.76), (-0.75, 0.70), (-0.40, 0.63), (-0.02, 0.56), (0.30, 0.53))]
    sweep(m, blade, [squircle(0.022, 0.045, 3.5, 24)] * len(blade), 'alcantara', up=up)
    glow = [Vector((x - sx * 0.010, y, z - 0.058)) for y, z in ((-0.96, 0.75), (-0.75, 0.70), (-0.40, 0.63), (-0.02, 0.56), (0.26, 0.535))]
    sweep(m, glow, [squircle(0.006, 0.008, 3.0, 12)] * len(glow), 'ambient', up=up)


def handle_pocket(m, sx):
    y0, y1, z0, z1 = 0.446, 0.497, 0.872, 0.912
    s = B.sta((y0 + y1) / 2)
    # on the shoulder band between the crease (p2) and the belt (p3)
    def on(y, z, out):
        t = (z - s['z2']) / max(1e-6, s['z3'] - s['z2'])
        xx = s['x2'] + (s['x3'] - s['x2']) * max(0.0, min(1.0, t))
        return Vector((sx * (xx + out), y, z))
    m.hull([on(y, z, o) for y in (y0, y1) for z in (z0, z1) for o in (-0.012, 0.0008)], 'satin')
    m.hull([on(y, z, o) for y in (y0 + 0.008, y1 - 0.008) for z in (z0 + 0.006, z1 - 0.012) for o in (-0.006, 0.0018)],
           'paint')


def build(nodes):
    for sx, s in ((1, 'L'), (-1, 'R')):
        node = nodes['door.' + s]
        m = K.Mesh()
        card(m, sx)
        handle_pocket(m, sx)
        m.build('car.door.%s.card' % s, '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.002, smooth_angle=45)
