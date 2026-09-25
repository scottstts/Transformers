"""Soldier modelling kit on top of the F1 build's polygon kit (f1b.kit: offsets,
section lofts, revolves, bevelled prisms, booleans).

All coordinates are bone-local Blender coordinates (see rig.py): +X the
robot's left, -Y forward, +Z up the bone. A Part is one rigid piece riding one
bone (one object, several material slots). Shell detail follows the
transformers' hard-surface rules: faceted sections, seams between bands over a
dark core, raised plates conformed onto the shell, recessed vents, fasteners.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from f1b import kit as K
from . import mats

ccw = K.ccw
offset_poly = K.offset_poly
section_loft = K.section_loft
revolve = K.revolve
bevel_prism = K.bevel_prism
prism = K.prism
frame_from = K.frame_from
fillet_poly = K.fillet_poly
chamfer_rect = K.chamfer_rect
tube = K.tube
TAU = 2 * math.pi


def lerp(a, b, t):
    return a + (b - a) * t


class Part:
    """Polygon islands with material slots, built into one object on a bone."""

    def __init__(self, name, bone):
        self.name = name
        self.bone = bone
        self.verts = []
        self.faces = []
        self.fslot = []
        self.slots = []

    def add(self, mesh, slot):
        verts, faces = mesh
        if slot not in self.slots:
            self.slots.append(slot)
        k = self.slots.index(slot)
        base = len(self.verts)
        self.verts.extend(Vector(v) for v in verts)
        for f in faces:
            self.faces.append([i + base for i in f])
            self.fslot.append(k)
        return self

    def many(self, meshes, slot):
        for m in meshes:
            self.add(m, slot)
        return self

    def build(self, coll, empties, bevel=0.004, seg=2, angle=32.0):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(v) for v in self.verts], [], [tuple(f) for f in self.faces])
        me.validate(clean_customdata=False)
        me.update()
        o = bpy.data.objects.new(self.name, me)
        coll.objects.link(o)
        for s in self.slots:
            me.materials.append(mats.get(s))
        me.polygons.foreach_set('material_index', self.fslot)
        me.shade_smooth()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.update()
        o['bone'] = self.bone
        o.parent = empties[self.bone]
        o.matrix_parent_inverse = Matrix.Identity(4)
        o.matrix_basis = Matrix.Identity(4)
        if bevel > 0:
            K.finish(o, bevel, seg, angle)
        else:
            K.finish(o, 0, weighted=True)
        return o


# ---------------------------------------------------------------- sections

def sec(w, d, cf=0.3, cb=0.2, yc=0.0, xc=0.0, keel=0.0, bulge=0.0, mirror=False):
    """Irregular octagon section (x, y): width w, depth d, front (-y) chamfer cf and
    back chamfer cb as fractions of the half depth; keel pushes the front centre
    forward (a V ridge); bulge pushes the outer (+x) flank out."""
    hw, hd = w / 2, d / 2
    a, b = hd * cf, hd * cb
    pts = [(0.0, -hd - keel), (-hw + a, -hd), (-hw, -hd + a), (-hw, hd - b), (-hw + b, hd), (0.0, hd),
           (hw - b, hd), (hw + bulge, hd - b), (hw + bulge, -hd + a), (hw - a, -hd)]
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


def loft(stations, cap=0.01, seg=2):
    """Solid loft of (z, section) stations in any order; rounded caps."""
    st = sorted(stations, key=lambda s: s[0])
    return section_loft([s[1] for s in st], [s[0] for s in st], cap_round=cap, seg=seg)


def bands(stations_of, cuts, gap=0.012, core=0.014, cap=0.006):
    """Segmented shell: bands between consecutive z in `cuts` (ascending), each a
    loft of stations_of(z0, z1) -> [(z, section)], seams of `gap` between them.
    Returns (band meshes, core mesh): the core runs through all bands, inset."""
    out = []
    for i in range(len(cuts) - 1):
        a = cuts[i] + (gap / 2 if i else 0)
        b = cuts[i + 1] - (gap / 2 if i < len(cuts) - 2 else 0)
        out.append(loft(stations_of(a, b), cap))
    lo, hi = cuts[0] + 0.004, cuts[-1] - 0.004
    st = stations_of(lo, hi)
    core_mesh = loft([(z, offset_poly(ccw(p), -core)) for z, p in st], 0.004)
    return out, core_mesh


def interp_stations(table, z0, z1, n=3):
    """Sample a (z, w, d, cf, cb, yc, keel, bulge) station table (ascending z) between z0 and z1."""
    def at(z):
        for i in range(len(table) - 1):
            if table[i][0] <= z <= table[i + 1][0] or i == len(table) - 2:
                a, b = table[i], table[i + 1]
                t = (z - a[0]) / (b[0] - a[0]) if b[0] != a[0] else 0.0
                t = max(0.0, min(1.0, t))
                return [lerp(a[k], b[k], t) for k in range(1, len(a))]
        return list(table[0][1:])
    zs = [lerp(z0, z1, k / (n - 1)) for k in range(n)]
    return [(z, at(z)) for z in zs]


# ------------------------------------------------------- conforming detail

def bvh_of(*meshes):
    verts, faces = [], []
    for v, f in meshes:
        base = len(verts)
        verts.extend(Vector(p) for p in v)
        faces.extend([i + base for i in face] for face in f)
    return BVHTree.FromPolygons(verts, faces, all_triangles=False, epsilon=0.0)


def _project(bvh, p, n, reach=0.4):
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
    if abs(n.dot(upv)) > 0.95:
        upv = Vector((0, -1, 0))
    u = upv.cross(n).normalized()   # along the surface, horizontal
    v = n.cross(u).normalized()     # along the surface, up
    return Vector(origin), u, v, n


def conform_plate(bvh, frame, outline, t, bevel=None, sink=0.006, rings=3):
    """A plate lying on the shell in `bvh`: outline (a, b) in the frame's (u, v)
    plane, projected along -n onto the shell, raised by t, chamfered by `bevel`
    on its outer edge, its underside sunk into the shell (never coplanar)."""
    o, u, v, n = frame
    P = ccw([tuple(p) for p in outline])
    bevel = t * 0.35 if bevel is None else bevel
    c = Vector((sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P)))
    inner = offset_poly(P, -bevel)
    rings2 = [P, inner]
    for k in range(1, rings + 1):
        s = 1.0 - k / (rings + 1)
        rings2.append([(c.x + (x - c.x) * s, c.y + (y - c.y) * s) for x, y in inner])
    m = len(P)
    verts = []

    def at(a, b):
        return _project(bvh, o + u * a + v * b, n)

    base = []
    for a, b in P:
        loc, nor = at(a, b)
        base.append(len(verts))
        verts.append(loc - nor * sink)
    ring_idx = []
    for r, ring in enumerate(rings2):
        idx = []
        lift = t - bevel if r == 0 else t
        for a, b in ring:
            loc, nor = at(a, b)
            idx.append(len(verts))
            verts.append(loc + nor * lift)
        ring_idx.append(idx)
    loc, nor = at(c.x, c.y)
    centre = len(verts)
    verts.append(loc + nor * t)
    faces = [list(reversed(base))]
    for i in range(m):
        j = (i + 1) % m
        faces.append([base[i], base[j], ring_idx[0][j], ring_idx[0][i]])
    for r in range(len(ring_idx) - 1):
        A, B = ring_idx[r], ring_idx[r + 1]
        for i in range(m):
            j = (i + 1) % m
            faces.append([A[i], A[j], B[j], B[i]])
    last = ring_idx[-1]
    for i in range(m):
        faces.append([last[i], last[(i + 1) % m], centre])
    return verts, faces


def conform_frame_ring(bvh, frame, outer, width, t, sink=0.006):
    """A raised frame (ring) around a window: outer outline, inner = outer inset by width."""
    o, u, v, n = frame
    P = ccw([tuple(p) for p in outer])
    Q = offset_poly(P, -width)
    Pb = offset_poly(P, -min(0.003, width * 0.3))
    Qb = offset_poly(Q, min(0.003, width * 0.3))
    m = len(P)
    verts = []

    def ring(poly, lift):
        idx = []
        for a, b in poly:
            loc, nor = _project(bvh, o + u * a + v * b, n)
            idx.append(len(verts))
            verts.append(loc + nor * lift)
        return idx

    Ps, Qs = ring(P, -sink), ring(Q, -sink)
    Pt, Pbt = ring(P, t * 0.6), ring(Pb, t)
    Qt, Qbt = ring(Q, t * 0.6), ring(Qb, t)
    faces = []

    def strip(A, B):
        for i in range(m):
            j = (i + 1) % m
            faces.append([A[i], A[j], B[j], B[i]])

    strip(Ps, Pt)
    strip(Pt, Pbt)
    strip(Pbt, Qbt)
    strip(Qbt, Qt)
    strip(Qt, Qs)
    strip(Qs, Ps)
    return verts, faces


def hex_bolt(center, normal, r=0.008, h=0.006, sink=0.003):
    n = Vector(normal).normalized()
    M = frame_from(Vector(center), n.orthogonal(), n.cross(n.orthogonal()))
    prof = [(0.0, -sink), (r, -sink), (r, h - r * 0.3), (r * 0.72, h), (0.0, h)]
    return revolve(prof, 6, axis='Z', M=M)


def bolts(bvh, frame, pts, r=0.008, h=0.006, lift=0.0):
    o, u, v, n = frame
    out = []
    for a, b in pts:
        loc, nor = _project(bvh, o + u * a + v * b, n)
        out.append(hex_bolt(loc + nor * lift, nor, r, h))
    return out


def vent(bvh, frame, w, h, slats=4, t=0.012, frame_w=0.012):
    """Framed intake: a raised frame, a dark back sheet and angled slats inside it.
    Returns [(mesh, slot)]."""
    o, u, v, n = frame
    outline = chamfer_rect(w, h, min(w, h) * 0.18)
    out = [(conform_frame_ring(bvh, frame, outline, frame_w, t), 'alloy')]
    iw, ih = w - 2 * frame_w, h - 2 * frame_w
    out.append((conform_plate(bvh, frame, chamfer_rect(iw + 0.004, ih + 0.004, 0.004), 0.0015, bevel=0.0005, rings=1), 'mech'))
    pitch = ih / slats
    for k in range(slats):
        b = -ih / 2 + pitch * (k + 0.5)
        sl = [(-iw / 2, b - pitch * 0.22), (iw / 2, b - pitch * 0.22), (iw / 2, b + pitch * 0.22), (-iw / 2, b + pitch * 0.22)]
        out.append((conform_plate(bvh, frame, sl, t * 0.55, bevel=0.0015, rings=1), 'polymer'))
    return out


def transform(mesh, M):
    v, f = mesh
    return [M @ Vector(p) for p in v], f


def mirror_x(mesh):
    v, f = mesh
    return [Vector((-p[0], p[1], p[2])) for p in v], [list(reversed(face)) for face in f]


def ball(center, r, seg=24, rings=12, M=None):
    prof = [(r * math.sin(math.pi * k / rings), -r * math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    prof[0] = (0.0, -r)
    prof[-1] = (0.0, r)
    T = Matrix.Translation(Vector(center))
    return revolve(prof, seg, axis='Z', M=T @ (M or Matrix.Identity(4)))


def drum(center, r, w, axis='X', seg=28, lip=None, face_depth=0.004, hub=0.42):
    """Machined joint drum: rim lips, recessed faces, raised hubs."""
    h = w / 2
    lip = min(0.008, r * 0.1) if lip is None else lip
    prof = [(0.0, -h - 0.006), (r * hub, -h - 0.006), (r * hub + 0.004, -h),
            (r * 0.8, -h + face_depth), (r * 0.86, -h - 0.001), (r - lip, -h - 0.001),
            (r, -h + lip), (r, h - lip), (r - lip, h + 0.001), (r * 0.86, h + 0.001),
            (r * 0.8, h - face_depth), (r * hub + 0.004, h), (r * hub, h + 0.006), (0.0, h + 0.006)]
    return revolve(prof, seg, axis=axis, M=Matrix.Translation(Vector(center)))


def cyl(center, r, length, axis='X', seg=20, chamfer=0.003):
    h = length / 2
    c = min(chamfer, r * 0.3, h * 0.3)
    prof = [(0.0, -h), (r - c, -h), (r, -h + c), (r, h - c), (r - c, h), (0.0, h)]
    return revolve(prof, seg, axis=axis, M=Matrix.Translation(Vector(center)))


def cut(part_mesh, *cutters):
    return K.cut_mesh(part_mesh, list(cutters))


def cheek(x0, x1, top, pivot, half, yc=0.0, seg=12, r=0.004):
    """Clevis cheek plate between x0 and x1: straight sides from `top` to a
    semicircular end of radius `half` around the pivot (y = yc, z = pivot);
    the round end points away from `top` (down when top > pivot)."""
    sgn = -1.0 if top > pivot else 1.0
    outline = [(yc - half, top), (yc + half, top)]
    outline += [(yc + half * math.cos(math.pi * k / seg), pivot + sgn * half * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    lo, hi = sorted((x0, x1))
    M = frame_from(Vector((lo, 0, 0)), (0, 1, 0), (0, 0, 1))
    return bevel_prism(outline, 0.0, hi - lo, r, 2, M=M)
