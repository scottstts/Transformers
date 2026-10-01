"""Whole-scene coplanarity audit using a NumPy AABB tree and exact polygon clipping.

Blender's triangle BVH overlap query ignores coincident coplanar triangles, so this
audit has its own broad phase. It examines faces within and between objects. Faces
that overlap only along an edge are valid. Two faces whose planes lie within 4 degrees of
each other are a finding wherever, over their overlapping area, the planes come within
15 mm of one another. That covers four kinds:

  coplanar         the planes coincide over the whole overlap (within 0.25 mm)
  near_coincident  parallel, offset by under 15 mm everywhere
  crossing         tilted, and the planes cross inside the overlap (a flicker wedge)
  wedge            tilted, and they close to under 15 mm at an edge of the overlap

The first two are resolved by clipping the covered face (compile.py) and gate the build. The last two
are a part leaning into another at a shallow angle: they are reported as advisory, never clipped. The input is a snapshot of the actual meshes.
"""

import json
import math
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

SEPARATION = 0.0149
EXACT = 0.00025
MIN_AREA = 0.0001
ANGLE_DOT = math.cos(math.radians(4.0))
CLIPPABLE = ("coplanar", "near_coincident")


def intersection_polygon(a, b):
    """Intersection of two triangles in their common plane, independent of winding."""
    a, b = [tuple(p) for p in a], [tuple(p) for p in b]
    sign = 1 if sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(b, b[1:] + b[:1])) > 0 else -1
    for p, q in zip(b, b[1:] + b[:1]):
        if not a:
            break
        def side(v):
            return sign * ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]))
        out = []
        for u, v in zip(a, a[1:] + a[:1]):
            su, sv = side(u), side(v)
            iu, iv = su >= -1e-10, sv >= -1e-10
            if iu:
                out.append(u)
            if iu != iv:
                t = su / (su - sv)
                out.append((u[0] + t * (v[0] - u[0]), u[1] + t * (v[1] - u[1])))
        a = out
    return a


def projected_overlap(a, b, normal):
    dominant = int(np.argmax(np.abs(normal)))
    axes = [i for i in range(3) if i != dominant]
    polygon = intersection_polygon(a[:, axes], b[:, axes])
    if len(polygon) < 3:
        return 0.0, None
    area = abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(polygon, polygon[1:] + polygon[:1]))) / 2
    area /= max(1e-8, abs(normal[dominant]))
    p = np.zeros(3, dtype=float)
    p[axes] = np.mean(polygon, axis=0)
    plane = float(np.dot(normal, a[0]))
    p[dominant] = (plane - sum(normal[i] * p[i] for i in axes)) / normal[dominant]
    return float(area), p.tolist()


def overlap_points(a, b, normal):
    """(area, corner points in the plane of a) of the overlap of two triangles, projected along a's normal."""
    dominant = int(np.argmax(np.abs(normal)))
    axes = [i for i in range(3) if i != dominant]
    polygon = intersection_polygon(a[:, axes], b[:, axes])
    if len(polygon) < 3:
        return 0.0, None
    area = abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(polygon, polygon[1:] + polygon[:1]))) / 2
    area /= max(1e-8, abs(normal[dominant]))
    points = np.zeros((len(polygon), 3), dtype=float)
    points[:, axes] = polygon
    plane = float(np.dot(normal, a[0]))
    points[:, dominant] = (plane - points[:, axes] @ normal[axes]) / normal[dominant]
    return float(area), points


