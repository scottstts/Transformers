"""Wheels: 44 x 19.5-15 swamper tyres at the rear (two side by side per corner,
big staggered chevron lugs running down the shoulders), fat block-tread tyres
in front, all on black steel wheels. Meshes are hub-centred with the spin axis
on x (+x outboard for the L side); the object's location is the hub (the
exporter stores wheels hub-centred)."""
import math
from mathutils import Matrix, Vector
from . import kit, dims as D
from .kit import V


def carcass(R, W, lug, bead, shoulder=0.06):
    """Closed (r, h) section of the casing under the lugs: bead seat, bulging sidewalls,
    rounded shoulders and the tread base (R - lug); h along the spin axis."""
    hw = W / 2
    base = R - lug
    side = [(bead + 0.004, hw - 0.020), (bead + 0.05, hw - 0.004), (lerp(bead, base, 0.45), hw + 0.010),
            (lerp(bead, base, 0.75), hw + 0.008), (base - shoulder * 0.6, hw - 0.004), (base - shoulder * 0.15, hw - shoulder * 0.55),
            (base, hw - shoulder)]
    prof = side + [(base, 0.0)] + [(r, -h) for r, h in reversed(side)]
    prof.append((bead + 0.002, -(hw - 0.03)))
    prof.append((bead + 0.002, hw - 0.03))
    prof.append(prof[0])
    return prof


def lerp(a, b, t):
    return a + (b - a) * t


