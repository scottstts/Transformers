"""Direct-topology solid shells, recesses, radial profiles and vaults."""

import math

from ..geom.polygon import Profile, circle, ccw, rounded_profile, subtract_all, transform


def annulus(w, outer, inner, y, up, slot="ceramicBand", lod="mass", bucket="D0"):
    """A flat ring between two convex world outlines at height y, facing up or down."""
    for piece in subtract_all([outer], [inner] if inner else []):
        face = [(x, y, z) for x, z in piece]
        w.polygon(face[::-1] if up else face, slot, lod, bucket)


def point(m, x, y, z):
    p = transform([(x, z)], m["at"], m["yaw"])[0]
    return (p[0], y, p[1])


def local_face(w, m, vertices, slot="ceramic", lod="mass", normals=None):
    c, s = math.cos(m["yaw"]), math.sin(m["yaw"])
    nn = None if normals is None else [(c * x + s * z, y, -s * x + c * z) for x, y, z in normals]
    w.polygon([point(m, *v) for v in vertices], slot, lod, "spire" if m["kind"] == "spire" else f"D{m['district']}", nn)


def block(w, m, height=None, slot="ceramic", radius=0.6, width=None, depth=None, base=None,
          bottom=False, top=True, top_holes=None):
    """Rounded prism with directly constructed spawn recesses in the +z face."""
    width = width or m["size"][0]
    depth = depth or m["size"][2]
    y0 = m["y"] if base is None else base
    y1 = y0 + (height or m["size"][1])
    p = rounded_profile(width, depth, radius)
    bays = m.get("bays", []) if height is None or m["kind"] == "spire" else []
    # The module's base: the plan cut the floor round it with this corner (plan.py BLOCK_CORNERS).
    if base is None and width is None and depth is None and m.get("corner") is not None and abs(radius - m["corner"]) > 1e-9:
        raise ValueError(f"{m['kind']} {m['index']}: base corner {radius} m, its floor cutout {m['corner']} m")
    # Buried foundation faces are omitted; stepped roofs expose only their annulus.
    if bottom:
        local_face(w, m, [(x, y0, z) for x, z in p], slot)
    if top:
        for cap in subtract_all([p], top_holes or []):
            local_face(w, m, [(x, y1, z) for x, z in cap[::-1]], slot)
    for j, (a, b) in enumerate(zip(p, p[1:] + p[:1])):
        if abs(a[1] - depth / 2) < 1e-7 and abs(b[1] - depth / 2) < 1e-7 and bays:
            lo, hi = sorted((a[0], b[0]))
            intervals = sorted((q["x"] - q["width"] / 2, q["x"] + q["width"] / 2, q) for q in bays)
            cursor = lo
            for x0, x1, q in intervals:
                # Faces are wound counter-clockwise seen from outside: the +z wall runs from +x to -x.
                if x0 > cursor:
                    local_face(w, m, [(x0, y0, depth / 2), (x0, y1, depth / 2),
                                     (cursor, y1, depth / 2), (cursor, y0, depth / 2)], slot)
                fy, ty = q["floor"], q["floor"] + q["height"]
                if fy > y0:
                    local_face(w, m, [(x1, y0, depth / 2), (x1, fy, depth / 2),
                                     (x0, fy, depth / 2), (x0, y0, depth / 2)], slot)
                if ty < y1:
                    local_face(w, m, [(x1, ty, depth / 2), (x1, y1, depth / 2),
                                     (x0, y1, depth / 2), (x0, ty, depth / 2)], slot)
                back = depth / 2 - q["depth"]
                # Cavity walls face into the recess; no boolean cuts or hidden internal boxes.
                local_face(w, m, [(x0, fy, depth / 2), (x0, fy, back), (x0, ty, back), (x0, ty, depth / 2)], "alloyDark")
                local_face(w, m, [(x1, fy, back), (x1, fy, depth / 2), (x1, ty, depth / 2), (x1, ty, back)], "alloyDark")
                local_face(w, m, [(x0, ty, depth / 2), (x0, ty, back), (x1, ty, back), (x1, ty, depth / 2)], "alloyDark")
                local_face(w, m, [(x1, fy, back), (x1, ty, back), (x0, ty, back), (x0, fy, back)], "glass")
                # The plan's paving owns the bay floor, so no coincident cavity cap is emitted.
                for x in (x0 - 0.18, x1 + 0.18):
                    local_beam(w, m, (x, fy, depth / 2 + 0.04), (x, ty, depth / 2 + 0.04), 0.16, "light", "artic")
                local_beam(w, m, (x0, ty + 0.15, depth / 2 + 0.04), (x1, ty + 0.15, depth / 2 + 0.04), 0.16, "light", "artic")
                cursor = x1
            if cursor < hi:
                local_face(w, m, [(hi, y0, depth / 2), (hi, y1, depth / 2),
                                 (cursor, y1, depth / 2), (cursor, y0, depth / 2)], slot)
        else:
            na, nb = p.normals[j], p.normals[(j + 1) % len(p)]
            local_face(w, m, [(a[0], y0, a[1]), (a[0], y1, a[1]),
                             (b[0], y1, b[1]), (b[0], y0, b[1])], slot,
                       normals=[(na[0], 0, na[1]), (na[0], 0, na[1]),
                                (nb[0], 0, nb[1]), (nb[0], 0, nb[1])])


