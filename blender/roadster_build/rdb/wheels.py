"""Wheels, from the side frame and the video close-ups.

  tyre     r 0.392 on a 21 in rim (bead seat r 0.2935): rim protector rib, sidewall
           with raised PIRELLI / P ZERO lettering, rounded shoulders, four
           circumferential tread grooves
  rim      dark gloss lip and barrel; a light aero disc r 0.085-0.278 (rim() docstring)
  spokes   six radial ridged arms at 0, 60 ... degrees, 110 mm wide at r 0.15
           tapering to 79 mm at r 0.25 (side frame)
  windows  recessed neutral-metal channels; warm highlights are reflections
  hub      hexagonal centre boss and cap
  brakes   cross-drilled carbon-ceramic disc and a caliper on a non-spinning node
"""
import math
import bpy
from mathutils import Vector, Matrix
from . import kit as K, body as B

RIM_R = 0.2935          # 21 in bead seat
LIP = 0.279             # inner edge of the dark lip (side frame)


def frame(x, y, z, sx):
    c = Vector((x, y, z))
    ax = Vector((sx, 0, 0))
    u = Vector((0, 1, 0))
    v = ax.cross(u)
    return c, ax, u, v


def polar(c, ax, u, v, r, a, s=0.0):
    return c + ax * s + r * (u * math.cos(a) + v * math.sin(a))


def tyre(m, c, ax, u, v, w):
    r = B.WHEEL_R
    hw = w / 2
    # half profile from the bead (inboard) across the tread to the bead (outboard):
    # (axial offset, radius); grooves are 8 mm deep, 12 mm wide
    # smooth sidewall: a rounded rim protector, a gently bulged wall, a round shoulder
    side = []
    for k in range(25):
        t = k / 24
        rr = RIM_R + (r - RIM_R) * t
        bulge = 0.010 * math.sin(math.pi * min(1.0, t / 0.85))
        prot = 0.004 * math.exp(-((t - 0.18) / 0.08) ** 2)
        shoulder = 0.040 * max(0.0, (t - 0.80) / 0.20) ** 2
        side.append((0.010 - bulge - prot + shoulder, rr))
    side[0] = (0.0, RIM_R)
    prof = [(-hw + a, rr) for a, rr in side]
    tread_w = w - 0.100
    grooves = [-0.36, -0.12, 0.12, 0.36]
    xs = []
    for g in grooves:
        gx = g * tread_w
        xs += [(gx - 0.006, r), (gx - 0.005, r - 0.008), (gx + 0.005, r - 0.008), (gx + 0.006, r)]
    prof += xs
    prof += [(hw - a, rr) for a, rr in reversed(side)]
    n = 96
    rings = [[polar(c, ax, u, v, rr, i * math.tau / n, s) for i in range(n)] for s, rr in prof]
    rings.append(rings[0])
    m.loft(rings, 'rubber', cap=False)


def sidewall_text(node, c, ax, u, v, w, text, angle, radius, height, name):
    """Raised lettering wrapped on the outboard sidewall along an arc."""
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = text
    cu.extrude = 0.05
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.resolution_u = 4
    tmp = bpy.data.objects.new(name + '.tmp', cu)
    bpy.data.collections['90_REVIEW_STAGE'].objects.link(tmp)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ys = [vv.co.y for vv in me.vertices]
    s = height / (max(ys) - min(ys))
    face = w / 2 - 0.009 + 0.0012          # on the sidewall's flattest band
    inv = node.matrix_basis.inverted()
    for vv in me.vertices:
        x, yv, z = vv.co
        a = angle - x * s / radius            # letters run clockwise, reading outward
        rr = radius + yv * s
        vv.co = inv @ polar(c, ax, u, v, rr, a, face + (z + 0.05) / 0.10 * 0.0012)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(K.MATERIALS['rubber'])
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.data.collections['01_CAR'].objects.link(o)
    o.parent = node
    o[K.TAG] = True
    K.PARTS.append(o)
    return o


def spoke_half_width(r):
    """Top-face width measured on the side frame (4x tile): 0.083 m up to r 0.07,
    tapering straight to 0.060 at the lip."""
    return 0.5 * (0.083 - max(0.0, r - 0.07) * 0.115)


SPOKES = 6
DISC_SAMPLES = 14          # vertices across the disc between two spokes
WALL = 0.006               # spoke side walls lean out this much at their base
RAIL = 0.18                # thin raised edges bordering the wide recessed channel
CHANNEL = 0.016            # channel floor below the rail tops


