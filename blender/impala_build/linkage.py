"""Telescopic panel braces with constant-size stages and actual pinned ends."""
import math
import hashlib
import bpy
from mathutils import Matrix,Vector
from . import kit as K,geometry as G,motion,contract as D

LINKS={}
GROWN=.040


def definitions():
    LINKS.clear()
    for side,s in (('L',1),('R',-1)):
        rows=[('fender.'+side,'shin.'+side,(0,.075,-.030),'front_fender.'+side,(s*.890,D.FRONT_AXLE,.640),.031),
              ('door.'+side,'shoulder.'+side,(-s*.120,.250,-.100),'front_door.'+side,(s*.877,-.580,.470),.028),
              ('gauntlet.'+side,'forearm.'+side,(0,.100,-.130),'rear_door.'+side,(s*.890,.733,.470),.025),
              ('hood.'+side,'chest',(s*.480,.120,.170),'hood.front',(s*.460,-1.795,D.hood_height(.460,-1.795)-.063),.028),
              # Spine braces carry the rear module from the pelvis's back plate.
              ('spine.'+side,'spine',(s*.100,.210,-.040),'trunk',(s*.420,1.880,1.000),.032),
              # The roof rides a brace from the upper back until it docks.
              ('roof.'+side,'chest',(s*.120,.280,.780),'roof',(s*.060,.100,1.445),.026)]
        for name,bone,a,panel,b,radius in rows:
            LINKS[name]={'bone':bone,'a':a,'panel':panel,'b':b,'radius':radius}
    # The neck and head pack under the cowl and hood and return on telescopic
    # booms (chest to neck, neck to head) that end retracted inside the sleeve.
    neck='robot.stowed.'+hashlib.sha1(b'robot.neck').hexdigest()[:16]
    head='robot.stowed.'+hashlib.sha1(b'robot.head').hexdigest()[:16]
    LINKS['neck.boom']={'bone':'chest','a':(0,.155,.540),'panel':neck,'b':(0,0,.020),'radius':.034}
    LINKS['head.boom']={'bone':neck,'a':(-.080,0,.030),'panel':head,'b':(.080,0,.120),'radius':.030}
    return LINKS


def frame(name,core,panels,stowed):
    """World frame of a rig joint, car carrier or nested casting group."""
    if name in core:return core[name]
    if name.startswith('robot.stowed.'):
        return core[K.NODES[name].parent.name[len('bone.robot.'):]]@stowed[name]
    return panels[name]


def ends(spec,core,panels,t=1,stowed=None):
    if stowed is None:
        from . import stowage
        stowed=stowage.worlds(t)
    a=frame(spec['bone'],core,panels,stowed)@Vector(spec['a']);b=frame(spec['panel'],core,panels,stowed)@Vector(spec['b'])
    if spec['panel'].startswith(('front_door.','rear_door.')):
        s=1 if spec['panel'].endswith('.L') else -1
        # Fold the mounting clevis into the boxed seat pedestal. In car mode
        # its telescopic rail is horizontal below the seat, never across it.
        stored=Vector((s*.43,-.580 if 'front' in spec['panel'] else .733,.470))
        a=stored.lerp(a,motion.smooth(t,.08,.52))
    return a,b


def ranges():
    values={name:[] for name in LINKS}
    for frame in range(motion.FRAMES+1):
        t=frame/motion.FRAMES;core=motion.core_worlds(t);panels=motion.assembly_worlds(t,core)
        from . import stowage
        stowed=stowage.worlds(t)
        for name,spec in LINKS.items():
            a,b=ends(spec,core,panels,t,stowed);values[name].append((b-a).length)
    return {name:(min(lengths),max(lengths)) for name,lengths in values.items()}


