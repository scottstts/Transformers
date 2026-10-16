"""Head (r_helmet.py, traced from the head/face/neck sheet) and the neck, in
robot rest coordinates. Neck parts below are metres about the head centre c,
read off the same sheet (front: S 1.55 mm/px about u 312.5, v 295; back: about
u 943.5). The neck hangs on the neck bone; its lower ends run into the chest.
"""
import math
from mathutils import Vector
from . import kit as K, hs, rig
from .r_helmet import fx, fz, bx


def centre():
    h = rig.HEADS['head']
    return Vector((0, h.y, h.z + 0.28))


def build_meshes():
    from .r_helmet import build
    return build(centre())


def _ell(c, z, rx, fy, by, n=32):
    cy, ry = (fy + by) / 2, (by - fy) / 2
    return [c + Vector((rx * math.sin(i * math.tau / n), cy - ry * math.cos(i * math.tau / n), z)) for i in range(n)]


def _slab(m, c, outline, y_front, depth, ch, mat):
    """Front-facing plate: outline [(x, z)] at depth y_front (about c), its
    front face chamfered ch, its back depth behind."""
    cx = sum(x for x, _ in outline) / len(outline)
    cz = sum(z for _, z in outline) / len(outline)
    pts = []
    for x, z in outline:
        d = Vector((x - cx, z - cz))
        k = max(0.0, 1 - ch / max(d.length, 1e-6))
        pts.append(c + Vector((cx + d.x * k, y_front, cz + d.y * k)))
        pts.append(c + Vector((x, y_front + ch, z)))
        pts.append(c + Vector((x, y_front + depth, z)))
    m.hull(pts, mat)


def neck_meshes():
    c = centre()

    def P(x, y, z):
        return c + Vector((x, y, z))

    m = K.Mesh()
    # column: graphite core from inside the chest up into the skull (profile:
    # the neck's front runs at u 270-290, behind the chin)
    m.loft([_ell(c, z, rx, fy, by) for z, rx, fy, by in
            ((-.375, .082, -.036, .173), (-.36, .080, -.038, .175), (-.25, .075, -.045, .180),
             (-.165, .062, -.055, .165))], 'graphite')
    # segment collars down the column
    for z in (-.215, -.270, -.325):
        m.loft([_ell(c, z + dz, rx, fy, by) for dz, rx, fy, by in
                ((-.016, .084, -.046, .181), (-.010, .090, -.052, .187), (.010, .090, -.052, .187),
                 (.016, .084, -.046, .181))], 'gunmetal')
    # front stack under the chin: front u 282-337, v 430-525, each tucked
    # under the one above
    for (v0, v1, u0, u1), y in (((430, 452, 282, 330), -.080), ((455, 490, 290, 335), -.071),
                                ((492, 525, 288, 337), -.062)):
        w0, w1 = (fx(u0) - fx(u1)) / 2, (fx(u0) - fx(u1)) / 2 + .002
        _slab(m, c, [(-w0, fz(v0)), (w0, fz(v0)), (w1, fz(v1)), (-w1, fz(v1))], y, .035, .006, 'helmet')
    # back spine (back u 915-975, v 350-430; u 905-985, v 452-527)
    for out, y in (([(915, 350), (972, 350), (975, 358), (975, 398), (915, 398), (912, 358)], .222),
                   ([(920, 402), (967, 402), (967, 428), (920, 428)], .212),
                   ([(918, 452), (969, 452), (985, 466), (985, 527), (902, 527), (902, 466)], .205)):
        pts = []
        for u, v in out:
            pts.append((-bx(u), fz(v)))
        cx = sum(x for x, _ in pts) / len(pts)
        cz = sum(z for _, z in pts) / len(pts)
        hull = []
        for x, z in pts:
            d = Vector((x - cx, z - cz))
            k = max(0.0, 1 - .006 / d.length)
            hull += [P(cx + d.x * k, y, cz + d.y * k), P(x, y - .006, z), P(x, y - .036, z)]
        m.hull(hull, 'helmet')
    # base flange bolted onto the chest deck (the deck under the neck is flat
    # at z -0.380 about c); every lower mount stands on it
    oct_ = [(-.150, -.100), (.150, -.100), (.190, -.060), (.190, .195), (.150, .235), (-.150, .235),
            (-.190, .195), (-.190, -.060)]
    _plinth(m, c, oct_, FLANGE_TOP, -.386, .008, 'gunmetal')
    for i, (x, y) in enumerate(oct_):
        q = Vector(oct_[(i + 1) % 8])
        for t in (.25, .75):
            p2 = Vector((x, y)).lerp(q, t) * .88 + Vector((0, .0675)) * .12
            hs.bolts(m, [P(p2.x, p2.y, FLANGE_TOP)], (0, 0, 1), .006, .004, 'graphite')
    floor = c.z + FLANGE_TOP
    for s in (-1, 1):
        # front rams (front: rod from under the jaw u 200 v 340, cylinder down
        # to u 262 v 525; profile: from under the ear forward to the chest)
        ram(m, P(s * .100, .000, -.330), P(s * .168, .100, -.095), .019, floor)
        # rear rams (back u 850 v 365 to u 840 v 500)
        ram(m, P(s * .150, .195, -.330), P(s * .140, .190, -.120), .016, floor)
        # links flanking the front stack, flange to chin
        ram(m, P(s * .055, -.030, -.333), P(s * .066, -.052, -.200), .010, floor, short=True)
    return m


