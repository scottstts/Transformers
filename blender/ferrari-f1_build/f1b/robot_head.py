"""Neck and head (after the reference robot).

The head itself is a plain sphere -- a normal, round head. Nothing reshapes it:
every head part is a plate laid ON the sphere at its own layer height, with its
outline authored in angles on the sphere, plus a few protruding add-ons.

Layers, inside out:
  skull     black-chrome sphere; shows in every gap (eye slits, seams)
  face      silver mask on the front: V shield to a pointed chin, nose ridge,
            muzzle guard with slots; its top edge is the lower edge of the eyes
  eyes      blue slits between the mask and the brow, slanting down to the nose
  cheeks    red guards framing the face, curving down to points by the chin
  brow      red V brow over the eyes (the angry line), white top trim; its ends
            run out into the horns
  crest     red strip from the brow over the crown, a pointed fin on it,
            the Ferrari shield on the forehead
  add-ons   horns (red over dark, yellow inner edge), small spikes, ear drums
            with gold rings, a rear helmet plate

Head frame: origin at the head joint, x lateral, f forward, z up.
"""
import math
from mathutils import Vector
from . import kit, rkit, rig
from .kit import V
from .rkit import Part
from .armor import panel
from .shape import plate, lathe, lerp

C = (0.0, 0.020, 0.170)     # sphere centre
R = 0.155                   # sphere radius
RAD = math.radians


# ------------------------------------------------------------------ the sphere
def S(phi, theta, lift=0.0):
    """Point on the head sphere (+ lift): phi = azimuth from the front toward +x,
    theta = elevation, both in degrees."""
    p, t = RAD(phi), RAD(theta)
    r = R + lift
    return (C[0] + r * math.cos(t) * math.sin(p), C[1] + r * math.cos(t) * math.cos(p), C[2] + r * math.sin(t))


def M(alpha, beta, lift=0.0):
    """Point on the sphere by meridian angle alpha (0 front, 90 crown, 180 back) and a small
    lateral angle beta: no pole along the crown line (for the crest)."""
    a, b = RAD(alpha), RAD(beta)
    r = R + lift
    return (C[0] + r * math.sin(b), C[1] + r * math.cos(b) * math.cos(a), C[2] + r * math.cos(b) * math.sin(a))


def radial(p):
    d = Vector(p) - Vector(C)
    return tuple(d.normalized())


def layer(fn, rows, lift, thick, nu, relief=None):
    """A plate on the sphere: fn(u, v, lift) -> point; rows [(v, u0, u1)]; outer skin at
    lift (+ relief), inner skin thick below it."""
    def P(u, v):
        return fn(u, v, lift + (relief(u, v) if relief else 0.0))
    return panel(P, rows, thick, lambda u, v: radial(fn(u, v, lift)), nu)


def S_tp(u, v, lift):          # u = elevation, v = azimuth (rows run across the face)
    return S(v, u, lift)


def S_pt(u, v, lift):          # u = azimuth, v = elevation (rows run down the head)
    return S(u, v, lift)


def M_ab(u, v, lift):          # u = lateral angle, v = meridian angle
    return M(v, u, lift)


def pwl(knots, x):
    if x <= knots[0][0]:
        return knots[0][1]
    for (x0, a), (x1, b) in zip(knots, knots[1:]):
        if x <= x1:
            return lerp(a, b, (x - x0) / (x1 - x0))
    return knots[-1][1]


def rows_over(v0, v1, lo, hi, n):
    vs = [lerp(v0, v1, i / n) for i in range(n + 1)]
    return [(v, lo(v), hi(v)) for v in vs]


# ------------------------------------------------------------------ face layout (degrees)
EYE_IN, EYE_OUT = 5.0, 33.0


def brow_low(phi):
    """Lower edge of the brow: the V (low between the eyes, rising outward)."""
    return -3.0 + 0.36 * abs(phi)


def brow_up(phi):
    """Upper edge: also rising outward, so each half of the brow is a wing running into its horn."""
    return 13.0 + 0.44 * abs(phi)


