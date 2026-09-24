"""Hard-surface modeling kit for the Ferrari F1 transformer build.

Authoring frame (Blender native): +Z up, the character faces -Y, +X is the
character's left side. `V(x, f, z)` takes a forward coordinate f (= -Y) so
design numbers read naturally: nose at f = +3.0, tail at f = -2.5.

Every visible part is an object with one or more material slots. Geometry is
built as clean polygon topology (quads / n-gons), then finished with
angle-limited bevels and weighted normals. Modifiers stay live on the object;
the exporter evaluates them, so the Blender file remains editable.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

from . import mats

EPS = 1e-9


def V(x, f, z):
    return Vector((x, -f, z))


def lerp(a, b, t):
    return a + (b - a) * t


def lerpv(a, b, t):
    return a.lerp(b, t)


# ---------------------------------------------------------------- collections

def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def clear_collection(c):
    for child in list(c.children):
        clear_collection(child)
        bpy.data.collections.remove(child)
    for o in list(c.objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)


def purge_orphans():
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)


# --------------------------------------------------------------- mesh objects

def obj_from_pydata(name, verts, faces, slots, face_slots=None, coll=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    o = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(o)
    for s in slots:
        me.materials.append(mats.get(s))
    if face_slots is not None:
        me.polygons.foreach_set('material_index', face_slots)
    if smooth:
        me.shade_smooth()
    return o


def obj_from_bm(name, bm, slots, coll=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.update()
    o = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(o)
    for s in slots:
        me.materials.append(mats.get(s))
    if smooth:
        me.shade_smooth()
    return o


class Builder:
    """Accumulates polygon islands (each with a material slot) into one mesh."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.fslot = []
        self.slots = []

    def slot(self, name):
        if name not in self.slots:
            self.slots.append(name)
        return self.slots.index(name)

    def add(self, verts, faces, slot):
        base = len(self.verts)
        k = self.slot(slot)
        self.verts.extend(Vector(v) for v in verts)
        for f in faces:
            self.faces.append([i + base for i in f])
            self.fslot.append(k)
        return self

    def add_mesh(self, m, slot):
        return self.add(m[0], m[1], slot)

    def add_slotted(self, verts, faces, face_slots):
        """One island with a material slot per face."""
        base = len(self.verts)
        self.verts.extend(Vector(v) for v in verts)
        for f, s in zip(faces, face_slots):
            self.faces.append([i + base for i in f])
            self.fslot.append(self.slot(s))
        return self

    def transform(self, M, start_vert=0):
        for i in range(start_vert, len(self.verts)):
            self.verts[i] = M @ self.verts[i]

    def build(self, name, coll=None, smooth=True):
        o = obj_from_pydata(name, self.verts, self.faces, self.slots, self.fslot, coll, smooth)
        fix_normals(o)
        return o


def fix_normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


# ------------------------------------------------------------ 2D polygon ops

def poly_area(p):
    s = 0.0
    n = len(p)
    for i in range(n):
        x0, y0 = p[i]
        x1, y1 = p[(i + 1) % n]
        s += x0 * y1 - x1 * y0
    return s * 0.5


def ccw(p):
    return list(p) if poly_area(p) > 0 else list(reversed(p))


def offset_poly(p, d):
    """Offset a closed CCW polygon outward by d (negative = inset). Miter joins."""
    n = len(p)
    out = []
    for i in range(n):
        a, b, c = p[i - 1], p[i], p[(i + 1) % n]
        e0 = (b[0] - a[0], b[1] - a[1])
        e1 = (c[0] - b[0], c[1] - b[1])
        l0 = math.hypot(*e0) or 1.0
        l1 = math.hypot(*e1) or 1.0
        n0 = (e0[1] / l0, -e0[0] / l0)
        n1 = (e1[1] / l1, -e1[0] / l1)
        mx, my = n0[0] + n1[0], n0[1] + n1[1]
        ml = math.hypot(mx, my)
        if ml < 1e-9:
            mx, my = n0
        else:
            mx, my = mx / ml, my / ml
        k = 1.0 / max(0.3, mx * n0[0] + my * n0[1])
        out.append((b[0] + mx * d * k, b[1] + my * d * k))
    return out


