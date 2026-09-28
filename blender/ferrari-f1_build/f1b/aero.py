"""Aerodynamic surfaces: front wing, rear wing, beam wing, floor and diffuser.

Every element is a spanwise loft of cambered sections (chord, incidence,
camber, dihedral per station): inverted wings carry negative camber and
negative incidence, so the trailing edges curl up as on the real car.
Wings are authored for the left half (x >= 0) and split on the centreline:
the transformer carries each half separately, so the halves are distinct
objects that meet on x = 0 with the standard 2G reveal.
"""
import math
from mathutils import Vector
from . import kit, dims as D
from .shape import (subdivide, wing, plate, spline2, strut, lerp, clamp01, smooth01, Track, stations, loft_rings,
                    ring_closed, ring_half, squircle, pod_pts)

G = D.G


def _el(x0, x1, steps, le, z, chord, inc, thick, camber, dih=None, tips=(False, True)):
    st = []
    for i in range(steps + 1):
        t = i / steps
        st.append(dict(le=(lerp(x0, x1, t), le(t), z(t)), chord=chord(t), inc=inc(t), thick=thick(t), camber=camber(t),
                       dih=dih(t) if dih else 0.0))
    return wing(st, 30, tips)


def _rise(t, amt):
    return amt * clamp01((t - 0.56) / 0.44) ** 1.75


# ------------------------------------------------------------------ front wing
FW_TIP = D.FW_SPAN - 0.012        # element tips meet the endplate inner face


def front_plan(mesh):
    """SF-25 planform: bowed leading edge and shorter outboard chord.

    Use the same mapping for all four foils, endplates and their fittings.
    Coordinates entering/leaving this helper are Blender coordinates.
    """
    verts, faces = mesh
    out = []
    for x, y, z in verts:
        sweep = clamp01(abs(x) / FW_TIP) ** 1.7
        f = D.FW_LE - 0.360 * sweep + (-y - D.FW_LE) * (1 - 0.36 * sweep)
        out.append(Vector((x, -f, z)))
    return out, faces


def front_wing_elements():
    """Four slotted foils, with a continuous sweep and seated outboard ends."""
    out = []
    for x0, le, z, chord, inc, camber, slot in (
            (G,3.044,.067,.250,-.065,-.034,'carbon'),
            (.10,2.808,.098,.186,-.19,-.055,'carbon'),
            (.17,2.640,.149,.160,-.29,-.070,'paintWhite'),
            (.24,2.494,.214,.142,-.39,-.075,'paintWhite')):
        mesh = _el(x0, FW_TIP+.004, 36,
                   lambda t: le-.018*t*t,
                   lambda t: z+.026*smooth01(t)+.025*t**3,
                   lambda t: chord*(1-.06*t*t),
                   lambda t: inc-.065*t*t,
                   lambda t: .052-.009*t,
                   lambda t: camber,
                   tips=(False,False))
        out.append((mesh,slot))
    return [(front_plan(mesh), slot) for mesh, slot in out]


def front_endplate():
    """Moulded endplate with an integral curved foot, not a slab on a rail.

    The lower quarter-round and upright are a single thin composite shell.
    A raked leading edge, outwash curl and tapered trailing corner follow
    the front three-quarter photograph.
    """
    rows=[]
    for i in range(41):
        t=i/40
        f=lerp(3.070,2.346,t)
        top=.365+.010*math.sin(math.pi*t)-.083*smooth01((t-.70)/.30)
        foot_z=.047+.011*t
        x=FW_TIP+.002
        width=.033+.025*math.sin(math.pi*t)**.7
        path=[(x+width,foot_z),(x+.026,foot_z)]
        for j in range(1,9):
            a=math.pi*.5*j/8
            path.append((x+.026-.026*math.sin(a),foot_z+.026*(1-math.cos(a))))
        for j in range(1,17):
            u=j/16
            path.append((x+.016*t*u*u,lerp(foot_z+.026,top,u)))
        left=kit.offset_open(path,.003)
        right=kit.offset_open(path,-.003)
        ring=left+list(reversed(right))
        # Rake the upper leading edge back instead of ending in an oval cap.
        rows.append([(xx,f-.075*(1-t)**8*((zz-foot_z)/(top-foot_z))**2,zz) for xx,zz in ring])
    return front_plan(loft_rings(rows,True,True))


