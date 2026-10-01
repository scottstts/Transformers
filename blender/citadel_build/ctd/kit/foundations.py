"""Exposed floors, mitred shield walls, retaining faces, parapets and portals."""

import math

from ..geom.polygon import ccw, difference, inset, rectangle, subtract_all, transform
from ..plan import broken_line, intersect_convex, unit
from .shells import block, radial, rounded_profile
from .paving import emit as emit_paving


def floors(w, plan):
    for f in plan["floor"]:
        if f["kind"] != "flat":
            continue
        patches = [p for p in plan["surfaces"] if abs(p["y"] - f["y"]) < 0.041]
        remaining = [f["polygon"]]
        for p in patches:
            next_pieces = []
            for poly in remaining:
                inside = intersect_convex(poly, p["polygon"])
                if inside:
                    emit_floor(w, inside, p["y"], p["surface"], f["district"])
                    next_pieces.extend(difference(poly, p["polygon"]))
                else:
                    next_pieces.append(poly)
            remaining = next_pieces
        for p in remaining:
            emit_floor(w, p, f["y"], f["surface"], f["district"])
    # Unwalkable chasm bottom is a distinct exposed surface at +1 m.
    chasm = subtract_all(difference(plan["outline"]["C"], plan["outline"]["K"]),
                         [f["footprint"] for f in plan["foundations"] if f["base"] == 1])
    for p in chasm:
        w.polygon([(x, 1, z) for x, z in p[::-1]], "alloyDark", bucket="D10")
    # The site is cut away beneath the architecture, avoiding coincident sand floors. It is a ring of quads
    # from the curtain's foot line out to a far horizon, so the preview reads as open desert; every quad
    # shares exact edges with its neighbours.
    outline = plan["outline"]["O"]
    cx = sum(x for x, _ in outline) / len(outline)
    cz = sum(z for _, z in outline) / len(outline)
    far = []
    for x, z in outline:
        reach = 5200 / math.hypot(x - cx, z - cz)
        far.append((cx + (x - cx) * reach, cz + (z - cz) * reach))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        w.polygon([(outline[i][0], 0, outline[i][1]), (outline[j][0], 0, outline[j][1]),
                   (far[j][0], 0, far[j][1]), (far[i][0], 0, far[i][1])], "sand", bucket="site")


def emit_floor(w, polygon, y, surface, district):
    emit_paving(w, polygon, y, surface, district)


def walls(w, plan):
    for wall in plan["walls"]:
        if wall["kind"] == "curtain":
            shield(w, plan, wall)
        elif wall["kind"] == "plinth":
            plinth(w, plan, wall)
        else:
            spur(w, wall)
    foundation_piers(w, plan)
    for g in plan["gates"]:
        portal(w, g)


def foundation_piers(w, plan):
    for f in plan["foundations"]:
        bucket, low, top = f"D{f['district']}", f["base"], f["top"]
        if f["kind"] == "pinnacle_pier":
            # drums.build emits this foundation as part of the full column,
            # sharing the upper section's facets, flutes and band rhythm.
            continue
        else:
            jamb = f["width"] - 1.4
            profiles = [transform(rounded_profile(a, b, r), f["at"], f["yaw"])
                        for a, b, r in ((jamb + 1.4, 11.4, 1.5), (jamb + 0.8, 10.8, 1.2), (jamb, 10, 0.6))]
            w.loft(profiles, [low, low + min(1.5, (top - low) / 4), top],
                   "ceramicBand", "mass", bucket, caps=False)


