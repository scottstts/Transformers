"""Robot castings nested into their own joints inside the closed car.

The hero robot is wider and deeper than the Impala's body, so in car mode each
casting group is slid along a straight line in its own joint frame until it
sits inside the body envelope, overlapping its neighbours out of sight. During
deployment the group slides back out of its joint while that joint moves with
the skeleton. Nothing travels between the bonnet, boot and joints. Every mesh
retains its dimensions and unit scale.
"""
import hashlib
import bpy
from mathutils import Matrix,Vector
from . import kit as K,motion

SPECS={}
# Inner body envelope: half width, length and the top line along the car. In
# the cabin the top is the door beltline, so nothing shows through the glass.
HALF_WIDTH=.900
FRONT,REAR=-2.420,2.840
FLOOR=.330
ROOF=[(-2.45,.840),(-1.60,.900),(-1.05,.930),(1.60,.930),(2.85,.800)]


def roof(y):
    for (a,za),(b,zb) in zip(ROOF,ROOF[1:]):
        if a<=y<=b:return za+(zb-za)*(y-a)/(b-a)
    return ROOF[0][1] if y<ROOF[0][0] else ROOF[-1][1]




def nest(points):
    """Smallest world translation that brings a group inside the envelope."""
    lo=Vector([min(p[i] for p in points) for i in range(3)])
    hi=Vector([max(p[i] for p in points) for i in range(3)])
    d=Vector()
    for i,(a,b) in ((0,(-HALF_WIDTH,HALF_WIDTH)),(1,(FRONT,REAR))):
        if hi[i]-lo[i]>b-a:d[i]=(a+b)/2-(lo[i]+hi[i])/2
        else:d[i]=max(a-lo[i],0)+min(b-hi[i],0)
    top=min(roof(y) for y in (lo.y+d.y,(lo.y+hi.y)/2+d.y,hi.y+d.y))
    if hi.z-lo.z>top-FLOOR:d.z=(FLOOR+top)/2-(lo.z+hi.z)/2
    else:d.z=max(FLOOR-lo.z,0)+min(top-hi.z,0)
    return d


# Groups that would sit in the cabin, where the glass would show them, are
# squashed in place about their own centre in car mode (a few millimetres
# across, concealed) and grow back on their joint as it deploys, so they never
# travel apart from it.
CABIN=(-1.100,1.450)
SQUASH=.040


def squashed(points,shift):
    lo=min(p.y for p in points)+shift.y;hi=max(p.y for p in points)+shift.y
    return hi>CABIN[0] and lo<CABIN[1]


def span(key):
    if any(x in key for x in ('head','neck')):return (.30,.80)
    if any(x in key for x in ('foot','toe','shin','calf')):return (.06,.30)
    if any(x in key for x in ('thigh','hip','pelvis')):return (.10,.42)
    # The torso core grows first: the roof and hood braces bear on it.
    if any(x in key for x in ('chest','spine','abdomen','clav')):return (.06,.32)
    return (.14,.62)


def build():
    # Restore original parenting when iterating this module in a live scene.
    for obj in K.PARTS:
        source=obj.get('storage_original_parent')
        if source and source in K.NODES:
            obj.parent=K.NODES[source];obj.matrix_parent_inverse=Matrix.Identity(4)
            obj.matrix_basis=Matrix.Identity(4)
    SPECS.clear();motion.apply(0)
    groups={}
    for obj in K.PARTS:
        if not obj.name.startswith('robot.') or obj.name.startswith('robot.linkage.') or not obj.parent:continue
        if '.window.' in obj.name:continue
        parent=obj.parent.name[5:]
        key=parent if obj.name.startswith(('robot.head.','robot.neck.')) else obj.name
        groups.setdefault(key,[]).append(obj)
    for key,parts in groups.items():
        points=[o.matrix_world@Vector(p) for o in parts for p in o.bound_box]
        shift=nest(points)
        # The head and neck never scale; they keep unit scale throughout.
        squash=SQUASH if squashed(points,shift) and key not in ('robot.head','robot.neck') else 1.0
        if squash<1:shift=Vector()
        parent=parts[0].parent;node_name='robot.stowed.'+hashlib.sha1(key.encode()).hexdigest()[:16]
        if node_name not in K.NODES:K.node(node_name)
        node=K.NODES[node_name];node.parent=parent;node.matrix_parent_inverse=Matrix.Identity(4)
        # A world translation conjugated into the joint frame stays a pure
        # translation there: the group slides along one straight line.
        local=parent.matrix_world.inverted()@Matrix.Translation(shift)@parent.matrix_world
        pivot=parent.matrix_world.inverted()@(sum(points,Vector())/len(points))
        SPECS[node_name]={'a':local,'span':span(key),'compartment':'nested','pivot':pivot,'shift':shift.length,'squash':squash}
        for obj in parts:
            obj['storage_original_parent']=parent.name[5:]
            obj.parent=node;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
            obj['storage_compartment']='nested'
        node.matrix_basis=local
    bpy.context.view_layer.update()
    return {'nested_groups':len(SPECS),'max_slide_m':round(max(s['shift'] for s in SPECS.values()),3)}


def worlds(t):
    out={}
    for name,spec in SPECS.items():
        u=motion.smooth(t,*spec['span']);p=spec['pivot'];a=spec['a']
        center=(a@p).lerp(p,u)
        rotation=a.to_quaternion().slerp(K.rotation(),u)
        scale=spec.get('squash',1.0)+(1-spec.get('squash',1.0))*u
        out[name]=K.transform(center,rotation)@Matrix.Scale(scale,4)@Matrix.Translation(-p)
    return out


def report():
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    violations=[]
    for obj in K.PARTS:
        if obj.get('storage_compartment')!='nested':continue
        if SPECS.get(obj.parent.name[5:],{}).get('squash',1)<1:continue
        values=[obj.matrix_world@Vector(p) for p in obj.bound_box]
        if any(abs(p.x)>HALF_WIDTH+.002 or p.y<FRONT-.002 or p.y>REAR+.002 or p.z<FLOOR-.002 or p.z>roof(p.y)+.002 for p in values):
            violations.append(obj.name)
    return {'outside_body_envelope':violations}
