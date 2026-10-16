"""Rear propulsion assembly, traced from back.JPG at the tail plane (603 px/m,
column 1024 = x 0, row 608 = z 0.903) and propeller.avif; the rear faces lie on
the raked lower tail face (rear.rake_y).

What the photos show, and how each part is built:

  shroud    the nozzle housing: a raised rolled rim swept along its outline (flat
            top at z 0.614, 45-degree chamfers down to (0.582, 0.535), straight
            sides to the shelf), a face recessed 30 mm inside it, and a thin rod
            across the face at the nozzle axis (z 0.541) joining the flanges
  nozzles   thrust nozzles at x +-0.114 / +-0.340: a thin pale-bronze rolled rim on
            a black bore, seated in a carbon flange pointed left and right only
  shelf     a thin full-width plate at z 0.481-0.493 with a rounded nose, the
            shroud's floor and the roof over the engine bay
  pillars   the guard's sides: carbon blocks at |x| 0.506-0.594, their front faces
            angled inward, the lower outer corner chamfered from z 0.30 to 0.187
  lip       the guard's thick lower lip: its top edge a trapezoid (z 0.278 at the
            pillars rising to 0.303 between the outer dividers), a rounded nose,
            a centre skid tab dropping to z 0.162 over |x| < 0.25, bolt holes
  dividers  three thin fins at x 0, +-0.282 flaring to gussets at their feet
  engines   compressor engines behind the guard, centred z 0.41 at x +-0.137,
            +-0.425: the casing ring (outer r 0.126), 13 outlet guide vanes, the
            compressor stage behind them, and a domed tail cone (r 0.058) ending
            in a short tube that points out of the bay
  strakes   diffuser fins under the lip and the rising diffuser floor
"""
import math
from mathutils import Vector
from . import kit as K
from .rear import rake_y, MASK_X, NOZZLES

RAKE = math.atan2(0.102, 0.49)                 # the face leans forward by this from vertical
FACE_N = Vector((0, math.cos(RAKE), -math.sin(RAKE)))   # outward normal of the raked face
UP = Vector((0, math.sin(RAKE), math.cos(RAKE)))        # up along the raked face

SHROUD = [(0.582, 0.488), (0.582, 0.535), (0.505, 0.614)]   # right half, bottom -> top centre
SHELF_Z = (0.481, 0.493)
PILLAR = dict(outer=0.594, inner_top=0.547, inner_bot=0.506, chamfer=(0.300, 0.187))
LIP_TOP_IN, LIP_TOP_OUT, LIP_BOT = 0.303, 0.278, 0.182
TAB = (0.250, 0.162)                      # skid tab half width, bottom z
DIVIDERS = (-0.282, 0.0, 0.282)
ENGINES = (-0.425, -0.137, 0.137, 0.425)
ENGINE_Z, ENGINE_R = 0.395, 0.118
ENGINE_SET = 0.105                        # engine exit plane behind the face


def on_face(x, z, out=0.0):
    return Vector((x, rake_y(z), z)) + FACE_N * out


def round_path(pts, r, seg=5):
    """Polyline with every interior corner filleted (radius r)."""
    out = [Vector(pts[0])]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[i + 1])
        d0, d1 = (p0 - p1).normalized(), (p2 - p1).normalized()
        a = d0.angle(d1)
        t = min(r / math.tan(a / 2), (p0 - p1).length * 0.45, (p2 - p1).length * 0.45)
        s, e = p1 + d0 * t, p1 + d1 * t
        for k in range(seg + 1):
            u = k / seg
            out.append(s * (1 - u) ** 2 + p1 * 2 * u * (1 - u) + e * u * u)
    out.append(Vector(pts[-1]))
    return out


