"""Transformation sweep: floating parts and pass-throughs across the baked timeline.

A moving group (a car assembly, or a stowing robot part) floats at a frame when
its nearest distance to every other object exceeds `gap`: nothing visibly carries
it. A pass-through is a triangle overlap between a moving group and another
group or robot part. Both lists are raw material for a visual judgment call.
"""
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


class _Mesh:
    def __init__(self, o):
        me = o.data
        me.calc_loop_triangles()
        self.o = o
        self.v = np.array([v.co[:] for v in me.vertices], dtype=np.float64).reshape(-1, 3)
        self.t = [tuple(t.vertices) for t in me.loop_triangles]
        self.w = None
        self._bvh = None

    def pose(self):
        M = np.array(self.o.matrix_world)
        self.w = self.v @ M[:3, :3].T + M[:3, 3]
        self.lo, self.hi = self.w.min(0), self.w.max(0)
        self._bvh = None

    @property
    def bvh(self):
        if self._bvh is None:
            self._bvh = BVHTree.FromPolygons([Vector(p) for p in self.w], self.t)
        return self._bvh


def groups(sc):
    """name -> [object names]: car assemblies and individually stowing robot parts."""
    g = {n: list(a.parts) for n, a in sc.asm.items() if a.parts}
    for o in sc.stow:
        g['stow:' + o.name] = [o.name]
    return g


def _gap(a_lo, a_hi, b_lo, b_hi):
    return float(np.max(np.maximum(0.0, np.maximum(a_lo - b_hi, b_lo - a_hi))))


def sweep(sc, frames, gap=0.015, sample=500, skip_float=(), skip_pass=()):
    meshes = {o.name: _Mesh(o) for c in ('CAR', 'ROBOT') for o in bpy.data.collections[c].all_objects
              if o.type == 'MESH' and len(o.data.vertices) and not o.hide_render}
    G = {k: [n for n in v if n in meshes] for k, v in groups(sc).items()}
    G = {k: v for k, v in G.items() if v}
    owner = {n: k for k, v in G.items() for n in v}
    floats, passes = {}, {}
    for fr in frames:
        bpy.context.scene.frame_set(fr)
        for m in meshes.values():
            m.pose()
        for k, names in G.items():
            ms = [meshes[n] for n in names]
            lo = np.min([m.lo for m in ms], 0)
            hi = np.max([m.hi for m in ms], 0)
            pts = np.concatenate([m.w for m in ms])
            if len(pts) > sample:
                pts = pts[np.linspace(0, len(pts) - 1, sample).astype(int)]
            best, who = 9.0, None
            hits = []
            for n, m in meshes.items():
                if owner.get(n) == k:
                    continue
                d0 = _gap(lo, hi, m.lo, m.hi)
                if d0 > min(best, 0.25):
                    continue
                if k not in skip_float:
                    for p in pts:
                        r = m.bvh.find_nearest(Vector(p), best)
                        if r[0] is not None and r[3] < best:
                            best, who = r[3], n
                if d0 == 0.0 and k not in skip_pass and owner.get(n, n) not in skip_pass:
                    for mm in ms:
                        if _gap(mm.lo, mm.hi, m.lo, m.hi) == 0.0:
                            ov = mm.bvh.overlap(m.bvh)
                            if len(ov) >= 3:
                                hits.append((mm.o.name, n, len(ov)))
            if k not in skip_float and best > gap:
                floats.setdefault(k, []).append((fr, round(best, 3), who))
            for h in hits:
                passes.setdefault((h[0], h[1]), []).append((fr, h[2]))
    return floats, passes


def report(floats, passes, min_frames=1):
    print('== floating groups: %d' % len(floats))
    for k, rows in sorted(floats.items(), key=lambda kv: -max(r[1] for r in kv[1])):
        print('  %-24s frames %3d-%3d  worst %.3f  e.g. %s' % (k, rows[0][0], rows[-1][0], max(r[1] for r in rows), rows[len(rows) // 2]))
    print('== pass-through pairs: %d' % len(passes))
    for (a, b), rows in sorted(passes.items(), key=lambda kv: -sum(r[1] for r in kv[1])):
        if len(rows) >= min_frames:
            print('  %-20s x %-22s frames %3d-%3d  n=%d  peak %d' % (a, b, rows[0][0], rows[-1][0], len(rows), max(r[1] for r in rows)))


def jumps(sc, T_of_frame, frames, ratio=4.0, floor=0.02):
    """Discontinuities: objects whose per-frame travel spikes above `ratio` x their own
    median travel (and above `floor` metres). Evaluates the pose directly (not the bake)."""
    from . import bake
    prev, travel = None, {}
    for f in frames:
        objs, W, N, lift = bake.object_worlds(sc, T_of_frame(f))
        cur = {}
        for o, M in objs.items():
            pts = bake.support_points(o)
            if len(pts):
                cur[o.name] = pts @ np.array(M.to_3x3()).T + np.array(M.translation)
        if prev is not None:
            for n, p in cur.items():
                if n in prev:
                    travel.setdefault(n, []).append((f, float(np.linalg.norm(p - prev[n], axis=1).max())))
        prev = cur
    out = []
    for n, rows in travel.items():
        med = float(np.median([d for _, d in rows])) + 1e-4
        for f, d in rows:
            if d > floor and d > ratio * med:
                out.append((f, n, round(d, 3), round(med, 4)))
    return sorted(out)
