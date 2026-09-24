"""Wheels and corners: slick tyres, 18-inch rims with the aero cover, brake
drums, uprights and the faired suspension members.

Wheel meshes are built in a local frame with the axle on x (outer face +x),
centred at the origin; the car places and mirrors them. The tyre is one
revolved carcass: bead, sidewall bulge, shoulder and crown; the Pirelli
compound band is a run of the SAME profile with its own material, so the
band cannot float off or z-fight the sidewall.
"""
import math
from mathutils import Matrix, Vector
from . import kit, dims as D
from .shape import lathe, spline2, lerp, strut, loft_rings, smooth01, clamp01, squircle


def tyre_profile(R, hw, rim):
    """(r, x) half profile from the outer bead round the crown (x >= 0 side)."""
    bulge, tread = hw, hw * 0.80
    k = [(rim, hw * 0.80), (rim + 0.018, hw * 0.88), (R * 0.735, bulge * 0.972), (R * 0.845, bulge),
         (R * 0.918, bulge * 0.958), (R * 0.966, bulge * 0.882), (R * 0.9915, tread * 1.01),
         (R * 0.99935, tread * 0.80), (R, tread * 0.40), (R, 0.0)]
    return spline2(k, 20)


def tyre(R, hw, rim, segs=80):
    """(verts, faces, face slots): one closed carcass revolve (closed at the bead
    seat); faces whose profile span lies in the sidewall band get 'tyreMark'."""
    half = tyre_profile(R, hw, rim)
    # insert exact band radii on the sidewall so the band edges are clean rings
    full = [(r, x) for r, x in half] + [(r, -x) for r, x in reversed(half[:-1])]
    m = len(full)
    v, f = lathe(full, segs, 'x', closed=True)
    band = [R * 0.80 <= 0.5 * (full[j][0] + full[(j + 1) % m][0]) <= R * 0.87 for j in range(m)]
    slots = ['tyreMark' if band[k % m] else 'rubber' for k in range(len(f))]
    return v, f, slots


def rim(rim_r, hw):
    """Barrel (inner), cover dish (outer face), centre boss and nut."""
    out = []
    inner = rim_r - 0.020
    # closed barrel section: outboard flange lip, drop centre, inboard flange, back along the inner wall
    barrel = [(rim_r + 0.006, hw * 0.84), (rim_r + 0.006, hw * 0.80), (rim_r - 0.010, hw * 0.76), (inner, hw * 0.70),
              (inner, hw * 0.18), (inner - 0.012, 0.0), (inner, -hw * 0.18), (inner, -hw * 0.70), (rim_r - 0.010, -hw * 0.76),
              (rim_r + 0.006, -hw * 0.80), (rim_r + 0.006, -hw * 0.84), (inner - 0.016, -hw * 0.84), (inner - 0.016, hw * 0.80)]
    out.append((lathe(barrel, 64, 'x', closed=True), 'rim'))
    # aero cover: shallow dish flush with the flange, painted; dark centre ring
    cover = [(0.0, hw * 0.845), (0.040, hw * 0.846), (0.050, hw * 0.852), (rim_r - 0.14, hw * 0.866), (rim_r - 0.05, hw * 0.862),
             (rim_r - 0.012, hw * 0.845), (rim_r - 0.002, hw * 0.822), (rim_r - 0.002, hw * 0.80), (0.0, hw * 0.80)]
    out.append((lathe(cover, 64, 'x'), 'paint'))
    boss = [(0.0, hw * 0.905), (0.030, hw * 0.905), (0.046, hw * 0.892), (0.052, hw * 0.87), (0.052, hw * 0.848), (0.0, hw * 0.848)]
    out.append((lathe(boss, 36, 'x'), 'carbon'))
    nut = [(0.0, hw * 0.95), (0.026, hw * 0.95), (0.031, hw * 0.94), (0.031, hw * 0.90), (0.0, hw * 0.90)]
    out.append((lathe(nut, 6, 'x', phase=math.pi / 6), 'yellow'))
    return out


def brake_drum(R, hw, front):
    """Carbon brake-duct drum inside the rim with its inlet scoop (front only)."""
    out = []
    rD = 0.198 if front else 0.205
    x0, x1 = -hw * 0.70, hw * 0.55
    drum = [(0.0, x0 - 0.01), (rD * 0.94, x0 - 0.01), (rD, x0 + 0.02), (rD, x1 - 0.02), (rD * 0.96, x1), (0.0, x1)]
    out.append((lathe(drum, 48, 'x'), 'carbon'))
    if front:
        rows = []
        for i in range(11):
            t = i / 10
            f = lerp(0.285, 0.12, t)       # forward of the axle, running back into the drum
            w = lerp(0.050, 0.085, smooth01(t))
            h = lerp(0.060, 0.098, smooth01(t))
            zc = lerp(-0.090, -0.050, t)
            rows.append([(x0 * 0.4 + math.sin(a) * w * 0.5, f, zc + math.cos(a) * h * 0.5) for a in (2 * math.pi * k / 24 for k in range(24))])
        out.append((loft_rings(rows, True, True), 'carbon'))
    return out


