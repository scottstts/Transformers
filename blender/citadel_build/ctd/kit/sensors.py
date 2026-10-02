"""Petal reflectors, structural back frames, lattice masts and exhaust assemblies."""

import math

from ..geom.detail import oriented_ring, ribbon, tube
from .shells import local_beam, local_face, point, radial


def dish(w, m):
    y, bucket = m["y"], f"D{m['district']}"
    radial(w, m, [(15, y), (14.2, y + 1.5), (14, y + 4)], ["ceramicBand", "ceramic"], sides=64)
    radial(w, m, [(2.4, y + 4), (1.8, y + 10)], ["alloyDark"], sides=24)
    tilt = math.radians(35)
    n, u, v = (math.sin(tilt), math.cos(tilt), 0), (math.cos(tilt), -math.sin(tilt), 0), (0, 0, 1)
    centre = (0, y + 13, 0)

    def p(r, a, offset=0):
        sag = r * r / 60 + offset
        return tuple(centre[i] + r * math.cos(a) * u[i] + r * math.sin(a) * v[i] + sag * n[i] for i in range(3))

    def norm(r, a):
        d = tuple(n[i] - r / 30 * (math.cos(a) * u[i] + math.sin(a) * v[i]) for i in range(3))
        length = math.sqrt(sum(x * x for x in d))
        return tuple(x / length for x in d)

    # Twelve ceramic petals have real reveal edges; the back frame owns their seams.
    for petal in range(12):
        a0, a1 = petal * math.tau / 12 + 0.002, (petal + 1) * math.tau / 12 - 0.002
        for row in range(6):
            r0, r1 = 0.5 + row * 12.5 / 6, 0.5 + (row + 1) * 12.5 / 6
            for col in range(6):
                a, b = a0 + col * (a1 - a0) / 6, a0 + (col + 1) * (a1 - a0) / 6
                local_face(w, m, [p(r0, a), p(r0, b), p(r1, b), p(r1, a)], "ceramic",
                           normals=[norm(r0, a), norm(r0, b), norm(r1, b), norm(r1, a)])
                # The shell is 0.12 m thick: its back skin, and the reveals at its sides and rim, each facing out.
                local_face(w, m, [p(r1, a, -0.12), p(r1, b, -0.12), p(r0, b, -0.12), p(r0, a, -0.12)], "ceramic",
                           normals=[tuple(-x for x in norm(r, s)) for r, s in ((r1, a), (r1, b), (r0, b), (r0, a))])
                if row == 5:
                    local_face(w, m, [p(r1, a), p(r1, b), p(r1, b, -0.12), p(r1, a, -0.12)], "ceramicBand")
        for a, side in ((a0, -1), (a1, 1)):
            for row in range(6):
                r0, r1 = 0.5 + row * 12.5 / 6, 0.5 + (row + 1) * 12.5 / 6
                face = [p(r0, a), p(r0, a, -0.12), p(r1, a, -0.12), p(r1, a)]
                local_face(w, m, face if side > 0 else face[::-1], "ceramicBand")
        path = [point(m, *p(0.5 + j * 12.5 / 24, petal * math.tau / 12, -0.18)) for j in range(25)]
        ribbon(w, path, 0.38, 0.4, "alloyDark", "artic", bucket)
    for r in (3.8, 8.0, 12.85):
        c = tuple(centre[i] + n[i] * (r * r / 60 - 0.22) for i in range(3))
        oriented_ring(w, point(m, *c), n, r, 0.3, 0.32, "alloyDark", "artic", bucket, 72)
    # A gimbal and two yoke arms carry the dish hub.
    for sign in (-1, 1):
        local_beam(w, m, (sign * 2, y + 4, 0), (sign * 2, y + 12.5, 0), 0.75)
        local_beam(w, m, (sign * 2, y + 12.5, 0), p(2.1, sign * math.pi / 2, -0.35), 0.6)
    local_beam(w, m, (-2.4, y + 12.5, 0), (2.4, y + 12.5, 0), 0.8)
    feed = tuple(centre[i] + n[i] * 7 for i in range(3))
    for a in (0, math.tau / 3, math.tau * 2 / 3):
        local_beam(w, m, p(12.8, a), feed, 0.24, lod="artic")
    tube(w, [point(m, *(feed[i] - n[i] * 0.8 for i in range(3))), point(m, *feed)],
         0.42, "alloyLight", "artic", bucket, 16)


def mast(w, m):
    y, h = m["y"], m["size"][1]
    radial(w, m, [(6, y), (5.2, y + 2), (5, y + 4)], ["ceramicBand", "ceramic"], sides=24)
    def p(j, height):
        a = j * math.tau / 3
        r = 4 - 3.2 * (height - 4) / (h - 4)
        return (r * math.cos(a), y + height, r * math.sin(a))
    for j in range(3):
        local_beam(w, m, p(j, 4), p(j, h), 0.55)
    for lo in range(4, int(h), 6):
        hi = min(h, lo + 6)
        for j in range(3):
            local_beam(w, m, p(j, lo), p((j + 1) % 3, lo), 0.28, lod="artic")
            local_beam(w, m, p(j, lo), p((j + 1) % 3, hi), 0.22, lod="artic")
            local_beam(w, m, p((j + 1) % 3, lo), p(j, hi), 0.22, lod="artic")


def stack(w, m):
    y, height = m["y"], m["size"][1]
    radial(w, m, [(3.5, y), (3.3, y + 3), (3.3, y + height - 1), (3.5, y + height)],
           ["ceramicBand", "ceramic", "alloyDark"], sides=48, caps=False)
    radial(w, m, [(3, y + height - 1.2), (3, y + height - 0.3)], ["glass"], sides=48)
    bucket = f"D{m['district']}"
    for h in (6, 12, 18, 24, 30, 36, 42, 47):
        w.ring(*m["at"], 3.41, 0.28, y + h, 0.55, "alloyDark", "artic", bucket, 48, inner_wall=False)
