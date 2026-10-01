"""Ceramic/alloy fabrication pass for shield walls, terraces and gate structures."""

import math

from ..geom.detail import grid, label, oriented_ring, panel, ribbon, tube
from ..geom.polygon import inset, rectangle, transform
from ..plan import broken_line, unit
from .shells import local_beam, point


def build(w, plan):
    for wall in plan["walls"]:
        if wall["kind"] == "curtain":
            curtain(w, plan, wall)
        elif wall["kind"] == "plinth":
            retaining(w, plan, wall)
        else:
            spur(w, wall)
    for g in plan["gates"]:
        gate(w, g)
    for m in plan["modules"]:
        if m["bays"]:
            bay_frames(w, m)
    route_inlays(w)
    yard_inlays(w, plan)


def curtain(w, plan, wall):
    poly = plan["outline"]["O"]
    j, k = poly.index(wall["a"]), 0
    k = (j + 1) % len(poly)
    outer9, outer30, inner = inset(poly, 3.6), inset(poly, 5.35), inset(poly, 12.35)
    a, b = wall["a"], wall["b"]
    tangent = unit((b[0] - a[0], b[1] - a[1]))
    u = (tangent[0], 0, tangent[1])
    outward = (tangent[1], 0, -tangent[0])
    inward = tuple(-v for v in outward)
    length, bucket = math.dist(a, b), f"D{wall['district']}"
    for p, q in broken_line(a, b, wall["gaps"]):
        t0, t1 = math.dist(a, p) / length, math.dist(a, q) / length
        op = (outer9[j][0] + t0 * (outer9[k][0] - outer9[j][0]), 9,
              outer9[j][1] + t0 * (outer9[k][1] - outer9[j][1]))
        oq = (outer9[j][0] + t1 * (outer9[k][0] - outer9[j][0]), 9,
              outer9[j][1] + t1 * (outer9[k][1] - outer9[j][1]))
        # World-scale cladding joints remain readable in close approach views.
        slope = (-outward[0] * 1.75 / 21, 1, -outward[2] * 1.75 / 21)
        grid(w, op, u, slope, outward, math.dist(op, oq), 3, bucket=bucket)
        upper_origin = tuple(op[i] + slope[i] * 3 for i in range(3))
        grid(w, upper_origin, u, slope, outward, math.dist(op, oq), 18, cell=(6, 3), bucket=bucket)
        ip = (inner[j][0] + t0 * (inner[k][0] - inner[j][0]), 0.1,
              inner[j][1] + t0 * (inner[k][1] - inner[j][1]))
        iq = (inner[j][0] + t1 * (inner[k][0] - inner[j][0]), 0.1,
              inner[j][1] + t1 * (inner[k][1] - inner[j][1]))
        low_ip = tuple(ip[i] + (-inward[i] * 3.65 if i != 1 else 0) for i in range(3))
        lower_slope = (inward[0] * 3.65 / 9, 1, inward[2] * 3.65 / 9)
        grid(w, low_ip, u, lower_slope, inward, math.dist(ip, iq), 8.9, cell=(6, 3), bucket=bucket)
        upper_ip = (ip[0], 9, ip[2])
        grid(w, upper_ip, u, (0, 1, 0), inward, math.dist(ip, iq), 19, cell=(6, 3), bucket=bucket)
        for y in (6, 12, 18, 24, 28):
            pa = (ip[0] + inward[0] * 0.18, y, ip[2] + inward[2] * 0.18)
            pb = (iq[0] + inward[0] * 0.18, y, iq[2] + inward[2] * 0.18)
            w.beam(pa, pb, 0.22, 0.6, "alloyDark", "mass", bucket)
            if y in (12, 24):
                w.beam((pa[0], y - 0.05, pa[2]), (pb[0], y - 0.05, pb[2]), 0.24, 0.08, "light", "artic", bucket)
        distance = math.dist(ip, iq)
        for pos in range(9, int(distance), 18):
            x, z = ip[0] + u[0] * pos, ip[2] + u[2] * pos
            origin = (x + inward[0] * 0.2, 14, z + inward[2] * 0.2)
            panel(w, origin, u, (0, 1, 0), 3, 27.4, inward, 1.5, 0.25, bucket=bucket, lod="mass")
            offset = 3.65 * (1 - 2 / 9) + 0.06
            junction = (x + inward[0] * offset, 2, z + inward[2] * offset)
            panel(w, junction, u, (0, 1, 0), 1.1, 1.7, inward,
                  0.55, 0.12, "ceramicBand", "detail", bucket)
            hatch = (junction[0] + inward[0] * 0.57, 2, junction[2] + inward[2] * 0.57)
            panel(w, hatch, u, (0, 1, 0), 0.7, 1.2, inward,
                  0.08, 0.025, "alloyDark", "detail", bucket)
            pipe_offset = 3.65 * (1 - 1.2 / 9) + 1.4
            branch = [(x + inward[0] * pipe_offset, 1.2, z + inward[2] * pipe_offset)]
            for step in range(5):
                angle = step * math.pi / 8
                off = pipe_offset - 0.35 * (1 - math.cos(angle))
                branch.append((x + inward[0] * off, 1.4 + 0.35 * math.sin(angle), z + inward[2] * off))
            branch.append((hatch[0], 1.75, hatch[2]))
            tube(w, branch, 0.12, "alloyDark", "detail", bucket, 12)
            for side in (-5.5, 5.5):
                centre = (x + u[0] * side + inward[0] * 0.18, 21.5,
                          z + u[2] * side + inward[2] * 0.18)
                panel(w, centre, u, (0, 1, 0), 0.65, 7.2, inward, 0.16, 0.04, "alloyDark", "artic", bucket)
                panel(w, (centre[0] + inward[0] * 0.17, centre[1], centre[2] + inward[2] * 0.17),
                      u, (0, 1, 0), 0.26, 6.7, inward, 0.025, 0.01, "light", "artic", bucket)
        # Cantilever brackets repeat on the structural 6 m grid.
        for pos in range(3, int(distance), 6):
            t = t0 + (t1 - t0) * pos / distance
            ex = outer30[j][0] + t * (outer30[k][0] - outer30[j][0])
            ez = outer30[j][1] + t * (outer30[k][1] - outer30[j][1])
            path = [(ex, 28.2, ez), (ex + outward[0] * 1.4, 29.6, ez + outward[2] * 1.4),
                    (ex + outward[0] * 1.4, 30.0, ez + outward[2] * 1.4)]
            ribbon(w, path, 0.8, 0.6, bucket=bucket)
        # The wall-foot trunk, couplers and cradles have a continuous load path.
        pa = (ip[0] + inward[0] * (3.65 * (1 - 1.2 / 9) + 1.4), 1.2,
              ip[2] + inward[2] * (3.65 * (1 - 1.2 / 9) + 1.4))
        pb = (iq[0] + inward[0] * (3.65 * (1 - 1.2 / 9) + 1.4), 1.2,
              iq[2] + inward[2] * (3.65 * (1 - 1.2 / 9) + 1.4))
        tube(w, [pa, pb], 0.8, bucket=bucket)
        for pos in range(3, int(distance), 12):
            c = (pa[0] + u[0] * pos, 1.2, pa[2] + u[2] * pos)
            oriented_ring(w, c, u, 0.82, 0.14, 0.55, "alloyLight", "detail", bucket, 16)
            w.box((c[0], 0.25, c[2]), (1.7, 0.5, 1.7), "ceramicBand", "detail", bucket)


