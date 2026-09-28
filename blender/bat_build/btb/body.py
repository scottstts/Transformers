"""The Tumbler's armour shell: flat plates meeting at hard creases, layered.

Layout (stations s back from the front tyres):
  0.10-1.30  the beak: a slim ramped box between the fat front tyres, a toothed
             chin under its nose; sloped cheeks over the tyres' inner halves;
             the front trailing arms: faceted cones tapering from the flanks'
             fronts to the hubs on the tyres' OUTER faces
  1.30-3.40  the canopy (two-pane windshield split by a wide centre pillar,
             roof with a lamp visor, sides with the angular windows) over the
             flanks (a shelf under the windows, the crease, the widest line at
             mid height, the sills); the rear quarter is a separate plate laid
             over the flank behind the big diagonal, the brake intake cut
             through both
  3.40-4.50  the rear: the deck and roll hoop over the nozzle pod, fender pads
             over the dual tyres, the tail-lamp rails, the three stepped
             spoiler flaps per side

Every panel is its own object (named for the assembly map in choreo.py)."""
import math
from mathutils import Vector, Matrix
from . import kit, rkit, dims as D
from .kit import V
from .facet import P, panel, sided, solid, cutter
from .shape import lathe, squircle

GLASS_T = 0.010


def _hint(x=0.2, s=2.3, z=0.62):
    return V(x, D.f(s), z)


def _slab_f(pts, t):
    """Closed slab from a near-vertical polygon facing forward, thickness t rearward."""
    ring = [P(*p) for p in pts]
    k = len(ring)
    verts = ring + [p + Vector((0, t, 0)) for p in ring]
    faces = [list(range(k)), list(reversed(range(k, 2 * k)))] + [[i, k + i, k + (i + 1) % k, (i + 1) % k] for i in range(k)]
    return verts, faces


def _slab(pts, t):
    """Closed slab from a planar-ish quad/polygon of design points, thickness t along -z-ish
    (the polygon's own normal, away from `up`)."""
    ring = [P(*p) for p in pts]
    n = Vector()
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        n += a.cross(b)
    n.normalize()
    if n.z < 0:
        n = -n
    k = len(ring)
    verts = ring + [p - n * t for p in ring]
    faces = [list(range(k)), list(reversed(range(k, 2 * k)))] + [[i, k + i, k + (i + 1) % k, (i + 1) % k] for i in range(k)]
    return verts, faces


# ------------------------------------------------------------------ canopy

# the roof: a raised central diamond between two faceted slopes (the blueprint's top view)
ROOF = [(0.0, 1.88, 1.315), (0.46, 1.90, 1.295), (0.50, 2.44, 1.350), (0.46, 2.98, 1.340), (0.0, 2.98, 1.372),
        (0.0, 2.10, 1.370), (0.22, 2.44, 1.392), (0.0, 2.80, 1.405), (0.0, 2.44, 1.415)]
ROOF_F = [[0, 1, 6, 5], [1, 2, 6], [2, 3, 7, 6], [3, 4, 7], [5, 6, 8], [6, 7, 8]]

CSIDE = [(0.46, 1.90, 1.295), (0.50, 2.44, 1.350), (0.46, 2.98, 1.340), (0.66, 3.40, 1.250),
         (1.04, 3.40, 1.020), (1.05, 2.60, 0.985), (1.00, 1.92, 0.955), (0.84, 1.32, 0.935), (0.70, 1.31, 0.930)]
CSIDE_F = [[0, 1, 5, 6], [1, 2, 4, 5], [2, 3, 4], [0, 6, 7, 8]]
WIN_N = (0.56, 0.0, 0.83)
WIN = [[(0.58, 1.98, 1.262), (0.62, 2.50, 1.300), (0.95, 2.52, 1.045), (0.93, 2.04, 1.015)],
       [(0.63, 2.60, 1.298), (0.58, 2.92, 1.292), (0.96, 3.05, 1.060), (0.98, 2.62, 1.045)]]