class Audit:
    def __init__(self, triangles, objects, names, leaf_size=32, record_pairs=False, ignore=None):
        """`ignore` marks triangles buried under the ground surface: a pair of two buried triangles is skipped."""
        self.tri = np.asarray(triangles, dtype=np.float64)
        self.ignore = np.zeros(len(self.tri), bool) if ignore is None else np.asarray(ignore, bool)
        self.buried_pairs = 0
        self.objects = np.asarray(objects, dtype=np.int32)
        self.names = list(names)
        self.low, self.high = self.tri.min(axis=1), self.tri.max(axis=1)
        self.centres = (self.low + self.high) * 0.5
        cross = np.cross(self.tri[:, 1] - self.tri[:, 0], self.tri[:, 2] - self.tri[:, 0])
        lengths = np.linalg.norm(cross, axis=1)
        self.degenerate = int(np.count_nonzero(lengths < 1e-9))
        self.normals = cross / np.maximum(lengths[:, None], 1e-15)
        self.indices = np.arange(len(self.tri), dtype=np.int32)
        self.nodes, self.groups = [], {}
        self.candidates, self.findings, self.exact, self.near = 0, 0, 0, 0
        self.crossing, self.wedge = 0, 0
        self.leaf_size = leaf_size
        self.record_pairs, self.pairs = record_pairs, []

    def build(self, start, end):
        ids = self.indices[start:end]
        low, high = self.low[ids].min(axis=0), self.high[ids].max(axis=0)
        index = len(self.nodes)
        self.nodes.append(None)
        if end - start <= self.leaf_size:
            self.nodes[index] = (low, high, start, end, -1, -1)
            return index
        axis = int(np.argmax(np.ptp(self.centres[ids], axis=0)))
        mid = (end - start) // 2
        order = np.argpartition(self.centres[ids, axis], mid)
        self.indices[start:end] = ids[order]
        left = self.build(start, start + mid)
        right = self.build(start + mid, end)
        self.nodes[index] = (low, high, start, end, left, right)
        return index

    def narrow(self, na, nb, same):
        aa, bb = self.indices[na[2]:na[3]], self.indices[nb[2]:nb[3]]
        lower = np.maximum(self.low[aa, None], self.low[bb][None])
        upper = np.minimum(self.high[aa, None], self.high[bb][None])
        valid = np.all(upper - lower >= -SEPARATION - 0.00005, axis=2)
        valid &= np.count_nonzero(upper - lower > 1e-6, axis=2) >= 2
        dot = self.normals[aa] @ self.normals[bb].T
        valid &= np.abs(dot) >= ANGLE_DOT
        if same:
            valid &= np.triu(np.ones(valid.shape, bool), 1)
        ia, ib = np.nonzero(valid)
        if not len(ia):
            return
        a, b = aa[ia], bb[ib]
        buried = self.ignore[a] & self.ignore[b]
        self.buried_pairs += int(buried.sum())
        a, b = a[~buried], b[~buried]
        self.candidates += len(a)
        # Signed distance of each triangle's corners to the other's plane. A pair whose corners all lie
        # more than 15 mm to one side of the other plane can never come within 15 mm over the overlap.
        beyond_b = np.einsum("ij,ikj->ik", self.normals[a], self.tri[b] - self.tri[a, 0][:, None])
        beyond_a = np.einsum("ij,ikj->ik", self.normals[b], self.tri[a] - self.tri[b, 0][:, None])
        apart = ((beyond_b > SEPARATION).all(1) | (beyond_b < -SEPARATION).all(1)
                 | (beyond_a > SEPARATION).all(1) | (beyond_a < -SEPARATION).all(1))
        for ai, bi in zip(a[~apart], b[~apart]):
            area, points = overlap_points(self.tri[ai], self.tri[bi], self.normals[ai])
            if area <= MIN_AREA:
                continue
            # Separation field over the overlap: the distance of its corners to the plane of b.
            field = (points - self.tri[bi, 0]) @ self.normals[bi]
            crossing = bool(field.min() < -1e-9 and field.max() > 1e-9)
            deviation = 0.0 if crossing else float(np.abs(field).min())
            far = float(np.abs(field).max())
            if deviation > SEPARATION:
                continue
            if far <= EXACT:
                kind = "coplanar"
            elif far <= SEPARATION:
                kind = "near_coincident"
            else:
                kind = "crossing" if crossing else "wedge"
            at = points.mean(axis=0).tolist()
            self.findings += 1
            if self.record_pairs:
                self.pairs.append((int(ai), int(bi), far if kind in CLIPPABLE else deviation, kind, area))
            self.exact += int(kind == "coplanar")
            self.near += int(kind == "near_coincident")
            self.crossing += int(kind == "crossing")
            self.wedge += int(kind == "wedge")
            names = sorted((self.names[self.objects[ai]], self.names[self.objects[bi]]))
            key = (names[0], names[1], kind)
            group = self.groups.setdefault(key, {"objects": names, "kind": kind, "count": 0,
                                                "overlap_area_m2": 0.0, "examples": []})
            group["count"] += 1
            group["overlap_area_m2"] += area
            if len(group["examples"]) < 16:
                group["examples"].append({"triangles": [int(ai), int(bi)], "at": at,
                                           "separation_m": far if kind in CLIPPABLE else deviation, "area_m2": area,
                                           "angle_deg": round(math.degrees(math.acos(min(1.0, abs(float(np.dot(self.normals[ai], self.normals[bi])))))), 2),
                                           "opposed": bool(np.dot(self.normals[ai], self.normals[bi]) < 0)})

    def run(self, progress=True):
        started = time.monotonic()
        if len(self.tri) == 0:
            return {"passed": True, "triangles": 0, "findings": 0, "groups": []}
        root = self.build(0, len(self.tri))
        if progress:
            print("CTD_AUDIT tree", len(self.tri), len(self.nodes), flush=True)
        stack, visits, last = [(root, root)], 0, time.monotonic()
        while stack:
            ia, ib = stack.pop()
            a, b = self.nodes[ia], self.nodes[ib]
            visits += 1
            if np.any(a[1] + SEPARATION < b[0]) or np.any(b[1] + SEPARATION < a[0]):
                continue
            if a[4] < 0 and b[4] < 0:
                self.narrow(a, b, ia == ib)
            elif ia == ib:
                stack.extend(((a[4], a[4]), (a[4], a[5]), (a[5], a[5])))
            elif b[4] < 0 or a[4] >= 0 and a[3] - a[2] >= b[3] - b[2]:
                stack.extend(((a[4], ib), (a[5], ib)))
            else:
                stack.extend(((ia, b[4]), (ia, b[5])))
            if progress and time.monotonic() - last > 15:
                print("CTD_AUDIT scanning", visits, "candidates", self.candidates, "findings", self.findings, flush=True)
                last = time.monotonic()
        groups = sorted(self.groups.values(), key=lambda g: g["overlap_area_m2"], reverse=True)
        # Coincident faces gate the build. Shallow-angle pairs (crossing, wedge) are advisory: most are
        # buried or hairline and harmless, so they are counted and listed but do not fail the audit.
        return {"passed": self.exact + self.near == 0 and self.degenerate == 0,
                "advisory_shallow_pairs": self.crossing + self.wedge,
                "meshes": len(self.names), "triangles": len(self.tri), "zero_area_faces": self.degenerate,
                "findings": self.findings, "coplanar_pairs": self.exact, "near_coincident_pairs": self.near,
                "crossing_pairs": self.crossing, "wedge_pairs": self.wedge,
                "buried_pairs_excluded": self.buried_pairs,
                "separation_threshold_m": SEPARATION, "minimum_overlap_area_m2": MIN_AREA,
                "broad_phase_candidates": self.candidates, "seconds": round(time.monotonic() - started, 2),
                "groups": groups}


