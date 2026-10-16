"""Reference check for the head: orthographic renders of the head and neck
castings (rebuilt from the builders into a temporary collection, in rest
coordinates) at the exact pixel scale of each panel of the head/face/neck
sheet, for overlaying on the sheet. Scene settings are restored afterwards.

    from rdb import headref; headref.render('/path/to/dir')

writes front.png, back.png, side.png (627 x 627, transparent background) that
register pixel for pixel with these crops of the sheet:
    front  +0+0      back  +627+0      side  +0+627
"""
import math
import bpy
from mathutils import Vector, Euler
from . import kit as K, r_head
from .r_helmet import S, KS, Y0

VIEWS = {
    # name: (camera rotation (deg), offset from c to the view centre, ortho scale)
    'front': ((90, 0, 0), Vector(((313.5 - 312.5) * S, -3.0, (295 - 313.5) * S)), 627 * S),
    'back': ((90, 0, 180), Vector(((943.5 - 940.5) * S, 3.0, (295 - 313.5) * S)), 627 * S),
    'side': ((90, 0, 90), Vector((3.0, Y0 + (313.5 - 100) * KS, (876 - 940.5) * KS + .008)), 627 * KS),
}


def render(out_dir, views=('front', 'back', 'side')):
    sc = bpy.context.scene
    K.MATERIALS.update({m.name[9:]: m for m in bpy.data.materials if m.name.startswith('roadster.')})
    coll = bpy.data.collections.new('headref.tmp')
    sc.collection.children.link(coll)
    meshes = list(r_head.build_meshes().values()) + [r_head.neck_meshes()]
    objs = []
    for i, m in enumerate(meshes):
        o = m.build('headref.%d' % i, '02_ROBOT', bevel=0, smooth_angle=20)
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        objs.append(o)
    K.PARTS.clear()
    cam_data = bpy.data.cameras.new('headref.cam')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('headref.cam', cam_data)
    coll.objects.link(cam)
    r = sc.render
    saved = dict(camera=sc.camera, engine=r.engine, rx=r.resolution_x, ry=r.resolution_y,
                 pct=r.resolution_percentage, transparent=r.film_transparent, path=r.filepath,
                 fmt=r.image_settings.file_format, mode=r.image_settings.color_mode,
                 light=sc.display.shading.light, color=sc.display.shading.color_type)
    hidden = {o: o.hide_render for o in sc.objects if o not in objs and o is not cam}
    try:
        for o in hidden:
            o.hide_render = True
        sc.camera = cam
        r.engine = 'BLENDER_WORKBENCH'          # the enum under-reports engines; assign directly
        r.resolution_x = r.resolution_y = 627
        r.resolution_percentage = 100
        r.film_transparent = True
        K.enum_set(r.image_settings, 'file_format', 'PNG')
        K.enum_set(r.image_settings, 'color_mode', 'RGBA')
        K.enum_set(sc.display.shading, 'light', 'STUDIO')
        K.enum_set(sc.display.shading, 'color_type', 'MATERIAL')
        c = r_head.centre()
        for name in views:
            rot, off, scale = VIEWS[name]
            cam.rotation_euler = Euler([math.radians(a) for a in rot])
            cam.location = c + off
            cam_data.ortho_scale = scale
            cam_data.clip_end = 10
            r.filepath = '%s/%s.png' % (out_dir, name)
            bpy.ops.render.render(write_still=True)
    finally:
        for o, h in hidden.items():
            o.hide_render = h
        sc.camera = saved['camera']
        r.engine = saved['engine']
        r.resolution_x, r.resolution_y = saved['rx'], saved['ry']
        r.resolution_percentage = saved['pct']
        r.film_transparent = saved['transparent']
        r.filepath = saved['path']
        r.image_settings.file_format = saved['fmt']
        r.image_settings.color_mode = saved['mode']
        sc.display.shading.light = saved['light']
        sc.display.shading.color_type = saved['color']
        for o in objs:
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.meshes.remove(me)
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.cameras.remove(cam_data)
        bpy.data.collections.remove(coll)
    return list(views)