def canopy(coll):
    out = {}
    out['roof'] = panel('roof', ROOF, ROOF_F, sym=True, coll=coll, t=0.03, angle=4.0)
    # visor: the roof's front edge overhangs the windshield, two small lamps each side
    vis = [(0.0, 1.80, 1.345), (0.47, 1.82, 1.325), (0.47, 1.93, 1.325), (0.0, 1.93, 1.345)]
    out['visor'] = panel('visor', vis, [[0, 1, 2, 3]], sym=True, coll=coll, t=0.07)
    lamps = []
    for sg in (1, -1):
        for x in (0.30, 0.38):
            # a recessed bezel ring and the lens, both standing 3-6 mm proud of the visor's front face
            front = 1.80 + 0.02 * x / 0.47                    # the visor's front face station at x
            lamps.append((rkit.cylinder((sg * x, D.f(front - 0.001), 1.300), 0.014, 0.010, 'f', 16), 'lamp'))
            lamps.append((kit.transform(lathe([(0.014, -0.004), (0.022, -0.004), (0.022, 0.006), (0.014, 0.006)], 16, 'f', closed=True),
                                        Matrix.Translation(V(sg * x, D.f(front), 1.300))), 'chassis'))
    out['visorLamps'] = solid('visorLamps', lamps, coll)
    out['roofRear'] = panel('roofRear', [(0.0, 2.98, 1.372), (0.46, 2.98, 1.340), (0.66, 3.40, 1.250), (0.0, 3.40, 1.285)],
                            [[0, 1, 2, 3]], sym=True, coll=coll, t=0.03)
    # windshield: a wide centre pillar (an inverted trapezoid), two panes, their bezels
    out['spine'] = panel('spine', [(0.0, 1.27, 0.985), (0.07, 1.30, 0.945), (0.17, 1.88, 1.300), (0.0, 1.88, 1.335)],
                         [[0, 1, 2, 3]], sym=True, coll=coll, t=0.05)
    pane = [(0.085, 1.318, 0.940), (0.690, 1.336, 0.925), (0.450, 1.868, 1.285), (0.180, 1.868, 1.290)]
    drop = lambda p: (p[0], p[1] + 0.004, p[2] - 0.014)
    out.update(sided('glassF', [drop(p) for p in pane], [[0, 1, 2, 3]], coll, slot='glass', t=GLASS_T, gap=0.0, bevel=0.0))
    fr = [(0.070, 1.302, 0.948), (0.725, 1.322, 0.932), (0.472, 1.884, 1.296), (0.165, 1.884, 1.302)]
    inner = [(0.100, 1.336, 0.940), (0.670, 1.352, 0.925), (0.438, 1.852, 1.287), (0.192, 1.852, 1.292)]
    out.update(sided('bezelF', fr + inner, [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], coll, t=0.022, gap=0.0))
    # the canopy side, split at the B-pillar: the front half (big window) becomes a bat wing
    c = CSIDE
    b1, b5 = (0.505, 2.55, 1.350), (1.05, 2.58, 0.985)
    front = [c[0], b1, b5, c[6], c[7], c[8]]
    rear = [b1, c[2], c[3], c[4], b5]
    out.update(sided('csideF', front, [[0, 1, 2, 3], [0, 3, 4, 5]], coll, t=0.028, cuts=[cutter(WIN[0], WIN_N)]))
    out.update(sided('csideR', rear, [[0, 1, 3, 4], [1, 2, 3]], coll, t=0.028, cuts=[cutter(WIN[1], WIN_N)]))
    for k, w in enumerate(WIN):
        c = sum((Vector(p) for p in w), Vector()) / 4
        inset = [tuple(Vector(p) + (c - Vector(p)) * 0.02 - Vector(WIN_N) * 0.014) for p in w]
        out.update(sided('glassS%d' % k, inset, [[0, 1, 2, 3]], coll, slot='glass', t=GLASS_T, gap=0.0, bevel=0.0))
    # a slanted pillar between the two side windows, standing proud
    pil = [(0.60, 2.50, 1.34), (0.64, 2.60, 1.34), (1.02, 2.66, 1.02), (0.99, 2.52, 1.02)]
    out.update(sided('bpillar', pil, [[0, 1, 2, 3]], coll, t=0.05, gap=0.0, hint=_hint(0.2, 2.5, 0.8)))
    return out


# ------------------------------------------------------------------ flanks

# the shelf under the windows: the canopy side's foot out to the crease, split at the
# big diagonal's station (front: the forearm blade; rear: the thigh plate)
SPLIT_S = 2.36
SHELF_F = [(0.84, 1.32, 0.935), (1.00, 1.92, 0.955), (1.03, SPLIT_S, 0.975), (1.205, SPLIT_S, 0.940), (1.19, 1.92, 0.930), (1.10, 1.32, 0.890)]
SHELF_R = [(1.03, SPLIT_S, 0.975), (1.05, 2.60, 0.985), (1.04, 3.40, 1.020), (1.22, 3.40, 1.000), (1.22, 2.60, 0.955), (1.205, SPLIT_S, 0.940)]


