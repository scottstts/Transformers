"""Head, traced from ref_images/roadster/head-face-neck.png.

The front (top left) and back (top right) panels are orthographic at
S = 1.55 mm per pixel: front centre line u 312.5, back centre line u 943.5,
the head centre c at v 295 (the visor's centre height). They give every
outline's X and Z. The near profile (bottom left) is the same head drawn
1.087x larger (K = 1.426 mm per pixel, visor tip at u 100, v 876) and gives
the depths (Y).

The stowed head lies face down in the nose at frame 0: the car floor is at
Y -0.31 and the hood line at Y 0.54 - 0.78 Z (both about c, head frame). The
face's front is held at Y0 = -0.297 and the horn tips at Y 0.19, so the horns
rake less than the profile draws them; everything else follows the sheet.
All coordinates below are metres about c (+X left, -Y forward, +Z up).
"""
import math
from mathutils import Vector
from . import kit as K, hs

S, KS, Y0 = .00155, .001426, -.297
STRIP_X = .146                       # visor strip half span (front u 219)
INNER = Vector((0, .03, .06))        # shells offset toward this point


def fx(u):
    """Front panel |X| (left half of the panel)."""
    return (312.5 - u) * S


def fz(v):
    return (295 - v) * S


def bx(u):
    """Back panel |X| (left half of the panel)."""
    return (943.5 - u) * S


def zc(x):
    """Visor strip centre height: the shallow V of the front panel."""
    x = abs(x)
    return .008 + .30 * x + 1.0 * x * x


def ys(x):
    """Visor strip front depth: the face's plan curve (profile: end at u 217)."""
    x = abs(x)
    return Y0 + .35 * x + 5.4 * x * x


def newell(pts):
    n = Vector()
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        n.x += (p.y - q.y) * (p.z + q.z)
        n.y += (p.z - q.z) * (p.x + q.x)
        n.z += (p.x - q.x) * (p.y + q.y)
    return n


def skin(mesh, points, faces, offset, material):
    """Explicit outer surface, inner surface, and owned boundary walls."""
    n = len(points)
    edges = {}
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            edges.setdefault(tuple(sorted((a, b))), []).append((a, b))
    closed = list(faces) + [tuple(i + n for i in reversed(f)) for f in faces]
    closed += [(b, a, a + n, b + n) for uses in edges.values() if len(uses) == 1 for a, b in uses]
    inner = [offset(p) for p in points] if callable(offset) else [p + Vector(offset) for p in points]
    mesh.add(points + inner, closed, material)


def split(pts, faces, tol=.0006):
    """Faces as given when planar, else fanned into triangles (convex faces)."""
    out = []
    for f in faces:
        if len(f) > 3:
            q = [pts[i] for i in f]
            n = newell(q).normalized()
            if max(abs((p - q[0]).dot(n)) for p in q) > tol:
                out += [(f[0], f[k], f[k + 1]) for k in range(1, len(f) - 1)]
                continue
        out.append(tuple(f))
    return out


class Head:
    def __init__(self, c):
        self.c = c
        self.O = c + INNER

    def p(self, x, y, z):
        return self.c + Vector((x, y, z))

    def outward(self, pts, f):
        q = [pts[i] for i in f]
        n = newell(q).normalized()
        cen = sum(q, Vector()) / len(q)
        return n if n.dot(cen - self.O) > 0 else -n

    def plate(self, m, local, faces, t, mat='armour', bolts=()):
        """Faceted plate: outer facets `faces` over `local` points (about c),
        thickness t behind its mean normal; bolts = (face, corner) heads seated
        on that facet near that corner."""
        pts = [self.p(*v) for v in local]
        tris = split(pts, faces)
        n = Vector()
        for f in tris:
            n += self.outward(pts, f) * newell([pts[i] for i in f]).length
        n.normalize()
        skin(m, pts, tris, -n * t, mat)
        for fi, ci in bolts:
            f = faces[fi]
            q = [pts[i] for i in f]
            cen = sum(q, Vector()) / len(q)
            fn = self.outward(pts, f)
            hs.bolts(m, [q[ci] + (cen - q[ci]) * .22], fn, .0045, .0028, 'gunmetal')
        return n

    def grid(self, m, rows, t, mat):
        """Shell through a grid of rows (each a full left-to-right point row):
        quads where planar, else split on the diagonal that folds outward."""
        cols = len(rows[0])
        pts = [self.p(*v) for r in rows for v in r]
        faces = []
        for i in range(len(rows) - 1):
            for j in range(cols - 1):
                a, b = i * cols + j, i * cols + j + 1
                c_, d = b + cols, a + cols
                q = [pts[a], pts[b], pts[c_], pts[d]]
                n = newell(q).normalized()
                if max(abs((v - q[0]).dot(n)) for v in q) <= .0006:
                    faces.append((a, b, c_, d))
                elif ((pts[a] + pts[c_]) / 2 - self.O).length >= ((pts[b] + pts[d]) / 2 - self.O).length:
                    faces += [(a, b, c_), (a, c_, d)]
                else:
                    faces += [(a, b, d), (b, c_, d)]
        O = self.O
        skin(m, pts, faces, lambda v: v + (O - v).normalized() * t, mat)