def front_flap_hardware():
    """Slender slot-gap brackets on each side of the wing fold line."""
    out = []
    from mathutils.bvhtree import BVHTree
    surfaces = [BVHTree.FromPolygons(*mesh) for mesh,_ in front_wing_elements()]
    for x in (0.34, 0.73):
        t = x / FW_TIP
        rise = _rise(t, 0.040)
        # Each web bridges adjacent elements; none crosses the foot's fold.
        for j,(f0,z0,f1,z1) in enumerate(((2.79,0.077,2.78,0.130),
                              (2.64,0.160,2.62,0.202),
                              (2.52,0.241,2.50,0.272))):
            seeds = front_plan(([kit.V(x,f0,z0+rise), kit.V(x,f1,z1+rise)], []))[0]
            a = surfaces[j].find_nearest(seeds[0])[0]
            b = surfaces[j+1].find_nearest(seeds[1])[0]
            f0,z0,f1,z1 = -a.y,a.z-.004,-b.y,b.z+.004
            outline = [(f0+0.018,z0),(f0-0.018,z0),
                       (f1-0.016,z1),(f1+0.016,z1)]
            out.append((plate(outline,0.008,warp=lambda f,z,w,x=x:(x+w,f,z)), 'carbon'))
    return out


def rear_actuator():
    """Central DRS fairing and its short link, seated between the two planes."""
    return [(drs_pod(), 'carbon'),
            (strut((0,-2.11,0.720),(0,-2.11,0.787),chord=0.035,ratio=0.40,
                   steps=6,stream=(0,1,0)), 'carbon'),
            (strut((0,-2.19,0.795),(0,-2.29,0.821),chord=0.009,ratio=0.7,
                   steps=6,stream=(0,0,1)), 'mech')]


def nose_pylon():
    """Faired pylon joining the left half of the wing to the nose underside."""
    st = []
    for i in range(9):
        t = i / 8
        st.append(dict(le=(lerp(0.062, 0.052, t), lerp(2.935, 2.860, t), lerp(0.105, 0.262, smooth01(t))), chord=lerp(0.22, 0.17, t),
                       inc=0.0, thick=0.12, camber=0.0, sdir=(0, 0, 1), udir=(1, 0, 0), cdir=(0, -1, 0)))
    return wing(st, 30, (False, False))


# ------------------------------------------------------------------- rear wing
RW_HALF = D.RW_SPAN - 0.010


def rear_wing_elements():
    main = _el(G, RW_HALF, 18,
               lambda t: D.RW_LE - 0.004 + 0.012 * t ** 2.2,
               lambda t: 0.705 + 0.030 * t ** 2.0,
               lambda t: 0.262 - 0.02 * clamp01((t - 0.8) / 0.2) ** 2,
               lambda t: -0.16 - 0.04 * t * t,
               lambda t: 0.082 - 0.010 * t,
               lambda t: -0.062)
    flap = _el(G, RW_HALF - 0.004, 16,
               lambda t: -2.205 + 0.010 * t ** 2.2,
               lambda t: 0.782 + 0.052 * t ** 2.0,
               lambda t: 0.190 - 0.016 * clamp01((t - 0.82) / 0.18) ** 2,
               lambda t: -0.52 - 0.04 * t * t,
               lambda t: 0.058 - 0.008 * t,
               lambda t: -0.086)
    return [(main, 'paintWhite'), (flap, 'paintWhite')]


def rear_endplate():
    """2022+ endplate: the top corner rolls over into the wing tip."""
    out = [(-1.930, 0.600), (-1.946, 0.730), (-1.995, 0.775), (-2.100, 0.810),
           (-2.190, 0.850), (-2.255, 0.902), (-2.365, 0.925), (-2.402, 0.885),
           (-2.398, 0.750), (-2.365, 0.610), (-2.270, 0.565), (-2.050, 0.556)]
    outline = spline2(out, 80, closed=True)
    x0 = RW_HALF + 0.006

    def warp(u, v, w):
        top = clamp01((v - 0.80) / 0.14)
        return (x0 + w + 0.022 * top ** 2 * clamp01((-1.95 - u) / 0.45) ** 1.2, u, v)
    return plate(outline, 0.010, warp=warp)


