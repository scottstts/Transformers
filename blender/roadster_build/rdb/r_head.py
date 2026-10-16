"""Head (concept sheet, all four views): a spherical skull in a black gloss
helmet. The faceted black faceplate carries a glowing V visor; white cheek
guards sweep forward along the face from the temples; a round dark ear disc
with a bronze ring sits on each side; two tall white blade horns rise from the
temples, raked back and canted out. Everything is layered on the sphere
(rig.HEAD_R about the head centre); the head itself is never stretched.
"""
import math
from mathutils import Vector, Matrix
from . import kit as K, hs, rig

R = 0.235


def centre():
    h = rig.HEADS['head']
    return Vector((0, h.y, h.z + 0.28))


def sph(c, az, el, r):
    """Point on a sphere about c: az from forward (-y) toward +x, el up (degrees)."""
    a, e = math.radians(az), math.radians(el)
    return c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * r


def build_meshes():
    c = centre()
    core = K.Mesh()
    # skull: a sphere slightly inside the helmet (closes every view through the seams)
    rings = []
    for k in range(1, 16):
        e = -90 + k * 180 / 16
        rings.append([sph(c, a * 360 / 32, e, R - 0.012) for a in range(32)])
    core.loft(rings, 'graphite')
    # jaw block under the sphere, the faceplate closes over its front
    hs.chbox(core, c + Vector((0, -0.04, -0.24)), (0.24, 0.26, 0.14), 0.03, 'graphite')

    helm = K.Mesh()
    # helmet dome: faceted black gloss, from the brow line back over the crown to the nape
    pts = []
    for el in (8, 30, 52, 72):
        for az in range(-150, 151, 30):
            if el < 20 and abs(az) < 45:
                continue                       # brow: the faceplate rises here
            pts.append(sph(c, az, el, R + 0.012))
    for az in range(150, 211, 30):
        for el in (-30, 0, 30):
            pts.append(sph(c, az, el, R + 0.012))
    pts.append(sph(c, 0, 90, R + 0.03))
    pts += [sph(c, a, -38, R * 0.9) for a in range(105, 256, 30)]   # nape skirt
    helm.hull(pts, 'trim')
    # centre crest ridge: a raised keel from the brow over the crown
    keel = [sph(c, 0, e, R + 0.045) for e in (25, 50, 75)] + [sph(c, 180, e, R + 0.03) for e in (75, 45)]
    base = [sph(c, s * 9, e, R + 0.006) for s in (-1, 1) for e in (22, 50, 80)] + \
           [sph(c, 180 + s * 10, e, R + 0.006) for s in (-1, 1) for e in (75, 40)]
    helm.hull(keel + base, 'trim')

    face = K.Mesh()
    # faceplate: a faceted black mask, a vertical centre ridge, chin point below the sphere
    fp = []
    for az in (-38, -22, 0, 22, 38):
        for el in (14, -5, -24):
            fp.append(sph(c, az, el, R + 0.020 + (0.018 if az == 0 else 0)))
    fp += [c + Vector((0, -0.19, -0.27)), c + Vector((0.075, -0.16, -0.25)), c + Vector((-0.075, -0.16, -0.25))]
    fp += [sph(c, a, e, R * 0.6) for a in (-30, 30) for e in (-20, 10)]
    face.hull(fp, 'trim')
    # visor: one V chevron of light across the eyes (lowest at the centre)
    for s in (-1, 1):
        for k in range(6):
            a0, a1 = s * k * 7.0, s * (k + 1) * 7.0
            e0, e1 = 2 + k * 2.3, 2 + (k + 1) * 2.3
            seg = []
            for az, el in ((a0, e0), (a1, e1)):
                for de in (-1.5, 1.5):
                    seg.append(sph(c, az, el + de, R + 0.036))
                    seg.append(sph(c, az, el + de, R + 0.016))
            face.hull(seg, 'visor')
    # brow shelf over the visor (dark gloss, slightly proud), peaked at the centre
    brow = [sph(c, az, 8 + abs(az) * 0.32 + de, R + rr) for az in range(-44, 45, 11) for de, rr in ((5, 0.026), (10, 0.032), (15, 0.022))]
    face.hull(brow, 'trim')

    white = K.Mesh()
    for s in (-1, 1):
        # cheek guard: the white side of the helmet, from the temple down the side of the
        # face to the jaw, its front edge framing the faceplate
        out = [sph(c, s * 44, 26, R + 0.03), sph(c, s * 74, 40, R + 0.035), sph(c, s * 100, 24, R + 0.03),
               sph(c, s * 104, -14, R + 0.03), sph(c, s * 70, -46, R + 0.02), sph(c, s * 30, -50, R + 0.03),
               sph(c, s * 36, -10, R + 0.034)]
        n = (sph(c, s * 68, -2, 1) - c).normalized()
        hs.gem(white, out, n, 0.035, 0.28, 0.9)
        # a second, smaller plate layered over the guard's upper half (the horn's footing)
        tp = [sph(c, s * 62, 34, R + 0.06), sph(c, s * 90, 40, R + 0.06), sph(c, s * 98, 16, R + 0.06),
              sph(c, s * 72, 8, R + 0.06)]
        hs.gem(white, tp, (sph(c, s * 80, 26, 1) - c).normalized(), 0.03, 0.3, 0.8)
        # horn: a tall faceted blade, broad at its root, raked back and canted out
        root = sph(c, s * 80, 30, R + 0.07)
        up = Vector((s * 0.22, 0.34, 0.91)).normalized()
        fwd = Vector((0, -1, 0.30)).normalized()
        fwd = (fwd - up * fwd.dot(up)).normalized()
        side = up.cross(fwd).normalized()
        L = 0.44
        blade = [root + fwd * 0.075, root - fwd * 0.065, root + up * L * 0.62 + fwd * 0.035,
                 root + up * L + fwd * 0.004, root + up * L * 0.55 - fwd * 0.05]
        thick = [p + side * 0.016 for p in blade] + [p - side * 0.016 for p in blade]
        keel = [root + up * L * 0.30 + fwd * 0.01 + side * w for w in (0.032, -0.032)]
        white.hull(thick + keel, 'armour')
    ear = K.Mesh()
    for s in (-1, 1):
        ax = Vector((s, 0, 0))
        ec = sph(c, s * 90, -6, R + 0.01) + Vector((0, 0.03, 0))
        hs.drum(ear, ec, ax, 0.085, 0.05, 'graphite', 0.012, 32)
        hs.drum(ear, ec + ax * 0.02, ax, 0.062, 0.03, 'bronze', 0.006, 32)
        hs.drum(ear, ec + ax * 0.034, ax, 0.040, 0.02, 'trim', 0.006, 24)
    return {'core': core, 'helm': helm, 'face': face, 'white': white, 'ear': ear}


def neck_meshes():
    n = rig.HEADS['neck']
    h = rig.HEADS['head']
    m = K.Mesh()
    # articulated column: stacked rings between collar and skull base
    hs.ribs(m, n + Vector((0, 0, -0.10)), h + Vector((0, 0, 0.08)), 4, 0.12, 0.10, 0.05, 'graphite')
    m.cyl(n + Vector((0, 0, -0.14)), h + Vector((0, 0, 0.10)), 0.075, 'gunmetal', 20)
    for s in (-1, 1):
        hs.ram(m, n + Vector((s * 0.12, 0.05, -0.08)), h + Vector((s * 0.09, 0.02, 0.06)), 0.022)
        hs.hose(m, [n + Vector((s * 0.15, -0.04, -0.10)), n + Vector((s * 0.15, -0.09, 0.05)),
                    h + Vector((s * 0.10, -0.10, 0.04))], 0.014, 'bronze')
    return m