def shelf_z(x, s):
    """Height of the front shelf's top surface at (x, station), from its triangulated faces."""
    tris = [(0, 1, 4), (0, 4, 5), (1, 2, 3), (1, 3, 4)]
    for tri in tris:
        (xa, sa, za), (xb, sb, zb), (xc, sc, zc) = [SHELF_F[i] for i in tri]
        d = (sb - sc) * (xa - xc) + (xc - xb) * (sa - sc)
        u = ((sb - sc) * (x - xc) + (xc - xb) * (s - sc)) / d
        v = ((sc - sa) * (x - xc) + (xa - xc) * (s - sc)) / d
        if min(u, v, 1 - u - v) >= -1e-6:
            return u * za + v * zb + (1 - u - v) * zc
    raise ValueError('point off the shelf: %s' % ((x, s),))


# the flank: crease -> widest line -> sill, faceted in long bands, split at SPLIT_S
FLANK_FRONT = [(1.10, 1.32, 0.890), (1.19, 1.92, 0.930), (1.205, SPLIT_S, 0.940),
               (1.22, 1.30, 0.560), (1.35, 1.92, 0.600), (1.315, SPLIT_S, 0.612),
               (1.08, 1.32, 0.200), (1.23, 1.92, 0.160), (1.24, SPLIT_S, 0.155)]
FLANK_REAR = [(1.205, SPLIT_S, 0.940), (1.22, 2.60, 0.955), (1.22, 3.40, 1.000),
              (1.315, SPLIT_S, 0.612), (1.32, 2.60, 0.625), (1.30, 3.40, 0.660),
              (1.24, SPLIT_S, 0.155), (1.25, 2.60, 0.155), (1.22, 3.40, 0.200)]
FLANK_F = [[0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7], [6, 7, 10, 9], [7, 8, 11, 10]]
FLOOR_W = 0.42                   # the sills turn in under the body as a floor strip


def _floor(pts):
    """Append the sill's inward floor strip (three points) to a flank point list."""
    return pts + [(x - FLOOR_W, s_, z + 0.012) for x, s_, z in pts[6:9]]

# rear quarter: laid over the flank behind the big diagonal (upper rear -> lower middle)
HIP = [(1.235, 3.10, 0.990), (1.235, 3.40, 1.010), (1.33, 3.40, 0.665), (1.265, 3.40, 0.195), (1.27, 2.36, 0.150),
       (1.345, 2.80, 0.630)]
HIP_F = [[0, 1, 2, 5], [5, 2, 3, 4]]
INTAKE = [(1.4, 2.98, 0.26), (1.4, 3.34, 0.26), (1.4, 3.34, 0.72), (1.4, 3.00, 0.70)]