def retaining(w, plan, wall):
    a, b, y, top = wall["a"], wall["b"], wall["y"], wall["top"]
    tangent = unit((b[0] - a[0], b[1] - a[1]))
    n = (tangent[1], 0, -tangent[0])
    if wall["outline"] == "C":
        n = tuple(-v for v in n)
    bucket = f"D{wall['district']}"
    length = math.dist(a, b)
    for p, q in broken_line(a, b, wall["gaps"]):
        for pos in range(6, int(math.dist(p, q)), 12):
            centre = (p[0] + tangent[0] * pos, (top + y) / 2, p[1] + tangent[1] * pos)
            panel(w, centre, (tangent[0], 0, tangent[1]), (0, 1, 0), 0.8, top - y,
                  n, max(0.3, (top - y) / 6 + 0.2), 0.15, "ceramic", "mass", bucket)
        for pos in range(3, int(math.dist(p, q)), 6):
            c = (p[0] + tangent[0] * pos, top + 0.7, p[1] + tangent[1] * pos)
            w.beam((c[0], top, c[2]), (c[0], top + 1.4, c[2]), 0.16, slot="alloyDark", lod="artic", bucket=bucket)
    w.beam((a[0] + n[0] * 0.05, y + 0.4, a[1] + n[2] * 0.05),
           (b[0] + n[0] * 0.05, y + 0.4, b[1] + n[2] * 0.05),
           0.15, 0.8, "alloyDark", "artic", bucket)
    # Chasm couplers are the strongest daylight accents after the lantern.
    if wall["outline"] == "C":
        for offset in (3, 6):
            p0 = (a[0] + n[0] * offset, 2.3, a[1] + n[2] * offset)
            p1 = (b[0] + n[0] * offset, 2.3, b[1] + n[2] * offset)
            tube(w, [p0, p1], 1, "alloyDark", "detail", bucket)
            for pos in range(6, int(length), 12):
                c = (p0[0] + tangent[0] * pos, 2.3, p0[2] + tangent[1] * pos)
                oriented_ring(w, c, (tangent[0], 0, tangent[1]), 1.04, 0.2, 0.5, "light", "detail", bucket, 16)
                w.box((c[0], 1.25, c[2]), (2.4, 0.5, 2.4), "ceramicBand", "detail", bucket)


