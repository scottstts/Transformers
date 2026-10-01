"""Raked armour pylons: shell courses, corner spines, alloy bands, a crown cornice and a fin parapet."""

import math

from ..geom.detail import panel, ribbon
from ..geom.polygon import Profile, transform
from .buildings import basis, clad
from .shells import block, local_beam, point, rounded_profile

BASE, CORNICE, TOP = 18, 56, 60
BUCKET = "D0"
RADIUS = 1.5


def section(y):
    """Plan width, depth and rearward shift of the raked pylon at height y (local frame)."""
    t = (y - BASE) / (TOP - BASE)
    return 24 - 6 * t, 80 - 8.4 * t, 4.2 * t


def outline(m, y, grow=0.0):
    """The rounded plan outline at a height, grown outward by `grow` for the cornice."""
    width, depth, shift = section(min(y, CORNICE))
    p = rounded_profile(width + 2 * grow, depth + 2 * grow, RADIUS + grow)
    return transform(Profile([(x, z + shift) for x, z in p], p.normals), m["at"], m["yaw"])


def corner(m, y, sx, sz):
    """The rounded corner's midpoint on the pylon's skin."""
    width, depth, shift = section(y)
    mid = RADIUS * (1 - math.cos(math.pi / 4))
    return point(m, sx * (width / 2 - mid), y, sz * (depth / 2 - mid) + shift)


def crown(w, m):
    """A flared cornice and fin parapet in the curtain's language, on the pylon's raked body."""
    flare = [outline(m, y, g) for y, g in ((CORNICE, 0.0), (57.0, 0.7), (58.6, 1.3))]
    w.loft(flare, [CORNICE, 57.0, 58.6], "ceramicBand", bucket=BUCKET, caps=False)
    band = outline(m, CORNICE, 1.3)
    w.loft([band, band], [58.6, TOP], "alloyDark", bucket=BUCKET, caps=False)
    w.polygon([(x, TOP, z) for x, z in band[::-1]], "ceramic", "mass", BUCKET)
    # Fins stand on a 3 m rhythm along the roof's straight edges, clear of the rounded corners.
    width, depth, shift = section(CORNICE)
    hw, hd, clear = width / 2 + 1.3, depth / 2 + 1.3, RADIUS + 1.3 + 0.6
    long_n, short_n = math.floor((2 * hd - 2 * clear) / 3), math.floor((2 * hw - 2 * clear) / 3)
    for x in (-(hw - 0.7), hw - 0.7):
        for k in range(long_n):
            z = shift + (k - (long_n - 1) / 2) * 3
            local_beam(w, m, (x, TOP - 0.3, z), (x, TOP + 2.2, z), 1.2, "ceramic", "artic", 0.35)
    for z in (shift - (hd - 0.7), shift + hd - 0.7):
        for k in range(short_n):
            x = (k - (short_n - 1) / 2) * 3
            local_beam(w, m, (x, TOP - 0.3, z), (x, TOP + 2.2, z), 0.35, "ceramic", "artic", 1.2)


def build(w, m):
    saved = m["size"][:]
    m["size"][1] = BASE
    # The raked body starts on the base block's own outline, so the two share one ring of vertices.
    block(w, m, radius=RADIUS, top=False)
    clad(w, m, BASE, RADIUS)
    m["size"] = saved
    w.loft([outline(m, BASE), outline(m, CORNICE)], [BASE, CORNICE], "ceramic", bucket=BUCKET, caps=False)
    crown(w, m)
    x0 = m["at"][0]
    for row in range(12):
        y = BASE + (row + 0.5) * 3
        t, width = (y - BASE) / 42, 24 - 6 * (y - BASE) / 42
        outer_z = 500 - 8.4 * t
        cols = max(1, math.ceil((width - 3) / 3))
        for j in range(cols):
            x = x0 - (width - 3) / 2 + (j + 0.5) * (width - 3) / cols
            panel(w, (x, y, outer_z), (1, 0, 0), (0, 1, -0.2), (width - 3) / cols - 0.04, 2.96,
                  (0, 0.2, 1), 0.12, 0.03, "ceramic", "artic", BUCKET)
        for sign in (-1, 1):
            for j in range(13):
                local_z = -40 + 8.4 * t + (j + 0.5) * (80 - 8.4 * t) / 13
                panel(w, point(m, sign * (12 - 3 * t), y, local_z), basis(m, (0, 0, 1)), (sign * 3 / 42, 1, 0),
                      (80 - 8.4 * t) / 13 - 0.04, 2.96, basis(m, (sign, 0, 0)), 0.12, 0.03,
                      "ceramic", "artic", BUCKET)
    # Alloy bands on the grid's courses, and spines up the four raked corners.
    for y in (30, 42):
        t = (y - BASE) / 42
        width = 24 - 6 * t
        panel(w, (x0, y, 500 - 8.4 * t), (1, 0, 0), (0, 1, -0.2), width - 3, 0.6, (0, 0.2, 1), 0.3, 0.08,
              "alloyDark", "mass", BUCKET)
        for sign in (-1, 1):
            length = 80 - 8.4 * t - 3
            panel(w, point(m, sign * (12 - 3 * t), y, -40 + 8.4 * t + (80 - 8.4 * t) / 2), basis(m, (0, 0, 1)),
                  (sign * 3 / 42, 1, 0), length, 0.6, basis(m, (sign, 0, 0)), 0.3, 0.08, "alloyDark", "mass", BUCKET)
    for sx in (-1, 1):
        for sz in (-1, 1):
            ribbon(w, [corner(m, BASE + 0.3, sx, sz), corner(m, CORNICE + 0.6, sx, sz)], 0.9, 0.9,
                   "alloyDark", "mass", BUCKET)
    for x in (-6, 6):
        path = [(x0 + x, 3, 500.18), (x0 + x, 18, 500.18), (x0 + x * 0.75, 58, 492.18)]
        ribbon(w, path, 1.4, 0.8, "alloyDark", "mass", BUCKET)
        lit = [(x0 + x, 3.5, 500.61), (x0 + x, 18, 500.61), (x0 + x * 0.75, 57.5, 492.61)]
        ribbon(w, lit, 0.22, 0.10, "light", "artic", BUCKET)
    sign = -1 if x0 > 0 else 1
    x = x0 + sign * 11.95
    for z in (424, 497):
        w.beam((x, 0.03, z), (x, 25, z), 0.6, 1.2, "alloyDark", "artic", BUCKET)