def swan_neck():
    """Left swan-neck pylon: rises from the heel mount (the rear structure) and
    hooks over onto the upper surface of the main plane."""
    # base on the heel block of the foot (the tail), 1 cm into it; top hooked onto the main plane
    from . import rkit
    # The old diagonal started aft of the body and pierced the mainplane.
    # This closed side profile seats on the deck, clears the leading edge,
    # hooks over it, and lands on the upper face at f=-2.06, z=0.717.
    outline = [(-2.155,.548),(-2.085,.548),(-1.939,.697),
               (-1.918,.731),(-1.925,.760),(-1.956,.779),
               (-2.034,.770),(-2.069,.743),(-2.071,.714),
               (-2.035,.714),(-2.034,.737),(-1.969,.745),
               (-1.958,.732),(-1.970,.710),(-2.136,.587)]
    return rkit.plate_x(kit.fillet_poly(outline,.009,4),.104,.120,.0015,2)


def drs_pod():
    rows=[]
    for f,w,h in ((-2.06,.008,.007),(-2.075,.014,.011),(-2.18,.014,.011),(-2.205,.009,.008)):
        rows.append([(x,f,.795+z) for x,z in squircle(w,h,3.0,16)])
    return loft_rings(rows,True,True)


def beam_wing():
    up = _el(G, 0.380, 12, lambda t: -2.055 - 0.016 * t * t, lambda t: 0.336 + 0.012 * t * t,
             lambda t: 0.160, lambda t: -0.30, lambda t: 0.070, lambda t: -0.070)
    lo = _el(G, 0.360, 10, lambda t: -2.095 - 0.014 * t * t, lambda t: 0.262 + 0.010 * t * t,
             lambda t: 0.132, lambda t: -0.23, lambda t: 0.066, lambda t: -0.058)
    return [(up, 'carbon'), (lo, 'carbon')]


# ----------------------------------------------------------------------- floor
FLOOR = Track(
    # plank nose under the tub, tunnel inlets behind the front wheels, straight edge,
    # inward sweep ahead of the rear tyres into the diffuser
    halfW=[(1.42, 0.280), (1.30, 0.300), (1.20, 0.500), (1.06, 0.640), (0.80, 0.740), (0.40, 0.800), (-0.20, 0.820),
           (-0.90, 0.816), (-1.15, 0.760), (-1.32, 0.640), (-1.46, 0.548), (-1.70, 0.520), (-2.05, 0.518), (-2.35, 0.545)],
    topZ=[(1.42, 0.112), (1.20, 0.100), (0.80, 0.094), (-0.40, 0.094), (-1.00, 0.102), (-1.40, 0.130),
          (-1.80, 0.188), (-2.10, 0.244), (-2.35, 0.285)],
    botZ=[(1.42, 0.056), (1.20, 0.048), (0.80, 0.046), (-0.40, 0.048), (-1.00, 0.056), (-1.40, 0.070),
          (-1.80, 0.106), (-2.12, 0.156), (-2.35, 0.198)],
    tunH=[(1.42, 0.004), (1.20, 0.016), (0.90, 0.034), (0.30, 0.046), (-0.50, 0.056), (-1.00, 0.084), (-1.40, 0.124),
          (-1.80, 0.082), (-2.12, 0.072), (-2.35, 0.075)],
)


def diffuser_drop(f,x):
    """Rounded diffuser shoulders flowing down into the outer tunnel wall."""
    return smooth01((-1.55-f)/.65) * (.080*smooth01((abs(x)-.395)/.145))


