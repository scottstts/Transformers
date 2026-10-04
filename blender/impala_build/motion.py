"""Grounded jackknife deployment with fixed limb lengths and a rigid helmet."""
import math
import bpy
from mathutils import Matrix,Vector,Quaternion
from . import kit as K,rig,attachments as A

FRAMES=240


def smooth(t,a,b):
    u=max(0,min(1,(t-a)/(b-a)))
    return u*u*u*(10+u*(-15+6*u))


def track(t,keys):
    for (a,p),(b,q) in zip(keys,keys[1:]):
        if t<=b:return Vector(p).lerp(Vector(q),smooth(t,a,b))
    return Vector(keys[-1][1])


def orientation(direction,pole):
    z=-direction.normalized()
    x=pole.cross(direction).normalized()
    if x.length<.5:x=Vector((1,0,0))
    y=z.cross(x).normalized();x=y.cross(z).normalized()
    return Matrix(((x.x,y.x,z.x),(x.y,y.y,z.y),(x.z,y.z,z.z))).to_quaternion()


def leg(hip,ankle,pole):
    delta=ankle-hip;distance=delta.length
    distance=max(.02,min(rig.THIGH+rig.SHIN-.0001,distance))
    direction=delta.normalized()
    bend=pole-direction*direction.dot(pole);bend.normalize()
    along=(rig.THIGH**2-rig.SHIN**2+distance**2)/(2*distance)
    height=math.sqrt(max(0,rig.THIGH**2-along**2))
    knee=hip+direction*along+bend*height
    return knee,orientation(knee-hip,bend),orientation(ankle-knee,bend)


def core_worlds(t):
    pelvis=track(t,[(0,(0,.800,.585)),(.12,(0,.800,.585)),(.25,(0,.720,.880)),
                   (.43,(0,.350,1.360)),(.62,(0,-.550,2.120)),(.82,(0,-1.440,2.790)),(1,(0,-1.620,2.870))])
    q=K.rotation(x=90*(1-smooth(t,.15,.91)))
    pose={'pelvis':(q,pelvis-Vector((0,rig.ROBOT_Y,rig.HIP_Z))),
          'neck':(Quaternion(),Vector((0,0,-.300*(1-smooth(t,.30,.85))))) }
    for side,s in (('L',1),('R',-1)):
        pose['shoulder.'+side]=(Quaternion(),Vector((-s*.550*(1-smooth(t,.06,.64)),0,0)))
        pose['upperarm.'+side]=(K.rotation(y=-s*14*smooth(t,.30,.92)),Vector())
        # The elbow is a forward hinge: a descending -Z limb swings into -Y
        # under NEGATIVE X rotation. Never pass through backward extension.
        pose['forearm.'+side]=(K.rotation(x=-158*(1-smooth(t,.24,.87))-22*smooth(t,.74,1))@K.rotation(z=s*32*smooth(t,.65,1)),Vector())
        pose['hand.'+side]=(K.rotation(z=s*23*smooth(t,.75,1)),Vector())
        for name in rig.FINGERS:
            for j in range(1,4):
                angle=(32,66,52)[j-1]+rig.FINGERS.index(name)*2
                pose[name+str(j)+'.'+side]=(K.rotation(x=70+(angle-70)*smooth(t,.71,.97)),Vector())
        for j in range(1,4):
            u=smooth(t,.73,1)
            pose['thumb'+str(j)+'.'+side]=(K.rotation(x=(38,48,36)[j-1],
                                                    y=s*(38+12*u) if j==1 else 0,z=-s*25 if j==1 else 0),Vector())
        pose['toe.'+side]=(K.rotation(x=-105*(1-smooth(t,.08,.26))),Vector())
    worlds=rig.worlds(pose)
    outward=smooth(t,.07,.28);forward=smooth(t,.26,.62)
    for side,s in (('L',1),('R',-1)):
        hip=worlds['hip.'+side].translation
        ankle=Vector((s*(.560+.380*smooth(t,.08,.27)),
                      -1.780+.120*smooth(t,.10,.26),.690-.264*smooth(t,.08,.28)))
        pole=Vector((0,0,-1)).lerp(Vector((s,0,.18)),outward).lerp(Vector((0,-1,.12)),forward)
        knee,thigh_q,shin_q=leg(hip,ankle,pole)
        worlds['thigh.'+side]=K.transform(hip,thigh_q)
        worlds['shin.'+side]=K.transform(knee,shin_q)
        worlds['foot.'+side]=K.transform(ankle)
        worlds['toe.'+side]=worlds['foot.'+side]@K.transform((0,-.220,-.290),pose['toe.'+side][0])
    return worlds


