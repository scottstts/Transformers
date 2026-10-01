"""Lamellar vaults, diagonal condenser cages, fin banks and cargo assemblies."""

import math

from ..geom.detail import label, oriented_ring, panel, ribbon, tube
from .buildings import basis, clad
from .shells import block, local_beam, local_face, point, radial


def hangar(w, m):
    width, height, depth = m["size"]
    y0, bucket = m["y"], f"D{m['district']}"
    original = m["size"][:]
    m["size"][1] = 12
    block(w, m, radius=0.6, top=False)
    clad(w, m, 12)
    m["size"] = original
    # Eight independently hung vault shells, each on a continuous load-bearing arch.
    for bay in range(8):
        z0, z1 = -depth / 2 + bay * 8, -depth / 2 + (bay + 1) * 8
        arch_y = y0 + 12 + bay * 0.055
        for j in range(32):
            a, b = j * math.pi / 32, (j + 1) * math.pi / 32
            x0, x1 = math.cos(a) * width / 2, math.cos(b) * width / 2
            h0, h1 = arch_y + math.sin(a) * 12, arch_y + math.sin(b) * 12
            normal_a = (math.cos(a) * 12, math.sin(a) * width / 2, 0)
            normal_b = (math.cos(b) * 12, math.sin(b) * width / 2, 0)
            normal_a = tuple(v / math.sqrt(sum(q * q for q in normal_a)) for v in normal_a)
            normal_b = tuple(v / math.sqrt(sum(q * q for q in normal_b)) for v in normal_b)
            local_face(w, m, [(x0, h0, z0 + 0.03), (x1, h1, z0 + 0.03),
                             (x1, h1, z1 - 0.03), (x0, h0, z1 - 0.03)], "ceramic",
                       normals=[normal_a, normal_b, normal_b, normal_a])
        path = [point(m, math.cos(j * math.pi / 48) * (width / 2 + 0.15),
                      arch_y + math.sin(j * math.pi / 48) * 12, z0) for j in range(49)]
        ribbon(w, path, 0.65, 0.75, "alloyDark", "artic", bucket)
        # A champagne locking strip follows the arch rather than floating across it.
        ribbon(w, [point(m, math.cos(j * math.pi / 48) * (width / 2 + 0.18),
                              arch_y + math.sin(j * math.pi / 48) * 12.06, z0 + 0.38) for j in range(49)],
               0.14, 0.12, "alloyLight", "detail", bucket)
    profile = [(math.cos(j * math.pi / 32) * width / 2, y0 + 12 + math.sin(j * math.pi / 32) * 12)
               for j in range(33)]
    for z, reverse in ((-depth / 2, True), (depth / 2, False)):
        local_face(w, m, [(x, y, z) for x, y in (profile[::-1] if reverse else profile)], "ceramicBand")
    # Segmented main leaf is closed, distinct from the two shallow rollout service bays.
    front = depth / 2 + 0.18
    for i in range(7):
        panel(w, point(m, 0, y0 + 1 + i * 2, front), basis(m, (1, 0, 0)), (0, 1, 0), 13.8, 1.9,
              basis(m, (0, 0, 1)), 0.1, 0.04, "alloyDark", "artic", bucket)
    for x in (-7.5, 7.5):
        local_beam(w, m, (x, y0, front + 0.2), (x, y0 + 14, front + 0.2), 0.7, "ceramicBand")
    label(w, "DRONE HANGAR", point(m, 0, y0 + 16, front), basis(m, (1, 0, 0)),
          normal=basis(m, (0, 0, 1)), height=1.5, bucket=bucket)
    for x in (-20, 20):
        for z in (-28, -12, 4, 20):
            path = [point(m, x, y0, z), point(m, x, y0 + 1, z),
                    point(m, x * 1.04, y0 + 10, z), point(m, x, y0 + 12, z)]
            ribbon(w, path, 1.2, 1.6, "ceramicBand", "mass", bucket)


def condenser(w, m):
    y, bucket = m["y"], f"D{m['district']}"

    def radius(h):
        return 8 + 5 * ((h - 24) / 24) ** 2 if h <= 24 else 8 + 1.5 * ((h - 24) / 12) ** 2

    profile = [(radius(j * 0.75), y + j * 0.75) for j in range(49)]
    radial(w, m, profile, sides=64, caps=False)
    # Opposed diagonal load paths track the exact shared hyperboloid field.
    for sign in (-1, 1):
        for j in range(16):
            r = radius(0) + 0.18
            angle = j * math.tau / 16
            path = [point(m, r * math.cos(angle), y, r * math.sin(angle)),
                    point(m, r * math.cos(angle), y + 0.45, r * math.sin(angle))]
            for k in range(1, 37):
                h = k
                angle = j * math.tau / 16 + sign * h / 36 * 1.15
                r = radius(h) + 0.18
                path.append(point(m, r * math.cos(angle), y + h, r * math.sin(angle)))
            ribbon(w, path, 0.3, 0.32, "alloyDark", "artic", bucket)
    for h in (0.3, 0.9, 1.5, 2.1, 2.7, 3.3, 3.9):
        w.ring(*m["at"], radius(h) + 0.24, 0.28, y + h, 0.25, "alloyDark", "artic", bucket, 64)
    w.ring(*m["at"], 9.5, 0.8, y + 35.3, 0.7, "alloyDark", "mass", bucket, 64)
    # Recessed black mouth with a supported internal baffle, keeping the vessel exterior-only.
    radial(w, m, [(8.7, y + 34.6), (8.7, y + 35.3)], ["glass"], sides=64)
    for j in range(8):
        a = j * math.tau / 8
        local_beam(w, m, (0, y + 34.5, 0), (8.6 * math.cos(a), y + 34.5, 8.6 * math.sin(a)), 0.4)


