"""The 28 ft pup van: four telescoping box sections (front = innermost, rear =
outermost with the doors), upper coupler and kingpin, rear bogie on slider
rails, underride guard. Each section is one car part so the transformation can
nest them; each grows by VAN_STEP per side over the one ahead of it, which the
truck shows as a stepped joint post between sections.

Coordinates: stations s back from the tractor's nose (dims.f), x left, z up."""
import math
from mathutils import Matrix, Vector
from . import kit, rkit, wheels, dims as D
from .kit import V

WALL = 0.018             # skin + lining
CORNER_R = 0.045         # roof-side edge radius
SEC_LEN = D.VAN_LEN / D.VAN_SECTIONS
OVERLAP = 0.10           # each section runs this far inside the next (the collar joint)


def P3(x, s, z):
    return V(x, D.f(s), z)


def section_dims(k):
    """(half width, floor z, top z, s0, s1) of section k (0 = front)."""
    g = (D.VAN_SECTIONS - 1 - k) * D.VAN_STEP
    s0 = D.VAN_FRONT_S + k * SEC_LEN
    s1 = s0 + SEC_LEN
    if k < D.VAN_SECTIONS - 1:
        s1 += OVERLAP                       # hidden inside the next section's collar
    return D.VAN_HW - g, D.VAN_FLOOR + g, D.VAN_TOP - g, s0, s1


def loop(hw, zb, zt, r, n=4):
    """Rounded rectangle (x, z), counter-clockwise; only the roof edges are rounded,
    the floor edges are square."""
    pts = [(hw, zb), (hw, zt - r)]
    for k in range(1, n):
        a = math.pi / 2 * k / n
        pts.append((hw - r + r * math.cos(a), zt - r + r * math.sin(a)))
    pts.append((hw - r, zt))
    pts.append((-hw + r, zt))
    for k in range(1, n):
        a = math.pi / 2 + math.pi / 2 * k / n
        pts.append((-hw + r + r * math.cos(a), zt - r + r * math.sin(a)))
    pts += [(-hw, zt - r), (-hw, zb)]
    return pts


def tube(outer, inner, s0, s1):
    """Hollow prism between two (x, z) loops along s (open ends as annuli)."""
    n = len(outer)
    verts = [P3(x, s0, z) for x, z in outer] + [P3(x, s1, z) for x, z in outer] + \
            [P3(x, s0, z) for x, z in inner] + [P3(x, s1, z) for x, z in inner]
    O0, O1, I0, I1 = 0, n, 2 * n, 3 * n
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append([O0 + i, O0 + j, O1 + j, O1 + i])
        faces.append([I1 + i, I1 + j, I0 + j, I0 + i])
        faces.append([I0 + i, I0 + j, O0 + j, O0 + i])
        faces.append([O1 + i, O1 + j, I1 + j, I1 + i])
    return verts, faces


def slab_xz(poly, s0, s1, r=0.004):
    """Plate with an (x, z) outline between stations s0 < s1."""
    M = kit.frame_from(P3(0, s0, 0), (1, 0, 0), (0, 0, 1))          # local z = forward
    return kit.bevel_prism(poly, -(s1 - s0), 0.0, r, 1, M=M)


def box(x0, x1, s0, s1, z0, z1, r=0.004):
    poly = [(x0, -D.f(s0)), (x1, -D.f(s0)), (x1, -D.f(s1)), (x0, -D.f(s1))]
    return kit.bevel_prism(poly, z0, z1, r, 1)


def section(k):
    """Meshes of section k."""
    hw, zb, zt, s0, s1 = section_dims(k)
    out = []
    outer = loop(hw, zb, zt, CORNER_R)
    inner = [(x * (hw - WALL) / hw, zb + WALL + (z - zb) * (zt - zb - 2 * WALL) / (zt - zb)) for x, z in outer]
    out.append((tube(outer, inner, s0, s1), 'van'))
    vis1 = s1 - (OVERLAP if k < D.VAN_SECTIONS - 1 else 0.0)
    # rails: bottom rail with conspicuity tape, top rail
    for sgn in (1, -1):
        x0, x1 = (hw - 0.002, hw + 0.012) if sgn > 0 else (-hw - 0.012, -hw + 0.002)
        out.append((box(x0, x1, s0 + 0.004, vis1 - 0.004, zb, zb + 0.20, 0.003), 'alu'))
        out.append((box(x0, x1, s0 + 0.004, vis1 - 0.004, zt - 0.10, zt - 0.02, 0.003), 'alu'))
        xt0, xt1 = (hw + 0.010, hw + 0.014) if sgn > 0 else (-hw - 0.014, -hw - 0.010)
        n = int((vis1 - s0 - 0.1) / 0.60)
        for i in range(n):
            a = s0 + 0.08 + i * 0.60
            out.append((box(xt0, xt1, a, a + 0.30, zb + 0.07, zb + 0.125, 0.001), 'tapeRed' if i % 2 else 'tapeWhite'))
        # exterior posts
        xp0, xp1 = (hw - 0.002, hw + 0.005) if sgn > 0 else (-hw - 0.005, -hw + 0.002)
        s = s0 + 0.30
        while s < vis1 - 0.25:
            out.append((box(xp0, xp1, s - 0.022, s + 0.022, zb + 0.20, zt - 0.10, 0.002), 'van'))
            s += 0.61
    # joint collar at the visible rear end of the inner sections (the stepped post)
    if k < D.VAN_SECTIONS - 1:
        g = D.VAN_STEP
        ring_o = loop(hw + g - 0.004, zb - g + 0.004, zt + g - 0.004, CORNER_R + g)
        ring_i = loop(hw - 0.002, zb + 0.002, zt + 0.002, CORNER_R)
        out.append((tube(ring_o, ring_i, vis1 - 0.05, vis1), 'van'))
    # floor crossmembers (clear of the tractor's fifth wheel under section 0)
    s = s0 + 0.20
    while s < vis1 - 0.1:
        if not (k == 0 and s < D.FIFTH_S + 0.9):
            out.append((box(-hw + 0.06, hw - 0.06, s - 0.04, s + 0.04, zb - 0.11, zb, 0.004), 'chassis'))
        s += 0.36
    return out


