"""Cab panels cut from the body surface (body.py), plus glass, lights, arch
liners and mirrors. Names are the car parts the transformation program moves
(side parts end in .L / .R)."""
import math
import bmesh
from mathutils import Vector, Matrix
from . import kit, rkit, body, dims as D
from .body import P, normal, region_grid, level, v_at_z, u_at_s, u_at_x, panel
from .kit import V
from .shape import lerp

GAP = 0.007           # panel seam
SKIN = 0.022          # body panel thickness
GLASS_IN = 0.006      # glass sits this far below the paint line
U_A = 0.80            # A-pillar (front parameter): the windshield wraps round the corner
FAIRING_SPLIT = 3.30  # station where the fairing's curved front nests into its rear
PILLAR = 0.075        # A-pillar trim width


def lv():
    return dict(val=v_at_z(D.VALENCE_Z), lb0=v_at_z(D.LIGHT_Z - 0.022), lb1=v_at_z(D.LIGHT_Z + 0.022),
                ws=v_at_z(D.WS_BASE_Z), sill=v_at_z(D.SIDE_GLASS_Z), gt=v_at_z(D.GLASS_TOP_Z),
                skirt=v_at_z(D.SKIRT_Z), low=v_at_z(0.40), bot=0.0)


def const(u):
    return lambda v: u


def side_s(s):
    return lambda v: u_at_s(v, s)


def arch_cutter(front=True):
    """Wheel arch opening: a cylinder about the axle, through both sides."""
    fs = D.f(D.FA_S)
    return kit.revolve([(0.0, -1.6), (D.ARCH_R, -1.6), (D.ARCH_R, 1.6), (0.0, 1.6)], 48, axis='X',
                       M=Matrix.Translation(V(0, fs, D.AXLE_Z)))


def build(coll):
    L = lv()
    parts = {}
    arch = arch_cutter()

    def mk(name, v0, v1, ua, ub, slot, nu, nv, thick=SKIN, offset=0.0, cut=False, gap=GAP, **kw):
        g = region_grid(v0, v1, ua, ub, nu, nv, gap=gap, **kw)
        o = panel(name, coll, g, slot, thick, offset, cutters=[arch] if cut else ())
        parts[name] = o
        return o

    def sided(name, v0, v1, ua, ub, slot, nu, nv, **kw):
        mk(name + '.L', v0, v1, ua, ub, slot, nu, nv, **kw)
        ra, rb = body.mirror_region(ua, ub)
        if isinstance(kw.get('ugap'), tuple):
            kw = dict(kw, ugap=tuple(reversed(kw['ugap'])))
        mk(name + '.R', v0, v1, ra, rb, slot, nu, nv, **kw)

    s_arch_rear = D.FA_S + D.ARCH_R + 0.03
    arch_end = side_s(s_arch_rear)

    # ---------------------------------------------------------------- nose
    # black valence and the white bumper wrap the front corners to the arches
    mk('valence', L['bot'], L['val'], lambda v: -u_at_s(v, D.FA_S), lambda v: u_at_s(v, D.FA_S), 'blackMatte', 72, 8, cut=True)
    mk('bumper', L['val'], L['lb0'], lambda v: -u_at_s(v, D.FA_S), lambda v: u_at_s(v, D.FA_S), 'paint', 96, 28, cut=True)
    # light bar: a thin strip across the front, headlight clusters at the corners
    mk('lightbar', L['lb0'], L['lb1'], const(-0.86), const(0.86), 'lamp', 60, 1, thick=0.012, offset=-0.003, gap=0.003)
    # hood between the diagonal creases that run from the headlights to the windshield corners
    xa = body.outline_point(U_A, L['ws'])[0]

    def hood_edge(v):
        t = max(0.0, min(1.0, (v - L['lb1']) / (L['ws'] - L['lb1'])))
        return u_at_x(v, lerp(0.70, xa - 0.02, t ** 0.9))
    mk('hood', L['lb1'], L['ws'], lambda v: -hood_edge(v), hood_edge, 'paint', 40, 18)
    # fenders: headlight corner round to the door, light bar up to the sill (windshield base at the corner)
    sided('lightcorner', L['lb0'], L['lb1'], const(0.86), side_s(D.FA_S), 'paint', 40, 2, gap=0.003, cut=True)

    def fender_ua(v):
        return hood_edge(v) if v <= L['ws'] else U_A
    sided('fender', L['lb1'], L['sill'], fender_ua, side_s(D.DOOR_S[0]), 'paint', 48, 40, cut=True)
    # Close the rear quadrant between the wheel arch and the front door.
    # The bumper ends at the axle station; the upper fender starts above the
    # light strip, so this curved triangular return needs its own surface.
    sided('archReturn', L['skirt'], L['lb1'], side_s(D.FA_S), side_s(D.DOOR_S[0]),
          'paint', 36, 24, cut=True)
    # ---------------------------------------------------------------- glass band
    mk('windshield', L['ws'], L['gt'], const(-U_A), const(U_A), 'glass', 60, 26, thick=0.012, offset=-GLASS_IN, gap=0.004)
    uA1 = lambda v: U_A + body._du(U_A, v, PILLAR)
    sided('apillar', L['ws'], L['gt'], const(U_A), uA1, 'trim', 2, 26, thick=0.018, gap=0.004)
    sided('qglass', L['sill'], L['gt'], uA1, side_s(D.DOOR_S[0]), 'glass', 16, 12, thick=0.012, offset=-GLASS_IN, gap=0.004)
    # ---------------------------------------------------------------- doors and side
    sided('door', L['skirt'], L['sill'], side_s(D.DOOR_S[0]), side_s(D.DOOR_S[1]), 'paint', 36, 40)
    sided('doorGlass', L['sill'], L['gt'], side_s(D.DOOR_S[0]), side_s(D.DOOR_S[1]), 'glass', 12, 10, thick=0.012,
          offset=-GLASS_IN, gap=0.004, ugap=(0.012, 0.030))
    sided('quarter', L['skirt'], L['gt'], side_s(D.DOOR_S[1]), side_s(D.QUARTER_S), 'paint', 28, 64)
    sided('extender', L['skirt'], L['gt'], side_s(D.QUARTER_S), const(2.0), 'paint', 10, 22)
    sided('rearwall', L['skirt'], L['gt'], const(2.0), const(4.0), 'paint', 20, 22)
    # ---------------------------------------------------------------- skirts
    sided('skirtF', L['low'], L['skirt'], arch_end, side_s(D.DOOR_S[1]), 'blackMatte', 14, 6, cut=True)
    sided('skirt', L['low'], L['skirt'], side_s(D.DOOR_S[1]), const(2.0), 'blackMatte', 20, 6)
    sided('skirtRear', L['low'], L['skirt'], const(2.0), const(4.0), 'blackMatte', 12, 6)
    # ---------------------------------------------------------------- roof fairing
    for S, s in (('L', 1), ('R', -1)):
        parts.update(fairing_panels(coll,s))
        parts['roofcap.' + S] = roof_cap(coll, s)
    # ---------------------------------------------------------------- details
    parts.update(arch_liners(coll))
    parts.update(markers(coll, L))
    parts.update(mirrors(coll, L))
    return parts


