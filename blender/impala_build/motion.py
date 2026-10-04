"""Grounded jackknife deployment with fixed limb lengths and a rigid helmet."""
import math
from bisect import bisect_right
import bpy
from mathutils import Matrix,Vector,Quaternion
from . import kit as K,rig,attachments as A

FRAMES=240
HOOD_FOLD_SPAN=(.40,.54)
PACING_KEYS=()
PACING_SLOPES=()


def set_pacing(keys):
    """Monotone cubic clock: preserve every pose and the order of mechanisms."""
    global PACING_KEYS,PACING_SLOPES
    PACING_KEYS=tuple(keys)
    h=[b[0]-a[0] for a,b in zip(keys,keys[1:])]
    d=[(b[1]-a[1])/step for a,b,step in zip(keys,keys[1:],h)]
    slopes=[max(0,min(3*d[0],((2*h[0]+h[1])*d[0]-h[0]*d[1])/(h[0]+h[1])))]
    for i in range(1,len(keys)-1):
        w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1]
        slopes.append((w1+w2)/(w1/d[i-1]+w2/d[i]))
    slopes.append(max(0,min(3*d[-1],((2*h[-1]+h[-2])*d[-1]-h[-1]*d[-2])/(h[-1]+h[-2]))))
    PACING_SLOPES=tuple(slopes)


def phase(t):
    """Timeline time to authored pose phase, with a brief smooth start/stop."""
    t=max(0,min(1,t))
    if not PACING_KEYS or t in (0,1):return t
    edge=.020
    if t<edge:
        u=t/edge;x=edge*(u**3-.5*u**4)/(1-edge)
    elif t>1-edge:
        u=(1-t)/edge;x=1-edge*(u**3-.5*u**4)/(1-edge)
    else:x=(t-edge/2)/(1-edge)
    i=min(len(PACING_KEYS)-2,bisect_right(PACING_KEYS,(x,float('inf')))-1)
    a,p=PACING_KEYS[i];b,q=PACING_KEYS[i+1];h=b-a;u=(x-a)/h
    return ((2*u**3-3*u*u+1)*p+(u**3-2*u*u+u)*h*PACING_SLOPES[i]+
            (-2*u**3+3*u*u)*q+(u**3-u*u)*h*PACING_SLOPES[i+1])


def timeline_time(pose_phase):
    """Keep timeline markers at the same mechanical events after retiming."""
    low,high=0.0,1.0
    for _ in range(40):
        mid=(low+high)/2
        if phase(mid)<pose_phase:low=mid
        else:high=mid
    return (low+high)/2


def smooth(t,a,b):
    u=max(0,min(1,(t-a)/(b-a)))
    return u*u*u*(10+u*(-15+6*u))


def track(t,keys):
    for (a,p),(b,q) in zip(keys,keys[1:]):
        if t<=b:return Vector(p).lerp(Vector(q),smooth(t,a,b))
    return Vector(keys[-1][1])


