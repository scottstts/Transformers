"""Cutlass reference views and a separate native authoring scene, without game export."""
import bpy
from mathutils import Matrix,Vector
from . import kit as K,stage,review,reference as R

PATH='/Users/scott/Documents/Projects/Node/Transformers/blender/impala-cutlass.blend'
PHOTO='/Users/scott/Documents/Projects/Node/Transformers/ref_images/67_impala_weapon_cutlass.jpg'


def scene():
    original=bpy.context.scene;scene=bpy.data.scenes.new('IMPALA CUTLASS')
    scene.render.engine=original.render.engine;scene.cycles.samples=48;scene.cycles.use_denoising=True
    scene.view_settings.view_transform=original.view_settings.view_transform
    scene.view_settings.look=original.view_settings.look;scene.view_settings.exposure=original.view_settings.exposure
    world=bpy.data.worlds.new('cutlass.reference.white');world.use_nodes=True
    background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    background.inputs['Color'].default_value=(1,1,1,1);background.inputs['Strength'].default_value=.60
    scene.world=world
    collection=bpy.data.collections.new('CUTLASS');scene.collection.children.link(collection)
    root=bpy.data.objects.new('cutlass',None);collection.objects.link(root)
    root['weapon_frame']='grip axis +Z; blade +Z; cutting edge -X; forged broad faces +/-Y'
    root['grip_center_m']=(0,0,-.180);root['authoring_length_m']=2.274
    for obj in K.PARTS:
        if not obj.name.startswith('weapon.cutlass.'):continue
        clone=obj.copy();clone.animation_data_clear();clone.parent=root
        clone.matrix_parent_inverse=Matrix.Identity(4);clone.matrix_basis=obj.matrix_basis.copy()
        collection.objects.link(clone)
    camera=bpy.data.objects.new('cutlass.review.camera',bpy.data.cameras.new('cutlass.review.camera'))
    scene.collection.objects.link(camera);scene.camera=camera
    camera.data.clip_start=.025;camera.data.clip_end=100
    for name,eye,power,size in (('key',(-2,-3,4),750,3),('rim',(2,1,3),900,2),('fill',(2,-2,.1),400,2)):
        light=bpy.data.objects.new('cutlass.review.'+name,bpy.data.lights.new('cutlass.review.'+name,'AREA'))
        scene.collection.objects.link(light);light.data.energy=power;light.data.size=size;stage.look(light,eye,(0,0,.6))
    return scene,root


def discard(scene):
    objects=list(scene.objects);world=scene.world
    collections=list(scene.collection.children)
    bpy.data.scenes.remove(scene)
    for obj in objects:
        data=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
        if data and data.users==0:
            if isinstance(data,bpy.types.Camera):bpy.data.cameras.remove(data)
            elif isinstance(data,bpy.types.Light):bpy.data.lights.remove(data)
    for collection in collections:
        if collection.users==0:bpy.data.collections.remove(collection)
    if world.users==0:bpy.data.worlds.remove(world)


def comparison(suffix='current'):
    original=bpy.context.scene;temporary,root=scene();camera=temporary.camera
    K.enum_set(root,'rotation_mode','QUATERNION');root.rotation_quaternion=K.rotation(y=135)
    points=[root.rotation_quaternion@v.co for obj in temporary.objects if obj.type=='MESH' for v in obj.data.vertices]
    lo=Vector(tuple(min(p[k] for p in points) for k in range(3)))
    hi=Vector(tuple(max(p[k] for p in points) for k in range(3)))
    center=(lo+hi)/2;center.y=0
    stage.look(camera,center+Vector((0,4,0)),center)
    K.enum_set(camera.data,'type','ORTHO');camera.data.ortho_scale=max(hi.x-lo.x,hi.z-lo.z)/.98
    photo=bpy.data.images.load(PHOTO,check_existing=True)
    camera.data.background_images.new().image=photo
    temporary.render.resolution_x=850;temporary.render.resolution_y=850;temporary.render.resolution_percentage=100
    K.enum_set(temporary.render.image_settings,'file_format','PNG')
    temporary.render.filepath=review.DIRECTORY+'weapon_'+suffix+'.png'
    try:
        bpy.ops.render.render(write_still=True,scene=temporary.name)
        R.camera_weapon=lambda:camera
        return review.contact_sheet('weapon',suffix,850)
    finally:
        if hasattr(R,'camera_weapon'):delattr(R,'camera_weapon')
        bpy.context.window.scene=original;discard(temporary)


def save_authoring():
    original=bpy.context.scene;temporary,root=scene();camera=temporary.camera
    stage.look(camera,(2.6,-4.2,2.0),(0,0,.78));camera.data.lens=58
    temporary.render.resolution_x=1000;temporary.render.resolution_y=1000;temporary.render.resolution_percentage=100
    # This native authoring file contains the same mesh data and materials.
    try:bpy.data.libraries.write(PATH,{temporary},path_remap='RELATIVE',fake_user=True,compress=True)
    finally:bpy.context.window.scene=original;discard(temporary)
    return PATH


def grip(suffix='current'):
    original=bpy.context.scene;original.frame_set(240)
    hand=K.NODES['robot.hand.L'].matrix_world;target=hand@Vector((0,.040,-.280))
    camera=bpy.data.objects.get('review.left.hand.grip')
    if camera is None:
        camera=bpy.data.objects.new('review.left.hand.grip',bpy.data.cameras.new('review.left.hand.grip'))
        bpy.data.collections['90_REVIEW_STAGE'].objects.link(camera);camera['impala_build']=True
    stage.look(camera,hand@Vector((.19,-1.25,.020)),target)
    camera.data.lens=82;camera.data.clip_start=.025;camera.data.clip_end=100;original.camera=camera
    original.render.resolution_x=900;original.render.resolution_y=900;original.render.resolution_percentage=100
    original.cycles.samples=48;K.enum_set(original.render.image_settings,'file_format','PNG')
    original.render.filepath=review.DIRECTORY+'left_hand_grip_'+suffix+'.png'
    compositor=original.compositing_node_group;original.compositing_node_group=None
    try:bpy.ops.render.render(write_still=True)
    finally:original.compositing_node_group=compositor
    return original.render.filepath