def build():
    definitions();spans=ranges()
    for obj in list(K.PARTS):
        if not obj.name.startswith('robot.linkage.'):continue
        data=obj.data;K.PARTS.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
        if data.users==0:bpy.data.meshes.remove(data)
    start=len(K.PARTS)
    for name,spec in LINKS.items():
        low,high=spans[name]
        if low<.12:raise RuntimeError('Panel brace closes through its pivot: '+name)
        length=low*.88;count=max(3,math.ceil(high/(length*.92)))
        if count>9:raise RuntimeError('Panel brace needs revised anchors: '+name)
        spec['length']=length;spec['stages']=count
        # Fit the whole reduced brace, including its pins, as one assembly.
        from . import stowage
        core=motion.core_worlds(0);panels=motion.assembly_worlds(0,core)
        a,b=ends(spec,core,panels,0);center=(a+b)/2
        radius=spec['radius']*1.4
        points=[center+(p+Vector((x,y,z))-center)*GROWN for p in (a,b)
                for x in (-radius,radius) for y in (-radius,radius) for z in (-radius,radius)]
        shift,box_index=stowage.concealed_shift(points)
        spec['packed_center']=center+shift;spec['box_index']=box_index
        for i in range(count):
            node='link.'+name+'.stage.'+str(i)
            if node not in K.NODES:K.node(node)
            m=K.Mesh();r=spec['radius']*.83**i
            if i<count-1:
                G.turn(m,[(0,r*.86),(0,r),(length*.024,r*1.08),
                          (length*.945,r*1.08),(length,r),(length,r*.86)],
                       (0,0,1),(0,0,0),'dark' if i==0 else 'machined',48,True)
                for z in (.010,length-.018):
                    G.turn(m,[(z,r),(z,r*1.17),(z+.010,r*1.17),(z+.010,r)],
                           (0,0,1),(0,0,0),'bronze',40,True)
            else:
                G.turn(m,[(0,0),(0,r),(length-.009,r),(length,r*.72),(length,0)],
                       (0,0,1),(0,0,0),'chrome',48)
            obj=m.build('robot.linkage.'+name+'.stage.'+str(i),'04_LINKAGES',parent=node)
            obj['mechanism']='constant-length nested telescopic brace'
        for end in ('A','B'):
            node='link.'+name+'.pin.'+end
            if node not in K.NODES:K.node(node)
            m=K.Mesh();r=spec['radius']
            G.turn(m,[(-r*1.15,r*.25),(-r*1.15,r*.88),(r*1.15,r*.88),(r*1.15,r*.25)],
                   (1,0,0),(0,0,0),'dark',40,True)
            G.hardware(m,(-r*1.30,0,0),(r*1.30,0,0),r*.24,'bronze',20)
            m.build('robot.linkage.'+name+'.pin.'+end,'04_LINKAGES',parent=node)
    K.finalize(K.PARTS[start:])
    return [{'brace':name,'stroke':spans[name],'stages':spec['stages'],
             'stage_length':spec['length']} for name,spec in LINKS.items()]


def worlds(t,core,panels):
    out={}
    for name,spec in LINKS.items():
        a,b=ends(spec,core,panels,t);axis=(b-a).normalized()
        q=Vector((0,0,1)).rotation_difference(axis)
        if 'stages' not in spec:continue
        length=spec['length'];count=spec['stages']
        step=((b-a).length-length)/(count-1)
        if step<0 or step>length:
            raise RuntimeError('Telescopic stroke exceeded: '+name+' @ '+str(t))
        # Scale the entire connected brace about one midpoint, including the
        # spacing of its stages. Independent stage scaling leaves loose pins.
        u=motion.smooth(t,.005,.06);center=(a+b)/2
        packed=spec['packed_center'].lerp(center,u)
        packing=Matrix.Translation(packed)@Matrix.Scale(GROWN+(1-GROWN)*u,4)@Matrix.Translation(-center)
        for i in range(count):out['link.'+name+'.stage.'+str(i)]=packing@K.transform(a+axis*(i*step),q)
        out['link.'+name+'.pin.A']=packing@K.transform(a,q)
        out['link.'+name+'.pin.B']=packing@K.transform(b,q)
    return out