def fillet_poly(p, r, seg=3, radii=None):
    """Round the corners of a closed polygon. radii: optional per-corner radius."""
    n = len(p)
    out = []
    for i in range(n):
        rr = radii[i] if radii is not None else r
        a, b, c = Vector(p[i - 1]), Vector(p[i]), Vector(p[(i + 1) % n])
        if rr <= 1e-6:
            out.append((b.x, b.y))
            continue
        d0 = (a - b)
        d1 = (c - b)
        l0, l1 = d0.length, d1.length
        d0.normalize()
        d1.normalize()
        ang = math.acos(max(-1.0, min(1.0, d0.dot(d1))))
        if ang < 1e-3 or ang > math.pi - 1e-3:
            out.append((b.x, b.y))
            continue
        t = rr / math.tan(ang / 2)
        t = min(t, l0 * 0.45, l1 * 0.45)
        rr = t * math.tan(ang / 2)
        p0 = b + d0 * t
        p1 = b + d1 * t
        bis = (d0 + d1).normalized()
        center = b + bis * (rr / math.sin(ang / 2))
        a0 = math.atan2(p0.y - center.y, p0.x - center.x)
        a1 = math.atan2(p1.y - center.y, p1.x - center.x)
        da = a1 - a0
        while da > math.pi:
            da -= 2 * math.pi
        while da < -math.pi:
            da += 2 * math.pi
        for k in range(seg + 1):
            aa = a0 + da * k / seg
            out.append((center.x + rr * math.cos(aa), center.y + rr * math.sin(aa)))
    return out


def chamfer_rect(w, h, c):
    hw, hh = w / 2, h / 2
    c = min(c, hw * 0.9, hh * 0.9)
    return [(hw, hh - c), (hw - c, hh), (-hw + c, hh), (-hw, hh - c),
            (-hw, -hh + c), (-hw + c, -hh), (hw - c, -hh), (hw, -hh + c)]


def rect(w, h, cx=0.0, cy=0.0):
    hw, hh = w / 2, h / 2
    return [(cx - hw, cy - hh), (cx + hw, cy - hh), (cx + hw, cy + hh), (cx - hw, cy + hh)]


def circle2(r, seg=24, cx=0.0, cy=0.0, phase=0.0):
    return [(cx + r * math.cos(phase + 2 * math.pi * i / seg), cy + r * math.sin(phase + 2 * math.pi * i / seg)) for i in range(seg)]


# ------------------------------------------------------------ 3D generators
# Each returns (verts, faces) with outward winding.

def frame_from(origin, xaxis, yaxis):
    """Matrix whose local X/Y map to the given axes (Z = X x Y) at origin."""
    x = Vector(xaxis).normalized()
    y = Vector(yaxis)
    y = (y - x * y.dot(x)).normalized()
    z = x.cross(y)
    M = Matrix((
        (x.x, y.x, z.x, origin[0]),
        (x.y, y.y, z.y, origin[1]),
        (x.z, y.z, z.z, origin[2]),
        (0, 0, 0, 1)))
    return M