def dish(r):
    """Disc depth behind the lip face: the face sinks in toward the hub."""
    t = max(0.0, min(1.0, (LIP - r) / (LIP - 0.06)))
    return -0.020 - 0.052 * t ** 1.2


def spoke_top(r):
    """Rail tops fall toward the hub too, staying proud of the disc."""
    t = max(0.0, min(1.0, (LIP - r) / (LIP - 0.06)))
    return -0.002 - 0.040 * t ** 1.3


def face_depth(r, role):
    if role in ('edge', 'rail'):
        return spoke_top(r) - (0.0015 if role == 'edge' else 0.0)
    if role == 'floor':
        return spoke_top(r) - CHANNEL
    if r < LIGHT_R - 0.006:
        return -0.105                                 # dark window pocket by the hub
    if r < LIGHT_R + 0.006:
        k = (r - (LIGHT_R - 0.006)) / 0.012          # the light disc's rolled inner lip
        return -0.105 + (dish(LIGHT_R + 0.006) + 0.105) * (3 * k * k - 2 * k ** 3)
    return dish(r)


APEX = 0.043          # small centre cap; six arms converge directly at the hub
SPOKE_W = 0.058
LIGHT_R = 0.105       # sector tip: 57 px from the hub in side_ref.png


def spoke_lines():
    """Each spoke as a line (rim point, inner point) in the wheel plane, (a, b)
    coordinates along (u, v). 0 and 180 degrees are radial."""
    out = []
    for k in range(SPOKES):
        th = k * math.tau / SPOKES
        rim_p = (LIP * math.cos(th), LIP * math.sin(th))
        inner = (0.0, 0.0)
        out.append((rim_p, inner))
    return out


SPOKE_LINES = spoke_lines()


def spoke_at(k, r):
    """Centre angle of spoke k at radius r and the angle its line makes with the
    radial direction there."""
    (px, py), (ix, iy) = SPOKE_LINES[k]
    dx, dy = px - ix, py - iy
    L = math.hypot(dx, dy)
    dx, dy = dx / L, dy / L
    # |i + d s| = r  ->  s^2 + 2 s (i.d) + |i|^2 - r^2 = 0
    idd = ix * dx + iy * dy
    disc = idd * idd - (ix * ix + iy * iy - r * r)
    if disc < 0:
        s = -idd
    else:
        s = -idd + math.sqrt(disc)
    s = max(0.0, s)
    qx, qy = ix + dx * s, iy + dy * s
    if math.hypot(qx, qy) < 1e-6:
        qx, qy = dx * 1e-4, dy * 1e-4
    ang = math.atan2(qy, qx)
    rx, ry = math.cos(ang), math.sin(ang)
    cosphi = max(0.3, abs(rx * dx + ry * dy))
    return ang, cosphi


def ring_layout(r):
    """Angles and roles of one face ring. Each spoke (side frame, 3/4 photo) is
    a channel: base, outer rail edge, rail top, the channel floor (its inner walls
    are the duplicated angles), rail top, edge, base; then the disc samples to the
    next spoke. Where two spokes of a V meet, the disc between them closes to a
    1 mm sliver."""
    spokes = []
    for k in range(SPOKES):
        c, cosphi = spoke_at(k, r)
        half = spoke_half_width(r) / cosphi
        ht = half / r
        hb = (half + WALL) / r
        spokes.append([c % math.tau, ht, hb])
    spokes.sort(key=lambda s: s[0])
    n = len(spokes)
    sliver = 0.001 / r
    for k in range(n):                      # keep neighbours from overlapping
        c0, _, hb0 = spokes[k]
        c1, _, hb1 = spokes[(k + 1) % n]
        gap = (c1 - c0) % math.tau
        if hb0 + hb1 + sliver > gap:
            scale = max(0.05, (gap - sliver) / (hb0 + hb1))
            for s in (spokes[k], spokes[(k + 1) % n]):
                s[2] = min(s[2], s[2] * scale + 0.0)
                s[1] = min(s[1], s[2] - 0.0006 / r)
    out = []
    base_angle = spokes[0][0]
    for k in range(n):
        a0, ht, hb = spokes[k]
        a0 = base_angle + ((a0 - base_angle) % math.tau)
        hc = ht * (1.0 - RAIL)
        out += [(a0 - hb, 'base'), (a0 - ht, 'edge'), (a0 - hc, 'rail'), (a0 - hc, 'floor'), (a0, 'floor'),
                (a0 + hc, 'floor'), (a0 + hc, 'rail'), (a0 + ht, 'edge'), (a0 + hb, 'base')]
        nxt = spokes[(k + 1) % n]
        a_next = base_angle + ((nxt[0] - base_angle) % math.tau)
        if k == n - 1:
            a_next += math.tau
        a1, a2 = a0 + hb, a_next - nxt[2]
        for i in range(1, DISC_SAMPLES + 1):
            out.append((a1 + (a2 - a1) * i / (DISC_SAMPLES + 1), 'disc'))
    return out


