"""The nose, measured from the front photo at the nose plane (519 px per metre,
column 1108.75 = x 0, row 608.1 = z 0.565 at y -2.19) and the side frame.

  light bar     the hood's front edge between the fender-facet tips, |x| <= 0.555
  grille        carbon-weave panel z 0.430-0.553, recessed 12 mm in the dark face
  shadow line   z 0.425-0.430, then the lower black band to z 0.31 with a sensor
  bumper        the black lower face sits 32 mm behind the white nose face (y -2.158),
                z 0.262-0.367
  lip           a carbon blade z 0.262-0.277, its front at y -2.209, falling 22 mm
                to the wheels
  headlamps     a triangle recessed in each fender-top facet (top view): tip forward,
                back edge across the facet, LED blade and fins under a domed lens
"""
import math
from mathutils import Vector
from . import kit as K, body as B

Y = B.NOSE_Y
GRILLE = (0.430, 0.553, 0.540)        # z0, z1, half width


def loft_x(m, x0, x1, section, mat, n=24):
    """Loft a (y, z) section across x; section(x) may follow the nose bow."""
    m.loft([[Vector((x0 + (x1 - x0) * i / n, y, z)) for y, z in section(x0 + (x1 - x0) * i / n)]
            for i in range(n + 1)], mat)


def cutters():
    """Grille recess and the recessed lower bumper face, both following the
    nose's plan bow."""
    b = K.Mesh()
    loft_x(b, -1.0, 1.0, lambda x: [(B.nose_y(x) - 0.3, 0.0), (B.nose_y(x) + 0.032, 0.0),
                                    (B.nose_y(x) + 0.032, 0.367), (B.nose_y(x) - 0.3, 0.367)], 'satin', 40)
    m = K.Mesh()
    z0, z1, hw = GRILLE
    loft_x(m, -hw, hw, lambda x: [(B.nose_y(x) - 0.2, z0), (B.nose_y(x) + 0.012, z0),
                                  (B.nose_y(x) + 0.012, z1), (B.nose_y(x) - 0.2, z1)], 'satin', 30)
    return [m, b]


# Headlamp triangle on the fender-top facet (top view, 6x tile): tip forward,
# its back edge across the facet. (y, fraction from the hood edge p4 to p3)
LAMP = ((-2.185, 0.50), (-1.884, 1.0), (-1.884, 0.0))
LAMP_DEPTH = 0.022


def facet(sx, y, t, out=0.0):
    """Point on the fender-top facet between p4 (t 0) and p3 (t 1) at station y,
    pushed out along the facet normal by `out`."""
    s = B.sta(y)
    p4 = Vector((sx * s['x4'], y, s['z4']))
    p3 = Vector((sx * s['x3'], y, s['z3']))
    p = p4.lerp(p3, t)
    p.y += B.bow(p.x, y)
    return p + facet_normal(sx, y) * out


def facet_normal(sx, y):
    s0, s1 = B.sta(y - 0.02), B.sta(y + 0.02)
    def P(x, yy, z):
        return Vector((x, yy + B.bow(x, yy), z))
    a = P(sx * s0['x4'], y - 0.02, s0['z4'])
    b = P(sx * s0['x3'], y - 0.02, s0['z3'])
    c = P(sx * s1['x4'], y + 0.02, s1['z4'])
    n = (b - a).cross(c - a).normalized()
    return n if n.z > 0 else -n


def lamp_tri(sx, inset=0.0):
    pts = [facet(sx, y, t) for y, t in LAMP]
    c = (pts[0] + pts[1] + pts[2]) / 3
    return [c + (p - c) * (1.0 - inset) for p in pts]


def lamp_cutters():
    out = []
    for sx in (-1, 1):
        m = K.Mesh()
        n = facet_normal(sx, -1.95)
        tri = lamp_tri(sx)
        m.hull([p + n * 0.03 for p in tri] + [p - n * LAMP_DEPTH for p in tri], 'satin')
        out.append(m)
    return out


def tri_patch(m, corners, depth_of, mat, steps=10, n=None):
    """A thick triangular patch: barycentric grid on the corner triangle, each
    point moved along n by depth_of(u, v); bottom 3 mm under it. Closed solid."""
    A, Bc, C = corners
    rows = []
    idx = {}
    verts = []
    for i in range(steps + 1):
        for j in range(steps + 1 - i):
            u, v = i / steps, j / steps
            p = A + (Bc - A) * u + (C - A) * v
            idx[(i, j)] = len(verts)
            verts.append(p + n * depth_of(u, v))
    top = len(verts)
    for k in range(top):
        verts.append(verts[k] - n * 0.003)
    faces = []
    for i in range(steps):
        for j in range(steps - i):
            a, b, c = idx[(i, j)], idx[(i + 1, j)], idx[(i, j + 1)]
            faces.append((a, b, c))
            faces.append((top + a, top + c, top + b))
            if j < steps - i - 1:
                d = idx[(i + 1, j + 1)]
                faces.append((b, d, c))
                faces.append((top + b, top + c, top + d))
    edge = [idx[(i, 0)] for i in range(steps + 1)] + [idx[(steps - j, j)] for j in range(1, steps + 1)] + \
        [idx[(0, j)] for j in range(steps - 1, 0, -1)]
    for a_, b_ in zip(edge, edge[1:] + edge[:1]):
        faces.append((a_, b_, top + b_, top + a_))
    m.add(verts, faces, mat)


