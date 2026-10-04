"""Neutral Blender inspection lighting and fixed reference comparison cameras."""
import math
import bpy
from mathutils import Vector
from . import kit as K


def look(o,eye,target):
    o.location=eye
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()


def build():
    sc=bpy.context.scene
    engines={cls.bl_rna.identifier for cls in bpy.types.RenderEngine.__subclasses__() if hasattr(cls,'bl_rna')}
    sc.render.engine='CYCLES' if 'CYCLES' in engines else 'BLENDER_EEVEE'
    if sc.render.engine=='CYCLES':
        K.enum_set(sc.cycles,'device','CPU')
        sc.cycles.samples=48
        sc.cycles.use_denoising=True
    sc.render.resolution_x,sc.render.resolution_y=1400,950
    sc.render.resolution_percentage=100
    # Contextual enum confirmed by the running OCIO configuration's setter.
    sc.view_settings.look='None'
    sc.view_settings.exposure=-.45
    if hasattr(sc,'eevee'):
        if hasattr(sc.eevee,'taa_render_samples'): sc.eevee.taa_render_samples=64
        sc.eevee.use_raytracing=True
    world=bpy.data.worlds.get('impala.studio') or bpy.data.worlds.new('impala.studio')
    world.use_nodes=True
    bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.65,.65,.65,1)
    bg.inputs['Strength'].default_value=.22
    sc.world=world
    m=K.Mesh()
    m.add([(-60,-60,-.008),(60,-60,-.008),(60,60,-.008),(-60,60,-.008)],[(0,1,2,3)],'floor')
    m.build('review.ground','90_REVIEW_STAGE',bevel=0)
    for name,eye,power,size,col in [
            ('key',(3,-4,6),1700,5.0,(1,.97,.94)),
            ('fill',(-4,-2,3),1200,5.0,(.92,.95,1)),
            ('rim',(2,5,6),2100,4.0,(1,1,1)),
            ('strip',(-3,3,3),700,3.0,(1,1,1)),
            ('under',(0,1,-3),350,3.0,(1,1,1))]:
        ld=bpy.data.lights.new('review.'+name,'AREA')
        ld.energy=power
        ld.size=size
        ld.color=col
        o=bpy.data.objects.new('review.'+name,ld)
        o['impala_build']=True
        bpy.data.collections['90_REVIEW_STAGE'].objects.link(o)
        look(o,eye,(0,.4,2.3))
    for name,eye,target,lens in [
            ('car',(6.6,-8.5,3.3),(0,-.1,.78),58),
            ('car_front',(0,-8.0,1.65),(0,-.2,.78),53),
            ('car_rear',(0,8,1.90),(0,.3,.86),55),
            ('car_side',(10,0,1.36),(0,0,.80),55),
            ('car_opposite',(-6.6,8.5,3.3),(0,.1,.78),58),
            ('car_top',(0,0,9.5),(0,0,0),52),
            ('car_bottom',(0,0,-8),(0,0,.6),52),
            ('badge',(-.62,4.0,1.05),(-.652,2.70,.802),105),
            ('headlamp',(1.25,-4.6,1.02),(.66,-2.55,.738),100),
            ('front_corner',(3.2,-4.6,1.45),(.73,-1.94,.76),70),
            ('wheel_detail',(2.4,-2.25,.70),(.84,-1.61,.362),90),
            ('rear_shoulder',(3.4,4.7,1.65),(.75,1.25,.88),70),
            ('robot',(8,-11,6.7),(0,.5,2.8),52),
            ('robot_front',(0,-13,3.0),(0,.5,2.8),52),
            ('robot_back',(-8,11,6.4),(0,.6,2.8),52),
            ('transition',(8,-11,6.0),(0,.10,2.1),47)]:
        cd=bpy.data.cameras.new('review.'+name)
        cd.lens=lens
        cd.clip_start=.04
        cd.clip_end=180
        if name in ('car_side','car_top','car_bottom'):
            K.enum_set(cd,'type','ORTHO')
            cd.ortho_scale=6.55
        o=bpy.data.objects.new('review.'+name,cd)
        o['impala_build']=True
        bpy.data.collections['90_REVIEW_STAGE'].objects.link(o)
        look(o,eye,target)
        if name in ('car_top','car_bottom'): o.rotation_euler.rotate_axis('Z',math.pi/2)
    sc.camera=bpy.data.objects['review.car']
    return sc


def viewport(kind='robot'):
    cam=bpy.data.objects['review.'+kind]
    target=Vector((0,0,2.8 if kind.startswith('robot') else .78))
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                K.enum_set(space.shading,'type','MATERIAL')
                space.shading.use_scene_world=False
                space.shading.use_scene_lights=False
                space.overlay.show_overlays=False
                space.clip_end=180
                r=space.region_3d
                r.view_rotation=cam.rotation_euler.to_quaternion()
                r.view_location=target
                r.view_distance=9.5 if kind.startswith('robot') else 5.7
                K.enum_set(r,'view_perspective','PERSP')


def render(path,kind='robot',frame=240):
    sc=bpy.context.scene
    sc.frame_set(frame)
    sc.camera=bpy.data.objects['review.'+kind]
    K.enum_set(sc.render.image_settings,'file_format','PNG')
    sc.render.filepath=path
    ground=bpy.data.objects['review.ground']
    old=ground.hide_render
    try:
        if kind=='car_bottom': ground.hide_render=True
        bpy.ops.render.render(write_still=True)
    finally: ground.hide_render=old
    return path
