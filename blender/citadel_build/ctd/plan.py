"""Serializable, metre-scale citadel plan. No Blender or game dependencies."""

import json
import math
from collections import deque
from pathlib import Path

from .geom.polygon import ccw, circle, clip_halfplane, inset, rectangle, subtract_all, transform, triangulate

SEED = 0x48A1C70D
O = [(110, 440), (330, 400), (490, 250), (520, 40), (480, -200), (360, -370),
     (130, -430), (-130, -430), (-360, -370), (-480, -200), (-520, 40),
     (-490, 250), (-330, 400), (-110, 440)]
M = [(200, 300), (310, 190), (310, -140), (200, -250), (-200, -250),
     (-310, -140), (-310, 190), (-200, 300)]
I = [(110, 170), (180, 100), (180, -90), (110, -150), (-110, -150),
     (-180, -90), (-180, 100), (-110, 170)]
C = [(72, 98), (108, 62), (108, -74), (70, -113), (-70, -113),
     (-108, -74), (-108, 62), (-72, 98)]
K = [(60, 70), (80, 50), (80, -62), (58, -85), (-58, -85),
     (-80, -62), (-80, 50), (-60, 70)]

DISTRICTS = [
    ("forecourt", 0, (0, 374), 38, 18),
    ("hangars", 0, (-420, 200), 38, 14),
    ("foundry", 0, (420, 200), 38, 14),
    ("condensers", 0, (-410, -120), 34, 12),
    ("array", 0, (410, -120), 34, 12),
    ("postern", 0, (0, -360), 34, 14),
    ("processional", 1, (0, 263), 28, 16),
    ("barracks", 1, (-230, 20), 32, 16),
    ("hydroponics", 1, (245, 20), 32, 14),
    ("armoury", 1, (-95, -200), 28, 14),
    ("innerWard", 2, (-144, 0), 28, 18),
    ("citadel", 3, (0, 24), 32, 22),
]

REGIONS = [
    [(-200, 300), (200, 300), (330, 400), (110, 440), (-110, 440), (-330, 400)],
    [(-200, 300), (-330, 400), (-490, 250), (-520, 40), (-310, 25), (-310, 190)],
    [(200, 300), (310, 190), (310, 25), (520, 40), (490, 250), (330, 400)],
    [(-310, 25), (-520, 40), (-480, -200), (-360, -370), (-200, -250), (-310, -140)],
    [(310, 25), (310, -140), (200, -250), (360, -370), (480, -200), (520, 40)],
    [(-200, -250), (-360, -370), (-130, -430), (130, -430), (360, -370), (200, -250)],
    [(-110, 170), (110, 170), (200, 300), (-200, 300)],
    [(-110, 170), (-200, 300), (-310, 190), (-310, -140), (-200, -250),
     (-110, -150), (-180, -90), (-180, 100)],
    [(110, 170), (180, 100), (180, -90), (110, -150), (200, -250),
     (310, -140), (310, 190), (200, 300)],
    [(-110, -150), (-200, -250), (200, -250), (110, -150)],
    I,
    K,
]


def unit(v):
    length = math.hypot(*v)
    return [v[0] / length, v[1] / length]


def intersect_convex(poly, clip):
    p = poly
    q = ccw(clip)
    for a, b in zip(q, q[1:] + q[:1]):
        if not p:
            break
        p = clip_halfplane(p, a, b)
    return p


def module(plan, kind, at, size, district, y=0, yaw=0, variant=0, solid=True):
    m = {"index": len(plan["modules"]), "kind": kind, "at": list(at), "yaw": yaw,
         "size": list(size), "variant": variant, "y": y, "district": district,
         "seed": (SEED + len(plan["modules"]) * 0x9E3779B9) & 0xFFFFFFFF,
         "solid": solid, "bays": []}
    if kind in ("condenser", "cistern", "dish", "dome", "tower", "lantern", "pinnacle", "mast", "sentinel"):
        m["footprint"] = circle(*at, size[0] * 0.5, 32 if kind != "sentinel" else 8)
    else:
        m["footprint"] = transform(rectangle(-size[0] / 2, size[0] / 2, -size[2] / 2, size[2] / 2), at, yaw)
    plan["modules"].append(m)
    return m


