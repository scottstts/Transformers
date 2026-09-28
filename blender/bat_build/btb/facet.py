"""Faceted armour panels: the Tumbler is built from flat plates meeting at hard
creases, so every body panel is a small polyhedral surface (design points +
facets), shrunk by half a seam gap along its open boundary, then given its
plate thickness inward (solidify) and a fine angle-limited bevel.

Points are design coordinates (x, s, z) with s the station back from the
front tyres (dims.f converts to the forward coordinate). A `sym` panel is
authored for x >= 0 and mirrored across the centreline (points on x = 0 are
welded); a sided panel is authored for the L side and mirrored into .R."""
import bmesh
import bpy
from mathutils import Vector
from . import kit, mats, dims as D
from .kit import V

CENTRE = V(0.0, D.f(2.3), 0.62)        # outward hint: away from the body's core


def P(x, s, z):
    return V(x, D.f(s), z)


def _bm(pts, faces, sym, flip_x=False):
    bm = bmesh.new()
    vs = [bm.verts.new(P(-x if flip_x else x, s, z)) for x, s, z in pts]
    for fc in faces:
        bm.faces.new([vs[i] for i in fc])
    if sym:
        mv = [bm.verts.new(P(-x, s, z)) for x, s, z in pts]
        for fc in faces:
            bm.faces.new([mv[i] for i in reversed(fc)])
        bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if abs(v.co.x) < 1e-5], dist=1e-5)
    bm.normal_update()
    return bm


def _orient(bm, hint):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    score = 0.0
    for fc in bm.faces:
        score += fc.normal.dot(fc.calc_center_median() - hint) * fc.calc_area()
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.normal_update()


def _shrink(bm, gap):
    """Pull the open boundary in by `gap`, in the plane of the adjoining facets."""
    if gap <= 0:
        return
    moves = {}
    for v in bm.verts:
        edges = [e for e in v.link_edges if e.is_boundary]
        if len(edges) != 2:
            continue
        acc = Vector()
        dirs = []
        for e in edges:
            fc = e.link_faces[0]
            o = e.other_vert(v)
            d = (o.co - v.co).normalized()
            n = fc.normal.cross(d).normalized()
            if n.dot(fc.calc_center_median() - v.co) < 0:
                n = -n
            dirs.append(n)
            acc += n
        if acc.length < 1e-6:
            continue
        acc.normalize()
        k = max(0.35, acc.dot(dirs[0]))
        moves[v] = acc * (gap / k)
    for v, m in moves.items():
        v.co += m


def panel(name, pts, faces, slot='armor', t=0.022, gap=0.004, sym=False, side=None, coll=None, bevel=0.003,
          hint=None, slots=None, angle=25.0, cuts=()):
    """Build one faceted plate. side: None (as authored / sym), 'L' or 'R' (R mirrors x).
    slots: optional per-face slot names (overrides `slot`). cuts: cutter meshes (design
    points authored for L; mirrored for R) subtracted after the plate is given its thickness."""
    bm = _bm(pts, faces, sym, flip_x=(side == 'R'))
    h = hint if hint is not None else CENTRE
    _orient(bm, h)
    _shrink(bm, gap)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(o)
    names = [slot] if slots is None else list(dict.fromkeys(slots))
    for s_ in names:
        me.materials.append(mats.get(s_))
    if slots is not None:
        idx = [names.index(s_) for s_ in slots]
        if sym:
            idx = idx + idx
        me.polygons.foreach_set('material_index', idx[:len(me.polygons)])
    me.shade_smooth()
    if t > 0:
        kit.solidify(o, t, -1.0)
    if cuts:
        kit.apply_modifiers(o)
        meshes = [kit.mirror_x(c) if side == 'R' else c for c in cuts]
        kit.cut(o, *meshes)
        o.data.materials.clear()
        for s_ in names:
            o.data.materials.append(mats.get(s_))
        if len(names) == 1:
            o.data.polygons.foreach_set('material_index', [0] * len(o.data.polygons))
    kit.finish(o, bevel, 2, angle)
    return o


def cutter(quad, normal, depth=0.3):
    """A prism through a panel: `quad` design points (x, s, z) on the panel, pushed both
    ways along `normal` (x, s, z direction) by `depth`."""
    n = Vector((normal[0], -normal[1], normal[2])).normalized() * depth
    ring = [P(*p) for p in quad]
    verts = [p - n for p in ring] + [p + n for p in ring]
    k = len(ring)
    faces = [list(reversed(range(k))), list(range(k, 2 * k))] + [[i, (i + 1) % k, k + (i + 1) % k, k + i] for i in range(k)]
    return verts, faces


def sided(name, pts, faces, coll, **kw):
    """L and R copies of a panel authored for the L side."""
    return {name + '.L': panel(name + '.L', pts, faces, side='L', coll=coll, **kw),
            name + '.R': panel(name + '.R', pts, faces, side='R', coll=coll, hint=Vector((-kw['hint'].x, kw['hint'].y, kw['hint'].z)) if kw.get('hint') is not None else None,
                               **{k: v for k, v in kw.items() if k != 'hint'})}


def solid(name, mesh_slots, coll, bevel=0.003, angle=30.0):
    """A closed solid from kit meshes [(mesh, slot)]."""
    b = kit.Builder()
    for m, s in mesh_slots:
        b.add_mesh(m, s)
    o = b.build(name, coll)
    kit.finish(o, bevel, 2, angle)
    return o


def mirror_meshes(mesh_slots):
    return [(kit.mirror_x(m), s) for m, s in mesh_slots]
