"""Neck and head. The head retracts with the neck 0.50 into the chest's head
well at the fold (well 0.60 x 0.62), so its plan stays inside 0.54 x 0.58."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, rig
from .kit import V
from .rkit import Part

HEAD_H = 0.58


def outline(x, ff, fb, taper=0.62):
    """Top-view helmet outline (x, f): pointed front ridge, flat flanks, squared back."""
    return [(0.0, ff), (x * taper, ff - 0.04), (x, ff * 0.35), (x, fb * 0.55), (x * 0.72, fb),
            (-x * 0.72, fb), (-x, fb * 0.55), (-x, ff * 0.35), (-x * taper, ff - 0.04)]


def helmet_mesh():
    st = [
        (0.02, 0.17, 0.19, -0.19),
        (0.12, 0.225, 0.255, -0.245),
        (0.33, 0.255, 0.275, -0.275),
        (0.47, 0.235, 0.215, -0.27),
        (HEAD_H, 0.17, 0.11, -0.225),
    ]
    rings = []
    for z, x, ff, fb in st:
        rings.append([V(px, pf, z) for px, pf in outline(x, ff, fb)])
    return kit.loft(rings, True, True)


def neck():
    """Load-bearing neck: flared column, three vertebra plates, throat plate,
    cervical spine bar and side struts. Retracts into the chest's head well."""
    p = Part('R.neck.column')
    top = rig.HEAD_Z - rig.NECK_Z
    p.add(kit.revolve([(0.0, -0.075), (0.16, -0.075), (0.165, -0.06), (0.15, -0.03), (0.13, 0.0), (0.13, top - 0.03),
                       (0.112, top - 0.003), (0.0, top - 0.003)], 32), 'darkSteel')
    for z in (0.015, 0.075, 0.135):
        p.add(rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(0.38, 0.36, 0.09)], z - 0.014, z + 0.014, 0.006), 'graphite')
    # throat plate and cervical spine bar
    p.add(rkit.plate_f([(-0.10, -0.06), (0.10, -0.06), (0.12, 0.10), (0.07, 0.17), (-0.07, 0.17), (-0.12, 0.10)], 0.125, 0.165, 0.008), 'mech')
    p.add(rkit.plate_f([(-0.05, -0.06), (0.05, -0.06), (0.05, 0.17), (-0.05, 0.17)], -0.19, -0.125, 0.008), 'mech')
    # side struts from the base flange to the top vertebra
    for s in (1, -1):
        p.add(rkit.hose([(s * 0.165, 0.0, -0.05), (s * 0.15, 0.0, 0.06), (s * 0.13, 0.0, 0.15)], 0.02, 12, 4), 'chrome')
    # skirt: caps the chest's head well when the neck is raised
    p.add(rkit.plate_z([(x, f - 0.01) for x, f in kit.chamfer_rect(0.54, 0.56, 0.08)], -0.10, -0.075, 0.006), 'graphite')
    return [p]


def head():
    shell = Part('R.head.helmet')
    face_cut = rkit.plate_z([(-0.175, 0.10), (0.175, 0.10), (0.175, 0.40), (-0.175, 0.40)], 0.04, 0.395, 0.0)
    shell.add(helmet_mesh(), 'steel', cuts=[face_cut])
    # crest: a thin raised ridge from the brow over the crown
    shell.add(rkit.plate_x([(0.10, HEAD_H - 0.02), (0.14, HEAD_H + 0.035), (-0.20, HEAD_H + 0.02), (-0.24, HEAD_H - 0.03)], -0.018, 0.018, 0.004), 'steel')
    # ears: machined discs with swept fins
    for s in (1, -1):
        # ears sit forward of mid-depth: the retracted shoulder booms pass behind them at the fold
        # (hub faces 6 mm inside the chest's head-well walls as the head rises out of it)
        # (high on the helmet: the retracted shoulder booms pass under them at the fold)
        shell.add(rkit.drum((s * 0.255, 0.05, 0.39), 0.08, 0.05, 'x', 24), 'darkSteel')
        shell.add(rkit.plate_x([(0.07, 0.44), (0.11, 0.48), (-0.07, 0.60), (-0.11, 0.585), (-0.03, 0.48)],
                               *((0.251, 0.269) if s > 0 else (-0.269, -0.251)), 0.004), 'steel')
    face = Part('R.head.face')
    # faceplate: dark mask set back inside the opening
    fp = []
    for z, x, fwd in ((0.05, 0.14, 0.17), (0.20, 0.165, 0.215), (0.36, 0.165, 0.215)):
        fp.append([V(px, pf, z) for px, pf in [(0.0, fwd), (x * 0.6, fwd - 0.03), (x, fwd - 0.09), (x, 0.0), (-x, 0.0), (-x, fwd - 0.09), (-x * 0.6, fwd - 0.03)]])
    face.add(kit.loft(fp, True, True), 'graphite')
    # visor band and LED slit
    face.add(rkit.plate_f([(-0.162, 0.30), (0.162, 0.30), (0.150, 0.345), (-0.150, 0.345)], 0.12, 0.215, 0.004), 'plastic')
    face.add(rkit.plate_f([(-0.140, 0.315), (0.140, 0.315), (0.132, 0.33), (-0.132, 0.33)], 0.14, 0.222, 0.002), 'visor')
    # mouthplate: steel guard with vertical slots
    mouth = rkit.plate_f([(-0.13, 0.06), (0.13, 0.06), (0.15, 0.20), (0.0, 0.24), (-0.15, 0.20)], 0.15, 0.225, 0.006)
    slots = [rkit.plate_f([(x - 0.008, 0.09), (x + 0.008, 0.09), (x + 0.008, 0.17), (x - 0.008, 0.17)], 0.2, 0.3, 0.0) for x in (-0.06, -0.02, 0.02, 0.06)]
    face.add(mouth, 'steel', cuts=slots)
    # cheek guards
    for s in (1, -1):
        face.add(rkit.plate_x([(0.10, 0.06), (0.21, 0.13), (0.21, 0.28), (0.12, 0.30)], *((0.155, 0.178) if s > 0 else (-0.178, -0.155)), 0.004), 'mech')
    # jaw / neck socket under the head
    face.add(rkit.cylinder((0, -0.01, 0.045), 0.12, 0.06, 'z', 24), 'darkSteel')   # 1.8 cm over the neck: the head pitches +-8 deg
    return [shell, face]


def build(coll):
    out = {'neck': [p.build(coll, 0.005, 2, 30) for p in neck()],
           'head': [p.build(coll, 0.004, 2, 25) for p in head()]}
    return out
