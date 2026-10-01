"""Numerical layout validation. Raster is 0.5 m, with both required actor radii."""

import json
import math
from array import array
from collections import defaultdict
from pathlib import Path

import numpy as np

from .geom.polygon import ccw

CELL = 0.5
XMIN, XMAX, ZMIN, ZMAX = -554, 554, -472, 590


def distance_segment(x, z, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    t = np.clip(((x - a[0]) * dx + (z - a[1]) * dz) / max(1e-12, dx * dx + dz * dz), 0, 1)
    return np.hypot(x - a[0] - t * dx, z - a[1] - t * dz)


def point_in_polygon(at, polygon):
    x, z = at
    p, inside = polygon, False
    for a, b in zip(p, p[1:] + p[:1]):
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def circle_hits_polygon(at, radius, polygon):
    if point_in_polygon(at, polygon):
        return True
    return any(float(distance_segment(at[0], at[1], a, b)) < radius - 0.01
               for a, b in zip(polygon, polygon[1:] + polygon[:1]))


class Raster:
    def __init__(self):
        self.x = np.arange(XMIN + CELL / 2, XMAX, CELL, dtype=np.float32)
        self.z = np.arange(ZMIN + CELL / 2, ZMAX, CELL, dtype=np.float32)
        self.height = np.full((len(self.z), len(self.x)), np.nan, dtype=np.float32)
        self.district = np.full(self.height.shape, -1, dtype=np.int8)
        self.disagreements = 0
        self.conflicts = []

    def bounds(self, xmin, xmax, zmin, zmax):
        x0, x1 = np.searchsorted(self.x, [xmin, xmax], side="left")
        z0, z1 = np.searchsorted(self.z, [zmin, zmax], side="left")
        return slice(int(z0), int(z1)), slice(int(x0), int(x1))

    def polygon(self, polygon):
        p = ccw(polygon)
        region = self.bounds(min(v[0] for v in p), max(v[0] for v in p), min(v[1] for v in p), max(v[1] for v in p))
        zs, xs = region
        x, z = self.x[xs][None, :], self.z[zs][:, None]
        mask = np.ones((len(self.z[zs]), len(self.x[xs])), dtype=bool)
        for a, b in zip(p, p[1:] + p[:1]):
            mask &= (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-3
        return region, mask, x, z

    def floor(self, primitive):
        region, mask, x, z = self.polygon(primitive["polygon"])
        if primitive["kind"] == "flat":
            value = primitive["y"]
        else:
            a, b = primitive["axis"]
            dx, dz = b[0] - a[0], b[1] - a[1]
            t = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)
            value = primitive["y"][0] + np.clip(t, 0, 1) * (primitive["y"][1] - primitive["y"][0])
        existing = self.height[region]
        disagreement = mask & np.isfinite(existing) & (np.abs(existing - value) > 0.041)
        self.disagreements += int(np.count_nonzero(disagreement))
        if np.any(disagreement) and len(self.conflicts) < 20:
            iz, ix = np.argwhere(disagreement)[0]
            self.conflicts.append({"primitive": primitive.get("id", str(primitive.get("district"))),
                                   "at": [float(x[0, ix]), float(z[iz, 0])],
                                   "before": float(existing[iz, ix]),
                                   "after": float(value if np.isscalar(value) else value[iz, ix])})
        np.copyto(existing, value, where=mask)
        self.district[region][mask] = primitive.get("district", -1)

    def blockers(self, plan, radius):
        blocked = ~np.isfinite(self.height)
        for s in plan["colliders"]["segments"]:
            r = s["r"] + radius
            a, b = (s["ax"], s["az"]), (s["bx"], s["bz"])
            region = self.bounds(min(a[0], b[0]) - r, max(a[0], b[0]) + r,
                                 min(a[1], b[1]) - r, max(a[1], b[1]) + r)
            zs, xs = region
            x, z = self.x[xs][None, :], self.z[zs][:, None]
            blocked[region] |= distance_segment(x, z, a, b) <= r
        for c in plan["colliders"]["circles"]:
            r = c["r"] + radius
            region = self.bounds(c["x"] - r, c["x"] + r, c["z"] - r, c["z"] + r)
            zs, xs = region
            blocked[region] |= np.hypot(self.x[xs][None, :] - c["x"], self.z[zs][:, None] - c["z"]) <= r
        return blocked

    def index(self, at):
        ix = int(np.argmin(abs(self.x - at[0])))
        iz = int(np.argmin(abs(self.z - at[1])))
        return iz, ix

    def flood(self, blocked, start=(0, 580)):
        rows, cols = self.height.shape
        start_z, start_x = self.index(start)
        flat = blocked.ravel().copy()
        heights = self.height.ravel()
        seed = start_z * cols + start_x
        if flat[seed]:
            raise ValueError("Main gate approach seed is blocked")
        queue, cursor = array("I", [seed]), 0
        flat[seed] = True
        while cursor < len(queue):
            i = queue[cursor]
            cursor += 1
            x = i % cols
            for j in (i - 1 if x else -1, i + 1 if x < cols - 1 else -1, i - cols, i + cols):
                if j < 0 or j >= len(flat) or flat[j] or abs(heights[i] - heights[j]) > 0.4:
                    continue
                flat[j] = True
                queue.append(j)
        reached = flat.reshape(blocked.shape) & ~blocked
        return reached


def plan_checks(plan, geometry=None):
    report = {"cell_m": CELL, "phase": plan.get("phase"), "errors": [], "warnings": [], "yards": [], "routes": {}}
    errors = report["errors"]
    if any(-2 in row for row in plan["nav"]):
        errors.append("Gate graph has unreachable districts")
    report["gate_count"] = len(plan["gates"])
    report["spawn_count"] = len(plan["spawns"])
    report["garrison"] = sum(d["garrison"] for d in plan["districts"])
    for d in plan["districts"]:
        yard, hits = d["yard"], []
        y = (0, 8, 16, 24)[d["tier"]]
        for m in plan["modules"]:
            if m["y"] <= y + 0.04 < m["y"] + m["size"][1]:
                for p in [m["footprint"]] + m.get("additional_footprints", []):
                    if circle_hits_polygon(yard["at"], yard["r"], p):
                        hits.append(f"{m['kind']} {m['index']}")
        for c in plan["colliders"]["circles"]:
            if math.dist(yard["at"], (c["x"], c["z"])) < yard["r"] + c["r"] - 0.01:
                hits.append(c["owner"])
        for s in plan["colliders"]["segments"]:
            if float(distance_segment(*yard["at"], (s["ax"], s["az"]), (s["bx"], s["bz"]))) < yard["r"] + s["r"] - 0.01:
                hits.append(s["owner"])
        entry = {"district": d["index"], "diameter": yard["r"] * 2, "obstructions": sorted(set(hits))}
        report["yards"].append(entry)
        if hits:
            errors.append(f"D{d['index']} yard obstructed by {', '.join(sorted(set(hits)))}")
    for g in plan["gates"]:
        minimum = 28 if g["id"] == "G-main" else 30 if g["kind"] == "crown" else 22
        if g["width"] < minimum or g["soffit"] < (22 if g["id"] in ("G-main", "R7-top") else 18):
            errors.append("Gate clearance " + g["id"])
    report["ramps"] = []
    for r in plan["ramps"]:
        rise, length = r["y"][1] - r["y"][0], math.dist(*r["axis"])
        steps = math.ceil(max(rise / 0.15, length / 1.05))
        report["ramps"].append({"id": r["id"], "grade": rise / length, "tread": length / steps,
                                "riser": rise / steps, "maximum_surface_error": rise / steps / 2})
        if rise / length > (0.10001 if r["id"] == "R7" else 1 / 7 + 1e-5):
            errors.append("Ramp exceeds grade " + r["id"])
    raster = Raster()
    for floor in plan["floor"]:
        raster.floor(floor)
    report["floor_overlap_disagreements"] = raster.disagreements
    report["floor_conflicts"] = raster.conflicts
    if raster.disagreements:
        errors.append(f"{raster.disagreements} floor cells disagree")
    for radius, name in ((1.9, "robot"), (0.62, "soldier")):
        blocked = raster.blockers(plan, radius)
        reached = raster.flood(blocked)
        missed = ~blocked & ~reached
        yards = [bool(reached[raster.index(d["yard"]["at"])]) for d in plan["districts"]]
        exits = [bool(reached[raster.index(s["exit"])]) for s in plan["spawns"]]
        report["routes"][name] = {"radius": radius, "open_cells": int(np.count_nonzero(~blocked)),
                                   "reachable_cells": int(np.count_nonzero(reached)),
                                   "unreachable_cells": int(np.count_nonzero(missed)), "yards_reachable": yards,
                                   "spawn_exits_reachable": exits, "unreachable_examples": []}
        if np.any(missed):
            zs, xs = np.nonzero(missed)
            report["routes"][name]["unreachable_examples"] = [[float(raster.x[xs[j]]), float(raster.z[zs[j]])]
                                                             for j in np.linspace(0, len(xs) - 1, min(30, len(xs)), dtype=int)]
            errors.append(f"{name}: {len(xs)} unreachable floor cells")
        if not all(yards):
            errors.append(f"{name}: yards unreachable " + str([i for i, ok in enumerate(yards) if not ok]))
        if not all(exits):
            errors.append(f"{name}: spawn exits unreachable " + str([i for i, ok in enumerate(exits) if not ok]))
        print("CTD_CHECK", name, report["routes"][name]["unreachable_cells"], flush=True)
    guard = raster.blockers(plan, 0.35)
    edges = 0
    for axis in (0, 1):
        heights = np.diff(raster.height, axis=axis)
        a = guard[:-1] if axis == 0 else guard[:, :-1]
        b = guard[1:] if axis == 0 else guard[:, 1:]
        edges += int(np.count_nonzero((np.abs(heights) > 0.4) & ~a & ~b))
    report["unguarded_height_edges"] = edges
    if edges:
        errors.append(f"{edges} unguarded height edges")
    report["colliders"] = {k: len(v) for k, v in plan["colliders"].items()}
    if report["colliders"]["segments"] > 4000 or report["colliders"]["circles"] > 600:
        errors.append("Collider budget exceeded")
    report["supports"] = support_checks(plan)
    if report["supports"]["floating_bases"]:
        errors.append("Unsupported structural bases: " + str(report["supports"]["floating_bases"]))
    if geometry:
        report["geometry"] = geometry
        for name, limit in (("mass", 1000000), ("artic", 1300000), ("detail", 1000000)):
            if geometry["by_class"].get(name, 0) > limit:
                errors.append(name + " triangle budget exceeded")
        for bucket, count in geometry["by_bucket"].items():
            limit = 120000 if bucket == "spire" else 350000
            if count > limit:
                errors.append(bucket + " bucket triangle budget exceeded")
        if geometry["meshes"] > 260:
            errors.append("Mesh budget exceeded")
    report["passed"] = not errors
    return report


def support_checks(plan):
    """Check load-bearing bases against the uncut terrace/chasm substrate."""
    def substrate(at):
        for outline, height in (("K", 24), ("C", 1), ("I", 16), ("M", 8)):
            if point_in_polygon(at, plan["outline"][outline]):
                return height
        return 0
    foundations = {f["attached"]: f for f in plan.get("foundations", [])}
    floating, checked = [], 0
    for m in plan["modules"]:
        f = foundations.get(f"module:{m['index']}")
        footprint, base = (f["footprint"], f["base"]) if f else (m["footprint"], m["y"])
        checked += 1
        low = min(substrate(at) for at in footprint)
        if base > low + 0.041:
            floating.append({"module": m["index"], "kind": m["kind"], "base": base, "substrate": low})
    for f in plan.get("foundations", []):
        checked += 1
        low = min(substrate(at) for at in f["footprint"])
        if f["base"] > low + 0.041:
            floating.append({"attached": f["attached"], "base": f["base"], "substrate": low})
    return {"checked_structural_bases": checked, "foundation_piers": len(plan.get("foundations", [])),
            "floating_bases": floating}


def geometry_stats(writer):
    report = writer.counts()
    report["zero_area_faces"] = 0
    report["below_ground_vertices"] = 0
    report["unused_vertices"] = 0
    report["maximum_height"] = 0
    for buffer in writer.buffers.values():
        vertices = np.asarray(buffer["vertices"], dtype=np.float64)
        faces = np.asarray(buffer["faces"], dtype=np.int32)
        if not len(faces):
            continue
        tri = vertices[faces]
        areas = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
        report["zero_area_faces"] += int(np.count_nonzero(areas < 1e-9))
        report["below_ground_vertices"] += int(np.count_nonzero(vertices[:, 1] < -1e-6))
        report["unused_vertices"] += len(vertices) - len(np.unique(faces))
        report["maximum_height"] = max(report["maximum_height"], float(vertices[:, 1].max()))
    return report


def main():
    root = Path(__file__).resolve().parents[1]
    plan = json.loads((root / "out" / "plan.json").read_text())
    path = root / "out" / "geometry_stats.json"
    geometry = json.loads(path.read_text()) if path.exists() else None
    report = plan_checks(plan, geometry)
    (root / "out" / "stats.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
