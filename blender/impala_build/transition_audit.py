"""Deployment sweep: unsupported moving groups and core pass-through by frame."""
import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
from . import kit as K

# Robot volumes that car panels must never sweep through.
CORE=('robot.head.','robot.neck.','robot.chest.','robot.shoulder.','robot.clav')


def groups():
    """Mesh objects grouped by the node that carries them."""
    out={}
    for obj in bpy.data.objects:
        if obj.type!='MESH' or not obj.get('impala_build') or not obj.parent:continue
        if not obj.name.startswith(('car.','robot.')):continue
        out.setdefault(obj.parent.name,[]).append(obj)
    return out


def samples(objs,limit=500):
    pts=[]
    for obj in objs:
        n=len(obj.data.vertices)
        if not n:continue
        co=np.empty(n*3);obj.data.vertices.foreach_get('co',co);co=co.reshape(-1,3)
        step=max(1,n*len(objs)//limit)
        m=np.array(obj.matrix_world)
        pts.append(co[::step]@m[:3,:3].T+m[:3,3])
    return np.concatenate(pts) if pts else np.zeros((0,3))


def support(frame,threshold=.03,moving_only=True):
    """Groups whose nearest neighbour group is farther than the threshold."""
    scene=bpy.context.scene;scene.frame_set(frame)
    rest={}
    if moving_only:
        scene.frame_set(0);rest={n:bpy.data.objects[n].matrix_world.copy() for n in groups()};scene.frame_set(frame)
    g=groups();clouds={n:samples(o) for n,o in g.items()}
    boxes={n:(c.min(0),c.max(0)) for n,c in clouds.items() if len(c)}
    trees={}
    for n,c in clouds.items():
        if not len(c):continue
        t=KDTree(len(c))
        for i,p in enumerate(c):t.insert(p,i)
        t.balance();trees[n]=t
    lonely=[]
    for n,c in clouds.items():
        if not len(c):continue
        if moving_only and n in rest and (bpy.data.objects[n].matrix_world.translation-rest[n].translation).length<.02:continue
        lo,hi=boxes[n];best=9
        for m,(lo2,hi2) in boxes.items():
            if m==n or np.any(lo2-hi>best) or np.any(lo-hi2>best):continue
            for p in c[::max(1,len(c)//120)]:
                d=trees[m].find(p)[2]
                if d<best:best=d
                if best<threshold:break
            if best<threshold:break
        if best>=threshold:lonely.append((round(best,3),n,len(g[n])))
    return sorted(lonely,reverse=True)


def surfaces(objs):
    verts=[];faces=[];base=0
    for obj in objs:
        n=len(obj.data.vertices)
        if not n:continue
        co=np.empty(n*3);obj.data.vertices.foreach_get('co',co);co=co.reshape(-1,3)
        m=np.array(obj.matrix_world);verts.append(co@m[:3,:3].T+m[:3,3])
        faces.extend([[i+base for i in p.vertices] for p in obj.data.polygons]);base+=n
    if not verts:return None,None
    v=np.concatenate(verts);return BVHTree.FromPolygons(v.tolist(),faces),v


def islands(frame,threshold=.03,ground=.03):
    """Connected clusters of carried groups that neither touch the main body
    (the largest cluster, through any chain of contacts) nor rest on the
    ground. Concealed castings still growing below half scale are ignored."""
    bpy.context.scene.frame_set(frame)
    g={n:o for n,o in groups().items() if bpy.data.objects[n].matrix_world.to_scale().x>.5};trees={};clouds={}
    for n,o in g.items():
        t,v=surfaces(o)
        if t:trees[n]=t;clouds[n]=v[::max(1,len(v)//400)]
    boxes={n:(c.min(0),c.max(0)) for n,c in clouds.items()}
    for n,o in g.items():
        if n in clouds:
            _,v=surfaces(o);boxes[n]=(v.min(0),v.max(0))
    names=list(clouds);parent={n:n for n in names}
    def root(n):
        while parent[n]!=n:parent[n]=parent[parent[n]];n=parent[n]
        return n
    for i,a in enumerate(names):
        lo,hi=boxes[a]
        for b in names[i+1:]:
            lo2,hi2=boxes[b]
            if np.any(lo2-hi>threshold) or np.any(lo-hi2>threshold) or root(a)==root(b):continue
            small,big=(a,b) if len(clouds[a])<len(clouds[b]) else (b,a)
            if any((h:=trees[big].find_nearest(p,threshold))[0] is not None for p in clouds[small]) or \
               any(trees[small].find_nearest(p,threshold)[0] is not None for p in clouds[big]):parent[root(a)]=root(b)
    comps={}
    for n in names:comps.setdefault(root(n),[]).append(n)
    main=max(comps,key=lambda r:len(comps[r])) if comps else None;out=[]
    for r,members in comps.items():
        if r==main:continue
        low=min(boxes[m][0][2] for m in members)
        if low<ground:continue
        out.append((round(float(low),2),sorted(members)))
    return out


def tree(obj):
    deps=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(deps);me=ev.to_mesh()
    m=obj.matrix_world;bvh=BVHTree.FromPolygons([m@v.co for v in me.vertices],[tuple(p.vertices) for p in me.polygons])
    ev.to_mesh_clear();return bvh


def passthrough(frame,panels=('car.',),core=CORE,analytic=False):
    """Car panel objects intersecting the robot's head, neck, chest or shoulders."""
    bpy.context.scene.frame_set(frame)
    if analytic:
        from . import motion
        motion.apply(frame/motion.FRAMES,include_linkage=False)
    a=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(core)]
    b=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(panels) and o.visible_get()]
    def box(o):
        c=[o.matrix_world@Vector(p) for p in o.bound_box]
        return Vector([min(p[i] for p in c) for i in range(3)]),Vector([max(p[i] for p in c) for i in range(3)])
    ab={o.name:box(o) for o in a};bb={o.name:box(o) for o in b};ta={};hits={}
    for o in b:
        lo,hi=bb[o.name];cand=[x for x in a if all(ab[x.name][0][i]<=hi[i] and lo[i]<=ab[x.name][1][i] for i in range(3))]
        if not cand:continue
        tb=tree(o)
        for x in cand:
            if x.name not in ta:ta[x.name]=tree(x)
            if tb.overlap(ta[x.name]):hits.setdefault(o.parent.name,set()).add(x.name.split('.')[1])
    return {k:sorted(v) for k,v in hits.items()}
