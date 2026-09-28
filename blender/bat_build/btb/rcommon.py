"""Shared robot part builders: clevis cheeks, axle caps, balls, rams, and the
side-aware build of a bone's parts (L authored, R mirrored)."""
import math
from mathutils import Vector
from . import kit, rkit
from .kit import V
from .rkit import Part


def cheeks(pivot_z, top_z, r, f_half, x_in, thick, fc=0.0):
    out = []
    outline = rkit.cheek_outline(top_z, pivot_z, f_half, r, fc)
    for s in (1, -1):
        x0, x1 = (x_in, x_in + thick) if s > 0 else (-x_in - thick, -x_in)
        out.append(rkit.plate_x(outline, x0, x1, 0.008))
    return out


def axle_caps(pivot_z, x_out, r=0.10, fc=0.0, bolts=8):
    out = []
    for s in (1, -1):
        out.append((rkit.cylinder((s * (x_out + 0.018), fc, pivot_z), r, 0.036, 'x', 32), 'darkSteel'))
        out += [(m, 'blackChrome') for m in rkit.bolt_ring((s * (x_out + 0.036), fc, pivot_z), (s, 0, 0), r * 0.64, bolts, 0.014, 0.010)]
    return out


def ball(r, seg=32):
    return kit.revolve([(0.0, -r)] + [(r * math.sin(math.pi * k / 14), -r * math.cos(math.pi * k / 14)) for k in range(1, 14)] + [(0.0, r)], seg)


def ram(p0, p1, r_body, r_rod, split=0.55):
    """Hydraulic ram between two design points: body, gland, chrome rod, eye ends."""
    a, b = V(*p0), V(*p1)
    d = b - a
    L = d.length
    u = d / L
    m = a + u * (L * split)
    out = [(kit.bar(a, m, kit.chamfer_rect(r_body * 2, r_body * 2, r_body * 0.5)), 'mech'),
           (kit.bar(m - u * 0.03, m + u * 0.025, kit.chamfer_rect(r_body * 2.3, r_body * 2.3, r_body * 0.7)), 'darkSteel'),
           (kit.tube([m - u * 0.04, b - u * 0.015], r_rod, 16), 'chrome')]
    side = u.orthogonal().normalized()
    for p in (a, b):
        out.append((kit.tube([p - side * 0.03, p + side * 0.03], r_body * 0.9, 16), 'darkSteel'))
    return out


def mirror_part(part):
    part.b.verts = [Vector((-v.x, v.y, v.z)) for v in part.b.verts]
    part.b.faces = [list(reversed(f)) for f in part.b.faces]


def build_sided(coll, specs, bevel=0.007):
    """specs: [(bone base name, parts_fn)] with parts_fn() -> [Part] authored for L as
    'R.<bone>.<name>'. Returns bone -> [objects] for both sides."""
    out = {}
    for S, s in (('L', 1), ('R', -1)):
        for bone, fn in specs:
            objs = []
            for part in fn():
                if s < 0:
                    mirror_part(part)
                part.name = part.name.replace('R.' + bone + '.', 'R.%s.%s.' % (bone, S), 1)
                objs.append(part.build(coll, bevel, 2, 30))
            out.setdefault('%s.%s' % (bone, S), []).extend(objs)
    return out


def items(part, lst):
    for m, s in lst:
        part.add(m, s)
    return part
