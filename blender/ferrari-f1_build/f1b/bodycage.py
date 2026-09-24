"""The SF-25 bodywork as ONE subdivision-surface control cage.

Nose, survival cell, sidepods, airbox and engine cover are a single closed,
continuous quad mesh, modelled the way a car body is surfaced: every station
carries the same 14-point half section, so each index is an edge loop that runs
the length of the car along a design line:

    0 top centreline      5 pod shelf            10 undercut (deepest)
    1 deck                6 shelf crease          11 floor join
    2 cockpit rim line    7 pod outer top edge    12 bottom outboard
    3 chassis shoulder    8 pod outer face        13 bottom centreline
    4 gully (pod meets    9 undercut start
      the chassis)

Where there is no sidepod (nose, survival cell, gearbox) loops 4-11 lie on the
chassis flank, so the pod grows out of the same surface instead of being a
second volume. The pod front and the airbox front are single face strips whose
outer rings are creased, so the inlet lip and the intake rim stay crisp; the
mouths themselves are cut into the finished surface (body.py). Creases also
hold the shelf edge and the floor join; a clipped Mirror and Catmull-Clark
subdivision finish the surface.

Section values are read from the references (plan photo camera-match for
widths, blueprint and photos for heights) and from the robot packaging
envelope; `refs.overlay*` checks them.
"""
import bmesh
import bpy
from mathutils import Vector
from . import kit
from .kit import V
from .shape import curve1, lerp

N = 14            # points per half section

# ------------------------------------------------------------------ stations
# top: (zc, deck half width, rim z, shoulder x, shoulder z)
# side (no pod): (max-width x, max-width z) -> points 4..11 fall on the flank
# pod: explicit points 4..11
# bottom: (outboard x, z) and centreline z


def flank(sh, mx, bot, n=8):
    """Points 4..11 on a chassis flank: a quadratic from the shoulder through the
    max-width line to the bottom outboard corner (no sidepod at this station)."""
    (x0, z0), (x1, z1), (x2, z2) = sh, mx, bot
    out = []
    for k in range(1, n + 1):
        t = k / (n + 1)
        a, b, c = (1 - t) ** 2, 2 * t * (1 - t), t * t
        # control point placed so the curve passes through the max-width point at t = 0.5
        cx, cz = 2 * x1 - 0.5 * (x0 + x2), 2 * z1 - 0.5 * (z0 + z2)
        out.append((a * x0 + b * cx + c * x2, a * z0 + b * cz + c * z2))
    return out


def section(top, side=None, pod=None, bot=None):
    zc, wT, zr, xs, zs = top
    (xb, zb), zb0 = bot
    pts = [(0.0, zc), (wT * 0.55, zc - 0.004 - 0.02 * (zc - zr)), (wT, zr), (xs, zs)]
    pts += pod if pod is not None else flank((xs, zs), side, (xb, zb))
    pts += [(xb, zb), (0.0, zb0)]
    return pts


