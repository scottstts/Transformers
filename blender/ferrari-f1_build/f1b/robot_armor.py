"""Robot armour: the hero plates, designed for the robot first (bone-local,
standing rest frame; L side authored, R mirrored).

The language is Scuderia red lacquer over a gunmetal endoskeleton: layered,
sharp-edged plates with curved faces, a V chest meeting in a nose-cone keel,
flared forearm gauntlets with sidepod intakes, big quad and calf shells, a
pointed kneecap. White is kept to accents (keel stripe, collar tips), carbon
to fins and underlayers.

Every plate is its own object so the transformation can stow it separately.
"""
import math
from mathutils import Vector
from . import kit, rkit, rig
from .kit import V
from .rkit import Part
from .shape import lerp, smooth01, clamp01, loft_rings, plate, lathe
from .armor import panel, outline_rows, pwl, wrap, sheet, side_sheet
from . import hardsurf as hs, mechkit

SIDES = (('L', 1), ('R', -1))


def mirror(mesh):
    return kit.mirror_x(mesh)


def _part(name, items, bevel=0.004):
    p = Part(name)
    for m, s in items:
        p.add(m, s)
    return p


# ------------------------------------------------------------------ chest (chest bone)
def chest_front(x, z):
    """Chest front: faceted pec -- a vertical crease at x 0.20 and a horizontal
    crease at z 0.47 catch hard highlights; the flank wraps back."""
    tent = math.sin(math.pi * clamp01(x / 0.56))
    ridge = 0.050 - 0.28 * abs(z - 0.47)
    wrapback = 1.1 * max(0.0, x - 0.34) ** 2
    return 0.232 + 0.070 * tent + ridge - wrapback


def pec():
    P, hint = sheet(chest_front)
    zmap = lambda z: (z - 0.150) / (0.740 - 0.150)
    right = pwl([(zmap(0.150), 0.060), (zmap(0.400), 0.470), (zmap(0.620), 0.490), (zmap(0.740), 0.250)])
    # two plates split on the horizontal crease (a seam across the pec)
    lower = [(0.155,0.048,0.072),(0.230,0.046,0.190),(0.310,0.046,0.285),
             (0.370,0.046,0.450),(0.425,0.046,0.465),(0.456,0.046,0.455)]
    upper = [(0.474,0.052,0.454),(0.540,0.052,0.485),(0.625,0.052,0.488),
             (0.690,0.055,0.380),(0.740,0.060,0.250)]
    base = panel(P, lower, 0.036, hint, nu=16)
    base_u = panel(P, upper, 0.036, hint, nu=16)
    core = panel(P, outline_rows(0.300, 0.620, pwl([(0, 0.060)]), pwl([(0, 0.440)]), n=6), 0.030, hint, nu=10, lift=-0.022)
    # sidepod intake low on the pec: dark throat with vanes
    rows3 = [(0.338,0.246,0.323),(0.362,0.258,0.415),(0.415,0.279,0.439)]
    vent = panel(P, rows3, 0.010, hint, nu=8, lift=0.004)
    vanes = []
    for k in range(4):
        x0 = 0.250 + k * 0.042
        rows4 = outline_rows(0.365, 0.410, pwl([(0, x0 + 0.028)]), pwl([(0, x0 + 0.037)]), n=3)
        vanes.append(panel(P, rows4, 0.014, hint, nu=2, lift=0.010))
    bolts = []
    for x, z in ((0.080, 0.690), (0.400, 0.600), (0.090, 0.200), (0.420, 0.420)):
        f = chest_front(x, z)
        bolts += [(m, 'gold') for m in rkit.bolt_ring((x, f + 0.001, z), (0, -1, 0), 0.0001, 1, 0.008, 0.006)]
    return [(base, 'paint'), (base_u, 'paint'), (core, 'graphite'),
            (vent, 'graphite')] + [(m, 'darkSteel') for m in vanes] + bolts


