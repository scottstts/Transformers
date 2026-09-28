"""Checks used while fitting the fold: robot geometry that shows outside the car.

exposed(T=0): for every robot object, the share of its (sampled) vertices that
see out of the car along +z, +-x or +-f without hitting a car mesh first."""
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def _world_tree(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        M = o.matrix_world
        b = len(verts)
        verts += [M @ v.co for v in me.vertices]
        polys += [[b + i for i in p.vertices] for p in me.polygons]
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def exposed(sc, T=0.0, step=7, dirs=((0, 0, 1), (1, 0, 0), (-1, 0, 0), (0, -1, 0), (0, 1, 0))):
    from . import bake
    bake.apply(sc, T)
    bpy.context.view_layer.update()
    car = [o for o in bpy.data.collections['CAR'].all_objects if o.type == 'MESH' and o.visible_get()]
    tree = _world_tree(car)
    out = []
    for o in bpy.data.collections['ROBOT'].all_objects:
        if o.type != 'MESH' or not len(o.data.vertices):
            continue
        M = o.matrix_world
        vs = [M @ o.data.vertices[i].co for i in range(0, len(o.data.vertices), step)]
        n = 0
        worst = 0.0
        for p in vs:
            for d in dirs:
                d = Vector(d)
                hit = tree.ray_cast(p + d * 0.002, d, 20.0)
                if hit[0] is None:
                    n += 1
                    worst = max(worst, p.z)
                    break
        if n:
            out.append((o.name, n / len(vs), round(worst, 3)))
    out.sort(key=lambda r: -r[1])
    return out


def _group(sc, o):
    """Group key of a posed object: its car assembly, carrier, or robot bone."""
    for name, a in sc.asm.items():
        if o.name in a.parts:
            return 'asm:' + name
    for s in getattr(sc, 'carriers', []):
        if o in s.objs:
            return 'strut:' + s.name
    for bone, objs in sc.structure.items():
        if o in objs:
            return 'bone:' + bone
    return 'other'


def clashes(sc, T, min_tris=4, skip=None):
    """Intersecting object pairs from different groups at T: [(count, a, b)], largest first.
    skip(ga, gb) -> True drops a declared pair (joints, mounts)."""
    from . import bake
    bake.apply(sc, T)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    objs = [o for c in ('CAR', 'ROBOT') for o in bpy.data.collections[c].all_objects if o.type == 'MESH' and len(o.data.polygons)]
    data = []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        M = o.matrix_world
        vs = [M @ v.co for v in me.vertices]
        ps = [list(p.vertices) for p in me.polygons]
        ev.to_mesh_clear()
        if not vs:
            continue
        lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        data.append((o, _group(sc, o), lo, hi, vs, ps))
    trees = {}
    out = []
    for i in range(len(data)):
        oa, ga, la, ha, va, pa = data[i]
        for j in range(i + 1, len(data)):
            ob, gb, lb, hb, vb, pb = data[j]
            if ga == gb or (skip and skip(ga, gb)):
                continue
            if any(la[k] > hb[k] or lb[k] > ha[k] for k in range(3)):
                continue
            ta = trees.get(oa.name) or trees.setdefault(oa.name, BVHTree.FromPolygons(va, pa))
            tb = trees.get(ob.name) or trees.setdefault(ob.name, BVHTree.FromPolygons(vb, pb))
            n = len(ta.overlap(tb))
            if n >= min_tris:
                out.append((n, oa.name, ob.name))
    out.sort(reverse=True)
    return out
