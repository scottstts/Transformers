"""The head (reference: a black dome helmet overhanging a narrow angular face).

A spherical skull carries everything: the helmet is a true shell conforming to
the skull sphere (outer RO, inner RI) whose rim runs from brow height at the
front down to the nape, flaring forward at the front into a peaked brim. Under
the brim sits a narrow faceted face: a smoked visor band over an angular black
jaw that narrows to the chin. A cyan light strip runs along the brim's
underside and down both sides of the visor (the reference's lit outline).
Ear pods, seam plates and a nape vent carry the mechanical detail."""
import math
from mathutils import Vector, Matrix
from . import kit as S

C = Vector((0.0, 0.0, 0.17))      # skull centre in the head bone frame
R_SKULL = 0.15
RO = 0.172
RI = 0.156
BRIM = 0.034                      # forward flare of the helmet at the front rim


def rim_e(a):
    """Helmet rim elevation (deg) at azimuth a (deg, 0 = front)."""
    c = (1 - math.cos(math.radians(a))) / 2          # 0 front .. 1 back
    return -4.0 - 44.0 * c ** 1.3


def flare(a, e):
    """Brim flare: grows toward the rim at the front."""
    front = max(0.0, math.cos(math.radians(a))) ** 1.6
    t = max(0.0, 1.0 - (e - rim_e(a)) / 34.0)
    return BRIM * front * t * t * (3 - 2 * t)


def _sph(a, e, r):
    a, e = math.radians(a), math.radians(e)
    return C + Vector((r * math.cos(e) * math.sin(a), -r * math.cos(e) * math.cos(a), r * math.sin(e)))


def _helmet():
    """Grid shell: azimuth rows x elevation columns from the rim to near the pole,
    capped by a pole fan; outer and inner surfaces joined around the rim."""
    na, ne = 40, 12
    outer, inner = [], []
    for i in range(na):
        a = 360.0 * i / na
        e0 = rim_e(a)
        for j in range(ne + 1):
            e = S.lerp(e0, 84.0, (j / ne) ** 0.85)
            fl = flare(a, e)
            outer.append(_sph(a, e, RO + fl))
            inner.append(_sph(a, e + (1.4 if j == 0 else 0.0), RI + fl * 0.85))
    n = len(outer)
    verts = outer + inner + [C + Vector((0, 0, RO)), C + Vector((0, 0, RI))]
    po, pi = n * 2, n * 2 + 1
    W = ne + 1
    faces = []
    for i in range(na):
        i2 = (i + 1) % na
        for j in range(ne):
            q = [i * W + j, i2 * W + j, i2 * W + j + 1, i * W + j + 1]
            faces.append(q)
            faces.append([k + n for k in reversed(q)])
        faces.append([i * W + ne, i2 * W + ne, po])
        faces.append([pi, i2 * W + ne + n, i * W + ne + n])
        faces.append([i * W, i * W + n, i2 * W + n, i2 * W])
    return verts, faces


def _face_sections():
    # z (relative to C), half width, front y, cheek y, back y
    return [(0.035, 0.105, -0.135, -0.08, 0.02),
            (-0.01, 0.10, -0.155, -0.085, 0.02),
            (-0.07, 0.094, -0.155, -0.088, 0.01),
            (-0.13, 0.082, -0.14, -0.08, -0.02),
            (-0.18, 0.062, -0.118, -0.07, -0.045),
            (-0.205, 0.04, -0.10, -0.07, -0.06)]


def _face_sec(hw, fy, cy, by, inset=0.0):
    """Angular face section: a front ridge, two cheek planes, flanks and a back."""
    pts = [(0.0, fy + inset), (hw * 0.55 - inset, fy + (cy - fy) * 0.35 + inset), (hw - inset, cy),
           (hw * 0.85 - inset, by - inset), (-hw * 0.85 + inset, by - inset), (-hw + inset, cy),
           (-hw * 0.55 + inset, fy + (cy - fy) * 0.35 + inset)]
    return S.ccw(pts)


def _face():
    secs = _face_sections()
    out = []
    # visor band (smoked glass) and jaw (black shell), a thin seam between
    top = [(C.z + z, _face_sec(hw, fy, cy, by)) for z, hw, fy, cy, by in secs[:3]]
    out.append((S.loft(top, cap=0.004, seg=1), 'visor'))

    def at(z):
        for k in range(len(secs) - 1):
            a, b = secs[k], secs[k + 1]
            if b[0] <= z <= a[0]:
                t = (z - a[0]) / (b[0] - a[0])
                return [S.lerp(a[i], b[i], t) for i in range(1, 5)]
        return list(secs[-1][1:])
    jaw_z = [-0.078, -0.13, -0.18, -0.205]
    jaw = [(C.z + z, _face_sec(*at(z), inset=0.0 if z < -0.1 else 0.004)) for z in jaw_z]
    out.append((S.loft(jaw, cap=0.006, seg=2), 'shell'))
    # recessed seam core between visor and jaw
    out.append((S.loft([(C.z - 0.085, _face_sec(*at(-0.085), inset=0.01)), (C.z - 0.065, _face_sec(*at(-0.065), inset=0.01))], cap=0.0), 'mech'))
    # the lit outline: along the brim's underside and down both visor edges
    hw, fy, cy = at(-0.068)[:3]
    ht, ft, ct = at(0.0)[:3]
    for s in (1, -1):
        side = [Vector((s * (hw - 0.004), cy - 0.004, C.z - 0.068)), Vector((s * (ht - 0.004), ct - 0.006, C.z - 0.004))]
        out.append((S.tube(side, 0.0045, 8), 'glow'))
    arc = []
    for k in range(13):
        a = S.lerp(-62, 62, k / 12)
        e = rim_e(a) + 1.2
        arc.append(_sph(a, e, RI + flare(a, e) * 0.85 + 0.006))
    out.append((S.tube(arc, 0.0045, 8), 'glow'))
    return out


def head():
    out = []
    shell = _helmet()
    out.append((shell, 'shell'))
    out += _face()
    out.append((S.ball(C, R_SKULL - 0.012, 13, 6), 'mech'))
    hb = S.bvh_of(shell)
    for s in (1, -1):
        c = _sph(s * 90, -14, RO - 0.004)
        out.append((S.drum(c, 0.042, 0.03, 'X', 16), 'polymer'))
        prof = [(0.026, -0.004), (0.034, -0.004), (0.034, 0.004), (0.026, 0.004)]
        out.append((S.revolve(prof + [prof[0]], 24, axis='X', M=Matrix.Translation(c + Vector((s * 0.016, 0, 0)))), 'glow'))
        out.append((S.cyl(c + Vector((s * 0.018, 0, 0)), 0.022, 0.01, 'X', 20), 'steel'))
        # a seam plate behind each ear pod
        f = S.tangent_frame(_sph(s * 122, 4, RO), _sph(s * 122, 4, 1.0) - C)
        out.append((S.conform_plate(hb, f, S.fillet_poly(S.ccw([(-0.035, -0.05), (0.035, -0.05), (0.03, 0.06), (-0.03, 0.06)]), 0.012, 2), 0.006, rings=2), 'shell'))
    f = S.tangent_frame(_sph(180, -26, RO), _sph(180, -26, 1.0) - C)
    out += S.vent(hb, f, 0.11, 0.05, slats=3, t=0.008, frame_w=0.008)
    return out