def spur(w, wall):
    a, b, y = wall["a"], wall["b"], wall["y"]
    t = unit((b[0] - a[0], b[1] - a[1]))
    n = (t[1], 0, -t[0])
    u, bucket = (t[0], 0, t[1]), f"D{wall['district']}"
    for p, q in broken_line(a, b, wall["gaps"]):
        distance = math.dist(p, q)
        for sign in (-1, 1):
            nn = tuple(v * sign for v in n)
            origin = (p[0] + nn[0] * (3 - 0.2 / 18), y + 0.2, p[1] + nn[2] * (3 - 0.2 / 18))
            slope = (-nn[0] / 18, 1, -nn[2] / 18)
            grid(w, origin, u, slope, nn, distance, 17.6, cell=(6, 3), bucket=bucket)
            for pos in range(9, int(distance), 18):
                c = (p[0] + u[0] * pos + nn[0] * (3 - 8.5 / 18), y + 8.5,
                     p[1] + u[2] * pos + nn[2] * (3 - 8.5 / 18))
                panel(w, c, u, slope, 2, 16.8, nn, 0.6, 0.2, bucket=bucket, lod="mass")
        w.beam((p[0], y + 18.35, p[1]), (q[0], y + 18.35, q[1]), 0.12, 0.1, "light", "artic", bucket)


def jamb_channels(w, g, side_n, bucket):
    """Dark channels with light slots on a portal pylon's front face.

    A pylon's front face is battered (a single plane from 3 m up to 4 m under its head), so each channel is
    laid on that plane, parallel to it. It starts above the ramp's parapet, and sits clear of the jamb face,
    which recedes outward as it rises; neither the parapet's inner face nor the jamb face is shared with it.
    """
    grand = g["id"] in ("R1-top", "R5-top", "R7-top")
    rise = 44 if g["id"] == "R7-top" else 36 if grand else 28
    slope = 0.6 / (rise - 7)
    low, high = 3.0, g["soffit"] - 0.5
    mid = (low + high) / 2
    n = g["out"]
    tangent = (-n[1], 0, n[0])
    half_depth = 4.75 - slope * (mid - 3)
    along = (-side_n[0] * slope, 1, -side_n[1] * slope)
    length = math.sqrt(1 + 2 * slope * slope)
    normal = (side_n[0] / length, slope / length, side_n[1] / length)
    for sign in (-1, 1):
        reach = g["width"] / 2 + 1.0
        centre = (g["at"][0] + tangent[0] * sign * reach + side_n[0] * half_depth, g["y"] + mid,
                  g["at"][1] + tangent[2] * sign * reach + side_n[1] * half_depth)
        panel(w, centre, tangent, along, 0.7, high - low, normal, 0.3, 0.08, "alloyDark", "artic", bucket)
        lit = tuple(centre[i] + normal[i] * 0.27 for i in range(3))
        panel(w, lit, tangent, along, 0.12, high - low - 1, normal, 0.06, 0.01, "light", "artic", bucket)