STATIONS = [
    # ------------------------------------------------------------ nose
    (3.030, section((0.296, 0.070, 0.290, 0.112, 0.262), (0.122, 0.236), None, ((0.095, 0.206), 0.203))),
    (2.850, section((0.335, 0.090, 0.328, 0.140, 0.300), (0.150, 0.262), None, ((0.115, 0.203), 0.201))),
    (2.600, section((0.392, 0.110, 0.384, 0.166, 0.352), (0.180, 0.292), None, ((0.140, 0.202), 0.200))),
    (2.300, section((0.458, 0.130, 0.450, 0.190, 0.410), (0.206, 0.322), None, ((0.160, 0.200), 0.198))),
    (2.000, section((0.525, 0.150, 0.515, 0.216, 0.468), (0.229, 0.350), None, ((0.176, 0.190), 0.186))),
    # ------------------------------------------------------------ survival cell
    (1.700, section((0.574, 0.172, 0.563, 0.242, 0.510), (0.259, 0.360), None, ((0.196, 0.160), 0.156))),
    (1.400, section((0.600, 0.202, 0.590, 0.272, 0.530), (0.302, 0.350), None, ((0.220, 0.135), 0.132))),
    (1.100, section((0.612, 0.236, 0.602, 0.300, 0.540), (0.332, 0.340), None, ((0.240, 0.125), 0.122))),
    (0.960, section((0.616, 0.254, 0.606, 0.309, 0.544), (0.330, 0.340), None, ((0.242, 0.122), 0.119))),
    # ------------------------------------------------------------ sidepods grow out of the flank
    (0.840, section((0.617, 0.266, 0.608, 0.318, 0.548), None,
                    [(0.336, 0.576), (0.420, 0.590), (0.520, 0.588), (0.575, 0.565), (0.586, 0.500), (0.570, 0.420), (0.470, 0.318), (0.382, 0.150)],
                    ((0.276, 0.112), 0.110))),
    (0.700, section((0.616, 0.270, 0.608, 0.320, 0.550), None,
                    [(0.338, 0.586), (0.440, 0.600), (0.580, 0.597), (0.650, 0.570), (0.665, 0.485), (0.640, 0.390), (0.500, 0.260), (0.420, 0.125)],
                    ((0.296, 0.104), 0.101))),
    (0.450, section((0.614, 0.272, 0.606, 0.318, 0.552), None,
                    [(0.338, 0.590), (0.450, 0.603), (0.620, 0.600), (0.700, 0.568), (0.720, 0.470), (0.690, 0.360), (0.520, 0.230), (0.440, 0.115)],
                    ((0.300, 0.100), 0.098))),
    (0.150, section((0.615, 0.268, 0.606, 0.312, 0.556), None,
                    [(0.335, 0.592), (0.460, 0.600), (0.640, 0.594), (0.720, 0.555), (0.738, 0.455), (0.705, 0.340), (0.530, 0.215), (0.450, 0.110)],
                    ((0.300, 0.099), 0.098))),
    # ------------------------------------------------------------ headrest, airbox, roll hoop
    (0.040, section((0.640, 0.250, 0.628, 0.306, 0.560), None,
                    [(0.334, 0.592), (0.462, 0.598), (0.640, 0.590), (0.721, 0.551), (0.738, 0.452), (0.704, 0.337), (0.528, 0.213), (0.448, 0.110)],
                    ((0.300, 0.099), 0.098))),
    (-0.060, section((0.700, 0.150, 0.690, 0.260, 0.600), None,
                     [(0.332, 0.590), (0.462, 0.594), (0.636, 0.585), (0.716, 0.546), (0.733, 0.447), (0.700, 0.333), (0.524, 0.210), (0.446, 0.109)],
                     ((0.300, 0.099), 0.098))),
    (-0.100, section((0.930, 0.105, 0.905, 0.200, 0.700), None,
                     [(0.330, 0.588), (0.462, 0.591), (0.632, 0.581), (0.712, 0.542), (0.729, 0.443), (0.696, 0.330), (0.520, 0.208), (0.445, 0.108)],
                     ((0.300, 0.099), 0.098))),
    (-0.250, section((0.955, 0.118, 0.925, 0.205, 0.705), None,
                     [(0.326, 0.584), (0.460, 0.585), (0.622, 0.572), (0.703, 0.534), (0.720, 0.436), (0.688, 0.325), (0.515, 0.204), (0.443, 0.106)],
                     ((0.300, 0.100), 0.098))),
    (-0.450, section((0.852, 0.110, 0.828, 0.200, 0.672), None,
                     [(0.316, 0.566), (0.436, 0.558), (0.586, 0.540), (0.660, 0.500), (0.672, 0.412), (0.638, 0.312), (0.492, 0.196), (0.430, 0.105)],
                     ((0.296, 0.102), 0.100))),
    # ------------------------------------------------------------ downwash ramp into the coke bottle
    (-0.750, section((0.752, 0.110, 0.732, 0.205, 0.628), None,
                     [(0.304, 0.538), (0.398, 0.516), (0.508, 0.484), (0.560, 0.438), (0.568, 0.366), (0.540, 0.285), (0.438, 0.186), (0.400, 0.108)],
                     ((0.290, 0.106), 0.104))),
    (-1.050, section((0.668, 0.112, 0.648, 0.212, 0.568), None,
                     [(0.294, 0.494), (0.354, 0.462), (0.418, 0.420), (0.450, 0.375), (0.453, 0.318), (0.432, 0.252), (0.380, 0.184), (0.356, 0.118)],
                     ((0.280, 0.118), 0.116))),
    (-1.350, section((0.620, 0.112, 0.604, 0.222, 0.540), None,
                     [(0.292, 0.472), (0.320, 0.412), (0.345, 0.372), (0.356, 0.332), (0.353, 0.287), (0.341, 0.237), (0.321, 0.192), (0.305, 0.148)],
                     ((0.262, 0.142), 0.140))),
    # ------------------------------------------------------------ gearbox cover (the shins lie in it)
    (-1.600, section((0.588, 0.115, 0.576, 0.226, 0.530), (0.318, 0.330), None, ((0.248, 0.172), 0.170))),
    (-1.780, section((0.578, 0.112, 0.566, 0.205, 0.522), (0.248, 0.350), None, ((0.202, 0.232), 0.230))),
    (-1.900, section((0.572, 0.105, 0.560, 0.190, 0.515), (0.217, 0.368), None, ((0.178, 0.264), 0.262))),
]

