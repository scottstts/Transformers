"""Cordonata surfaces, raised ramp sides and the supported crown span."""

import math

from ..geom.detail import ribbon
from ..plan import unit


def build(w, plan):
    for r in plan["ramps"]:
        ramp(w, r)
    for ident, a, b in (("R1 front", (-26, 324.4), (26, 324.4)),
                        ("R2 end", (-334, 65.6), (-310, 65.6)),
                        ("R3 end", (310, 65.6), (334, 65.6)),
                        ("R2 landing side", (-334.4, 66), (-334.4, 90)),
                        ("R3 landing side", (334.4, 66), (334.4, 90))):
        bucket = "D0" if "R1" in ident else "D1" if "R2" in ident else "D2"
        w.beam((a[0], 8.7, a[1]), (b[0], 8.7, b[1]), 0.8, 1.4, "ceramic", bucket=bucket)
    crown_arch(w)


def ramp(w, r):
    a, b = r["axis"]
    length = math.dist(a, b)
    direction = unit((b[0] - a[0], b[1] - a[1]))
    t = (-direction[1], direction[0])
    half = max(abs((v[0] - a[0]) * t[0] + (v[1] - a[1]) * t[1]) for v in r["polygon"])
    y0, y1 = r["y"]
    steps = math.ceil(max((y1 - y0) / 0.15, length / 1.05))
    bucket = f"D{r['district']}"
    slot = "deck" if r["surface"] == "deck" else "paving"

    def p(distance, side, y):
        return (a[0] + direction[0] * distance + t[0] * side, y,
                a[1] + direction[1] * distance + t[1] * side)

    for j in range(steps):
        lo, hi = j * length / steps, (j + 1) * length / steps
        height = y0 + (y1 - y0) * (j + 0.5) / steps
        w.polygon([p(lo, -half, height), p(hi, -half, height), p(hi, half, height), p(lo, half, height)], slot, bucket=bucket)
        previous = y0 if j == 0 else y0 + (y1 - y0) * (j - 0.5) / steps
        w.polygon([p(lo, half, previous), p(lo, -half, previous), p(lo, -half, height), p(lo, half, height)], "ceramicBand", bucket=bucket)
        if j % 4 == 0:
            w.beam(p(lo + 0.025, -half, height + 0.015), p(lo + 0.025, half, height + 0.015),
                   0.05, 0.03, "alloyLight", "artic", bucket)
    # The last half riser meets the upper landing exactly.
    previous = y1 - (y1 - y0) * 0.5 / steps
    w.polygon([p(length, -half, previous), p(length, half, previous), p(length, half, y1), p(length, -half, y1)], "ceramicBand", bucket=bucket)
    for sign in (-1, 1):
        side = sign * half
        if r["id"] == "R7":
            # The land segment has a real embankment; the chasm segment has a fascia.
            for lo, hi, bottom in ((0, 52, 16), (52, 80, None)):
                yl, yh = y0 + (y1 - y0) * lo / length, y0 + (y1 - y0) * hi / length
                low0, low1 = (bottom, bottom) if bottom is not None else (yl - 2.4, yh - 2.4)
                face = [p(lo, side, low0), p(hi, side, low1), p(hi, side, yh), p(lo, side, yl)]
                w.polygon(face if sign == -1 else face[::-1], "ceramicBand", bucket=bucket)
        else:
            face = [p(0, side, y0), p(length, side, y0), p(length, side, y1)]
            w.polygon(face if sign == -1 else face[::-1], "ceramicBand", bucket=bucket)
        w.beam(p(0, side + sign * 0.4, y0 + 0.7), p(length, side + sign * 0.4, y1 + 0.7),
               0.8, 1.4, "ceramic", bucket=bucket)
        w.beam(p(0, side + sign * 0.35, y0 + 1.23), p(length, side + sign * 0.35, y1 + 1.23),
               0.1, 0.12, "light", "artic", bucket)


def crown_arch(w):
    for x in (-11, 11):
        path = []
        for j in range(33):
            t = j / 32
            path.append((x, 4 + 16.2 * 4 * t * (1 - t), 98 - 28 * t))
        ribbon(w, path, 1.8, 1.6, "alloyDark", "mass", "D10")
        for j in range(1, 8):
            t = j / 8
            z = 98 - 28 * t
            arch_y = 4 + 16.2 * 4 * t * (1 - t)
            deck_y = 16 + (150 - z) * 0.1 - 0.8
            if deck_y > arch_y + 0.1:
                w.beam((x, arch_y, z), (x, deck_y, z), 0.7, slot="alloyDark", bucket="D10")
    for z in (98, 70):
        w.box((0, 2.5, z), (28, 3, 3), "ceramicBand", bucket="D10")
