"""Lookdev stage and review renders (desert daylight, neutral ground)."""
import math
import os
import bpy
from mathutils import Vector

RENDER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'renders', 'ferrari-f1'))


def setup_stage():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.fps = 30
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    ee = sc.eevee
    for attr, val in (('use_shadows', True), ('use_raytracing', True), ('shadow_ray_count', 2)):
        if hasattr(ee, attr):
            setattr(ee, attr, val)

    world = bpy.data.worlds.get('f1.world') or bpy.data.worlds.new('f1.world')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    sky = nt.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'MULTIPLE_SCATTERING'
    except TypeError:
        pass
    try:
        sky.sun_elevation = math.radians(38)
        sky.sun_rotation = math.radians(215)
    except AttributeError:
        pass
    bg.inputs['Strength'].default_value = 0.22
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

    coll = bpy.data.collections.get('STAGE')
    if coll is None:
        coll = bpy.data.collections.new('STAGE')
        sc.collection.children.link(coll)
    sun = bpy.data.objects.get('f1.sun')
    if sun is None:
        ld = bpy.data.lights.new('f1.sun', 'SUN')
        sun = bpy.data.objects.new('f1.sun', ld)
        coll.objects.link(sun)
    sun.data.energy = 4.2
    sun.data.angle = math.radians(1.2)
    sun.data.color = (1.0, 0.95, 0.88)
    sun.rotation_euler = (math.radians(52), 0, math.radians(215))

    fill = bpy.data.objects.get('f1.fill')
    if fill is None:
        ld = bpy.data.lights.new('f1.fill', 'AREA')
        fill = bpy.data.objects.new('f1.fill', ld)
        coll.objects.link(fill)
    fill.data.energy = 900
    fill.data.size = 12
    fill.data.color = (0.85, 0.9, 1.0)
    fill.location = (-9, 6, 9)
    fill.rotation_euler = (math.radians(50), 0, math.radians(-125))

    ground = bpy.data.objects.get('f1.ground')
    if ground is None:
        me = bpy.data.meshes.new('f1.ground')
        s = 60
        me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
        ground = bpy.data.objects.new('f1.ground', me)
        coll.objects.link(ground)
        m = bpy.data.materials.new('f1.sand')
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (0.42, 0.30, 0.19, 1)
        b.inputs['Roughness'].default_value = 0.92
        me.materials.append(m)
    return sc


def camera(name='f1.cam'):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cd = bpy.data.cameras.new(name)
        cam = bpy.data.objects.new(name, cd)
        bpy.data.collections['STAGE'].objects.link(cam)
    return cam


def look_at(cam, eye, target, lens=50):
    cam.location = Vector(eye)
    d = Vector(target) - Vector(eye)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    cam.data.clip_start = 0.05
    cam.data.clip_end = 400


def render(name, eye, target, lens=50, res=(1280, 720), frame=None, hide=()):
    sc = bpy.context.scene
    cam = camera()
    look_at(cam, eye, target, lens)
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    if frame is not None:
        sc.frame_set(frame)
    hidden = []
    for n in hide:
        c = bpy.data.collections.get(n)
        if c and not c.hide_render:
            c.hide_render = True
            hidden.append(c)
    os.makedirs(RENDER_DIR, exist_ok=True)
    path = os.path.join(RENDER_DIR, name + '.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for c in hidden:
        c.hide_render = False
    return path


CAR_VIEWS = {
    '3q': ((5.6, -6.2, 2.6), (0, 0.15, 0.35), 38),
    'side': ((9.2, 0.25, 0.55), (0, 0.25, 0.42), 38),
    'front': ((0.0, -9.0, 1.2), (0, 0.0, 0.40), 34),
    'rear3q': ((-5.0, 6.8, 2.6), (0, -0.5, 0.40), 38),
    'top': ((0.0, 0.25, 11.5), (0, 0.25, 0.0), 38),
    'low': ((3.4, -4.2, 0.35), (0, 0.4, 0.35), 34),
}


def car_views(tag, views=None, res=(1400, 800)):
    out = []
    for k in (views or CAR_VIEWS):
        eye, target, lens = CAR_VIEWS[k]
        out.append(render('%s_%s' % (tag, k), eye, target, lens, res=res))
    return out
