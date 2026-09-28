"""The head: a spherical core under a faceted bat cowl (batmobile-transformer.jpeg).

The cowl is a coarse faceted shell on a sphere (flat facets, the Tumbler's
language) whose lower edge dips into a V brow over the eyes, sweeps down the
cheeks to the jaw hinges and covers the nape. Two tall pointed ears rise from
its crown, splayed a little outward and back. Under the brow: amber slit eyes
angled up at the temples, and an angular metal mask (nose ridge, cheek plates,
a narrow jaw converging to a pointed chin). Head-bone frame: origin at the neck
pivot, +f forward."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit
from .kit import V
from .rkit import Part
from .shape import lathe

C = (0.0, 0.03, 0.27)       # head sphere centre (head-bone frame)
R = 0.232                   # core sphere
RC = 0.252                  # cowl shell outer radius


def sph(a, e, r, c=C):
    """Point on a sphere: azimuth a (0 = front, + = left), elevation e."""
    return (c[0] + r * math.cos(e) * math.sin(a), c[1] + r * math.cos(e) * math.cos(a), c[2] + r * math.sin(e))


def brow_e(a):
    """Elevation of the cowl's lower edge at azimuth a (radians)."""
    a = abs(a)
    if a < 0.22:
        return -0.05 - 0.10 * (1 - a / 0.22)          # the V's point over the nose bridge
    if a < 1.05:
        return -0.05 + 0.05 * math.sin((a - 0.22) / 0.83 * math.pi / 2)   # the brow over the eyes, rising to the temple
    if a < 1.75:
        return 0.0 - 0.75 * (a - 1.05) / 0.70         # down the cheek to the jaw hinge
    return -0.75 - 0.10 * (a - 1.75) / (math.pi - 1.75)   # the nape


def cowl_shell(na=18, ne=6, t=0.022):
    """Faceted shell from the lower edge to the crown (pole), with thickness t inward."""
    rows = []
    for j in range(ne + 1):
        row = []
        for i in range(na):
            a = -math.pi + 2 * math.pi * i / na
            e0 = brow_e(a)
            e = e0 + (math.pi / 2 - 0.12 - e0) * j / ne
            row.append((a, e))
        rows.append(row)
    verts = []
    for r in (RC, RC - t):
        for row in rows:
            for a, e in row:
                verts.append(V(*sph(a, e, r)))
    N = (ne + 1) * na
    faces = []
    for side in (0, N):
        for j in range(ne):
            for i in range(na):
                a0 = side + j * na + i
                b0 = side + j * na + (i + 1) % na
                f = [a0, b0, b0 + na, a0 + na]
                faces.append(f if side == 0 else f[::-1])
        pole = len(verts)
        verts.append(V(C[0], C[1], C[2] + (RC if side == 0 else RC - t)))
        for i in range(na):
            f = [side + ne * na + i, side + ne * na + (i + 1) % na, pole]
            faces.append(f if side == 0 else f[::-1])
    for i in range(na):
        k = (i + 1) % na
        faces.append([k, i, i + N, k + N])
    return verts, faces


def ear(s):
    """A tall faceted ear: a thick triangular blade on the crown, splayed out and back."""
    base = [sph(s * 0.70, 0.62, RC - 0.01), sph(s * 1.20, 0.52, RC - 0.01), sph(s * 0.95, 0.95, RC - 0.02)]
    tip = (s * 0.19, C[1] - 0.07, C[2] + RC + 0.29)
    mid = [((b[0] + tip[0]) / 2, (b[1] + tip[1]) / 2, (b[2] + tip[2]) / 2) for b in base]
    # thicken along the ear's own normal
    A, B, T = Vector(base[0]), Vector(base[1]), Vector(tip)
    n = (B - A).cross(T - A).normalized() * (0.045 * s)
    verts = [V(*p) for p in base] + [V(*tip)]
    out = [V(*(Vector(p) + n)) for p in base] + [V(*(T + n * 0.2))]
    vs = verts + out
    faces = [[0, 1, 3], [1, 2, 3], [2, 0, 3], [4, 7, 5], [5, 7, 6], [6, 7, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 4, 0]]
    return vs, faces


def solid_grid(rows, depth):
    """Close a sampled surface patch (rows of design points) into a slab pushed back along -f by depth."""
    nr, nc = len(rows), len(rows[0])
    verts = [V(*p) for row in rows for p in row]
    N = len(verts)
    verts += [p + Vector((0, depth, 0)) for p in verts]
    faces = []
    for i in range(nr - 1):
        for j in range(nc - 1):
            a = i * nc + j
            faces += [[a, a + 1, a + nc + 1, a + nc], [N + a + nc, N + a + nc + 1, N + a + 1, N + a]]
    rim = list(range(nc)) + [i * nc + nc - 1 for i in range(1, nr)] + list(range(N - 2, N - nc - 1, -1)) + [i * nc for i in range(nr - 2, 0, -1)]
    faces += [[a, b, b + N, a + N] for a, b in zip(rim, rim[1:] + rim[:1])]
    return verts, faces


