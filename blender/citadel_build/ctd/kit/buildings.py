"""Authored building assemblies: shell bays, stepped roofs and clerestories."""

import math

from ..geom.detail import grid, label, panel, ribbon
from ..geom.polygon import transform
from .shells import annulus, block, local_beam, local_face, point, rounded_profile


def basis(m, direction):
    x, y, z = direction
    c, s = math.cos(m["yaw"]), math.sin(m["yaw"])
    return (c * x + s * z, y, -s * x + c * z)


def cornice(w, m, y, width=None, depth=None, radius=0.6, grow=0.55):
    """A rolled drip edge at a roofline: it flares out of the wall and its top ring meets the roof."""
    width, depth = width or m["size"][0], depth or m["size"][2]
    bucket = "spire" if m["kind"] == "spire" else f"D{m['district']}"
    stages = [(y - 1.0, 0.0), (y - 0.45, grow * 0.6), (y, grow)]
    profiles = [transform(rounded_profile(width + 2 * g, depth + 2 * g, radius + g), m["at"], m["yaw"])
                for _, g in stages]
    w.loft(profiles, [h for h, _ in stages], "ceramicBand", "mass", bucket, caps=False)
    annulus(w, profiles[-1], profiles[0], y, True, "ceramicBand", "mass", bucket)


def clad(w, m, height, radius=0.6, floor=None, width=None, depth=None, frieze=0.0):
    """Panelled walls: 3 x 1.5 m shells, tone-on-tone ribs, and dark alloy courses every 12 m.

    A frieze leaves the topmost metres plain, for a cornice to sit over.
    """
    width, depth = width or m["size"][0], depth or m["size"][2]
    floor = m["y"] if floor is None else floor
    bucket = "spire" if m["kind"] == "spire" else f"D{m['district']}"
    sides = [((-width / 2 + radius, depth / 2), (1, 0, 0), (0, 0, 1), width - 2 * radius, True),
             ((width / 2, depth / 2 - radius), (0, 0, -1), (1, 0, 0), depth - 2 * radius, False),
             ((width / 2 - radius, -depth / 2), (-1, 0, 0), (0, 0, -1), width - 2 * radius, False),
             ((-width / 2, -depth / 2 + radius), (0, 0, 1), (-1, 0, 0), depth - 2 * radius, False)]
    for origin, local_u, local_n, distance, front in sides:
        u, n = basis(m, local_u), basis(m, local_n)
        x0, z0 = origin
        nx, ny = max(1, math.ceil(distance / 3)), max(1, math.ceil(height / 1.5))
        dx, dy = distance / nx, height / ny
        for j in range(nx):
            x, z = x0 + local_u[0] * (j + 0.5) * dx, z0 + local_u[2] * (j + 0.5) * dx
            for k in range(ny):
                y = floor + (k + 0.5) * dy
                if y + dy / 2 > floor + height - frieze + 1e-6:
                    continue
                if front and any(abs(x - b["x"]) < b["width"] / 2 + dx / 2 + 0.65
                                 and b["floor"] - dy / 2 < y < b["floor"] + b["height"] + dy / 2 + 1.0 for b in m.get("bays", [])):
                    continue
                panel(w, point(m, x, y, z), u, (0, 1, 0), dx - 0.04, dy - 0.04,
                      n, 0.08, 0.025, "ceramic", "detail" if y - floor < 12 else "artic", bucket)
        for pos in range(6, int(distance), 6):
            x, z = x0 + local_u[0] * pos, z0 + local_u[2] * pos
            if front and any(abs(x - b["x"]) < b["width"] / 2 + 0.8 for b in m.get("bays", [])):
                continue
            panel(w, point(m, x, floor + (height - frieze) / 2, z), u, (0, 1, 0), 0.5, height - frieze - 0.3,
                  n, 0.2, 0.05, "ceramicBand", "artic", bucket)
        for y in range(math.ceil(floor / 6) * 6 + 6, int(floor + height), 6):
            # Bay mouths remain unobstructed; these are actual fabricated band segments.
            for j in range(nx):
                x, z = x0 + local_u[0] * (j + 0.5) * dx, z0 + local_u[2] * (j + 0.5) * dx
                if front and any(abs(x - b["x"]) < b["width"] / 2 + dx / 2 + 0.5
                                 and b["floor"] < y < b["floor"] + b["height"] for b in m.get("bays", [])):
                    continue
                panel(w, point(m, x, y, z), u, (0, 1, 0), dx - 0.02, 0.6 if y % 12 == 0 else 0.45,
                      n, 0.23 if y % 12 == 0 else 0.18, 0.04,
                      "alloyDark" if y % 12 == 0 else "ceramicBand", "mass", bucket)


