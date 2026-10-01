"""Exposed-surface mesh compiler. Resolve interfaces by polygon subtraction.

This is a geometry operation in the pure toolkit, never a Blender boolean or a
global offset. The complete original face normal field is interpolated onto every
new boundary. At touching solid joints both buried caps disappear. At overlapping
skins the exterior skin owns the area and the covered host surface is removed.
"""

import hashlib
import json
import math
from pathlib import Path

import numpy as np

from . import geocheck
from .audit import CLIPPABLE, Audit, EXACT, intersection_polygon
from .geom import Writer
from .geom.polygon import area, difference


def source_fingerprint():
    root = Path(__file__).resolve().parents[1]
    digest = hashlib.sha256()
    digest.update(b"exposed-float32-v1")
    for path in sorted((root / "ctd").rglob("*.py")):
        if path.name in {"audit.py", "compile.py", "checks.py", "blender_io.py", "debug.py", "kit_sheet.py"}:
            continue
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def blender_precision(writer):
    """Audit the coordinates Blender actually stores, with collapsed faces removed."""
    result = Writer()
    for key, source in sorted(writer.buffers.items()):
        vertices = np.asarray(source["vertices"], np.float32).astype(np.float64)
        if not len(source["faces"]):
            continue
        vertices, remap = np.unique(vertices, axis=0, return_inverse=True)
        faces = remap[np.asarray(source["faces"], np.int32)]
        tri = vertices[faces]
        keep = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1) >= 1e-9
        faces = faces[keep]
        if not len(faces):
            continue
        used, compact = np.unique(faces, return_inverse=True)
        target = result.buffers[key]
        target["vertices"] = vertices[used]
        target["faces"] = compact.reshape(-1, 3).astype(np.int32)
        target["normals"] = np.asarray(source["normals"], np.float32).reshape(-1, 3, 3)[keep].reshape(-1, 3)
    return result


def flatten(writer):
    triangles, normals, owners, keys, ranges = [], [], [], [], []
    offset = 0
    for key, buf in sorted(writer.buffers.items()):
        if not len(buf["faces"]):
            continue
        verts, faces = np.asarray(buf["vertices"], float), np.asarray(buf["faces"], np.int32)
        triangles.append(verts[faces])
        normals.append(np.asarray(buf["normals"], float).reshape(-1, 3, 3))
        owners.append(np.full(len(faces), len(keys), np.int32))
        keys.append(key)
        ranges.append((offset, offset + len(faces)))
        offset += len(faces)
    return np.concatenate(triangles), np.concatenate(normals), np.concatenate(owners), keys, ranges


def subtract_triangle(triangle, normals, holes):
    normal = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
    normal /= np.linalg.norm(normal)
    dominant = int(np.argmax(np.abs(normal)))
    axes = [i for i in range(3) if i != dominant]
    original = triangle[:, axes]
    pieces = [original.tolist()]
    # Large interfaces first reduce the number of intermediate fragments.
    projected = sorted([hole[:, axes].tolist() for hole in holes], key=lambda p: abs(area(p)), reverse=True)
    for hole in projected:
        # Fragments under 10 mm2 are float32 noise, not surface: they would only be flipped slivers.
        pieces = [q for p in pieces for q in difference(p, hole) if abs(area(q)) > 1e-5]
        if not pieces:
            break
    plane = float(np.dot(normal, triangle[0]))
    matrix = np.column_stack((original[1] - original[0], original[2] - original[0]))
    inverse = np.linalg.inv(matrix)
    result = []
    for piece in pieces:
        vertices, nn = [], []
        for p in piece:
            xyz = np.zeros(3, float)
            xyz[axes] = p
            xyz[dominant] = (plane - sum(normal[i] * xyz[i] for i in axes)) / normal[dominant]
            b, c = inverse @ (np.array(p) - original[0])
            n = (1 - b - c) * normals[0] + b * normals[1] + c * normals[2]
            n /= max(1e-12, np.linalg.norm(n))
            vertices.append(tuple(xyz))
            nn.append(tuple(n))
        # difference() returns CCW in projected space; restore the original 3D winding.
        if area(original.tolist()) < 0:
            vertices, nn = vertices[::-1], nn[::-1]
        result.append((vertices, nn))
    return result


