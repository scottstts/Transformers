"""Side details measured from the side frame and the video close-ups.

  side marker   a smoked blade in the notch between fender and flap: corners
                (-1.109, 0.725), (-0.827, 0.7505), (-0.827, 0.697), (-1.054, 0.688);
                front 45 % red-brown, an amber LED strip under its top edge
  fender flap   the fender skin between the wheel opening, the marker and the door
                shut line, above the rocker band: it swings out at its rear edge
                in high-downforce mode (panel `flap.L/R`, cut in car.body_panels)
"""
from mathutils import Vector
from . import kit as K, body as B

# marker blade corners (4x tiles): front-top, rear-top, rear-bottom, front-bottom
MARKER = ((-1.109, 0.725), (-0.833, 0.7505), (-0.822, 0.697), (-1.054, 0.688))
FLAP_BOTTOM = 0.318         # the flap ends on the black rocker band's top edge


def surface_x(y, z):
    """Body side x at (y, z), read off the actual shell section at y (the
    fender shell ahead of the door shut line, the faceted shell behind it)."""
    ring = B.ring(y, flank=y < -0.80)
    pts = [(p.x, p.z) for p in ring if p.x > 0.3]
    best = None
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        if min(z0, z1) <= z <= max(z0, z1) and abs(z1 - z0) > 1e-9:
            x = x0 + (x1 - x0) * (z - z0) / (z1 - z0)
            best = x if best is None else max(best, x)
    return best if best is not None else max(x for x, _ in pts)


def quad_point(quad, u, v):
    """Bilinear point in a (y, z) quad: corners front-top, rear-top, rear-bottom,
    front-bottom; u runs front -> rear, v bottom -> top."""
    ft, rt, rb, fb = quad
    top = (ft[0] + (rt[0] - ft[0]) * u, ft[1] + (rt[1] - ft[1]) * u)
    bot = (fb[0] + (rb[0] - fb[0]) * u, fb[1] + (rb[1] - fb[1]) * u)
    return top[0] * v + bot[0] * (1 - v), top[1] * v + bot[1] * (1 - v)


def conform(m, sx, quad, out_a, out_b, mat, nu=18, nv=4):
    """Closed solid between two offsets of the body surface over a (y, z) quad:
    it follows the shell's curvature instead of cutting a flat chord through it."""
    layers = []
    for off in (out_a, out_b):
        grid = []
        for i in range(nu + 1):
            row = []
            for j in range(nv + 1):
                y, z = quad_point(quad, i / nu, j / nv)
                row.append(Vector((sx * (surface_x(y, z) + off), y, z)))
            grid.append(row)
        layers.append(grid)
    verts, idx = [], {}
    for L, grid in enumerate(layers):
        for i, row in enumerate(grid):
            for j, p in enumerate(row):
                idx[(L, i, j)] = len(verts)
                verts.append(p)
    faces = []
    for i in range(nu):
        for j in range(nv):
            faces.append((idx[(0, i, j)], idx[(0, i + 1, j)], idx[(0, i + 1, j + 1)], idx[(0, i, j + 1)]))
            faces.append((idx[(1, i, j)], idx[(1, i, j + 1)], idx[(1, i + 1, j + 1)], idx[(1, i + 1, j)]))
    ring = [(i, 0) for i in range(nu + 1)] + [(nu, j) for j in range(1, nv + 1)] + \
        [(i, nv) for i in range(nu - 1, -1, -1)] + [(0, j) for j in range(nv - 1, 0, -1)]
    for (i0, j0), (i1, j1) in zip(ring, ring[1:] + ring[:1]):
        faces.append((idx[(0, i0, j0)], idx[(1, i0, j0)], idx[(1, i1, j1)], idx[(0, i1, j1)]))
    m.add(verts, faces, mat)


def cutter():
    """The marker's recess: the body over the marker quad, 10 mm deep."""
    out = []
    for sx in (-1, 1):
        c = K.Mesh()
        conform(c, sx, MARKER, 0.03, -0.010, 'satin')
        out.append(c)
        c = K.Mesh()
        conform(c, sx, rear_marker_quad(), .010, -.005, 'satin', nu=16, nv=1)
        out.append(c)
    return out


def marker(m, sx):
    """The blade fills the notch between the fender above and the flap below,
    4 mm inside the surface: front 45 % smoked red-brown, the rest near-black,
    an amber LED strip under its top edge near the rear."""
    ft, rt, rb, fb = MARKER
    split = 0.45
    front = (ft, quad_point(MARKER, split, 1), quad_point(MARKER, split, 0), fb)
    back = (quad_point(MARKER, split, 1), rt, rb, quad_point(MARKER, split, 0))
    conform(m, sx, front, -0.004, -0.009, 'marker', nu=8)
    conform(m, sx, back, -0.004, -0.009, 'smoke', nu=10)
    led = (quad_point(MARKER, 0.70, 0.88), quad_point(MARKER, 0.97, 0.88), quad_point(MARKER, 0.97, 0.74),
           quad_point(MARKER, 0.70, 0.74))
    conform(m, sx, led, -0.0032, -0.005, 'amber', nu=6, nv=1)


# rear side marker (side frame): a thin red blade along the pod's top edge with
# a bright LED dot at its front end
REAR_MARKER = ((1.908, 0.623), (2.038, 0.691))


def rear_marker_quad():
    from .car import POD_TOP
    (ya, za), (yb, zb) = [(p[1], p[2]) for p in POD_TOP]
    y0, y1 = REAR_MARKER[0][0], REAR_MARKER[1][0]
    # The housing follows the actual panel boundary. The former independent
    # slope crossed the shut line, leaving part of the lens over empty space.
    z0 = za + (zb - za) * (y0 - ya) / (yb - ya) + .004
    z1 = za + (zb - za) * (y1 - ya) / (yb - ya) + .004
    return ((y0, z0 + .0015), (y1, z1 + .001),
            (y1, z1 - .001), (y0, z0 - .0015))


def rear_marker(m, sx):
    quad = rear_marker_quad()
    conform(m, sx, quad, -.0008, -.004, 'tail', nu=16, nv=1)


def build(node):
    m = K.Mesh()
    for sx in (-1, 1):
        marker(m, sx)
    m.build('car.nose.markers', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.001)


def build_rear(node):
    m = K.Mesh()
    for sx in (-1, 1):
        rear_marker(m, sx)
    m.build('car.tail.markers', '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0008)