def pelvis_position(t):
    keys=[(0,(0,.800,.585)),(.12,(0,.800,.585)),(.25,(0,.720,.880)),
          (.43,(0,.350,1.360)),(.62,(0,-.550,2.120)),
          (.82,(0,-1.440,2.790)),(1,(0,-1.620,2.870))]
    if t<=.62:return track(t,keys)
    # The last two rise segments used to stop independently at .82. Once
    # retimed, that pause became a one-frame hesitation followed by a surge.
    # Pass through their shared point with matching velocity and acceleration.
    p,q,r=[Vector(v) for _,v in keys[-3:]]
    h0,h1=.20,.18;d0=(q-p)/h0;d1=(r-q)/h1
    w0,w1=2*h1+h0,h1+2*h0
    velocity=Vector([(w0+w1)/(w0/a+w1/b) if a*b>0 else 0
                     for a,b in zip(d0,d1)])
    if t<=.82:a,b,start,end,va,vb=.62,.82,p,q,Vector(),velocity
    else:a,b,start,end,va,vb=.82,1,q,r,velocity,Vector()
    h=b-a;u=max(0,min(1,(t-a)/h));delta=end-start
    v0,v1=va*h,vb*h
    return (start+v0*u+(10*delta-6*v0-4*v1)*u**3+
            (-15*delta+8*v0+7*v1)*u**4+(6*delta-3*v0-3*v1)*u**5)


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
    pelvis=pelvis_position(t)
    q=K.rotation(x=90*(1-smooth(t,.15,.91)))
    pose={'pelvis':(q,pelvis-Vector((0,rig.ROBOT_Y,rig.HIP_Z))),
          'neck':(Quaternion(),Vector((0,0,-.300*(1-smooth(t,.30,.85))))) }
    for side,s in (('L',1),('R',-1)):
        pose['shoulder.'+side]=(Quaternion(),Vector((-s*.550*(1-smooth(t,.06,.64)),0,0)))
        pose['upperarm.'+side]=(K.rotation(y=-s*14*smooth(t,.30,.86)),Vector())
        # The elbow is a forward hinge: a descending -Z limb swings into -Y
        # under NEGATIVE X rotation. Never pass through backward extension.
        # Settle the elbows and wrists during the main unfold. They finish
        # with the panels, instead of adding an arm-only turn at the end.
        pose['forearm.'+side]=(K.rotation(x=-158*(1-smooth(t,.24,.84))-22*smooth(t,.56,.84))@K.rotation(z=s*32*smooth(t,.50,.84)),Vector())
        pose['hand.'+side]=(K.rotation(z=s*23*smooth(t,.56,.84)),Vector())
        for name in rig.FINGERS:
            for j in range(1,4):
                angle=(32,66,52)[j-1]+rig.FINGERS.index(name)*2
                pose[name+str(j)+'.'+side]=(K.rotation(x=70+(angle-70)*smooth(t,.56,.86)),Vector())
        for j in range(1,4):
            u=smooth(t,.58,.86)
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


def hinge(point,degrees):
    """Rotation about a transverse (X) hinge line through a car-space point."""
    p=Vector(point)
    return Matrix.Translation(p)@K.rotation(x=degrees).to_matrix().to_4x4()@Matrix.Translation(-p)


def keyed(points,rotations,u):
    """Centripetal-free Catmull-Rom through pivot waypoints; rotations are
    slerped segment by segment on a continuous hemisphere."""
    n=len(points)-1;x=u*n;i=min(int(x),n-1);f=x-i
    p0=points[max(i-1,0)];p1=points[i];p2=points[i+1];p3=points[min(i+2,n)]
    pivot=.5*(2*p1+(p2-p0)*f+(2*p0-5*p1+4*p2-p3)*f*f+(3*p1-p0-3*p2+p3)*f**3)
    a,b=rotations[i],rotations[i+1].copy()
    if a.dot(b)<0:b.negate()
    return pivot,a.slerp(b,f)


# Rear module: tail and bumper are its rigid base. When the rear wheels leave,
# it sets down on its lowest point. It then rises clear of the ground and folds
# on its own seams: the trunk lid's aft stamping swings down on the tail's top
# edge, the forward stamping folds under it on the lid seam, and the rear screen,
# still joined to that forward edge, stands up behind the tail lamps. Every
# piece stays on a real hinge. The compact module is then carried onto the back
# on the spine braces.
REAR_DROP=.275
TRUNK_HINGE=(0,2.790,.855)
SCREEN_JOINT=(0,1.660,1.030)