def upright(front):
    """Cast upright carrying the hub (inside the brake drum, hidden in car mode;
    it becomes visible as the wheel's mount when the corner folds)."""
    rows = []
    for i in range(15):
        t = i / 14
        z = lerp(0.20, -0.19, t)
        w = 0.036 + 0.024 * math.sin(math.pi * t)
        d = 0.056 + 0.030 * math.sin(math.pi * t)
        rows.append([(-0.09 + math.copysign(abs(math.sin(a)) ** 0.7, math.sin(a)) * w, math.copysign(abs(math.cos(a)) ** 0.7, math.cos(a)) * d, z)
                     for a in (2 * math.pi * k / 24 for k in range(24))])
    return [(loft_rings(rows, True, True, cap_segs=2), 'mech')]


def wheel_builder(front):
    """Builder for one rotating wheel (tyre + rim + cover), local frame, left side."""
    R, W = (D.FR_R, D.FR_W) if front else (D.RR_R, D.RR_W)
    hw = W / 2
    b = kit.Builder()
    b.add_slotted(*tyre(R, hw, D.RIM_R))
    for m, s in rim(D.RIM_R, hw):
        b.add_mesh(m, s)
    return b


def corner_builder(front):
    """Builder for the non-rotating corner parts: brake drum and upright (local frame, left)."""
    R, W = (D.FR_R, D.FR_W) if front else (D.RR_R, D.RR_W)
    b = kit.Builder()
    for m, s in brake_drum(R, W / 2, front) + upright(front):
        b.add_mesh(m, s)
    return b


# ------------------------------------------------------------- suspension
# Each corner is a linkage: upper and lower wishbones (two legs each), the
# steering / toe link and the push (front) or pull (rear) rod. Members are
# grouped by the axis they fold about: the wishbones share one pickup-to-
# upright offset in the section plane, so turning both about their own
# pickup lines by the same angle translates the upright (a parallelogram)
# and the wheel folds in with its axle still lateral.

def _members(front):
    if front:
        ax, hx, zc = D.FA, D.FR_X - 0.150, D.FR_R
        # pickups sit in the tub skin, outboard of the forearm that lies in the tub in the car
        up = [((0.208, ax + 0.262, 0.418), (hx, ax + 0.012, zc + 0.078), dict(chord=0.068, taper=0.72, ratio=0.24)),
              ((0.212, ax - 0.250, 0.412), (hx, ax - 0.006, zc + 0.076), dict(chord=0.064, taper=0.74, ratio=0.24))]
        lo = [((0.196, ax + 0.250, 0.232), (hx + 0.012, ax + 0.016, zc - 0.186), dict(chord=0.080, taper=0.70, ratio=0.22)),
              ((0.206, ax - 0.236, 0.226), (hx + 0.012, ax - 0.008, zc - 0.188), dict(chord=0.076, taper=0.72, ratio=0.22))]
        toe = [((0.206, ax + 0.150, 0.300), (hx + 0.004, ax + 0.086, zc - 0.110), dict(chord=0.036, taper=0.92, ratio=0.34))]
        # pushrod runs from the lower upright up to the rocker, passing behind the upper wishbone's rear leg
        rod = [((hx + 0.006, ax + 0.030, zc - 0.170), (0.214, ax - 0.130, 0.500), dict(chord=0.040, taper=0.90, ratio=0.34))]
    else:
        ax, hx, zc = D.RA, D.RR_X - 0.190, D.RR_R
        # (front legs pick up behind the knee: the thigh's knee cheeks reach RA + 0.27)
        up = [((0.214, ax + 0.250, 0.420), (hx, ax + 0.012, zc + 0.052), dict(chord=0.070, taper=0.72, ratio=0.24)),
              ((0.212, ax - 0.220, 0.414), (hx, ax - 0.010, zc + 0.050), dict(chord=0.064, taper=0.74, ratio=0.24))]
        # (the lower wishbone runs above the diffuser ramp: 0.23 at the rear axle)
        lo = [((0.212, ax + 0.245, 0.252), (hx + 0.012, ax + 0.014, zc - 0.126), dict(chord=0.084, taper=0.70, ratio=0.22)),
              ((0.214, ax - 0.212, 0.258), (hx + 0.012, ax - 0.010, zc - 0.128), dict(chord=0.078, taper=0.72, ratio=0.22)),
              # driveshaft fairing turns with the lower wishbone (its offset differs by 3 cm: the CV joints take it)
              ((0.214, ax, zc - 0.060), (hx - 0.010, ax, zc - 0.058), dict(chord=0.086, taper=0.86, ratio=0.42))]
        toe = [((0.212, ax - 0.236, 0.270), (hx + 0.004, ax - 0.096, zc - 0.120), dict(chord=0.036, taper=0.92, ratio=0.34))]
        rod = [((hx - 0.004, ax - 0.050, zc + 0.040), (0.206, ax + 0.200, 0.318), dict(chord=0.040, taper=0.90, ratio=0.34))]
    return dict(up=up, lo=lo, toe=toe, rod=rod)


def suspension(front):
    """{group: [(mesh, slot)]} for the left corner (groups: up, lo, toe, rod)."""
    return {g: [(strut(a, b, **kw), 'carbon') for a, b, kw in m] for g, m in _members(front).items()}


def pivots(front):
    """{group: (x, z) of its fold axis (along f), (x, z) of its outboard end} for the left corner."""
    out = {}
    for g, m in _members(front).items():
        n = len(m)
        pin = (sum(a[0] for a, b, kw in m) / n, sum(a[2] for a, b, kw in m) / n)
        pout = (sum(b[0] for a, b, kw in m) / n, sum(b[2] for a, b, kw in m) / n)
        out[g] = (pin, pout)
    return out