def shield(w, plan, wall):
    poly = plan["outline"]["O"]
    a, b = wall["a"], wall["b"]
    j = poly.index(a)
    nxt = (j + 1) % len(poly)
    bucket = f"D{wall['district']}"
    sections = [(0, 16, 0), (3.6, 12.35, 9), (5.35, 12.35, 30),
                (3.95, 12.35, 30.02), (3.95, 12.35, 34)]
    offsets = {d: inset(poly, d) for ext, intr, _ in sections for d in (ext, intr)}
    length = math.dist(a, b)
    for p, q in broken_line(a, b, wall["gaps"]):
        ts = [math.dist(a, v) / length for v in (p, q)]
        rings = []
        for t in ts:
            ring = []
            for ext, intr, y in sections:
                pair = []
                for d in (ext, intr):
                    pa, pb = offsets[d][j], offsets[d][nxt]
                    pair.append((pa[0] + t * (pb[0] - pa[0]), y, pa[1] + t * (pb[1] - pa[1])))
                ring.append(pair)
            rings.append(ring)
        for level in range(len(sections) - 1):
            slot = "ceramicBand" if level == 0 else "alloyDark" if level == 2 else "ceramic"
            for face_index in (0, 1):
                face = [rings[0][level][face_index], rings[0][level + 1][face_index],
                        rings[1][level + 1][face_index], rings[1][level][face_index]]
                if face_index == 1:
                    face.reverse()
                w.polygon(face, slot, bucket=bucket)
        w.polygon([rings[0][-1][0], rings[0][-1][1], rings[1][-1][1], rings[1][-1][0]], "alloyDark", bucket=bucket)
        # End faces appear only at deliberate openings; corner faces are shared mitres.
        for end, t in enumerate(ts):
            if 1e-7 < t < 1 - 1e-7:
                ring = rings[end]
                face = [v[0] for v in ring] + [v[1] for v in ring[::-1]]
                w.polygon(face if end == 0 else face[::-1], "ceramicBand", bucket=bucket)
        # Fins establish the intended skyline rhythm even in the massing pass.
        count = max(1, int(math.dist(p, q) / 3))
        for k in range(count):
            t = ts[0] + (ts[1] - ts[0]) * (k + 0.5) / count
            # Centre fins within the supported crown rather than on its outer lip.
            op, oq = offsets[3.95][j], offsets[3.95][nxt]
            ip, iq = offsets[12.35][j], offsets[12.35][nxt]
            x = (op[0] + ip[0] + t * (oq[0] + iq[0] - op[0] - ip[0])) / 2
            z = (op[1] + ip[1] + t * (oq[1] + iq[1] - op[1] - ip[1])) / 2
            tangent = unit((b[0] - a[0], b[1] - a[1]))
            normal = (tangent[1], -tangent[0])
            yaw = math.atan2(-tangent[1], tangent[0])
            bottom = transform(rounded_profile(1.2, 0.28, 0.1, 3), (x, z), yaw)
            top = transform(rounded_profile(0.8, 0.28, 0.1, 3),
                            (x + normal[0] * 0.35, z + normal[1] * 0.35), yaw)
            w.loft([bottom, top], [34, 36.2], "ceramic", bucket=bucket)
            w.beam((x + normal[0] * 0.17, 34, z + normal[1] * 0.17),
                   (x + normal[0] * 0.52, 36.2, z + normal[1] * 0.52),
                   0.08, 0.08, "alloyDark", "artic", bucket)


def plinth(w, plan, wall):
    name, a, b = wall["outline"], wall["a"], wall["b"]
    p = plan["outline"][name]
    j, bucket = p.index(a), f"D{wall['district']}"
    k = (j + 1) % len(p)
    bottom_y, top_y = wall["y"], wall["top"]
    lower = inset(p, -(top_y - bottom_y) / 6) if name in ("M", "I") else p
    low_a, low_b = lower[j], lower[k]
    face = [(low_a[0], bottom_y, low_a[1]), (a[0], top_y, a[1]),
            (b[0], top_y, b[1]), (low_b[0], bottom_y, low_b[1])]
    if name == "C":
        face.reverse()
    w.polygon(face, "ceramicBand", bucket=bucket)
    # Seam is proud by 2 cm and fixed into the retaining face.
    middle_y = (top_y + bottom_y) / 2
    w.beam(((a[0] + low_a[0]) / 2, middle_y, (a[1] + low_a[1]) / 2),
           ((b[0] + low_b[0]) / 2, middle_y, (b[1] + low_b[1]) / 2), 0.14, 0.18,
           "alloyDark", "artic", bucket)
    inside, outside = inset(p, 0.4), inset(p, -0.4)
    length = math.dist(a, b)
    for p0, p1 in broken_line(a, b, wall["gaps"]):
        ts = [math.dist(a, v) / length for v in (p0, p1)]
        rings = []
        for t in ts:
            points = []
            for line in (inside, outside):
                pa, pb = line[j], line[k]
                points.append((pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])))
            rings.append(points)
        ia, oa = rings[0]
        ib, ob = rings[1]
        v = lambda q, y: (q[0], y, q[1])
        for face in ([v(oa, top_y), v(oa, top_y + 1.4), v(ob, top_y + 1.4), v(ob, top_y)],
                     [v(ia, top_y), v(ib, top_y), v(ib, top_y + 1.4), v(ia, top_y + 1.4)],
                     [v(ia, top_y + 1.4), v(ib, top_y + 1.4), v(ob, top_y + 1.4), v(oa, top_y + 1.4)]):
            w.polygon(face, "ceramic", bucket=bucket)
        for end, t in enumerate(ts):
            if 1e-7 < t < 1 - 1e-7:
                i, o = rings[end]
                f = [v(i, top_y), v(i, top_y + 1.4), v(o, top_y + 1.4), v(o, top_y)]
                w.polygon(f if end == 0 else f[::-1], "ceramic", bucket=bucket)
        w.beam(v(ia, top_y + 1.24), v(ib, top_y + 1.24), 0.08, 0.12, "light", "artic", bucket)


