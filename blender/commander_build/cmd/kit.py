"""Self-contained hard-surface kit. Meshes are (verts, faces) in bone-local
coordinates: +X the commander's left, -Y forward, +Z up the bone.

Forms come from faceted section lofts, revolves and chamfered prisms; detail
plates are projected onto a guide surface (conform_plate), sunk into it at the
base so nothing is coplanar. A Part is one rigid object riding one bone.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from . import mats

TAU = 2 * math.pi


def lerp(a, b, t):
    return a + (b - a) * t


# ------------------------------------------------------------------ 2D polygons

def area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def ccw(poly):
    poly = [tuple(p) for p in poly]
    return poly if area(poly) > 0 else list(reversed(poly))


def offset_poly(poly, d):
    """Miter offset of a ccw polygon; d > 0 grows it."""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p1 - p0).normalized(), (p2 - p1).normalized()
        n0, n1 = Vector((e0.y, -e0.x)), Vector((e1.y, -e1.x))
        m = n0 + n1
        if m.length < 1e-6:
            m = n0
        m.normalize()
        k = max(m.dot(n0), 0.35)
        q = p1 + m * (d / k)
        out.append((q.x, q.y))
    return out


def fillet_poly(poly, r, seg=2):
    """Round every corner with radius r (clamped to the edge lengths)."""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        a, b = p0 - p1, p2 - p1
        la, lb = a.length, b.length
        ang = a.angle(b, math.pi)
        t = min(r / max(math.tan(ang / 2), 1e-3), la * 0.45, lb * 0.45)
        s, e = p1 + a.normalized() * t, p1 + b.normalized() * t
        for k in range(seg + 1):
            u = k / seg
            q = s * (1 - u) ** 2 + p1 * 2 * u * (1 - u) + e * u * u
            out.append((q.x, q.y))
    return out


def chamfer_rect(w, h, c, cx=0.0, cy=0.0):
    w, h = w / 2, h / 2
    return [(cx + x, cy + y) for x, y in [(-w + c, -h), (w - c, -h), (w, -h + c), (w, h - c), (w - c, h), (-w + c, h), (-w, h - c), (-w, -h + c)]]


def sec(w, d, cf=0.3, cb=0.2, yc=0.0, xc=0.0, keel=0.0, bulge=0.0, mirror=False):
    """Irregular octagon (x, y): front (-y) chamfer cf and back chamfer cb as
    fractions of the half depth; keel pushes the front centre forward into a
    ridge; bulge pushes the outer (+x) flank out."""
    hw, hd = w / 2, d / 2
    a, b = hd * cf, hd * cb
    pts = [(0.0, -hd - keel), (hw - a, -hd), (hw + bulge, -hd + a), (hw + bulge, hd - b), (hw - b, hd), (0.0, hd),
           (-hw + b, hd), (-hw, hd - b), (-hw, -hd + a), (-hw + a, -hd)]
    if mirror:
        pts = [(-x, y) for x, y in pts]
    return ccw([(x + xc, y + yc) for x, y in pts])


def squircle(w, d, exp=3.0, n=24, yc=0.0, xc=0.0):
    out = []
    for k in range(n):
        a = TAU * k / n
        c, s = math.cos(a), math.sin(a)
        out.append((xc + w / 2 * math.copysign(abs(c) ** (2 / exp), c), yc + d / 2 * math.copysign(abs(s) ** (2 / exp), s)))
    return ccw(out)


def resample(poly, n):
    """n points evenly spaced along a closed polygon's perimeter."""
    P = [Vector(p) for p in poly]
    L = [(P[(i + 1) % len(P)] - P[i]).length for i in range(len(P))]
    total = sum(L)
    out, i, acc = [], 0, 0.0
    for k in range(n):
        s = total * k / n
        while acc + L[i] < s:
            acc += L[i]
            i += 1
        t = (s - acc) / L[i] if L[i] else 0
        q = P[i].lerp(P[(i + 1) % len(P)], t)
        out.append((q.x, q.y))
    return out


# ------------------------------------------------------------------ solids

