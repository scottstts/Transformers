"""Repair the car's foot attachments while retaining the open scene's pacing.

Only the two heel-wing assemblies and the four foot carriers are re-keyed.
Ground clearance can then be refreshed as a common vertical translation;
all joint rotations, local limb motion and timeline pacing are retained.
"""
from types import SimpleNamespace
import bpy
from . import assemble, bake, carrier, choreo, fold, kit, mech, motion, rig


def _mechanism_time():
    """Recover T from the existing monotone pelvis track (lift-independent)."""
    control=bpy.data.objects['P.cockpitControls'].matrix_basis.translation
    u=max(0.0,min(1.0,-control.y/.18))
    if u < .99999:
        lo,hi=0.0,1.0
        for _ in range(30):
            mid=(lo+hi)*.5
            if mech.smooth(mid)<u: lo=mid
            else: hi=mid
        return .02+.10*(lo+hi)*.5 if u>1e-7 else 0.0
    K=motion._keys()
    times=[k[0] for k in K]
    values=[k[1][1] for k in K]
    f=-bpy.data.objects['bone.pelvis'].matrix_world.translation.y
    lo,hi=.05,1.0
    for _ in range(30):
        mid=(lo+hi)*.5
        i=max(j for j in range(len(K)-1) if times[j]<=mid)
        u=(mid-times[i])/(times[i+1]-times[i])
        if motion._track(times,values,i,u)<f: lo=mid
        else: hi=mid
    return (lo+hi)*.5


def foot_mounts():
    scn=bpy.context.scene
    frame=scn.frame_current
    skel=rig.Skeleton()
    folded=fold.world(skel)
    prog=assemble.program()
    names=('heelfin.L','heelfin.R')
    sc=SimpleNamespace(asm={})
    for name,d in prog.items():
        sc.asm[name]=SimpleNamespace(parts=d['parts'],node=bpy.data.objects['P.'+name])
    solved={}
    for name in names:
        d=prog[name]
        A0=folded[d['host']].inverted()
        points=[A0 @ bpy.data.objects[n].matrix_basis @ v.co
                for n in d['parts'] for v in bpy.data.objects[n].data.vertices]
        lo,hi=assemble.xfz_bounds(kit.Matrix.Identity(4),points)
        centre=kit.V(*[(a+b)*.5 for a,b in zip(lo,hi)])
        steps=mech.build_steps(d['specs'],lambda M,c=centre:M@c,
                               lambda M,p=points:assemble.xfz_bounds(M,p))
        solved[name]=(A0,steps,d['host'])
    struts=[s for s in carrier.expand(choreo.carriers()) if s.name.startswith(('heelArm.','wingArm.'))]
    carrier.snap_all(sc,struts)
    frames=list(range(bake.FRAMES+1))
    samples=[]
    for fr in frames:
        scn.frame_set(fr)
        T=_mechanism_time()
        if fr==0: T=0.0
        if fr==bake.FRAMES: T=1.0
        W={s.bone:bpy.data.objects['bone.'+s.bone].matrix_world.copy() for s in struts}
        N={s.target:bpy.data.objects['P.'+s.target].matrix_world.copy() for s in struts}
        local={}
        for name,(A0,steps,bone) in solved.items():
            local[name]=mech.displacement(steps,T)@A0
            N[name]=W[bone]@local[name]
        samples.append((T,W,N,local))
    for s in struts:
        s.n=4
        s.size([s.ends(W,N,T) for T,W,N,_ in samples])
    # Replace only carrier meshes; preserve their object identities/parents.
    scratch=bpy.data.collections.new('F1_CARRIER_REFRESH')
    scn.collection.children.link(scratch)
    try:
        for s in struts:
            fresh=s.build(scratch)
            old=[]
            for obj in fresh:
                # Newly built names have Blender's .001 suffix.
                name=obj.name.rsplit('.',1)[0]
                target=bpy.data.objects[name]
                previous=target.data
                target.data=obj.data
                if previous.users==0: bpy.data.meshes.remove(previous)
                old.append(target)
            s.objs=old
        keyed={obj:[] for s in struts for obj in s.objs}
        for T,W,N,_ in samples:
            for s in struts:
                for obj,M in s.pose(W,N,T).items(): keyed[obj].append(M)
        for name in names:
            bake._keys(bpy.data.objects['P.'+name],frames,[sample[3][name] for sample in samples])
        for obj,mats in keyed.items(): bake._keys(obj,frames,mats)
    finally:
        kit.clear_collection(scratch)
        bpy.data.collections.remove(scratch)
        scn.frame_set(frame)
    print('Re-seated heel wings and re-keyed four foot carriers at the existing timeline pacing.')


def ground_clearance():
    """Remove the obsolete lift caused by the rods formerly below the soles."""
    import numpy as np
    from bpy_extras import anim_utils
    scn=bpy.context.scene
    saved=scn.frame_current
    objects=[o for name in ('CAR','ROBOT') for o in bpy.data.collections[name].all_objects
             if o.type=='MESH' and not o.hide_render]
    points={o:bake.support_points(o) for o in objects}
    offsets=[]
    for fr in range(bake.FRAMES+1):
        scn.frame_set(fr)
        low=min(float((pts@np.array(o.matrix_world.to_3x3())[2,:]+o.matrix_world.translation.z).min())
                for o,pts in points.items() if len(pts))
        offsets.append(-low)
    # Bone descendants inherit the common root translation; the independent
    # carrier objects need that same translation to stay on their endpoints.
    roots=[bpy.data.objects['bone.pelvis']]+[o for o in objects if o.parent is None]
    for obj in roots:
        ad=obj.animation_data
        if not ad or not ad.action: continue
        cb=anim_utils.action_ensure_channelbag_for_slot(ad.action,ad.action_slot)
        fc=next(f for f in cb.fcurves if f.data_path=='location' and f.array_index==2)
        for key in fc.keyframe_points:
            index=int(round(key.co.x))
            if 0<=index<=bake.FRAMES: key.co.y+=offsets[index]
        fc.update()
    scn.frame_set(saved)
    print('Updated common ground clearance; final vertical correction %.4f m.' % offsets[-1])