def prism(poly, z0, z1, M=None):
    """Extrude a 2D polygon (local XY) from z0 to z1 along local Z."""
    p = ccw(poly)
    n = len(p)
    verts = [Vector((x, y, z0)) for x, y in p] + [Vector((x, y, z1)) for x, y in p]
    faces = [list(reversed(range(n))), list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    if M is not None:
        verts = [M @ v for v in verts]
    return verts, faces


def bevel_prism(poly, z0, z1, r, seg=2, M=None, bottom=True, top=True):
    """Prism whose cap edges are rounded by radius r (inset rings)."""
    p = ccw(poly)
    rr = min(r, (z1 - z0) / 2 - 1e-5)
    rings = []
    if bottom and rr > 0:
        for k in range(seg + 1):
            a = math.pi / 2 * k / seg
            rings.append((offset_poly(p, -rr * (1 - math.sin(a))), z0 + rr * (1 - math.cos(a))))
    else:
        rings.append((p, z0))
    if top and rr > 0:
        for k in range(seg + 1):
            a = math.pi / 2 * k / seg
            rings.append((offset_poly(p, -rr * (1 - math.cos(a))), z1 - rr * (1 - math.sin(a))))
    else:
        rings.append((p, z1))
    n = len(p)
    verts = []
    for ring, z in rings:
        verts.extend(Vector((x, y, z)) for x, y in ring)
    faces = []
    nr = len(rings)
    for i in range(nr - 1):
        for j in range(n):
            j2 = (j + 1) % n
            faces.append([i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j])
    faces.append(list(reversed(range(n))))
    faces.append([(nr - 1) * n + j for j in range(n)])
    if M is not None:
        verts = [M @ v for v in verts]
    return verts, faces


def loft(rings, cap_start=True, cap_end=True, close=True):
    """Loft closed rings of 3D points (equal counts)."""
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


def section_loft(sections, zs, M=None, cap=True, cap_round=0.0, seg=2):
    """Loft 2D sections (equal point counts) placed at local z = zs[i].
    cap_round > 0 rounds both end caps with quarter-circle inset rings."""
    secs = [ccw(s) for s in sections]
    zs = list(zs)
    seq = []
    if cap_round > 0:
        for k in range(seg):
            a = math.pi / 2 * k / seg
            seq.append((offset_poly(secs[0], -cap_round * (1 - math.sin(a))), zs[0] + cap_round * (1 - math.cos(a))))
        for i in range(len(secs)):
            z = zs[i]
            if i == 0:
                z = zs[0] + cap_round
            if i == len(secs) - 1:
                z = zs[-1] - cap_round
            seq.append((secs[i], z))
        for k in range(1, seg + 1):
            a = math.pi / 2 * k / seg
            seq.append((offset_poly(secs[-1], -cap_round * (1 - math.cos(a))), zs[-1] - cap_round * (1 - math.sin(a))))
    else:
        seq = [(secs[i], zs[i]) for i in range(len(secs))]
    rings = [[Vector((x, y, z)) for x, y in poly] for poly, z in seq]
    verts, faces = loft(rings, cap, cap)
    if M is not None:
        verts = [M @ v for v in verts]
    return verts, faces


def revolve(profile, seg=32, axis='Z', arc=2 * math.pi, M=None):
    """Revolve an (r, h) profile about a local axis. r == 0 points become shared poles."""
    close = abs(arc - 2 * math.pi) < 1e-6
    nseg = seg if close else seg + 1
    verts = []
    poles = {}
    rows = []
    for s in range(nseg):
        a = arc * s / seg
        ca, sa = math.cos(a), math.sin(a)
        row = []
        for j, (r, h) in enumerate(profile):
            if r < 1e-9:
                if j not in poles:
                    verts.append(Vector((0, 0, h)))
                    poles[j] = len(verts) - 1
                row.append(poles[j])
            else:
                verts.append(Vector((r * ca, r * sa, h)))
                row.append(len(verts) - 1)
        rows.append(row)
    faces = []
    for s in range(len(rows) if close else len(rows) - 1):
        r0 = rows[s]
        r1 = rows[(s + 1) % len(rows)]
        for j in range(len(profile) - 1):
            uq = []
            for k in (r0[j], r1[j], r1[j + 1], r0[j + 1]):
                if k not in uq:
                    uq.append(k)
            if len(uq) >= 3:
                faces.append(uq)
    if axis == 'X':
        R = Matrix.Rotation(math.pi / 2, 4, 'Y')
    elif axis == 'Y':
        R = Matrix.Rotation(-math.pi / 2, 4, 'X')
    else:
        R = Matrix.Identity(4)
    T = (M @ R) if M is not None else R
    return [T @ v for v in verts], faces


def tube(path, radius, seg=12, M=None, cap=True):
    """Sweep a circle along a polyline with parallel-transport frames."""
    P = [Vector(p) for p in path]
    n = len(P)
    T = []
    for i in range(n):
        if i == 0:
            t = P[1] - P[0]
        elif i == n - 1:
            t = P[-1] - P[-2]
        else:
            t = P[i + 1] - P[i - 1]
        T.append(t.normalized())
    up = Vector((0, 0, 1)) if abs(T[0].z) < 0.95 else Vector((1, 0, 0))
    side = T[0].cross(up).normalized()
    rings = []
    for i in range(n):
        if i > 0:
            q = T[i - 1].rotation_difference(T[i])
            side = (q @ side).normalized()
        u = side
        w = T[i].cross(u).normalized()
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        rings.append([P[i] + (u * math.cos(2 * math.pi * k / seg) + w * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)])
    verts, faces = loft(rings, cap, cap)
    if M is not None:
        verts = [M @ v for v in verts]
    return verts, faces


def box(size, center=(0, 0, 0), M=None):
    sx, sy, sz = size
    return prism(rect(sx, sy, center[0], center[1]), center[2] - sz / 2, center[2] + sz / 2, M)


def planar_slab(outline, thickness, out_hint, bevel_r=0.0, seg=2):
    """A slab from a planar 3D outline: the outline is the OUTER face; thickness
    extends opposite to out_hint. Optional rounded outer edges."""
    P = [Vector(p) for p in outline]
    o = sum(P, Vector()) / len(P)
    n = Vector()
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    n.normalize()
    if n.dot(Vector(out_hint)) < 0:
        n = -n
    u = None
    for i in range(len(P)):
        e = P[(i + 1) % len(P)] - P[i]
        e = e - n * e.dot(n)
        if e.length > 1e-6:
            u = e.normalized()
            break
    w = n.cross(u)
    M = Matrix((
        (u.x, w.x, n.x, o.x),
        (u.y, w.y, n.y, o.y),
        (u.z, w.z, n.z, o.z),
        (0, 0, 0, 1)))
    Mi = M.inverted()
    poly = [((Mi @ p).x, (Mi @ p).y) for p in P]
    if bevel_r > 0:
        return bevel_prism(poly, -thickness, 0.0, bevel_r, seg, M, bottom=False, top=True)
    return prism(poly, -thickness, 0.0, M)


def transform(mesh, M):
    v, f = mesh
    return [M @ Vector(p) for p in v], f


def mirror_x(mesh):
    v, f = mesh
    return [Vector((-p[0], p[1], p[2])) for p in v], [list(reversed(face)) for face in f]


# --------------------------------------------------------------- modifiers

def finish(o, width=0.004, seg=2, angle=30.0, profile=0.5, harden=True, weighted=True, clamp=True):
    """Angle-limited bevel + weighted normals: the production hard-surface finish."""
    if width > 0:
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width = width
        m.segments = seg
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(angle)
        m.profile = profile
        m.use_clamp_overlap = clamp
        m.harden_normals = harden
        m.miter_outer = 'MITER_ARC'
    if weighted:
        w = o.modifiers.new('wnormal', 'WEIGHTED_NORMAL')
        w.keep_sharp = True
        w.weight = 50
        w.mode = 'FACE_AREA'
    return o


def solidify(o, thickness, offset=-1.0, rim=True, even=True):
    m = o.modifiers.new('solidify', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = offset
    m.use_rim = rim
    m.use_even_offset = even
    m.use_quality_normals = True
    return m


def apply_modifiers(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = o.data
    o.modifiers.clear()
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def boolean(o, cutter, op='DIFFERENCE', apply=True, remove_cutter=True, solver='MANIFOLD'):
    m = o.modifiers.new('bool', 'BOOLEAN')
    m.operation = op
    m.solver = solver           # manifold inputs throughout: robust and fast (EXACT drops thin bands)
    m.object = cutter
    cutter.hide_render = True
    cutter.hide_viewport = True
    if apply:
        # apply only this modifier: move it first, bake, keep others
        others = [(mm.name, mm.type) for mm in o.modifiers if mm != m]
        if others:
            raise RuntimeError('boolean before finish(): apply booleans first')
        apply_modifiers(o)
        if remove_cutter:
            data = cutter.data
            bpy.data.objects.remove(cutter, do_unlink=True)
            if data and data.users == 0:
                bpy.data.meshes.remove(data)
    return o


def cutter_obj(mesh, name='cutter'):
    o = obj_from_pydata(name, mesh[0], mesh[1], ['interior'], smooth=False)
    fix_normals(o)
    return o


def cut(o, *meshes, op='DIFFERENCE'):
    """Boolean-cut polygon meshes out of o (applied immediately)."""
    if not meshes:
        return o
    if len(meshes) == 1:
        c = cutter_obj(meshes[0])
    else:
        b = Builder()
        for m in meshes:
            b.add_mesh(m, 'interior')
        c = b.build('cutter', smooth=False)
    return boolean(o, c, op)


def set_parent_keep(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def offset_open(pts, d):
    """Offset an open 2D polyline by d to its left (miter joins)."""
    n = len(pts)
    segs = []
    for i in range(n - 1):
        a, b = pts[i], pts[i + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy) or 1.0
        segs.append((dx / l, dy / l))
    out = []
    for i in range(n):
        if i == 0:
            t = segs[0]
            nn = (-t[1], t[0])
            k = 1.0
        elif i == n - 1:
            t = segs[-1]
            nn = (-t[1], t[0])
            k = 1.0
        else:
            t0, t1 = segs[i - 1], segs[i]
            n0 = (-t0[1], t0[0])
            n1 = (-t1[1], t1[0])
            mx_, my_ = n0[0] + n1[0], n0[1] + n1[1]
            ml = math.hypot(mx_, my_) or 1.0
            nn = (mx_ / ml, my_ / ml)
            k = 1.0 / max(0.3, nn[0] * n0[0] + nn[1] * n0[1])
        out.append((pts[i][0] + nn[0] * d * k, pts[i][1] + nn[1] * d * k))
    return out


def molding(path, profile, to3d, cap=True, closed=False):
    """Sweep a closed 2D profile [(d, w)] along a planar polyline `path`.
    d offsets the path to its left, w is the out-of-plane coordinate;
    to3d(p2, w) maps a path-plane point and w to a 3D Vector."""
    offs = {}
    for d, _ in profile:
        if d not in offs:
            offs[d] = offset_poly(path, d) if closed else offset_open(path, d)
    rings = []
    for i in range(len(path)):
        rings.append([to3d(offs[d][i], w) for d, w in profile])
    if closed:
        n = len(profile)
        verts = [v for r in rings for v in r]
        faces = []
        m = len(rings)
        for i in range(m):
            i2 = (i + 1) % m
            for j in range(n):
                j2 = (j + 1) % n
                faces.append([i * n + j, i2 * n + j, i2 * n + j2, i * n + j2])
        return verts, faces
    return loft([list(reversed(r)) for r in rings], cap, cap)


def bar(p0, p1, sec0, sec1=None, up=(0, 0, 1)):
    """Straight lofted member from p0 to p1 with 2D sections at each end."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    z = d / L
    upv = Vector(up)
    if abs(z.dot(upv)) > 0.95:
        upv = Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))
    x = upv.cross(z).normalized()
    y = z.cross(x)
    M = Matrix(((x.x, y.x, z.x, p0.x), (x.y, y.y, z.y, p0.y), (x.z, y.z, z.z, p0.z), (0, 0, 0, 1)))
    return section_loft([sec0, sec1 or sec0], [0.0, L], M=M)


def append_builder(o, b):
    """Append a Builder's polygons (with their slots) into an existing mesh object."""
    me = o.data
    names = [m.name[3:] if m and m.name.startswith('f1.') else None for m in me.materials]
    remap = []
    for s in b.slots:
        if s not in names:
            me.materials.append(mats.get(s))
            names.append(s)
        remap.append(names.index(s))
    bm = bmesh.new()
    bm.from_mesh(me)
    base = len(bm.verts)
    for v in b.verts:
        bm.verts.new(v)
    bm.verts.ensure_lookup_table()
    for f, k in zip(b.faces, b.fslot):
        try:
            face = bm.faces.new([bm.verts[base + i] for i in f])
        except ValueError:
            continue
        face.material_index = remap[k]
        face.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return o


def cut_mesh(mesh, cutters, op='DIFFERENCE'):
    """Boolean a single (verts, faces) island by cutter meshes; returns (verts, faces)."""
    o = obj_from_pydata('tmp.cut', mesh[0], mesh[1], ['interior'], smooth=False)
    fix_normals(o)
    for c in cutters:
        boolean(o, cutter_obj(c), op)
    me = o.data
    verts = [v.co.copy() for v in me.vertices]
    faces = [list(p.vertices) for p in me.polygons]
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(me)
    return verts, faces