def rim(m, c, ax, u, v, w):
    """One continuous closed surface: the dished face with its six ridged spokes,
    the lip, the barrel and the back, lofted ring by ring around the wheel. Face
    vertex columns follow the spoke edges, so creases lie on real edges."""
    hw = w / 2
    f = hw - 0.012                                   # the lip's outboard face
    r0 = APEX + 0.004                # the hub boss closes everything inside this
    radii = [r0 + (LIP - r0) * (i / 47) ** 0.9 for i in range(48)]
    rings, mats = [], []
    for r in radii:
        lay = ring_layout(r)
        rings.append([polar(c, ax, u, v, r, ang, f + face_depth(r, role)) for ang, role in lay])
        mats.append([role for ang, role in lay])
    outer = ring_layout(LIP)
    inner = ring_layout(radii[0])
    # lip crown, outer shoulder, the barrel shell, then the back of the face web
    # (the brake disc sits in the barrel behind it)
    for r, d, lay in ((0.2815, 0.002, outer), (0.2875, 0.004, outer), (RIM_R, 0.002, outer), (RIM_R + 0.004, -0.008, outer),
                      (RIM_R, -0.030, outer), (RIM_R - 0.004, -(w - 0.026), outer), (RIM_R - 0.014, -(w - 0.026), outer),
                      (RIM_R - 0.014, -0.135, outer), (0.20, -0.135, outer), (0.10, -0.135, inner), (radii[0], -0.125, inner)):
        rings.append([polar(c, ax, u, v, r, ang, f + d) for ang, role in lay])
        mats.append(None)
    rings.append(rings[0])
    n = len(rings[0])
    base = len(m.v)
    for ring in rings:
        m.v.extend(ring)

    def slot(name):
        if name not in m.slots:
            m.slots.append(name)
        return m.slots.index(name)
    for j in range(len(rings) - 1):
        for i in range(n):
            a_, b_ = j * n + i, j * n + (i + 1) % n
            roles = mats[j]
            if roles is None or j >= len(radii) - 1:
                mat = 'graphite'
            else:
                pair = {roles[i], roles[(i + 1) % n]}
                rmid = (radii[j] + radii[j + 1]) / 2
                mat = 'wheel' if (pair <= {'disc', 'base'} and 'disc' in pair and rmid > LIGHT_R) else 'graphite'
            m.f.append((base + a_, base + b_, base + b_ + n, base + a_ + n))
            m.mi.append(slot(mat))
    # hub: the arms meet under a round cap with a fine bead (a separate turned part)
    # hub boss: a dark dish where the spokes meet, slightly above the spoke tops at
    # the boss rim, falling to the cap
    h0 = f + spoke_top(APEX + 0.004)
    m.lathe([(f - 0.100, 0.0), (f - 0.100, 0.048), (h0 - 0.006, 0.048), (h0 + 0.001, 0.047), (h0 + 0.002, 0.043),
             (h0 + 0.003, 0.038), (h0 + 0.004, 0.034), (h0 + 0.006, 0.030), (h0 + 0.007, 0.020), (h0 + 0.007, 0.0)],
            'graphite', c, ax, 96)
    m.lathe([(h0 + 0.006, 0.0355), (h0 + 0.0085, 0.036), (h0 + 0.0095, 0.038), (h0 + 0.0075, 0.0398),
             (h0 + 0.005, 0.0392), (h0 + 0.0045, 0.0375)], 'gunmetal', c, ax, 64)


