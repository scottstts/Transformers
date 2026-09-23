"""Geometry quality gates for the assembled model (world space, evaluated meshes).

Gates (metre tolerances follow the procedural-geometry skill's quality gates):
  islands   - every connected island of a part touches another island of the
              same part (a floating housing inside one object is a defect)
  attach    - every part touches, or sits within a reveal gap of, another part
  coplanar  - same-facing coplanar overlap between different parts (z-fight)
  clash     - triangle intersections between different parts, minus declared
              structural allowances
"""
import math
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

TOUCH = 0.0012          # parts / islands closer than this are in contact
REVEAL = 0.0065         # a panel may float across a reveal gap up to this
PLANE_D = 0.0015        # coplanar plane separation
PLANE_ANG = 0.0025      # radians
OVERLAP_AREA = 2e-4     # m^2


class WMesh:
    """Evaluated world-space triangle mesh of one object."""

    def __init__(self, o, dg):
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n = len(me.vertices)
        co = np.empty(n * 3, np.float64)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        M = np.array(o.matrix_world)
        self.v = co @ M[:3, :3].T + M[:3, 3]
        nt = len(me.loop_triangles)
        tri = np.empty(nt * 3, np.int32)
        me.loop_triangles.foreach_get('vertices', tri)
        self.t = tri.reshape(-1, 3)
        ev.to_mesh_clear()
        self.name = o.name
        self.obj = o
        self.lo = self.v.min(0) if n else np.zeros(3)
        self.hi = self.v.max(0) if n else np.zeros(3)
        self._bvh = None

    @property
    def bvh(self):
        if self._bvh is None:
            self._bvh = BVHTree.FromPolygons(self.v.tolist(), self.t.tolist(), epsilon=0.0)
        return self._bvh

    def islands(self):
        """Triangle islands (connected through shared, position-welded vertices)."""
        key = np.round(self.v / 1e-5).astype(np.int64)
        _, weld = np.unique(key, axis=0, return_inverse=True)
        weld = weld.reshape(-1)
        parent = np.arange(weld.max() + 1 if len(weld) else 0)

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a
        for a, b, c in weld[self.t]:
            ra, rb, rc = find(a), find(b), find(c)
            parent[rb] = ra
            parent[find(rc)] = ra
        roots = np.array([find(weld[t[0]]) for t in self.t])
        groups = {}
        for i, r in enumerate(roots):
            groups.setdefault(r, []).append(i)
        return list(groups.values())


def gather(objects):
    dg = bpy.context.evaluated_depsgraph_get()
    out = []
    for o in objects:
        if o.type == 'MESH' and not o.hide_render and len(o.data.polygons):
            out.append(WMesh(o, dg))
    return out


def aabb_gap(a, b):
    d = np.maximum(0.0, np.maximum(a.lo - b.hi, b.lo - a.hi))
    return float(np.linalg.norm(d))


def min_dist(a_pts, bvh, limit):
    best = limit
    for p in a_pts:
        hit = bvh.find_nearest(Vector(p), best)
        if hit[0] is not None and hit[3] < best:
            best = hit[3]
            if best < 1e-6:
                break
    return best


def sample(pts, k=400):
    if len(pts) <= k:
        return pts
    idx = np.linspace(0, len(pts) - 1, k).astype(int)
    return pts[idx]


def island_report(ms):
    """Islands of a part that do not touch any other island of the same part."""
    bad = []
    for m in ms:
        isl = m.islands()
        if len(isl) < 2:
            continue
        for k, tris in enumerate(isl):
            vi = np.unique(m.t[tris].reshape(-1))
            others = np.concatenate([np.array(isl[j]) for j in range(len(isl)) if j != k])
            bv = BVHTree.FromPolygons(m.v.tolist(), m.t[others].tolist())
            ov = BVHTree.FromPolygons(m.v.tolist(), m.t[tris].tolist()).overlap(bv)
            if ov:
                continue
            d = min_dist(sample(m.v[vi]), bv, 1.0)
            if d > TOUCH:
                c = m.v[vi].mean(0)
                bad.append((m.name, k, round(d, 4), tuple(np.round(c, 3))))
    return bad


