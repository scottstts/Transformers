"""Head (head-bone local, pivot at the origin): a spherical skull with the
helmet, face mask, visor and fins layered on it, never stretching the sphere.

Concept: white helmet with a central crest and two tall swept fins at the
sides, silver face mask with a pointed mouth plate, blue eyes in a dark visor
band, dark ear rotors."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit
from .kit import V
from .rkit import Part
from .shape import lerp, lathe

C = (0.0, 0.03, 0.34)       # sphere centre (x, f, z) above the pivot
R = 0.33                    # skull radius


def sph(a, e, r):
    """Point on a sphere about C: azimuth a (deg, 0 = forward, + = left), elevation e (deg)."""
    a, e = math.radians(a), math.radians(e)
    return V(C[0] + r * math.cos(e) * math.sin(a), C[1] + r * math.cos(e) * math.cos(a), C[2] + r * math.sin(e))


def _solid(rows_o, rows_i):
    nr, nc = len(rows_o), len(rows_o[0])
    verts = [p for r in rows_o for p in r] + [p for r in rows_i for p in r]
    N = nr * nc
    faces = []
    for i in range(nr - 1):
        for j in range(nc - 1):
            a = i * nc + j
            faces.append([a, a + 1, a + nc + 1, a + nc])
            faces.append([N + a + nc, N + a + nc + 1, N + a + 1, N + a])
    rim = list(range(nc)) + [i * nc + nc - 1 for i in range(1, nr)] + \
        list(range(N - 2, N - nc - 1, -1)) + [i * nc for i in range(nr - 2, 0, -1)]
    for a, b in zip(rim, rim[1:] + rim[:1]):
        faces.append([b, a, a + N, b + N])
    return verts, faces


def patch(a0, a1, e0, e1, r_out, thick, na=24, ne=12):
    """Thick spherical patch over azimuth a0..a1 and elevation e0..e1 (|e| < 90)."""
    rows_o, rows_i = [], []
    for i in range(ne + 1):
        e = lerp(e0, e1, i / ne)
        rows_o.append([sph(lerp(a0, a1, j / na), e, r_out) for j in range(na + 1)])
        rows_i.append([sph(lerp(a0, a1, j / na), e, r_out - thick) for j in range(na + 1)])
    return _solid(rows_o, rows_i)


def meridian_band(hw, th0, th1, r_out, thick, n=24):
    """Band of half width hw along the centre meridian, arc angle th0 (front, deg above the
    horizon) over the crown to th1 (> 90 runs down the back)."""
    rows_o, rows_i = [], []
    for i in range(n + 1):
        th = math.radians(lerp(th0, th1, i / n))
        ro, ri = [], []
        for x in (-hw, 0.0, hw):
            for r, lst in ((r_out, ro), (r_out - thick, ri)):
                q = math.sqrt(max(1e-6, r * r - x * x))
                lst.append(V(C[0] + x, C[1] + q * math.cos(th), C[2] + q * math.sin(th)))
        rows_o.append(ro)
        rows_i.append(ri)
    return _solid(rows_o, rows_i)


def dome(e_min, r_out, thick, na=64, ne=14):
    """Shell from elevation e_min(a) up to the crown, closed with a pole fan."""
    rings_o, rings_i = [], []
    for i in range(ne):
        t = i / ne
        ro, ri = [], []
        for j in range(na):
            a = -180.0 + 360.0 * j / na
            e = lerp(e_min(a), 90.0, t ** 0.9)
            ro.append(sph(a, e, r_out))
            ri.append(sph(a, e, r_out - thick))
        rings_o.append(ro)
        rings_i.append(ri)
    n = na
    verts = [p for r in rings_o for p in r] + [p for r in rings_i for p in r]
    N = len(verts) // 2
    po, pi = len(verts), len(verts) + 1
    verts += [sph(0, 90, r_out), sph(0, 90, r_out - thick)]
    faces = []
    for i in range(ne - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append([a, b, b + n, a + n])
            faces.append([N + a + n, N + b + n, N + b, N + a])
    last = (ne - 1) * n
    for j in range(n):
        a, b = last + j, last + (j + 1) % n
        faces.append([a, b, po])
        faces.append([N + b, N + a, pi])
    for j in range(n):
        a, b = j, (j + 1) % n
        faces.append([b, a, a + N, b + N])
    return verts, faces


def helmet_edge(a):
    """Lower edge of the helmet: brow line over the face, dropping over the cheeks and nape."""
    x = abs(a)
    if x <= 48:
        return 16.0 - 4.0 * (x / 48) ** 2
    if x <= 80:
        return lerp(12.0, -34.0, ((x - 48) / 32) ** 0.8)
    return lerp(-34.0, -40.0, (x - 80) / 100)


def fin(s):
    """Tall swept blade on the helmet side (side outline in (f, z), extruded along x),
    its root sunk into the helmet shell."""
    outline = [(0.14, 0.40), (-0.16, 0.36), (-0.28, 0.62), (-0.30, 1.02), (-0.20, 0.96), (0.02, 0.62)]
    x0 = 0.30
    verts, faces = rkit.plate_x(outline, x0, x0 + 0.055, 0.012)
    M = Matrix.Rotation(math.radians(s * 4.0), 4, 'Y')          # a touch of outward lean
    if s < 0:
        verts, faces = kit.mirror_x((verts, faces))
    return [M @ v for v in verts], faces


def build(coll):
    out = []
    skull = Part('R.head.skull')
    prof = [(0.0, -R)] + [(R * math.sin(math.pi * k / 20), -R * math.cos(math.pi * k / 20)) for k in range(1, 20)] + [(0.0, R)]
    skull.add(kit.revolve(prof, 48, M=Matrix.Translation(V(*C))), 'blackChrome')
    skull.add(lathe([(0.0, 0.04), (0.20, 0.04), (0.23, 0.08), (0.20, 0.16), (0.0, 0.16)], 32, 'z', center=(0, -0.02, 0)), 'darkSteel')
    out.append(skull)

    h = Part('R.head.helmet')
    h.add(dome(helmet_edge, R + 0.050, 0.034), 'paint')
    h.add(meridian_band(0.05, 14.0, 150.0, R + 0.080, 0.036, 30), 'paint')        # crest
    h.add(meridian_band(0.018, 22.0, 140.0, R + 0.094, 0.020, 26), 'graphite')    # crest inlay
    h.add(patch(-46.0, 46.0, 10.0, 20.0, R + 0.078, 0.062, 20, 3), 'paint')       # brow hood over the visor
    for s in (1, -1):
        h.add(fin(s), 'paint')
    out.append(h)

    f = Part('R.head.face')
    f.add(patch(-44.0, 44.0, -46.0, 6.0, R + 0.030, 0.030, 22, 10), 'silver')     # mask
    mouth = [sph(-18, -12, R + 0.07), sph(18, -12, R + 0.07), sph(12, -40, R + 0.06), sph(0, -52, R + 0.08), sph(-12, -40, R + 0.06)]
    f.add(_plate(mouth, 0.03), 'silver')
    for k in range(3):
        e = -20 - 7 * k
        f.add(patch(-9.0 + 2 * k, 9.0 - 2 * k, e - 1.6, e + 1.6, R + 0.085, 0.012, 6, 1), 'graphite')
    f.add(patch(-40.0, 40.0, 5.0, 11.0, R + 0.036, 0.022, 20, 2), 'blackChrome')  # visor band
    f.add(patch(10.0, 34.0, 6.4, 9.8, R + 0.046, 0.012, 8, 1), 'eye')
    f.add(patch(-34.0, -10.0, 6.4, 9.8, R + 0.046, 0.012, 8, 1), 'eye')
    for s in (1, -1):
        c = sph(s * 90, -6, R + 0.02)
        f.add(rkit.cylinder((c.x, -c.y, c.z), 0.13, 0.08, 'x', 32), 'graphite')
        f.add(rkit.cylinder((c.x + s * 0.045, -c.y, c.z), 0.07, 0.03, 'x', 24), 'darkSteel')
        f.many(rkit.bolt_ring((c.x + s * 0.04, -c.y, c.z), (s, 0, 0), 0.10, 6, 0.012, 0.01), 'orange')
    out.append(f)
    objs = [p.build(coll, 0.004, 2, 30) for p in out]
    return {'head': objs}


def _plate(pts, thick):
    """Plate from an outline of 3D points, thickened toward the sphere centre."""
    c = V(*C)
    n = len(pts)
    inner = [p + (c - p).normalized() * thick for p in pts]
    verts = list(pts) + inner
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([j, i, n + i, n + j])
    return verts, faces