def mirror_row(half):
    """Half row centre-out [(x, y, z)] -> full row right-to-left."""
    return [(-x, y, z) for x, y, z in reversed(half[1:])] + [half[0]] + list(half[1:])


def on_plane(a, b, c, x, z):
    """Depth y putting (x, y, z) on the plane through a, b, c."""
    a, b, c = Vector(a), Vector(b), Vector(c)
    n = (b - a).cross(c - a)
    return a.y - (n.x * (x - a.x) + n.z * (z - a.z)) / n.y


def centre_y(z, rows):
    for (z0, y0), (z1, y1) in zip(rows, rows[1:]):
        if z0 <= z <= z1:
            return y0 + (y1 - y0) * (z - z0) / (z1 - z0)
    raise ValueError(z)


# Forehead centre line (profile (100,870) (145,748) (205,708) (270,680)
# (340,655) (390,651)): the brow tip, the lower panel's kink, the top cap's
# crease, the top edge, the crown. The centre panels, top cap and crown are
# flat facets across the centre line, so each holds its depth across x.
FRONT = [(.028, -.300), (.190, -.236), (.242, -.152), (.326, -.045), (.337, .100)]
# Back centre line under the spine, crown to nape (rows' z, y), the facet
# band's half width, and the outer column (x, y inset, z drop).
BACK = [(.337, .100, .100, .115, .000, .047), (.292, .190, .090, .110, .015, .037),
        (.200, .250, .075, .105, .025, .015), (.095, .275, .070, .100, .030, .005),
        (-.010, .268, .065, .095, .028, .005), (-.075, .240, .055, .085, .025, .005)]


def dome(H, m, t):
    """Black dome as flat facets. Front (centre-out per row): brow V u 312 /
    284 / 230 at v 277 / 262 / 235; the panel edge u 284 v 262 to u 261 v 140;
    the top cap's edge u 260 v 140 to u 246 v 87; the outline u 226-237. Each
    side facet's last corner is solved onto the plane of the other three."""
    fy = lambda z: centre_y(z, FRONT)
    v = {}
    v['A0'], v['A1'] = (0, fy(.028), .028), (.046, fy(.051), .051)
    v['A3'] = (.128, ys(.128) - .003, .093)
    v['B0'], v['B1'] = (0, fy(.190), .190), (.071, fy(.190), .190)
    v['B3'] = (.126, on_plane(v['A1'], v['B1'], v['A3'], .126, .200), .200)
    v['C0'], v['C1'] = (0, fy(.242), .242), (.080, fy(.242), .242)
    v['C3'] = (.122, on_plane(v['B1'], v['B3'], v['C1'], .122, .250), .250)
    v['D0'], v['D1'] = (0, fy(.326), .326), (.105, fy(.326), .326)
    v['D3'] = (.118, on_plane(v['C1'], v['C3'], v['D1'], .118, .290), .290)
    # brow underside down to the strip's top edge
    for k, x in (('L0', 0), ('L1', .046), ('L3', .128)):
        v[k] = (x, ys(x) + .010, zc(x) + .0085)
    back = []
    for i, (z, y, w, xo, yi, zd) in enumerate(BACK):
        v['E%d0' % i], v['E%d1' % i], v['E%d3' % i] = (0, y, z), (w, y, z), (xo, y - yi, z - zd)
        back.append(i)
    names = list(v)
    half = {k: i for i, k in enumerate(names)}
    pts = [v[k] for k in names]
    # mirror: centre points (x 0) are shared
    mir = {}
    for k in names:
        if v[k][0] == 0:
            mir[k] = half[k]
        else:
            mir[k] = len(pts)
            x, y, z = v[k]
            pts.append((-x, y, z))

    def both(face):
        return [tuple(half[k] for k in face), tuple(mir[k] for k in reversed(face))]

    faces = []
    for band in (('A0', 'A1', 'B1', 'B0'), ('B0', 'B1', 'C1', 'C0'), ('C0', 'C1', 'D1', 'D0'),
                 ('D0', 'D1', 'E01', 'E00')):
        a, b, c_, d = band          # centre facets: one flat polygon across x
        faces.append((mir[b], half[a], half[b], half[c_], half[d], mir[c_]))
    for f in (('A1', 'A3', 'B3', 'B1'), ('B1', 'B3', 'C3', 'C1'), ('C1', 'C3', 'D3', 'D1'),
              ('D1', 'D3', 'E03'), ('D1', 'E03', 'E01'),
              ('L0', 'L1', 'A1', 'A0'), ('L1', 'L3', 'A3', 'A1')):
        faces += both(f)
    for i in back[:-1]:
        a, b, c_, d = 'E%d0' % i, 'E%d1' % i, 'E%d1' % (i + 1), 'E%d0' % (i + 1)
        faces.append((mir[b], half[a], half[b], half[c_], half[d], mir[c_]))
        faces += both(('E%d1' % i, 'E%d3' % i, 'E%d3' % (i + 1), 'E%d1' % (i + 1)))
    pts = [H.p(*q) for q in pts]
    tris = split(pts, faces)
    O = H.O
    skin(m, pts, tris, lambda q: q + (O - q).normalized() * t, 'helmet')


