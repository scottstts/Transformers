"""The hero keep: a fabricated podium, tapered shell, flying ribs, cornice, lantern, halo and needle."""

import math

from ..geom.detail import label, panel, ribbon
from ..geom.polygon import transform
from .buildings import clad, cornice
from .shells import annulus as ring_face
from .shells import block, local_beam, point, radial, rounded_profile

BUCKET = "spire"
AT = (0, -45)
SHAFT_FOOT, SHAFT_TOP = 48, 104
LANTERN_TOP = 118
NEEDLE_FOOT, HIP_TOP, NEEDLE_TOP = 9.0, 121.9, 133.6


def annulus(w, outer, inner, y, up, slot="ceramicBand", lod="mass"):
    ring_face(w, outer, inner, y, up, slot, lod, BUCKET)


def shaft_size(y):
    """Plan size of the shaft at height y: 36 x 28 at its foot, 32 x 24 at its top."""
    t = (y - SHAFT_FOOT) / (SHAFT_TOP - SHAFT_FOOT)
    return 36 - 4 * t, 28 - 4 * t


def flying_ribs(w, m):
    """Four ribs rise from the podium's corners and taper into the shaft's chamfered corners."""
    y_start = 47.5
    t0 = (y_start - 24) / 60
    steps = 32
    for sx, sz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        path = []
        for j in range(steps + 1):
            t = t0 + (1 - t0) * j / steps
            path.append(point(m, sx * (26 - 10 * t + 4.4 * math.sin(t * math.pi)), 24 + 60 * t,
                              sz * (20 - 8 * t + 2.5 * math.sin(t * math.pi))))
        scales = [1.0 - 0.62 * (j / steps) ** 1.3 for j in range(steps + 1)]
        ribbon(w, path, 2.6, 2.4, "alloyDark", "mass", BUCKET, scales=scales)
        ribbon(w, [(x + sx * 0.18, y + 0.18, z + sz * 0.18) for x, y, z in path],
               1.65, 2.65, "ceramicBand", "mass", BUCKET, scales=scales)
        # A footing shoe where the rib leaves the podium roof, wholly inside the roof's rounded corner.
        foot = (AT[0] + sx * 25.6, AT[1] + sz * 19.0)
        base = transform(rounded_profile(6.0, 5.4, 1.4), foot, 0)
        top = transform(rounded_profile(4.8, 4.4, 1.2), foot, 0)
        w.loft([base, top], [48, 51], "ceramicBand", bucket=BUCKET)


def shaft(w, m):
    p0 = transform(rounded_profile(36, 28, 3), m["at"], 0)
    p1 = transform(rounded_profile(32, 24, 3), m["at"], 0)
    w.loft([p0, p1], [SHAFT_FOOT, SHAFT_TOP], "ceramic", bucket=BUCKET, caps=False)
    rows = 10
    span = SHAFT_TOP - SHAFT_FOOT
    for side in range(4):
        nx, nz = ((0, 1), (1, 0), (0, -1), (-1, 0))[side]
        u = ((1, 0, 0), (0, 0, -1), (-1, 0, 0), (0, 0, 1))[side]
        for row in range(rows):
            y = SHAFT_FOOT + (row + 0.5) * span / rows
            width_x, width_z = shaft_size(y)
            half_x, half_z = width_x / 2, width_z / 2
            width = 2 * (half_x - 3) if side % 2 == 0 else 2 * (half_z - 3)
            distance = half_z if side % 2 == 0 else half_x
            cols = max(1, math.ceil(width / 3))
            for col in range(cols):
                along = -width / 2 + (col + 0.5) * width / cols
                centre = (nx * distance + u[0] * along, y, AT[1] + nz * distance + u[2] * along)
                panel(w, centre, u, (nx * -2 / span, 1, nz * -2 / span), width / cols - 0.06, span / rows - 0.08,
                      (nx, 2 / span, nz), 0.12, 0.04, "ceramic", "artic", BUCKET)
        for y in range(60, SHAFT_TOP, 12):
            width_x, width_z = shaft_size(y)
            half_x, half_z = width_x / 2, width_z / 2
            width = 2 * (half_x - 3) if side % 2 == 0 else 2 * (half_z - 3)
            d = half_z if side % 2 == 0 else half_x
            panel(w, (nx * d, y, AT[1] + nz * d), u, (0, 1, 0), width + 0.12, 0.5, (nx, 0, nz),
                  0.28, 0.08, "alloyDark", "mass", BUCKET)
    # Chamfered corners carry spines with recessed light channels.
    for sx, sz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        a = point(m, sx * 16.7, SHAFT_FOOT, sz * 12.7)
        b = point(m, sx * 14.7, SHAFT_TOP, sz * 10.7)
        w.beam(a, b, 0.75, 0.75, "alloyDark", "mass", BUCKET)
        w.beam((a[0] + sx * 0.38, a[1] + 0.5, a[2] + sz * 0.38),
               (b[0] + sx * 0.38, b[1] - 0.5, b[2] + sz * 0.38), 0.18, 0.18, "light", "artic", BUCKET)