FLANGE_TOP = -.355


def _plinth(m, c, outline, top, bottom, ch, mat):
    """Plate on an (x, y) outline from bottom to top (about c), top edge chamfered."""
    cx = sum(x for x, _ in outline) / len(outline)
    cy = sum(y for _, y in outline) / len(outline)
    pts = []
    for x, y in outline:
        d = Vector((x - cx, y - cy))
        k = 1 - ch / d.length
        pts += [c + Vector((cx + d.x * k, cy + d.y * k, top)), c + Vector((x, y, top - ch)),
                c + Vector((x, y, bottom))]
    m.hull(pts, mat)


def _lug(m, p, k, r, w, mat='gunmetal'):
    """Rod-end eye on a pin along k."""
    m.lathe([(-w / 2, 0.0), (-w / 2, r - .002), (-w / 2 + .002, r), (w / 2 - .002, r), (w / 2, r - .002),
             (w / 2, 0.0)], mat, p, k, 24)


def _clevis(m, pin, k, up, reach, gap, post=0.0):
    """Fork round a lug: two cheeks either side of it on a pin along k, running
    `reach` along `up` to a block across them; `post` carries the block on
    into the part it is fixed to."""
    up = (up - k * up.dot(k)).normalized()
    side = k.cross(up)
    t, R = .007, .022
    for sg in (-1, 1):
        cen = pin + k * sg * (gap / 2 + t / 2)
        pts = []
        for j in range(12):
            a = j * math.tau / 12
            q = cen + (side * math.cos(a) + up * math.sin(a)) * R
            pts += [q + k * t / 2, q - k * t / 2]
        for d in (-1, 1):
            q = cen + up * reach + side * d * R
            pts += [q + k * t / 2, q - k * t / 2]
        m.hull(pts, 'graphite')
    w = gap / 2 + t + .004
    blk = []
    for a, b in ((reach, .024 + post), ):
        for e in (a, a + b):
            for d in (-1, 1):
                for g in (-1, 1):
                    blk.append(pin + up * e + side * d * (R + .003) + k * g * w)
    m.hull(blk, 'graphite')
    m.lathe([(-w - .002, 0.0), (-w - .002, .0065), (w + .002, .0065), (w + .002, 0.0)], 'chrome', pin, k, 16)
    for sg in (-1, 1):
        m.lathe([(0.0, 0.0), (0.0, .010), (.003, .010), (.004, .008), (.004, 0.0)], 'gunmetal',
                pin + k * sg * (w + .002), k * sg, 6)


def ram(m, a, b, r, floor, short=False):
    """Ram on lugs between two clevises: the lower fork stands on the flange,
    the upper one is posted up into the head's underside; floor is the flange
    top (world z). The pins run square to the ram, level, so it swings fore
    and aft."""
    ax = (b - a).normalized()
    L = (b - a).length
    k = ax.cross(Vector((0, 0, 1))).normalized()
    gap = r * 1.1 + .002
    e = max(r, .012)
    _lug(m, a, k, e, gap - .002)
    _lug(m, b, k, e, gap - .002)
    _clevis(m, a, k, Vector((0, 0, -1)), a.z - floor - .012, gap)
    _clevis(m, b, k, Vector((0, 0, 1)), .018, gap, post=.06 if not short else .02)
    s0 = e * .7
    split = L * (.42 if short else .55)
    body = 'graphite' if short else 'gunmetal'
    m.lathe([(s0, 0.0), (s0, r * .7), (s0 + r * .3, r), (split - r * .7, r), (split - r * .7, 0.0)], body, a, ax, 24)
    if not short:
        m.lathe([(s0 + r * .5, 0.0), (s0 + r * .5, r * 1.08), (s0 + r * 1.1, r * 1.08), (s0 + r * 1.1, 0.0)],
                'bronze', a, ax, 24)
    m.lathe([(split - r * .7, 0.0), (split - r * .7, r * 1.16), (split, r * 1.16), (split, 0.0)],
            'gunmetal' if short else 'bronze', a, ax, 24)
    m.lathe([(split - .01, 0.0), (split - .01, r * .5), (L - e * .7, r * .5), (L - e * .7, 0.0)],
            'gunmetal' if short else 'chrome', a, ax, 16)
    m.lathe([(L - e * .7 - r * .9, 0.0), (L - e * .7 - r * .9, r * .68), (L - e * .7, r * .68), (L - e * .7, 0.0)],
            'gunmetal', a, ax, 16)