def attach_report(ms, touch=TOUCH, reveal=REVEAL, allow=()):
    """For each part: distance to its nearest neighbour part.
    allow: name prefixes of parts whose support is declared elsewhere (e.g. wheel hubs)."""
    res = []
    for a in ms:
        if any(a.name.startswith(p) for p in allow):
            continue
        best = 10.0
        who = None
        for b in ms:
            if b is a or aabb_gap(a, b) > best:
                continue
            if a.bvh.overlap(b.bvh):
                best, who = 0.0, b.name
                break
            d = min(min_dist(sample(a.v), b.bvh, best), min_dist(sample(b.v), a.bvh, best))
            if d < best:
                best, who = d, b.name
        res.append((a.name, round(best, 4), who))
    return [r for r in res if r[1] > reveal], res


def clash_report(ms, allow=(), min_pairs=3, rigid_groups=True, where=False):
    """Pairs of parts whose triangles intersect. allow: iterable of (prefixA, prefixB).
    rigid_groups: parts sharing a parent are one rigid body (welded) and are skipped."""
    def allowed(x, y):
        for p, q in allow:
            if (x.startswith(p) and y.startswith(q)) or (x.startswith(q) and y.startswith(p)):
                return True
        return False
    out = []
    for i in range(len(ms)):
        for j in range(i + 1, len(ms)):
            a, b = ms[i], ms[j]
            if aabb_gap(a, b) > 0:
                continue
            if allowed(a.name, b.name):
                continue
            if rigid_groups and a.obj.parent is not None and a.obj.parent == b.obj.parent:
                continue
            ov = penetrating(a, b, a.bvh.overlap(b.bvh))
            if len(ov) >= min_pairs:
                if where:
                    c = np.mean([a.v[a.t[i]].mean(0) for i, _ in ov], axis=0)
                    out.append((a.name, b.name, len(ov), tuple(np.round(c, 2))))
                else:
                    out.append((a.name, b.name, len(ov)))
    return out


def _tri_plane(m, i):
    p = m.v[m.t[i]]
    n = np.cross(p[1] - p[0], p[2] - p[0])
    ln = np.linalg.norm(n)
    return (n / ln if ln > 1e-12 else n), p


def penetrating(a, b, pairs, eps=2e-4):
    """Drop coplanar contacts (seated faces): only real crossings remain."""
    out = []
    for i, j in pairs:
        na, pa = _tri_plane(a, i)
        nb, pb = _tri_plane(b, j)
        if abs(float(na @ nb)) > 0.999 and abs(float(na @ (pb[0] - pa[0]))) < eps:
            continue
        # triangles penetrate only if each crosses the other's plane; one-sided within eps is contact
        da = (pb - pa[0]) @ na
        db = (pa - pb[0]) @ nb
        if (da.min() > -eps or da.max() < eps) or (db.min() > -eps or db.max() < eps):
            continue
        out.append((i, j))
    return out


def _tri_arrays(ms):
    P, N, D, A, owner = [], [], [], [], []
    for k, m in enumerate(ms):
        if not len(m.t):
            continue
        p = m.v[m.t]
        n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
        area = np.linalg.norm(n, axis=1)
        ok = area > 1e-10
        n = n[ok] / area[ok][:, None]
        P.append(p[ok])
        N.append(n)
        D.append(np.einsum('ij,ij->i', n, p[ok][:, 0]))
        A.append(area[ok] * 0.5)
        owner.append(np.full(ok.sum(), k))
    return np.concatenate(P), np.concatenate(N), np.concatenate(D), np.concatenate(A), np.concatenate(owner)