def gate(w, g):
    bucket = f"D{g['sectors'][1] if g['sectors'][0] == 12 else g['sectors'][0]}"
    n, at, y, width = g["out"], g["at"], g["y"], g["width"]
    normal = (n[0], 0, n[1])
    tangent = (-n[1], 0, n[0])
    grand = g["id"] in ("G-main", "R1-top", "R5-top", "R7-top")
    soffit = y + g["soffit"]
    depth = 4 if g["id"] == "G-main" else 4.15
    face = (at[0] + n[0] * depth, soffit + 1.85, at[1] + n[1] * depth)
    # Both faces of a gate are dressed: the lintel's dark fascia and the jamb channels with light slots.
    for side in (1, -1):
        side_n = (n[0] * side, n[1] * side)
        side_normal = (side_n[0], 0, side_n[1])
        side_face = (at[0] + side_n[0] * depth, soffit + 1.85, at[1] + side_n[1] * depth)
        panel(w, side_face, tangent, (0, 1, 0), width + 0.5, 3.5, side_normal, 0.2, 0.12,
              "alloyDark", "mass", bucket)
        if g["kind"] != "outer":
            jamb_channels(w, g, side_n, bucket)
            continue
        for sign in (-1, 1):
            centre = (at[0] + tangent[0] * sign * (width / 2 + 0.35) + side_n[0] * depth,
                      y + g["soffit"] / 2, at[1] + tangent[2] * sign * (width / 2 + 0.35) + side_n[1] * depth)
            panel(w, centre, tangent, (0, 1, 0), 0.7, g["soffit"], side_normal, 0.6, 0.08, "alloyDark", "artic", bucket)
            panel(w, (centre[0] + side_n[0] * 0.65, centre[1], centre[2] + side_n[1] * 0.65),
                  tangent, (0, 1, 0), 0.12, g["soffit"] - 1, side_normal, 0.04, 0.01, "light", "artic", bucket)
    if grand:
        name = {"G-main": "HALCYON", "R1-top": "FORECOURT", "R5-top": "ASCENT", "R7-top": "CROWN"}[g["id"]]
        label(w, name, (face[0] + n[0] * 0.25, soffit + 0.6, face[2] + n[1] * 0.25),
              tuple(-v for v in tangent), (0, 1, 0), normal, 1.8, bucket=bucket)
        for sign in (-1, 1):
            rise = 44 if g["id"] == "R7-top" else 36
            d = 4.75 - 0.6 * 18 / (rise - 7)
            centre = (at[0] + tangent[0] * sign * (width / 2 + 4) + n[0] * d,
                      y + 21, at[1] + tangent[2] * sign * (width / 2 + 4) + n[1] * d)
            slope = (-n[0] * 0.6 / (rise - 7), 1, -n[1] * 0.6 / (rise - 7))
            panel(w, centre, tangent, slope, 3.5, 22, normal, 0.25, 0.12, "alloyDark", "mass", bucket)
            panel(w, (centre[0] + n[0] * 0.27, centre[1], centre[2] + n[1] * 0.27),
                  tangent, slope, 0.42, 20, normal, 0.05, 0.015, "light", "artic", bucket)
    if g["kind"] == "outer":
        # Retracted blast-door lower edges remain visible within the soffit cassette.
        for j in range(4):
            c = (at[0] + n[0] * (j * 0.3), soffit + 0.25 + j * 0.5, at[1] + n[1] * (j * 0.3))
            w.beam((c[0] - tangent[0] * width / 2, c[1], c[2] - tangent[2] * width / 2),
                   (c[0] + tangent[0] * width / 2, c[1], c[2] + tangent[2] * width / 2), 0.2, 0.45, "alloyDark", "artic", bucket)
        oriented_ring(w, (face[0], soffit + 2, face[2]), normal, 1.2, 0.2, 0.16, bucket=bucket)


def bay_frames(w, m):
    bucket = "spire" if m["kind"] == "spire" else f"D{m['district']}"
    c, s = math.cos(m["yaw"]), math.sin(m["yaw"])
    u, normal = (c, 0, -s), (s, 0, c)
    front = m["size"][2] / 2
    for j, b in enumerate(m["bays"]):
        y = b["floor"]
        for sign in (-1, 1):
            centre = point(m, b["x"] + sign * (b["width"] / 2 + 0.35), y + b["height"] / 2 + 0.18, front + 0.03)
            panel(w, centre, u, (0, 1, 0), 0.7, b["height"] + 0.3, normal, 0.5, 0.12, "alloyDark", "mass", bucket)
        centre = point(m, b["x"], y + b["height"] + 0.5, front + 0.03)
        # The header overhangs the jamb frames (0.9 m past the opening against their 0.7 m), so its end walls
        # never lie in the same plane as theirs.
        panel(w, centre, u, (0, 1, 0), b["width"] + 1.8, 0.8, normal, 0.7, 0.12, "ceramicBand", "mass", bucket)
        label(w, f"{m['district']:02d}-{j + 1:02d}", point(m, b["x"], y + b["height"] + 1.2, front + 0.4),
              u, (0, 1, 0), normal, 0.9, bucket=bucket)


def route_inlays(w):
    for x in (-12, 0, 12):
        w.beam((x, 0.05, 332), (x, 0.05, 420), 0.18, 0.04, "alloyLight", "artic", "D0")
    for x in (-12, 12):
        w.beam((x, 8.02, 235), (x, 8.02, 298), 0.18, 0.04, "alloyLight", "artic", "D6")
    for radius in (32, 36, 42):
        w.ring(0, 24, radius, 0.18, 23.98, 0.06, "alloyLight", "artic", "D11", 128)


def yard_inlays(w, plan):
    """Each paved fighting yard carries its own inlay: an outer ring and an inner ring, flush-set in the paving."""
    for d in plan["districts"]:
        if d["index"] in (1, 2, 3, 4, 11):
            continue
        floor = (0.03, 8, 16, 24)[d["tier"]]
        (x, z), r = d["yard"]["at"], d["yard"]["r"]
        bucket = f"D{d['index']}"
        w.ring(x, z, r - 0.8, 0.3, floor - 0.02, 0.06, "alloyLight", "artic", bucket, 128)
        w.ring(x, z, r * 0.5, 0.18, floor - 0.02, 0.06, "alloyLight", "artic", bucket, 96)
