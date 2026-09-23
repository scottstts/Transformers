"""Robot hard-surface parts: faceted limb frames, machined joint drums, clevis
cheeks, plates, bolts and hoses. All builders take bone-local (x, f, z)
coordinates (f = forward = -Y) and return (verts, faces) in Blender space."""
import math
from mathutils import Vector, Matrix
from . import kit
from .kit import V


def sec(w, d, c, fc=0.0, xc=0.0):
    """Chamfered rectangle section in the bone XY plane: width w (x), depth d (f),
    corner chamfer c, centred at (xc, fc). Returned as (x, y) with y = -f."""
    return [(x + xc, y - fc) for x, y in kit.chamfer_rect(w, d, c)]


def frame(stations, cap=0.02, seg=2):
    """Lofted limb frame. stations: [(z, w, d, c, fc)] top -> bottom or any order."""
    st = sorted(stations, key=lambda s: s[0])
    secs = [sec(w, d, c, fc) for (_, w, d, c, fc) in st]
    return kit.section_loft(secs, [s[0] for s in st], cap_round=cap, seg=seg)


def M_x(x0, x1):
    """Frame for a polygon drawn in (f, z) and extruded along +x from x0 to x1."""
    return kit.frame_from(Vector((x0, 0, 0)), (0, -1, 0), (0, 0, 1)), x1 - x0


def plate_x(outline_fz, x0, x1, r=0.006, seg=2):
    M, d = M_x(x0, x1)
    return kit.bevel_prism(outline_fz, -d, 0.0, r, seg, M=M)


def plate_f(outline_xz, f0, f1, r=0.006, seg=2):
    M = kit.frame_from(Vector((0, -f0, 0)), (1, 0, 0), (0, 0, 1))
    return kit.bevel_prism(outline_xz, 0.0, f1 - f0, r, seg, M=M)


def plate_z(outline_xf, z0, z1, r=0.006, seg=2):
    poly = [(x, -f) for x, f in outline_xf]
    return kit.bevel_prism(poly, z0, z1, r, seg)


def drum(center, r, w, axis='x', seg=32, face_depth=0.006, hub=0.38):
    """Machined joint rotor: rim lips, recessed faces, raised hubs."""
    h = w / 2
    lip = min(0.012, r * 0.08)
    prof = [
        (0.0, -h - 0.014), (r * hub, -h - 0.014), (r * hub + 0.006, -h - 0.004),
        (r * 0.78, -h + face_depth), (r * 0.84, -h - 0.002), (r - lip, -h - 0.002),
        (r, -h + lip), (r, h - lip), (r - lip, h + 0.002), (r * 0.84, h + 0.002),
        (r * 0.78, h - face_depth), (r * hub + 0.006, h + 0.004), (r * hub, h + 0.014), (0.0, h + 0.014),
    ]
    ax = {'x': 'X', 'f': 'Y', 'z': 'Z'}[axis]
    return kit.revolve(prof, seg, axis=ax, M=Matrix.Translation(V(*center)))


def cylinder(center, r, length, axis='x', seg=24, chamfer=0.004):
    h = length / 2
    c = min(chamfer, r * 0.3, h * 0.3)
    prof = [(0.0, -h), (r - c, -h), (r, -h + c), (r, h - c), (r - c, h), (0.0, h)]
    ax = {'x': 'X', 'f': 'Y', 'z': 'Z'}[axis]
    return kit.revolve(prof, seg, axis=ax, M=Matrix.Translation(V(*center)))


def bolt_ring(center, axis, radius, n, head_r=0.012, head_h=0.008, face_offset=0.0, phase=0.0):
    """Hex bolt heads on a circle, standing on the plane normal to axis."""
    out = []
    ax = {'x': Vector((1, 0, 0)), 'f': Vector((0, -1, 0)), 'z': Vector((0, 0, 1))}[axis] if isinstance(axis, str) else Vector(axis).normalized()
    c = V(*center) + ax * face_offset
    u = ax.orthogonal().normalized()
    w = ax.cross(u)
    for k in range(n):
        a = phase + 2 * math.pi * k / n
        p = c + (u * math.cos(a) + w * math.sin(a)) * radius
        M = kit.frame_from(p, u, w)
        # frame_from's z = u x w = ax
        out.append(kit.revolve([(0.0, -0.002), (head_r, -0.002), (head_r, head_h - 0.002), (head_r * 0.7, head_h), (0.0, head_h)], 6, axis='Z', M=M))
    return out


def smooth_path(pts, n=6):
    """Catmull-Rom resample of a 3D polyline (Blender-space points)."""
    P = [Vector(p) for p in pts]
    if len(P) < 3:
        return P
    out = []
    for i in range(len(P) - 1):
        p0 = P[i - 1] if i > 0 else P[i]
        p1, p2 = P[i], P[i + 1]
        p3 = P[i + 2] if i + 2 < len(P) else P[i + 1]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


def hose(pts_xfz, r, seg=10, n=6):
    return kit.tube(smooth_path([V(*p) for p in pts_xfz], n), r, seg)


def cheek_outline(top_z, pivot_z, f_half, r, fc=0.0, n=10):
    """Clevis cheek in (f, z): straight sides down from top_z, rounded around the
    pivot at (fc, pivot_z) with radius r (f_half >= r)."""
    out = [(fc - f_half, top_z), (fc + f_half, top_z)]
    out += [(fc + r * math.cos(-math.pi * k / n), pivot_z + r * math.sin(-math.pi * k / n)) for k in range(n + 1)]
    return out


def bore(center, r, length, axis='x', seg=24):
    """Cylindrical cutter (for booleans) along axis."""
    h = length / 2
    ax = {'x': 'X', 'f': 'Y', 'z': 'Z'}[axis]
    return kit.revolve([(0.0, -h), (r, -h), (r, h), (0.0, h)], seg, axis=ax, M=Matrix.Translation(V(*center)))


class Part:
    """Accumulates islands for one named robot part (one object, several slots)."""

    def __init__(self, name):
        self.name = name
        self.b = kit.Builder()

    def add(self, mesh, slot='graphite', cuts=()):
        """Add one island; `cuts` are boolean-subtracted from this island only."""
        if cuts:
            mesh = kit.cut_mesh(mesh, cuts)
        self.b.add_mesh(mesh, slot)
        return self

    def many(self, meshes, slot):
        for m in meshes:
            self.b.add_mesh(m, slot)
        return self

    def build(self, coll, bevel=0.005, seg=2, angle=30.0):
        o = self.b.build(self.name, coll)
        kit.finish(o, bevel, seg, angle)
        return o