def yb(z):
    """Dome back centre depth at height z (rows 5-10)."""
    pts = [(.337, .100), (.292, .190), (.200, .250), (.095, .275), (-.010, .268), (-.075, .240)]
    for (z0, y0), (z1, y1) in zip(pts, pts[1:]):
        if z1 <= z <= z0:
            return y0 + (y1 - y0) * (z0 - z) / (z0 - z1)
    return pts[-1][1]


# Below the plates the body tapers into the neck: (z, rx, front y, back y).
LOWER = ((-.215, .060, -.130, .140), (-.170, .110, -.160, .200), (-.115, .140, -.180, .215))
FIT_Z = [-.070 + k * .025 for k in range(16)] + [.318]     # fitted rings, up under the crown
FIT_N, FIT_CY, FIT_GAP = 48, .05, .006


def body(H, solids):
    """Rings of the helmet body: horizontal rays from the head's axis to the
    first inner surface of any shell or plate, less FIT_GAP. Rays out through
    a seam take the ring's neighbours across it; spikes into a farther part
    are pulled back to the local median."""
    from mathutils.bvhtree import BVHTree
    vs, fs = [], []
    for m in solids:
        off = len(vs)
        vs += list(m.v)
        fs += [tuple(off + i for i in f) for f in m.f]
    tree = BVHTree.FromPolygons(vs, fs)
    dirs = [Vector((math.sin(i * math.tau / FIT_N), -math.cos(i * math.tau / FIT_N), 0)) for i in range(FIT_N)]
    grid = []
    for z in FIT_Z:
        o = H.p(0, FIT_CY, z)
        row = []
        for d in dirs:
            hit = tree.ray_cast(o, d, .5)
            row.append(hit[3] - FIT_GAP if hit[0] is not None else None)
        ok = [i for i, r in enumerate(row) if r is not None]
        for i in range(FIT_N):
            if row[i] is None:
                j0 = max((j for j in ok if j < i), default=ok[-1] - FIT_N)
                j1 = min((j for j in ok if j > i), default=ok[0] + FIT_N)
                r0, r1 = row[j0 % FIT_N], row[j1 % FIT_N]
                row[i] = r0 + (r1 - r0) * (i - j0) / (j1 - j0)
        grid.append(row)
    for _ in range(2):
        out = []
        for k, row in enumerate(grid):
            new = []
            for i, r in enumerate(row):
                nb = sorted(grid[kk][(i + di) % FIT_N] for kk in (k - 1, k, k + 1) if 0 <= kk < len(grid)
                            for di in (-1, 0, 1))
                med = nb[len(nb) // 2]
                new.append(min(r, med + .010))
            out.append(new)
        grid = out
    rings = []
    for z, rx, fy, by in LOWER:
        cy, ry = (fy + by) / 2, (by - fy) / 2
        rings.append([H.p(rx * d.x, cy + ry * d.y, z) for d in dirs])
    for z, row in zip(FIT_Z, grid):
        rings.append([H.p(r * d.x, FIT_CY + r * d.y, z) for r, d in zip(row, dirs)])
    return rings


def build(c):
    K.material('helmet', (.013, .015, .019), .55, .28, .35)
    K.material('faceplate', (.008, .010, .013), .40, .22, .35)
    K.material('helmet.edge', (.055, .059, .066), .75, .31, .15)
    H = Head(c)
    P = H.p
    core, helm, face, white, ear = (K.Mesh() for _ in range(5))

    # ------------------------------------------------------------ black dome
    dome(H, helm, .012)
    # Back spine (back panel): top cap, crown, keel, band, long plate; each
    # inset panel stands 4 mm proud of the dome with 3 mm reveals between them.
    spine = [[(902, 95), (985, 95), (975, 110), (912, 110)],
             [(912, 114), (975, 114), (960, 157), (927, 157)],
             [(925, 161), (962, 161), (967, 183), (962, 205), (925, 205), (920, 183)],
             [(905, 209), (982, 209), (986, 220), (982, 232), (905, 232), (901, 220)],
             [(924, 236), (963, 236), (969, 242), (969, 329), (963, 335), (924, 335), (918, 329), (918, 242)]]
    for out in spine:
        local = [(-bx(u), yb(fz(v)) + .004, fz(v)) for u, v in out]
        H.plate(helm, local, [tuple(range(len(local)))], .014, 'helmet',
                bolts=((0, 0), (0, 1)) if len(out) > 4 else ())

    # ------------------------------------------------------------ face
    # Mask under the strip: centre ridge, the facet edge at front u 270-276,
    # the jaw-blade edge, and a side return under the blades. Profile: front
    # edge (100,880) to (172,995).
    def k0(x):
        return (x, ys(x) + .006, zc(x) - .0095)
    # The mask is a twisted wedge (its centre recedes 0.10 m top to bottom,
    # its edges under the blades hardly at all), so its quads fold on their
    # convex diagonals.
    mask = [[k0(0), k0(.065), k0(.128), (.150, -.100, .055)],
            [(0, -.2405, -.085), (.062, -.222, -.077), (.124, -.128, -.058), (.152, -.070, -.050)],
            [(0, -.187, -.181), (.055, -.172, -.174), (.088, -.138, -.163), (.120, -.090, -.150)]]
    H.grid(face, [mirror_row(r) for r in mask], .012, 'faceplate')
    # Chin block (front u 282-330, v 412-434; profile (180,1028) (210,1025)).
    face.hull([P(x, y, z) for x in (-.040, .040) for y, z in ((-.188, -.184), (-.128, -.184))] +
              [P(x, y, z) for x in (-.033, .033) for y, z in ((-.181, -.215), (-.140, -.211))] +
              [P(x, -.193, -.198) for x in (-.034, .034)], 'faceplate')
    # Visor: one continuous strip of light in the slot between brow and mask.
    path = [Vector((x, ys(x), zc(x))) + c for x in [STRIP_X * (k / 15 - 1) for k in range(31)]]
    face.sweep(path, [(-.0075, -.012), (.0075, -.012), (.0075, 0), (-.0075, 0)], 'visor',
               normal=lambda i, q, t: (0, 0, 1))

    for s in (-1, 1):
        def L(pts):
            return [(s * x, y, z) for x, y, z in pts]

        # ---------------------------------------------------- white armour
        # Temple plate: front (239,258) (229,157) (213,103) (178,157)
        # (186,208); profile (179,829) (250,717) (380,672) (379,702) (315,775).
        H.plate(white, L([(.114, -.198, .068), (.129, -.083, .228), (.154, .102, .298),
                          (.2085, .101, .222), (.196, .010, .140)]),
                [(0, 1, 2), (0, 2, 3, 4)], .014, bolts=((1, 1), (1, 3)))
        # Horn root: the white saddle over the ear housing's top.
        white.hull([P(s * x, y, z) for x in (.207, .266) for y, z in
                    ((.028, .142), (.060, .198), (.180, .186), (.212, .132))] +
                   [P(s * .272, y, z) for y, z in ((.06, .15), (.18, .14))], 'armour')
        # Horn: front/back tip u 149 / 779 at v 29, outer face u 147, inner
        # base u 181; profile tip (537,602). Leading edge raked, trailing edge
        # upright, outer and inner ridges to the tip.
        white.hull([P(s * x, y, z) for x, y, z in
                    ((.256, .190, .412), (.246, .092, .246), (.262, .155, .222),
                     (.246, .216, .186), (.204, .155, .200))], 'armour')
        # Cheek plate round the ear (profile, C notch about the ear housing).
        dy = [(.0096, .149), (.045, .138), (.024, .066), (.017, .0066), (.062, .0023), (.067, -.012),
              (-.033, -.076), (-.059, -.029), (-.055, .045), (-.026, .121)]
        H.plate(white, L([(.212 + .42 * y - .08 * max(0, .02 - z), y, z) for y, z in dy]),
                [(0, 1, 2, 9), (9, 2, 3, 8), (8, 3, 6, 7), (3, 4, 5, 6)], .013, bolts=((0, 0), (2, 2)))
        # Jaw blade: front (186,262) (214,268) (250,387) (256,413) (215,365)
        # (195,300); profile front edge (220,870)-(202,1010), tip (205,1015).
        H.plate(white, L([(.196, -.080, .045), (.1798, -.108, .0375), (.155, -.125, .030), (.097, -.147, -.143),
                          (.088, -.148, -.186), (.151, -.078, -.108), (.182, -.072, -.008)]),
                [(1, 2, 3, 4), (1, 4, 5, 6, 0)], .012, bolts=((1, 4),))
        # Upper back plate: back (850,104) (900,128) (900,140) (903,233) (812,155).
        H.plate(white, L([(bx(850), .140, fz(104)), (bx(900), .225, fz(128)), (bx(900), .232, fz(140)),
                          (bx(903), .292, fz(233)), (bx(812), .228, fz(152))]),
                [(0, 1, 2, 4), (4, 2, 3)], .013, bolts=((1, 2), (0, 0)))
        # Rear side plate: back (812,166) (850,248) (858,290) (830,345) (812,336)
        # (800,318) (800,250) (793,190); profile rear edge u 530. Its foot ends
        # behind the cheek plate seen from the front (the back panel's lowest
        # plate, below the ear, would stand clear of the cheek in the front
        # panel, which shows none there: the front panel wins).
        H.plate(white, L([(bx(812), .236, fz(166)), (bx(850), .310, fz(248)), (bx(858), .305, fz(290)),
                          (bx(830), .268, fz(345)), (bx(812), .248, fz(336)), (bx(800), .222, fz(318)),
                          (bx(800), .205, fz(250)), (bx(793), .205, fz(190))]),
                [(0, 1, 2, 3), (0, 3, 4, 5, 6, 7)], .013, bolts=((0, 2), (1, 3)))

        # ---------------------------------------------------- ear
        # Housing fills the gap between the cheek and rear plates (front/back
        # u 143-160, v 194-313 with the bronze lip), a recessed face with the
        # profile's inner bronze ring and hub.
        ax = Vector((s, 0, 0))
        ec = P(s * .238, .107, .072)
        hs.drum(ear, ec, ax, .078, .047, 'graphite', .006, 48)
        ear.lathe([(.0225, .068), (.0225, .076), (.0255, .076), (.0255, .068)], 'bronze', ec, ax, 48, ring=True)
        hs.drum(ear, ec + ax * .0245, ax, .062, .006, 'helmet', .002, 48)
        ear.lathe([(.0265, .038), (.0265, .045), (.0300, .045), (.0300, .038)], 'bronze', ec, ax, 48, ring=True)
        hs.drum(ear, ec + ax * .029, ax, .030, .006, 'graphite', .002, 32)
        hs.drum(ear, ec + ax * .033, ax, .014, .004, 'gunmetal', .0015, 24)
        for i in range(6):
            a = i * math.tau / 6 + math.pi / 6
            hs.bolts(ear, [ec + ax * .0275 + Vector((0, math.cos(a), math.sin(a))) * .053], ax, .0035, .002,
                     'gunmetal')

    # ------------------------------------------------------------ helmet body
    # Closed gloss body fitted under the dome, mask and every plate: every
    # seam shows it, recessed, never the hollow behind a panel.
    core.loft(body(H, (helm, face, white, ear)), 'helmet')
    return {'core': core, 'helm': helm, 'face': face, 'white': white, 'ear': ear}