def local_beam(w, m, a, b, width, slot="alloyDark", lod="mass", depth=None):
    w.beam(point(m, *a), point(m, *b), width, depth, slot, lod,
           "spire" if m["kind"] == "spire" else f"D{m['district']}")


def radial(w, m, profile, slots=None, sides=32, smooth=True, caps=True, bottom=False):
    """Revolved r/y profile with analytic normals from its local slope."""
    slots = slots or ["ceramic"] * (len(profile) - 1)
    rings = [[(r * math.cos(j * math.tau / sides), y, r * math.sin(j * math.tau / sides))
              for j in range(sides)] for r, y in profile]
    if caps:
        if bottom:
            local_face(w, m, rings[0], slots[0])
        if profile[-1][0] > 0.0001:
            local_face(w, m, rings[-1][::-1], slots[-1])
    slopes = []
    for i, (r, y) in enumerate(profile):
        a, b = profile[max(0, i - 1)], profile[min(len(profile) - 1, i + 1)]
        slopes.append((b[0] - a[0]) / max(1e-6, b[1] - a[1]))
    for i, (lower, upper) in enumerate(zip(rings, rings[1:])):
        for j in range(sides):
            k = (j + 1) % sides
            vertices = [lower[j], upper[j], upper[k], lower[k]]
            nn = []
            for row, col in ((i, j), (i + 1, j), (i + 1, k), (i, k)):
                a, slope = col * math.tau / sides, slopes[row]
                length = math.sqrt(1 + slope * slope)
                nn.append((math.cos(a) / length, -slope / length, math.sin(a) / length))
            if profile[i + 1][0] < 0.0001:
                vertices = [lower[j], upper[j], lower[k]]
                nn = [nn[0], nn[1], nn[3]]
            local_face(w, m, vertices, slots[i], normals=nn if smooth else None)


def vault(w, m):
    """Closed lamella-free Phase A barrel envelope; service door wall is recessed."""
    width, height, depth = m["size"]
    # Base service block contains the true openings; the roof rests on its top.
    original_height = m["size"][1]
    m["size"][1] = 12
    block(w, m, radius=0.6)
    m["size"][1] = original_height
    side_y = m["y"] + 12
    profile = []
    for j in range(25):
        a = j * math.pi / 24
        profile.append((math.cos(a) * width / 2, side_y + math.sin(a) * (height - 12)))
    for j in range(24):
        a, b = profile[j], profile[j + 1]
        local_face(w, m, [(a[0], a[1], -depth / 2), (a[0], a[1], depth / 2),
                         (b[0], b[1], depth / 2), (b[0], b[1], -depth / 2)], "ceramic")
    for z, reverse in ((-depth / 2, True), (depth / 2, False)):
        face = [(x, y, z) for x, y in profile]
        local_face(w, m, face[::-1] if reverse else face, "ceramicBand")


def dish(w, m):
    y = m["y"]
    radial(w, m, [(15, y), (14, y + 4)], ["ceramicBand"], smooth=False)
    local_beam(w, m, (0, y + 4, 0), (0, y + 12, 0), 3)
    # A shallow shell aimed at the common sky point. Its plan fits the 30 m podium.
    tilt = math.radians(35)
    n = (math.sin(tilt), math.cos(tilt), 0)
    u, v = (math.cos(tilt), -math.sin(tilt), 0), (0, 0, 1)
    centre = (0, y + 13, 0)
    rings = []
    for r in (0.4, 3.25, 6.5, 9.75, 13):
        sag = r * r / (4 * 15)
        rings.append([tuple(centre[i] + u[i] * r * math.cos(a) + v[i] * r * math.sin(a) + n[i] * sag
                            for i in range(3)) for a in (j * math.tau / 48 for j in range(48))])
    for lower, upper in zip(rings, rings[1:]):
        for j in range(48):
            k = (j + 1) % 48
            local_face(w, m, [lower[j], lower[k], upper[k], upper[j]], "ceramic")
    local_face(w, m, rings[0][::-1], "alloyDark")
    for j in range(0, 48, 6):
        edge = rings[-1][j]
        local_beam(w, m, centre, edge, 0.42)
    feed = tuple(centre[i] + n[i] * 7 for i in range(3))
    for j in (0, 16, 32):
        local_beam(w, m, rings[-1][j], feed, 0.24)
    local_beam(w, m, tuple(feed[i] - n[i] for i in range(3)), feed, 0.8, "alloyLight")
