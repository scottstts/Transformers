"""Fabricated 16-facet drums: bell-flared fluted shafts, corbelled crowns, domes and lanterns.

The shaft is a stack of stations. Where two stations share a height the radius steps, and a
shoulder annulus closes the step, so no band, seam or flute stop leaves a crack into the shell.
Every ring of the crown reuses the shaft's chord points, so the parts meet without T-junctions.
"""

import math

from ..geom.detail import panel, ribbon
from ..geom.writer import normal as face_normal
from .buildings import basis
from .shells import block, local_beam, local_face, point, radial

FACETS = 16
FLUTE = 0.3
FLUTE_AT = (0.47, 0.53)
PER_FACET = 3
SIDES = FACETS * PER_FACET
SKIRT = 9
BAND_RECESS = 0.12


def profile(radius, depth=FLUTE):
    """Five points per facet: corner, flute shoulder, channel floor pair, flute shoulder."""
    points = []
    for j in range(FACETS):
        a, b = j * math.tau / FACETS, (j + 1) * math.tau / FACETS
        pa, pb = (radius * math.cos(a), radius * math.sin(a)), (radius * math.cos(b), radius * math.sin(b))
        n = (math.cos((a + b) / 2), math.sin((a + b) / 2))
        for t, inset in ((0, 0), (0.47, 0), (0.47, depth), (0.53, depth), (0.53, 0)):
            points.append((pa[0] + (pb[0] - pa[0]) * t - n[0] * inset,
                           pa[1] + (pb[1] - pa[1]) * t - n[1] * inset))
    return points


def shaft_radius(m, base, reference):
    """Circumscribed radius by height. Towers settle from a bell foot into a gentle taper."""
    kind, y0, r0 = m["kind"], m["y"], m["size"][0] / 2
    if m["bays"]:
        r0 *= 0.9

    def radius(y):
        if kind == "pinnacle" and y < y0:
            # The foundation column swells to a 6 m pier below the deck.
            t, rise = y0 - y, y0 - base
            slope = 0.12 * r0 / (reference - y0)
            return r0 + slope * t + (6 - r0 - slope * rise) * (t / rise) ** 2
        t = (y - y0) / max(1, reference - y0)
        if kind == "tower":
            r_top = r0 * 0.875
            return r_top + (r0 - r_top) * (1 - t) ** 3
        return r0 * (1 - 0.12 * t)

    return radius


def stations(m, base, top):
    """Ordered (height, radial inset, flute depth) stations; equal heights are shoulders."""
    y0 = m["y"]
    # Flutes ramp in over the first 0.9 m, so the base ring is a plain 16-gon that a deck or
    # service block can meet exactly.
    out = [(base, 0.0, 0.0)]

    def add(y, inset=0.0, depth=FLUTE):
        if (y, inset, depth) != out[-1]:
            out.append((y, inset, depth))

    add(base + 0.9)
    heights = {}
    if m["kind"] == "tower":
        for k in range(1, SKIRT):
            heights[y0 + k] = "skirt"
    for j in range(math.ceil(base / 3), math.floor(top / 3) + 1):
        h = j * 3
        if j % 2 == 0 and base + 0.5 < h < top - 1.2:
            heights[h] = "band"
    for h in sorted(heights):
        kind = heights[h]
        if kind == "band":
            add(h - 0.2)
            add(h - 0.2, BAND_RECESS)
            add(h + 0.2, BAND_RECESS)
            add(h + 0.2)
        else:
            add(h)
    # Flutes end in a ramped stop under the cornice, so the top ring is a plain 16-gon.
    add(top - 0.9)
    add(top, 0.0, 0.0)
    return out


