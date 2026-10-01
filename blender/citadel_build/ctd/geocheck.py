"""Geometry against the plan (brief §11.3, §11.4), on the compiled triangles.

floor_agreement: every upward paving, deck and sand face lies within tolerance of the plan's floor
primitive under it (paving tops ±0.04 m; a cordonata tread ±(riser / 2) of the plane through its
step midpoints).
overhead: no geometry stands over open walkable cells (clear of every collider by an eave margin),
except across gate passages at or above their soffit, and inside spawn bays.
"""

import math

import numpy as np

from .checks import CELL, XMAX, XMIN, ZMAX, ZMIN, Raster

ROWS, COLS = int(math.ceil((ZMAX - ZMIN) / CELL)), int(math.ceil((XMAX - XMIN) / CELL))

FLOOR_TOLERANCE = 0.045
RAMP_TOLERANCE = 0.085
EAVE = 2.0
MIN_CLEARANCE = 1.0
SURFACE_SLOTS = {"paving", "deck", "sand"}


def buried_mask(plan, tri, raster=None, margin=0.004):
    """Triangles wholly beneath the ground surface: the plan's floor is higher than the triangle at its
    centroid cell and at all eight neighbours (so a wall standing on a floor's edge is never buried)."""
    raster = raster or raster_floor(plan)[0]
    padded = np.pad(raster.height, 1, constant_values=np.nan)
    centre = tri.mean(axis=1)
    iz, ix = cell_index(centre[:, 0], centre[:, 2])
    inside = (iz >= 0) & (iz < ROWS) & (ix >= 0) & (ix < COLS)
    iz, ix = np.clip(iz, 0, ROWS - 1) + 1, np.clip(ix, 0, COLS - 1) + 1
    lowest = np.full(len(tri), np.inf)
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            lowest = np.minimum(lowest, padded[iz + dz, ix + dx])
    lowest = np.where(np.isfinite(lowest), lowest, -np.inf)
    return inside & (tri[:, :, 1].max(axis=1) < lowest - margin)


def triangle_arrays(writer):
    """(triangles, owner keys) for every mesh buffer, as float arrays."""
    tris, owners, keys = [], [], []
    for key, buf in sorted(writer.buffers.items()):
        faces = np.asarray(buf["faces"], np.int64).reshape(-1, 3)
        if not len(faces):
            continue
        verts = np.asarray(buf["vertices"], float).reshape(-1, 3)
        tris.append(verts[faces])
        owners.append(np.full(len(faces), len(keys), np.int32))
        keys.append(".".join(key))
    return np.concatenate(tris), np.concatenate(owners), keys


def face_normals(tri):
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    length = np.linalg.norm(cross, axis=1)
    return cross / np.maximum(length[:, None], 1e-15), length / 2


def raster_floor(plan):
    raster = Raster()
    ramp_cells = np.zeros(raster.height.shape, bool)
    for floor in plan["floor"]:
        raster.floor(floor)
        if floor["kind"] == "ramp":
            region, mask, _, _ = raster.polygon(floor["polygon"])
            ramp_cells[region] |= mask
    return raster, ramp_cells


def cell_index(x, z):
    return np.floor((z - ZMIN) / CELL).astype(np.int64), np.floor((x - XMIN) / CELL).astype(np.int64)


def inside_cells(tri):
    """Cell indices (iz, ix) whose centre lies inside one triangle, by barycentric test on its bounding box."""
    x0, z0 = tri[:, 0].min(), tri[:, 2].min()
    x1, z1 = tri[:, 0].max(), tri[:, 2].max()
    iz0, ix0 = cell_index(np.array([x0]), np.array([z0]))
    iz1, ix1 = cell_index(np.array([x1]), np.array([z1]))
    lo_z, hi_z = max(int(iz0[0]), 0), min(int(iz1[0]), ROWS - 1)
    lo_x, hi_x = max(int(ix0[0]), 0), min(int(ix1[0]), COLS - 1)
    if lo_z > hi_z or lo_x > hi_x:
        return np.zeros(0, np.int64), np.zeros(0, np.int64)
    izs, ixs = np.meshgrid(np.arange(lo_z, hi_z + 1), np.arange(lo_x, hi_x + 1), indexing="ij")
    cx, cz = XMIN + (ixs + 0.5) * CELL, ZMIN + (izs + 0.5) * CELL
    (ax, az), (bx, bz), (px, pz) = (tri[0, 0], tri[0, 2]), (tri[1, 0], tri[1, 2]), (tri[2, 0], tri[2, 2])
    den = (bz - pz) * (ax - px) + (px - bx) * (az - pz)
    if abs(den) < 1e-12:
        return izs[:0], ixs[:0]
    u = ((bz - pz) * (cx - px) + (px - bx) * (cz - pz)) / den
    v = ((pz - az) * (cx - px) + (ax - px) * (cz - pz)) / den
    hit = (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9)
    return izs[hit], ixs[hit]