def flanks(coll):
    out = {}
    out.update(sided('shelfF', SHELF_F, [[0, 1, 4, 5], [1, 2, 3, 4]], coll, t=0.03, hint=_hint()))
    out.update(sided('shelfR', SHELF_R, [[0, 1, 4, 5], [1, 2, 3, 4]], coll, t=0.03, hint=_hint()))
    cut = cutter([(1.3, s, z) for _, s, z in INTAKE], (1, 0, 0), 0.3)
    # A continuous folded skin: each flank face is planar and shares its
    # crease vertices with its neighbor, so there are no intersecting scales.
    front_faces = [[0,1,4],[0,4,3],[1,2,5,4],[3,4,7],[3,7,6],
                   [4,5,8,7],[6,7,10,9],[7,8,11,10]]
    front_points = _floor(FLANK_FRONT)
    front_slots = ['armor','armor','armor','armor','armorDark',
                   'armor','armorDark','armorDark']
    out.update(sided('flankF',front_points,front_faces,coll,t=.035,
                     hint=_hint(),slots=front_slots))
    out.update(sided('flankR', _floor(FLANK_REAR), FLANK_F, coll, t=0.035, hint=_hint(), cuts=[cut]))
    out.update(sided('hip', HIP, HIP_F, coll, t=0.035, hint=_hint(), cuts=[cut]))
    # the intake: a dark box sunk behind the opening, with a slatted grille
    box = [(rkit.plate_x([(D.f(3.34), 0.25), (D.f(2.98), 0.25), (D.f(3.00), 0.71), (D.f(3.34), 0.73)], 1.02, 1.22, 0.006), 'interior')]
    for k in range(5):
        z = 0.31 + k * 0.08
        box.append((rkit.plate_x([(D.f(3.33), z), (D.f(3.00), z), (D.f(3.00), z + 0.035), (D.f(3.33), z + 0.035)], 1.16, 1.26, 0.004),
                    'armorDark'))
    out['intake.L'] = solid('intake.L', box, coll)
    out['intake.R'] = solid('intake.R', [(kit.mirror_x(m), s) for m, s in box], coll)
    # Three individually folded bronze vanes with dark slots between them.
    # The pointed ends and diagonal cuts match the film car's little gold vent.
    # The vanes are seated in the shelf's skin: each corner is sunk to the shelf surface.
    vanes = []
    for k in range(3):
        s0 = 1.45 + k * .135
        s1 = s0 + .118
        x0 = .925 + k * .023
        x1 = 1.11 + k * .019
        corners = [(x0, s0), (x0 + .025, s1), (x1, s1 - .028), (x1 - .035, s0)]
        vanes.append((_slab([(x, s_, shelf_z(x, s_) + .006) for x, s_ in corners], .012), 'bronze'))
    out['louvre.L'] = solid('louvre.L', vanes, coll)
    out['louvre.R'] = solid('louvre.R', [(kit.mirror_x(m),slot) for m,slot in vanes], coll)
    # the flank's front end: a raked face behind the cone's root (it closes the arm bay)
    ff = [(0.84, 1.32, 0.935), (1.10, 1.32, 0.890), (1.08, 1.32, 0.200), (0.86, 1.32, 0.190)]
    out.update(sided('flankFront', ff, [[0, 1, 2, 3]], coll, t=0.03, hint=_hint(0.9, 2.2, 0.6)))
    # the flank's rear end, facing the rear tyres
    fr = [(1.04, 3.40, 1.020), (1.22, 3.40, 1.000), (1.30, 3.40, 0.660), (1.22, 3.40, 0.200), (0.86, 3.42, 0.220), (0.80, 3.42, 1.080)]
    out.update(sided('flankRear', [(x, s + 0.02, z) for x, s, z in fr], [[0, 1, 2, 3, 4, 5]], coll, t=0.03, hint=_hint(0.9, 2.4, 0.6)))
    return out


# ------------------------------------------------------------------ front

BEAK = [  # s, half profile (x, z) top centre -> bottom centre: the nose box under the ramp
    (0.36, [(0.0, 0.440), (0.110, 0.432), (0.160, 0.400), (0.160, 0.260), (0.120, 0.215), (0.0, 0.205)]),
    (0.70, [(0.0, 0.600), (0.120, 0.590), (0.168, 0.550), (0.168, 0.250), (0.125, 0.210), (0.0, 0.200)]),
    (1.02, [(0.0, 0.750), (0.125, 0.740), (0.172, 0.700), (0.172, 0.250), (0.130, 0.205), (0.0, 0.195)]),
]
RAMP_HW = 0.20                   # overlaps the cheeks' inner edges: no gap either side of the ramp


def beak_top_z(s):
    return 0.462 + (s - 0.36) / (1.30 - 0.36) * (0.920 - 0.462)