def shroud(m):
    """Raised rolled rim along the shroud outline, the recessed face inside it and
    the rod at the nozzle axis."""
    half = SHROUD
    outline2 = [(x, z) for x, z in half] + [(-x, z) for x, z in reversed(half)]
    path2 = round_path([Vector((x, z, 0)) for x, z in outline2], 0.022)
    path = [on_face(p.x, p.y) for p in path2]

    def normal(i, p, t):
        n = t.cross(FACE_N)
        cen = on_face(0.0, 0.52)
        return n if n.dot(p - cen) > 0 else -n
    # profile: (n outward from the opening, b along FACE_N), a rolled rim 18 mm wide
    prof = []
    for k in range(13):
        a = math.pi * k / 12
        prof.append((0.009 - 0.009 * math.cos(a), 0.004 + 0.010 * math.sin(a)))
    prof += [(0.022, 0.004), (0.022, -0.040), (-0.002, -0.040)]
    t0 = (path[1] - path[0]).normalized()
    sgn = 1.0 if t0.cross(normal(0, path[0], t0)).dot(FACE_N) > 0 else -1.0
    m.sweep(path, [(a, b * sgn) for a, b in prof], 'weave', normal=normal)
    # recessed face: the outline inset 2 mm, 30 mm behind the rim top
    inner = [(x * 0.996, z) for x, z in outline2]
    face_ring = [on_face(x, z, -0.026) for x, z in inner]
    back_ring = [on_face(x, z, -0.040) for x, z in inner]
    m.loft([back_ring, face_ring], 'weave')
    # the rod across the face at the nozzle axis, between the flanges and to the rim
    z = NOZZLES[0][1]
    xs = [-0.578, -NOZZLES[1][0] - 0.06, -NOZZLES[1][0] + 0.06, -NOZZLES[0][0] - 0.06, -NOZZLES[0][0] + 0.06,
          NOZZLES[0][0] - 0.06, NOZZLES[0][0] + 0.06, NOZZLES[1][0] - 0.06, NOZZLES[1][0] + 0.06, 0.578]
    rod = [(0.0035 * math.cos(a), 0.0035 * math.sin(a)) for a in [k * math.tau / 10 for k in range(10)]]
    for a_, b_ in zip(xs[0::2], xs[1::2]):
        m.sweep([on_face(a_, z, -0.024), on_face(b_, z, -0.024)], rod, 'graphite', normal=lambda i, p, t: (0, 0, 1))


def nozzle(m, x, z):
    """Thrust nozzle: a thin pale-bronze rolled rim round a black bore, seated in
    a carbon flange pointed left and right only."""
    c = on_face(x, z, -0.012)
    ax = FACE_N
    # body tube; its bore is lined in bronze for the first 40 mm
    m.lathe([(-0.120, 0.039), (-0.012, 0.041), (-0.003, 0.0415), (-0.003, 0.0360), (-0.040, 0.0345),
             (-0.120, 0.0300)], 'graphite', c, ax, 48, ring=True)
    m.lathe([(-0.004, 0.0362), (-0.040, 0.0347), (-0.042, 0.0340), (-0.006, 0.0355)], 'nozzle', c, ax, 48, ring=True)
    # thick rolled rim, outer r 0.047 (back.JPG)
    m.lathe([(-0.008, 0.0410), (-0.002, 0.0455), (0.004, 0.0470), (0.009, 0.0458), (0.012, 0.0420),
             (0.011, 0.0380), (0.006, 0.0360), (-0.003, 0.0356), (-0.009, 0.0372)], 'nozzle', c, ax, 64, ring=True)
    m.lathe([(-0.114, 0.0), (-0.114, 0.0290), (-0.100, 0.0290), (-0.088, 0.012), (-0.084, 0.0)], 'graphite', c, ax, 32)
    u = Vector((1, 0, 0))
    w = UP
    lozenge = [(0.068, 0.0), (0.042, 0.050), (-0.042, 0.050), (-0.068, 0.0), (-0.042, -0.050), (0.042, -0.050)]
    outline = [u * a_ + w * b_ for a_, b_ in lozenge]
    face, back = -0.012, -0.030
    m.loft([[c + ax * back + q for q in outline], [c + ax * (face - 0.004) + q for q in outline],
            [c + ax * face + q * 0.90 for q in outline]], 'weave')


def shelf(m):
    """Full-width plate under the shroud, its nose rounded and 12 mm proud."""
    z0, z1 = SHELF_Z
    zc, r = (z0 + z1) / 2, (z1 - z0) / 2
    prof = [(-0.20, z0), (0.006, z0)]
    for k in range(1, 8):
        a = -math.pi / 2 + math.pi * k / 8
        prof.append((0.006 + r * math.cos(a), zc + r * math.sin(a)))
    prof += [(0.006, z1), (-0.20, z1)]
    secs = []
    for x in (-PILLAR['outer'], PILLAR['outer']):
        secs.append([Vector((x, rake_y(z) + d, z)) for d, z in prof])
    m.loft(secs, 'weave')


def pillar(m, sx):
    """Guard side block: its front face angles from the outer edge back to the
    inner edge, the lower outer corner chamfered."""
    o, it, ib = PILLAR['outer'], PILLAR['inner_top'], PILLAR['inner_bot']
    cz0, cz1 = PILLAR['chamfer']
    zt = SHELF_Z[0]
    front = [(o, zt, 0.000), (o, cz0, 0.000), (0.547, cz1, -0.004), (ib, LIP_BOT + 0.02, -0.030),
             (0.540, cz0, -0.030), (it, zt, -0.030)]
    pts = []
    for x, z, d in front:
        p = on_face(x, z, d)
        pts += [Vector((sx * p.x, p.y, p.z)), Vector((sx * p.x, 1.80, p.z))]
    m.hull(pts, 'weave')


