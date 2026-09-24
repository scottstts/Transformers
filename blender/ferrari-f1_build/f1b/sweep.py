"""Animation clearance sweep: solid clashes between parts over the whole
transformation (and any other pose sequence), not just at its endpoints.

Local-space triangles are cached per object; each sample transforms them by the
posed world matrices from bake.object_worlds, prunes pairs by AABB, and runs the
same penetration test as the static gate (coplanar contact is not a clash).
Parts that share a parent node are one rigid body and are skipped."""
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
from . import audit, bake

_CACHE = {}


def local_tris(o):
    key = o.name
    hit = _CACHE.get(key)
    if hit and hit[0] is o.data:
        return hit[1], hit[2]
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    tri = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get('vertices', tri)
    ev.to_mesh_clear()
    v, t = co.reshape(-1, 3), tri.reshape(-1, 3)
    _CACHE[key] = (o.data, v, t)
    return v, t


class Posed:
    def __init__(self, o, M):
        v, t = local_tris(o)
        R = np.array(M.to_3x3())
        self.v = v @ R.T + np.array(M.translation)
        self.t = t
        self.name = o.name
        self.obj = o
        self.group = o.parent.name if o.parent else o.name
        self.lo = self.v.min(0)
        self.hi = self.v.max(0)
        self._bvh = None

    @property
    def bvh(self):
        if self._bvh is None:
            self._bvh = BVHTree.FromPolygons(self.v.tolist(), self.t.tolist(), epsilon=0.0)
        return self._bvh


def allowed(a, b, allow):
    for p, q in allow:
        if (a.startswith(p) and b.startswith(q)) or (a.startswith(q) and b.startswith(p)):
            return True
    return False


def clashes_at(sc, T, allow=(), min_pairs=3):
    objs, W, N, lift = bake.object_worlds(sc, T)
    ps = [Posed(o, M) for o, M in objs.items() if not o.hide_render and len(o.data.polygons)]
    ps.sort(key=lambda p: p.lo[0])
    out = []
    for i in range(len(ps)):
        a = ps[i]
        for j in range(i + 1, len(ps)):
            b = ps[j]
            if b.lo[0] > a.hi[0]:
                break
            if a.group == b.group:
                continue
            if np.any(a.lo > b.hi) or np.any(b.lo > a.hi):
                continue
            if allowed(a.name, b.name, allow):
                continue
            ov = audit.penetrating(a, b, a.bvh.overlap(b.bvh))
            if len(ov) >= min_pairs:
                out.append((a.name, b.name, len(ov)))
    return out


def sweep(sc, samples=120, allow=(), t0=0.0, t1=1.0, verbose=True):
    """Clash report over T: pair -> (first T, last T, worst crossing count, worst T)."""
    report = {}
    for k in range(samples + 1):
        T = t0 + (t1 - t0) * k / samples
        for a, b, n in clashes_at(sc, T, allow):
            key = tuple(sorted((a, b)))
            r = report.get(key)
            if r is None:
                report[key] = [T, T, n, T]
            else:
                r[1] = T
                if n > r[2]:
                    r[2], r[3] = n, T
    rows = sorted(report.items(), key=lambda kv: kv[1][0])
    if verbose:
        print('sweep %d samples: %d clashing pairs' % (samples + 1, len(rows)))
        for (a, b), (first, last, worst, wt) in rows:
            print('   %-22s %-22s T %.3f..%.3f  worst %d @ %.3f' % (a, b, first, last, worst, wt))
    return rows
