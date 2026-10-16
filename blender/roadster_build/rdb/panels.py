"""Cut the measured shell and canopy into panels on the measured seams.

A panel is the source solid intersected with a convex region (a box clipped by
seam planes); a panel that is the rest of a solid is the solid minus its
neighbours' regions grown by the seam gap. Every panel therefore keeps the exact
shared surface and the seams are true 3 mm shut lines.
"""
import bpy
import bmesh
from mathutils import Vector
from . import kit as K

GAP = 0.003


def plane(p, q, along=(1, 0, 0), keep=None):
    """Plane containing points p and q and direction `along` (default X).
    `keep` is a point on the side the region keeps. Returns (co, n) with n
    pointing OUT of the kept side."""
    p, q, a = Vector(p), Vector(q), Vector(along)
    n = (q - p).cross(a).normalized()
    if keep is not None and n.dot(Vector(keep) - p) > 0:
        n = -n
    return p, n


def region(planes, grow=0.0, name='region'):
    """Convex solid: a 12 m box clipped by planes (co, n_out). `grow` moves every
    plane outward (negative shrinks)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=12.0)
    for co, n in planes:
        co = co + n * grow
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=n, clear_outer=True)
        edges = [e for e in bm.edges if e.is_boundary]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.data.collections['90_REVIEW_STAGE'].objects.link(o)
    o.hide_render = True
    o.display_type = 'WIRE'
    return o


def _boolean(target, cutter, op):
    mod = target.modifiers.new('cut', 'BOOLEAN')
    mod.object = cutter
    K.enum_set(mod, 'operation', op)
    K.enum_set(mod, 'solver', 'MANIFOLD')
    K.enum_set(mod, 'material_mode', 'TRANSFER')
    target.modifiers.move(len(target.modifiers) - 1, 0)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)


def copy_of(src, name):
    o = bpy.data.objects.new(name, src.data.copy())
    for c in src.users_collection:
        c.objects.link(o)
    o.matrix_world = src.matrix_world.copy()
    o[K.TAG] = True
    for key in ('soft_points', 'sharp_behind'):
        if key in src:
            o[key] = src[key]
    return o


def cut(src, name, keep=(), remove=(), cap='satin'):
    """New object = src ∩ every region in `keep` − every region in `remove`.
    keep / remove: lists of plane lists. Cut faces get the `cap` material."""
    o = copy_of(src, name)
    if cap not in [m.name.split('.', 1)[1] for m in o.data.materials if m]:
        o.data.materials.append(K.MATERIALS[cap])
    cap_index = [m.name for m in o.data.materials].index(K.MATERIALS[cap].name)
    tmp = []
    for planes in keep:
        r = region(planes, grow=-GAP / 2)
        r.data.materials.append(K.MATERIALS[cap])
        tmp.append(r)
        _boolean(o, r, 'INTERSECT')
    for planes in remove:
        r = region(planes, grow=GAP / 2)
        r.data.materials.append(K.MATERIALS[cap])
        tmp.append(r)
        _boolean(o, r, 'DIFFERENCE')
    for r in tmp:
        bpy.data.objects.remove(r, do_unlink=True)
    # faces lying on a cut plane take the cap material
    me = o.data
    for poly in me.polygons:
        if me.materials[poly.material_index] is None:
            poly.material_index = cap_index
    return o, cap_index