def mix(a,b,u):
    p=a.translation.lerp(b.translation,u)
    q=a.to_quaternion().slerp(b.to_quaternion(),u)
    return K.transform(p,q)


def assembly_worlds(t,worlds=None):
    worlds=worlds or core_worlds(t);initial=core_worlds(0);out={}
    for name,spec in A.SPECS.items():
        bone=spec['bone'];a,b=spec['span']
        rest=initial[bone].inverted()@(Matrix.Translation((0,0,-.410)) if name.startswith('window.') else Matrix.Identity(4))
        # Interpolate at the actual panel mount, never at the object origin.
        # A distant origin traces an artificial arc through the floor when
        # long stampings rotate. The shared physical mount carries the fold.
        u=smooth(t,a,b);source=Vector(spec['source'])
        pivot=(rest@source).lerp(Vector(spec['target']),u)
        q=rest.to_quaternion().slerp(spec['rotation'],u)
        relative=K.transform(pivot,q)@Matrix.Translation(-source)
        out[name]=worlds[bone]@relative
    for side,s in (('L',1),('R',-1)):
        # Open the front axle track while the tyres still carry the chassis.
        # Neither wheel leaves the floor before both mechanical feet plant.
        grounded=Matrix.Translation((s*.350*smooth(t,.035,.17),0,0))
        deploy=smooth(t,.28,.72)
        family='front_fender.'+side
        out[family]=mix(grounded,out[family],deploy)
        out[family].translation.z+=.270*math.sin(math.pi*deploy)
        # The wheel/fender carriage first clears the shin outboard, then
        # rotates onto its final bracket after the greave has unfolded.
        out[family].translation.x+=s*.460*math.sin(math.pi*deploy)
        out['wheel.front.'+side]=out[family].copy()
        spec=A.SPECS['axle.front.'+side];source=Vector(spec['source'])
        pivot=out[family]@source
        folded=worlds['shin.'+side].to_quaternion()@spec['rotation']
        q=out[family].to_quaternion().slerp(folded,smooth(t,.32,.74))
        out['axle.front.'+side]=K.transform(pivot,q)@Matrix.Translation(-source)
    # The two hood stamps meet on the same physical hinge in the final fold.
    # Its full-size rear portion rotates down behind the front stamping.
    h=A.SPECS['hood.front'];front=out['hood.front']
    hinge=Vector((0,-1.795,.0));from . import contract as D
    hinge.z=D.hood_height(0,-1.795)
    target=front@hinge
    q=front.to_quaternion()@K.rotation(x=-95*smooth(t,.19,.74))
    rear=K.transform(target,q)@Matrix.Translation(-hinge)
    out['hood.rear']=rear
    from . import folds
    if folds.SPECS:out.update(folds.worlds(t,worlds,out))
    return out


def matrices(t):
    if not A.SPECS:A.definitions()
    core=core_worlds(t);panels=assembly_worlds(t,core)
    out={}
    for name,parent,offset in rig.definitions():
        out['robot.'+name]=core[parent].inverted()@core[name] if parent else core[name]
    for name,matrix in panels.items():out[name]=matrix
    from . import robot_armour
    if robot_armour.DEPLOYS:out.update(robot_armour.worlds(t,core))
    from . import storage
    if storage.SPECS:out.update(storage.worlds(t,core))
    from . import linkage
    if linkage.LINKS:out.update(linkage.worlds(t,core,panels))
    from . import stowage
    if stowage.SPECS:out.update(stowage.worlds(t))
    return out,core,panels


def apply(t):
    local,core,panels=matrices(t)
    for name,matrix in local.items():
        obj=K.NODES[name];obj.matrix_basis=matrix;obj.scale=(1,1,1)
    bpy.context.view_layer.update()
    return {'t':t,'planted_feet':t>=.28,'head_scale':tuple(K.NODES['robot.head'].scale)}


def joint_report(t):
    w=core_worlds(t);rows=[]
    for side in ('L','R'):
        hip=w['hip.'+side].translation;knee=w['shin.'+side].translation;ankle=w['foot.'+side].translation
        rows.append({'side':side,'thigh_length':(knee-hip).length,'shin_length':(ankle-knee).length,
                     'ankle_z':ankle.z,'knee_z':knee.z})
    return {'t':t,'legs':rows,'head_scale':list(w['head'].to_scale())}