def bay(plan, m, x=0, width=8, height=9, depth=6, floor=None):
    """A genuine recess into a module's local +z face, with reachable floor."""
    floor = m["y"] if floor is None else floor
    front = m["size"][2] * 0.5
    local = rectangle(x - width / 2, x + width / 2, front - depth, front + 0.2)
    polygon = transform(local, m["at"], m["yaw"])
    at = transform([(x, front - depth + min(3, depth * 0.55))], m["at"], m["yaw"])[0]
    exit_at = transform([(x, front + 4.5)], m["at"], m["yaw"])[0]
    b = {"x": x, "width": width, "height": height, "depth": depth, "floor": floor, "polygon": polygon}
    m["bays"].append(b)
    plan["spawns"].append({"at": list(at), "exit": list(exit_at), "sector": m["district"],
                            "y": floor, "module": m["index"], "width": width, "height": height})
    return b


def segment(plan, a, b, r, owner, y=None):
    plan["colliders"]["segments"].append({"ax": a[0], "az": a[1], "bx": b[0], "bz": b[1],
                                           "r": r, "owner": owner, "y": y})


def circle_collider(plan, at, r, owner, y):
    plan["colliders"]["circles"].append({"x": at[0], "z": at[1], "r": r, "owner": owner, "y": y})