def lantern_cornice(w, m):
    """A corbelled cornice under the lantern, on bracket plates every 3 m."""
    stages = [(100.4, 0.0), (101.4, 0.9), (102.6, 1.5), (104.0, 1.6)]
    profiles = []
    for y, grow in stages:
        width, depth = shaft_size(min(y, SHAFT_TOP))
        profiles.append(transform(rounded_profile(width + 2 * grow, depth + 2 * grow, 3 + grow), m["at"], 0))
    w.loft(profiles, [y for y, _ in stages], "ceramicBand", bucket=BUCKET, caps=False)
    width, depth = shaft_size(SHAFT_TOP)
    annulus(w, profiles[-1], transform(rounded_profile(width, depth, 3), m["at"], 0), SHAFT_TOP, True)
    for side in range(4):
        nx, nz = ((0, 1), (1, 0), (0, -1), (-1, 0))[side]
        u = ((1, 0, 0), (0, 0, -1), (-1, 0, 0), (0, 0, 1))[side]
        wx, wz = shaft_size(101.5)
        length = (wx if side % 2 == 0 else wz) - 6
        d = (wz if side % 2 == 0 else wx) / 2
        count = max(1, round(length / 3))
        for k in range(count + 1):
            along = -length / 2 + k * length / count
            # Brackets follow the shaft's batter, so their backs sit on the wall.
            panel(w, (nx * d + u[0] * along, 101.5, AT[1] + nz * d + u[2] * along), u,
                  (nx * -2 / 56, 1, nz * -2 / 56), 0.5, 2.6, (nx, 2 / 56, nz), 1.1, 0.14, "alloyDark", "artic", BUCKET)


def lantern(w, m):
    glass = transform(rounded_profile(32, 24, 3), m["at"], 0)
    w.loft([glass, glass], [SHAFT_TOP, LANTERN_TOP], "glass", bucket=BUCKET, caps=False)
    for side in range(4):
        nx, nz = ((0, 1), (1, 0), (0, -1), (-1, 0))[side]
        u = ((1, 0, 0), (0, 0, -1), (-1, 0, 0), (0, 0, 1))[side]
        width, distance = (26, 12) if side % 2 == 0 else (18, 16)
        for j in range(math.ceil(width / 1.5) + 1):
            along = -width / 2 + j * width / math.ceil(width / 1.5)
            x, z = nx * distance + u[0] * along, nz * distance + u[2] * along
            # Mullions run into the cornice below and the cap above, so their ends are buried.
            local_beam(w, m, (x, SHAFT_TOP - 0.3, z), (x, LANTERN_TOP + 0.3, z), 0.28, lod="artic")
        panel(w, (nx * distance, 110, AT[1] + nz * distance), u, (0, 1, 0), width, 0.32,
              (nx, 0, nz), 0.1, 0.02, "light", "artic", BUCKET)
    # A shallow overhang, then a low hip roof that gathers into the needle's foot.
    cap_base = transform(rounded_profile(33.8, 25.8, 3.8), m["at"], 0)
    hip = [crown_ring(m, wd) for wd in (33.0, 22.0, 13.0, NEEDLE_FOOT)]
    annulus(w, cap_base, glass, LANTERN_TOP, False)
    w.loft([cap_base, hip[0]], [LANTERN_TOP, LANTERN_TOP + 0.9], "ceramicBand", bucket=BUCKET, caps=False)
    w.loft(hip, [LANTERN_TOP + 0.9, LANTERN_TOP + 2.6, LANTERN_TOP + 3.9, HIP_TOP], "ceramic", bucket=BUCKET,
           caps=False)