def _clip_area(t1, t2, n):
    # project to the plane basis and clip convex polygons (Sutherland-Hodgman)
    u = np.cross(n, [1, 0, 0] if abs(n[0]) < 0.9 else [0, 1, 0])
    u /= np.linalg.norm(u)
    w = np.cross(n, u)
    a = [(float(p @ u), float(p @ w)) for p in t1]
    b = [(float(p @ u), float(p @ w)) for p in t2]

    def area(poly):
        s = 0.0
        for i in range(len(poly)):
            x0, y0 = poly[i]
            x1, y1 = poly[(i + 1) % len(poly)]
            s += x0 * y1 - x1 * y0
        return s * 0.5
    if area(a) < 0:
        a = a[::-1]
    if area(b) < 0:
        b = b[::-1]
    out = a
    for i in range(len(b)):
        c0, c1 = b[i], b[(i + 1) % len(b)]
        inp = out
        out = []
        if not inp:
            break

        def inside(p):
            return (c1[0] - c0[0]) * (p[1] - c0[1]) - (c1[1] - c0[1]) * (p[0] - c0[0]) >= 0

        def inter(p, q):
            x1, y1, x2, y2 = p[0], p[1], q[0], q[1]
            x3, y3, x4, y4 = c0[0], c0[1], c1[0], c1[1]
            den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(den) < 1e-15:
                return q
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
            return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
        for k in range(len(inp)):
            p, q = inp[k], inp[(k + 1) % len(inp)]
            if inside(q):
                if not inside(p):
                    out.append(inter(p, q))
                out.append(q)
            elif inside(p):
                out.append(inter(p, q))
    return abs(area(out)) if len(out) >= 3 else 0.0


def coplanar_report(ms, same_facing=True):
    """Same-facing coplanar overlaps between different parts (z-fighting)."""
    P, N, D, A, own = _tri_arrays(ms)
    # canonical plane key: flip so the dominant component is positive
    sgn = np.sign(N[np.arange(len(N)), np.abs(N).argmax(1)])
    Nc = N * sgn[:, None]
    Dc = D * sgn
    kn = np.round(Nc / 0.02).astype(np.int64)
    kd = np.round(Dc / 0.02).astype(np.int64)
    buckets = {}
    for i in range(len(P)):
        k = (kn[i, 0], kn[i, 1], kn[i, 2], kd[i])
        buckets.setdefault(k, []).append(i)
    lo = P.min(1)
    hi = P.max(1)
    hits = {}
    cos_lim = math.cos(PLANE_ANG)
    for idx in buckets.values():
        if len(idx) < 2:
            continue
        idx = np.array(idx)
        owners = own[idx]
        if len(np.unique(owners)) < 2:
            continue
        order = idx[np.argsort(lo[idx, 0])]
        for a_i in range(len(order)):
            i = order[a_i]
            for b_i in range(a_i + 1, len(order)):
                j = order[b_i]
                if lo[j, 0] > hi[i, 0] + PLANE_D:
                    break
                if own[i] == own[j]:
                    continue
                if np.any(lo[i] > hi[j] + PLANE_D) or np.any(lo[j] > hi[i] + PLANE_D):
                    continue
                c = float(N[i] @ N[j])
                if abs(c) < cos_lim:
                    continue
                if same_facing and c < 0:
                    continue
                if abs(float(N[i] @ P[j][0]) - D[i]) > PLANE_D:
                    continue
                ar = _clip_area(P[i], P[j], N[i])
                if ar > 1e-7:
                    key = tuple(sorted((ms[own[i]].name, ms[own[j]].name)))
                    hits[key] = hits.get(key, 0.0) + ar
    return sorted([(k[0], k[1], round(v * 1e4, 2)) for k, v in hits.items() if v >= OVERLAP_AREA], key=lambda r: -r[2])


def run(objects, allow=(), attach_allow=(), verbose=True):
    ms = gather(objects)
    rep = {
        'parts': len(ms),
        'tris': int(sum(len(m.t) for m in ms)),
        'islands': island_report(ms),
        'detached': attach_report(ms, allow=attach_allow)[0],
        'coplanar_cm2': coplanar_report(ms),
        'clash': clash_report(ms, allow),
    }
    if verbose:
        for k, v in rep.items():
            if isinstance(v, list):
                print('%s: %d' % (k, len(v)))
                for r in v[:40]:
                    print('   ', r)
            else:
                print('%s: %s' % (k, v))
    return rep
