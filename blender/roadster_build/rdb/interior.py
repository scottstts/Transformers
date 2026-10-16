"""Cabin: hollowed out of the body under the canopy and furnished.

The door-open photo shows a black cabin with white shell-backed bucket seats
and amber ambient light strips; the driver sits on the left (+X). The cabin
cavity runs from the dash (y -1.22) to the rear bulkhead (y 0.80), inboard of
the door skins (|x| < 0.66), floor at z 0.22, open to the glass.

Every trim part is a loft of rounded sections (superellipses or U-sections),
never a box: the seats are composite bucket shells with bolsters, the dash a
profiled blade with tapered ends.
"""
import math
from mathutils import Vector, Matrix
from . import kit as K, body as B

Y0, Y1, HALF, FLOOR = -1.22, 0.80, 0.66, 0.22


def cutter():
    """Cabin cavity: a loft whose top rises through the shell into the canopy."""
    m = K.Mesh()
    rings = []
    for y in B.stations(Y0, Y1, 0.05):
        s = B.sta(y)
        hw = min(HALF, s['x4'] - 0.07)
        top = s['z4'] + 0.08
        rings.append([Vector((x, y, z)) for x, z in ((-hw, FLOOR), (hw, FLOOR), (hw, top), (-hw, top))])
    m.loft(rings, 'carpet')
    return m


def squircle(hw, hd, n=4.0, seg=24):
    """Superellipse section (a, b local), |a|^n + |b|^n = 1 scaled."""
    out = []
    for i in range(seg):
        t = i * math.tau / seg
        c, s = math.cos(t), math.sin(t)
        out.append((hw * math.copysign(abs(c) ** (2 / n), c), hd * math.copysign(abs(s) ** (2 / n), s)))
    return out


def ushape(hw, wing, back, thick, r=0.02, seg=6):
    """Bucket U-section (a across, b along the depth; +b is forward): a back wall
    `back` deep plus two side wings reaching `wing` forward, wall `thick`."""
    def arc(cx, cb, rr, a0, a1, k=seg):
        return [(cx + rr * math.cos(math.radians(a0 + (a1 - a0) * i / k)),
                 cb + rr * math.sin(math.radians(a0 + (a1 - a0) * i / k))) for i in range(k + 1)]
    outer = arc(hw - r, -back + r, r, -90, 0) + arc(hw - r, wing - r, r, 0, 90)
    inner_r = max(0.004, r - thick * 0.5)
    inner = arc(hw - thick - inner_r, wing - inner_r, inner_r, 90, 180)[:-1] + \
        arc(hw - thick - r, -back + thick + r, r, 0, -90)
    half = outer + inner[:]
    left = [(-a, b) for a, b in reversed(half)]
    return half + left


def sweep(m, path, sections, mat, up=Vector((1, 0, 0)), cap=True, closed=False):
    """Loft sections (list of (a, b) loops, same length) placed at each path point;
    a runs along `up` (the across axis), b along the path's normal. A closed
    path wraps (its first ring is repeated exactly at the end)."""
    rings = []
    n = len(path)
    for i, p in enumerate(path):
        if closed:
            t = (path[(i + 1) % n] - path[(i - 1) % n]).normalized()
        else:
            t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        a_ax = (up - t * up.dot(t)).normalized()
        b_ax = t.cross(a_ax).normalized()
        rings.append([p + a_ax * a + b_ax * b for a, b in sections[i]])
    if closed:
        rings.append(rings[0])
        cap = False
    m.loft(rings, mat, cap=cap)