def lip_top(x):
    ax_ = abs(x)
    if ax_ <= 0.282:
        return LIP_TOP_IN
    t = min(1.0, (ax_ - 0.282) / (0.522 - 0.282))
    return LIP_TOP_IN + (LIP_TOP_OUT - LIP_TOP_IN) * t


def lip_bottom(x):
    ax_ = abs(x)
    if ax_ <= TAB[0] - 0.018:
        return TAB[1]
    if ax_ >= TAB[0] + 0.010:
        return LIP_BOT
    t = (ax_ - (TAB[0] - 0.018)) / 0.028
    return TAB[1] + (LIP_BOT - TAB[1]) * (t * t * (3 - 2 * t))


def lip(m):
    """The lower lip, lofted across x: a rounded nose on the rake face, a top
    surface running back into the bay, its top edge the measured trapezoid."""
    xs = sorted(set([round(-0.56 + 1.12 * i / 80, 4) for i in range(81)] +
                    [s * v for s in (-1, 1) for v in (0.282, 0.522, TAB[0] - 0.018, TAB[0] + 0.010)]))
    secs = []
    for x in xs:
        zt, zb = lip_top(x), lip_bottom(x)
        rr = 0.010
        prof = [on_face(x, zb, -0.10), on_face(x, zb, -0.004), on_face(x, zb + 0.004, 0.0)]
        prof += [on_face(x, zt - rr, 0.0)]
        for k in range(1, 6):
            a = math.pi / 2 * k / 5
            prof.append(on_face(x, zt - rr + rr * math.sin(a), -rr + rr * math.cos(a)))
        prof += [on_face(x, zt, -0.10)]
        secs.append(prof)
    m.loft(secs, 'weave')


def bolt_holes(m):
    """Dark recessed bolt heads along the lip's lower edge."""
    for x in (-0.552, -0.274, 0.0, 0.274, 0.552):
        z = (lip_bottom(x) if abs(x) > 0.3 else TAB[1]) + 0.012
        c = on_face(x, z, -0.0005)
        m.lathe([(0.0, 0.0), (0.0, 0.0065), (-0.004, 0.0065), (-0.004, 0.0)], 'graphite', c, FACE_N, 20)


def divider(m, x):
    """Thin fin from the shelf to the lip, flaring into a gusset at its foot."""
    secs = []
    top, bot = SHELF_Z[0] + 0.004, lip_top(x) - 0.004
    for k in range(11):
        z = top + (bot - top) * k / 10
        t = k / 10
        hw = 0.0028 + 0.010 * t ** 3
        front = on_face(0, z, -0.006)
        secs.append([Vector((x + dx, y, z)) for dx, y in ((-hw, 1.85), (hw, 1.85), (hw * 0.6, front.y), (-hw * 0.6, front.y))])
    m.loft(secs, 'weave')


