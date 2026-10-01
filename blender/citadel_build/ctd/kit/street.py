"""Grounded security pods, shielded obelisk lamps and route bollards."""

from ..geom.detail import label, panel
from ..geom.polygon import transform
from .buildings import basis
from .shells import block, local_beam, point, radial, rounded_profile


def bollard(w, m, x, z):
    y, bucket = m["y"], f"D{m['district']}"
    p0 = transform(rounded_profile(0.6, 0.6, 0.12, 3), point(m, x, 0, z)[::2], m["yaw"])
    p1 = transform(rounded_profile(0.42, 0.42, 0.12, 3), point(m, x, 0, z)[::2], m["yaw"])
    w.loft([p0, p1], [y, y + 1.12], "ceramicBand", "detail", bucket)
    w.loft([p1, p1], [y + 1.12, y + 1.2], "light", "detail", bucket)


def lamp(w, m, x, z):
    y, bucket = m["y"], f"D{m['district']}"
    at = point(m, x, 0, z)[::2]
    profiles = [transform(rounded_profile(a, b, 0.25, 3), at, m["yaw"])
                for a, b in ((0.8, 0.8), (0.48, 0.58), (0.3, 0.48))]
    w.loft(profiles, [y, y + 0.6, y + 6], "ceramic", "detail", bucket)
    for sign in (-1, 1):
        local_beam(w, m, (x, y + 2, z + sign * 0.26), (x, y + 5.6, z + sign * 0.26),
                   0.13, "alloyDark", "detail")
        local_beam(w, m, (x, y + 2.15, z + sign * 0.33), (x, y + 5.45, z + sign * 0.33),
                   0.065, "light", "detail")


def guard(w, m):
    y, bucket = m["y"], f"D{m['district']}"
    saved, bays = m["size"][:], m["bays"]
    m["size"], m["bays"] = [4, 3.35, 4], []
    block(w, m, radius=0.25, top=False)
    m["size"] = [4, 0.95, 4]
    block(w, m, base=y + 3.35, slot="glass", radius=0.25, top=False)
    m["size"] = [4, 0.7, 4]
    block(w, m, base=y + 4.3, slot="ceramic", radius=0.25)
    m["size"], m["bays"] = saved, bays
    u, n = basis(m, (1, 0, 0)), basis(m, (0, 0, 1))
    for row in (0.75, 2.25):
        panel(w, point(m, 0, y + row, 2), u, (0, 1, 0), 3.42, 1.38,
              n, 0.07, 0.025, "ceramic", "detail", bucket)
    panel(w, point(m, 0, y + 2.3, -2), u, (0, 1, 0), 1.15, 1.4,
          tuple(-v for v in n), 0.1, 0.04, "alloyDark", "detail", bucket)
    for x in (-1.5, 0, 1.5):
        local_beam(w, m, (x, y + 3.35, 2.015), (x, y + 4.3, 2.015), 0.08, "alloyDark", "detail")
    local_beam(w, m, (-1.75, y + 3.24, 2.04), (1.75, y + 3.24, 2.04), 0.07, "light", "detail")
    label(w, f"{m['district']:02d}", point(m, 0, y + 0.35, 2.085), u, normal=n,
          height=0.48, slot="alloyDark", bucket=bucket)
    for x in (-3.25, 3.25):
        lamp(w, m, x, -0.5)
    for x in (-1.8, 1.8):
        bollard(w, m, x, 3.0)
