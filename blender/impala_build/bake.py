"""Bake the analytic deployment onto the live Blender timeline."""
import bpy
from bpy_extras import anim_utils
from . import kit as K,motion,attachments,linkage


def keys(obj,frames,matrices):
    K.enum_set(obj,'rotation_mode','QUATERNION');obj.animation_data_create()
    name='impala.deploy.'+obj.name
    action=bpy.data.actions.get(name) or bpy.data.actions.new(name)
    obj.animation_data.action=action
    slot=action.slots[0] if action.slots else action.slots.new(id_type='OBJECT',name=obj.name)
    obj.animation_data.action_slot=slot
    bag=anim_utils.action_ensure_channelbag_for_slot(action,slot)
    for fcurve in list(bag.fcurves):bag.fcurves.remove(fcurve)
    locations=[m.translation for m in matrices];rotations=[m.to_quaternion() for m in matrices]
    for i in range(1,len(rotations)):
        if rotations[i].dot(rotations[i-1])<0:rotations[i].negate()
    channels=[('location',3,locations),('rotation_quaternion',4,rotations)]
    scales=[m.to_scale() for m in matrices]
    if any(abs(v-1)>1e-6 for s in scales for v in s):channels.append(('scale',3,scales))
    for path,count,values in channels:
        for k in range(count):
            curve=bag.fcurves.new(path,index=k);curve.keyframe_points.add(len(frames))
            curve.keyframe_points.foreach_set('co',[v for i,f in enumerate(frames) for v in (f,values[i][k])])
            for key in curve.keyframe_points:K.enum_set(key,'interpolation','LINEAR')
            curve.update()


def build():
    attachments.definitions();frames=list(range(motion.FRAMES+1));all_matrices={}
    for frame in frames:
        local,_,_=motion.matrices(frame/motion.FRAMES)
        for name,matrix in local.items():all_matrices.setdefault(name,[]).append(matrix)
    for name,matrices in all_matrices.items():keys(K.NODES[name],frames,matrices)
    scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=motion.FRAMES;scene.render.fps=30
    scene.timeline_markers.clear()
    for label,frame in (('CAR',0),('FEET PLANT',68),('CHASSIS UNFOLD',112),('TORSO RISE',160),('ROBOT',240)):
        scene.timeline_markers.new(label,frame=frame)
    for action in list(bpy.data.actions):
        if action.name.startswith('impala.transform.') and action.users==0:bpy.data.actions.remove(action)
    scene.frame_set(0);motion.apply(0)
    return {'frames':len(frames),'rig_carriers':len(all_matrices),'duration_seconds':8,'scale_channels':0}
