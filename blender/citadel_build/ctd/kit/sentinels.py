"""Tapered ceramic monoliths with a structural blade and recessed light channel."""

from ..geom.detail import label, panel
from ..geom.polygon import transform
from .buildings import basis
from .shells import point, rounded_profile


def build(w, m):
    width, height, depth = m["size"]
    y, bucket = m["y"], f"D{m['district']}"
    top = width * 0.65
    profiles = [transform(rounded_profile(a, a, 0.25, 3), m["at"], m["yaw"])
                for a in (width, width * 0.92, top)]
    w.loft(profiles, [y, y + 1.5, y + height - 1.2], "ceramic", bucket=bucket, caps=False)
    # A capstone: the shaft's last course flares into a drip cap and closes in a low pyramidion.
    cap = [transform(rounded_profile(a, a, 0.25, 3), m["at"], m["yaw"]) for a in (top, top + 0.55, top + 0.55, top * 0.5)]
    w.loft(cap, [y + height - 1.2, y + height - 0.7, y + height - 0.35, y + height + 0.45],
           "ceramicBand", bucket=bucket)
    u, n = basis(m, (1, 0, 0)), basis(m, (0, 0, 1))
    slope = basis(m, (0, 1, -width * 0.175 / height))
    centre = point(m, 0, y + height / 2, depth * 0.4125 + 0.015)
    panel(w, centre, u, slope, width * 0.29, height - 1.5,
          n, 0.19, 0.04, "alloyDark", "mass", bucket)
    panel(w, point(m, 0, y + height / 2, depth * 0.4125 + 0.22), u, slope,
          0.13 if width < 4 else 0.2, height - 3,
          n, 0.025, 0.01, "light", "artic", bucket)
    for h in (3, 6, 9):
        for sign in (-1, 1):
            distance = depth / 2 - depth * 0.175 * h / height
            panel(w, point(m, sign * width * 0.29, y + h, distance), u, slope,
                  width * 0.22, 1.42, n, 0.055, 0.02, "ceramic", "detail", bucket)
    label(w, "H", point(m, 0, y + 0.35, depth / 2 + 0.06), u, normal=n,
          height=0.8, slot="alloyDark", bucket=bucket)
