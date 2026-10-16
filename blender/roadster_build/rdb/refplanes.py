"""Registered reference images as Blender reference images (image empties) that
draw only in orthographic views, superimposed on the model at 50 % opacity:
the side frame in the Right view (Numpad 3) and the top view in the Top view
(Numpad 7). Collection 91_REFERENCE."""
import bpy
from mathutils import Euler
from . import kit as K, reference as R


def _empty(name, image_path, centre, rot, width_m, front=True):
    img = bpy.data.images.load(image_path, check_existing=True)
    o = bpy.data.objects.new(name, None)
    o.empty_display_type = 'IMAGE'
    o.data = img
    o.empty_display_size = width_m          # the image's longer side, in metres
    o.empty_image_offset = (-0.5, -0.5)
    o.location = centre
    o.rotation_euler = Euler(rot)
    o.use_empty_image_alpha = True
    o.color[3] = 0.5
    o.empty_image_depth = 'FRONT' if front else 'BACK'
    o.show_empty_image_orthographic = True
    o.show_empty_image_perspective = False
    o.show_empty_image_only_axis_aligned = True
    bpy.data.collections['91_REFERENCE'].objects.link(o)
    o[K.TAG] = True
    return o


def build():
    root = bpy.data.collections['ROADSTER']
    coll = K.collection('91_REFERENCE', root)
    for o in list(coll.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    R.ensure_side_ref()
    S, T = R.SIDE, R.TOP
    # side: image +u along +y, +v along +z, seen from +X
    cy = S['y'] + (S['w'] / 2 - S['px']) / S['ppm']
    cz = S['z'] + (S['py'] - S['h'] / 2) / S['ppm']
    _empty('ref.side', S['file'], (1.5, cy, cz), (1.5707963, 0, 1.5707963), S['w'] / S['ppm'])
    # top: image +u along +y, +v along -x, seen from +Z
    cy = T['y'] + (T['w'] / 2 - T['px']) / T['ppm']
    cx = T['x'] + (T['py'] - T['h'] / 2) / T['ppm']
    _empty('ref.top', T['file'], (-cx, cy, 1.6), (0, 0, 1.5707963), T['w'] / T['ppm'])
    return [o.name for o in coll.objects]
