"""Manufactured robot surfaces: castings, stampings, apertures and bearing stacks."""
import math
from mathutils import Vector
from . import kit as K,geometry as G


def materials():
    K.material('mask_alloy',(.24,.27,.30),.72,.44)
    K.material('head_brow_alloy',(.18,.16,.12),.94,.31)
    K.material('robot_graphite',(.017,.021,.030),.77,.27,.28)
    K.material('machined',(.28,.33,.37),.94,.21)
    K.material('eye_core',(.045,.29,.90),.10,.18,emission=3.2)
    K.material('head_eye',(.008,.035,.65),0,.20,emission=3)
    K.material('head_iris',(.035,.28,1),0,.18,emission=5)


def emit(mesh,name,bone,fillet=0):
    obj=mesh.build('robot.'+name,'02_MECHANICAL_CORE',parent='robot.'+bone,bevel=fillet)
    obj['construction']='authored manufactured surface, full physical dimensions'
    return obj


def grid(outline,spacing):
    lo=min(p[0] for p in outline);hi=max(p[0] for p in outline)
    bottom=min(p[1] for p in outline);top=max(p[1] for p in outline)
    return [(u,v) for u in G.lin(lo,hi,max(3,round((hi-lo)/spacing)))
            for v in G.lin(bottom,top,max(3,round((top-bottom)/spacing)))]


def panel(name,bone,outline,surface,thickness=.008,mat='robot_graphite',
          outward=(0,-1,0),spacing=.010,cutouts=None,creases=()):
    outline=sample_boundary(outline,spacing)
    cutouts=[sample_boundary(p,spacing) for p in cutouts] if cutouts else None
    m=K.Mesh();points=grid(outline,spacing);edges=[]
    for line in creases:
        start=len(points);points.extend(line)
        edges.extend((start+i,start+i+1) for i in range(len(line)-1))
    G.constrained_skin(m,outline,points,edges,surface,thickness,outward,mat,cutouts=cutouts)
    return emit(m,name,bone)


def sample_boundary(outline,spacing=.004):
    """Sample in parameter space before projection onto a curved casting."""
    result=[]
    for a,b in zip(outline,outline[1:]+outline[:1]):
        a,b=Vector(a),Vector(b)
        count=max(1,math.ceil((b-a).length/spacing))
        result.extend(tuple(a.lerp(b,i/count)) for i in range(count))
    return result


def rim(name,bone,outline,surface,mat='chrome',width=.007,height=.006,hint=(0,-1,0)):
    m=K.Mesh();G.sweep(m,[surface(u,v) for u,v in sample_boundary(outline)],
                     [(-height/2,-width/2),(height/2,-width/2),(height/2,width/2),(-height/2,width/2)],
                     mat,hint,True)
    return emit(m,name,bone)


def bearing(name,bone,center,axis,radius,depth=.07):
    """Separate turned races, toothed rotor, recessed cap and six fasteners."""
    c=Vector(center);axis=Vector(axis).normalized();m=K.Mesh()
    profile=[(-depth/2,radius*.55),(-depth/2,radius*.91),(-depth*.39,radius),
             (depth*.24,radius),(depth*.35,radius*.94),(depth*.36,radius*.79),
             (-depth*.25,radius*.79),(-depth*.27,radius*.55)]
    G.turn(m,profile,axis,c,'dark',96,True)
    G.turn(m,[(depth*.28,radius*.60),(depth*.34,radius*.80),(depth*.44,radius*.82),
              (depth*.48,radius*.74),(depth*.48,radius*.52),(depth*.36,radius*.50)],axis,c,'chrome',96,True)
    G.turn(m,[(depth*.30,0),(depth*.30,radius*.54),(depth*.49,radius*.55),
              (depth*.54,radius*.45),(depth*.54,0)],axis,c,'bronze',80)
    # The opposite race has its own axle cap. An empty through-bore at elbows
    # and knees read as disconnected tubes in the previous build.
    G.turn(m,[(-depth*.55,0),(-depth*.55,radius*.36),(-depth*.51,radius*.51),
              (-depth*.35,radius*.54),(depth*.34,radius*.54),(depth*.34,0)],axis,c,'dark',72)
    G.turn(m,[(-depth*.55,radius*.37),(-depth*.57,radius*.38),(-depth*.57,radius*.66),
              (-depth*.53,radius*.72),(-depth*.47,radius*.71),(-depth*.47,radius*.55)],axis,c,'machined',72,True)
    u=axis.orthogonal().normalized();v=axis.cross(u)
    for angle in G.lin(0,math.tau,7)[:-1]:
        p=c+axis*depth*.47+(u*math.cos(angle)+v*math.sin(angle))*radius*.68
        G.hardware(m,p,p+axis*.006,radius*.068,'machined',6)
        pin=c-axis*depth*.57+(u*math.cos(angle)+v*math.sin(angle))*radius*.55
        G.hardware(m,pin,pin-axis*.008,radius*.067,'bronze',6)
    for angle in G.lin(0,math.tau,25)[:-1]:
        path=[c+axis*depth*.21+(u*math.cos(angle)+v*math.sin(angle))*r for r in (radius*.92,radius*1.025)]
        G.sweep(m,path,G.round_section(.009,.012,6),'bronze',axis)
    return emit(m,name,bone)


def tube(name,bone,path,radius=.012,mat='dark'):
    m=K.Mesh();G.sweep(m,G.catmull(path,10),G.round_section(radius*2,radius*2,12),mat,(0,-1,0))
    return emit(m,name,bone)


def actuator(name,bone,a,b,radius=.035):
    a=Vector(a);b=Vector(b);axis=(b-a).normalized();length=(b-a).length;m=K.Mesh()
    G.hardware(m,a,b,radius*.38,'chrome',32)
    profile=[(length*.08,radius*.45),(length*.09,radius*.87),(length*.115,radius),
             (length*.48,radius),(length*.51,radius*.88),(length*.52,radius*.51),
             (length*.48,radius*.43),(length*.115,radius*.43)]
    G.turn(m,profile,axis,a,'dark',64,True)
    for t in (.115,.470,.515,.815):
        p=a.lerp(b,t)
        G.turn(m,[(-.008,radius*.41),(-.008,radius*.94),(-.003,radius*1.05),
                  (.006,radius*1.05),(.010,radius*.87),(.010,radius*.41)],axis,p,'bronze',48,True)
    for p in (a,b):
        perpendicular=axis.orthogonal().normalized()
        G.turn(m,[(-radius*.42,radius*.20),(-radius*.42,radius*.79),
                  (radius*.42,radius*.79),(radius*.42,radius*.20)],perpendicular,p,'machined',48,True)
        G.hardware(m,p-perpendicular*radius*.52,p+perpendicular*radius*.52,radius*.19,'bronze',20)
    return emit(m,name,bone)