def broken_line(a, b, gaps):
    """Break a run at projected (centre, width) gate gaps."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz)
    intervals = []
    for at, width in gaps:
        t = ((at[0] - a[0]) * dx + (at[1] - a[1]) * dz) / (length * length)
        cross = abs((at[0] - a[0]) * dz - (at[1] - a[1]) * dx) / length
        if cross < 2 and -0.01 <= t <= 1.01:
            intervals.append((max(0, t - width / (2 * length)), min(1, t + width / (2 * length))))
    intervals.sort()
    spans, cursor = [], 0
    for lo, hi in intervals + [(1, 1)]:
        if lo > cursor + 1e-8:
            spans.append(((a[0] + cursor * dx, a[1] + cursor * dz),
                          (a[0] + lo * dx, a[1] + lo * dz)))
        cursor = max(cursor, hi)
    return spans


def gate(plan, identifier, kind, at, out, sectors, width, floor, soffit, outside=None, inside=None):
    n = unit(out)
    g = {"id": identifier, "kind": kind, "at": list(at), "out": n, "sectors": list(sectors),
         "width": width, "y": floor, "soffit": soffit,
         "outside": list(outside or (at[0] + n[0] * 10, at[1] + n[1] * 10)),
         "inside": list(inside or (at[0] - n[0] * 10, at[1] - n[1] * 10))}
    plan["gates"].append(g)
    return g


def ramp(plan, identifier, polygon, axis, heights, district, surface="ceramic"):
    p = {"id": identifier, "kind": "ramp", "polygon": polygon, "axis": axis,
         "y": list(heights), "surface": surface, "district": district}
    plan["ramps"].append(p)
    return p


def make_plan():
    outlines = {name: ccw(poly) for name, poly in (("O", O), ("M", M), ("I", I), ("C", C), ("K", K))}
    outer = max(math.hypot(*p) for p in O)
    plan = {"phase": "Fabrication", "seed": SEED, "site": {"x": 0, "z": 680, "yaw": math.pi, "seed": SEED},
            "tiers": [{"id": f"T{i}", "y": y} for i, y in enumerate((0.03, 8, 16, 24))],
            "outline": outlines, "outer": outer, "barrier": outer + 14,
            "districts": [], "gates": [], "nav": [], "floor": [], "surfaces": [],
            "colliders": {"segments": [], "circles": []}, "spawns": [], "modules": [],
            "landmarks": [], "ramps": [], "landings": [], "walls": [], "foundations": [], "notes": [
                "Reference image supplies rough structural arrangement, not a measured floor plan.",
                "D7 yard moved 15 m inward to clear the middle drum and the barracks prows.",
                "Spawn bays taller than the 8 m retaining rise use grounded service buttresses.",
                "R7 side service buttresses give 9 m bay height without placing a bay below a walkable layer.",
                "Fabricated Blender asset. No game inspection, export or port is authorised."]}
    for i, (role, tier, at, r, garrison) in enumerate(DISTRICTS):
        poly = ccw(REGIONS[i])
        bounds = [sum(v[0] for v in poly) / len(poly), sum(v[1] for v in poly) / len(poly)]
        plan["districts"].append({"index": i, "role": role, "tier": tier, "polygon": poly,
                                   "yard": {"at": list(at), "r": r}, "garrison": garrison,
                                   "bounds": {"at": bounds, "r": max(math.dist(bounds, v) for v in poly)}})

    ramp(plan, "R1-west", rectangle(-86, -26, 300, 324), [[-86, 312], [-26, 312]], [0.03, 8], 0)
    ramp(plan, "R1-east", rectangle(26, 86, 300, 324), [[86, 312], [26, 312]], [0.03, 8], 0)
    ramp(plan, "R2", rectangle(-334, -310, 90, 150), [[-322, 150], [-322, 90]], [0.03, 8], 1)
    ramp(plan, "R3", rectangle(310, 334, 90, 150), [[322, 150], [322, 90]], [0.03, 8], 2)
    ramp(plan, "R4", rectangle(-13, 13, -306, -250), [[0, -306], [0, -250]], [0.03, 8], 5)
    ramp(plan, "R5", rectangle(-18, 18, 170, 226), [[0, 226], [0, 170]], [8, 16], 6)
    ramp(plan, "R6", rectangle(-13, 13, -206, -150), [[0, -206], [0, -150]], [8, 16], 9)
    ramp(plan, "R7", rectangle(-15, 15, 70, 150), [[0, 150], [0, 70]], [16, 24], 10, "deck")
    for identifier, poly, district in (("R1-landing", rectangle(-26, 26, 300, 324), 0),
                                      ("R2-landing", rectangle(-334, -310, 66, 90), 1),
                                      ("R3-landing", rectangle(310, 334, 66, 90), 2)):
        plan["landings"].append({"id": identifier, "kind": "flat", "polygon": poly, "y": 8,
                                 "surface": "ceramic", "district": district})

    gate(plan, "G-main", "outer", (0, 500), (0, 1), [12, 0], 28, 0.03, 22,
         outside=(0, 514), inside=(0, 410))
    gate(plan, "G-west", "outer", (-504.2857, 150), (-210, 30), [12, 1], 22, 0.03, 18)
    gate(plan, "G-east", "outer", (504.2857, 150), (210, 30), [12, 2], 22, 0.03, 18)
    gate(plan, "G-rear", "outer", (0, -430), (0, -1), [12, 5], 22, 0.03, 18)
    t0_spurs = [((-200, 300), (-330, 400), [0, 1]),
                ((-310, 25), (-520, 40), [1, 3]),
                ((-200, -250), (-360, -370), [3, 5]),
                ((200, -250), (360, -370), [5, 4]),
                ((310, 25), (520, 40), [4, 2]),
                ((200, 300), (330, 400), [2, 0])]
    t1_spurs = [((-110, 170), (-200, 300), [6, 7]), ((110, 170), (200, 300), [8, 6]),
                ((-110, -150), (-200, -250), [7, 9]), ((110, -150), (200, -250), [9, 8])]
    for tier, spurs, fraction, prefix in ((0, t0_spurs, 0.35, "S"), (1, t1_spurs, 0.5, "T")):
        for j, (a, b, sectors) in enumerate(spurs):
            at = (a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction)
            n = (-(b[1] - a[1]), b[0] - a[0])
            g = gate(plan, f"{prefix}{j + 1}", "spur", at, n, sectors, 22, tier * 8, 20)
            plan["walls"].append({"a": list(a), "b": list(b), "width": 6, "height": 18,
                                    "y": tier * 8, "district": sectors[0], "kind": "spur", "gaps": [(at, 34)]})
            for p, q in broken_line(a, b, [(at, 34)]):
                segment(plan, p, q, 3, g["id"], tier * 8)

    for ident, at, n, sec, width, floor, soffit, outside in (
        ("R1-top", (0, 300), (0, 1), [0, 6], 40, 8, 24, (-38, 311)),
        ("R2-top", (-310, 78), (-1, 0), [1, 7], 22, 8, 18, (-321, 100)),
        ("R3-top", (310, 78), (1, 0), [2, 8], 22, 8, 18, (321, 100)),
        ("R4-top", (0, -250), (0, -1), [5, 9], 26, 8, 18, (0, -260)),
        ("R5-top", (0, 170), (0, 1), [6, 10], 36, 16, 24, (0, 180)),
        ("R6-top", (0, -150), (0, -1), [9, 10], 26, 16, 18, (0, -160)),
        ("R7-top", (0, 70), (0, 1), [10, 11], 30, 24, 22, (0, 80))):
        gate(plan, ident, "crown" if ident == "R7-top" else "ramp", at, n, sec,
             width, floor, soffit, outside=outside)

    # Wall runs are genuinely broken at gates; the central opening admits the barbican.
    outer_gaps = [([0, 440], 76)] + [(g["at"], 22) for g in plan["gates"] if g["id"] in ("G-west", "G-east", "G-rear")]
    inner_o = inset(outlines["O"], 8)
    for j, (a, b) in enumerate(zip(outlines["O"], outlines["O"][1:] + outlines["O"][:1])):
        district = sector_at(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), 0, plan)
        spans = broken_line(a, b, outer_gaps)
        plan["walls"].append({"a": a, "b": b, "width": 16, "height": 34, "y": 0,
                                "district": district, "kind": "curtain", "gaps": outer_gaps})
        ia, ib = inner_o[j], inner_o[(j + 1) % len(inner_o)]
        # Gap projection is made on the exterior, then inherited by the collider centre line.
        for p, q in spans:
            length = math.dist(a, b)
            ts = [math.dist(a, v) / length for v in (p, q)]
            ps = [(ia[0] + t * (ib[0] - ia[0]), ia[1] + t * (ib[1] - ia[1])) for t in ts]
            # A capsule's rounded ends must end at the opening, not its centre line.
            # Reserve its end radius along the run so the stated gate width stays clear.
            direction = unit((ib[0] - ia[0], ib[1] - ia[1]))
            radius = 9.9
            if ts[0] > 1e-6:
                ps[0] = tuple(ps[0][i] + direction[i] * radius for i in range(2))
            if ts[1] < 1 - 1e-6:
                ps[1] = tuple(ps[1][i] - direction[i] * radius for i in range(2))
            segment(plan, *ps, radius, "curtain and supported foot conduit", 0)

    for name, lower, upper, district, gaps in (
        ("M", 0, 8, 6, [((0, 300), 52), ((-310, 78), 24), ((310, 78), 24), ((0, -250), 26)]),
        ("I", 8, 16, 10, [((0, 170), 36), ((0, -150), 26)]),
        ("C", 1, 16, 10, [((0, 98), 30)]),
        ("K", 1, 24, 11, [((0, 70), 30)])):
        p = outlines[name]
        for a, b in zip(p, p[1:] + p[:1]):
            plan["walls"].append({"a": a, "b": b, "width": 0.8, "height": upper - lower,
                                    "y": lower, "top": upper, "district": district,
                                    "kind": "plinth", "outline": name, "gaps": gaps})
            for a1, b1 in broken_line(a, b, gaps):
                segment(plan, a1, b1, 1.2, name + " parapet", None)

    # Landmark placement uses the reference's ward arrangement and true module envelopes.
    for sign in (-1, 1):
        p = module(plan, "barbican", (sign * 26, 460), (24, 60, 80), 0, yaw=math.pi)
        bay(plan, p)
    for at in O:
        d = sector_at(at, 0, plan)
        module(plan, "tower", at, (32, 46, 32), d)
    for at in M + [(-310, 25), (310, 25)]:
        module(plan, "tower", at, (26, 34, 26), sector_at(at, 1, plan), variant=1)
    for j, at in enumerate(I):
        m = module(plan, "lantern", at, (18, 48, 18), 10, y=8)
        if j in (3, 4):
            bay(plan, m, floor=16, depth=4)
    for at in ((80, 50), (-80, 50), (80, -62), (-80, -62)):
        module(plan, "pinnacle", at, (10, 36, 10), 11, y=24)
    for x in (-54, 54):
        for z in (338, 412):
            module(plan, "sentinel", (x, z), (4.5, 26, 4.5), 0)
    for x in (-52, 52):
        for z in (187, 205, 223, 241, 259, 277):
            module(plan, "sentinel", (x, z), (3.2, 18, 3.2), 6, y=8)

    for at, yaw in (((-377, 290), 2.387), ((-329, 335), 2.387), ((-458, 104), math.pi / 2)):
        m = module(plan, "hangar", at, (44, 24, 64), 1, yaw=yaw)
        bay(plan, m, x=-14)
        deck_patch(plan, m, 44, 30)
    hall = module(plan, "fabrication", (398, 292), (80, 26, 30), 2, yaw=-2.387)
    bay(plan, hall, x=-22)
    bay(plan, hall, x=22)
    for at in ((358, 233), (352, 187), (363, 142), (410, 137), (465, 143), (476, 239)):
        yaw = math.atan2(420 - at[0], 200 - at[1])
        m = module(plan, "heatbank", at, (32, 14, 10), 2, yaw=yaw)
        plan["surfaces"].append({"polygon": transform(rectangle(-18, 18, -7, 7), at, yaw), "surface": "deck", "y": 0.03})
    for at in ((350, 337), (369, 349), (389, 357)):
        module(plan, "stack", at, (7, 48, 7), 2)

    for at in ((-352, -62), (-357, -125), (-385, -205), (-444, -210)):
        module(plan, "condenser", at, (26, 36, 26), 3)
    # Leave usable maintenance gaps at the curtain, including around the feet.
    for at in ((-469, -50), (-461, -97), (-450, -157), (-404, -244), (-365, -252), (-330, -186)):
        module(plan, "cistern", at, (18, 12, 18), 3)
    pump = module(plan, "pump", (-397, -52), (30, 14, 16), 3, yaw=math.pi)
    bay(plan, pump, -8, depth=5)
    bay(plan, pump, 8, depth=5)
    for at in ((350, -64), (351, -150), (417, -224)):
        module(plan, "dish", at, (30, 22, 30), 4, variant=0)
    for at in ((463, -76), (449, -187)):
        module(plan, "mast", at, (12, 64, 12), 4)
    control = module(plan, "control", (408, -53), (28, 14, 18), 4, yaw=math.pi)
    bay(plan, control, -8, depth=5)
    bay(plan, control, 8, depth=5)

    for sign in (-1, 1):
        for j, x in enumerate((65, 100, 135, 170, 205, 240, 275)):
            module(plan, "cargo", (sign * x, -388 + max(0, x - 130) * 0.3),
                   (12, 8.8 if j % 3 == 1 else 4.4, 4.4), 5, variant=j % 3)
        lift = module(plan, "lift", (sign * 48, -305), (20, 40, 20), 5, yaw=math.pi)
        bay(plan, lift)
    for x in (-65, 65):
        sally = module(plan, "sally", (x, 180), (16, 16, 20), 6, y=8)
        bay(plan, sally)
    for j, at in enumerate(((-284, -85), (-279, 20), (-284, 125))):
        m = module(plan, "barracks", at, (22, 18, 72), 7, y=8, yaw=math.pi / 2)
        # local width follows the hall's short end; orient to put service bays along its side.
        m["size"] = [72, 18, 22]
        m["footprint"] = transform(rectangle(-36, 36, -11, 11), at, math.pi / 2)
        bay(plan, m, x=-18)
        if j == 1:
            bay(plan, m, x=18)
    for j, (at, diameter) in enumerate((((264, 128), 40), ((279, -71), 32), ((232, -118), 26))):
        m = module(plan, "dome", at, (diameter, diameter * 0.5, diameter), 8, y=8)
        if j < 2:
            bay(plan, m, depth=4)
    armoury = module(plan, "armoury", (104, -209), (64, 24, 36), 9, y=8)
    for x in (-21, 0, 21):
        bay(plan, armoury, x, depth=6)
    deck_patch(plan, armoury, 64, 18)
    module(plan, "annex", (41, -235), (30, 14, 20), 9, y=8)
    for sign in (-1, 1):
        buttress = module(plan, "bridge_service", (sign * 25, 121), (16, 14, 20), 10,
                           y=16, yaw=sign * math.pi / 2)
        bay(plan, buttress, depth=6)
    spire = module(plan, "spire", (0, -45), (60, 116, 46), 11, y=24)
    bay(plan, spire, width=16, height=16, depth=10)
    spire["additional_footprints"] = [transform(rectangle(-4, 4, -6.5, 6.5), (sign * 23, -20.5), 0)
                                      for sign in (-1, 1)]
    for district, points in (
            (0, [(-84, 372), (84, 372)]), (1, [(-451, 263)]), (2, [(440, 255)]),
            (3, [(-433, -175)]), (4, [(440, -158)]), (5, [(-85, -310), (85, -310)]),
            (6, [(-79, 235), (79, 235)]), (7, [(-205, 111)]), (8, [(222, 116)]),
            (9, [(-57, -225)]), (10, [(-155, 65)]), (11, [(52, 7)])):
        yard = plan["districts"][district]["yard"]["at"]
        floor = (0.03, 8, 16, 24)[plan["districts"][district]["tier"]]
        for at in points:
            yaw = math.atan2(yard[0] - at[0], yard[1] - at[1])
            module(plan, "guard", at, (4, 5, 4), district, y=floor, yaw=yaw)
    for m in plan["modules"]:
        if m["kind"] == "lantern" and m["bays"]:
            m["footprint"] = transform(rectangle(-9, 9, -9, 9), m["at"], m["yaw"])

    # Colliders use perimeter recipes with the bay door spans omitted.
    round_kinds = {"tower", "lantern", "pinnacle", "condenser", "cistern", "dish", "dome", "mast", "sentinel", "stack", "guard"}
    for m in plan["modules"]:
        if m["kind"] == "dome":
            # Follow the circular foundation, breaking only at the service vestibule.
            p = m["footprint"]
            radius = m["size"][0] / 2
            for a, b in zip(p, p[1:] + p[:1]):
                if m["bays"] and abs((a[0] + b[0]) / 2 - m["at"][0]) < 6 and (a[1] + b[1]) / 2 > m["at"][1] + radius - 2:
                    continue
                segment(plan, a, b, 0.25, f"module {m['index']}", m["y"])
            for b in m["bays"]:
                for a, q in (((-4, radius), (-4, radius - 4)), ((4, radius), (4, radius - 4)),
                             ((-4, radius - 4), (4, radius - 4))):
                    a, q = transform([a, q], m["at"], m["yaw"])
                    segment(plan, a, q, 0.25, "dome bay " + str(m["index"]), m["y"])
        elif m["kind"] in round_kinds and not m["bays"]:
            radius = 2.9 if m["kind"] == "guard" else m["size"][0] / 2
            circle_collider(plan, m["at"], radius, f"module {m['index']}", m["y"])
        else:
            w, _, d = m["size"]
            corners = rectangle(-w / 2, w / 2, -d / 2, d / 2)
            gaps = [((b["x"], d / 2), b["width"]) for b in m["bays"]]
            for a, b in zip(corners, corners[1:] + corners[:1]):
                for p, q in broken_line(a, b, gaps):
                    p, q = transform([p, q], m["at"], m["yaw"])
                    segment(plan, p, q, 0.35, f"module {m['index']}", m["y"])
            for b in m["bays"]:
                x0, x1 = b["x"] - b["width"] / 2, b["x"] + b["width"] / 2
                for a, q in (((x0, d / 2), (x0, d / 2 - b["depth"])),
                             ((x1, d / 2), (x1, d / 2 - b["depth"])),
                             ((x0, d / 2 - b["depth"]), (x1, d / 2 - b["depth"]))):
                    p, q = transform([a, q], m["at"], m["yaw"])
                    segment(plan, p, q, 0.25, "bay " + str(m["index"]), b["floor"])
        for p in m.get("additional_footprints", []):
            for a, b in zip(p, p[1:] + p[:1]):
                segment(plan, a, b, 0.35, "buttress " + str(m["index"]), m["y"])
        if m["kind"] not in {"cargo", "sentinel", "annex", "sally", "bridge_service"}:
            plan["landmarks"].append({"module": m["kind"], "at": m["at"], "yaw": m["yaw"], "district": m["district"]})

    add_gate_colliders(plan)
    add_ramp_colliders(plan)
    add_foundations(plan)
    build_floors(plan)
    build_nav(plan)
    return plan


def add_foundations(plan):
    for m in plan["modules"]:
        if m["kind"] == "pinnacle":
            plan["foundations"].append({"kind": "pinnacle_pier", "at": m["at"], "yaw": 0,
                                        "base": 1, "top": 24, "width": 12, "depth": 12,
                                        "district": 11, "attached": f"module:{m['index']}",
                                        "footprint": circle(*m["at"], 6, 48)})
    for g in plan["gates"]:
        if g["kind"] not in ("ramp", "crown"):
            continue
        grand = g["id"] in ("R1-top", "R5-top", "R7-top")
        jamb = 8 if grand else 6
        base = 1 if g["kind"] == "crown" else 8 if g["y"] == 16 else 0
        n, tangent = g["out"], (-g["out"][1], g["out"][0])
        yaw = math.atan2(n[0], n[1])
        for sign in (-1, 1):
            at = [g["at"][i] + tangent[i] * sign * (g["width"] / 2 + jamb / 2) for i in range(2)]
            plan["foundations"].append({"kind": "portal_pier", "at": at, "yaw": yaw,
                                        "base": base, "top": g["y"], "width": jamb + 1.4, "depth": 11.4,
                                        "district": g["sectors"][0], "attached": g["id"],
                                        "footprint": transform(rectangle(-(jamb + 1.4) / 2, (jamb + 1.4) / 2,
                                                                         -5.7, 5.7), at, yaw)})


def sector_at(at, tier, plan):
    candidates = [d for d in plan["districts"] if d["tier"] == tier]
    return min(candidates, key=lambda d: math.dist(at, d["yard"]["at"]))["index"]


def deck_patch(plan, m, width, depth):
    front = m["size"][2] / 2
    plan["surfaces"].append({"polygon": transform(rectangle(-width / 2, width / 2, front, front + depth), m["at"], m["yaw"]),
                              "surface": "deck", "y": m["y"] + (0.03 if m["y"] == 0 else 0)})


def add_gate_colliders(plan):
    for g in plan["gates"]:
        if g["id"] == "G-main":
            continue
        n = g["out"]
        tangent = [-n[1], n[0]]
        for sign in (-1, 1):
            if g["kind"] == "outer":
                at = [g["at"][i] + tangent[i] * sign * (g["width"] / 2 + 12) for i in range(2)]
                circle_collider(plan, at, 12, g["id"], g["y"])
            else:
                width = 8 if g["id"] in ("R1-top", "R5-top", "R7-top") else 6
                at = [g["at"][i] + tangent[i] * sign * (g["width"] / 2 + width / 2) for i in range(2)]
                # Collider follows the exact jamb, preserving the table's clear opening.
                p = [at[i] + n[i] * 5 for i in range(2)]
                q = [at[i] - n[i] * 5 for i in range(2)]
                segment(plan, p, q, width / 2, g["id"], g["y"])


def add_ramp_colliders(plan):
    for r in plan["ramps"]:
        a, b = r["axis"]
        direction = unit((b[0] - a[0], b[1] - a[1]))
        tangent = [-direction[1], direction[0]]
        p = r["polygon"]
        half_width = max(abs((v[0] - a[0]) * tangent[0] + (v[1] - a[1]) * tangent[1]) for v in p)
        for sign in (-1, 1):
            # parapet sits outside the stated clear ramp width.
            offset = sign * (half_width + 0.4)
            q0 = [a[i] + tangent[i] * offset for i in range(2)]
            q1 = [b[i] + tangent[i] * offset for i in range(2)]
            segment(plan, q0, q1, 0.4, r["id"] + " side", None)
    for ident, a, b in (("R1 front", (-26, 324.4), (26, 324.4)),
                        ("R2 end", (-334, 65.6), (-310, 65.6)),
                        ("R3 end", (310, 65.6), (334, 65.6)),
                        ("R2 landing side", (-334.4, 66), (-334.4, 90)),
                        ("R3 landing side", (334.4, 66), (334.4, 90))):
        segment(plan, a, b, 0.4, ident, None)


def build_floors(plan):
    """Subtract raised tiers, ramps and solids, so floors never stack."""
    ramp_holes = [r["polygon"] for r in plan["ramps"] + plan["landings"]]
    outlines = plan["outline"]
    exposed_o = inset(outlines["O"], 16)
    holes_by_tier = {0: [inset(outlines["M"], -8 / 6)], 1: [inset(outlines["I"], -8 / 6)],
                     2: [outlines["C"]], 3: []}
    for d in plan["districts"]:
        tier = d["tier"]
        y = (0.03, 8, 16, 24)[tier]
        polygon = d["polygon"]
        triangles = [[polygon[j] for j in tri] for tri in triangulate(polygon)]
        if tier == 0:
            triangles = [q for p in triangles if (q := intersect_convex(p, exposed_o))]
        holes = holes_by_tier[tier] + ramp_holes
        # Solids can straddle ward boundaries and must be removed from both sides.
        holes += [p for m in plan["modules"] for p in [m["footprint"]] + m.get("additional_footprints", [])
                  if m["solid"] and (m["y"] <= y < m["y"] + m["size"][1])]
        holes += [f["footprint"] for f in plan["foundations"] if f["base"] <= y < f["top"]]
        fragments = subtract_all(triangles, holes)
        surface = "sand" if d["index"] in (3, 4) else "ceramic"
        # Explicit paving instead of a buried continuous floor.
        for p in fragments:
            plan["floor"].append({"kind": "flat", "polygon": p, "y": 0 if surface == "sand" else y,
                                    "surface": surface, "district": d["index"]})
    plan["floor"].extend(plan["ramps"] + plan["landings"])
    # Exterior gate approaches extend through actual openings to the exposed floor.
    for g in plan["gates"]:
        if g["kind"] != "outer":
            continue
        if g["id"] == "G-main":
            p = rectangle(-14, 14, 420, 585)
        else:
            yaw = math.atan2(g["out"][0], g["out"][1])
            p = transform(rectangle(-11, 11, -34, 36), g["at"], yaw)
        clipped = subtract_all([p], [m["footprint"] for m in plan["modules"] if m["y"] == 0])
        for p in clipped:
            plan["floor"].append({"kind": "flat", "polygon": p, "y": 0.03,
                                    "surface": "ceramic", "district": g["sectors"][1], "id": g["id"] + " floor"})
    for m in plan["modules"]:
        for b in m["bays"]:
            plan["floor"].append({"kind": "flat", "polygon": b["polygon"],
                                    "y": b["floor"] + (0.03 if b["floor"] == 0 else 0),
                                    "surface": "ceramic", "district": m["district"], "id": "bay " + str(m["index"])})
    # Sand district service roads are flush 3 cm paving patches, never elevated walks.
    for d in (3, 4):
        sign = -1 if d == 3 else 1
        plan["surfaces"].append({"polygon": rectangle(sign * 410 - 7, sign * 410 + 7, -274, 21),
                                  "surface": "ceramic", "y": 0.03})
        plan["surfaces"].append({"polygon": rectangle(min(sign * 460, sign * 320), max(sign * 460, sign * 320), -27, -13),
                                  "surface": "ceramic", "y": 0.03})
    for poly in (rectangle(283, 289, -75, 128), rectangle(264, 289, 125, 131),
                 rectangle(232, 286, -121, -115), rectangle(276, 283, -118, -71)):
        plan["surfaces"].append({"polygon": poly, "surface": "deck", "y": 8})
    # Surface overrides are clipped in the writer and check raster, never stacked.


def build_nav(plan):
    links = [[] for _ in range(13)]
    for index, g in enumerate(plan["gates"]):
        a, b = g["sectors"]
        links[a].append((b, index))
        links[b].append((a, index))
    nav = []
    for start in range(13):
        row, queue = [-2] * 13, deque([start])
        row[start] = -1
        while queue:
            a = queue.popleft()
            for b, gate_index in links[a]:
                if row[b] != -2:
                    continue
                row[b] = gate_index if a == start else row[a]
                queue.append(b)
        nav.append(row)
    plan["nav"] = nav


def write_plan(plan, directory):
    path = Path(directory)
    path.mkdir(parents=True, exist_ok=True)
    (path / "plan.json").write_text(json.dumps(plan, indent=2) + "\n")