def yoke_plate():
    """Upper-chest armour from the neck to the shoulder, tilted back; white leading edge."""
    depth = lambda x, z: 0.170 - 0.55 * (z - 0.66) - 0.35 * (x - 0.30) ** 2
    P, hint = sheet(depth)
    rows = outline_rows(0.660, 0.800, pwl([(0, 0.110), (1, 0.170)]), pwl([(0, 0.560), (1, 0.470)]), n=6)
    body = panel(P, rows, 0.030, hint, nu=12, lift=0.0)
    rows2 = outline_rows(0.662, 0.690, pwl([(0, 0.112)]), pwl([(0, 0.556)]), n=2)
    edge = panel(P, rows2, 0.012, hint, nu=12, lift=0.014)
    return [(body, 'paint'), (edge, 'paintWhite')]


def keel():
    """Nose-cone keel down the sternum: a pointed lofted ridge, white stripe, Ferrari shield."""
    rings = []
    zs = [0.760, 0.680, 0.580, 0.470, 0.360, 0.260, 0.180, 0.130]
    for i, z in enumerate(zs):
        t = i / (len(zs) - 1)
        w = lerp(0.092, 0.012, t ** 0.9)
        f0 = chest_front(0.0, z) - 0.020
        h = lerp(0.095, 0.030, t)
        rings.append([(0.0, f0 + h, z), (w * 0.62, f0 + h * 0.82, z), (w, f0 + h * 0.30, z), (w * 0.80, f0 - 0.02, z),
                      (-w * 0.80, f0 - 0.02, z), (-w, f0 + h * 0.30, z), (-w * 0.62, f0 + h * 0.82, z)])
    body = loft_rings(rings, True, True)
    def front_f(x, z):
        # Interpolate the actual loft stations, rather than a second, slightly
        # different approximation that can cut through the keel's face.
        for a,b in zip(rings,rings[1:]):
            if b[0][2] <= z <= a[0][2]:
                t = (a[0][2]-z)/(a[0][2]-b[0][2])
                row = [tuple(lerp(aa[c],bb[c],t) for c in range(3)) for aa,bb in zip(a,b)]
                return lerp(row[0][1],row[1][1],clamp01(abs(x)/row[1][0]))
        return rings[0][0][1]
    stripe = [(-0.014, 0.200), (0.014, 0.200), (0.028, 0.620), (-0.028, 0.620)]
    # Use a station-matched narrow stripe, so it follows the keel with no
    # long polygon chord cutting across the underlying curved profile.
    stripe_rings = []
    for z in (0.200,0.260,0.360,0.470,0.580,0.620):
        w = lerp(.012,.024,(z-.2)/.42)
        stripe_rings.append([(x,front_f(x,z)+df,z) for x,df in
                             ((-w,.001),(0,.001),(w,.001),(w,.004),(0,.004),(-w,.004))])
    white = loft_rings(stripe_rings,True,True)
    from .robot_head import ferrari_badge
    badge = Part('chest.badge')
    low, high = .627, .723
    slope = (front_f(0,high)-front_f(0,low))/(high-low)
    intercept = max(front_f(0,z)-slope*(z-.675) for z in (low,.64,.66,.68,.70,high))+.001
    def badge_point(x,z,lift=0):
        xx,zz = 2.4*x, .675 + 2.4*(z-.315)
        return (xx,intercept+slope*(zz-.675)+lift,zz)
    # A wedge-backed flat mounting face bridges the keel ridge. The back
    # follows the host, while the heraldic horse remains completely planar.
    outline = [(-.015,.335),(.015,.335),(.014,.310),(0,.295),(-.014,.310)]
    back = [(2.4*x,front_f(2.4*x,.675+2.4*(z-.315))-.001,.675+2.4*(z-.315)) for x,z in outline]
    front = [badge_point(x,z,.001) for x,z in outline]
    backing = loft_rings([back,front],True,True)
    ferrari_badge(badge,badge_point)
    # The badge builder has per-face materials; split by slot without changing
    # its authored geometry so the normal armor builder can consume it.
    items = []
    for idx,slot in enumerate(badge.b.slots):
        faces = [f for f,s in zip(badge.b.faces,badge.b.fslot) if s==idx]
        ids = sorted({i for f in faces for i in f})
        remap = {old:new for new,old in enumerate(ids)}
        items.append((([badge.b.verts[i] for i in ids],[[remap[i] for i in f] for f in faces]),slot))
    return [(body, 'paint'), (white, 'paintWhite'), (backing, 'blackChrome')] + items