def heatbank(w, m):
    width, height, depth = m["size"]
    y, bucket = m["y"], f"D{m['district']}"
    for j in range(40):
        x = -width / 2 + 0.4 + j * 0.8
        # Each fin has a shaped thermal shoulder and a true 0.2 m gauge.
        p = [(-depth / 2, y), (depth / 2, y), (depth / 2, y + height - 1.2),
             (depth / 2 - 1.2, y + height), (-depth / 2 + 1.2, y + height), (-depth / 2, y + height - 1.2)]
        left = [(x - 0.1, h, z) for z, h in p]
        right = [(x + 0.1, h, z) for z, h in p]
        local_face(w, m, left, "alloyDark", "artic")
        local_face(w, m, right[::-1], "alloyDark", "artic")
        for k in range(len(p)):
            q = (k + 1) % len(p)
            local_face(w, m, [left[k], right[k], right[q], left[q]], "alloyDark", "artic")
    for x in (-width / 2, width / 2):
        for z in (-depth / 2, depth / 2):
            local_beam(w, m, (x, y, z), (x, y + height, z), 1.3, "ceramic")
        local_beam(w, m, (x, y + height, -depth / 2), (x, y + height, depth / 2), 1.3, "ceramic")
    for z in (-3, 3):
        local_beam(w, m, (-width / 2, y + 2, z), (width / 2, y + 2, z), 0.8)
    # The permanent spine remains when articulation is distance-hidden.
    local_beam(w, m, (-width / 2, y + height / 2, 0), (width / 2, y + height / 2, 0), 1.3, "alloyDark", "mass", height - 2)


def cargo(w, m):
    width, height, depth = m["size"]
    y0, bucket = m["y"], f"D{m['district']}"
    count = 2 if height > 5 else 1
    saved = m["size"][:]
    for j in range(count):
        y = y0 + j * 4.4
        m["size"] = [width, 4.1, depth]
        block(w, m, base=y + 0.3, radius=0.5, bottom=True)
        for x in (-5.25, 5.25):
            for z in (-depth / 2 - 0.03, depth / 2 + 0.03):
                local_beam(w, m, (x, y + 0.3, z), (x, y + 4.4, z), 0.22)
            local_beam(w, m, (x, y + 4.4, -depth / 2), (x, y + 4.4, depth / 2), 0.22)
        for x in (-3.9, 3.9):
            local_beam(w, m, (x, y + 0.15, -depth / 2), (x, y + 0.15, depth / 2), 0.55, "alloyDark", "mass", 0.3)
        label(w, f"C-{m['index']:02d}", point(m, 0, y + 1.8, depth / 2 + 0.03),
              basis(m, (1, 0, 0)), normal=basis(m, (0, 0, 1)), height=0.9, bucket=bucket)
    m["size"] = saved


def cistern_details(w, m):
    y, bucket = m["y"], f"D{m['district']}"
    for h in (2, 7, 10):
        w.ring(*m["at"], 8.9, 0.18, y + h, 0.45, "alloyDark", "artic", bucket, 64)
    for j in range(6):
        a = j * math.tau / 6
        local_beam(w, m, (8.8 * math.cos(a), y + 0.3, 8.8 * math.sin(a)),
                   (8.7 * math.cos(a), y + 9.8, 8.7 * math.sin(a)), 0.15, lod="artic")


def pipe_network(w, plan):
    condensers = [m for m in plan["modules"] if m["kind"] == "condenser"]
    cisterns = [m for m in plan["modules"] if m["kind"] == "cistern"]
    for c in cisterns:
        target = min(condensers, key=lambda m: math.dist(c["at"], m["at"]))
        a, b = c["at"], target["at"]
        delta = (b[0] - a[0], b[1] - a[1])
        length = math.hypot(*delta)
        direction = tuple(x / length for x in delta)
        start = (a[0] + direction[0] * 8.8, 2.7, a[1] + direction[1] * 8.8)
        end = (b[0] - direction[0] * 12.8, 2.7, b[1] - direction[1] * 12.8)
        if math.dist(start, end) < 1:
            continue
        tube(w, [start, end], 0.7, bucket="D3")
        length = math.dist(start, end)
        for j in range(max(1, math.ceil(length / 10)) + 1):
            t = j / max(1, math.ceil(length / 10))
            x, z = start[0] + t * (end[0] - start[0]), start[2] + t * (end[2] - start[2])
            w.box((x, 0.35, z), (1.8, 0.7, 1.8), "ceramicBand", "detail", "D3")
            w.beam((x, 0.7, z), (x, 2.2, z), 0.65, slot="alloyDark", lod="detail", bucket="D3")
            oriented_ring(w, (x, 2.7, z), (direction[0], 0, direction[1]), 0.76, 0.14, 0.4,
                          "alloyLight", "detail", "D3", 16)