def floor_agreement(plan, writer, raster=None, ramp_cells=None, arrays=None):
    raster, ramp_cells = (raster, ramp_cells) if raster is not None else raster_floor(plan)
    tri, owners, keys = arrays or triangle_arrays(writer)
    normal, area = face_normals(tri)
    surface = np.array([k.split(".")[1] in SURFACE_SLOTS and k.endswith(".mass") for k in keys])[owners]
    # Chamfers and joint beds are not walking surfaces: only broad, level top faces are compared.
    candidates = np.nonzero(surface & (normal[:, 1] > 0.9995) & (area > 0.05))[0]
    checked = violations = 0
    worst = 0.0
    examples = []
    for i in candidates:
        iz, ix = inside_cells(tri[i])
        if not len(iz):
            continue
        height = raster.height[iz, ix]
        known = np.isfinite(height)
        if not known.any():
            continue
        deviation = np.abs(height[known] - tri[i, :, 1].mean())
        limit = np.where(ramp_cells[iz, ix][known], RAMP_TOLERANCE, FLOOR_TOLERANCE)
        bad = deviation > limit
        checked += int(known.sum())
        violations += int(bad.sum())
        worst = max(worst, float(deviation.max()))
        if bad.any() and len(examples) < 12:
            j = int(np.argmax(bad))
            cell = (iz[known][j], ix[known][j])
            examples.append({"at": [round(float(XMIN + (cell[1] + 0.5) * CELL), 2), round(float(ZMIN + (cell[0] + 0.5) * CELL), 2)],
                             "mesh": keys[owners[i]], "face_y": round(float(tri[i, :, 1].mean()), 3),
                             "plan_y": round(float(height[known][j]), 3)})
    return {"faces": int(len(candidates)), "cells_checked": checked, "violations": violations,
            "worst_deviation_m": round(worst, 4), "examples": examples}


def passage_zones(plan):
    """Rectangles (centre, along, half_length, half_width, floor, soffit) where overhead structure is allowed."""
    zones = []
    for g in plan["gates"]:
        n = g["out"]
        if g["id"] == "G-main":
            centre, half_length = (g["at"][0] - n[0] * 40, g["at"][1] - n[1] * 40), 44
        elif g["kind"] == "outer":
            centre, half_length = (g["at"][0] - n[0] * 12, g["at"][1] - n[1] * 12), 30
        else:
            centre, half_length = tuple(g["at"]), 14
        zones.append((centre, n, half_length, g["width"] / 2 + 2, g["y"], g["soffit"]))
    return zones


def overhead(plan, writer, raster=None, arrays=None):
    raster = raster or raster_floor(plan)[0]
    tri, owners, keys = arrays or triangle_arrays(writer)
    clear = np.isfinite(raster.height) & ~raster.blockers(plan, EAVE)
    for floor in plan["floor"]:
        if str(floor.get("id", "")).startswith("bay"):
            region, mask, _, _ = raster.polygon(floor["polygon"])
            clear[region] &= ~mask
    normal, _ = face_normals(tri)
    low, high = tri.min(axis=1), tri.max(axis=1)
    tilted = np.abs(normal[:, 1]) >= 0.2
    iz0, ix0 = cell_index(low[:, 0], low[:, 2])
    iz1, ix1 = cell_index(high[:, 0], high[:, 2])
    rows, cols = clear.shape
    iz0, iz1 = np.clip(iz0, 0, rows - 1), np.clip(iz1, 0, rows - 1)
    ix0, ix1 = np.clip(ix0, 0, cols - 1), np.clip(ix1, 0, cols - 1)
    small = tilted & (iz1 - iz0 <= 1) & (ix1 - ix0 <= 1)
    floor_at = np.where(np.isfinite(raster.height[iz0, ix0]), raster.height[iz0, ix0], 0.0)
    above = low[:, 1] > floor_at + MIN_CLEARANCE
    touches = clear[iz0, ix0] | clear[iz1, ix0] | clear[iz0, ix1] | clear[iz1, ix1]
    hits = {}
    for i in np.nonzero(small & above & touches)[0]:
        for iz, ix in {(iz0[i], ix0[i]), (iz1[i], ix1[i])}:
            if clear[iz, ix]:
                hits.setdefault((int(iz), int(ix)), i)
    for i in np.nonzero(tilted & ~small & (high[:, 1] > MIN_CLEARANCE))[0]:
        izs, ixs = inside_cells(tri[i])
        for iz, ix in zip(izs, ixs):
            if 0 <= iz < rows and 0 <= ix < cols and clear[iz, ix] and low[i, 1] > raster.height[iz, ix] + MIN_CLEARANCE:
                hits.setdefault((int(iz), int(ix)), i)
    zones = passage_zones(plan)
    violations, allowed = [], 0
    for (iz, ix), i in hits.items():
        x, z = XMIN + (ix + 0.5) * CELL, ZMIN + (iz + 0.5) * CELL
        floor, y = float(raster.height[iz, ix]), float(low[i, 1])
        permitted = False
        for centre, n, half_length, half_width, base, soffit in zones:
            along = (x - centre[0]) * n[0] + (z - centre[1]) * n[1]
            across = -(x - centre[0]) * n[1] + (z - centre[1]) * n[0]
            if abs(along) <= half_length and abs(across) <= half_width and y >= base + soffit - 0.5:
                permitted = True
                break
        allowed += permitted
        if not permitted:
            violations.append({"at": [round(x, 1), round(z, 1)], "height_above_floor": round(y - floor, 1),
                               "mesh": keys[owners[i]]})
    by_mesh = {}
    for v in violations:
        by_mesh[v["mesh"]] = by_mesh.get(v["mesh"], 0) + 1
    violations.sort(key=lambda v: v["at"])
    return {"clear_cells": int(clear.sum()), "overhead_cells": len(hits), "allowed_in_passages": int(allowed),
            "violations": len(violations), "by_mesh": dict(sorted(by_mesh.items(), key=lambda p: -p[1])[:12]),
            "examples": violations[:20]}