def _on_ramp(pts_xs, lift, thick):
    """A thin plate lying on the ramp's top face: outline (x, s), `lift` above it."""
    b = [V(x, D.f(s_), beak_top_z(s_) + lift) for x, s_ in pts_xs]
    n = len(b)
    vb = b + [p + Vector((0, 0, thick)) for p in b]
    fb = [list(range(n)), list(range(2 * n - 1, n - 1, -1))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return vb, fb


def beak(coll):
    """The nose: a box under a ramp plate. The ramp (bow-tie inset, bat teeth) runs on back over
    the head bay to the windshield base; the box ends short of it."""
    rings = []
    for s_, half in BEAK:
        ring = [(x, s_, z) for x, z in half] + [(-x, s_, z) for x, z in reversed(half[1:-1])]
        rings.append([P(*p) for p in ring])
    box = [(kit.loft(rings, True, True), 'armorDark')]
    chin = [(0.10, 0.215), (0.10, 0.30)] + [(0.10 + 0.26 * k / 8, 0.30 + (0.035 if k % 2 else 0.0)) for k in range(1, 8)] + [(0.36, 0.30), (0.36, 0.215)]
    box.append((rkit.plate_x([(D.f(s_), z) for s_, z in chin], -0.15, 0.15, 0.004), 'armorDark'))
    out = {'beakBox': solid('beakBox', box, coll, 0.003, 25)}
    # the ramp: a chamfered plate 5 cm thick whose underside sits 1 cm into the box's top
    ramp = []
    rows = []
    for s_ in (0.34, 0.70, 1.02, 1.30):
        zt = beak_top_z(s_) + 0.03
        rows.append([V(x, D.f(s_), zt + dz) for x, dz in ((RAMP_HW, -0.02), (RAMP_HW - 0.03, 0.0), (-RAMP_HW + 0.03, 0.0), (-RAMP_HW, -0.02),
                                                          (-RAMP_HW + 0.01, -0.07), (RAMP_HW - 0.01, -0.07))])
    ramp.append((kit.loft(rows, True, True), 'armor'))
    ramp.append((_on_ramp([(-0.11, 0.62), (0.0, 0.72), (0.11, 0.62), (0.11, 1.00), (0.0, 0.90), (-0.11, 1.00)], 0.028, 0.008), 'armorDark'))
    teeth = [(-0.11, 0.40)] + [(-0.11 + 0.22 * k / 6, 0.40 + (0.05 if k % 2 else 0.0)) for k in range(1, 6)] + [(0.11, 0.40), (0.11, 0.55), (-0.11, 0.55)]
    ramp.append((_on_ramp(teeth, 0.028, 0.008), 'armorDark'))
    out['beakRamp'] = solid('beakRamp', ramp, coll, 0.003, 25)
    return out


def cheeks(coll):
    """Sloped plates over the front tyres' inner halves, from the windshield base forward."""
    pts = [(0.185, 1.30, 0.945), (0.70, 1.31, 0.930), (0.84, 1.32, 0.935), (0.80, 1.00, 0.935), (0.60, 0.68, 0.925),
           (0.20, 0.74, 0.700)]
    out = sided('cheek', pts, [[0, 1, 4, 5], [1, 2, 3, 4]], coll, t=0.035, hint=V(0.4, D.f(1.8), 0.2))
    # the grille: a louvred bulkhead behind each front tyre, under the cheek, closing the front bay
    for S, sg in (('L', 1), ('R', -1)):
        g = [(sg * 0.20, 0.96, 0.21), (sg * 0.86, 0.96, 0.23), (sg * 0.86, 0.99, 0.90), (sg * 0.20, 0.99, 0.68)]
        parts = [(_slab_f(g, 0.03), 'armorDark')]
        for k in range(6):
            z = 0.27 + k * 0.075
            xa, xb = sg * 0.24, sg * 0.80
            parts.append((rkit.plate_f([(min(xa, xb), z), (max(xa, xb), z), (max(xa, xb), z + 0.03), (min(xa, xb), z + 0.03)],
                                       D.f(0.955), D.f(0.935), 0.004), 'armor'))
        # the bay's side wall: from the grille back to the flank front, up under the cheek's outer edge
        wall = [(sg * 0.855, 0.99, 0.20), (sg * 0.855, 1.31, 0.20), (sg * 0.855, 1.31, 0.93), (sg * 0.855, 0.99, 0.905)]
        parts.append((rkit.plate_x([(D.f(s_), z) for _, s_, z in wall], min(sg * 0.84, sg * 0.87), max(sg * 0.84, sg * 0.87), 0.004), 'armorDark'))
        out['grille.' + S] = solid('grille.' + S, parts, coll)
    # Streamlined lamp nacelles seated into the sloping cheek. The rear cap
    # follows the body surface; there is no upright block mounting the lamp.
    for S, sg in (('L', 1), ('R', -1)):
        rings = []
        for st,zc,rx,rz in ((.762,.823,.052,.046),(.805,.832,.057,.051),
                            (.885,.853,.050,.040),(.965,.874,.029,.020),
                            (1.015,.890,.005,.005)):
            rings.append([P(sg*.34+rx*math.cos(a*math.tau/16),st,
                            zc+rz*math.sin(a*math.tau/16)) for a in range(16)])
        lp = [(kit.loft(rings,True,True),'armor'),
              (kit.transform(lathe([(.033,-.007),(.045,-.007),(.047,.0),
                                    (.043,.012),(.033,.012)],32,'f',closed=True),
                             Matrix.Translation(V(sg*.34,D.f(.758),.823))),'darkSteel'),
              (rkit.cylinder((sg*.34,D.f(.75),.823),.033,.006,'f',32,.001),'lamp')]
        out['headlamp.' + S] = solid('headlamp.' + S, lp, coll)
    return out


# the front trailing arm fairing (L): the flank's front section tapering to the hub mount
# on the outer face of the tyre; outer skin as a small facet mesh
CONE = [(1.10, 1.32, 0.890), (1.22, 1.30, 0.560), (1.08, 1.32, 0.290),       # 0-2 root (the flank front)
        (0.86, 1.32, 0.920), (0.88, 1.30, 0.270),                            # 3-4 root inner edge
        (1.02, 0.80, 0.700), (1.06, 0.82, 0.450), (0.98, 0.80, 0.300),       # 5-7 mid
        (0.88, 0.95, 0.760), (0.88, 0.90, 0.280),                            # 8-9 mid inner
        (0.96, 0.45, 0.545), (0.98, 0.45, 0.420), (0.94, 0.45, 0.320), (0.88, 0.45, 0.540), (0.88, 0.45, 0.320)]   # 10-14 tip
CONE_F = [[0, 1, 6, 5], [1, 2, 7, 6], [3, 0, 5, 8], [2, 4, 9, 7], [5, 6, 11, 10], [6, 7, 12, 11], [8, 5, 10, 13], [7, 9, 14, 12],
          [10, 11, 12, 14, 13], [3, 8, 9, 4]]


def arms(coll):
    out = {}
    for S, sg in (('L', 1), ('R', -1)):
        pts = [(sg * x, s, z) for x, s, z in CONE]
        v = [P(*p) for p in pts]
        faces = [list(f) for f in CONE_F]
        # close the root face against the flank (hidden)
        faces.append([0, 3, 4, 2, 1])
        o = solid('armCone.' + S, [((v, faces), 'armor')], coll, 0.003, 25)
        out[o.name] = o
        # hub carrier on the tyre's outer face, a copper coil-over from the cone to the flank
        from .chassis import coilover
        p = [(rkit.cylinder((sg * 0.905, D.FA_F, D.FR_R), 0.11, 0.06, 'x', 28), 'darkSteel'),
             (rkit.cylinder((sg * 0.87, D.FA_F, D.FR_R), 0.07, 0.04, 'x', 24), 'steel')]
        p += coilover((sg * 0.96, D.f(0.72), 0.36), (sg * 0.93, D.f(1.20), 0.80), 0.055, 7)
        o = solid('hub.' + S, p, coll)
        out[o.name] = o
    return out


# ------------------------------------------------------------------ rear

def deck(coll):
    out = {}
    pts = [(0.0, 3.40, 1.285), (0.66, 3.40, 1.250), (0.62, 3.72, 1.180), (0.0, 3.72, 1.200)]
    out['deck'] = panel('deck', pts, [[0, 1, 2, 3]], sym=True, coll=coll, t=0.03)
    # roll hoop over the pod (seen from behind)
    # the legs stand on the pod's top, inboard of its rounded shoulders, each seated in a
    # mounting boss sunk into the skin (the top runs z 1.11-1.19 under the boss)
    hoop = [V(-0.15, D.f(4.02), 1.10), V(-0.15, D.f(4.02), 1.34), V(-0.10, D.f(4.02), 1.41), V(0.10, D.f(4.02), 1.41),
            V(0.15, D.f(4.02), 1.34), V(0.15, D.f(4.02), 1.10)]
    mesh = [(kit.tube(hoop, 0.035, 14), 'chassis')]
    for x in (-0.15, 0.15):
        mesh.append((rkit.cylinder((x, D.f(4.02), 1.145), 0.058, 0.13, 'z', 20), 'darkSteel'))
    out['hoop'] = solid('hoop', mesh, coll)
    return out


def pod(coll):
    """The nozzle pod: an egg-section capsule between the inner tyres, necking at its tail into a
    round afterburner nozzle: a thick-walled bronze shroud, overlapping titanium petals round its
    lip, a dark liner converging inside onto a recessed turbine face. The capsule's neck runs 1 cm
    inside the shroud (a declared penetration, no shared faces)."""
    parts = []
    rings = []
    zc = D.NOZZLE_Z
    for s_, hw, z0, z1 in ((3.42, 0.26, 0.42, 1.14), (3.80, 0.285, 0.38, 1.18), (4.10, 0.285, 0.38, 1.16), (4.24, 0.27, 0.44, 1.10)):
        zm, hh = (z0 + z1) / 2, (z1 - z0) / 2
        rings.append([V(x * (1.0 - 0.10 * max(0.0, -y / hh)), D.f(s_), zm + y) for x, y in squircle(hw, hh, 3.2, 36)])
    # the neck: the squircle section morphs into the circle the shroud sits on
    n = 36
    rings.append([V(0.228 * math.cos(2 * math.pi * k / n), D.f(4.33), zc + 0.228 * math.sin(2 * math.pi * k / n)) for k in range(n)])
    parts.append((kit.loft(rings, True, True), 'armor'))
    M = Matrix.Translation(V(0, D.f(4.30), zc))
    # shroud: outer r 0.245 -> 0.230 at the lip, inner r 0.200; h is rearward distance from s 4.30
    shroud = [(0.200, 0.0), (0.245, 0.0), (0.250, 0.05), (0.238, 0.17), (0.226, 0.215), (0.205, 0.22), (0.200, 0.20)]
    parts.append((kit.transform(lathe([(r, -h) for r, h in shroud], 48, 'f', closed=True), M), 'bronze'))
    # petals: alternating inner and outer leaves round the lip, 3 mm apart radially
    for k in range(16):
        a0 = 2 * math.pi * (k + 0.5) / 16
        r0 = 0.188 if k % 2 else 0.182
        prof = [(r0, 0.12), (r0 + 0.008, 0.12), (r0 + 0.004, 0.225), (r0 - 0.004, 0.225)]
        parts.append((kit.transform(lathe([(r, -h) for r, h in prof], 3, 'f', arc=2 * math.pi / 16 * 1.08, phase=a0 - math.pi / 16 * 1.08,
                                          closed=True), M), 'nozzle'))
    # liner: converges inside onto the turbine face
    liner = [(0.176, 0.20), (0.182, 0.20), (0.182, 0.02), (0.150, -0.10), (0.144, -0.10), (0.170, 0.02)]
    parts.append((kit.transform(lathe([(r, -h) for r, h in liner], 40, 'f', closed=True), M), 'armorDark'))
    # turbine face: a hub and swept blades, well inside the liner
    Mt = Matrix.Translation(V(0, D.f(4.21), zc))
    parts.append((kit.transform(lathe([(0.0, 0.03), (0.045, 0.03), (0.055, 0.0), (0.045, -0.03), (0.0, -0.03)], 24, 'f', closed=True), Mt),
                  'darkSteel'))
    for k in range(14):
        a0 = 2 * math.pi * k / 14
        c, sn = math.cos(a0), math.sin(a0)
        r0, r1 = 0.045, 0.128
        blade = [V(c * r0, D.f(4.225), zc + sn * r0), V(c * r1, D.f(4.215), zc + sn * r1),
                 V(c * r1 - sn * 0.024, D.f(4.195), zc + sn * r1 + c * 0.024), V(c * r0 - sn * 0.014, D.f(4.205), zc + sn * r0 + c * 0.014)]
        vb = blade + [p + Vector((c * 0, 0.006, 0)) for p in blade]
        parts.append(((vb, [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]), 'steel'))
    # bolted bands round the capsule, proud of its skin
    for s_ in (3.62, 3.98):
        rr = [V(x * 1.035 * (1.0 - 0.10 * max(0.0, -y / 0.40)), D.f(s_), 0.78 + y * 1.035) for x, y in squircle(0.285, 0.40, 3.2, 36)]
        r2 = [p + Vector((0, -0.05, 0)) for p in rr]
        parts.append((kit.loft([rr, r2], True, True), 'armorDark'))
    return {'pod': solid('pod', parts, coll, 0.003, 30)}


def fenders(coll):
    out = {}
    xm = (D.RR_XI + D.RR_XO) / 2
    topO = [(xm, 3.44, 1.130), (1.33, 3.44, 1.100), (1.34, 3.90, 1.170), (1.30, 4.34, 1.120), (xm, 4.34, 1.135), (xm, 3.90, 1.190)]
    topI = [(0.30, 3.44, 1.160), (xm, 3.44, 1.130), (xm, 3.90, 1.190), (xm, 4.34, 1.135), (0.30, 4.34, 1.150), (0.30, 3.90, 1.205)]
    out.update(sided('fenderO', topO, [[0, 1, 2, 5], [5, 2, 3, 4]], coll, t=0.03, hint=V(0.8, D.f(3.9), 0.2)))
    out.update(sided('fenderI', topI, [[0, 1, 2, 5], [5, 2, 3, 4]], coll, t=0.03, hint=V(0.5, D.f(3.9), 0.2)))
    sk = [(1.22, 3.40, 1.000), (1.33, 3.44, 1.100), (1.345, 3.64, 1.090), (1.34, 3.56, 0.820), (1.30, 3.42, 0.660)]
    out.update(sided('fenderSkirt', sk, [[0, 1, 2, 3, 4]], coll, t=0.03, hint=V(0.9, D.f(3.8), 0.9)))
    for S, sg in (('L', 1), ('R', -1)):
        parts = [(kit.bar(V(sg * 0.31, D.f(4.36), 1.12), V(sg * (xm - 0.012), D.f(4.36), 1.105), kit.chamfer_rect(0.10, 0.09, 0.02)), 'chassis')]
        for k in range(5):
            x = sg * (0.36 + k * 0.066)
            parts.append((rkit.cylinder((x, D.f(4.41), 1.11), 0.026, 0.02, 'f', 18), 'lightRed'))
            parts.append((rkit.cylinder((x, D.f(4.40), 1.11), 0.032, 0.012, 'f', 18), 'chassis'))
        out['lampRailI.' + S] = solid('lampRailI.' + S, parts, coll)
        parts = [(kit.bar(V(sg * (xm + 0.012), D.f(4.36), 1.105), V(sg * 1.30, D.f(4.36), 1.09), kit.chamfer_rect(0.10, 0.09, 0.02)), 'chassis'),
                 (rkit.plate_f([(sg * 1.16, 1.075), (sg * 1.26, 1.07), (sg * 1.26, 1.10), (sg * 1.16, 1.105)], D.f(4.415), D.f(4.40), 0.004), 'amber')]
        out['lampRailO.' + S] = solid('lampRailO.' + S, parts, coll)
    return out


def flaps(coll):
    """Three stepped spoiler flaps per side on posts, raked by rams (the top one biggest)."""
    out = {}
    specs = [(0.34, 1.18, 3.46, 3.76, 1.300, 1.345, 0.024), (0.33, 1.22, 3.72, 4.06, 1.415, 1.465, 0.026),
             (0.32, 1.26, 3.98, 4.44, 1.525, 1.585, 0.028)]
    for S, sg in (('L', 1), ('R', -1)):
        parts = []
        for x0, x1, s0, s1, zf, zr, t in specs:
            pts = [(sg * x0, s0, zf), (sg * x1, s0, zf - 0.03), (sg * x1, s1, zr - 0.03), (sg * x0, s1, zr)]
            parts.append((_slab(pts, t), 'armor'))
        # end plates on the top flap
        for x in (0.32, 1.26):
            parts.append((rkit.plate_x([(D.f(4.00), 1.49), (D.f(4.44), 1.55), (D.f(4.44), 1.62), (D.f(4.00), 1.56)],
                                       sg * x - 0.01, sg * x + 0.01, 0.003), 'armorDark'))
        # base beam: along the fender top from the pod's flank out under the posts
        for s_, zb in ((3.63, 1.272), (3.91, 1.230), (4.23, 1.170)):
            parts.append((kit.bar(V(sg * 0.27, D.f(s_), zb), V(sg * 1.10, D.f(s_), zb), kit.chamfer_rect(0.05, 0.05, 0.01)), 'chassis'))
        parts.append((kit.bar(V(sg * 0.30, D.f(3.60), 1.215), V(sg * 0.30, D.f(4.26), 1.165), kit.chamfer_rect(0.05, 0.05, 0.01)), 'chassis'))
        # posts from the base beams
        for x in (0.48, 1.06):
            for s, z0, z1 in ((3.62, 1.27, 1.30), (3.90, 1.21, 1.41), (4.22, 1.17, 1.52)):
                parts.append((kit.bar(V(sg * x, D.f(s), z0), V(sg * x, D.f(s + 0.02), z1), kit.chamfer_rect(0.035, 0.05, 0.008)), 'chassis'))
        # rams raking the top flap
        for x in (0.70, 0.84):
            a, b = V(sg * x, D.f(3.80), 1.20), V(sg * x, D.f(4.10), 1.50)
            d = (b - a)
            parts.append((kit.tube([a, a + d * 0.55], 0.017, 12), 'copper'))
            parts.append((kit.tube([a + d * 0.5, b], 0.009, 10), 'chrome'))
        out['flaps.' + S] = solid('flaps.' + S, parts, coll)
    return out


def belly(coll):
    pts = [(0.0, 1.20, 0.195), (0.20, 1.20, 0.195), (0.90, 1.32, 0.290), (1.20, 1.92, 0.215), (1.20, 3.36, 0.250),
           (0.30, 3.44, 0.360), (0.0, 3.44, 0.360), (0.0, 2.40, 0.180)]
    pts = [(x + 0.004, s_, z) for x, s_, z in pts]            # a seam down the centreline: the halves part
    return sided('belly', pts, [[0, 1, 2, 7], [2, 3, 4, 7], [4, 5, 6, 7]], coll, slot='armorDark', t=0.03, hint=V(0.3, D.f(2.3), 2.0))


def build(coll):
    out = {}
    for fn in (canopy, flanks, beak, cheeks, arms, deck, pod, fenders, flaps):
        out.update(fn(coll))
    from .car_detail import detail
    detail(out)
    return out