def eye_h(phi):
    a = abs(phi)
    if a <= EYE_IN or a >= EYE_OUT:
        return 0.0
    t = (a - EYE_IN) / (EYE_OUT - EYE_IN)
    return 7.0 * min(1.0, t / 0.25) * min(1.0, (1.0 - t) / 0.12)


def mask_top(phi):
    return brow_low(phi) - eye_h(phi) + 1.0          # tucked 1 deg under the brow


MASK_EDGE = [(0.0, -70.0), (8.0, -64.0), (18.0, -52.0), (27.0, -38.0), (34.0, -24.0), (39.0, -8.0), (41.0, 8.0)]


def mask_bot(phi):
    return pwl(MASK_EDGE, abs(phi))


def mask_phi(theta):
    """Half width of the mask at elevation theta (inverse of its lower edge)."""
    return pwl([(t, p) for p, t in MASK_EDGE], theta)


def nose(u, v):
    """Relief of the mask: a nose ridge down the centre, fading at the eyes and the chin."""
    theta, phi = u, v
    k = max(0.0, 1.0 - abs(phi) / 14.0)
    fade = min(1.0, max(0.0, (4.0 - theta) / 8.0)) * min(1.0, max(0.0, (theta + 62.0) / 14.0))
    return 0.014 * k * fade


def mirrored(rows, s):
    """Rows authored for +x mirrored to side s (u extents are azimuths)."""
    return rows if s > 0 else [(v, -b, -a) for v, a, b in rows]