def floor_half_section(f):
    """Floor half section (x, z): flat top, edge lip, venturi tunnel roof, keel and
    the skid plank. x is monotonic by construction (tunnel points sit between the
    keel and the edge wall). Aft of the tunnel throat every underside point kicks
    up toward the top skin, so the diffuser exit is a thin trailing lip over the
    open tunnels, not a solid block."""
    p = FLOOR(f)
    e, top, bot, tun = p['halfW'], p['topZ'], p['botZ'], p['tunH']
    wall = e - 0.070
    rise = smooth01((-1.40 - f) / 0.78)
    lip = top - 0.014

    def up(z):
        return lerp(z, lip, rise * 0.94)
    plank = lerp(D.PLANK_Z, bot, smooth01((-1.40 - f) / 0.30))
    return [
        (0.0, top),
        (e * 0.60, top - 0.002),
        (e - 0.030, top - 0.004),
        (e, top - 0.016),
        (e + 0.003, up(top - 0.034)),
        # held under the lip so the lifted exit edge keeps a real wall
        (e - 0.008, min(up(bot + tun * 0.20 - 0.004), up(top - 0.034) - 0.006)),
        (wall, up(bot + tun * 0.55)),
        (lerp(0.18, wall, 0.62), up(bot + tun)),
        (lerp(0.18, wall, 0.22), up(bot + tun * 0.80)),
        (0.170, up(bot + 0.004)),
        (0.150, up(bot)),
        (0.146, up(plank + 0.004)),          # skid plank under the centreline
        (0.140, up(plank)),
        (0.0, up(plank)),
    ]


def floor_surface():
    fs = stations(1.42, -2.35, 132, 0.25)
    # top x3, lip x2, edge wall, tunnel wall, roof x2, keel, plank side, plank edge, plank
    alloc = [6, 4, 2, 2, 2, 2, 3, 3, 3, 1, 1, 1, 3]
    # The diffuser drop is a vertical shear of the resampled rings, so the top
    # skin and the tunnel roof beneath it fall by the same amount at every x.
    # Dropping only the section control points let the linearly spanned top
    # skin cut through the tunnel wall near the exit (z-fighting sheet).
    rings = [[(x, f, z - diffuser_drop(f, x)) for x, _, z in ring_half(floor_half_section(f), f, 0, alloc=alloc)]
             for f in fs]
    return loft_rings(rings, True, True)          # flat end faces (bevelled at finish)


def diffuser_vanes():
    """Curved tunnel fences fused into the continuous underfloor roof."""
    out=[]
    for x0,x1 in ((.145,.145),(.305,.335),(.47,.50)):
        rows=[]
        for i in range(37):
            t=i/36
            f=lerp(-1.43,-2.348,t)
            x=lerp(x0,x1,smooth01(t))
            # Top buried mid-sheet; the outer fence stays clear of the edge
            # wall so no fence face lies on a floor face.
            roof=FLOOR(f)['topZ']-diffuser_drop(f,x)-.008
            bottom=lerp(.068,.047,smooth01(t))
            # The fence grows smoothly out of the throat, and the exit
            # edge is softly swept forward at its lower corner.
            bottom=lerp(roof-.012,bottom,smooth01(t/.32))
            rows.append([(x-.003,f,roof),(x+.003,f,roof),
                         (x+.003,f+.020*t**8,bottom),
                         (x-.003,f+.020*t**8,bottom)])
        mesh=loft_rings(rows,True,True)
        out.extend((mesh,kit.mirror_x(mesh)))
    return out


def floor_details():
    """SF-25-style floor-edge wing and three small tunnel inlet fences.

    Joined to the floor before band cutting, so every detail follows the
    existing car panel that carries it. Nothing bridges a transformation seam.
    """
    out = []
    rings = []
    for k in range(33):
        f = lerp(.78,-1.02,k/32)
        p = FLOOR(f); e,z = p['halfW'],p['topZ']
        rings.append([(e-.044,f,z+.007),(e+.002,f,z+.020),
                      (e+.003,f,z+.028),(e-.046,f,z+.013)])
    out.append((loft_rings(rings,True,True),'carbon'))
    for x,f0,f1 in ((.43,1.15,.81),(.53,1.08,.74),(.63,.96,.65)):
        # Lower edges penetrate the floor slightly; the top curls down aft.
        prof=[(f0,.089),(f1,.084),(f1,.113),(f0-.04,.166),(f0,.152)]
        out.append((plate(prof,.007,warp=lambda f,z,w,x=x:(x+w,f,z)),'carbonMatte'))
    return out