def front_wall():
    hw, zb, zt, s0, s1 = section_dims(0)
    out = [(slab_xz(loop(hw - 0.004, zb + 0.004, zt - 0.004, CORNER_R), s0 - 0.03, s0 + 0.01, 0.012), 'van')]
    # horizontal stiffening ribs and the corner caps
    for z in (zb + 0.55, zb + 1.10, zb + 1.65, zb + 2.20):
        out.append((slab_xz(kit.rect(2 * hw - 0.16, 0.06, 0, z), s0 - 0.05, s0 - 0.03, 0.006), 'van'))
    for sgn in (1, -1):
        out.append((slab_xz([(sgn * (hw - 0.08), zb), (sgn * (hw + 0.004), zb), (sgn * (hw + 0.004), zt - 0.06), (sgn * (hw - 0.08), zt - 0.06)],
                            s0 - 0.045, s0 + 0.12, 0.006), 'alu'))
    # upper coupler and kingpin
    out.append((box(-0.70, 0.70, s0 + 0.12, s0 + 1.90, D.FIFTH_Z + 0.004, zb, 0.008), 'chassis'))
    out.append((rkit.cylinder((0, D.f(D.FIFTH_S), D.FIFTH_Z - 0.05), 0.045, 0.11, 'z', 20), 'steel'))
    # gladhand bracket (air and electric couplings)
    out.append((box(-0.30, 0.30, s0 - 0.08, s0 - 0.03, zb + 0.30, zb + 0.46, 0.006), 'chassis'))
    for x, slot in ((-0.16, 'tapeRed'), (0.0, 'steel'), (0.16, 'tapeWhite')):
        out.append((rkit.cylinder((x, D.f(s0 - 0.11), zb + 0.38), 0.035, 0.06, 'f', 16), slot))
    return out


def rear_end():
    """Door frame, two swing doors with lock rods and hinges, lamps, underride guard."""
    hw, zb, zt, s0, s1 = section_dims(D.VAN_SECTIONS - 1)
    out = []
    # frame: header, sill and corner posts, proud of the skin
    frame_o = loop(hw + 0.012, zb - 0.01, zt + 0.012, CORNER_R + 0.012)
    frame_i = [(x, z) for x, z in loop(hw - 0.10, zb + 0.14, zt - 0.20, 0.02)]
    out.append((tube(frame_o, frame_i, s1 - 0.12, s1 + 0.02), 'alu'))
    # doors, split on the centreline, 25 mm behind the frame face
    for sgn in (1, -1):
        x0, x1 = (0.006, hw - 0.10) if sgn > 0 else (-hw + 0.10, -0.006)
        out.append((box(x0, x1, s1 - 0.02, s1 + 0.005, zb + 0.14, zt - 0.20, 0.006), 'van'))
        for xr in (0.30, 0.82):
            x = sgn * xr
            out.append((kit.tube([P3(x, s1 + 0.03, zb + 0.10), P3(x, s1 + 0.03, zt - 0.12)], 0.016, 10), 'steel'))
            out.append((box(x - 0.03, x + 0.03, s1 + 0.005, s1 + 0.05, zb + 0.08, zb + 0.13), 'alu'))
            out.append((box(x - 0.03, x + 0.03, s1 + 0.005, s1 + 0.05, zt - 0.17, zt - 0.12), 'alu'))
            out.append((kit.bar(P3(x, s1 + 0.03, zb + 1.10), P3(x - sgn * 0.05, s1 + 0.07, zb + 0.72), kit.chamfer_rect(0.03, 0.02, 0.005)), 'steel'))
        for z in (zb + 0.35, zb + 1.05, zb + 1.75, zt - 0.45):
            xo = sgn * (hw - 0.05)
            out.append((box(xo - 0.07, xo + 0.07, s1 + 0.005, s1 + 0.035, z - 0.05, z + 0.05, 0.004), 'steel'))
        # tail lamps in the sill ends and marker lamps at the top corners
        for dz in (0.0,):
            xc = sgn * (hw - 0.25)
            out.append((rkit.cylinder((xc, D.f(s1 + 0.02), zb + 0.05), 0.055, 0.03, 'f', 20), 'lightRed'))
            out.append((rkit.cylinder((xc - sgn * 0.16, D.f(s1 + 0.02), zb + 0.05), 0.055, 0.03, 'f', 20), 'lightRed'))
        out.append((box(sgn * (hw - 0.08) - 0.03, sgn * (hw - 0.08) + 0.03, s1 + 0.02, s1 + 0.035, zt - 0.06, zt - 0.02, 0.002), 'lightRed'))
    # underride guard
    out.append((box(-1.12, 1.12, s1 - 0.10, s1 + 0.02, 0.48, 0.60, 0.008), 'chassis'))
    out.append((box(-1.12, 1.12, s1 + 0.018, s1 + 0.022, 0.50, 0.58, 0.002), 'tapeRed'))
    for x in (-0.55, 0.55):
        out.append((box(x - 0.05, x + 0.05, s1 - 0.25, s1 - 0.10, 0.52, zb - 0.10, 0.006), 'chassis'))
    return out


