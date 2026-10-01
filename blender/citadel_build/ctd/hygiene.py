"""Mesh hygiene on writer buffers: flipped faces, over-shared edges, loose and degenerate data.

Every polygon carries the normal it was authored with. A triangle whose winding disagrees with its
authored normals is flipped: Blender would shade it inverted and a back-face-culled game would drop it.
"""

import numpy as np

DEGENERATE = 1e-9
SLIVER = 1e-4  # m2: a flipped face smaller than 1 cm2 is float32 noise on a clipped edge, not a defect


def arrays(buffer):
    vertices = np.asarray(buffer["vertices"], float).reshape(-1, 3)
    faces = np.asarray(buffer["faces"], np.int64).reshape(-1, 3)
    normals = np.asarray(buffer["normals"], float).reshape(-1, 3, 3)
    return vertices, faces, normals


def check_buffer(buffer):
    vertices, faces, normals = arrays(buffer)
    out = {"triangles": len(faces), "zero_area": 0, "flipped": 0, "flipped_slivers": 0, "over_shared_edges": 0,
           "loose_vertices": 0, "below_ground": int(np.count_nonzero(vertices[:, 1] < -1e-6)),
           "flipped_examples": []}
    if not len(faces):
        return out
    tri = vertices[faces]
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    length = np.linalg.norm(cross, axis=1)
    sound = length >= DEGENERATE
    out["zero_area"] = int(np.count_nonzero(~sound))
    geometric = cross[sound] / length[sound, None]
    authored = normals[sound].mean(axis=1)
    flipped = np.einsum("ij,ij->i", geometric, authored) < 0
    small = length[sound] / 2 < SLIVER
    out["flipped_slivers"] = int(np.count_nonzero(flipped & small))
    flipped &= ~small
    out["flipped"] = int(np.count_nonzero(flipped))
    if out["flipped"]:
        picks = np.nonzero(sound)[0][flipped][:3]
        out["flipped_examples"] = [tri[i].mean(axis=0).round(2).tolist() for i in picks]
    edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    keys = edges[:, 0] * max(1, len(vertices)) + edges[:, 1]
    _, counts = np.unique(keys, return_counts=True)
    out["over_shared_edges"] = int(np.count_nonzero(counts > 2))
    out["loose_vertices"] = int(len(vertices) - len(np.unique(faces)))
    return out


def check(writer):
    """Aggregate over every mesh; `by_mesh` lists only meshes with a defect."""
    total = {"triangles": 0, "zero_area": 0, "flipped": 0, "flipped_slivers": 0, "over_shared_edges": 0,
             "loose_vertices": 0, "below_ground": 0}
    by_mesh = {}
    for key, buffer in sorted(writer.buffers.items()):
        result = check_buffer(buffer)
        for name in total:
            total[name] += result[name]
        defects = {k: result[k] for k in ("zero_area", "flipped", "over_shared_edges", "loose_vertices", "below_ground")
                   if result[k]}
        if defects:
            if result["flipped_examples"]:
                defects["flipped_examples"] = result["flipped_examples"]
            by_mesh[".".join(key)] = defects
    total["by_mesh"] = by_mesh
    return total
