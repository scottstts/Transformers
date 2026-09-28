"""Blueprint reference planes (image empties) at true scale, for ortho checks.
Collection REF, hidden from renders. The Wayne Enterprises blueprint's side and
top views share one scale (15 ft over 528 px); the back view is drawn slightly
larger (9 ft over 305 px)."""
import os
import bpy
from mathutils import Matrix, Vector
from . import kit, dims as D

IMG = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'ref_images', 'batmobile-blueprint.jpeg'))
W, H = 1024, 790
K_SIDE = 0.3048 / 35.2
K_BACK = 0.3048 / 33.9


def _empty(name, coll, img, basis, anchor_px, anchor_world, k):
    """basis: (image right, image up) as world vectors; the image centre is placed so the
    pixel anchor_px lands on anchor_world."""
    o = bpy.data.objects.get(name)
    if o is None:
        o = bpy.data.objects.new(name, None)
        coll.objects.link(o)
    o.empty_display_type = 'IMAGE'
    o.data = img
    o.empty_display_size = W * k
    o.empty_image_offset = (-0.5, -0.5)
    o.use_empty_image_alpha = True
    o.color[3] = 0.55
    r, u = Vector(basis[0]), Vector(basis[1])
    n = r.cross(u)
    lx = (anchor_px[0] - W / 2) * k
    ly = (H / 2 - anchor_px[1]) * k
    origin = Vector(anchor_world) - r * lx - u * ly
    o.matrix_world = Matrix(((r.x, u.x, n.x, origin.x), (r.y, u.y, n.y, origin.y), (r.z, u.z, n.z, origin.z), (0, 0, 0, 1)))
    o.hide_render = True
    return o


def build():
    root = bpy.data.collections.get('BAT') or kit.collection('BAT')
    coll = kit.collection('REF', root)
    img = bpy.data.images.get('batmobile-blueprint.jpeg') or bpy.data.images.load(IMG)
    fa = D.f(0.0)
    # side (left elevation): front to the right, seen from -X; the front tyre's leading edge at px 585, ground at px 258
    _empty('ref.side', coll, img, ((0, -1, 0), (0, 0, 1)), (585, 258), (2.4, -fa, 0.0), K_SIDE)
    # top: front to the right, the car's left up; centreline at px 521
    _empty('ref.top', coll, img, ((0, -1, 0), (1, 0, 0)), (585, 521), (0.0, -fa, -0.02), K_SIDE)
    # back: seen from behind (+Y), the car's left on the image's left; centre px 813, ground px 675
    _empty('ref.back', coll, img, ((-1, 0, 0), (0, 0, 1)), (813, 675), (0.0, -3.4, 0.0), K_BACK)
    coll.hide_render = True
    return coll
