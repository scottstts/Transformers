"""Running gear behind and under the cab: frame rails, fifth wheel, drive axles
with trailing-arm air suspension, quarter fenders, mud flaps, rear crossmember
and tail lamps, and the front beam axle. Centre parts are split on the
centreline (the fifth wheel along its throat, the crossmember and axles at the
motor housing), because each half rides its own leg."""
import math
from mathutils import Matrix, Vector
from . import kit, rkit, dims as D
from .kit import V
from .cab import sector

RAIL_W = 0.090           # flange width
RAIL_T = 0.010
RAIL_BOT = D.RAIL_TOP - D.RAIL_H


def P3(x, s, z):
    return V(x, D.f(s), z)


def box_s(x0, x1, s0, s1, z0, z1, r=0.006):
    """Bevelled box between stations (plan x/s, height z)."""
    poly = [(x0, -D.f(s0)), (x1, -D.f(s0)), (x1, -D.f(s1)), (x0, -D.f(s1))]
    return kit.bevel_prism(poly, z0, z1, r, 2)


def rail(s0, s1):
    """C-channel frame rail (L side), open side inboard."""
    xo = D.RAIL_X + RAIL_W / 2
    xi = D.RAIL_X - RAIL_W / 2
    sec = [(xo, RAIL_BOT), (xo, D.RAIL_TOP), (xi, D.RAIL_TOP), (xi, D.RAIL_TOP - RAIL_T),
           (xo - RAIL_T, D.RAIL_TOP - RAIL_T), (xo - RAIL_T, RAIL_BOT + RAIL_T), (xi, RAIL_BOT + RAIL_T), (xi, RAIL_BOT)]
    # extrude the (x, z) section along s
    M = kit.frame_from(P3(0, s0, 0), (1, 0, 0), (0, 0, 1))
    return kit.bevel_prism(sec, -(s1 - s0), 0.0, 0.003, 1, M=M)          # local z is forward


def fifth_half():
    """Left half of the fifth-wheel top plate with its ramp horn, mounting bracket and pivot."""
    sc, zt = D.FIFTH_S, D.FIFTH_Z
    out = []
    # plan outline (x, s) of the left half: round front, straight side, horn back to the throat
    pts = []
    for k in range(9):
        a = math.radians(90 - 90 * k / 8)
        pts.append((0.46 * math.cos(a), sc - 0.18 - 0.26 * math.sin(a)))
    pts += [(0.46, sc + 0.12), (0.40, sc + 0.44), (0.20, sc + 0.46), (0.07, sc + 0.14), (0.025, sc + 0.02), (0.025, sc - 0.44)]
    poly = [(x, -D.f(s)) for x, s in pts]
    out.append((kit.bevel_prism(poly, zt - 0.055, zt, 0.010, 2), 'steel'))
    # underside ribs and the pivot bracket on the rail
    for x in (0.12, 0.30):
        out.append((box_s(x - 0.012, x + 0.012, sc - 0.36, sc + 0.30, zt - 0.14, zt - 0.05), 'chassis'))
    out.append((box_s(D.RAIL_X - 0.06, D.RAIL_X + 0.06, sc - 0.20, sc + 0.20, D.RAIL_TOP, zt - 0.10, 0.008), 'chassis'))
    out.append((rkit.cylinder((D.RAIL_X, D.f(sc), zt - 0.10), 0.05, 0.16, 'x', 20), 'steel'))
    # locking jaw housing under the throat
    out.append((box_s(0.03, 0.16, sc - 0.06, sc + 0.16, zt - 0.16, zt - 0.055), 'chassis'))
    return out