def headlamp(m, sx):
    """Recessed triangular lamp: a dark reflector floor, an LED blade along the
    back edge with fins falling toward the tip, a clear lens flush with the facet."""
    n = facet_normal(sx, -1.95)
    tri = lamp_tri(sx, inset=0.0)
    tip, back_o, back_i = tri
    # LED blade along the back edge, set 6 mm below the lens
    e0, e1 = back_i.lerp(back_o, 0.06), back_i.lerp(back_o, 0.94)
    inward = (tip - (back_o + back_i) / 2).normalized()
    m.sweep([e0 + n * 0.001 + inward * 0.008, e1 + n * 0.001 + inward * 0.008],
            [(0.002 * math.cos(a), 0.0008 * math.sin(a)) for a in [k * math.tau / 10 for k in range(10)]],
            'lightbar', normal=lambda i, p, t: inward)
    # Lens skin is owned by body.shell_mesh; there is no second coplanar patch.


def lip_path():
    """The lip's outer edge in plan (side frame, 3/4 photo, top view): across the
    nose 21 mm ahead of its face, round the corners and back along the body side
    to the front wheel opening."""
    pts = []
    for y in [-1.79 - 0.02 * i for i in range(11)]:          # left side, rear -> front
        s = B.sta(y)
        pts.append(Vector((s['x0'] + 0.012 - B.corner_inset(y), y, 0)))
    for i in range(1, 8):                                   # round the corner
        a = math.radians(90 * i / 8)
        cx, cy = 0.50, -2.06
        r = 0.13
        pts.append(Vector((cx + r * math.cos(a) * 0.9, cy - r * math.sin(a) * 1.0, 0)))
    for x in [0.45 - 0.9 * i / 18 for i in range(19)]:      # across the nose
        pts.append(Vector((x, B.nose_y(x) - 0.021, 0)))
    right = [Vector((-p.x, p.y, 0)) for p in reversed(pts[:len(pts) - 19])]
    return pts + right


def lip_z(y):
    """Lip bottom and top heights: the bottom falls from 0.264 at the nose to
    0.19 at the wheel (side frame); the top is 0.33 across the nose, 0.30 on the sides."""
    t = max(0.0, min(1.0, (y - (-2.20)) / (-1.79 + 2.20)))
    return 0.264 - 0.074 * t, 0.330 - 0.030 * t


def lip(m):
    path = lip_path()
    rings = []
    n = len(path)
    for i, p in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        out = Vector((t.y, -t.x, 0)).normalized()
        if out.dot(Vector((p.x, p.y + 1.0, 0))) < 0:
            out = -out
        zb, zt = lip_z(p.y)
        prof = [(-0.07, zb), (-0.012, zb), (-0.003, zb + 0.006), (0.0, zb + 0.020), (0.0, zt - 0.014),
                (-0.004, zt - 0.004), (-0.014, zt), (-0.07, zt)]
        rings.append([Vector((p.x, p.y, 0)) + out * o + Vector((0, 0, z)) for o, z in prof])
    m.loft(rings, 'weave')


def build(node):
    f = K.Mesh()
    # light bar along the hood's front edge
    loft_x(f, -0.553, 0.553, lambda x: [(B.nose_y(x) - 0.005, 0.557), (B.nose_y(x) + 0.010, 0.557),
                                        (B.nose_y(x) + 0.010, 0.568), (B.nose_y(x) - 0.005, 0.568)], 'lightbar', 30)
    # carbon-weave grille panel in its recess
    z0, z1, hw = GRILLE
    loft_x(f, -(hw - 0.002), hw - 0.002, lambda x: [(B.nose_y(x) + 0.004, z0 + 0.002), (B.nose_y(x) + 0.014, z0 + 0.002),
                                                    (B.nose_y(x) + 0.014, z1 - 0.002), (B.nose_y(x) + 0.004, z1 - 0.002)],
           'weave', 30)
    # shadow line and the lower black band with its centre sensor
    loft_x(f, -0.545, 0.545, lambda x: [(B.nose_y(x) - 0.003, 0.425), (B.nose_y(x) + 0.010, 0.425),
                                        (B.nose_y(x) + 0.010, 0.4295), (B.nose_y(x) - 0.003, 0.4295)], 'graphite', 30)
    f.hull([(sx * 0.020, y, z) for sx in (-1, 1) for y in (Y - 0.006, Y + 0.01) for z in (0.395, 0.415)], 'glass')
    lip(f)
    for sx in (-1, 1):
        headlamp(f, sx)
    f.build('car.nose.fascia', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0012)
