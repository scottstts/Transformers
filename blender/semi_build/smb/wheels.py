"""Wheels: 295/80R22.5 tyres on 22.5 x 8.25 aluminium discs. Front wheels wear
Tesla's polished aero covers; each drive corner is a dual pair (one rigid wheel
node, inner + outer). Meshes are hub-centred with the spin axis on x; the
object's location is the hub (the exporter stores wheels hub-centred)."""
import math
from mathutils import Matrix, Vector
from . import kit, rkit, dims as D
from .kit import V

R = D.WHEEL_R
HW = D.TYRE_W / 2
BEAD = 0.286


def tyre_profile():
    """Closed (r, h) section of the tyre: bead, bulging sidewalls, shoulders, tread with
    four circumferential grooves (h along the spin axis)."""
    side = [(BEAD + 0.004, 0.108), (0.330, 0.126), (0.390, 0.140), (0.450, 0.145), (0.488, 0.139), (0.508, 0.126), (R - 0.004, 0.112), (R, 0.100)]
    tread = []
    # tread from +h to -h with grooves at +-0.080 and +-0.030 (10 mm wide, 14 mm deep)
    marks = [0.100, 0.085, 0.075, 0.035, 0.025, -0.025, -0.035, -0.075, -0.085, -0.100]
    for k, h in enumerate(marks):
        tread.append((R, h))
        if k in (1, 3, 5, 7):          # groove floor between this mark and the next
            tread.append((R - 0.014, h - 0.001))
            tread.append((R - 0.014, marks[k + 1] + 0.001))
    prof = side + tread[1:-1] + [(x, -h) for x, h in reversed(side)]
    # the bead seat sits inside the rim's barrel (whose inner face is at BEAD - 0.006):
    # at the same radius the two faces z-fought
    prof.append((BEAD + 0.002, -0.100))
    prof.append((BEAD + 0.002, 0.100))
    prof.append(prof[0])
    return prof


def tyre(seg=64):
    v, f = kit.revolve(tyre_profile(), seg, axis='X')
    return v, f


def disc(outer_face, dish=0.070, holes=10, cover=False):
    """Rim: barrel inside the bead, disc face on the `outer_face` side (+1 = +x), hub pilot,
    ten studs; hand holes cut through the disc. Returns [(mesh, slot)]."""
    s = outer_face
    out = []
    barrel = [(BEAD - 0.006, -0.110), (BEAD + 0.012, -0.112), (BEAD + 0.014, -0.100), (BEAD - 0.012, -0.090),
              (BEAD - 0.012, 0.090), (BEAD + 0.014, 0.100), (BEAD + 0.012, 0.112), (BEAD - 0.006, 0.110)]
    barrel.append(barrel[0])
    out.append((kit.revolve(barrel, 64, axis='X'), 'rim'))
    # disc: flange ring -> dish -> hub face (profile in (r, h), h toward the outside)
    face = [(0.0, dish - 0.016), (0.110, dish - 0.016), (0.120, dish), (0.165, dish), (0.200, dish - 0.010),
            (0.245, dish - 0.050), (BEAD - 0.015, dish - 0.070), (BEAD - 0.012, dish - 0.090),
            (0.250, dish - 0.070), (0.205, dish - 0.030), (0.160, dish - 0.022), (0.0, dish - 0.030)]
    face = [(r, h if s > 0 else -h) for r, h in face]
    face.append(face[0])
    dm = kit.revolve(face, 64, axis='X')
    if holes and not cover:
        cutters = []
        for k in range(holes):
            a = 2 * math.pi * (k + 0.5) / holes
            c = V(0, 0.215 * math.cos(a), 0.215 * math.sin(a))
            cutters.append(kit.revolve([(0.0, -0.3), (0.032, -0.3), (0.032, 0.3), (0.0, 0.3)], 16, axis='X', M=Matrix.Translation(c)))
        b = kit.Builder()
        for c in cutters:
            b.add_mesh(c, 'interior')
        allc = (b.verts, b.faces)
        dm = kit.cut_mesh(dm, [allc])
    out.append((dm, 'rim'))
    if cover:
        # polished aero cover: a shallow dome over the whole disc, with a raised centre
        prof = [(0.0, dish + 0.060), (0.080, dish + 0.058), (0.090, dish + 0.050), (0.180, dish + 0.030),
                (0.260, dish + 0.004), (BEAD + 0.008, dish - 0.030), (BEAD + 0.008, dish - 0.046), (0.0, dish - 0.046)]
        prof = [(r, h if s > 0 else -h) for r, h in prof]
        prof.append(prof[0])
        out.append((kit.revolve(prof, 64, axis='X'), 'hubcap'))
    else:
        # hub, studs and nuts
        hub = [(0.0, dish + 0.060), (0.060, dish + 0.060), (0.075, dish + 0.040), (0.080, dish - 0.010), (0.0, dish - 0.010)]
        hub = [(r, h if s > 0 else -h) for r, h in hub]
        hub.append(hub[0])
        out.append((kit.revolve(hub, 32, axis='X'), 'steel'))
        for k in range(10):
            a = 2 * math.pi * k / 10
            c = (s * (dish + 0.002), 0.1425 * math.cos(a), 0.1425 * math.sin(a))
            M = Matrix.Translation(Vector(c)) @ Matrix.Rotation(math.radians(90 * s), 4, 'Y')
            out.append((kit.revolve([(0.0, 0.0), (0.017, 0.0), (0.017, 0.022), (0.012, 0.030), (0.0, 0.030)], 6, axis='Z', M=M), 'chrome'))
    return out


def wheel(kind):
    """kind: 'front' | 'dual'. Mesh list around the hub, spin axis x, +x = outboard (L side)."""
    out = []
    if kind == 'front':
        out.append((tyre(), 'rubber'))
        out += disc(1, cover=True)
        return out
    # dual pair: inner centre at -gap/2 relative to the pair centre, outer at +gap/2
    gap = D.DUAL_OUT_X - D.DUAL_IN_X
    for dx, outer in ((-gap / 2, False), (gap / 2, True)):
        M = Matrix.Translation((dx, 0, 0))
        out.append((kit.transform(tyre(), M), 'rubber'))
        for m, s in disc(1 if outer else -1, holes=10 if outer else 0):
            out.append((kit.transform(m, M), s))
    return out


def build(coll):
    """Four wheel objects per side: front, dual 1, dual 2. Returns name -> object."""
    out = {}
    specs = [('wheelF', 'front', D.FA_S, D.FRONT_X), ('wheelR1', 'dual', D.RA1_S, (D.DUAL_IN_X + D.DUAL_OUT_X) / 2),
             ('wheelR2', 'dual', D.RA2_S, (D.DUAL_IN_X + D.DUAL_OUT_X) / 2)]
    for name, kind, st, x in specs:
        meshes = wheel(kind)
        for S, s in (('L', 1), ('R', -1)):
            b = kit.Builder()
            for m, slot in meshes:
                b.add_mesh(m if s > 0 else kit.mirror_x(m), slot)
            o = b.build('%s.%s' % (name, S), coll)
            kit.finish(o, 0.0, 1, 30)
            o.location = V(s * x, D.f(st), D.AXLE_Z)
            out[o.name] = o
    return out