def ring_loft(rings, cap_start=True, cap_end=True, close=True):
    n = len(rings[0])
    verts = [Vector(v) for ring in rings for v in ring]
    faces = []
    for i in range(len(rings) - 1):
        for j in range(n if close else n - 1):
            j2 = (j + 1) % n
            faces.append([i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j])
    if cap_start:
        faces.append(list(reversed(range(n))))
    if cap_end:
        base = (len(rings) - 1) * n
        faces.append([base + j for j in range(n)])
    return verts, faces


def loft(stations, cap=0.01, seg=2, M=None):
    """Solid loft of (z, section) stations (any order) with rounded end caps."""
    st = sorted(stations, key=lambda s: s[0])
    secs = [ccw(s[1]) for s in st]
    zs = [s[0] for s in st]
    seq = []
    if cap > 0:
        for k in range(seg):
            a = math.pi / 2 * k / seg
            seq.append((offset_poly(secs[0], -cap * (1 - math.sin(a))), zs[0] + cap * (1 - math.cos(a))))
        for i, s in enumerate(secs):
            z = zs[0] + cap if i == 0 else zs[-1] - cap if i == len(secs) - 1 else zs[i]
            seq.append((s, z))
        for k in range(1, seg + 1):
            a = math.pi / 2 * k / seg
            seq.append((offset_poly(secs[-1], -cap * (1 - math.cos(a))), zs[-1] - cap * (1 - math.sin(a))))
    else:
        seq = list(zip(secs, zs))
    rings = [[Vector((x, y, z)) for x, y in poly] for poly, z in seq]
    v, f = ring_loft(rings)
    if M is not None:
        v = [M @ p for p in v]
    return v, f


def loft_along(stations, axis_origin, x_axis, y_axis, cap=0.01, seg=2):
    """Loft whose local z runs along x_axis × y_axis from axis_origin."""
    return loft(stations, cap, seg, frame_from(Vector(axis_origin), Vector(x_axis), Vector(y_axis)))


def revolve(profile, seg=32, axis='Z', M=None):
    """Revolve an open (r, h) profile about a local axis; r == 0 points are poles."""
    verts, rows = [], []
    for r, h in profile:
        if r < 1e-7:
            rows.append([len(verts)])
            verts.append((0.0, 0.0, h))
        else:
            row = []
            for k in range(seg):
                a = TAU * k / seg
                row.append(len(verts))
                verts.append((r * math.cos(a), r * math.sin(a), h))
            rows.append(row)
    faces = []
    for A, B in zip(rows, rows[1:]):
        if len(A) == 1 and len(B) == 1:
            continue
        for k in range(seg):
            k2 = (k + 1) % seg
            if len(A) == 1:
                faces.append([A[0], B[k], B[k2]])
            elif len(B) == 1:
                faces.append([A[k], B[0], A[k2]])
            else:
                faces.append([A[k], B[k], B[k2], A[k2]])
    if axis == 'X':
        verts = [(h, x, y) for x, y, h in verts]
    elif axis == 'Y':
        verts = [(y, h, x) for x, y, h in verts]
    verts = [Vector(v) for v in verts]
    if M is not None:
        verts = [M @ v for v in verts]
    return verts, faces


def frame_from(origin, x, y):
    x = Vector(x).normalized()
    z = x.cross(Vector(y)).normalized()
    y = z.cross(x)
    M = Matrix.Identity(4)
    for i in range(3):
        M[i][0], M[i][1], M[i][2], M[i][3] = x[i], y[i], z[i], origin[i]
    return M


def axis_frame(a, b, up=(0, 0, 1)):
    """Frame at a with local z toward b."""
    a, b = Vector(a), Vector(b)
    z = (b - a).normalized()
    u = Vector(up)
    if abs(z.dot(u.normalized())) > 0.95:
        u = Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))
    x = u.cross(z).normalized()
    return frame_from(a, x, z.cross(x))


def bevel_prism(poly, z0, z1, r, M=None):
    """Prism of a 2D polygon from z0 to z1 with a one-step chamfer on both ends."""
    P = ccw(poly)
    r = min(r, (z1 - z0) * 0.45)
    rings = []
    for q, z in ((offset_poly(P, -r), z0), (P, z0 + r), (P, z1 - r), (offset_poly(P, -r), z1)):
        rings.append([Vector((x, y, z)) for x, y in q])
    v, f = ring_loft(rings)
    if M is not None:
        v = [M @ p for p in v]
    return v, f