def engine(m, x):
    """Compressor engine seen from its exhaust end."""
    ax = Vector((0, 1, 0))
    e = Vector((x, rake_y(ENGINE_Z) - ENGINE_SET, ENGINE_Z))
    R = ENGINE_R
    u = Vector((1, 0, 0))
    w = Vector((0, 0, 1))
    # casing: thick tube flanged at the exit, running forward into the body
    m.lathe([(0.004, R), (0.004, R + 0.006), (-0.006, R + 0.008), (-0.26, R + 0.008), (-0.26, R)],
            'gunmetal', e, ax, 96, ring=True)
    # tail cone: broad dome on the hub, a concave neck, an open tube tip
    prof = [(-0.16, 0.0), (-0.16, 0.066), (-0.06, 0.066)]
    for k in range(1, 13):
        a = k / 12 * math.pi / 2
        prof.append((-0.06 + 0.070 * math.sin(a), 0.020 + 0.046 * math.cos(a)))
    prof += [(0.026, 0.0165), (0.040, 0.0158), (0.052, 0.0160), (0.055, 0.0140), (0.054, 0.0105),
             (0.046, 0.0100), (0.040, 0.0)]
    m.lathe(prof, 'graphite', e, ax, 64)
    # core nozzle: a ring round the cone's base, its lip catching the light
    m.lathe([(-0.040, 0.068), (-0.034, 0.072), (-0.030, 0.076), (-0.036, 0.078), (-0.090, 0.076), (-0.090, 0.068)],
            'gunmetal', e, ax, 64, ring=True)
    # outlet guide vanes: cambered, swept, 13 of them between the cone and casing
    for k in range(13):
        base = k * math.tau / 13
        secs = []
        for r, chord, twist in ((0.056, 0.060, 30), (0.088, 0.064, 22), (R - 0.001, 0.066, 15)):
            ang = base + 0.12 * (r - 0.056) / (R - 0.056)
            rad = u * math.cos(ang) + w * math.sin(ang)
            tan = -u * math.sin(ang) + w * math.cos(ang)
            tw = math.radians(twist)
            cd = ax * math.cos(tw) + tan * math.sin(tw)
            td = tan * math.cos(tw) - ax * math.sin(tw)
            p0 = e + rad * r - ax * 0.075
            sec = []
            for s in range(9):
                t = s / 8
                th = 0.0030 * math.sin(math.pi * min(1.0, t * 1.1)) + 0.0004
                sec.append(p0 + cd * (chord * (t - 0.5)) + td * (0.005 * 4 * t * (1 - t) + th))
            for s in range(7, 0, -1):
                t = s / 8
                th = 0.0030 * math.sin(math.pi * min(1.0, t * 1.1)) + 0.0004
                sec.append(p0 + cd * (chord * (t - 0.5)) + td * (0.005 * 4 * t * (1 - t) - th))
            secs.append(sec)
        m.loft(secs, 'titanium')
    # compressor stage behind the vanes: a disc and 23 thin twisted blades
    m.lathe([(-0.15, 0.0), (-0.15, 0.058), (-0.12, 0.058), (-0.12, 0.0)], 'gunmetal', e, ax, 48)
    for k in range(23):
        base = k * math.tau / 23
        secs = []
        for r, twist in ((0.058, 62), (R - 0.002, 40)):
            rad = u * math.cos(base) + w * math.sin(base)
            tan = -u * math.sin(base) + w * math.cos(base)
            tw = math.radians(twist)
            cd = ax * math.cos(tw) + tan * math.sin(tw)
            td = tan * math.cos(tw) - ax * math.sin(tw)
            p0 = e + rad * r - ax * 0.135
            secs.append([p0 + cd * (-0.015) + td * 0.0012, p0 + cd * 0.015 + td * 0.0012,
                         p0 + cd * 0.015 - td * 0.0012, p0 + cd * (-0.015) - td * 0.0012])
        m.loft(secs, 'titanium')


def bay(m):
    """Dark floor and roof of the bay around the engines."""
    y0 = 1.70
    for x0, x1, z0, z1 in ((-PILLAR['outer'], PILLAR['outer'], LIP_BOT, LIP_BOT + 0.006),
                           (-PILLAR['outer'], PILLAR['outer'], SHELF_Z[0] - 0.006, SHELF_Z[0])):
        m.hull([(x, y, z) for x in (x0, x1) for z in (z0, z1) for y in (y0, rake_y(z) - 0.08)], 'graphite')


def strakes(m):
    for x in (-MASK_X + 0.03, -0.282, 0.0, 0.282, MASK_X - 0.03):
        secs = []
        for y in (1.62, 1.80, 1.95):
            z_top = 0.150 + (y - 1.62) * 0.06
            depth = 0.012 + (y - 1.62) * 0.09
            secs.append([Vector((x + dx, y, z)) for dx, z in ((-0.004, z_top), (0.004, z_top),
                                                              (0.0025, z_top - depth), (-0.0025, z_top - depth))])
        m.loft(secs, 'weave')
    secs = []
    for x in (-MASK_X - 0.012, MASK_X + 0.012):
        secs.append([Vector((x, y, z)) for y, z in ((1.50, 0.150), (1.70, 0.158), (1.936, 0.172),
                                                     (1.936, 0.184), (1.70, 0.170), (1.50, 0.162))])
    m.loft(secs, 'satin')


def build(node):
    rest = node.matrix_basis.copy()

    def part(name, fns, bevel=0.0, smooth=40):
        m = K.Mesh()
        for fn in fns:
            fn(m)
        m.build('car.tail.prop.' + name, '01_CAR', parent=node, rest=rest, bevel=bevel, smooth_angle=smooth)
    part('shroud', [shroud], 0.0, 40)
    part('shelf', [shelf], 0.0, 40)
    part('pillars', [lambda m: pillar(m, 1), lambda m: pillar(m, -1)], 0.003, 30)
    part('lip', [lip], 0.0, 35)
    part('bolts', [bolt_holes], 0.0, 40)
    part('dividers', [lambda m: [divider(m, x) for x in DIVIDERS]], 0.0, 50)
    part('bay', [bay], 0.0, 30)
    part('strakes', [strakes], 0.001, 35)
    m = K.Mesh()
    for x0, z in NOZZLES:
        for x in (x0, -x0):
            nozzle(m, x, z)
    m.build('car.tail.nozzles', '01_CAR', parent=node, rest=rest, bevel=0.0006, smooth_angle=40)
    for i, x in enumerate(ENGINES):
        m = K.Mesh()
        engine(m, x)
        m.build('car.tail.engine.%d' % i, '01_CAR', parent=node, rest=rest, bevel=0.0, smooth_angle=50)
