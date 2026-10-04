"""Live MCP entry point; no exports until the user approves the Blender iteration."""
import bpy
from . import kit, car, stage


def car_stage():
    expected='/Users/scott/Documents/Projects/Node/Transformers/blender/impala.blend'
    if bpy.data.filepath!=expected:
        raise RuntimeError('The connected Blender file changed: '+bpy.data.filepath)
    kit.reset()
    bpy.context.scene.frame_set(0)
    bpy.context.scene.timeline_markers.clear()
    kit.materials()
    car.build()
    for name,a in car.ASSEMBLIES.items():
        kit.NODES[name].location=a['source']
    stage.build()
    stage.viewport('car')
    return {'car_meshes':len(kit.PARTS),'assemblies':len(car.ASSEMBLIES)}


def robot_stage():
    from . import robot,attachments,folds,linkage,stowage,bake
    bpy.context.scene.frame_set(0)
    core=robot.build();attachments.definitions();folds.build();braces=linkage.build()
    stowage.build();timeline=bake.build();stage.viewport('car')
    return {'core':core,'braces':braces,'timeline':timeline}


def refresh_car():
    """Rebuild owned car geometry in place, keeping the inspection environment."""
    expected='/Users/scott/Documents/Projects/Node/Transformers/blender/impala.blend'
    if bpy.data.filepath!=expected:raise RuntimeError('The connected Blender file changed')
    bpy.context.scene.frame_set(0)
    kit.NODES={o.name[5:]:o for o in bpy.data.objects if o.get('impala_build') and o.name.startswith('bone.')}
    for obj in list(bpy.data.objects):
        if not obj.get('impala_build') or not obj.name.startswith('car.'):continue
        data=obj.data
        bpy.data.objects.remove(obj,do_unlink=True)
        if data and data.users==0:
            if isinstance(data,bpy.types.Mesh):bpy.data.meshes.remove(data)
            elif isinstance(data,bpy.types.Curve):bpy.data.curves.remove(data)
    kit.PARTS=[o for o in bpy.data.objects if o.get('impala_build') and o.type in ('MESH','FONT','CURVE') and o.name.startswith('robot.')]
    kit.materials()
    car.build(reuse_nodes=True)
    return {'car_parts':sum(o.name.startswith('car.') for o in kit.PARTS),'rig_carriers':len(car.ASSEMBLIES)}


def bake_stage():
    from . import robot,robot_armour,storage,stowage,attachments,folds,linkage,bake
    robot.hydrate();attachments.definitions();folds.build();robot_armour.build();storage.build();linkage.build()
    stowage.build()
    return bake.build()


def refresh_cabin():
    """Replace only roof, glazing and cabin exterior fittings after crown edits."""
    from . import robot,cabin
    robot.hydrate();bpy.context.scene.frame_set(0)
    prefixes=('car.hardtop.','car.A.pillar.','car.windshield.','car.rear_screen.',
              'car.cowl.','car.front_door.vent.','car.front_door.mirror.',
              'car.passenger.fender.telescopic.antenna','car.front_door.rolled.',
              'car.rear_door.rolled.')
    for obj in list(kit.PARTS):
        if not (obj.name.startswith(prefixes) or obj.name.startswith(('car.front_door.','car.rear_door.')) and
                obj.name.endswith('.window.sill')):continue
        data=obj.data;kit.PARTS.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
        if data and data.users==0:bpy.data.meshes.remove(data)
    start=len(kit.PARTS);cabin.build();kit.finalize(kit.PARTS[start:])
    return {'new_cabin_exterior_parts':len(kit.PARTS)-start}