def slab(outline, a, b, t, r=None):
    """Chamfered plate of thickness t: outline in the plane spanned by the unit
    vectors a (u) and b (v) through the origin of the outline points (3D)."""
    a, b = Vector(a).normalized(), Vector(b).normalized()
    n = a.cross(b).normalized()
    P3 = [Vector(p) for p in outline]
    o = sum(P3, Vector()) / len(P3)
    P = [((p - o).dot(a), (p - o).dot(b)) for p in P3]
    return bevel_prism(P, -t / 2, t / 2, r if r is not None else t * 0.3, frame_from(o, a, b))


def cyl(center, r, length, axis='X', seg=20, chamfer=0.006):
    h = length / 2
    c = min(chamfer, r * 0.3, h * 0.3)
    return revolve([(0.0, -h), (r - c, -h), (r, -h + c), (r, h - c), (r - c, h), (0.0, h)], seg, axis, Matrix.Translation(Vector(center)))


def rod(a, b, r, seg=12, chamfer=0.004):
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    c = min(chamfer, r * 0.3, L * 0.3)
    return revolve([(0.0, 0.0), (r - c, 0.0), (r, c), (r, L - c), (r - c, L), (0.0, L)], seg, 'Z', axis_frame(a, b))


def ring(center, outer, inner, w, axis='X', seg=40):
    h, c = w / 2, min(0.01, w * 0.2, (outer - inner) * 0.3)
    prof = [(inner, -h), (outer - c, -h), (outer, -h + c), (outer, h - c), (outer - c, h), (inner, h), (inner, -h)]
    return revolve(prof, seg, axis, Matrix.Translation(Vector(center)))


