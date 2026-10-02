"""Frequency-four geodesic shells with cut-in service vestibules and shared ribs."""

import math

from ..geom.detail import ribbon
from .buildings import clad
from .shells import block, local_face, point


def normalized(v):
    length = math.sqrt(sum(x * x for x in v))
    return tuple(x / length for x in v)


def geosphere():
    phi = (1 + math.sqrt(5)) / 2
    vertices = [normalized(v) for v in ((-1, phi, 0), (1, phi, 0), (-1, -phi, 0), (1, -phi, 0),
                 (0, -1, phi), (0, 1, phi), (0, -1, -phi), (0, 1, -phi),
                 (phi, 0, -1), (phi, 0, 1), (-phi, 0, -1), (-phi, 0, 1))]
    faces = [(0,11,5),(0,5,1),(0,1,7),(0,7,10),(0,10,11),(1,5,9),(5,11,4),(11,10,2),
             (10,7,6),(7,1,8),(3,9,4),(3,4,2),(3,2,6),(3,6,8),(3,8,9),(4,9,5),
             (2,4,11),(6,2,10),(8,6,7),(9,8,1)]
    for _ in range(2):
        mids, out = {}, []
        def midpoint(a, b):
            key = tuple(sorted((a, b)))
            if key not in mids:
                mids[key] = len(vertices)
                vertices.append(normalized(tuple((vertices[a][i] + vertices[b][i]) / 2 for i in range(3))))
            return mids[key]
        for a, b, c in faces:
            ab, bc, ca = midpoint(a, b), midpoint(b, c), midpoint(c, a)
            out.extend(((a,ab,ca),(b,bc,ab),(c,ca,bc),(ab,bc,ca)))
        faces = out
    return vertices, faces


def clip(poly, axis, limit, sign=1):
    out = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        sa, sb = (a[axis] - limit) * sign, (b[axis] - limit) * sign
        ai, bi = sa >= -1e-8, sb >= -1e-8
        if ai:
            out.append(a)
        if ai != bi:
            t = sa / (sa - sb)
            out.append(tuple(a[i] + t * (b[i] - a[i]) for i in range(3)))
    clean = []
    for p in out:
        if not clean or math.dist(clean[-1], p) > 1e-7:
            clean.append(p)
    if len(clean) > 1 and math.dist(clean[0], clean[-1]) < 1e-7:
        clean.pop()
    return clean if len(clean) >= 3 else []


def remove_service(poly, radius, floor):
    planes = [(0, -6, 1), (0, 6, -1), (1, floor, 1), (1, floor + 12, -1),
              (2, radius - 8, 1), (2, radius + 0.1, -1)]
    if any(all((v[axis] - limit) * sign <= -1e-8 for v in poly) for axis, limit, sign in planes):
        return [poly]
    fragments, rem = [], poly
    for axis, limit, sign in planes:
        if not rem:
            break
        outside = clip(rem, axis, limit, -sign)
        if outside:
            fragments.append(outside)
        rem = clip(rem, axis, limit, sign)
    return fragments


def build(w, m):
    radius, height, floor = m["size"][0] / 2, m["size"][1] - 2, m["y"]
    vertices, faces = geosphere()
    edges, base_edges = set(), set()
    for face in faces:
        poly = clip([vertices[i] for i in face], 1, 0)
        if not poly:
            continue
        scaled = [(x * radius, floor + 2 + y * height, z * radius) for x, y, z in poly]
        fragments = remove_service(scaled, radius, floor) if m["bays"] else [scaled]
        for p in fragments:
            normals = [normalized((x / (radius * radius), (y - floor - 2) / (height * height), z / (radius * radius))) for x, y, z in p]
            local_face(w, m, p, "glassGreen", normals=normals)
            for a, b in zip(p, p[1:] + p[:1]):
                key = tuple(sorted((tuple(round(v, 6) for v in a), tuple(round(v, 6) for v in b))))
                if math.dist(a, b) > 1e-6:
                    edges.add(key)
        for a, b in zip(scaled, scaled[1:] + scaled[:1]):
            if abs(a[1] - floor - 2) < 1e-6 and abs(b[1] - floor - 2) < 1e-6:
                base_edges.add((a, b))
    for a, b in edges:
        ribbon(w, [point(m, *a), point(m, *b)], 0.35, 0.35, "alloyDark", "artic", f"D{m['district']}")
    # The base ring is generated from the geodesic's actual equator, so no rim cracks appear.
    for a, b in base_edges:
        # wound to face out from the dome
        face = [(b[0], floor, b[2]), b, a, (a[0], floor, a[2])]
        for p in remove_service(face, radius, floor) if m["bays"] else [face]:
            local_face(w, m, p, "ceramicBand")
    if m["bays"]:
        at = point(m, 0, floor, radius - 4)
        porch = dict(m)
        porch["at"], porch["size"] = [at[0], at[2]], [12, 12, 8]
        porch["bays"] = [dict(m["bays"][0], x=0, depth=4)]
        block(w, porch, radius=0.6)
        clad(w, porch, 12)