def fairing_panels(coll,side):
    """Cut both roof pieces from ONE sampled skin along parallel seam planes.

    Independent parameter grids used to miss the exact point where the
    transverse split met the centreline, leaving a tapered triangular gap.
    Plane cuts share the same surface and preserve a constant physical gap.
    """
    grid=region_grid(v_at_z(D.GLASS_TOP_Z),1.0,const(0),const(4),128,120,
                     gap=GAP,vgap=(GAP,0.0),ugap=(0.004,0.004))
    mesh=body.shell(grid,SKIN)
    if side<0:
        mesh=kit.mirror_x(mesh)
    out={}
    for front,name in ((False,'fairing'),(True,'fairingF')):
        bm=bmesh.new()
        vs=[bm.verts.new(v) for v in mesh[0]]
        for face in mesh[1]: bm.faces.new([vs[i] for i in face])
        cut_y=FAIRING_SPLIT-D.S0+(-GAP/2 if front else GAP/2)
        result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                                     dist=1e-7,plane_co=(0,cut_y,0),plane_no=(0,1,0),
                                     clear_inner=not front,clear_outer=front)
        rim=[e for e in result['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
        if rim: bmesh.ops.holes_fill(bm,edges=rim,sides=0)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        full=name+('.L' if side>0 else '.R')
        o=kit.obj_from_bm(full,bm,['paint'],coll)
        kit.finish(o,0.002,2,35)
        out[full]=o
    return out


def roof_cap(coll, side, thick=SKIN):
    """Flat top closing one fairing half: the last outline's half, filled flat."""
    n = 80
    pts = [P(side * 4.0 * k / n, 1.0) for k in range(n + 1)]
    poly = [(p.x, p.y) for p in pts]
    z = pts[0].z
    if side < 0:
        poly.reverse()
    xs = 0.002 * side
    poly = [(x if abs(x) > 0.004 else xs, y) for x, y in poly]
    b = kit.Builder()
    b.add_mesh(kit.bevel_prism(kit.ccw(poly), z - thick, z, 0.004, 1), 'paint')
    o = b.build('roofcap.' + ('L' if side > 0 else 'R'), coll)
    kit.finish(o, 0.0, 1, 30)
    return o


def v_at_s(s):
    """Level whose centreline station is s (the profile's s rises monotonically up the fairing)."""
    lo, hi = v_at_z(D.GLASS_TOP_Z), 1.0
    for _ in range(40):
        m = (lo + hi) / 2
        if level(m)[0] < s:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def u_split(v, s):
    """Outline parameter of station s at level v: on the front curve when it reaches that
    far back, else on the side; 0 once the whole level lies behind s."""
    sc, z = level(v)
    if sc >= s:
        return 0.0
    W, depth, n, rear = body.plan(z)
    if s < sc + depth:
        return body.u_at_front_s(v, s)
    return u_at_s(v, s)


def sector(fc, zc, r0, r1, x0, x1, a0, a1, n=40):
    """Closed annular sector about an x axis through (fc, zc): radii r0..r1, x0..x1,
    angles a0..a1 (deg, 0 = forward, 90 = up)."""
    verts = []
    for k in range(n + 1):
        a = math.radians(lerp(a0, a1, k / n))
        c, s = math.cos(a), math.sin(a)
        for r, x in ((r0, x0), (r1, x0), (r1, x1), (r0, x1)):
            verts.append(V(x, fc + r * c, zc + r * s))
    faces = []
    for k in range(n):
        for j in range(4):
            a, b = k * 4 + j, k * 4 + (j + 1) % 4
            faces.append([a, b, b + 4, a + 4])
    faces.append([3, 2, 1, 0])
    faces.append([n * 4, n * 4 + 1, n * 4 + 2, n * 4 + 3])
    return verts, faces


def arch_liners(coll):
    """Black wheel-arch liners: an annular sector inside each front arch."""
    out = {}
    fs = D.f(D.FA_S)
    for S, s in (('L', 1), ('R', -1)):
        m = sector(fs, D.AXLE_Z, D.ARCH_R - 0.010, D.ARCH_R + 0.030, 0.88, D.BODY_W - 0.03, -12.0, 192.0)
        # the outer face follows the skin (the shoulder and the arch lip swell it outward),
        # finishing 12 mm inside it so the liner closes the cut edge of the fender shell
        verts = []
        for v in m[0]:
            if v.x > 0.9:
                v = v.copy()
                v.x = body.side_x(D.S0 + v.y, v.z) - 0.012          # Blender y = s - S0
            verts.append(v)
        m = (verts, m[1])
        if s < 0:
            m = kit.mirror_x(m)
        b = kit.Builder()
        b.add_mesh(m, 'blackMatte')
        o = b.build('archLiner.' + S, coll)
        kit.finish(o, 0.003, 1, 30)
        out[o.name] = o
    return out


def markers(coll, L):
    """Amber marker lights along the top of the windshield band."""
    b = kit.Builder()
    v = v_at_z(D.GLASS_TOP_Z - 0.055)
    for x in (-0.36, -0.12, 0.12, 0.36, -1.02, 1.02):
        u = u_at_x(v, abs(x)) * (1 if x >= 0 else -1)
        p, n = P(u, v), normal(u, v)
        t = Vector((0, 0, 1)).cross(n).normalized()
        w = 0.07 if abs(x) < 0.5 else 0.10
        M = kit.frame_from(p - n * GLASS_IN, t, Vector((0, 0, 1)))
        b.add_mesh(kit.bevel_prism(kit.rect(w, 0.018), -0.004, 0.003, 0.0015, 1, M=M), 'amber')
    o = b.build('markers', coll)
    kit.finish(o, 0.0, 1, 30)
    return {'markers': o}


def mirrors(coll, L):
    """Mirror arms from the windshield base corners and tall mirror heads."""
    out = {}
    v = L['ws'] + 0.004
    for S, s in (('L', 1), ('R', -1)):
        u = s * (U_A - 0.02)
        base = P(u, v)
        n = normal(u, v)
        b = kit.Builder()
        head_c = base + Vector((s * 0.52, -0.30, 0.22))
        mid = base + Vector((s * 0.30, -0.18, 0.02))
        b.add_mesh(kit.tube([base - n * 0.03, mid, head_c + Vector((-s * 0.06, 0.0, -0.10))], 0.028, 12), 'trim')
        b.add_mesh(kit.tube([base - n * 0.03 + Vector((0, 0.02, 0.06)), base + Vector((s * 0.14, -0.10, 0.08))], 0.022, 10), 'trim')
        # head: rounded tall housing, glass facing back
        sec = kit.fillet_poly(kit.rect(0.15, 0.24), 0.05, 4)
        M = Matrix.Translation(head_c) @ Matrix.Rotation(math.radians(-s * 12), 4, 'Z')
        hv, hf = kit.section_loft([sec, [(x * 1.02, y * 1.02) for x, y in sec], [(x * 0.9, y * 0.85) for x, y in sec]],
                                  [-0.30, 0.10, 0.34], M=M, cap_round=0.04, seg=2)
        b.add_mesh((hv, hf), 'trim')
        gM = M @ Matrix.Translation((0, 0.121, 0.02)) @ Matrix.Rotation(math.radians(-90), 4, 'X')
        b.add_mesh(kit.bevel_prism(kit.fillet_poly(kit.rect(0.12, 0.54), 0.035, 3), -0.004, 0.004, 0.002, 1, M=gM), 'glass')
        o = b.build('mirror.' + S, coll)
        kit.finish(o, 0.004, 2, 30)
        out[o.name] = o
    return out