def ball(center, r, seg=20, rings=10, M=None):
    prof = [(r * math.sin(math.pi * k / rings), -r * math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    prof[0], prof[-1] = (0.0, -r), (0.0, r)
    return revolve(prof, seg, 'Z', Matrix.Translation(Vector(center)) @ (M or Matrix.Identity(4)))


def drum(center, r, w, axis='X', seg=28, hub=0.42):
    """Machined joint drum: chamfered rims, recessed faces, raised hubs."""
    h = w / 2
    lip, d = min(0.02, r * 0.1), min(0.012, w * 0.1)
    prof = [(0.0, -h - d), (r * hub, -h - d), (r * hub + d, -h), (r * 0.78, -h + d), (r * 0.84, -h),
            (r - lip, -h), (r, -h + lip), (r, h - lip), (r - lip, h), (r * 0.84, h), (r * 0.78, h - d),
            (r * hub + d, h), (r * hub, h + d), (0.0, h + d)]
    return revolve(prof, seg, axis, Matrix.Translation(Vector(center)))


def hex_bolt(center, normal, r=0.016, h=0.012, sink=0.008):
    n = Vector(normal).normalized()
    M = frame_from(Vector(center), n.orthogonal(), n.cross(n.orthogonal()))
    return revolve([(0.0, -sink), (r, -sink), (r, h - r * 0.3), (r * 0.72, h), (0.0, h)], 6, 'Z', M)


def spike(stations, n=6, phase=0.0):
    """Tapered swept blade: stations (x, y, z, half width, half depth, twist deg)."""
    rings = []
    for st in stations:
        x, y, z, w, d = st[:5]
        tw = math.radians(st[5]) if len(st) > 5 else 0.0
        ring_pts = []
        for i in range(n):
            a = TAU * i / n + phase
            u, v = w * math.cos(a), d * math.sin(a)
            ring_pts.append(Vector((x + u * math.cos(tw) - v * math.sin(tw), y + u * math.sin(tw) + v * math.cos(tw), z)))
        rings.append(ring_pts)
    return ring_loft(rings)


def blade(spine, width, thick, up=(0, 1, 0), edge=0.25):
    """Flat blade along a 3D spine: per station (point, half width, half thickness
    factors in width/thick lists); a diamond section with a sharp edge."""
    rings = []
    for i, p in enumerate(spine):
        p = Vector(p)
        t = (Vector(spine[min(i + 1, len(spine) - 1)]) - Vector(spine[max(i - 1, 0)])).normalized()
        u = Vector(up)
        side = t.cross(u).normalized()
        nrm = side.cross(t).normalized()
        w, d = width[i], thick[i]
        rings.append([p + side * w, p + side * w * edge + nrm * d, p - side * w * edge + nrm * d,
                      p - side * w, p - side * w * edge - nrm * d, p + side * w * edge - nrm * d])
    return ring_loft(rings)


def transform(mesh, M):
    v, f = mesh
    return [M @ Vector(p) for p in v], f


def mirror_x(mesh):
    v, f = mesh
    return [Vector((-p[0], p[1], p[2])) for p in v], [list(reversed(face)) for face in f]


def warp(mesh, fn):
    """Displace every vertex through fn(Vector) -> Vector."""
    v, f = mesh
    return [fn(Vector(p)) for p in v], f


def merge(*meshes):
    V, F = [], []
    for v, f in meshes:
        b = len(V)
        V += [Vector(p) for p in v]
        F += [[i + b for i in face] for face in f]
    return V, F


def sphere_shell(centre, radius, t, el_min, n_az=48, n_el=12, el_top=84.0):
    """Helmet shell of thickness t on a sphere: each azimuth column runs from
    el_min(az) (deg; az 0 = forward (-y), positive toward +x) up to a closed
    crown, so the lower rim follows a smooth authored line. radius may be a
    function (az, el) -> r for crests and flares."""
    C = Vector(centre)
    rfn = radius if callable(radius) else (lambda az, el: radius)
    rows = n_el + 1
    verts = []

    def pt(az, el, r):
        a, e = math.radians(az), math.radians(el)
        return C + Vector((r * math.cos(e) * math.sin(a), -r * math.cos(e) * math.cos(a), r * math.sin(e)))

    for layer in (0, 1):
        for j in range(n_az):
            az = -180 + 360 * j / n_az
            lo = el_min(az)
            for i in range(rows):
                el = lerp(lo, el_top, i / n_el)
                r = rfn(az, el) - (t if layer else 0)
                verts.append(pt(az, el, r))
    poles = len(verts)
    verts.append(C + Vector((0, 0, rfn(0, 90))))
    verts.append(C + Vector((0, 0, rfn(0, 90) - t)))

    def vi(layer, j, i):
        return layer * n_az * rows + (j % n_az) * rows + i

    faces = []
    for j in range(n_az):
        for i in range(n_el):
            faces.append([vi(0, j, i), vi(0, j + 1, i), vi(0, j + 1, i + 1), vi(0, j, i + 1)])
            faces.append([vi(1, j, i + 1), vi(1, j + 1, i + 1), vi(1, j + 1, i), vi(1, j, i)])
        faces.append([vi(0, j, n_el), vi(0, j + 1, n_el), poles])
        faces.append([vi(1, j + 1, n_el), vi(1, j, n_el), poles + 1])
        faces.append([vi(0, j + 1, 0), vi(0, j, 0), vi(1, j, 0), vi(1, j + 1, 0)])
    return verts, faces


def sphere_patch(centre, radius, t, az0, az1, el0, el1, n_az=8, n_el=8):
    """Closed curved plate on a sphere between azimuths and elevations (deg).
    el0 / el1 may be functions of az for shaped edges."""
    C = Vector(centre)
    f0 = el0 if callable(el0) else (lambda az: el0)
    f1 = el1 if callable(el1) else (lambda az: el1)
    rings = []
    for layer_r in (radius, radius - t):
        grid = []
        for j in range(n_az + 1):
            az = lerp(az0, az1, j / n_az)
            a = math.radians(az)
            col = []
            for i in range(n_el + 1):
                e = math.radians(lerp(f0(az), f1(az), i / n_el))
                col.append(C + Vector((layer_r * math.cos(e) * math.sin(a), -layer_r * math.cos(e) * math.cos(a), layer_r * math.sin(e))))
            grid.append(col)
        rings.append(grid)
    verts, faces = [], []

    def idx(layer, j, i):
        return layer * (n_az + 1) * (n_el + 1) + j * (n_el + 1) + i

    for layer in rings:
        for col in layer:
            verts.extend(col)
    for j in range(n_az):
        for i in range(n_el):
            faces.append([idx(0, j, i), idx(0, j + 1, i), idx(0, j + 1, i + 1), idx(0, j, i + 1)])
            faces.append([idx(1, j, i + 1), idx(1, j + 1, i + 1), idx(1, j + 1, i), idx(1, j, i)])
    for j in range(n_az):
        faces.append([idx(0, j + 1, 0), idx(0, j, 0), idx(1, j, 0), idx(1, j + 1, 0)])
        faces.append([idx(0, j, n_el), idx(0, j + 1, n_el), idx(1, j + 1, n_el), idx(1, j, n_el)])
    for i in range(n_el):
        faces.append([idx(0, 0, i), idx(0, 0, i + 1), idx(1, 0, i + 1), idx(1, 0, i)])
        faces.append([idx(0, n_az, i + 1), idx(0, n_az, i), idx(1, n_az, i), idx(1, n_az, i + 1)])
    return verts, faces


def table_at(table, z):
    """Interpolate a station table (ascending or descending z) at z."""
    rows = sorted(table, key=lambda r: r[0])
    z = min(max(z, rows[0][0]), rows[-1][0])
    for a, b in zip(rows, rows[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0]) if b[0] != a[0] else 0.0
            return [lerp(a[k], b[k], t) for k in range(1, len(a))]
    return list(rows[-1][1:])


def sec_stations(table, z0, z1, n=4, grow=0.0, mirror=False):
    """(z, section) stations of a (z, w, d, cf, cb, yc, keel, bulge) table."""
    out = []
    for k in range(n):
        z = lerp(z0, z1, k / (n - 1))
        w, d, cf, cb, yc, keel, bulge = table_at(table, z)
        s = sec(w, d, cf, cb, yc, keel=keel, bulge=bulge, mirror=mirror)
        out.append((z, offset_poly(s, grow) if grow else s))
    return out


def keel_strip(table, z0, z1, width, proud=.012, depth=.05, n=6, grow=0.0):
    """Raised strip riding a station table's front keel between z0 and z1: its
    two faces run parallel to the keel's V faces, `proud` in front of them.
    width may be a function of t in 0..1 (0 at z0) for tapered or pointed ends."""
    wfn = width if callable(width) else (lambda t: width)
    st = []
    for k in range(n):
        t = k / (n - 1)
        z = lerp(z0, z1, t)
        w, d, cf, cb, yc, keel, bulge = table_at(table, z)
        hw, hd = w / 2 + grow, d / 2 + grow
        slope = keel / max(hw - hd * cf, 1e-3)
        yf = yc - hd - keel
        half = max(wfn(t), .004) / 2
        st.append((z, [(0, yf - proud), (half, yf - proud + slope * half), (half * .7, yf + depth), (-half * .7, yf + depth),
                       (-half, yf - proud + slope * half)]))
    return loft(st, 0)


def bands(table, cuts, gap=0.02, core=0.03, cap=0.012, n=4):
    """Segmented shell: one loft per band between consecutive cuts, seams of
    `gap` between them over an inset dark core. Returns (bands, core)."""
    lo, hi = min(cuts), max(cuts)
    cuts = sorted(cuts)
    out = []
    for i in range(len(cuts) - 1):
        a = cuts[i] + (gap / 2 if i else 0)
        b = cuts[i + 1] - (gap / 2 if i < len(cuts) - 2 else 0)
        out.append(loft(sec_stations(table, a, b, n), cap))
    return out, loft(sec_stations(table, lo + cap, hi - cap, n + 2, grow=-core), cap * 0.5)


def cheek(x0, x1, top, pivot, half, yc=0.0, seg=10, r=0.008):
    """Clevis cheek plate between x0 and x1: straight sides from z = top to a
    semicircular end of radius `half` around the pivot at (yc, pivot)."""
    sgn = -1.0 if top > pivot else 1.0
    outline = [(yc - half, top), (yc + half, top)]
    outline += [(yc + half * math.cos(math.pi * k / seg), pivot + sgn * half * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    lo, hi = sorted((x0, x1))
    return bevel_prism(outline, 0.0, hi - lo, r, frame_from(Vector((lo, 0, 0)), (0, 1, 0), (0, 0, 1)))


def side_prism(outline_yz, x0, x1, r=0.012):
    """Prism of a (y, z) side profile extruded across x from x0 to x1."""
    lo, hi = sorted((x0, x1))
    return bevel_prism(outline_yz, 0.0, hi - lo, r, frame_from(Vector((lo, 0, 0)), (0, 1, 0), (0, 0, 1)))


def arc_band(x0, x1, centre_yz, r0, r1, a0, a1, n=20, c=0.01):
    """Curved fender band about an x axis: radii r0..r1, angles a0..a1 (deg,
    0 = forward (-y), 90 = up), across x0..x1, chamfered section."""
    cy, cz = centre_yz
    w = x1 - x0
    rings = []
    for k in range(n + 1):
        a = math.radians(lerp(a0, a1, k / n))
        dy, dz = -math.cos(a), math.sin(a)
        rings.append([Vector((x0 + x, cy + dy * r, cz + dz * r)) for x, r in
                      [(c, r0), (w - c, r0), (w, r0 + c), (w, r1 - c), (w - c, r1), (c, r1), (0, r1 - c), (0, r0 + c)]])
    return ring_loft(rings)


# ------------------------------------------------------------------ conforming detail

def bvh_of(*meshes):
    v, f = merge(*meshes)
    return BVHTree.FromPolygons(v, f, all_triangles=False, epsilon=0.0)


def _project(bvh, p, n, reach=0.6):
    hit = bvh.ray_cast(p + n * reach, -n, reach * 2)
    if hit[0] is None:
        hit = bvh.find_nearest(p)
    loc, nor = hit[0], hit[1]
    if nor.dot(n) < 0:
        nor = -nor
    return loc, nor


def tangent_frame(origin, normal, up=(0, 0, 1)):
    n = Vector(normal).normalized()
    upv = Vector(up)
    if abs(n.dot(upv.normalized())) > 0.95:
        upv = Vector((0, -1, 0))
    u = upv.cross(n).normalized()
    v = n.cross(u).normalized()
    return Vector(origin), u, v, n


def conform_plate(bvh, frame, outline, t, bevel=None, sink=0.012, rings=2, keep_normal=False):
    """Plate lying on the guide surface in bvh: outline (u, v) in the frame,
    projected along -n, raised by t, chamfered by bevel, base sunk into the
    surface (never coplanar). keep_normal lifts along n instead of the local
    surface normal (flat plates on curved guides)."""
    o, u, v, n = frame
    P = ccw(outline)
    bevel = t * 0.35 if bevel is None else bevel
    c = Vector((sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P)))
    inner = offset_poly(P, -bevel)
    layers = [(P, t - bevel), (inner, t)]
    for k in range(1, rings + 1):
        s = 1.0 - k / (rings + 1)
        layers.append(([(c.x + (x - c.x) * s, c.y + (y - c.y) * s) for x, y in inner], t))
    verts, idx = [], []

    def at(a, b):
        loc, nor = _project(bvh, o + u * a + v * b, n)
        return loc, (n if keep_normal else nor)

    base = []
    for a, b in P:
        loc, nor = at(a, b)
        base.append(len(verts))
        verts.append(loc - nor * sink)
    for poly, lift in layers:
        row = []
        for a, b in poly:
            loc, nor = at(a, b)
            row.append(len(verts))
            verts.append(loc + nor * lift)
        idx.append(row)
    loc, nor = at(c.x, c.y)
    centre = len(verts)
    verts.append(loc + nor * t)
    m = len(P)
    faces = [list(reversed(base))]
    for i in range(m):
        j = (i + 1) % m
        faces.append([base[i], base[j], idx[0][j], idx[0][i]])
    for A, B in zip(idx, idx[1:]):
        for i in range(m):
            j = (i + 1) % m
            faces.append([A[i], A[j], B[j], B[i]])
    for i in range(m):
        faces.append([idx[-1][i], idx[-1][(i + 1) % m], centre])
    return verts, faces


def bolts(bvh, frame, pts, r=0.016, h=0.012):
    o, u, v, n = frame
    out = []
    for a, b in pts:
        loc, nor = _project(bvh, o + u * a + v * b, n)
        out.append(hex_bolt(loc, nor, r, h))
    return out


def vent(bvh, frame, w, h, slats=4, t=0.02):
    """Framed intake: a raised frame, a sunk dark back and slats. [(mesh, slot)]."""
    fw = min(w, h) * 0.14
    o, u, v, n = frame
    out = []
    P = chamfer_rect(w, h, min(w, h) * 0.2)
    out.append((conform_plate(bvh, frame, P, t * 0.5, bevel=t * 0.2, rings=1), 'structure'))
    iw, ih = w - 2 * fw, h - 2 * fw
    pitch = ih / slats
    for k in range(slats):
        b = -ih / 2 + pitch * (k + 0.5)
        out.append((conform_plate(bvh, frame, [(-iw / 2, b - pitch * 0.2), (iw / 2, b - pitch * 0.2), (iw / 2, b + pitch * 0.2), (-iw / 2, b + pitch * 0.2)],
                                  t, bevel=t * 0.25, rings=1), 'steel'))
    return out


# ------------------------------------------------------------------ parts

class Part:
    """Polygon islands with material slots, built into one object on a bone.

    Islands added with sharp=True (faceted lofts) get a one-segment chamfer on
    their hard edges through edge bevel weights; revolves, plates and prisms
    are pre-chamfered and pass through untouched."""

    def __init__(self, name, bone, bevel=0.012, angle=32.0):
        self.name, self.bone, self.bevel, self.angle = name, bone, bevel, angle
        self.verts, self.faces, self.fslot, self.fsharp, self.slots = [], [], [], [], []

    def add(self, mesh, slot, mirrored=False, sharp=False):
        if mirrored:
            mesh = mirror_x(mesh)
        v, f = mesh
        if slot not in self.slots:
            self.slots.append(slot)
        k = self.slots.index(slot)
        base = len(self.verts)
        self.verts.extend(Vector(p) for p in v)
        for face in f:
            self.faces.append([i + base for i in face])
            self.fslot.append(k)
            self.fsharp.append(sharp)
        return self

    def extend(self, items, mirrored=False):
        for mesh, slot in items:
            self.add(mesh, slot, mirrored)
        return self

    def build(self, coll, bones):
        me = bpy.data.meshes.new('cmd.' + self.name)
        me.from_pydata([tuple(v) for v in self.verts], [], [tuple(f) for f in self.faces])
        me.validate(clean_customdata=False)
        for s in self.slots:
            me.materials.append(mats.get(s))
        me.polygons.foreach_set('material_index', self.fslot)
        limit = math.radians(self.angle)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        weight = bm.edges.layers.float.new('bevel_weight_edge')
        chamfered = 0
        for e in bm.edges:
            if len(e.link_faces) == 2 and all(self.fsharp[f.index] for f in e.link_faces) and e.calc_face_angle(0) > limit:
                e[weight] = 1.0
                chamfered += 1
        bm.to_mesh(me)
        bm.free()
        me.shade_smooth()
        me.set_sharp_from_angle(angle=limit)
        me.update()
        ob = bpy.data.objects.new('cmd.' + self.name, me)
        coll.objects.link(ob)
        ob['bone'] = self.bone
        ob.parent = bones[self.bone]
        ob.matrix_parent_inverse = Matrix.Identity(4)
        if self.bevel and chamfered:
            mod = ob.modifiers.new('chamfer', 'BEVEL')
            mod.width, mod.segments, mod.limit_method = self.bevel, 1, 'WEIGHT'
            mod.use_clamp_overlap = True
        mod = ob.modifiers.new('wnormal', 'WEIGHTED_NORMAL')
        mod.keep_sharp, mod.weight = True, 50
        return ob