# ------------------------------------------------------------------ parts
def skull(p):
    """The head: a plain sphere, black chrome, on a socket collar."""
    n, m = 48, 24
    rings = [[V(*S(360.0 * j / n, -90.0 + 180.0 * i / m)) for j in range(n)] for i in range(1, m)]
    verts = [v for r in rings for v in r] + [V(*S(0.0, -90.0)), V(*S(0.0, 90.0))]
    faces = []
    for i in range(len(rings) - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append([a, b, b + n, a + n])
    bot, top = len(verts) - 2, len(verts) - 1
    last = (len(rings) - 1) * n
    for j in range(n):
        faces.append([bot, (j + 1) % n, j])
        faces.append([top, last + j, last + (j + 1) % n])
    p.add((verts, faces), 'blackChrome')
    p.add(kit.revolve([(0.0, -0.030), (0.064, -0.030), (0.072, -0.016), (0.070, 0.030), (0.050, 0.052), (0.0, 0.052)], 32), 'darkSteel')


def face(p):
    # faceted: a handful of azimuth stations and elevation steps -> flat machined planes
    # (under the head's low bevel angle every facet edge gets a crisp chamfer)
    stations = [-41.0, -34.0, -25.0, -14.0, -5.0, 0.0, 5.0, 14.0, 25.0, 34.0, 41.0]
    rows = [(phi, mask_bot(phi), mask_top(phi)) for phi in stations]
    p.add(layer(S_tp, rows, 0.010, 0.014, 5, relief=nose), 'silver')
    # muzzle guard: a raised plate over the lower face, three dark slots across it
    mz = [(phi, pwl([(0, -60.0), (9, -54.0), (14, -46.0)], abs(phi)), pwl([(0, -30.0), (14, -34.0)], abs(phi)))
          for phi in [lerp(-14.0, 14.0, i / 14) for i in range(15)]]
    p.add(layer(S_tp, mz, 0.022, 0.016, 8), 'silver')
    for k, th in enumerate((-37.0, -42.5, -48.0)):
        w = 9.0 - 2.2 * k
        sl = [(phi, th - 1.3, th + 1.3) for phi in [lerp(-w, w, i / 6) for i in range(7)]]
        p.add(layer(S_tp, sl, 0.0236, 0.006, 2), 'blackChrome')
    # eyes: glowing slits in the dark gap between the mask and the brow
    for s in (1, -1):
        rows = [(s * a, brow_low(a) - eye_h(a) + 0.6, brow_low(a) + 0.4)
                for a in [lerp(EYE_IN + 0.8, EYE_OUT - 0.5, i / 12) for i in range(13)]]
        if s < 0:
            rows.reverse()
        p.add(layer(S_tp, rows, 0.006, 0.010, 3), 'eye')


def _cheek_inner(t):
    if t < 6.0:
        return mask_phi(t) + 2.0
    return lerp(mask_phi(6.0) + 2.0, 52.0, (t - 6.0) / 12.0)


CHEEK_OUT = [(-66.0, 13.0), (-58.0, 34.0), (-44.0, 70.0), (-26.0, 96.0), (-6.0, 104.0), (8.0, 102.0), (18.0, 60.0)]


def cheeks(p):
    """Red guards framing the face: a dark seam off the mask, curving down to points by the chin."""
    rows = rows_over(-66.0, 18.0, _cheek_inner, lambda t: pwl(CHEEK_OUT, t), 28)
    stripe = rows_over(-60.0, 4.0, lambda t: _cheek_inner(t) + 1.6, lambda t: _cheek_inner(t) + 3.0, 20)
    for s in (1, -1):
        p.add(layer(S_pt, mirrored(rows, s), 0.024, 0.024, 16), 'paint')
        p.add(layer(S_pt, mirrored(stripe, s), 0.0275, 0.005, 2), 'paintWhite')


def brow(p):
    rows = [(phi, brow_low(phi), brow_up(phi)) for phi in [-58.0, -46.0, -34.0, -22.0, -11.0, 0.0, 11.0, 22.0, 34.0, 46.0, 58.0]]
    p.add(layer(S_tp, rows, 0.032, 0.034, 3), 'paint')
    trim = [(phi, brow_up(phi) - 3.0, brow_up(phi) - 1.0) for phi in [-54.0, -46.0, -34.0, -22.0, -11.0, 0.0, 11.0, 22.0, 34.0, 46.0, 54.0]]
    p.add(layer(S_tp, trim, 0.0355, 0.006, 2), 'paintWhite')


def crest(p):
    """Red strip from the brow over the crown; a pointed fin rises from its front."""
    width = [(11.0, 8.0), (60.0, 6.5), (100.0, 5.0), (128.0, 3.5)]
    rows = rows_over(11.0, 128.0, lambda a: -pwl(width, a), lambda a: pwl(width, a), 24)
    p.add(layer(M_ab, rows, 0.030, 0.030, 6), 'paint')
    # fin: an outline in the centre plane, rooted inside the strip
    base = [M(a, 0.0, 0.018) for a in [lerp(118.0, 32.0, i / 10) for i in range(11)]]
    tops = [M(a, 0.0, h) for a, h in [(32.0, 0.034), (46.0, 0.070), (58.0, 0.118), (66.0, 0.092), (84.0, 0.062), (104.0, 0.040), (118.0, 0.030)]]
    p.add(rkit.plate_x([(q[1], q[2]) for q in base + tops], -0.010, 0.010, 0.003), 'paint')
    # Ferrari shield on the forehead strip
    o = Vector(M(27.0, 0.0, 0.031))
    n = Vector(radial(M(27.0, 0.0)))
    up = (Vector((0.0, 0.0, 1.0)) - n * n.z).normalized()
    sx = Vector((1.0, 0.0, 0.0))
    on = lambda d: (lambda a, b, w: tuple(o + sx * a + up * b + n * (w + d)))
    p.add(plate([(-0.016, -0.018), (0.016, -0.018), (0.016, 0.012), (0.0, 0.024), (-0.016, 0.012)], 0.005, warp=on(0.003)), 'yellow')
    p.add(plate([(-0.006, -0.012), (0.006, -0.012), (0.008, 0.004), (0.001, 0.014), (-0.008, 0.002)], 0.004, warp=on(0.0055)), 'blackChrome')


def blade(base, tip, out_hint, outline, thick, off=0.0):
    """Flat blade from base to tip; outline (u along 0..1, v across in metres)."""
    b, t = Vector(base), Vector(tip)
    d = t - b
    L = d.length
    d.normalize()
    side = Vector(out_hint).cross(d).normalized()
    nrm = d.cross(side).normalized()
    return plate([(u * L, v) for u, v in outline], thick, warp=lambda u, v, w: tuple(b + d * u + side * v + nrm * (w + off)))


def horns(p):
    """Horns growing out of the brow ends, sweeping up and out; small spikes by the crest."""
    for s in (1, -1):
        base = Vector(S(s * 52.0, 30.0, 0.030))
        tip = (s * 0.420, -0.070, 0.540)
        hint = (s * 0.55, 0.85, 0.0)
        p.add(blade(base, tip, hint, [(-0.06, -0.030), (0.25, -0.034), (1.0, 0.0), (0.42, 0.024), (-0.06, 0.030)], 0.020), 'paint')
        p.add(blade(base, tip, hint, [(0.0, -0.034), (0.30, -0.040), (0.97, -0.003), (0.40, 0.016), (0.0, 0.020)], 0.012, off=-0.011), 'blackChrome')
        p.add(blade(base, tip, hint, [(0.16, -0.038), (0.34, -0.041), (0.95, -0.006), (0.36, -0.031), (0.16, -0.029)], 0.024, off=-0.002), 'yellow')
        sb = Vector(M(62.0, s * 20.0, 0.004))
        p.add(blade(sb, sb + Vector((s * 0.030, -0.040, 0.085)), (s * 1.0, 0.2, 0.0), [(0.0, -0.014), (1.0, 0.0), (0.0, 0.014)], 0.012), 'paint')


def ears(p):
    for s in (1, -1):
        c = S(s * 96.0, -4.0, 0.022)
        p.add(lathe([(0.0, -0.030), (0.052, -0.030), (0.058, -0.018), (0.058, 0.010), (0.050, 0.018), (0.0, 0.018)], 64, 'x', center=c), 'blackChrome')
        p.add(lathe([(0.032, 0.010), (0.046, 0.010), (0.050, 0.018), (0.050, 0.026), (0.044, 0.030), (0.032, 0.030)], 64, 'x',
                    center=c, closed=True), 'gold')
        p.add(lathe([(0.0, 0.014), (0.020, 0.014), (0.020, 0.028), (0.014, 0.034), (0.0, 0.034)], 64, 'x', center=c), 'darkSteel')


def rear(p):
    """Rear helmet plates over the back of the skull, a centre seam between them."""
    for lo, hi in ((124.0, 178.5), (-178.5, -124.0)):
        p.add(layer(S_pt, rows_over(-34.0, 58.0, lambda t, a=lo: a, lambda t, b=hi: b, 16), 0.020, 0.020, 10), 'paint')


def neck():
    p = Part('R.neck.column')
    top = rig.HEAD_Z - rig.NECK_Z
    p.add(kit.revolve([(0.0, -0.050), (0.070, -0.050), (0.088, -0.030), (0.086, -0.010), (0.070, 0.010), (0.058, 0.050),
                       (0.046, top - 0.030), (0.042, top - 0.004), (0.0, top - 0.004)], 28), 'darkSteel')
    for z in (0.018, 0.048, 0.078):
        p.add(rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(0.150, 0.140, 0.040)], z - 0.008, z + 0.008, 0.003), 'graphite')
    for s in (1, -1):
        p.add(rkit.hose([(s * 0.040, -0.060, -0.020), (s * 0.052, -0.080, 0.050), (s * 0.040, -0.064, top - 0.010)], 0.010), 'rubber')
        p.add(rkit.hose([(s * 0.070, 0.020, -0.030), (s * 0.080, 0.030, 0.050), (s * 0.060, 0.030, top - 0.020)], 0.008), 'rubber')
    return [p]


def head():
    h = Part('R.head.helmet')
    skull(h)
    face(h)
    cheeks(h)
    brow(h)
    crest(h)
    horns(h)
    ears(h)
    rear(h)
    return [h]


def build(coll):
    return {'neck': [p.build(coll, 0.004, 2, 30) for p in neck()],
            'head': [p.build(coll, 0.0018, 2, 9) for p in head()]}