def build(w, m):
    kind, y = m["kind"], m["y"]
    width, height, depth = m["size"]
    bucket = f"D{m['district']}"
    original = m["size"][:]
    if kind == "barracks":
        m["size"][1] = 14
        roof_holes = [[(-width / 2 + j * 12, -depth / 2), (-width / 2 + (j + 1) * 12 - 2, -depth / 2),
                       (-width / 2 + (j + 1) * 12 - 2, depth / 2), (-width / 2 + j * 12, depth / 2)] for j in range(6)]
        block(w, m, radius=2, top_holes=roof_holes)
        clad(w, m, 14, 2)
        m["size"] = original
        for j in range(6):
            x0, x1 = -width / 2 + j * 12, -width / 2 + (j + 1) * 12
            z0, z1 = -depth / 2, depth / 2
            # Ceramic ramped roof, vertical glazing and a genuine sloping end profile.
            roof = [(x0, y + 14.15, z0), (x1 - 2, y + 17.8, z0),
                    (x1 - 2, y + 17.8, z1), (x0, y + 14.15, z1)]
            local_face(w, m, roof[::-1], "ceramicBand")
            local_face(w, m, [(x1 - 2, y + 14, z0), (x1 - 2, y + 17.8, z0),
                             (x1 - 2, y + 17.8, z1), (x1 - 2, y + 14, z1)], "glass")
            for z, reverse in ((z0, False), (z1, True)):
                end = [(x0, y + 14, z), (x1 - 2, y + 14, z), (x1 - 2, y + 17.8, z)]
                local_face(w, m, end[::-1] if reverse else end, "ceramic")
            for z in range(-int(depth / 2) + 1, int(depth / 2), 3):
                local_beam(w, m, (x1 - 1.95, y + 13.7, z), (x1 - 1.95, y + 17.8, z), 0.2, lod="artic")
        label(w, "BARRACKS", point(m, 0, y + 11, depth / 2 + 0.35), basis(m, (1, 0, 0)),
              normal=basis(m, (0, 0, 1)), height=1.3, bucket=bucket)
    elif kind in ("armoury", "fabrication"):
        base_height = 16 if kind == "armoury" else 22
        m["size"][1] = base_height
        block(w, m, radius=1.5, top_holes=[rounded_profile(width * 0.86, depth * 0.86, 1.5)])
        clad(w, m, base_height, 1.5, frieze=1.5)
        cornice(w, m, y + base_height, radius=1.5)
        bays, m["bays"] = m["bays"], []
        for j, (fraction, h) in enumerate(((0.86, 5), (0.67, 3)) if kind == "armoury" else ((0.86, 4),)):
            m["size"] = [width * fraction, h, depth * fraction]
            next_holes = [rounded_profile(width * 0.67, depth * 0.67, 1.5)] if kind == "armoury" and j == 0 else []
            block(w, m, base=y + base_height, radius=1.5, slot="ceramicBand", top_holes=next_holes)
            clad(w, m, h, 1.5, floor=y + base_height, width=width * fraction, depth=depth * fraction,
                 frieze=1.5 if h > 3 else 0)
            if h > 3:
                cornice(w, m, y + base_height + h, width * fraction, depth * fraction, 1.5)
            base_height += h
        m["size"], m["bays"] = original, bays
        # Armoured louvres sit above the bay cassette, outside its clearance envelope.
        for b in bays:
            for h in (b["floor"] + b["height"] + 1.5, b["floor"] + b["height"] + 2.3):
                local_beam(w, m, (b["x"] - b["width"] / 2, h, depth / 2 + 0.4),
                           (b["x"] + b["width"] / 2, h, depth / 2 + 0.4), 0.45, "alloyDark", "artic", 0.25)
        label(w, "ARMOURY" if kind == "armoury" else "FABRICATION", point(m, 0, y + 13, depth / 2 + 0.4),
              basis(m, (1, 0, 0)), normal=basis(m, (0, 0, 1)), height=1.5, bucket=bucket)
    else:
        corner = 1.5 if kind in ("lift", "sally", "bridge_service") else 0.6
        block(w, m, radius=corner)
        clad(w, m, height, corner, frieze=1.5)
        cornice(w, m, y + height, radius=corner)
        if kind == "lift":
            # External rails, tie beams and a hoist head define an actual lift mechanism.
            for x in (-7.5, 7.5):
                for z in (-depth / 2 - 0.4, depth / 2 + 0.4):
                    local_beam(w, m, (x, y, z), (x, y + height + 1.0, z), 0.7)
            for h in range(12, int(height), 6):
                local_beam(w, m, (-7.5, y + h, depth / 2 + 0.6), (7.5, y + h, depth / 2 + 0.6), 0.5)
            label(w, "FREIGHT", point(m, 0, y + 27, depth / 2 + 0.65), basis(m, (1, 0, 0)),
                  normal=basis(m, (0, 0, 1)), height=1.4, bucket=bucket)
