"""Stage entry points."""
import bpy
from . import kit as K

BLEND = '/Users/scott/Documents/Projects/Node/Transformers/blender/roadster.blend'


def _check():
    if bpy.data.filepath != BLEND:
        raise RuntimeError('connected Blender file changed: ' + bpy.data.filepath)


def car_stage():
    from . import car, stage
    _check()
    bpy.context.scene.frame_set(0)
    K.reset()
    K.materials()
    stage.build()
    car.build()
    from . import refplanes
    refplanes.build()
    from . import aero
    aero.preview()
    return {'car_parts': len(K.PARTS)}


def arches(obj):
    """Cut the four wheel openings out of a body solid (cylinders on the axles)."""
    from . import body as B
    for name, (x, y, z, w) in B.WHEELS.items():
        sx = 1 if x > 0 else -1
        c = K.Mesh().cyl((sx * 0.45, y, z), (sx * 1.3, y, z), B.ARCH_R, 'satin', sides=96)
        cut = c.build('cutter', '90_REVIEW_STAGE', bevel=0)
        K.PARTS.remove(cut)
        mod = obj.modifiers.new('arch', 'BOOLEAN')
        mod.object = cut
        K.enum_set(mod, 'solver', 'MANIFOLD')
        K.enum_set(mod, 'material_mode', 'TRANSFER')
        obj.modifiers.move(len(obj.modifiers) - 1, 0)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cut, do_unlink=True)


def shell_stage():
    """Body shell, canopy and wheels only: for reference overlays."""
    from . import body as B, wheels, stage
    _check()
    bpy.context.scene.frame_set(0)
    K.reset()
    K.materials()
    stage.build()
    sh = B.shell_mesh().build('car.shell', '01_CAR', bevel=0, smooth_angle=20)
    arches(sh)
    B.canopy_mesh().build('car.canopy', '01_CAR', bevel=0, smooth_angle=20)
    wheels.build()
    return {'parts': len(K.PARTS)}
