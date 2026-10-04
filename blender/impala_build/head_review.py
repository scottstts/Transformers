"""Native head renders against the unchanged reference crops, with fixed views."""
import bpy
from mathutils import Matrix,Vector
from . import kit as K,stage,review

VIEWS={
    'front':((-.315,-1.440,.470),438,522,74),
    'profile':((1.420,-.540,.470),432,552,74),
    'crouch':((-.170,-1.440,.900),510,618,74),
}


def render(view,suffix='authored'):
    scene=bpy.context.scene;eye,w,h,lens=VIEWS[view]
    bpy.context.view_layer.update()
    frame=K.NODES['robot.head'].matrix_world.copy()
    camera_name='review.head_'+view
    camera=bpy.data.objects.get(camera_name)
    if camera is None:
        camera=bpy.data.objects.new(camera_name,bpy.data.cameras.new(camera_name))
        bpy.data.collections['90_REVIEW_STAGE'].objects.link(camera);camera['impala_build']=True
    stage.look(camera,frame@Vector(eye),frame@Vector((0,0,.315)))
    camera.data.lens=lens;camera.data.clip_start=.025;camera.data.clip_end=100
    K.enum_set(camera.data,'sensor_fit','HORIZONTAL');camera.data.sensor_width=36
    scene.camera=camera;scene.render.resolution_x=w;scene.render.resolution_y=h
    scene.render.resolution_percentage=100;scene.cycles.samples=48
    K.enum_set(scene.render.image_settings,'file_format','PNG')
    scene.render.filepath=review.DIRECTORY+'head_'+view+'_'+suffix+'.png'
    compositor=scene.compositing_node_group;scene.compositing_node_group=None
    try:
        bpy.context.view_layer.update();bpy.ops.render.render(write_still=True)
    finally:
        scene.compositing_node_group=compositor;bpy.context.view_layer.update()
    return scene.render.filepath


def comparison(view,suffix='authored'):
    # Reuse the reference-contact compositor with a fixed head crop camera.
    from . import reference as R
    name='camera_head_'+view
    camera=bpy.data.objects['review.head_'+view]
    camera.data.background_images.clear()
    bg=camera.data.background_images.new()
    bg.image=bpy.data.images.load(review.DIRECTORY+'head_reference_'+view+'.png',check_existing=True)
    setattr(R,name,lambda:camera)
    try:return review.contact_sheet('head_'+view,suffix,600)
    finally:delattr(R,name)


def store_in_car():
    """Rigid helmet lies face-down under the hood until its hatch has opened."""
    neck=K.NODES['robot.neck'];head=K.NODES['robot.head']
    matrix=K.transform((0,-1.200,.690),K.rotation(x=90))
    neck.matrix_basis=neck.parent.matrix_world.inverted()@matrix@Matrix.Translation((0,0,-.160))
    head.matrix_basis=Matrix.Translation((0,0,.160))
    bpy.context.view_layer.update()