def collar():
    """Raised collar fin beside the neck, flaring up and out."""
    out = [(0.120, 0.700), (0.260, 0.720), (0.330, 0.800), (0.240, 0.960), (0.160, 0.880)]
    body = plate(out, 0.030, warp=lambda u, v, w: (u, 0.020 + w + 0.30 * (v - 0.70) - 0.4 * (u - 0.2) ** 2, v))
    return [(body, 'paint')]


def collar_livery(o):
    """Split faces for the white edge: one watertight shell, no overlay faces."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    side = -1 if o.name.endswith('.R') else 1
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                          dist=1e-7, plane_co=(side*0.758,0,0),
                          plane_no=(side,0,0.5625), clear_inner=False, clear_outer=False)
    white = kit.mats.get('paintWhite')
    o.data.materials.append(white)
    idx = len(o.data.materials)-1
    for f in bm.faces:
        p = f.calc_center_median()
        if side*p.x + 0.5625*p.z > 0.758:
            f.material_index = idx
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


def ribs():
    """Flank plates under the pecs: stacked carbon louvres wrapping the ribcage."""
    out = []
    for k in range(3):
        z = 0.080 + k * 0.060
        P, hint = wrap(lambda u, v: 0.300 - 0.02 * k, fc=-0.010)
        rows = outline_rows(z, z + 0.040, pwl([(0, 0.70)]), pwl([(0, 1.75)]), n=2)
        out.append((panel(P, rows, 0.016, hint, nu=8), 'carbon'))
    return out


# ------------------------------------------------------------------ waist / pelvis
def abs_plate():
    """Spine bone: three stacked chevron plates between the ram pairs (the abs)."""
    out = []
    for k, (z0, z1, w) in enumerate(((0.150, 0.215, 0.095), (0.085, 0.140, 0.085), (0.020, 0.075, 0.070))):
        poly = [(-w, z1), (w, z1), (w * 0.8, z0 + 0.010), (0.0, z0 - 0.012), (-w * 0.8, z0 + 0.010)]
        out.append((plate(poly, 0.026, warp=lambda u, v, w: (u, 0.160 + w - 1.6 * u * u + 0.10 * (v - 0.10), v)), 'paint' if k != 1 else 'paintWhite'))
    return out


def hip_skirt():
    """Short outboard hip fender; front and lower edge clear the thigh swing."""
    P, hint = wrap(lambda u, v: 0.222 + 0.06 * (0.12-v), xc=rig.HIP_X - 0.02, fc=-0.012)
    rows = outline_rows(-0.060, 0.130, pwl([(0, 0.85), (1, 0.48)]), pwl([(0, 1.65), (0.6, 1.72), (1, 1.50)]), n=8)
    trim = outline_rows(-0.060, -0.039, pwl([(0, 0.85), (1,0.81)]), pwl([(0, 1.65)]), n=2)
    out = [(panel(P, rows, 0.028, hint, nu=10), 'paint'), (panel(P, trim, 0.012, hint, nu=10, lift=0.012), 'paintWhite')]
    for u, v in ((0.72, 0.085), (1.35, 0.085), (1.0, -0.014), (1.5, -0.014)):
        x, f, z = P(u, v)
        out += [(m, 'gold') for m in rkit.bolt_ring((x + 0.001 * math.sin(u), f + 0.001 * math.cos(u), z), (math.sin(u), -math.cos(u), 0), 0.0001, 1, 0.008, 0.006)]
    return out


def codpiece():
    out = [(-0.110, 0.140), (0.110, 0.140), (0.090, -0.030), (0.0, -0.130), (-0.090, -0.030)]
    body = plate(out, 0.040, warp=lambda u, v, w: (u, 0.190 + w - 1.4 * u * u + 0.12 * v, v))
    chev = [(-0.070, 0.080), (0.0, 0.020), (0.070, 0.080), (0.070, 0.110), (0.0, 0.050), (-0.070, 0.110)]
    white = plate(chev, 0.010, warp=lambda u, v, w: (u, 0.212 + w - 1.4 * u * u + 0.12 * v, v))
    return [(body, 'paint'), (white, 'paintWhite')]


# ------------------------------------------------------------------ arms
def blade_shell(secfn, top, bottom, width, channel=True):
    """Two tapered armor blades over a carbon channel, conforming to the limb.

    Surface depth follows the existing section, keeping the stow envelope
    within 9 mm of the original shell. The blades are part of the same mesh.
    """
    def front(x, z):
        sec = secfn(z)
        # Front centre to the two shoulder facets of the ten-point section.
        points = sorted((sec[8], sec[9], sec[0], sec[1], sec[2]))
        for a, b in zip(points, points[1:]):
            if x <= b[0]:
                return lerp(a[1], b[1], clamp01((x-a[0]) / max(1e-6,b[0]-a[0])))
        return points[-1][1]
    P, hint = sheet(front)
    span = top-bottom
    channel_rows = [(bottom+0.02,-0.018,0.018),(top-0.04,-0.030,0.030),(top,-0.014,0.014)]
    out = [(panel(P,channel_rows,0.008,hint,nu=4,lift=0.004),'carbon')] if channel else []
    for sign in (-1,1):
        rows = [(bottom,0.018,0.025),(bottom+span*0.28,0.024,width*0.82),
                (top-span*0.22,0.035,width),(top,0.017,width*0.64)]
        if sign < 0:
            rows = [(z,-b,-a) for z,a,b in rows]
        out.append((panel(P,rows,0.015,hint,nu=5,lift=0.009),'paint'))
    return out


def pauldron():
    """Clav bone: a sculpted shoulder shell -- an arch section with thickness lofted
    out over the ball, a ridge stripe, louvres in the outboard face."""
    L = rig.SHOULDER_X - rig.CLAV_X
    arch = [(0.270, -0.170), (0.300, 0.040), (0.200, 0.220), (0.000, 0.310), (-0.200, 0.250), (-0.300, 0.070), (-0.280, -0.170)]

    def ring(x, k, dz):
        outer = [(x, f * k, z * k + dz) for f, z in arch]
        inner = [(x, f * k * 0.84, (z + 0.03) * k * 0.84 + dz - 0.03) for f, z in reversed(arch)]
        return outer + inner
    stations = [(L - 0.160, 0.74, 0.00), (L - 0.075, 0.86, 0.01), (L + 0.075, 0.92, 0.02), (L + 0.215, 0.89, 0.03), (L + 0.270, 0.79, 0.02)]
    shell = loft_rings([ring(x, k, dz) for x, k, dz in stations], True, True)
    ridge = [(0.100, 0.270), (0.000, 0.318), (-0.100, 0.284), (-0.100, 0.300), (0.000, 0.334), (0.100, 0.286)]
    band = loft_rings([[(x, f * k, z * k + dz) for f, z in ridge] for x, k, dz in stations[1:4]], True, True)
    # end caps closing the arch: the outboard one carries the louvres, the inboard one is dark
    xo, ko, dzo = stations[-1]
    xi, ki, dzi = stations[0]
    cap_o = rkit.plate_x([(f * ko * 0.97, z * ko * 0.97 + dzo) for f, z in arch], xo - 0.030, xo - 0.004, 0.006)
    cap_i = rkit.plate_x([(f * ki * 0.97, z * ki * 0.97 + dzi) for f, z in arch], xi + 0.004, xi + 0.026, 0.004)
    louv = []
    for j in range(4):
        z = -0.090 + j * 0.052
        louv.append(rkit.plate_x([(-0.140, z), (0.140, z), (0.140, z + 0.022), (-0.140, z + 0.022)], xo - 0.008, xo + 0.010, 0.003))
    # front trim lip and a seam band across the shell's middle, fasteners on the outer face
    lipr = [(0.300, -0.172), (0.318, -0.040), (0.304, -0.030), (0.284, -0.160)]
    lip = loft_rings([[(x, f * k, z * k + dz) for f, z in lipr] for x, k, dz in stations], True, True)
    seam = loft_rings([ring(x, k * 1.012, dz) for x, k, dz in ((L + 0.070, 0.93, 0.02), (L + 0.090, 0.93, 0.02))], True, True)
    bolts = []
    for f, z in ((0.10, 0.10), (-0.10, 0.10), (0.12, -0.08), (-0.12, -0.08)):
        bolts += [(m, 'gold') for m in rkit.bolt_ring((stations[-1][0] - 0.004, f * 1.2, z + 0.06), (1, 0, 0), 0.0001, 1, 0.009, 0.006)]
    return [(shell, 'paint'), (band, 'paintWhite'), (lip, 'carbon'), (seam, 'graphite'), (cap_o, 'paint'), (cap_i, 'graphite')] + \
        [(m, 'carbon') for m in louv] + bolts


def upper_shell():
    """Upper arm: a two-band faceted sleeve (full wrap), a raised bicep plate with bolts."""
    def secfn(z):
        t = clamp01((-z - 0.10) / 0.48)
        return hs.sec(lerp(0.200, 0.214, t), lerp(0.214, 0.222, t), 0.40, 0.30, keel=0.012, bulge_x=0.010)
    out = hs.banded([(-0.110, -0.330), (-0.330, -0.560)], secfn, slot='graphite')
    out += blade_shell(secfn, -0.130, -0.540, 0.072)
    o = (0.0, 0.118, -0.240)
    out += hs.plate_on(o, (1, 0, 0), (0, 1, 0), [(-0.070, -0.090), (0.070, -0.090), (0.060, 0.080), (-0.060, 0.080)], 0.018, 'paint')
    out += hs.bolts_on((0.0, 0.140, -0.240), (1, 0, 0), (0, 1, 0), [(-0.052, -0.074), (0.052, -0.074), (-0.046, 0.066), (0.046, 0.066)])
    out += hs.ring_band(-0.500, secfn, 0.022, 0.008, 'paintWhite')
    return out


def gauntlet():
    """Forearm: three faceted bands flaring to the wrist, an outer raised plate carrying the
    carbon fin, a slatted intake on the front, a white cuff band, bolts."""
    L = rig.FORE

    def secfn(z):
        t = clamp01((-z - 0.06) / 0.56) ** 0.8
        return hs.sec(lerp(0.222, 0.296, t), lerp(0.238, 0.300, t), 0.46, 0.26, keel=0.020, bulge_x=0.020 * t)
    out = hs.banded([(-0.060, -0.210), (-0.210, -0.470), (-0.470, -0.620)], secfn)
    out += blade_shell(secfn, -0.080, -0.530, 0.084)
    out += hs.ring_band(-0.560, secfn, 0.030, 0.008, 'paintWhite')
    # outer raised plate and the fin standing off it
    z0 = -0.340
    hw = 0.5 * lerp(0.222, 0.296, clamp01((-z0 - 0.06) / 0.56) ** 0.8) + 0.012
    out += hs.plate_on((hw, 0.0, z0), (0, 1, 0), (1, 0, 0), [(-0.080, -0.110), (0.080, -0.110), (0.064, 0.100), (-0.064, 0.100)], 0.020, 'paint')
    out += hs.bolts_on((hw + 0.020, 0.0, z0), (0, 1, 0), (1, 0, 0), [(-0.060, -0.090), (0.060, -0.090), (-0.050, 0.080), (0.050, 0.080)])
    fin = [(0.00, -0.22), (0.00, -0.56), (0.12, -0.62), (0.18, -0.48), (0.10, -0.28)]
    out.append((plate(fin, 0.016, warp=lambda u, v, w: (hw + 0.020 + u, w - 0.040, v)), 'carbon'))
    hd = 0.5 * lerp(0.238, 0.300, clamp01((-z0 - 0.06) / 0.56) ** 0.8)
    out += hs.vent_on((0.0, hd, z0), (1, 0, 0), (0, 1, 0), 0.110, 0.120, 5)
    return out


# ------------------------------------------------------------------ legs
def quad():
    """Thigh: a V-keeled three-band shell (full wrap), outer flank plate with a vent, bolts."""
    L = rig.THIGH

    def secfn(z):
        t = clamp01((-z - 0.08) / (L - 0.20))
        w = lerp(0.300, 0.250, t) + 0.030 * math.sin(math.pi * clamp01(t * 1.2))
        d = lerp(0.320, 0.270, t) + 0.030 * math.sin(math.pi * clamp01(t * 1.2))
        return hs.sec(w, d, 0.50, 0.30, keel=0.040, bulge_x=0.015)
    out = hs.banded([(-0.080, -0.360), (-0.360, -0.640), (-0.640, -0.760)], secfn)
    out += blade_shell(secfn, -0.100, -0.660, 0.092, channel=False)
    z0 = -0.360
    w0 = secfn(z0)
    hw = max(x for x, f in w0) + 0.010
    out += hs.plate_on((hw, 0.0, z0), (0, 1, 0), (1, 0, 0), [(-0.110, -0.200), (0.110, -0.200), (0.090, 0.200), (-0.090, 0.200)], 0.022, 'paint')
    out += hs.vent_on((hw + 0.022, 0.0, z0 - 0.080), (0, 1, 0), (1, 0, 0), 0.120, 0.080, 4)
    out += hs.bolts_on((hw + 0.022, 0.0, z0), (0, 1, 0), (1, 0, 0), [(-0.080, 0.170), (0.080, 0.170), (-0.090, -0.180), (0.090, -0.180)])
    out += hs.ring_band(-0.200, secfn, 0.024, 0.008, 'paintWhite')
    return out


def kneecap():
    """Shin bone at the knee joint: a pointed cap riding in front of the joint."""
    out = [(-0.090, 0.090), (0.090, 0.090), (0.105, -0.050), (0.0, -0.190), (-0.105, -0.050)]
    body = plate(out, 0.050, warp=lambda u, v, w: (u, 0.170 + w - 1.8 * u * u + 0.10 * (v + 0.05), v))
    ridge = [(-0.018, 0.080), (0.018, 0.080), (0.010, -0.170), (-0.010, -0.170)]
    white = plate(ridge, 0.012, warp=lambda u, v, w: (u, 0.198 + w - 1.8 * u * u + 0.10 * (v + 0.05), v))
    return [(body, 'paint'), (white, 'paintWhite')]


CALF_HUB = (0.0, -0.020, -0.400)       # (x set from the shell) wheel hub on the calf's outer flank


def calf_sec(z):
    L = rig.SHIN
    t = clamp01((-z - 0.10) / (L - 0.24))
    bump = 0.050 * math.sin(math.pi * clamp01(t * 1.5))
    return hs.sec(lerp(0.270, 0.230, t) + bump, lerp(0.290, 0.250, t) + bump, 0.46, 0.34, keel=0.034, bulge_x=0.020)


def calf_hub_x():
    return max(x for x, f in calf_sec(CALF_HUB[2])) + 0.010


def calf():
    """Shin: heavy three-band calf, a shin plate, carbon fins at the back, and the wheel hub
    (centre-lock spindle) on the outer flank that the front wheel docks on."""
    out = hs.banded([(-0.120, -0.360), (-0.360, -0.620), (-0.620, -0.760)], calf_sec)
    out += hs.ring_band(-0.690, calf_sec, 0.028, 0.008, 'paintWhite')
    hd = max(f for x, f in calf_sec(-0.300))
    out += hs.plate_on((0.0, hd - 0.02, -0.300), (1, 0, 0), (0, 1, 0), [(-0.070, -0.140), (0.070, -0.140), (0.050, 0.120), (-0.050, 0.120)], 0.020, 'paint')
    out += hs.bolts_on((0.0, hd, -0.300), (1, 0, 0), (0, 1, 0), [(-0.050, -0.120), (0.050, -0.120)])
    for k, (z0, z1) in enumerate(((-0.200, -0.500), (-0.360, -0.640))):
        fin = [(0.0, z0), (0.0, z1), (0.090 - 0.02 * k, z1 + 0.05), (0.120 - 0.02 * k, z0 - 0.04)]
        out.append((plate(fin, 0.014, warp=lambda u, v, w, k=k: (0.080 + 0.040 * k + w, -0.130 - u, v)), 'carbon'))
    # wheel hub: mounting disc, spindle and the gold centre-lock nut
    hx = calf_hub_x()
    c = (hx + 0.012, CALF_HUB[1], CALF_HUB[2])
    out += mechkit.gear_disc(c, 'x', 0.090, 0.024, teeth=0, bolts=6)
    return out


def calf_spindle():
    """Centre-lock spindle telescopes into its fixed calf housing in car mode."""
    c = (calf_hub_x()+0.020,CALF_HUB[1],CALF_HUB[2])
    return [(lathe([(0,0),(.034,0),(.034,.110),(.026,.118),(0,.118)],32,'x',center=c),'darkSteel')]


# ------------------------------------------------------------------ feet
SOLE_Z = -rig.ANKLE_Z            # ground plane in the foot frame
SOLE_T = 0.045
SOLE_F = (-0.200, 0.780)         # heel .. toe of the platform (the wing foot lies on it)
FLAP_X = (0.085, 0.235)


def _platform(x0, x1, f0, f1, trim_outer=False):
    """A flat sole slab (graphite) with rubber tread pads under it; optional red edge trim."""
    out = [(rkit.plate_z([(x0, f0), (x1, f0), (x1, f1), (x0, f1)], SOLE_Z, SOLE_Z + SOLE_T, 0.006), 'graphite')]
    n = 6
    for k in range(n):
        a = f0 + (f1 - f0) * (k + 0.15) / n
        b = f0 + (f1 - f0) * (k + 0.85) / n
        out.append((rkit.plate_z([(x0 + 0.012, a), (x1 - 0.012, a), (x1 - 0.012, b), (x0 + 0.012, b)], SOLE_Z - 0.006, SOLE_Z + 0.004, 0.002, 1), 'rubber'))
    if trim_outer:
        out.append((rkit.plate_x([(f0 + 0.02, SOLE_Z + 0.008), (f1 - 0.02, SOLE_Z + 0.008), (f1 - 0.03, SOLE_Z + SOLE_T - 0.006),
                                  (f0 + 0.03, SOLE_Z + SOLE_T - 0.006)], x1 - 0.004, x1 + 0.006, 0.002), 'paint'))
    return out


def sole():
    return _platform(-FLAP_X[0], FLAP_X[0], *SOLE_F)


def flap_out():
    return _platform(FLAP_X[0] + 0.004, FLAP_X[1], SOLE_F[0] + 0.02, SOLE_F[1] - 0.04, trim_outer=True)


def flap_in():
    return [(kit.mirror_x(m), sl) for m, sl in _platform(FLAP_X[0] + 0.004, FLAP_X[1], SOLE_F[0] + 0.02, SOLE_F[1] - 0.04, trim_outer=True)]


# ------------------------------------------------------------------ build
SIDED = {
    'clav': [('pauldron', pauldron)],
    'upperarm': [('bicep', upper_shell)],
    'forearm': [('gauntlet', gauntlet)],
    'thigh': [('quad', quad)],
    'shin': [('kneecap', kneecap), ('calf', calf), ('calfSpindle', calf_spindle)],
    'foot': [('sole', sole), ('flapOut', flap_out), ('flapIn', flap_in)],
}
CENTRE = {
    'chest': [('keel', keel)],
    'spine': [('abs', abs_plate)],
    'pelvis': [('codpiece', codpiece)],
}
PAIRED = {          # centre bones carrying L/R plates
    'chest': [('pec', pec), ('yoke', yoke_plate), ('collar', collar)],
    'pelvis': [('skirt', hip_skirt)],
}


def build(coll):
    """bone -> [armour objects] (authored bone-local, standing rest)."""
    out = {}

    def make(name, items, mir):
        p = Part(name)
        for m, s in items:
            p.add(mirror(m) if mir else m, s)
        o = p.build(coll, 0.0035, 2, 30)
        if name.startswith('A.collar.'):
            collar_livery(o)
        return o

    for bone, lst in CENTRE.items():
        for name, fn in lst:
            out.setdefault(bone, []).append(make('A.%s' % name, fn(), False))
    for bone, lst in PAIRED.items():
        for name, fn in lst:
            items = fn()
            for S, s in SIDES:
                out.setdefault(bone, []).append(make('A.%s.%s' % (name, S), items, s < 0))
    for bone, lst in SIDED.items():
        for name, fn in lst:
            items = fn()
            for S, s in SIDES:
                out.setdefault('%s.%s' % (bone, S), []).append(make('A.%s.%s' % (name, S), items, s < 0))
    return out
