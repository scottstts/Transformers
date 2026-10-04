"""Unwarped concept-panel comparisons and a native motion contact sheet."""
import bpy
import numpy as np
from . import kit as K,stage,review,reference as R,motion

REFERENCE='/Users/scott/Documents/Projects/Node/Transformers/ref_images/67_impala_transformer.png'
BOXES={'front':(0,0,627,627),'profile':(627,0,1254,627),'back':(0,627,627,1254)}
VIEWS={'front':((-3.4,-13.5,6.0),(0,-1.620,2.88),73),
       'profile':((12.5,-4.0,5.2),(0,-1.620,2.88),80),
       'back':((-4.0,11.5,5.9),(0,-1.620,2.88),73)}


def source_panels():
    source=bpy.data.images.load(REFERENCE,check_existing=True)
    w,h=source.size;pixels=np.empty(w*h*4,dtype=np.float32);source.pixels.foreach_get(pixels)
    pixels=pixels.reshape(h,w,4)
    for view,(x0,y0,x1,y1) in BOXES.items():
        data=pixels[h-y1:h-y0,x0:x1].copy()
        image=bpy.data.images.new('impala.concept.'+view,width=x1-x0,height=y1-y0,alpha=True)
        image.pixels.foreach_set(data.ravel())
        path=review.DIRECTORY+'robot_reference_'+view+'.png'
        # Original display pixels are preserved; no generative reconstruction.
        image.filepath_raw=path;K.enum_set(image,'file_format','PNG');image.save()
        bpy.data.images.remove(image)


def camera(view):
    name='review.robot.reference_'+view
    obj=bpy.data.objects.get(name)
    if obj is None:
        obj=bpy.data.objects.new(name,bpy.data.cameras.new(name));obj['impala_build']=True
        bpy.data.collections['90_REVIEW_STAGE'].objects.link(obj)
    eye,target,lens=VIEWS[view];stage.look(obj,eye,target);obj.data.lens=lens;obj.data.sensor_width=36
    K.enum_set(obj.data,'sensor_fit','HORIZONTAL');obj.data.clip_start=.04;obj.data.clip_end=100
    obj.data.background_images.clear();bg=obj.data.background_images.new()
    bg.image=bpy.data.images.load(review.DIRECTORY+'robot_reference_'+view+'.png',check_existing=True)
    return obj


def comparison(view,suffix='current'):
    source_panels();scene=bpy.context.scene;scene.frame_set(240)
    scene.camera=camera(view);scene.render.resolution_x=1000;scene.render.resolution_y=1000
    scene.render.resolution_percentage=100;scene.cycles.samples=32
    K.enum_set(scene.render.image_settings,'file_format','PNG')
    scene.render.filepath=review.DIRECTORY+'robot_'+view+'_'+suffix+'.png'
    old=scene.compositing_node_group;scene.compositing_node_group=None
    try:bpy.ops.render.render(write_still=True)
    finally:scene.compositing_node_group=old
    name='camera_robot_'+view;setattr(R,name,lambda:scene.camera)
    try:return review.contact_sheet('robot_'+view,suffix,1000)
    finally:delattr(R,name)


def motion_sheet(suffix='current',frames=(0,30,60,90,120,150,180,210,240)):
    original=bpy.context.scene;camera=bpy.data.objects['review.transition']
    stage.look(camera,(-5.8,-10.5,4.7),(0,-.25,2.4));camera.data.lens=44
    original.camera=camera;original.render.resolution_x=640;original.render.resolution_y=640
    original.render.resolution_percentage=100;original.cycles.samples=16
    old=original.compositing_node_group;original.compositing_node_group=None
    images=[]
    try:
        for frame in frames:
            original.frame_set(frame)
            original.render.filepath=review.DIRECTORY+'motion_'+suffix+'_'+str(frame)+'.png'
            bpy.ops.render.render(write_still=True)
            images.append(bpy.data.images.load(original.render.filepath,check_existing=False))
    finally:original.compositing_node_group=old
    width=1920;height=640*((len(images)+2)//3)
    canvas=bpy.data.images.new('impala.motion.canvas',width=width,height=height,alpha=True)
    canvas.generated_color=(.08,.08,.08,1)
    scene=bpy.data.scenes.new('impala.motion.contact');scene.camera=camera
    tree=bpy.data.node_groups.new('impala.motion.contact.compositor','CompositorNodeTree')
    tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor');scene.compositing_node_group=tree
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0
    K.enum_set(scene.render.image_settings,'file_format','PNG')
    scene.render.filepath=review.DIRECTORY+'motion_'+suffix+'_sheet.png'
    n=tree.nodes;l=tree.links;background=n.new('CompositorNodeImage');background.image=canvas;result=background.outputs[0]
    for i,img in enumerate(images):
        source=n.new('CompositorNodeImage');source.image=img
        move=n.new('CompositorNodeTranslate');move.inputs[1].default_value=(i%3-1)*640
        move.inputs[2].default_value=height/2-320-(i//3)*640;l.new(source.outputs[0],move.inputs[0])
        over=n.new('CompositorNodeAlphaOver');l.new(result,over.inputs[0]);l.new(move.outputs[0],over.inputs[1]);result=over.outputs[0]
    output=n.new('NodeGroupOutput');l.new(result,output.inputs[0]);path=scene.render.filepath
    try:bpy.ops.render.render(write_still=True,scene=scene.name)
    finally:
        bpy.data.scenes.remove(scene);bpy.data.node_groups.remove(tree);bpy.data.images.remove(canvas)
        for image in images:bpy.data.images.remove(image)
        bpy.context.window.scene=original
    return path