def plate(points, depth=0.02):
    n = len(points)
    verts = [V(*p) for p in points]
    verts += [p + Vector((0, depth, 0)) for p in verts]
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    faces += [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
    return verts, faces


def mask_front(x):
    """Forward coordinate of the mask surface at lateral x (a shallow V keel)."""
    return C[1] + R * 0.98 - 0.30 * abs(x) ** 1.3


def build(coll):
    core = Part('R.head.skull')
    core.add(kit.revolve([(0.0, -R)] + [(R * math.sin(math.pi * k / 16), -R * math.cos(math.pi * k / 16)) for k in range(1, 16)] + [(0.0, R)], 32,
                         M=Matrix.Translation(V(*C))), 'graphite')
    core.add(lathe([(0, -0.02), (0.13, -0.02), (0.15, 0.03), (0.12, 0.09), (0, 0.09)], 32, 'z'), 'darkSteel')
    cowl = Part('R.head.cowl')
    cowl.add(cowl_shell(), 'armor')
    for s in (1, -1):
        cowl.add(ear(s), 'armor')
        # a raised facet ridge from the brow up over the crown either side of the centre
        path = [sph(s * 0.18, e, RC + 0.004) for e in (-0.10, 0.25, 0.60, 1.00, 1.30)]
        cowl.add(rkit.hose(path, 0.009, 6, 2), 'armorDark')
        # temple plates: small bolted plates over the jaw hinges
        cowl.add(rkit.cylinder((s * (RC + 0.004), C[1] - 0.03, C[2] - 0.05), 0.055, 0.022, 'x', 8), 'blackChrome')
        cowl.add(rkit.cylinder((s * (RC + 0.018), C[1] - 0.03, C[2] - 0.05), 0.025, 0.012, 'x', 6), 'bronze')
    face = Part('R.head.face')
    # the orbital recess behind the brow: a dark band across the face
    rows = []
    for j in range(6):
        row = []
        for i in range(25):
            a = -1.05 + 2.10 * i / 24
            x, f, z = sph(a, brow_e(a) + 0.01, R + 0.012)
            z0 = C[2] - 0.075 - 0.02 * abs(a)
            zz = z0 + (z - z0) * j / 5
            row.append((x, f - 0.004, zz))
        rows.append(row)
    face.add(solid_grid(rows, 0.03), 'blackChrome')
    for s in (1, -1):
        # slit eyes, angled up to the temples
        rows = []
        for j in range(2):
            row = []
            for i in range(9):
                t = i / 8
                a = s * (0.20 + 0.62 * t)
                x, f, z = sph(a, brow_e(a) - 0.035, R + 0.018)
                z += -0.020 * (1 - j) - 0.006 * math.sin(math.pi * t)
                row.append((x, f, z + 0.018 * t))
            rows.append(row)
        face.add(solid_grid(rows, 0.012), 'eye')
        # angular mask: cheek plate from under the eye to the jaw, converging to the chin
        cheek = [(s * 0.05, mask_front(0.05), C[2] - 0.09), (s * 0.19, mask_front(0.19) - 0.03, C[2] - 0.07),
                 (s * 0.21, mask_front(0.21) - 0.06, C[2] - 0.16), (s * 0.10, mask_front(0.10) - 0.01, C[2] - 0.25),
                 (s * 0.03, mask_front(0.03) + 0.01, C[2] - 0.27)]
        face.add(plate(cheek, 0.05), 'graphite')
        face.add(rkit.hose([(s * 0.19, mask_front(0.19) - 0.028, C[2] - 0.07), (s * 0.21, mask_front(0.21) - 0.058, C[2] - 0.16),
                            (s * 0.10, mask_front(0.10) - 0.005, C[2] - 0.25)], 0.006, 6, 3), 'bronze')
        # jaw plate behind the cheek, into the cowl
        jaw = [(s * 0.20, C[1] + 0.12, C[2] - 0.06), (s * 0.22, C[1] + 0.02, C[2] - 0.12), (s * 0.15, C[1] + 0.05, C[2] - 0.22),
               (s * 0.12, C[1] + 0.14, C[2] - 0.24)]
        face.add(plate(jaw, 0.06), 'graphite')
    # nose ridge and chin
    face.add(plate([(-0.03, mask_front(0) + 0.02, C[2] - 0.05), (0.03, mask_front(0) + 0.02, C[2] - 0.05),
                    (0.04, mask_front(0) + 0.01, C[2] - 0.15), (0.0, mask_front(0) + 0.03, C[2] - 0.17), (-0.04, mask_front(0) + 0.01, C[2] - 0.15)], 0.05),
             'blackChrome')
    face.add(plate([(-0.05, mask_front(0) + 0.0, C[2] - 0.215), (0.05, mask_front(0) + 0.0, C[2] - 0.215), (0.0, mask_front(0) - 0.01, C[2] - 0.30)],
                   0.08), 'darkSteel')
    face.add(plate([(-0.07, mask_front(0) - 0.005, C[2] - 0.19), (0.07, mask_front(0) - 0.005, C[2] - 0.19),
                    (0.06, mask_front(0) - 0.01, C[2] - 0.205), (-0.06, mask_front(0) - 0.01, C[2] - 0.205)], 0.03), 'blackChrome')
    return {'head': [core.build(coll, 0.0025, 2, 30), cowl.build(coll, 0.002, 1, 12), face.build(coll, 0.0025, 2, 30)]}
