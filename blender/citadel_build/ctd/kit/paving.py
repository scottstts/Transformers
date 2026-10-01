"""Chamfered six-metre paving slabs and flush plate decks, with true reveal joints."""

import math

from ..geom.polygon import ccw, difference, rectangle
from ..plan import intersect_convex


def emit(w, polygon, height, surface, district):
    polygon = ccw(polygon)
    bucket = f"D{district}"
    if surface == "sand":
        w.polygon([(x, height, z) for x, z in polygon[::-1]], "sand", bucket=bucket)
        return
    size, joint, bevel = (3 if surface == "deck" else 6), 0.04, 0.018
    slot = "deck" if surface == "deck" else "paving"
    low = max(0, height - 0.03)
    xmin, xmax = min(p[0] for p in polygon), max(p[0] for p in polygon)
    zmin, zmax = min(p[1] for p in polygon), max(p[1] for p in polygon)
    for ix in range(math.floor(xmin / size), math.ceil(xmax / size)):
        for iz in range(math.floor(zmin / size), math.ceil(zmax / size)):
            x0, x1 = ix * size + joint / 2, (ix + 1) * size - joint / 2
            z0, z1 = iz * size + joint / 2, (iz + 1) * size - joint / 2
            tile = intersect_convex(polygon, rectangle(x0, x1, z0, z1))
            if not tile:
                continue
            inner = rectangle(x0 + bevel, x1 - bevel, z0 + bevel, z1 - bevel)
            top = intersect_convex(tile, inner)
            if top:
                w.polygon([(x, height, z) for x, z in top[::-1]], slot, bucket=bucket)
            # Chamfer only along actual slab joints. Plan partition lines remain seamless.
            for rim in difference(tile, inner):
                face = []
                for x, z in rim[::-1]:
                    margin = min(x - x0, x1 - x, z - z0, z1 - z)
                    y = height - max(0, bevel - margin)
                    face.append((x, max(low, y), z))
                w.polygon(face, slot, lod="artic", bucket=bucket)
            for a, b in zip(tile, tile[1:] + tile[:1]):
                if (abs(a[0] - b[0]) < 1e-7 and min(abs(a[0] - x0), abs(a[0] - x1)) < 1e-6
                        or abs(a[1] - b[1]) < 1e-7 and min(abs(a[1] - z0), abs(a[1] - z1)) < 1e-6):
                    w.polygon([(a[0], low, a[1]), (a[0], height - bevel, a[1]),
                               (b[0], height - bevel, b[1]), (b[0], low, b[1])], slot, lod="detail", bucket=bucket)
            # The joint bed is separately clipped; no hidden floor is emitted under the tile.
            for p in (rectangle(ix * size - joint / 2, ix * size + joint / 2, iz * size, (iz + 1) * size),
                      rectangle(ix * size + joint / 2, (ix + 1) * size - joint / 2,
                                iz * size - joint / 2, iz * size + joint / 2)):
                gap = intersect_convex(polygon, p)
                if gap:
                    w.polygon([(x, low, z) for x, z in gap[::-1]], "ceramicBand" if surface == "ceramic" else "alloyDark", bucket=bucket)