def shaft(w, m, base, top, radius, lit_from):
    rows = stations(m, base, top)
    rings = [profile(radius(y) - inset, depth) for y, inset, depth in rows]
    n = len(rings[0])
    tower = m["kind"] == "tower"
    for i in range(len(rows) - 1):
        (ya, in_a, _), (yb, in_b, _) = rows[i], rows[i + 1]
        a, b = rings[i], rings[i + 1]
        if yb == ya:
            # Shoulder: faces up where the surface steps inward, down where it steps back out.
            up = in_b > in_a
            slot = "alloyDark"
            for j in range(n):
                k = (j + 1) % n
                face = [(a[j][0], ya, a[j][1]), (a[k][0], ya, a[k][1]),
                        (b[k][0], ya, b[k][1]), (b[j][0], ya, b[j][1])]
                if (face_normal(face)[1] > 0) != up:
                    face.reverse()
                local_face(w, m, face, slot)
            continue
        band = in_a >= BAND_RECESS and in_b >= BAND_RECESS
        skirt = tower and yb <= m["y"] + SKIRT + 1e-6
        for j in range(n):
            k = (j + 1) % n
            channel = j % 5 in (1, 2, 3)
            if band:
                slot = "alloyDark"
            elif channel:
                slot = "alloyDark" if ya >= lit_from else "ceramicBand"
            else:
                slot = "ceramicBand" if skirt else "ceramic"
            local_face(w, m, [(a[j][0], ya, a[j][1]), (b[j][0], yb, b[j][1]),
                              (b[k][0], yb, b[k][1]), (a[k][0], ya, a[k][1])], slot)


def lit_channels(w, m, top, radius, lit_from):
    """Light slots in every flute floor: proud plates with real walls, between the seams."""
    low, high = lit_from, top - 2.0
    cuts = [low] + [j * 3 for j in range(math.ceil(low / 3), math.floor(high / 3) + 1) if low < j * 3 < high] + [high]
    bucket = f"D{m['district']}"
    for a, b in zip(cuts, cuts[1:]):
        lo, hi = a + (0.3 if a != low else 0.0), b - (0.3 if b != high else 0.0)
        if hi - lo < 0.6:
            continue
        mid = (lo + hi) / 2
        r = radius(mid)
        drop = (radius(hi) - radius(lo)) / (hi - lo)
        width = min(0.2, 0.6 * 0.06 * 2 * r * math.sin(math.pi / FACETS))
        for facet in range(FACETS):
            angle = (facet + 0.5) * math.tau / FACETS
            n = (math.cos(angle), 0.0, math.sin(angle))
            # The channel floor sits FLUTE inside the chord through the facet's corners.
            chord = r * math.cos(math.pi / FACETS) - FLUTE
            centre = point(m, n[0] * chord, mid, n[2] * chord)
            panel(w, centre, basis(m, (-n[2], 0, n[0])), basis(m, (n[0] * drop, 1, n[2] * drop)),
                  width, hi - lo, basis(m, n), 0.03, 0.008, "light", "artic", bucket)


def corbel(w, m, r_s, y_s, rise, flare, bucket):
    """A cornice that morphs from the 16-gon shaft into a round crown, on bracket ribs."""
    corners = [(r_s * math.cos(i * math.tau / FACETS), r_s * math.sin(i * math.tau / FACETS))
               for i in range(FACETS)]
    chord, facet_normal = [], []
    for i in range(FACETS):
        a, b = corners[i], corners[(i + 1) % FACETS]
        mid = (i + 0.5) * math.tau / FACETS
        for t in (0.0,) + FLUTE_AT:
            chord.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            facet_normal.append((math.cos(mid), math.sin(mid)))
    steps = 6
    rings, weights, slopes = [], [], []
    for s in range(steps + 1):
        t = s / steps
        c = r_s + flare * t ** 1.7
        weight = min(1.0, t / 0.7)
        weight = weight * weight * (3 - 2 * weight)
        k = c / r_s
        ring = []
        for j in range(SIDES):
            a = j * math.tau / SIDES
            p = chord[j]
            ring.append((p[0] * k + (c * math.cos(a) - p[0] * k) * weight, y_s + rise * t,
                         p[1] * k + (c * math.sin(a) - p[1] * k) * weight))
        rings.append(ring)
        weights.append(weight)
        slopes.append(flare * 1.7 * t ** 0.7 / rise)

    def normal_at(s, j, owner):
        a = j * math.tau / SIDES
        fx, fz = facet_normal[owner * PER_FACET]
        x = fx + (math.cos(a) - fx) * weights[s]
        z = fz + (math.sin(a) - fz) * weights[s]
        length = math.hypot(x, z)
        n = (x / length, -slopes[s], z / length)
        length = math.sqrt(sum(v * v for v in n))
        return tuple(v / length for v in n)

    for s in range(steps):
        for j in range(SIDES):
            k = (j + 1) % SIDES
            owner = j // PER_FACET
            local_face(w, m, [rings[s][j], rings[s + 1][j], rings[s + 1][k], rings[s][k]], "ceramicBand",
                       normals=[normal_at(s, j, owner), normal_at(s + 1, j, owner),
                                normal_at(s + 1, k, owner), normal_at(s, k, owner)])
    # Machicolation brackets spring from the facet corners and follow the corbel's curve.
    for i in range(FACETS):
        a = i * math.tau / FACETS
        path = []
        for s in range(steps + 1):
            c = r_s + flare * (s / steps) ** 1.7 + 0.1
            path.append(point(m, c * math.cos(a), y_s + rise * s / steps, c * math.sin(a)))
        ribbon(w, path, 0.5, 0.34, "alloyDark", "mass", bucket,
               scales=[1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75])
    return r_s + flare


