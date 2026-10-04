"""Rigid nested storage inside the bonnet, boot and upholstered seat pedestals.

Every stored mesh retains its dimensions. Storage carriers return to their
authored joint frames before the robot reaches its final pose.
"""
import itertools
import hashlib
import bpy
from mathutils import Matrix,Vector
from . import kit as K,motion

SPECS={}
COMPARTMENTS=(
    ('bonnet',(-.795,-2.310,.315),(.795,-.930,.825)),
    ('boot',(-.795,1.300,.315),(.795,2.640,.790)),
    ('front_seat',(-.720,-.440,.345),(.720,.110,.601)),
    ('rear_seat',(-.720,.520,.345),(.720,1.120,.601)),
)


def orientations():
    axes=[Vector(p) for p in ((1,0,0),(0,1,0),(0,0,1))]
    result=[]
    for order in itertools.permutations(range(3)):
        for signs in itertools.product((-1,1),repeat=3):
            cols=[axes[order[i]]*signs[i] for i in range(3)]
            matrix=Matrix(cols).transposed()
            if matrix.determinant()>.9:result.append(matrix.to_4x4())
    return result


def choose(points,preferred):
    center=sum(points,Vector())/len(points);best=None
    for rotate in orientations():
        values=[rotate@(p-center) for p in points]
        lo=Vector([min(p[i] for p in values) for i in range(3)])
        hi=Vector([max(p[i] for p in values) for i in range(3)])
        for name,a,b in COMPARTMENTS:
            a,b=Vector(a),Vector(b)
            if any(hi[i]-lo[i]>b[i]-a[i]-.010 for i in range(3)):continue
            target=Vector([max(a[i]-lo[i]+.005,min(b[i]-hi[i]-.005,center[i])) for i in range(3)])
            score=(target-center).length+.14*rotate.to_quaternion().angle
            if name==preferred:score-=.30
            if best is None or score<best[0]:best=(score,Matrix.Translation(target)@rotate@Matrix.Translation(-center),name)
    return best


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
    rejected=[]
    for key,parts in groups.items():
        points=[o.matrix_world@Vector(p) for o in parts for p in o.bound_box]
        preferred='bonnet' if any(x in key for x in ('head','neck','shin','boot','ankle','calf')) else 'boot'
        chosen=choose(points,preferred)
        if chosen is None:rejected.append(key);continue
        _,correction,compartment=chosen
        parent=parts[0].parent;parent_key=parent.name[5:]
        name='robot.stowed.'+hashlib.sha1(key.encode()).hexdigest()[:16]
        if name not in K.NODES:K.node(name)
        node=K.NODES[name];node.parent=parent;node.matrix_parent_inverse=Matrix.Identity(4)
        local=parent.matrix_world.inverted()@correction@parent.matrix_world
        span=(.10,.60)
        if any(x in key for x in ('boot','ankle','toe')):span=(.035,.26)
        elif any(x in key for x in ('shin','knee','calf')):span=(.30,.78)
        elif 'head' in key or 'neck' in key:span=(.28,.80)
        pivot=parent.matrix_world.inverted()@(sum(points,Vector())/len(points))
        SPECS[name]={'a':local,'span':span,'compartment':compartment,'pivot':pivot}
        for obj in parts:
            obj['storage_original_parent']=parent_key
            obj.parent=node;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
            obj['storage_compartment']=compartment
        node.matrix_basis=local
    bpy.context.view_layer.update()
    if rejected:raise RuntimeError('Parts need authored storage: '+str(rejected))
    return {'rigid_storage_groups':len(SPECS),'rejected':rejected}


def worlds(t):
    out={}
    for name,spec in SPECS.items():
        u=motion.smooth(t,*spec['span']);p=spec['pivot'];a=spec['a']
        center=(a@p).lerp(p,u)
        rotation=a.to_quaternion().slerp(K.rotation(),u)
        out[name]=K.transform(center,rotation)@Matrix.Translation(-p)
    return out


def report():
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    violations=[]
    bounds={name:(a,b) for name,a,b in COMPARTMENTS}
    for obj in K.PARTS:
        compartment=obj.get('storage_compartment')
        if not compartment:continue
        a,b=bounds[compartment]
        values=[obj.matrix_world@Vector(p) for p in obj.bound_box]
        if any(p[i]<a[i]-.001 or p[i]>b[i]+.001 for p in values for i in range(3)):
            violations.append(obj.name)
    return {'outside_closed_storage_volumes':violations}