def lug(poly_ah, r0, r1, draft=0.006):
    """A tread block: polygon in (arc length along the tread, axial h) around angle 0,
    standing from radius r0 to r1 (top face shrunk by `draft`)."""
    top = kit.offset_poly(kit.ccw(poly_ah), -draft)
    base = kit.ccw(poly_ah)
    n = len(base)
    verts = []
    for (s, h), r in [(p, r0) for p in base] + [(p, r1) for p in top]:
        a = s / r
        verts.append(Vector((h, r * math.cos(a), r * math.sin(a))))
    faces = [list(reversed(range(n))), list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    return verts, faces


def rot_x(mesh, a):
    M = Matrix.Rotation(a, 4, 'X')
    return kit.transform(mesh, M)


def swamper(R=D.RR_R, W=D.RR_W, pitches=22):
    """Rear tyre: casing + two staggered rows of angled lugs that wrap the shoulders,
    small centre blocks between them."""
    lug_h = 0.034
    base = R - lug_h
    out = [(kit.revolve(carcass(R, W, lug_h, 0.205), 72, axis='X'), 'rubber')]
    hw = W / 2
    step = 2 * math.pi * base / pitches
    for k in range(pitches):
        a = 2 * math.pi * k / pitches
        for side in (1, -1):
            off = 0.0 if side > 0 else step / 2
            # chevron lug: long, angled, running from near the centre over the shoulder
            poly = [(-0.050, side * 0.030), (0.020, side * 0.030), (0.070, side * (hw - 0.01)), (-0.005, side * (hw - 0.01))]
            poly = [(s + off, h) for s, h in poly]
            m = lug(poly, base - 0.004, R)
            out.append((rot_x(m, a), 'rubber'))
            # shoulder block rolling down the sidewall
            sh = [(0.004 + off, side * (hw - 0.004)), (0.060 + off, side * (hw - 0.004)), (0.052 + off, side * (hw + 0.012)),
                  (0.010 + off, side * (hw + 0.012))]
            poly2 = [(s, h) for s, h in sh]
            verts = []
            for (s, h), r in [(p, base - 0.05) for p in kit.ccw(poly2)] + [(p, base - 0.004) for p in kit.ccw(poly2)]:
                aa = s / r
                verts.append(Vector((h, r * math.cos(aa), r * math.sin(aa))))
            n = 4
            faces = [list(reversed(range(n))), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
            out.append((rot_x((verts, faces), a), 'rubber'))
        # centre bar
        c = [(-0.018 + step / 4, -0.022), (0.018 + step / 4, -0.022), (0.018 + step / 4, 0.022), (-0.018 + step / 4, 0.022)]
        out.append((rot_x(lug(c, base - 0.004, R - 0.006), a), 'rubber'))
    return out


def turf(R=D.FR_R, W=D.FR_W, pitches=30, rows=6):
    """Front tyre: casing + a close grid of square blocks (the film car's front tread)."""
    lug_h = 0.020
    base = R - lug_h
    out = [(kit.revolve(carcass(R, W, lug_h, 0.19, 0.05), 64, axis='X'), 'rubber')]
    hw = W / 2 - 0.018
    step = 2 * math.pi * base / pitches
    bw = step * 0.70
    bh = (2 * hw) / rows * 0.74
    for k in range(pitches):
        a = 2 * math.pi * k / pitches
        for j in range(rows):
            hc = -hw + (2 * hw) * (j + 0.5) / rows
            off = step * 0.5 if j % 2 else 0.0
            poly = [(-bw / 2 + off, hc - bh / 2), (bw / 2 + off, hc - bh / 2), (bw / 2 + off, hc + bh / 2), (-bw / 2 + off, hc + bh / 2)]
            out.append((rot_x(lug(poly, base - 0.004, R, 0.004), a), 'rubber'))
    return out


def rim(bead, W, outer=1, dish=0.08, spokes=5, holes=0):
    """Black steel wheel: barrel inside the bead, a dished centre on the `outer` face
    (+1 = +x) with either `spokes` slotted windows or round `holes`, a hub cap and nuts."""
    s = outer
    hw = W / 2
    out = []
    barrel = [(bead - 0.010, -hw + 0.012), (bead + 0.016, -hw + 0.008), (bead + 0.018, -hw + 0.026), (bead - 0.012, -hw + 0.034),
              (bead - 0.012, hw - 0.034), (bead + 0.018, hw - 0.026), (bead + 0.016, hw - 0.008), (bead - 0.010, hw - 0.012)]
    barrel.append(barrel[0])
    out.append((kit.revolve(barrel, 64, axis='X'), 'rim'))
    # beadlock ring on the outer face
    ring = [(bead - 0.030, s * (hw - 0.004)), (bead + 0.030, s * (hw - 0.004)), (bead + 0.030, s * (hw + 0.012)), (bead - 0.030, s * (hw + 0.012))]
    ring.append(ring[0])
    out.append((kit.revolve(ring, 64, axis='X'), 'rim'))
    for k in range(16):
        a = 2 * math.pi * k / 16
        c = Vector((s * (hw + 0.012), bead * math.cos(a), bead * math.sin(a)))
        M = Matrix.Translation(c) @ Matrix.Rotation(math.radians(90 * s), 4, 'Y')
        out.append((kit.revolve([(0.0, 0.0), (0.011, 0.0), (0.011, 0.012), (0.007, 0.018), (0.0, 0.018)], 6, axis='Z', M=M), 'steel'))
    h0 = s * (hw - dish)
    face = [(0.0, h0 - s * 0.014), (0.10, h0 - s * 0.014), (0.12, h0), (bead * 0.62, h0), (bead - 0.035, h0 + s * dish * 0.55),
            (bead - 0.02, s * (hw - 0.03)), (bead - 0.03, s * (hw - 0.05)), (bead - 0.05, h0 + s * dish * 0.45),
            (bead * 0.60, h0 - s * 0.018), (0.0, h0 - s * 0.030)]
    face.append(face[0])
    dm = kit.revolve(face, 64, axis='X')
    cutters = []
    if spokes:
        for k in range(spokes):
            a = 2 * math.pi * (k + 0.5) / spokes
            r0, r1 = 0.13, bead * 0.80
            w = 0.075
            u = Vector((0, math.cos(a), math.sin(a)))
            n = Vector((0, -math.sin(a), math.cos(a)))
            pts = [u * r0 + n * w * 0.55, u * r1 + n * w, u * r1 - n * w, u * r0 - n * w * 0.55]
            poly = [(p.y, p.z) for p in pts]
            cutters.append(kit.prism(poly, -1.0, 1.0, M=Matrix.Rotation(math.radians(90), 4, 'Y')))
    for k in range(holes):
        a = 2 * math.pi * (k + 0.5) / holes
        c = V(0, 0.60 * bead * math.cos(a), 0.60 * bead * math.sin(a))
        cutters.append(kit.revolve([(0.0, -1.0), (0.030, -1.0), (0.030, 1.0), (0.0, 1.0)], 16, axis='X', M=Matrix.Translation(c)))
    if cutters:
        b = kit.Builder()
        for c in cutters:
            b.add_mesh(c, 'interior')
        dm = kit.cut_mesh(dm, [(b.verts, b.faces)])
    out.append((dm, 'rim'))
    hub = [(0.0, h0 + s * 0.070), (0.055, h0 + s * 0.070), (0.075, h0 + s * 0.050), (0.095, h0 + s * 0.004), (0.0, h0 + s * 0.004)]
    hub.append(hub[0])
    out.append((kit.revolve(hub, 32, axis='X'), 'rim'))
    for k in range(8):
        a = 2 * math.pi * k / 8
        c = Vector((h0 + s * 0.002, 0.115 * math.cos(a), 0.115 * math.sin(a)))
        M = Matrix.Translation(c) @ Matrix.Rotation(math.radians(90 * s), 4, 'Y')
        out.append((kit.revolve([(0.0, 0.0), (0.016, 0.0), (0.016, 0.020), (0.011, 0.028), (0.0, 0.028)], 6, axis='Z', M=M), 'steel'))
    return out


def wheel(kind):
    """kind: 'front' | 'rear'. Mesh list around the hub, spin axis x, +x = outboard (L side)."""
    if kind == 'front':
        return turf() + rim(0.19, D.FR_W - 0.06, 1, 0.07, spokes=0, holes=8)
    return swamper() + rim(0.205, D.RR_W - 0.06, 1, 0.10, spokes=5)


def build(coll):
    """Front, outer rear and inner rear wheel objects per side. Returns name -> object."""
    out = {}
    specs = [('wheelF', 'front', D.FA_S, D.FR_X, -1),        # front rims face inward: the arms carry the hubs outboard
             ('wheelRo', 'rear', D.RA_S, D.RR_XO, 1),
             ('wheelRi', 'rear', D.RA_S, D.RR_XI, -1)]
    for name, kind, st, x, face in specs:
        meshes = wheel(kind)
        R = D.FR_R if kind == 'front' else D.RR_R
        for S, s in (('L', 1), ('R', -1)):
            b = kit.Builder()
            for m, slot in meshes:
                m2 = m if face > 0 else kit.mirror_x(m)          # inner rear wheels face the nozzle
                b.add_mesh(m2 if s > 0 else kit.mirror_x(m2), slot)
            o = b.build('%s.%s' % (name, S), coll)
            kit.finish(o, 0.0, 1, 30)
            o.location = V(s * x, D.f(st), R)
            out[o.name] = o
    return out