def seat(m, sx):
    """Low reclined bucket seat (interior.avif): a wide white composite back
    with rounded shoulders and a dished face, grey alcantara wings along its
    outboard edge, a white cushion on a dark base."""
    x = sx * 0.33
    hip = Vector((x, 0.14, 0.30))
    rake = math.radians(28)
    up = Vector((0, math.sin(rake), math.cos(rake)))
    across = Vector((1, 0, 0))
    # back: squircle sections along the spine, widest at the shoulders, the top
    # closing in a rounded crown
    spine, secs = [], []
    for t, hw, hd in ((0.00, 0.235, 0.050), (0.18, 0.255, 0.055), (0.38, 0.270, 0.055), (0.52, 0.272, 0.052),
                      (0.58, 0.262, 0.048), (0.615, 0.235, 0.040), (0.635, 0.190, 0.028), (0.642, 0.120, 0.014)):
        spine.append(hip + up * t + Vector((0, 0.05, 0)))
        secs.append(squircle(hw, hd, 4.5, 40))
    sweep(m, spine, secs, 'seatwhite', up=across)
    # dished face: a shallow alcantara-free pad, white, 8 mm proud
    pad = [hip + up * t + Vector((0, 0.05, 0)) - up.cross(across) * 0.0 for t in (0.06, 0.30, 0.52)]
    face_off = across.cross(up).normalized() * -0.052
    sweep(m, [p + face_off for p in pad], [squircle(hw, 0.010, 4.0, 32) for hw in (0.17, 0.20, 0.18)], 'seatwhite',
          up=across)
    # grey alcantara wing on the outboard edge of the back
    wing = [hip + up * t + Vector((sx * 0.245, 0.05, 0)) for t in (0.02, 0.20, 0.40, 0.50)]
    sweep(m, wing, [squircle(0.035, 0.060, 3.0, 20) for _ in wing], 'alcantara', up=across)
    # cushion and its base
    cush = [Vector((x, 0.10 - d, 0.33 + 0.07 * (d / 0.46) ** 1.5)) for d in (0.0, 0.15, 0.30, 0.40, 0.46)]
    sweep(m, cush, [squircle(hw, 0.040, 4.0, 32) for hw in (0.23, 0.24, 0.235, 0.22, 0.19)], 'seatwhite', up=across)
    sweep(m, [Vector((x, 0.06, FLOOR)), Vector((x, 0.06, 0.30))], [squircle(0.17, 0.22, 5.0, 24)] * 2, 'interior',
          up=across)
    for b_ in (-1, 1):
        sweep(m, [Vector((x + b_ * 0.15, 0.14, FLOOR + 0.012)), Vector((x + b_ * 0.15, -0.42, FLOOR + 0.012))],
              [squircle(0.012, 0.012, 3.0, 12)] * 2, 'gunmetal', up=Vector((0, 0, 1)))


def rrect(hw, hh, r, n=5):
    """Rounded rectangle loop (a, b)."""
    out = []
    for cx, cy, a0 in ((hw - r, -hh + r, -90), (hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180)):
        for i in range(n + 1):
            t = math.radians(a0 + 90 * i / n)
            out.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return out


def dash(m):
    """Slim full-width dash (interior.avif): an alcantara top, a dark face with
    a slot across it, ends running into the door cards; the landscape screen
    stands on it right of centre."""
    xs = [-0.645 + 1.29 * i / 40 for i in range(41)]
    top = [(-1.27, 0.715), (-1.10, 0.720), (-0.99, 0.708), (-0.975, 0.690)]
    face = [(-0.975, 0.690), (-0.972, 0.662), (-0.985, 0.656), (-0.985, 0.650), (-0.972, 0.644), (-0.978, 0.600),
            (-1.00, 0.585), (-1.27, 0.585)]
    for prof, mat in ((top + [(-1.27, 0.690)], 'alcantara'), (face, 'interior')):
        m.loft([[Vector((x, y, z)) for y, z in prof] for x in xs], mat)
    # the slot: a dark groove line across the face
    m.loft([[Vector((x, y, z)) for y, z in ((-0.984, 0.647), (-0.979, 0.647), (-0.979, 0.653), (-0.984, 0.653))]
            for x in (-0.60, 0.60)], 'graphite')
    # screen: 0.37 x 0.26 landscape, thin bezel, on a short stem
    sc = Vector((-0.03, -1.03, 0.845))
    tilt = Matrix.Rotation(math.radians(-10), 3, 'X')
    bez = [sc + tilt @ Vector((a, 0.0, b)) for a, b in rrect(0.186, 0.130, 0.010)]
    m.loft([bez, [p + tilt @ Vector((0, 0.016, 0)) for p in bez]], 'graphite')
    scr = [sc + tilt @ Vector((a, -0.001, b)) for a, b in rrect(0.178, 0.122, 0.006)]
    m.loft([scr, [p + tilt @ Vector((0, 0.004, 0)) for p in scr]], 'screen')
    sweep(m, [sc + Vector((0, 0.03, -0.12)), sc + Vector((0, 0.04, -0.14))], [squircle(0.05, 0.015, 4.0, 16)] * 2,
          'graphite', up=Vector((1, 0, 0)))
    yoke(m)


