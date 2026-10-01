"""Fabrication geometry: bevelled panels, swept ribs, pipes and signage."""

import math

from .polygon import ccw, transform


def add(a, b):
    return tuple(a[i] + b[i] for i in range(3))


def mul(a, n):
    return tuple(v * n for v in a)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a):
    length = math.sqrt(sum(v * v for v in a))
    return tuple(v / length for v in a)


def panel(w, origin, u, v, width, height, normal, depth=0.12, bevel=0.04,
          slot="ceramic", lod="artic", bucket="D0"):
    """A raised plate: a flat front and drafted walls; the back is buried in its supporting spine.

    Plates whose straight wall is substantial (deep ribs, door frames) keep a vertical wall below a
    chamfer; shallow plates take a single drafted wall, which reads the same at any viewing distance.
    """
    hw, hh = width / 2, height / 2
    bevel = min(bevel, hw * 0.45, hh * 0.45, depth)
    corners = ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))
    inner = ((-hw + bevel, -hh + bevel), (hw - bevel, -hh + bevel),
             (hw - bevel, hh - bevel), (-hw + bevel, hh - bevel))

    def p(a, d):
        return add(origin, add(mul(u, a[0]), add(mul(v, a[1]), mul(normal, d))))

    back = [p(a, 0) for a in corners]
    front = [p(a, depth) for a in inner]
    staged = depth > 3 * bevel + 0.05
    rim = [p(a, depth - bevel) for a in corners] if staged else None
    # Profile winding is corrected to face the explicit outward normal.
    flip = sum(cross(u, v)[i] * normal[i] for i in range(3)) < 0
    if flip:
        back, front = back[::-1], front[::-1]
        rim = rim[::-1] if rim else None
    w.polygon(front, slot, lod, bucket, [normal] * 4)
    for j in range(4):
        k = (j + 1) % 4
        if staged:
            w.polygon([back[j], back[k], rim[k], rim[j]], slot, lod, bucket)
            w.polygon([rim[j], rim[k], front[k], front[j]], slot, lod, bucket)
        else:
            w.polygon([back[j], back[k], front[k], front[j]], slot, lod, bucket)


def grid(w, origin, u, v, normal, width, height, cell=(3, 1.5), bucket="D0", slot="ceramic", lod="artic"):
    nx, ny = max(1, math.ceil(width / cell[0])), max(1, math.ceil(height / cell[1]))
    dx, dy = width / nx, height / ny
    for i in range(nx):
        for j in range(ny):
            centre = add(origin, add(mul(u, (i + 0.5) * dx), mul(v, (j + 0.5) * dy)))
            panel(w, centre, u, v, dx - 0.04, dy - 0.04, normal, 0.08, 0.025, slot, lod, bucket)


def tube(w, path, radius, slot="alloyDark", lod="detail", bucket="D0", sides=12, caps=True):
    rings, normals, previous_u = [], [], None
    for j, p in enumerate(path):
        a, b = path[max(0, j - 1)], path[min(len(path) - 1, j + 1)]
        direction = unit(tuple(b[i] - a[i] for i in range(3)))
        ref = (0, 1, 0) if abs(direction[1]) < 0.95 else (1, 0, 0)
        if previous_u is None:
            u = unit(cross(direction, ref))
        else:
            dot = sum(previous_u[i] * direction[i] for i in range(3))
            u = unit(tuple(previous_u[i] - dot * direction[i] for i in range(3)))
        previous_u = u
        v = cross(direction, u)
        nn = [add(mul(u, math.cos(k * math.tau / sides)), mul(v, math.sin(k * math.tau / sides))) for k in range(sides)]
        rings.append([add(p, mul(n, radius)) for n in nn])
        normals.append(nn)
    if caps:
        w.polygon(rings[0][::-1], slot, lod, bucket)
        w.polygon(rings[-1], slot, lod, bucket)
    for j in range(len(rings) - 1):
        for k in range(sides):
            n = (k + 1) % sides
            w.polygon([rings[j][k], rings[j][n], rings[j + 1][n], rings[j + 1][k]], slot, lod, bucket,
                      [normals[j][k], normals[j][n], normals[j + 1][n], normals[j + 1][k]])