def exposed(writer, pass_index=1, plan=None):
    writer = blender_precision(writer)
    triangles, normals, owners, keys, ranges = flatten(writer)
    names = [".".join(k) for k in keys]
    # Pairs of faces wholly beneath the ground surface are outside the audit.
    ignore = geocheck.buried_mask(plan, triangles) if plan is not None else None
    audit = Audit(triangles, owners, names, record_pairs=True, ignore=ignore)
    report = audit.run()
    report["pass"] = pass_index
    if report["passed"]:
        return writer, report
    holes = {}
    priorities = {"mass": 0, "artic": 1, "detail": 2}
    swaps = {}
    for ai, bi, deviation, kind, area in audit.pairs:
        if kind not in CLIPPABLE:
            # A part leaning into another cannot be repaired by clipping: it is reported, not resolved.
            continue
        a, b, na, nb = triangles[ai], triangles[bi], audit.normals[ai], audit.normals[bi]
        dot = float(np.dot(na, nb))
        separation = float(np.dot(na, b.mean(axis=0) - a.mean(axis=0)))
        if dot < 0:
            # Two touching/near-touching faces are an internal fabrication interface.
            holes.setdefault(ai, []).append(b)
            holes.setdefault(bi, []).append(a)
        elif abs(separation) > EXACT:
            covered, cover = (ai, bi) if separation > 0 else (bi, ai)
            holes.setdefault(covered, []).append(triangles[cover])
        else:
            # Exact coincident exterior skins have one deterministic owner.
            pa = (priorities[keys[owners[ai]][2]], ai)
            pb = (priorities[keys[owners[bi]][2]], bi)
            covered, cover = (ai, bi) if pa < pb else (bi, ai)
            holes.setdefault(covered, []).append(triangles[cover])
            if keys[owners[ai]][1] != keys[owners[bi]][1] and area >= 0.01:
                # Two different materials on one plane: the owner's material replaces the other's. That is
                # a modelling decision made by a tie-break, so it is recorded for review.
                name = (names[owners[cover]], names[owners[covered]])
                swap = swaps.setdefault(name, {"owner": name[0], "covered": name[1], "pairs": 0, "area_m2": 0.0,
                                               "at": [round(float(v), 1) for v in triangles[cover].mean(axis=0)]})
                swap["pairs"] += 1
                swap["area_m2"] = round(swap["area_m2"] + area, 3)
    result = Writer()
    altered = 0
    for key, (start, end) in zip(keys, ranges):
        source, target = writer.buffers[key], result.buffers[key]
        target["vertices"] = list(source["vertices"])
        target["lookup"] = {tuple(round(float(v), 7) for v in p): j for j, p in enumerate(target["vertices"])}
        for global_id in range(start, end):
            local_id = global_id - start
            if global_id not in holes:
                target["faces"].append(tuple(source["faces"][local_id]))
                target["normals"].extend(source["normals"][local_id * 3:local_id * 3 + 3])
            else:
                altered += 1
                for vertices, nn in subtract_triangle(triangles[global_id], normals[global_id], holes[global_id]):
                    result.polygon(vertices, key[1], key[2], key[0], nn)
        # Welded positions that belonged only to removed internal caps are discarded.
        if target["faces"]:
            used = np.unique(np.asarray(target["faces"], np.int32))
            remap = np.full(len(target["vertices"]), -1, np.int32)
            remap[used] = np.arange(len(used))
            target["vertices"] = [target["vertices"][i] for i in used]
            target["faces"] = remap[np.asarray(target["faces"], np.int32)].tolist()
            target.pop("lookup", None)
        else:
            del result.buffers[key]
    report["altered_faces"] = altered
    ranked = sorted(swaps.values(), key=lambda s: -s["area_m2"])
    report["material_swaps"] = {"pairs": sum(s["pairs"] for s in ranked),
                                "area_m2": round(sum(s["area_m2"] for s in ranked), 1), "top": ranked[:25]}
    report["result_triangles"] = result.counts()["triangles"]
    print("CTD_COMPILE clipped", altered, "faces; triangles", report["result_triangles"], flush=True)
    return result, report


def save_writer(writer, path):
    data = {"keys": np.asarray(list(sorted(writer.buffers)), dtype=str)}
    for i, key in enumerate(sorted(writer.buffers)):
        b = writer.buffers[key]
        data[f"v{i}"] = np.asarray(b["vertices"], np.float64)
        data[f"f{i}"] = np.asarray(b["faces"], np.int32)
        data[f"n{i}"] = np.asarray(b["normals"], np.float32)
    np.savez_compressed(path, **data)


def load_writer(path):
    data, writer = np.load(path, allow_pickle=False), Writer()
    for i, key in enumerate(data["keys"]):
        b = writer.buffers[tuple(key)]
        b["vertices"], b["faces"], b["normals"] = data[f"v{i}"], data[f"f{i}"], data[f"n{i}"]
    return writer