def axle_half(st):
    """L half of a drive axle: housing tube, half of the motor housing, hub/drum, trailing arm,
    air spring and damper."""
    out = []
    fz = D.f(st)
    out.append((rkit.cylinder((0.37, fz, D.AXLE_Z), 0.075, 0.70, 'x', 24), 'chassis'))
    # motor / gear housing: faceted block, split on the centreline
    out.append((kit.bevel_prism([(0.0, -fz - 0.24), (0.26, -fz - 0.20), (0.26, -fz + 0.22), (0.0, -fz + 0.26)],
                                D.AXLE_Z - 0.22, D.AXLE_Z + 0.20, 0.03, 2), 'chassis'))
    out.append((rkit.cylinder((0.20, fz - 0.23, D.AXLE_Z - 0.02), 0.12, 0.18, 'x', 24), 'chassis'))
    # brake drum and hub flange (inside the inner rim)
    out.append((rkit.cylinder((0.66, fz, D.AXLE_Z), 0.19, 0.16, 'x', 32), 'chassis'))
    # trailing arm from the hanger ahead of the axle, air spring behind it
    hs = st - 0.60
    out.append((box_s(D.RAIL_X - 0.05, D.RAIL_X + 0.05, hs - 0.06, hs + 0.06, D.AXLE_Z + 0.08, RAIL_BOT + 0.01), 'chassis'))
    out.append((kit.bar(P3(D.RAIL_X, hs, D.AXLE_Z + 0.12), P3(D.RAIL_X, st + 0.30, D.AXLE_Z - 0.08),
                        kit.chamfer_rect(0.09, 0.07, 0.015)), 'chassis'))
    out.append((rkit.cylinder((D.RAIL_X, D.f(st + 0.30), D.AXLE_Z + 0.16), 0.13, 0.26, 'z', 24), 'rubber'))
    out.append((rkit.cylinder((D.RAIL_X, D.f(st + 0.30), RAIL_BOT - 0.015), 0.14, 0.03, 'z', 24), 'chassis'))
    out.append((kit.tube([P3(D.RAIL_X + 0.10, st + 0.05, D.AXLE_Z + 0.02), P3(D.RAIL_X + 0.08, st - 0.12, RAIL_BOT + 0.02)], 0.030, 12), 'chassis'))
    return out


def quarter_fender(st):
    return [(sector(D.f(st), D.AXLE_Z, D.WHEEL_R + 0.055, D.WHEEL_R + 0.075, 0.60, 1.24, 35.0, 150.0, 24), 'blackMatte'),
            (box_s(D.RAIL_X + 0.04, 0.62, st - 0.04, st + 0.04, D.RAIL_TOP - 0.10, D.AXLE_Z + D.WHEEL_R + 0.09), 'chassis')]


def mudflap():
    st = D.RA2_S + D.WHEEL_R + 0.12
    return [(box_s(0.62, 1.22, st, st + 0.014, 0.30, 1.02, 0.004), 'rubber'),
            (box_s(D.RAIL_X + 0.04, 1.20, st - 0.04, st, 0.98, 1.04, 0.004), 'chassis')]


def tail_half():
    """L half of the rear crossmember with its lamp housing and red lamps."""
    s0, s1 = D.FRAME_END_S - 0.12, D.FRAME_END_S
    out = [(box_s(0.0, D.RAIL_X + 0.05, s0, s1, 0.86, 1.10), 'chassis'),
           (box_s(0.58, 0.98, s0 - 0.02, s1, 0.88, 1.06, 0.012), 'blackMatte'),
           (box_s(0.64, 0.92, s1 - 0.004, s1 + 0.008, 0.93, 1.02, 0.004), 'lightRed'),
           (box_s(D.RAIL_X + 0.05, 0.58, s0 + 0.02, s1 - 0.02, 0.92, 1.04, 0.004), 'chassis')]
    return out


def front_axle():
    fz = D.f(D.FA_S)
    out = [(kit.bar(P3(-0.80, D.FA_S, D.AXLE_Z - 0.02), P3(0.80, D.FA_S, D.AXLE_Z - 0.02), kit.chamfer_rect(0.10, 0.14, 0.02)), 'chassis')]
    for s in (1, -1):
        out.append((rkit.cylinder((s * 0.84, fz, D.AXLE_Z), 0.05, 0.30, 'z', 16), 'chassis'))
        out.append((rkit.cylinder((s * 0.90, fz, D.AXLE_Z), 0.16, 0.12, 'x', 28), 'chassis'))
        out.append((kit.bar(P3(s * 0.55, D.FA_S - 0.70, 0.78), P3(s * 0.55, D.FA_S + 0.70, 0.78), kit.chamfer_rect(0.09, 0.05, 0.01)), 'chassis'))
    return out


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

    def sided(name, meshes, bevel=0.003):
        make(name + '.L', meshes, bevel)
        make(name + '.R', [(kit.mirror_x(m), s) for m, s in meshes], bevel)

    sided('rail', [(rail(5.34, D.FRAME_END_S - 0.12), 'chassis')])
    sided('fifth', fifth_half())
    sided('axle1', axle_half(D.RA1_S))
    sided('axle2', axle_half(D.RA2_S))
    sided('qfender1', quarter_fender(D.RA1_S))
    sided('qfender2', quarter_fender(D.RA2_S))
    sided('mudflap', mudflap())
    sided('tail', tail_half())
    make('frontAxle', front_axle())
    return parts