def halo(w, m):
    """Ø 46 alloy ring on four arms; its light line lies in a groove in the outer face."""
    y = 110.8
    section = [(22.2, y), (23.8, y), (23.8, y + 0.75), (23.6, y + 0.75), (23.6, y + 1.65), (23.8, y + 1.65),
               (23.8, y + 2.4), (22.2, y + 2.4), (22.2, y)]
    slots = ["alloyLight", "alloyLight", "alloyLight", "light", "alloyLight", "alloyLight", "alloyLight", "alloyLight"]
    radial(w, m, section, slots, sides=128, smooth=False, caps=False)
    # Each arm starts well inside the lantern's glass, so no end cap lies on a wall.
    for a, start in ((0, 14), (math.pi / 2, 10.5), (math.pi, 14), (math.pi * 1.5, 10.5)):
        local_beam(w, m, (start * math.cos(a), 112, start * math.sin(a)),
                   (22.6 * math.cos(a), 112, 22.6 * math.sin(a)), 1.6)


def crown_ring(m, width):
    """The plan outline shared by the hip roof and the needle, so their joint is one ring of vertices."""
    return transform(rounded_profile(width, width * 0.76, min(1.8, width * 0.2 + 0.2)), m["at"], 0)


def needle_width(t):
    """Plan width of the needle from its foot (t = 0) to its top (t = 1): a long, slightly concave taper."""
    return 2.4 + (NEEDLE_FOOT - 2.4) * (1 - t) ** 1.25


def needle(w, m):
    """A slender faceted ceramic needle with keels, an alloy mast with collars, and a beacon."""
    steps = 7
    rings, heights = [], []
    for k in range(steps):
        t = k / (steps - 1)
        width = needle_width(t)
        rings.append(crown_ring(m, width))
        heights.append(HIP_TOP + (NEEDLE_TOP - HIP_TOP) * t)
    w.loft(rings, heights, "ceramic", bucket=BUCKET)
    for sx, sz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        path = []
        for k in range(steps):
            width = needle_width(k / (steps - 1))
            path.append(point(m, sx * (width / 2 - 0.3), heights[k], sz * (width * 0.38 - 0.3)))
        ribbon(w, path, 0.5, 0.5, "alloyDark", "mass", BUCKET,
               scales=[1.0 - 0.45 * k / (steps - 1) for k in range(steps)])
    mast = [(0.62, NEEDLE_TOP - 0.4), (0.55, 135.0), (0.4, 137.0), (0.26, 138.6), (0.14, 139.0)]
    radial(w, m, mast, ["alloyDark"] * 4, sides=24, caps=False)
    for y, r in ((135.2, 0.54), (137.2, 0.4)):
        w.ring(*m["at"], r + 0.1, 0.34, y, 0.3, "alloyLight", "mass", BUCKET, 24)
    radial(w, m, [(0.14, 139.0), (0.14, 139.7), (0.0, 140.0)], ["light", "light"], sides=24, caps=False)


def build(w, m):
    block(w, m, height=24, radius=4, top_holes=[rounded_profile(36, 28, 3)])
    clad(w, m, 24, 4, frieze=1.5)
    cornice(w, m, 48, radius=4)
    for sign in (-1, 1):
        p0 = transform(rounded_profile(8, 13, 1.5), (sign * 23, -20.5), 0)
        p1 = transform(rounded_profile(6, 8, 1.2), (sign * 22, -22.5), 0)
        w.loft([p0, p1], [24, 43], "ceramicBand", bucket=BUCKET)
        w.beam((sign * 23, 25, -13.95), (sign * 22, 42, -18.4), 0.5, 0.2, "alloyDark", "artic", BUCKET)
        w.beam((sign * 23, 26, -13.78), (sign * 22, 40, -17.8), 0.14, 0.1, "light", "artic", BUCKET)
    shaft(w, m)
    flying_ribs(w, m)
    lantern_cornice(w, m)
    lantern(w, m)
    halo(w, m)
    needle(w, m)
    label(w, "HALCYON", (0, 43, -21.65), height=1.5, bucket=BUCKET)