def tilted(a, degrees, pivot_z, lift=0.0):
    """Triangle a turned about the x axis through z = pivot_z, then lifted along y."""
    angle = math.radians(degrees)
    out = a.copy()
    dz = a[:, 2] - pivot_z
    out[:, 1] = a[:, 1] + dz * math.sin(angle) + lift
    out[:, 2] = pivot_z + dz * math.cos(angle)
    return out


def verify_auditor():
    """Fixtures: the exact coplanar case the native BVH misses, and the shallow-angle cases a
    parallel-only test misses (a vertical plate leaning into a battered wall)."""
    a = np.array([[0, 0, 0], [4, 0, 0], [0, 0, 4]], float)
    cases = (
        ("identical", a.copy(), 1, "coplanar"), ("opposed", a[::-1], 1, "coplanar"),
        ("one_mm", a + (0, 0.001, 0), 1, "near_coincident"),
        ("twenty_mm", a + (0, 0.020, 0), 0, None),
        ("edge_only", np.array([[4, 0, 0], [0, 0, 4], [4, 0, 4]], float), 0, None),
        ("partial_overlap", a + (0.2, 0, 0.2), 1, "coplanar"),
        ("one_degree_crossing", tilted(a, 1.0, 1.0), 1, "crossing"),
        ("one_degree_wedge", tilted(a, 1.0, 0.0), 1, "wedge"),
        ("one_degree_clear", tilted(a, 1.0, 0.0, lift=0.03), 0, None),
        ("thirty_degrees", tilted(a, 30.0, 1.0), 0, None))
    for name, b, expected, kind in cases:
        audit = Audit(np.array([a, b]), [0, 1], ["a", "b"])
        report = audit.run(False)
        found = {g["kind"] for g in report["groups"]}
        if report["findings"] != expected or (kind and found != {kind}):
            raise AssertionError(f"Audit fixture {name}: {report['findings']} {found} != {expected} {kind}")
    return len(cases)