def rear_module(t,worlds,out):
    from . import folds
    ground=Matrix.Translation((0,0,-REAR_DROP*smooth(t,.04,.16)))
    raised=Matrix.Translation((0,-.300,1.100-REAR_DROP))
    final=worlds['chest']@A.final_relative(A.SPECS['tail'])
    # Rises as soon as the robot lifts and closes on its back progressively,
    # folding while it is still clear of the ground and the robot.
    base=mix(ground,raised,smooth(t,.24,.40))
    base=mix(base,final,smooth(t,.38,.74))
    out['tail']=base;out['rear_bumper']=base.copy()
    aft=base@hinge(TRUNK_HINGE,90*smooth(t,.33,.49))
    spec=folds.SPECS.get('fold.trunk.aft')
    v=smooth(t,*spec['span']) if spec else 0
    fold=Matrix.Translation(spec['point'])@K.rotation(*[v*x for x in spec['angle']]).to_matrix().to_4x4()@Matrix.Translation(-spec['point']) if spec else Matrix.Identity(4)
    out['trunk']=aft@fold.inverted()
    # The fold chain leaves the screen leaning back 22 deg; its joint squares it.
    out['rear_screen']=out['trunk']@hinge(SCREEN_JOINT,22*smooth(t,.37,.53))


def assembly_worlds(t,worlds=None):
    worlds=worlds or core_worlds(t);initial=core_worlds(0);out={}
    for name,spec in A.SPECS.items():
        bone=spec['bone'];a,b=spec['span']
        rest=initial[bone].inverted()@(Matrix.Translation((0,0,-.410)) if name.startswith('window.') else Matrix.Identity(4))
        # Interpolate at the actual panel mount, never at the object origin.
        # A distant origin traces an artificial arc through the floor when
        # long stampings rotate. The shared physical mount carries the fold.
        u=smooth(t,a,b);source=Vector(spec['source'])
        if spec.get('keys'):
            pivot,q=keyed([rest@source]+[Vector(p) for p,r in spec['keys']]+[Vector(spec['target'])],
                          [rest.to_quaternion()]+[r for p,r in spec['keys']]+[spec['rotation']],u)
        else:
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
    # Grille, bumper and engine stay with the hood: the car front is one unit.
    for name in ('nose','front_bumper'):out[name]=out['hood.front'].copy()
    out["engine"]=out["hood.front"].copy()
    rear_module(t,worlds,out)
    # The two hood stamps meet on the same physical hinge in the final fold.
    # Its full-size rear portion rotates down behind the front stamping.
    h=A.SPECS['hood.front'];front=out['hood.front']
    hinge=Vector((0,-1.795,.0));from . import contract as D
    hinge.z=D.hood_height(0,-1.795)
    target=front@hinge
    q=front.to_quaternion()@K.rotation(x=-95*smooth(t,*HOOD_FOLD_SPAN))
    rear=K.transform(target,q)@Matrix.Translation(-hinge)
    out['hood.rear']=rear
    from . import folds
    if folds.SPECS:out.update(folds.worlds(t,worlds,out))
    return out


def matrices(t,include_linkage=True,retime=True):
    if retime:t=phase(t)
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
    if include_linkage and linkage.LINKS:out.update(linkage.worlds(t,core,panels))
    from . import stowage
    if stowage.SPECS:out.update(stowage.worlds(t))
    return out,core,panels


def apply(t,include_linkage=True):
    local,core,panels=matrices(t,include_linkage=include_linkage)
    for name,matrix in local.items():
        obj=K.NODES[name];obj.matrix_basis=matrix
        if not name.startswith(('robot.stowed.','link.')):obj.scale=(1,1,1)
    bpy.context.view_layer.update()
    return {'t':t,'phase':phase(t),'planted_feet':phase(t)>=.28,'head_scale':tuple(K.NODES['robot.head'].scale)}


def joint_report(t):
    w=core_worlds(phase(t));rows=[]
    for side in ('L','R'):
        hip=w['hip.'+side].translation;knee=w['shin.'+side].translation;ankle=w['foot.'+side].translation
        rows.append({'side':side,'thigh_length':(knee-hip).length,'shin_length':(ankle-knee).length,
                     'ankle_z':ankle.z,'knee_z':knee.z})
    return {'t':t,'legs':rows,'head_scale':list(w['head'].to_scale())}
