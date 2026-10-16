"""The nose, measured from the front photo at the nose plane (519 px per metre,
column 1108.75 = x 0, row 608.1 = z 0.565 at y -2.19) and the side frame.

  light bar     the hood's front edge between the fender-facet tips, |x| <= 0.555
  visor         a convex carbon-weave panel z 0.443-0.543 (a 14 mm dark gap under
                the light bar) whose sharp lower edge is the thin highlight line
  vent          the air intake between the visor and the lip: a 45 mm deep opening
                filled edge to edge by a fine diamond mesh (the dotted texture in
                the 3/4 photo; the studio light leaves it pitch black from the
                front), the centre sensor on the mesh
  corner blocks the black rocker band under each white nose corner, below a 20 mm
                shadow gap along the white panel's bottom edge (p1)
  bumper        the black lower face sits 32 mm behind the white nose face (y -2.158),
                z 0.262-0.367
  lip           a carbon blade, its front at y -2.211: z 0.266-0.332 across the nose,
                stepping down 30 mm at each corner (|x| 0.477-0.59, front photo) and
                running back along the sides with its bottom falling to 0.19 (side frame)
  headlamps     the tip of each fender-top facet ahead of y -1.884 is the lit lens
                (body.shell_mesh, 'lens' material)
"""
import math
from mathutils import Vector
from . import kit as K, body as B

Y = B.NOSE_Y
GRILLE = (0.443, 0.543, 0.540)        # visor z0, z1, half width
VENT = (0.325, 0.441, 0.50, 0.045)     # z0 (hidden behind the lip), z1, half width, depth
MESH = (0.014, 0.0022, 0.030, 0.006)   # diamond pitch, bar width, bar front (behind the face), bar depth
GAP_H, GAP_D = 0.020, 0.012            # corner shadow gap: height under p1, depth


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
    loft_x(m, -hw, hw, lambda x: [(B.nose_y(x) - 0.2, z0 - 0.003), (B.nose_y(x) + 0.03, z0 - 0.003),
                                  (B.nose_y(x) + 0.03, z1 + 0.005), (B.nose_y(x) - 0.2, z1 + 0.005)], 'satin', 30)
    v = K.Mesh()
    v0, v1, vhw, vd = VENT
    loft_x(v, -vhw, vhw, lambda x: [(B.nose_y(x) - 0.2, v0), (B.nose_y(x) + vd, v0),
                                    (B.nose_y(x) + vd, v1), (B.nose_y(x) - 0.2, v1)], 'satin', 30)
    return [m, v, b] + [corner_gap(sx) for sx in (-1, 1)]


def vent_mesh(f):
    """Diamond mesh across the vent opening: two families of 45-degree bars, each
    bar clipped to the opening's rectangle (ends run into the opening's walls)."""
    v0, v1, hw, vd = VENT
    pitch, w, front, depth = MESH
    y0 = Y + front
    d = pitch / math.sqrt(2)                  # bar spacing along the normal
    for sgn in (1, -1):                       # x - z = c  and  x + z = c
        lo = -hw - (v1 if sgn > 0 else -v0)
        hi = hw - (v0 if sgn > 0 else -v1)
        c = lo + d / 2
        while c < hi:
            pts = []
            for x in (-hw, hw):               # crossings with the rectangle's edges
                z = sgn * (x - c)
                if v0 <= z <= v1:
                    pts.append((x, z))
            for z in (v0, v1):
                x = c + sgn * z
                if -hw <= x <= hw:
                    pts.append((x, z))
            pts = sorted(set((round(px, 6), round(pz, 6)) for px, pz in pts))
            if len(pts) >= 2:
                (ax, az), (bx, bz) = pts[0], pts[-1]
                if math.hypot(bx - ax, bz - az) > 0.004:
                    n = Vector((-(bz - az), 0, bx - ax)).normalized() * (w / 2)
                    a = Vector((ax, y0 + B.bow(ax, Y), az))
                    b = Vector((bx, y0 + B.bow(bx, Y), bz))
                    f.hull([p + o + Vector((0, dy, 0)) for p in (a, b) for o in (n, -n) for dy in (0, depth)], 'satin')
            c += d * math.sqrt(2)


def visor_section(x):
    """Visor section (y, z), closed: the convex front from the sharp lower edge up
    to the top, then back along the top, down the back and forward under it."""
    ny = B.nose_y(x)
    z0, z1, hw = GRILLE
    front = [(0.002, z0), (-0.002, z0 + 0.012), (-0.005, z0 + 0.032), (-0.006, z0 + 0.057),
             (-0.005, z0 + 0.077), (-0.002, z0 + 0.092), (0.003, z1)]
    back = [(0.028, z1), (0.028, z0 + 0.003), (0.010, z0 + 0.003)]
    return [(ny + d, z) for d, z in front + back]