def brakes(m, c, ax, u, v, w, front):
    hw = w / 2
    s0 = -hw + 0.06
    r_disc = 0.205 if front else 0.195
    m.lathe([(s0, 0.075), (s0, r_disc), (s0 + 0.036, r_disc), (s0 + 0.036, 0.075)], 'gunmetal', c, ax, 96)
    # cross-drilled holes as shallow dark pockets in rings
    for ring_r, cnt, ph in ((r_disc - 0.030, 24, 0.0), (r_disc - 0.055, 24, 0.13)):
        for k in range(cnt):
            a = k * math.tau / cnt + ph
            p = polar(c, ax, u, v, ring_r, a, s0 + 0.0365)
            m.cyl(p - ax * 0.003, p + ax * 0.0008, 0.0045, 'graphite', sides=8)


def caliper(m, c, ax, u, v, w, front):
    hw = w / 2
    s0 = -hw + 0.06
    r_disc = 0.205 if front else 0.195
    a0, a1 = math.radians(-14), math.radians(14)   # behind the rear-pointing spoke
    pts = []
    for a in (a0, (a0 + a1) / 2, a1):
        for rr in (r_disc - 0.065, r_disc + 0.020):
            for s in (s0 - 0.03, s0 + 0.066):
                pts.append(polar(c, ax, u, v, rr, a, s))
    m.hull(pts, 'caliper')


def suspension(m, x, y, z, w, sx, front):
    """Double wishbones, upright and coil-over damper, inboard of the wheel."""
    xi = sx * (abs(x) - w / 2 - 0.045)          # upright, inside the rim barrel
    up_c = Vector((xi, y, z))
    m.hull([up_c + Vector((dx, dy, dz)) for dx in (-0.022, 0.022) for dy in (-0.05, 0.05) for dz in (-0.13, 0.15)], 'gunmetal')
    xc = sx * 0.34                               # chassis pick-ups
    for dz, spread in ((-0.11, 0.24), (0.13, 0.18)):
        tip = up_c + Vector((0, 0, dz))
        for dy in (-spread / 2, spread / 2):
            m.tube([tip, Vector((xc, y + dy, z + dz + 0.01))], 0.016, 'graphite', 10)
        m.lathe([(-0.02, 0.0), (-0.02, 0.022), (0.02, 0.022), (0.02, 0.0)], 'chrome', tip, (0, 1, 0), 16)
    # coil-over: from the lower arm up to the tub
    a = up_c + Vector((-sx * 0.10, 0.0, -0.08))
    b = Vector((sx * 0.56, y + (0.06 if front else -0.06), z + 0.24))   # top mount in the wheel well
    m.cyl(a, a.lerp(b, 0.55), 0.024, 'gunmetal', sides=16)
    m.cyl(a.lerp(b, 0.45), b, 0.016, 'chrome', sides=16)
    axis = (b - a).normalized()
    for k in range(9):   # spring coils as rings
        c = a.lerp(b, 0.25 + 0.06 * k)
        m.lathe([(-0.004, 0.034), (-0.004, 0.042), (0.004, 0.042), (0.004, 0.034)], 'bronze', c, axis, 16)
    # drive shaft to the motor
    m.cyl(up_c, Vector((sx * 0.30, y, z)), 0.022, 'graphite', sides=16)


def build():
    nodes = []
    for name, (x, y, z, w) in B.WHEELS.items():
        sx = 1 if x > 0 else -1
        front = name.startswith('wheelF')
        node = K.node(name, size=0.3)
        node.location = (x, y, z)
        c, ax, u, v = frame(x, y, z, sx)
        m = K.Mesh()
        tyre(m, c, ax, u, v, w)
        rim(m, c, ax, u, v, w)
        brakes(m, c, ax, u, v, w, front)
        m.build('car.' + name, '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0012, smooth_angle=30)
        for i, (txt, ang, h) in enumerate((('PIRELLI', 0.6, 0.030), ('P ZERO', 0.6 + math.pi, 0.026),
                                           ('PIRELLI', 0.6 + math.pi * 0.62, 0.016), ('275/35 R21', 0.6 + math.pi * 1.55, 0.012))):
            sidewall_text(node, c, ax, u, v, w, txt, ang, B.WHEEL_R - 0.050, h, 'car.%s.text.%d' % (name, i))
        # the caliper does not turn with the wheel: its own node
        hub = K.node('asm.hub.' + name.split('wheel')[1], size=0.1)
        hub.location = (x, y, z)
        cm = K.Mesh()
        caliper(cm, c, ax, u, v, w, front)
        suspension(cm, x, y, z, w, sx, front)
        cm.build('car.caliper.' + name.split('wheel')[1], '01_CAR', parent=hub, rest=hub.matrix_basis.copy(), bevel=0.003)
        nodes.append(node)
    return nodes
