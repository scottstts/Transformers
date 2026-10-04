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




# The head and neck never scale, so they pack where opaque panels hide them:
# the head under the hood in the emptied engine bay, the neck under the cowl.
UNDER_HOOD={'robot.head':((-2.300,-1.500),(.400,.980)),'robot.neck':((-1.620,-1.150),(.400,.930))}


def nest(points,box=None):
    """Smallest world translation that brings a group inside the envelope."""
    lo=Vector([min(p[i] for p in points) for i in range(3)])
    hi=Vector([max(p[i] for p in points) for i in range(3)])
    d=Vector()
    span_y,span_z=box if box else ((FRONT,REAR),None)
    for i,(a,b) in ((0,(-HALF_WIDTH,HALF_WIDTH)),(1,span_y)):
        if hi[i]-lo[i]>b-a:d[i]=(a+b)/2-(lo[i]+hi[i])/2
        else:d[i]=max(a-lo[i],0)+min(b-hi[i],0)
    floor,top=span_z if span_z else (FLOOR,min(roof(y) for y in (lo.y+d.y,(lo.y+hi.y)/2+d.y,hi.y+d.y)))
    if hi.z-lo.z>top-floor:d.z=(floor+top)/2-(lo.z+hi.z)/2
    else:d.z=max(floor-lo.z,0)+min(top-hi.z,0)
    return d


# Reduced joint assemblies pack inside the opaque cushion cores. Shrinking
# each detail at its own centre left tiny pins and hoses on the upholstery
# and below the chassis; reduced dimensions alone do not imply concealment.
# From the cowl to the rear screen: everything the glass can show.
CABIN=(-1.480,1.650)
SQUASH=.040
CONCEALED_BOXES=[(Vector((x0,y0,.495)),Vector((x1,y1,.580)))
                 for x0,x1 in ((-.680,-.100),(.100,.680))
                 for y0,y1 in ((-.390,-.110),(.560,.840))]


def concealed_shift(points):
    """Nearest translation fitting every reduced point inside a cushion core."""
    lo=Vector([min(p[i] for p in points) for i in range(3)])
    hi=Vector([max(p[i] for p in points) for i in range(3)])
    choices=[]
    for index,(a,b) in enumerate(CONCEALED_BOXES):
        if any(hi[i]-lo[i]>b[i]-a[i] for i in range(3)):continue
        shift=Vector([max(a[i]-lo[i],0)+min(b[i]-hi[i],0) for i in range(3)])
        choices.append((shift.length_squared,index,shift))
    if not choices:raise RuntimeError('Reduced assembly does not fit an opaque cushion core')
    _,index,shift=min(choices,key=lambda row:(row[0],row[1]))
    return shift,index


def squashed(points,shift):
    lo=min(p.y for p in points)+shift.y;hi=max(p.y for p in points)+shift.y
    return hi>CABIN[0] and lo<CABIN[1]


def span(key):
    # The head leaves the bonnet early, moving back while the car front moves
    # forward and away from it.
    if 'head' in key:return (.06,.34)
    if 'neck' in key:return (.12,.62)
    if any(x in key for x in ('foot','toe')):return (.04,.26)
    if any(x in key for x in ('shin','calf')):return (.06,.30)
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
    # Brace endpoints depend on this fit. Do not evaluate old brace strokes
    # against the temporary, unnested rest pose during a repeated bake.
    SPECS.clear();motion.apply(0,include_linkage=False)
    groups={}
    for obj in K.PARTS:
        if not obj.name.startswith('robot.') or obj.name.startswith('robot.linkage.') or not obj.parent:continue
        parent=obj.parent.name[5:]
        # Keep a joint's castings and all their hardware together while packed.
        key=parent
        groups.setdefault(key,[]).append(obj)
    for key,parts in groups.items():
        points=[o.matrix_world@Vector(p) for o in parts for p in o.bound_box]
        shift=nest(points,UNDER_HOOD.get(key))
        # The head and neck never scale; they keep unit scale throughout.
        squash=SQUASH if key not in UNDER_HOOD else 1.0
        center=(Vector([min(p[i] for p in points) for i in range(3)])+
                Vector([max(p[i] for p in points) for i in range(3)]))/2
        compartment='nested';box_index=None
        if squash<1:
            reduced=[center+(p-center)*squash for p in points]
            shift,box_index=concealed_shift(reduced)
            compartment='cushion'
        parent=parts[0].parent;node_name='robot.stowed.'+hashlib.sha1(key.encode()).hexdigest()[:16]
        if node_name not in K.NODES:K.node(node_name)
        node=K.NODES[node_name];node.parent=parent;node.matrix_parent_inverse=Matrix.Identity(4)
        # A world translation conjugated into the joint frame stays a pure
        # translation there: the group slides along one straight line.
        local=parent.matrix_world.inverted()@Matrix.Translation(shift)@parent.matrix_world
        pivot=parent.matrix_world.inverted()@center
        SPECS[node_name]={'a':local,'span':span(key),'compartment':compartment,'pivot':pivot,
                          'shift':shift.length,'squash':squash,'box_index':box_index}
        for obj in parts:
            obj['storage_original_parent']=parent.name[5:]
            obj.parent=node;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
            obj['storage_compartment']=compartment
        node.matrix_basis=local@Matrix.Translation(pivot)@Matrix.Scale(squash,4)@Matrix.Translation(-pivot)
    # Per-mesh packing carriers from earlier iterations no longer own geometry.
    for name,node in list(K.NODES.items()):
        if name.startswith('robot.stowed.') and name not in SPECS and not node.children:
            del K.NODES[name];bpy.data.objects.remove(node,do_unlink=True)
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
        if obj.get('storage_compartment') not in ('nested','cushion'):continue
        spec=SPECS.get(obj.parent.name[5:],{})
        values=[obj.matrix_world@Vector(p) for p in obj.bound_box]
        if spec.get('compartment')=='cushion':
            lo,hi=CONCEALED_BOXES[spec['box_index']]
            outside=any(any(p[i]<lo[i]-.0001 or p[i]>hi[i]+.0001 for i in range(3)) for p in values)
        else:
            box=UNDER_HOOD.get(obj.get('storage_original_parent'))
            bottom,top=box[1] if box else (FLOOR,None)
            outside=any(abs(p.x)>HALF_WIDTH+.002 or p.y<FRONT-.002 or p.y>REAR+.002 or
                        p.z<bottom-.002 or p.z>(top if top is not None else roof(p.y))+.002 for p in values)
        if outside:
            violations.append(obj.name)
    return {'outside_body_envelope':violations}