def ribbon(w, path, width, depth, slot="alloyDark", lod="artic", bucket="D0", scales=None):
    """A joined rectangular sweep, using bisector frames rather than separate boxes.

    `scales` gives one section multiplier per path point, so a rib can taper to a fine tip.
    """
    rings, previous_u = [], None
    for j, p in enumerate(path):
        a, b = path[max(0, j - 1)], path[min(len(path) - 1, j + 1)]
        direction = unit(tuple(b[i] - a[i] for i in range(3)))
        ref = (0, 1, 0) if abs(direction[1]) < 0.95 else (1, 0, 0)
        if previous_u is None:
            u = unit(cross(direction, ref))
        else:
            dot = sum(previous_u[i] * direction[i] for i in range(3))
            u = unit(tuple(previous_u[i] - dot * direction[i] for i in range(3)))
        previous_u = u
        v = cross(direction, u)
        s = 1 if scales is None else scales[j]
        rings.append([add(p, add(mul(u, x * width * s / 2), mul(v, z * depth * s / 2)))
                      for x, z in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    w.polygon(rings[0][::-1], slot, lod, bucket)
    w.polygon(rings[-1], slot, lod, bucket)
    for a, b in zip(rings, rings[1:]):
        for j in range(4):
            k = (j + 1) % 4
            w.polygon([a[j], a[k], b[k], b[j]], slot, lod, bucket)


def oriented_ring(w, centre, normal, radius, width, depth, slot="alloyLight", lod="artic", bucket="D0", sides=64):
    normal = unit(normal)
    ref = (0, 1, 0) if abs(normal[1]) < 0.95 else (1, 0, 0)
    u, v = unit(cross(normal, ref)), None
    v = cross(normal, u)
    rings = []
    for rad, axial in ((radius - width / 2, -depth / 2), (radius + width / 2, -depth / 2),
                       (radius + width / 2, depth / 2), (radius - width / 2, depth / 2)):
        rings.append([add(centre, add(mul(normal, axial), add(mul(u, rad * math.cos(j * math.tau / sides)),
                                                                  mul(v, rad * math.sin(j * math.tau / sides))))) for j in range(sides)])
    for i in range(4):
        k = (i + 1) % 4
        for j in range(sides):
            n = (j + 1) % sides
            w.polygon([rings[i][j], rings[i][n], rings[k][n], rings[k][j]], slot, lod, bucket)


FONT = {
    "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"],
    "C": ["011", "100", "100", "100", "011"], "D": ["110", "101", "101", "101", "110"],
    "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"],
    "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"],
    "I": ["111", "010", "010", "010", "111"], "J": ["001", "001", "001", "101", "010"],
    "K": ["101", "101", "110", "101", "101"], "L": ["100", "100", "100", "100", "111"],
    "M": ["101", "111", "111", "101", "101"], "N": ["101", "111", "111", "111", "101"],
    "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"],
    "Q": ["010", "101", "101", "111", "011"], "R": ["110", "101", "110", "101", "101"],
    "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"],
    "U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"],
    "W": ["101", "101", "111", "111", "101"], "X": ["101", "101", "010", "101", "101"],
    "Y": ["101", "101", "010", "010", "010"], "Z": ["111", "001", "010", "100", "111"],
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["110", "001", "010", "100", "111"], "3": ["110", "001", "010", "001", "110"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "110", "001", "110"],
    "6": ["011", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "110"],
    "-": ["000", "000", "111", "000", "000"], " ": ["000"] * 5,
}


def label(w, text, origin, u=(1, 0, 0), v=(0, 1, 0), normal=(0, 0, 1), height=1.5,
          slot="alloyLight", lod="detail", bucket="D0"):
    pixel = height / 5
    total = (len(text) * 4 - 1) * pixel
    for i, letter in enumerate(text.upper()):
        for row, line in enumerate(FONT.get(letter, FONT[" "])):
            for col, on in enumerate(line):
                if on == "1":
                    centre = add(origin, add(mul(u, (i * 4 + col + 0.5) * pixel - total / 2),
                                             mul(v, (4.5 - row) * pixel)))
                    panel(w, centre, u, v, pixel * 0.87, pixel * 0.87, normal,
                          0.035, 0.008, slot, lod, bucket)