def corner_gap(sx):
    """Shadow gap along the white nose corner's bottom edge (p1), from ahead of the
    nose face back into the front wheel opening: GAP_H tall under p1, GAP_D deep
    into the surface (front photo and side frame)."""
    g = K.Mesh()
    path, ups, outs = [], [], []
    ys = [-2.21 + 0.01 * i for i in range(44)]
    for y in ys:
        s, a, b = B.sta(y), B.sta(y - 0.005), B.sta(y + 0.005)
        p1 = Vector((sx * s['x1'], y + B.bow(s['x1'], y), s['z1']))     # on the bowed shell
        up = Vector((sx * (s['x1'] - s['x0']), 0, s['z1'] - s['z0'])).normalized()
        pa = Vector((sx * a['x1'], y - 0.005 + B.bow(a['x1'], y - 0.005), a['z1']))
        pb = Vector((sx * b['x1'], y + 0.005 + B.bow(b['x1'], y + 0.005), b['z1']))
        t = (pb - pa).normalized()
        n = t.cross(up).normalized()
        if n.x * sx < 0:
            n = -n
        path.append(p1)
        ups.append(up)
        outs.append(n)
    rings = []
    for p, up, n in zip(path, ups, outs):
        top, bot = p + up * 0.002, p - up * GAP_H
        rings.append([bot + n * 0.03, top + n * 0.03, top - n * GAP_D, bot - n * GAP_D])
    if sx < 0:
        rings = [list(reversed(r)) for r in rings]
    g.loft(rings, 'satin', cap=True)
    return g


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


def lip_path():
    """The lip's outer edge in plan (side frame, 3/4 photo, top view): across the
    nose 21 mm ahead of its face, round the corners and back along the body side
    to the front wheel opening."""
    def side_x(y):
        return B.sta(y)['x0'] + 0.012 - B.corner_inset(y)
    y_end, front_y = -2.13, Y - 0.021        # unbowed; the nose bow is applied at the end
    pts = []
    for i in range(18):                                     # left side, rear -> front
        y = -1.79 + (y_end + 1.79) * i / 17
        pts.append(Vector((side_x(y), y, 0)))
    # one fillet from the side line (carried on along its tangent) into the front
    # line: a quadratic whose control point is where the two lines meet
    sx_end = side_x(y_end)
    slope = (side_x(y_end) - side_x(y_end + 0.02)) / -0.02  # dx / dy
    ctrl = Vector((sx_end + slope * (front_y - y_end), front_y, 0))
    p0, p2 = Vector((sx_end, y_end, 0)), Vector((ctrl.x - 0.05, front_y, 0))
    for i in range(1, 10):
        t = i / 10
        pts.append(p0 * (1 - t) ** 2 + ctrl * (2 * t * (1 - t)) + p2 * t * t)
    n_front = 21
    for i in range(n_front):                                # across the nose
        x = p2.x * (1 - 2 * i / (n_front - 1))
        pts.append(Vector((x, front_y, 0)))
    right = [Vector((-p.x, p.y, 0)) for p in reversed(pts[:len(pts) - n_front])]
    return [Vector((p.x, p.y + B.bow(p.x, p.y), 0)) for p in pts + right]


LIP_SIDE_BOTTOM = B.pchip([-2.10, -1.98, -1.79], [0.236, 0.205, 0.190])


def lip_z(x, y):
    """Lip bottom and top heights. Across the nose z 0.266-0.332; at each corner
    (|x| 0.477-0.59, front photo) it steps down 30 mm, and along the sides its
    bottom falls to 0.205 at y -1.98 and 0.19 at the wheel (side frame) while the
    top falls to 0.29."""
    c = K.smooth(abs(x), 0.477, 0.59)
    side = max(0.0, min(1.0, (y + 2.10) / (2.10 - 1.79)))
    zb_side = LIP_SIDE_BOTTOM(min(max(y, -2.10), -1.79))
    return 0.266 * (1 - c) + zb_side * c, 0.332 * (1 - c) + (0.300 - 0.010 * side) * c


def lip_section(zb, zt, rb=0.012, rt=0.008, depth=0.07):
    """Lip section (offset outward, z): flat top and bottom, a straight front face
    and round front edges (side frame, 3/4 photo)."""
    pts = [(-depth, zb)]
    for k in range(6):
        a = math.radians(-90 + 90 * k / 5)
        pts.append((-rb + rb * math.cos(a), zb + rb + rb * math.sin(a)))
    for k in range(6):
        a = math.radians(90 * k / 5)
        pts.append((-rt + rt * math.cos(a), zt - rt + rt * math.sin(a)))
    pts.append((-depth, zt))
    return pts


def lip(m):
    path = lip_path()
    rings = []
    n = len(path)
    for i, p in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        out = Vector((t.y, -t.x, 0)).normalized()
        if out.dot(Vector((p.x, p.y + 1.0, 0))) < 0:
            out = -out
        zb, zt = lip_z(p.x, p.y)
        prof = lip_section(zb, zt)
        rings.append([Vector((p.x, p.y, 0)) + out * o + Vector((0, 0, z)) for o, z in prof])
    m.loft(rings, 'weave')


def build(node):
    f = K.Mesh()
    # light bar along the hood's front edge
    loft_x(f, -0.553, 0.553, lambda x: [(B.nose_y(x) - 0.005, 0.557), (B.nose_y(x) + 0.010, 0.557),
                                        (B.nose_y(x) + 0.010, 0.568), (B.nose_y(x) - 0.005, 0.568)], 'lightbar', 30)
    # carbon-weave visor in its recess
    z0, z1, hw = GRILLE
    loft_x(f, -(hw - 0.002), hw - 0.002, visor_section, 'weave', 30)
    vent_mesh(f)
    # the centre sensor on the vent mesh
    y_m = Y + MESH[2]
    f.hull([(sx * 0.020, y, z) for sx in (-1, 1) for y in (y_m - 0.006, y_m + 0.004) for z in (0.380, 0.400)], 'glass')
    lip(f)
    f.build('car.nose.fascia', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0012)
