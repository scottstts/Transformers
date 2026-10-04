"""Native Blender reference renders and unwarped comparison contact sheets."""
import bpy
from . import kit as K, reference as R

DIRECTORY='/Users/scott/Documents/Projects/Node/Transformers/blender/reviews/impala_reference_correction/'


def render(view,suffix='before',percentage=75):
    scene=bpy.context.scene
    camera=getattr(R,'camera_'+view)()
    photo=camera.data.background_images[0].image
    scene.camera=camera
    scene.render.resolution_x,scene.render.resolution_y=tuple(photo.size)
    scene.render.resolution_percentage=percentage
    scene.cycles.samples=32
    K.enum_set(scene.render.image_settings,'file_format','PNG')
    scene.render.filepath=DIRECTORY+view+'_'+suffix+'.png'
    old=scene.compositing_node_group
    scene.compositing_node_group=None
    try:bpy.ops.render.render(write_still=True)
    finally:scene.compositing_node_group=old
    return scene.render.filepath


def contact_sheet(view,suffix='before',width=1200):
    """Photo left, model right; uniform scale, no perspective/image deformation."""
    original=bpy.context.scene
    camera=getattr(R,'camera_'+view)()
    photo=camera.data.background_images[0].image
    model=bpy.data.images.load(DIRECTORY+view+'_'+suffix+'.png',check_existing=False)
    height=round(width*photo.size[1]/photo.size[0])
    canvas=bpy.data.images.new('impala.comparison.canvas',width=width*2,height=height,alpha=True)
    canvas.generated_color=(.15,.15,.15,1)
    scene=bpy.data.scenes.new('impala.comparison.scene')
    tree=bpy.data.node_groups.new('impala.reference.contact.sheet','CompositorNodeTree')
    tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    scene.compositing_node_group=tree
    scene.render.resolution_x,scene.render.resolution_y=width*2,height
    scene.render.resolution_percentage=100
    # The source photo and the saved model render already contain display color.
    # A Standard transform only performs the linear -> display conversion.
    scene.view_settings.view_transform='Standard'
    scene.view_settings.look='None'
    scene.view_settings.exposure=0
    scene.render.filepath=DIRECTORY+view+'_'+suffix+'_comparison.png'
    K.enum_set(scene.render.image_settings,'file_format','PNG')
    scene.camera=camera
    nodes=tree.nodes;links=tree.links
    background=nodes.new('CompositorNodeImage');background.image=canvas
    result=background.outputs[0]
    for source,offset in ((photo,-width/2),(model,width/2)):
        image=nodes.new('CompositorNodeImage');image.image=source
        scale=nodes.new('CompositorNodeScale')
        scale.inputs[2].default_value=width/source.size[0]
        scale.inputs[3].default_value=height/source.size[1]
        links.new(image.outputs[0],scale.inputs[0])
        move=nodes.new('CompositorNodeTranslate');move.inputs[1].default_value=offset
        links.new(scale.outputs[0],move.inputs[0])
        over=nodes.new('CompositorNodeAlphaOver')
        links.new(result,over.inputs[0]);links.new(move.outputs[0],over.inputs[1])
        result=over.outputs[0]
    output=nodes.new('NodeGroupOutput');links.new(result,output.inputs[0])
    path=scene.render.filepath
    try:bpy.ops.render.render(write_still=True,scene=scene.name)
    finally:
        bpy.data.scenes.remove(scene)
        bpy.data.node_groups.remove(tree)
        bpy.data.images.remove(canvas)
        bpy.data.images.remove(model)
        bpy.context.window.scene=original
    return path