def crown_ring(w, m, outer, y, inner):
    """Rolled alloy cornice ring; its top annulus meets the dome or glass drum exactly."""
    radial(w, m, [(outer, y), (outer + 0.2, y + 0.4), (outer + 0.2, y + 1.5), (outer - 0.15, y + 2.0),
                  (inner, y + 2.0)], ["alloyDark"] * 4, sides=SIDES, caps=False)


def build(w, m):
    kind, y0 = m["kind"], m["y"]
    overall = y0 + m["size"][1]
    bucket = f"D{m['district']}"
    # Crown columns run continuously to the chasm bed. The deck is an
    # intersection with their skin, rather than a joint between two shapes.
    base = 1 if kind == "pinnacle" else y0
    if m["bays"]:
        base = y0 + 20
    top = 44 if kind == "lantern" else overall - 9
    radius = shaft_radius(m, base, 48 if kind == "lantern" else overall - 6)
    if m["bays"]:
        # The service block carries the shaft: its roof is an annulus around the shaft's plain foot ring.
        saved = m["size"][:]
        m["size"] = [saved[0], 20, saved[2]]
        foot = [(radius(base) * math.cos(i * math.tau / FACETS), radius(base) * math.sin(i * math.tau / FACETS))
                for i in range(FACETS)]
        block(w, m, radius=2, top_holes=[foot])
        m["size"] = saved
    lit_from = top - 8
    shaft(w, m, base, top, radius, lit_from)
    lit_channels(w, m, top, radius, lit_from)
    r_s = radius(top)
    flare = 1.5 * min(1.0, r_s / 14)
    if kind == "lantern":
        outer = corbel(w, m, r_s, top, 2.0, flare * 0.6, bucket)
        glass = outer - 1.1
        crown_ring(w, m, outer, top + 2.0, glass)
        radial(w, m, [(glass, top + 4.0), (glass, 55.2)], ["glass"], sides=SIDES, caps=False)
        for j in range(32):
            a = j * math.tau / 32
            # Mullions run into the ring below and the cap above, so their ends are buried.
            local_beam(w, m, (glass * math.cos(a), top + 3.7, glass * math.sin(a)),
                       (glass * math.cos(a), 55.6, glass * math.sin(a)), 0.25, lod="artic")
        radial(w, m, [(glass, 55.2), (glass + 0.9, 55.2), (glass + 0.9, 55.7), (glass + 0.4, 56.0), (0.0, 56.0)],
               ["alloyDark", "alloyDark", "ceramicBand", "ceramicBand"], sides=SIDES)
        w.ring(*m["at"], glass + 0.1, 0.16, 49.2, 0.18, "light", "artic", bucket, SIDES)
    else:
        outer = corbel(w, m, r_s, top, 3.0, flare, bucket)
        dome = outer - 0.6
        crown_ring(w, m, outer, top + 3.0, dome)
        base_y = top + 5.0
        arc = [(dome * math.cos(j * math.pi / 32), base_y + (overall - base_y) * math.sin(j * math.pi / 32))
               for j in range(17)]
        arc[-1] = (0.0, overall)
        radial(w, m, arc, sides=SIDES, caps=False)
        if kind == "tower" and m["variant"] == 0:
            mast = [point(m, 0, overall - 0.5, 0), point(m, 0, overall + 3.5, 0), point(m, 0, overall + 8, 0)]
            ribbon(w, mast, 0.6, 0.6, "alloyDark", "mass", bucket, scales=[1.0, 0.7, 0.3])
            for height, radius_ in ((overall + 2, 1.1), (overall + 5, 0.65)):
                w.ring(*m["at"], radius_, 0.2, height, 0.25, "alloyDark", "detail", bucket, 24)
    # Crown-column closure is at the chasm bed, never at the deck intersection.
    if not m["bays"]:
        local_face(w, m, [(x, base, z) for x, z in profile(radius(base), 0.0)], "ceramicBand")