def yoke(m):
    """Closed rounded-rectangle yoke: white rim, dark inner face, shield hub,
    two spokes, silver paddles behind."""
    x = 0.36
    hub = Vector((x, -0.86, 0.69))
    col0 = Vector((x, -1.12, 0.62))
    sweep(m, [col0, hub + Vector((0, -0.04, 0))], [squircle(0.035, 0.035, 2.0, 20)] * 2, 'graphite', up=Vector((1, 0, 0)))
    rim = [hub + Vector((a, 0.0, b)) for a, b in rrect(0.150, 0.105, 0.05, 6)]
    # rim: a squircle section swept round the rounded rectangle, white outside
    sweep(m, rim, [squircle(0.022, 0.015, 3.0, 16)] * len(rim), 'seatwhite', up=Vector((0, 1, 0)), closed=True)
    shield = [(0.0, 0.065), (0.055, 0.045), (0.062, -0.01), (0.035, -0.06), (-0.035, -0.06), (-0.062, -0.01), (-0.055, 0.045)]
    m.loft([[hub + Vector((a, d, b)) for a, b in shield] for d in (0.02, -0.025)], 'interior')
    m.loft([[hub + Vector((a * 0.8, -0.026, b * 0.8)) for a, b in shield], [hub + Vector((a * 0.8, -0.03, b * 0.8)) for a, b in shield]],
           'graphite')
    for sx in (-1, 1):
        m.tube([hub + Vector((sx * 0.055, 0.0, 0.0)), hub + Vector((sx * 0.135, 0.0, -0.005))], 0.016, 'interior', 12)
        m.hull([hub + Vector((sx * a, 0.035 + d, b)) for a in (0.07, 0.11) for d in (0.0, 0.006) for b in (-0.03, 0.05)],
               'chrome')


def band(m, path, w, t, mat='alcantara', up=Vector((1, 0, 0))):
    """A flat trimmed member: a rounded w x t section swept along a path."""
    sweep(m, path, [squircle(w / 2, t / 2, 4.0, 20)] * len(path), mat, up=up)


def roll_structure(m):
    """The alcantara cabin structure (interior.avif): the header beam over the
    windshield with the mirror on a triangular bracket, the A-pillar hoop down to
    the dash ends, a diagonal strut inboard of each pillar, the roof rails over the
    doors and the rear header."""
    hy = -0.36
    hz = B.SIL_Z(hy) - 0.055
    head = [Vector((x, hy, hz - 0.035 * (abs(x) / 0.56) ** 2)) for x in (-0.58, -0.40, -0.2, 0.0, 0.2, 0.40, 0.58)]
    band(m, head, 0.075, 0.050, up=Vector((0, 1, 0)))
    for sx in (-1, 1):
        # A-pillar hoop: along the windshield side edge, then down to the dash end
        path = []
        for k in range(9):
            y = hy - (0.82 - 0.36) * k / 8
            path.append(Vector((sx * (B.RAIL_X(y) - 0.055), y, B.SIL_Z(y) - 0.07)))
        path.append(Vector((sx * 0.66, -1.00, 0.78)))
        path.append(Vector((sx * 0.655, -1.08, 0.70)))
        band(m, path, 0.080, 0.035)
        # diagonal strut: from the header near its end down and inboard to the dash
        band(m, [Vector((sx * 0.50, hy - 0.02, hz - 0.03)), Vector((sx * 0.47, -0.70, 0.90)),
                 Vector((sx * 0.43, -0.99, 0.715))], 0.045, 0.028)
        # roof rail over the door, back to the rear header
        rail = [Vector((sx * (B.RAIL_X(y) - 0.045), y, B.SIL_Z(y) - 0.06)) for y in (-0.36, -0.1, 0.2, 0.5, 0.75)]
        band(m, rail, 0.070, 0.035)
    ry = 0.75
    band(m, [Vector((x, ry, B.SIL_Z(ry) - 0.06)) for x in (-0.50, -0.25, 0.0, 0.25, 0.50)], 0.07, 0.045,
         up=Vector((0, 1, 0)))
    # mirror: a triangular bracket hanging from the header, the glass slab on it
    apex = Vector((0, hy - 0.01, hz - 0.02))
    base_z = hz - 0.115
    for a_, b_ in (((-0.045, base_z), (0.0, hz - 0.02)), ((0.045, base_z), (0.0, hz - 0.02)), ((-0.045, base_z), (0.045, base_z))):
        band(m, [Vector((a_[0], hy - 0.02, a_[1])), Vector((b_[0], hy - 0.02, b_[1]))], 0.010, 0.012, 'graphite',
             up=Vector((0, 1, 0)))
    mc = Vector((0, hy - 0.04, base_z + 0.035))
    m.loft([[mc + Vector((a, d, b)) for a, b in rrect(0.105, 0.028, 0.008)] for d in (-0.012, 0.006)], 'graphite')


