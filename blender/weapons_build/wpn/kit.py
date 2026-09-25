"""Weapon modeling helpers on top of the F1 build's polygon kit (f1b.kit: sections,
lofts, revolves, bevels, booleans).

Weapon frame (metres): +Z runs along the haft or blade toward the head / tip,
+X is the cutting edge's direction, Y the flat's normal. The main hand's grip
centre is the origin. Parts are one Blender object each (one semantic part,
several material slots allowed), finished with an angle-limited bevel and
weighted normals; the exporter evaluates the modifiers.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from f1b import kit as K
from . import mats

ccw = K.ccw
offset_poly = K.offset_poly
chamfer_rect = K.chamfer_rect
section_loft = K.section_loft
revolve = K.revolve
bevel_prism = K.bevel_prism
prism = K.prism
loft = K.loft
frame_from = K.frame_from
finish = K.finish


class Part:
    """Polygon islands with material slots, built into one object."""

    def __init__(self, weapon, name):
        self.weapon = weapon
        self.name = name
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

    def build(self, coll):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(v) for v in self.verts], [], [tuple(f) for f in self.faces])
        me.validate(clean_customdata=False)
        me.update()
        o = bpy.data.objects.new(self.name, me)
        coll.objects.link(o)
        for s in self.slots:
            me.materials.append(mats.get(self.weapon, s))
        me.polygons.foreach_set('material_index', self.fslot)
        me.shade_smooth()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.update()
        return o


def axis_frame(origin, z, x_hint):
    """4x4 frame at origin whose local Z is `z` and local X lies toward x_hint."""
    z = Vector(z).normalized()
    x = Vector(x_hint)
    x = (x - z * x.dot(z)).normalized()
    return frame_from(origin, x, z.cross(x))


def ring_band(section, z0, z1, grow, cap=0.004, M=None):
    """A band of `section` grown by `grow`, z0..z1 along local Z, rounded ends."""
    s = offset_poly(ccw(section), grow)
    return section_loft([s, s], [z0, z1], M=M, cap_round=min(cap, (z1 - z0) * 0.3), seg=2)


def bands(section, z0, z1, n, gap, grow, cap=0.004, M=None):
    """n wrap bands between z0 and z1 with `gap` seams between them."""
    out = []
    step = (z1 - z0) / n
    for k in range(n):
        a = z0 + k * step + (gap / 2 if k else 0)
        b = z0 + (k + 1) * step - (gap / 2 if k < n - 1 else 0)
        out.append(ring_band(section, a, b, grow, cap, M))
    return out


def hex_bolt(center, normal, r=0.012, h=0.008, sink=0.002):
    """A hex bolt head standing on the plane through `center` with outward `normal`."""
    n = Vector(normal).normalized()
    M = axis_frame(Vector(center), n, n.orthogonal())
    prof = [(0.0, -sink), (r, -sink), (r, h - 0.0025), (r * 0.72, h), (0.0, h)]
    return revolve(prof, 6, axis='Z', M=M)


def ground_blade(outline, edge, t, e, bevel):
    """A ground blade lying in the XZ plane, thickness along Y.

    outline: counter-clockwise (x, z) polygon; edge[i]: vertex i lies on the
    cutting edge. The flats are the outline with every edge vertex pulled in by
    `bevel` (half thickness t / 2); the ground bevels fall from there to the
    edge, which keeps a small land of half thickness e. Sides between two
    non-edge vertices are the blade's full-thickness spine faces."""
    P = [Vector(p) for p in outline]
    inner = offset_poly(outline, -bevel)
    n = len(P)
    verts = []

    def add(x, y, z):
        verts.append(Vector((x, y, z)))
        return len(verts) - 1

    top_flat, top_edge, bot_flat, bot_edge = [], [], [], []
    for i in range(n):
        if edge[i]:
            qx, qz = inner[i]
            top_flat.append(add(qx, t / 2, qz))
            bot_flat.append(add(qx, -t / 2, qz))
            top_edge.append(add(P[i].x, e, P[i].y))
            bot_edge.append(add(P[i].x, -e, P[i].y))
        else:
            a = add(P[i].x, t / 2, P[i].y)
            b = add(P[i].x, -t / 2, P[i].y)
            top_flat.append(a)
            top_edge.append(a)
            bot_flat.append(b)
            bot_edge.append(b)
    faces = [list(top_flat), list(reversed(bot_flat))]

    def face(idx):
        out = []
        for k in idx:
            if not out or out[-1] != k:
                out.append(k)
        if len(out) > 1 and out[0] == out[-1]:
            out.pop()
        if len(out) >= 3:
            faces.append(out)

    for i in range(n):
        j = (i + 1) % n
        face([top_flat[i], top_edge[i], top_edge[j], top_flat[j]])
        face([bot_flat[j], bot_edge[j], bot_edge[i], bot_flat[i]])
        face([top_edge[i], bot_edge[i], bot_edge[j], top_edge[j]])
    return verts, faces


def diamond(w, h, cx=0.0, cy=0.0, shoulder=1 / 6):
    """Six-sided diamond section: points at +-h/2 on y, shoulders at +-w/2."""
    s = h * shoulder
    return [(cx, cy + h / 2), (cx - w / 2, cy + s), (cx - w / 2, cy - s), (cx, cy - h / 2), (cx + w / 2, cy - s), (cx + w / 2, cy + s)]


def z_to(M_dir, origin=(0, 0, 0)):
    """Frame at origin whose local Z runs along M_dir ('+x', '-x', ...)."""
    d = {'+x': (1, 0, 0), '-x': (-1, 0, 0), '+y': (0, 1, 0), '-y': (0, -1, 0), '+z': (0, 0, 1), '-z': (0, 0, -1)}[M_dir]
    hint = (0, 0, 1) if abs(d[2]) < 0.5 else (1, 0, 0)
    return axis_frame(Vector(origin), d, hint)


def unit(v):
    return Vector(v).normalized()


TAU = 2 * math.pi
IDENTITY = Matrix.Identity(4)


def cut(o, weapon, slot, *meshes):
    """Boolean-cut meshes out of o; the cut faces take `slot` (the solver hands them the cutter's material)."""
    K.cut(o, *meshes)
    for i, m in enumerate(o.data.materials):
        if m is None or not m.name.startswith(weapon + '.'):
            o.data.materials[i] = mats.get(weapon, slot)
    return o
