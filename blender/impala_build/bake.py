"""Bake the analytic deployment onto the live Blender timeline."""
import bpy
import math
from mathutils import Vector
from bpy_extras import anim_utils
from . import kit as K,motion,attachments,linkage


def pace():
    """Spread visible shell and limb travel evenly over the full duration.

    Measure the existing pose path, then change only its shared clock. This
    retains the grounded choreography, contacts and every endpoint pose.
    Refit on each bake so subsequent geometry edits retain balanced timing.
    """
    names=['car.hood.front.stamped.skin','car.hood.rear.stamped.skin',
           'car.rear.sculpted.tail.panel','car.trunk.lid.fixed','car.trunk.lid.folded',
           'robot.head.helmet.crowned.cast.shell']
    names.extend(o.name for o in K.PARTS if o.name.startswith('car.hardtop.compound.crown.'))
    for side in ('L','R'):
        names.extend('car.'+part+'.'+side+'.'+suffix
                     for part in ('front_fender','front_door','rear_door','rear_fender')
                     for suffix in ('fixed','folded'))
        names.extend(('robot.arm.'+side+'.front.apertured.load.web',
                      'robot.forearm.'+side+'.inner.formed.gauntlet',
                      'robot.shin.'+side+'.inner.formed.greave',
                      'robot.thigh.'+side+'.formed.front.cuirass',
                      'robot.boot.'+side+'.formed.toe.cap',
                      'robot.armour.'+side+'.hip.outer.curved.skirt'))
    reverse={obj.name:key for key,obj in K.NODES.items()}
    samples=[]
    for name in names:
        obj=bpy.data.objects.get(name)
        if obj is not None:
            samples.extend((reverse[obj.parent.name],obj.matrix_basis@Vector(p)) for p in obj.bound_box)
    samples.extend(('robot.hand.'+side,Vector((0,0,-.200))) for side in ('L','R'))
    parents={key:reverse.get(obj.parent.name) if obj.parent else None for key,obj in K.NODES.items()}
    bases={key:obj.matrix_basis.copy() for key,obj in K.NODES.items()}
    def positions(t):
        local=motion.matrices(t,retime=False)[0];cache={}
        def world(name):
            if name not in cache:
                mat=local.get(name,bases[name]);parent=parents[name]
                cache[name]=world(parent)@mat if parent else mat
            return cache[name]
        return [world(name)@p for name,p in samples]
    count=640;previous=positions(0);travel=[]
    for i in range(1,count+1):
        current=positions(i/count)
        travel.append(math.sqrt(sum((b-a).length_squared for a,b in zip(previous,current))/len(samples)))
        previous=current
    # A small floor keeps the inverse clock finite through nearly still poses.
    floor=max(sum(travel)/count*.035,1e-9);cumulative=[0.0]
    for distance in travel:cumulative.append(cumulative[-1]+max(distance,floor))
    motion.set_pacing([(cumulative[i]/cumulative[-1],i/count) for i in range(0,count+1,8)])


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
    attachments.definitions();pace()
    frames=list(range(motion.FRAMES+1));all_matrices={}
    for frame in frames:
        local,_,_=motion.matrices(frame/motion.FRAMES)
        for name,matrix in local.items():all_matrices.setdefault(name,[]).append(matrix)
    for name,matrices in all_matrices.items():keys(K.NODES[name],frames,matrices)
    scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=motion.FRAMES;scene.render.fps=30
    scene.timeline_markers.clear()
    for label,frame in (('CAR',0),('FEET PLANT',68),('CHASSIS UNFOLD',112),('TORSO RISE',160),('ROBOT',240)):
        scene.timeline_markers.new(label,frame=round(motion.timeline_time(frame/motion.FRAMES)*motion.FRAMES))
    for action in list(bpy.data.actions):
        if action.name.startswith('impala.transform.') and action.users==0:bpy.data.actions.remove(action)
    scene.frame_set(0);motion.apply(0)
    return {'frames':len(frames),'rig_carriers':len(all_matrices),'duration_seconds':8,'scale_channels':0}