BOGIE_TUCK = 0.30          # each bogie half slides inboard this far while it retracts ...
BOGIE_AFT = 0.35           # ... and aft, so its hangers stay inside the nested box's front wall


def bogie_half(sgn):
    """One side of the bogie as a rigid unit: slider rail, hanger, trailing arm, air spring,
    brake drum, mud flap and half the axle (the wheels are separate nodes). The axle halves
    telescope: the right one runs inside the left one, so the halves can slide inboard
    together without any part of one half passing through the other's."""
    hw, zb, zt, s0, s1 = section_dims(D.VAN_SECTIONS - 1)
    sa = D.VAN_AXLE_S
    out = []
    x = 0.50
    out.append((box(x - 0.05, x + 0.05, sa - 0.90, sa + 0.95, zb - 0.26, zb - 0.11, 0.006), 'chassis'))
    out.append((box(x - 0.05, x + 0.05, sa - 0.62, sa - 0.50, D.AXLE_Z + 0.08, zb - 0.26, 0.006), 'chassis'))
    out.append((kit.bar(P3(x, sa - 0.56, D.AXLE_Z + 0.12), P3(x, sa + 0.34, D.AXLE_Z - 0.06), kit.chamfer_rect(0.09, 0.07, 0.015)), 'chassis'))
    out.append((rkit.cylinder((x, D.f(sa + 0.34), D.AXLE_Z + 0.20), 0.13, 0.30, 'z', 24), 'rubber'))
    # mud flap behind the wheels
    out.append((box(0.60, 1.22, sa + D.WHEEL_R + 0.14, sa + D.WHEEL_R + 0.154, 0.30, zb - 0.10, 0.004), 'rubber'))
    out.append((box(0.60, 1.22, sa + D.WHEEL_R + 0.10, sa + D.WHEEL_R + 0.14, zb - 0.16, zb - 0.10, 0.004), 'chassis'))
    out.append((rkit.cylinder((0.68, D.f(sa), D.AXLE_Z), 0.19, 0.16, 'x', 32), 'chassis'))
    if sgn > 0:
        out.append((rkit.cylinder((0.31, D.f(sa), D.AXLE_Z), 0.075, 0.66, 'x', 24), 'chassis'))      # outer axle tube
    else:
        out.append((rkit.cylinder((0.31, D.f(sa), D.AXLE_Z), 0.058, 0.66, 'x', 24), 'chassis'))      # inner axle tube
    return out if sgn > 0 else [(kit.mirror_x(m), slot) for m, slot in out]


def build(coll):
    parts = {}

    def make(name, meshes, bevel=0.003):
        b = kit.Builder()
        for m, slot in meshes:
            b.add_mesh(m, slot)
        o = b.build(name, coll)
        kit.finish(o, bevel, 2, 30)
        parts[name] = o
        return o

    for k in range(D.VAN_SECTIONS):
        meshes = section(k)
        if k == 0:
            meshes += front_wall()
        if k == D.VAN_SECTIONS - 1:
            meshes += rear_end()
        make('van%d' % k, meshes)
    for S, sgn in (('L', 1), ('R', -1)):
        make('vanBogie.' + S, bogie_half(sgn))
    x = (D.DUAL_IN_X + D.DUAL_OUT_X) / 2
    meshes = wheels.wheel('dual')
    for S, s in (('L', 1), ('R', -1)):
        b = kit.Builder()
        for m, slot in meshes:
            b.add_mesh(m if s > 0 else kit.mirror_x(m), slot)
        o = b.build('wheelV.' + S, coll)
        kit.finish(o, 0.0, 1, 30)
        o.location = V(s * x, D.f(D.VAN_AXLE_S), D.AXLE_Z)
        parts[o.name] = o
    return parts