def spur(w, wall):
    a, b = wall["a"], wall["b"]
    tangent = unit((b[0] - a[0], b[1] - a[1]))
    n, y = (-tangent[1], tangent[0]), wall["y"]
    bucket = f"D{wall['district']}"
    for p, q in broken_line(a, b, wall["gaps"]):
        profiles = [[(v[0] + n[0] * offset, v[1] + n[1] * offset) for v, offset in ((p, -half), (q, -half), (q, half), (p, half))]
                    for half in (3, 2)]
        w.loft(profiles, [y, y + 18], "ceramic", bucket=bucket)
        w.beam((p[0], y + 18.2, p[1]), (q[0], y + 18.2, q[1]), 4.1, 0.4, "alloyDark", bucket=bucket)


def portal(w, g):
    bucket = f"D{g['sectors'][1] if g['sectors'][0] == 12 else g['sectors'][0]}"
    n, at, y = g["out"], g["at"], g["y"]
    tangent = (-n[1], n[0])
    grand = g["id"] in ("G-main", "R1-top", "R5-top", "R7-top")
    jamb = 8 if grand else 6
    height = 44 if g["id"] == "R7-top" else 36 if grand else 28
    if g["id"] == "G-main":
        # Pylon bodies are already district modules; the bridge lintel is only at the outer end.
        w.beam((-14, 26.03, 496), (14, 26.03, 496), 8, 8, "ceramic", bucket="D0")
        w.ring(0, 500.12, 5, 0.6, 25, 0.6, "alloyLight", bucket="D0")
        return
    for sign in (-1, 1):
        centre = [at[i] + tangent[i] * sign * (g["width"] / 2 + (12 if g["kind"] == "outer" else jamb / 2)) for i in range(2)]
        m = {"at": centre, "yaw": math.atan2(n[0], n[1]), "y": y, "bays": [],
             "size": [24 if g["kind"] == "outer" else jamb, 50 if g["kind"] == "outer" else height, 24 if g["kind"] == "outer" else 10],
             "district": int(bucket[1:]), "kind": "gate"}
        if g["kind"] == "outer":
            radial(w, m, [(12, y), (10.5, y + 46), (10.5, y + 48), (0.1, y + 50)],
                   ["ceramic", "alloyDark", "ceramicBand"], sides=16, smooth=False)
        else:
            profiles = [transform(rounded_profile(jamb, 10, 0.6), centre, m["yaw"]),
                        transform(rounded_profile(jamb - 0.5, 9.5, 0.6), centre, m["yaw"]),
                        transform(rounded_profile(jamb - 1.2, 8.3, 0.6), centre, m["yaw"]),
                        transform(rounded_profile(jamb - 0.3, 9.0, 0.6), centre, m["yaw"])]
            w.loft(profiles, [y, y + 3, y + height - 4, y + height], "ceramic", bucket=bucket)
            head = transform(rounded_profile(jamb + 0.4, 10.4, 0.6), centre, m["yaw"])
            w.loft([head, head], [y + height - 4.3, y + height - 3.7], "alloyDark", bucket=bucket)
    a = (at[0] - tangent[0] * g["width"] / 2, y + g["soffit"] + 2, at[1] - tangent[1] * g["width"] / 2)
    b = (at[0] + tangent[0] * g["width"] / 2, y + g["soffit"] + 2, at[1] + tangent[1] * g["width"] / 2)
    w.beam(a, b, 8, 4, "ceramic" if grand else "alloyDark", bucket=bucket)
