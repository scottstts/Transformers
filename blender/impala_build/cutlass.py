"""Reference cavalry cutlass: curved forged blade, fuller, shaped grip and D guard."""
import math
import bpy
from . import kit as K,geometry as G,contract as D

WIDTH=D.Curve([(.010,.037),(.032,.086),(.133,.087),(.260,.083),(.750,.078),(1.18,.073),(1.55,.067),
               (1.75,.048),(1.88,.021),(1.926,.0003)])
CENTRE=D.Curve([(.010,0),(.133,0),(.60,.001),(1.18,.003),(1.48,.007),
                (1.72,.030),(1.88,.065),(1.926,.082)])


def emit(mesh,name,bevel=0):
    return mesh.build('weapon.cutlass.'+name,'05_CUTLASS',parent='cutlass',bevel=bevel)


def materials():
    K.material('blade_alloy',(.16,.18,.21),.97,.31)
    K.material('blade_ground_edge',(.48,.50,.54),.97,.16)
    K.material('guard_alloy',(.105,.124,.148),.98,.38)
    K.material('cutlass_grip',(.013,.010,.008),0,.65)
    grip=next(n for n in K.MATERIALS['cutlass_grip'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    grip.inputs['Specular IOR Level'].default_value=.22
    for key in ('blade_alloy','blade_ground_edge','guard_alloy'):
        material=K.MATERIALS[key];nodes=material.node_tree.nodes
        bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        if 'Anisotropic IOR Level' in bsdf.inputs:bsdf.inputs['Anisotropic IOR Level'].default_value=.26


def blade():
    m=K.Mesh();rings=[]
    for z in G.lin(.010,1.926,193):
        w=WIDTH(z);x=CENTRE(z)
        depth=.011*min(1,w/.060)
        fuller=.52*min(1,max(0,(z-.205)/.095),max(0,(1.79-z)/.150))
        section=[(-.58,0),(-.44,.56),(-.16,1),(.025,1),(.105,1-fuller),
                 (.245,1-fuller),(.330,.40),(.420,.40),(.420,-.40),(.330,-.40),
                 (.245,-1+fuller),(.105,-1+fuller),(.025,-1),(-.16,-1),(-.44,-.56)]
        rings.append([(x+u*w,v*depth,z) for u,v in section])
    m.loft(rings,'blade_alloy',smooth=True)
    m.slots.append('blade_ground_edge')
    for j in range(len(rings)-1):
        for edge in (0,1,13,14):m.mi[j*15+edge]=1
    obj=emit(m,'forged.curved.fullered.blade')
    obj['blade_length_m']=1.916;obj['edge_thickness_m']=.0003
    obj['construction']='forged curved section with two-sided recessed fuller and tapered edge'
    return obj


def hilt():
    m=K.Mesh()
    rings=[]
    for z in G.lin(-.334,-.016,73):
        t=(z+.334)/.318
        radius=.028+.004*abs(2*t-1)**1.6
        groove=math.sin(math.pi*t)**.55
        row=[]
        for a in G.lin(0,math.tau,97)[:-1]:
            relief=.0013*math.cos(6*a)*groove
            row.append(((radius+relief)*math.cos(a),(.026+relief)*math.sin(a),z))
        rings.append(row)
    m.loft(rings,'cutlass_grip',smooth=True);emit(m,'grooved.oval.grip')
    m=K.Mesh()
    G.turn(m,[(-.348,0),(-.348,.022),(-.342,.033),(-.329,.034),(-.322,.031),(-.322,0)],
           (0,0,1),(0,0,0),'guard_alloy',80)
    G.turn(m,[(-.025,.024),(-.025,.033),(-.012,.033),(-.006,.028),(-.006,.023)],
           (0,0,1),(0,0,0),'guard_alloy',80,True)
    emit(m,'turned.pommel.and.ferrule')
    m=K.Mesh()
    m.loft([[(x,y,z) for x,y in G.rounded_rect(w,d,.007,8)]
            for z,w,d in ((-.017,.058,.046),(.012,.070,.043),(.024,.058,.034))],
           'guard_alloy',smooth=True)
    emit(m,'blade.heel.clamping.bolster')
    # A flat spring-steel guard bends around the knuckles and returns into
    # the pommel. Its broad face is separate from the edge bevel.
    path=G.catmull([(0,0,-.334),(.081,0,-.340),(.164,0,-.295),(.204,0,-.210),
                    (.208,0,-.110),(.179,0,-.032),(.107,0,.016),(.034,0,.026)],20)
    m=K.Mesh();G.sweep(m,path,[(-.0025,-.013),(.0025,-.013),(.0035,-.007),
                              (.0035,.007),(.0025,.013),(-.0025,.013)],'guard_alloy',(0,1,0))
    emit(m,'formed.D.knuckle.bow')
    m=K.Mesh()
    path=G.catmull([(-.126,0,.041),(-.092,0,.061),(-.043,0,.042),(.013,0,.024),(.068,0,.023),(.113,0,.018)],20)
    rings=[]
    from mathutils import Vector
    for i,point in enumerate(path):
        tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        a=Vector((0,1,0));b=tangent.cross(a).normalized()
        width=.015*min(1,(i+1)/8,(len(path)-i)/8)
        rings.append([point+a*u+b*v*width/.015 for u,v in ((-.003,-.015),(.003,-.015),(.004,-.010),(.004,.010),(.003,.015),(-.003,.015))])
    m.loft(rings,'guard_alloy',smooth=True);emit(m,'swept.quillon')
    m=K.Mesh();G.hardware(m,(0,-.037,-.340),(0,.037,-.340),.009,'guard_alloy',24)
    emit(m,'pommel.recessed.through.pin')


def build():
    for obj in list(bpy.data.objects):
        if not obj.get('impala_build') or not obj.name.startswith('weapon.cutlass.'):continue
        data=obj.data
        if obj in K.PARTS:K.PARTS.remove(obj)
        bpy.data.objects.remove(obj,do_unlink=True)
        if data and data.users==0:bpy.data.meshes.remove(data)
    if 'cutlass' not in K.NODES:K.node('cutlass')
    materials();start=len(K.PARTS);blade();hilt();K.finalize(K.PARTS[start:])
    return {'parts':len(K.PARTS)-start,'total_length_m':2.274,'left_hand_grip':True}