NOSE_POLE = (0.0, 3.070, 0.248)
TAIL_POLE = (0.0, -1.925, 0.410)

# The cage is closed: openings (cockpit, inlets, airbox intake) are cut crisply into
# the finished surface (body.py), where the solidified skin gives their lips thickness.
NO_FILL = (0.960, -0.060)        # the pod front and the airbox front are single face strips
LIP_RINGS = [(0.840, (4, 11), 0.9), (-0.100, (0, 3), 0.8)]   # (station, loop range, crease)
CREASES = {6: 0.75, 7: 0.35, 11: 1.0}   # loop index -> crease (pod shelf edge and its outer roll, floor join)


def stations(extra=1):
    """Station list with `extra` interpolated stations between key stations
    (monotone per coordinate along f), so the cage stays evenly spaced."""
    fs = [s[0] for s in STATIONS]
    cx = [curve1([(fs[i], STATIONS[i][1][k][0]) for i in range(len(fs))]) for k in range(N)]
    cz = [curve1([(fs[i], STATIONS[i][1][k][1]) for i in range(len(fs))]) for k in range(N)]
    out = []
    for i in range(len(fs)):
        out.append((fs[i], [tuple(p) for p in STATIONS[i][1]], True))
        if i + 1 < len(fs) and extra and round(fs[i], 3) not in NO_FILL:
            for e in range(1, extra + 1):
                f = lerp(fs[i], fs[i + 1], e / (extra + 1))
                out.append((f, [(cx[k](f), cz[k](f)) for k in range(N)], False))
    return out


def build_cage(extra=1):
    """Half cage (x >= 0) as a bmesh: grid of station rings, poles at the nose tip
    and tail, openings cut as topology, creases on the design lines."""
    st = stations(extra)
    key_index = {round(f, 4): i for i, (f, _, key) in enumerate(st) if key}
    bm = bmesh.new()
    grid = []
    for f, pts, _ in st:
        grid.append([bm.verts.new(V(x, f, z)) for x, z in pts])
    nose = bm.verts.new(V(*NOSE_POLE))
    # A quad-strip end cap avoids the high-valence triangle fan that pinched
    # the glossy rear face into radial ridges after subdivision.
    cap = [bm.verts.new(V(x*.96, TAIL_POLE[1], .410+(z-.410)*.96))
           for x,z in st[-1][1]]
    faces = {}
    for i in range(len(grid) - 1):
        for k in range(N - 1):
            faces[(i, k)] = bm.faces.new((grid[i][k], grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k]))
    for k in range(N - 1):
        bm.faces.new((nose, grid[0][k + 1], grid[0][k]))
        bm.faces.new((grid[-1][k], cap[k], cap[k+1], grid[-1][k+1]))
    for k in range(N//2-1):
        bm.faces.new((cap[k],cap[N-1-k],cap[N-2-k],cap[k+1]))
    bm.verts.ensure_lookup_table()

    def span(v0, v1):
        a, b = key_index[round(v0, 4)], key_index[round(v1, 4)]
        return range(min(a, b), max(a, b))

    # creases along the design lines
    cl = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for k, val in CREASES.items():
        for i in range(len(grid) - 1):
            e = bm.edges.get((grid[i][k], grid[i + 1][k]))
            if e is not None:
                aft_fade = max(0.0,min(1.0,(st[i+1][0]+2.05)/.30))
                e[cl] = val * aft_fade
    # lip rings: the pod front's outer edge (the inlet's overhanging lip) and the airbox's mouth rim
    for f, ur, val in LIP_RINGS:
        i = key_index[round(f, 4)]
        for k in range(ur[0], ur[1]):
            e = bm.edges.get((grid[i][k], grid[i][k + 1]))
            if e is not None:
                e[cl] = val
    return bm


def build(coll, name='body', levels=2, extra=1):
    """The body object: half cage + clipped mirror + subdivision (modifiers live)."""
    bm = build_cage(extra)
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    me.materials.append(kit.mats.get('paint'))
    m = o.modifiers.new('mirror', 'MIRROR')
    m.use_axis[0] = True
    m.use_clip = True
    m.use_mirror_merge = True
    m.merge_threshold = 0.0005
    s = o.modifiers.new('subd', 'SUBSURF')
    s.levels = levels
    s.render_levels = levels
    s.use_creases = True
    s.use_limit_surface = True
    return o