def tub_liner(m):
    """Carpeted floor, the firewall and the footwell sides closing the cabin."""
    m.loft([[Vector((x, y, z)) for y, z in ((Y0 + 0.002, FLOOR), (Y1 - 0.004, FLOOR), (Y1 - 0.004, FLOOR + 0.012),
                                             (Y0 + 0.002, FLOOR + 0.012))] for x in (-HALF + 0.004, HALF - 0.004)], 'carpet')
    m.loft([[Vector((x, y, z)) for y, z in ((Y0 + 0.002, FLOOR), (Y0 + 0.014, FLOOR), (Y0 + 0.014, 0.60),
                                             (Y0 + 0.002, 0.60))] for x in (-HALF + 0.004, HALF - 0.004)], 'carpet')


def headliner(m):
    """Alcantara headliner under the glass roof between the rails and headers,
    with a recessed channel down its centre (interior.avif)."""
    rows = []
    for y in [-0.36 + (0.75 + 0.36) * i / 24 for i in range(25)]:
        z0 = B.SIL_Z(y) - 0.030
        hw = B.RAIL_X(y) - 0.07
        sec = []
        for k in range(13):
            u = -1 + 2 * k / 12
            x = u * hw
            dz = -0.018 * u * u
            if abs(x) < 0.05:
                dz -= 0.012 * (1 - abs(x) / 0.05) ** 0.5   # the centre channel
            sec.append(Vector((x, y, z0 + dz)))
        rows.append(sec + [p + Vector((0, 0, 0.012)) for p in reversed(sec)])
    m.loft(rows, 'alcantara')


def console(m):
    """White centre console between the seats, a dark column down from the dash
    with a white trim edge."""
    path = [Vector((0, y, z)) for y, z in ((0.76, 0.46), (0.40, 0.44), (0.0, 0.42), (-0.45, 0.40), (-0.58, 0.385), (-0.64, 0.37))]
    # the front end rounds down into the column instead of ending in a flat cap
    secs = [squircle(0.115, 0.06, 5.0, 28)] * 4 + [squircle(0.10, 0.05, 4.0, 28), squircle(0.055, 0.03, 3.0, 28)]
    sweep(m, path, secs, 'seatwhite', up=Vector((1, 0, 0)))
    sweep(m, [Vector((0, y, z)) for y, z in ((-0.62, 0.30), (-0.80, 0.42), (-0.93, 0.58))],
          [squircle(0.05, 0.045, 4.0, 20)] * 3, 'interior', up=Vector((1, 0, 0)))


def bulkhead(m):
    """Rear bulkhead behind the seats: two speaker grilles in machined rings."""
    for sx in (-1, 1):
        c = Vector((sx * 0.36, Y1 - 0.004, 0.62))
        m.lathe([(0.0, 0.070), (0.0, 0.078), (0.006, 0.078), (0.006, 0.070)], 'gunmetal', c, (0, -1, 0), 48)
        m.lathe([(0.0, 0.0), (0.0, 0.069), (0.002, 0.066), (0.002, 0.0)], 'graphite', c, (0, -1, 0), 48)


def build(node):
    m = K.Mesh()
    for sx in (-1, 1):
        seat(m, sx)
    dash(m)
    console(m)
    bulkhead(m)
    roll_structure(m)
    headliner(m)
    tub_liner(m)
    m.build('car.cabin', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0, smooth_angle=50)
