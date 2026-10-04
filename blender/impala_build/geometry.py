"""Closed surface patches, profile sweeps, turns and exact manufactured cuts."""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion
from mathutils.geometry import delaunay_2d_cdt
from . import kit as K


def lin(a,b,n):
    return [a+(b-a)*i/(n-1) for i in range(n)]


def skin(mesh,rows,thickness=.006,outward=(0,0,1),mat='paint',inner_mat=None):
    n,m=len(rows),len(rows[0])
    v=[Vector(p) for row in rows for p in row]
    normals=[]
    for i in range(n):
        for j in range(m):
            du=Vector(rows[min(n-1,i+1)][j])-Vector(rows[max(0,i-1)][j])
            dv=Vector(rows[i][min(m-1,j+1)])-Vector(rows[i][max(0,j-1)])
            normal=du.cross(dv).normalized()
            if normal.dot(Vector(outward))<0: normal=-normal
            normals.append(normal)
    faces=[]
    for i in range(n-1):
        for j in range(m-1):
            f=(i*m+j,i*m+j+1,(i+1)*m+j+1,(i+1)*m+j)
            normal=(v[f[1]]-v[f[0]]).cross(v[f[2]]-v[f[0]])
            if normal.dot(normals[f[0]])<0: f=tuple(reversed(f))
            faces.extend([f,tuple(n*m+k for k in reversed(f))])
    border=list(range(m))+[i*m+m-1 for i in range(1,n)]+[(n-1)*m+j for j in range(m-2,-1,-1)]+[i*m for i in range(n-2,0,-1)]
    for a,b in zip(border,border[1:]+border[:1]): faces.append((a,b,b+n*m,a+n*m))
    start=len(mesh.f)
    mesh.add(v+[p-normal*thickness for p,normal in zip(v,normals)],faces,mat,True)
    if inner_mat:
        if inner_mat not in mesh.slots:mesh.slots.append(inner_mat)
        slot=mesh.slots.index(inner_mat)
        for i in range(start+1,start+2*(n-1)*(m-1),2):mesh.mi[i]=slot
    return mesh


def constrained_skin(mesh,outline,points,edges,surface,thickness=.006,outward=(1,0,0),mat='paint',cutouts=None,crown_surface=None,top_curve=None):
    """A trimmed thick skin with aperture contours and crease lines in topology."""
    uv=[Vector(p) for p in outline]+[Vector(p) for p in points]
    shift=len(outline)
    constraints=[(a+shift,b+shift) for a,b in edges]
    for loop in cutouts or ():
        start=len(uv)
        uv.extend(Vector(p) for p in loop)
        constraints.extend((start+i,start+(i+1)%len(loop)) for i in range(len(loop)))
    coords,_,faces,*_=delaunay_2d_cdt(uv,constraints,[list(range(shift))],1,.000002,False)
    def inside(p,loop):
        result=False
        for a,b in zip(loop,loop[1:]+loop[:1]):
            if (a[1]>p.y)!=(b[1]>p.y) and p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0]:
                result=not result
        return result
    if cutouts:
        faces=[f for f in faces if not any(inside(sum((coords[i] for i in f),Vector((0,0)))/len(f),loop) for loop in cutouts)]
    vertices=[Vector(surface(p.x,p.y)) for p in coords]
    side_faces=len(faces)
    if crown_surface:
        # Extend the side patch from its OWN top boundary vertices. Separate
        # sampling grids and overlapping closed skins caused the sawtooth join.
        boundary={}
        for face in faces:
            for a,b in zip(face,face[1:]+face[:1]):
                key=tuple(sorted((a,b)))
                boundary[key]=boundary.get(key,0)+1
        top_edges=[edge for edge,count in boundary.items() if count==1 and
                   all(abs(coords[i].y-top_curve(coords[i].x))<.0001 for i in edge)]
        top_vertices=sorted({i for edge in top_edges for i in edge},key=lambda i:coords[i].x)
        strip={}
        for i in top_vertices:
            y=coords[i].x
            vertices[i]=Vector(crown_surface(y,1))
            row=[i]
            for t in lin(1,0,35)[1:]:
                row.append(len(vertices));vertices.append(Vector(crown_surface(y,t)))
            strip[i]=row
        for a,b in top_edges:
            if coords[a].x>coords[b].x:a,b=b,a
            for j in range(34):
                faces.append((strip[a][j],strip[b][j],strip[b][j+1],strip[a][j+1]))
    normals=[Vector((0,0,0)) for _ in vertices]
    oriented=[];border={};hint=Vector(outward)
    for index,face in enumerate(faces):
        face=tuple(face)
        normal=(vertices[face[1]]-vertices[face[0]]).cross(vertices[face[2]]-vertices[face[0]])
        preferred=Vector((0,0,1)) if crown_surface and index>=side_faces else hint
        if normal.dot(preferred)<0:face=tuple(reversed(face));normal=-normal
        oriented.append(face)
        for i in face:normals[i]+=normal
        for a,b in zip(face,face[1:]+face[:1]):
            key=tuple(sorted((a,b)))
            if key in border:border[key]=None
            else:border[key]=(a,b)
    normals=[n.normalized() for n in normals]
    n=len(vertices)
    faces=oriented+[tuple(n+i for i in reversed(f)) for f in oriented]
    for edge in border.values():
        if edge:
            a,b=edge;faces.append((a,b,b+n,a+n))
    start=len(mesh.f)
    mesh.add(vertices+[v-normal*thickness for v,normal in zip(vertices,normals)],faces,mat,True)
    if crown_surface:
        labels=[1]*side_faces+[2]*(len(oriented)-side_faces)
        mesh.face_fields[start:start+len(faces)]=labels+labels+[0]*(len(faces)-2*len(labels))
    return mesh


def catmull(points,count=10,closed=False):
    p=[Vector(x) for x in points]
    out=[]
    ends=len(p) if closed else len(p)-1
    for i in range(ends):
        p0=p[(i-1)%len(p)] if closed or i else p[i]
        p1=p[i]
        p2=p[(i+1)%len(p)]
        p3=p[(i+2)%len(p)] if closed or i+2<len(p) else p2
        for j in range(count):
            u=j/count
            out.append(.5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u**3))
    if not closed: out.append(p[-1])
    return out


def sweep(mesh,path,section,mat='chrome',normal_hint=(1,0,0),closed=False):
    """Parallel-transport frame. Cross-section is (outward, perpendicular)."""
    p=[]
    for value in path:
        value=Vector(value)
        if not p or (value-p[-1]).length>.000002: p.append(value)
    hint=Vector(normal_hint)
    frames=[]
    last=None;last_tangent=None
    for i,origin in enumerate(p):
        prev=p[(i-1)%len(p)] if closed or i else origin
        nxt=p[(i+1)%len(p)] if closed or i+1<len(p) else origin
        tangent=(nxt-prev).normalized()
        if last is None:
            outward=hint-tangent*hint.dot(tangent)
            if outward.length<1e-8: outward=tangent.orthogonal()
        else:
            outward=last_tangent.rotation_difference(tangent)@last
            outward-=tangent*outward.dot(tangent)
        outward.normalize()
        frames.append((origin,tangent,outward.copy()))
        last=outward;last_tangent=tangent
    twist=0
    if closed:
        first_tangent=frames[0][1];first_outward=frames[0][2]
        end=last_tangent.rotation_difference(first_tangent)@last
        twist=math.atan2(first_tangent.dot(end.cross(first_outward)),end.dot(first_outward))
    rings=[]
    for i,(origin,tangent,outward) in enumerate(frames):
        if closed:outward=Quaternion(tangent,twist*i/(len(frames)-1))@outward
        across=tangent.cross(outward).normalized()
        rings.append([origin+outward*x+across*y for x,y in section])
    if closed: rings.append(rings[0])
    mesh.loft(rings,mat,cap=not closed,smooth=True)
    return mesh


def round_section(w,h,n=12):
    return [(w*.5*math.cos(i*math.tau/n),h*.5*math.sin(i*math.tau/n)) for i in range(n)]


def turn(mesh,profile,axis=(1,0,0),center=(0,0,0),mat='chrome',segments=96,closed_profile=False):
    """Axial profile with welded poles after build; radial stations stay named."""
    axis=Vector(axis).normalized()
    u=axis.orthogonal().normalized()
    v=axis.cross(u)
    c=Vector(center)
    rings=[[c+axis*x+r*(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments))
            for i in range(segments)] for x,r in profile]
    if closed_profile: rings.append(rings[0])
    mesh.loft(rings,mat,cap=False,smooth=True)
    return mesh


def rounded_rect(w,h,r,n=8):
    p=[]
    for cx,cy,start in ((w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)):
        for a in lin(start,start+90,n):
            p.append((cx+r*math.cos(math.radians(a)),cy+r*math.sin(math.radians(a))))
    return p


def rounded_polygon(points,radii,n=10):
    """Tangent circular corner fillets on an authored convex polygon."""
    p=[Vector(q) for q in points];out=[]
    for i,corner in enumerate(p):
        a=(p[i-1]-corner).normalized();b=(p[(i+1)%len(p)]-corner).normalized()
        angle=math.acos(max(-1,min(1,a.dot(b))))
        radius=radii[i] if isinstance(radii,(tuple,list)) else radii
        run=min(radius/math.tan(angle/2),(p[i-1]-corner).length*.4,(p[(i+1)%len(p)]-corner).length*.4)
        radius=run*math.tan(angle/2)
        centre=corner+(a+b).normalized()*(radius/math.sin(angle/2))
        first=corner+a*run;last=corner+b*run
        start=math.atan2(first.y-centre.y,first.x-centre.x)
        end=math.atan2(last.y-centre.y,last.x-centre.x)
        delta=(end-start+math.pi)%math.tau-math.pi
        out.extend((centre.x+radius*math.cos(start+delta*t),centre.y+radius*math.sin(start+delta*t)) for t in lin(0,1,n))
    return out


def filleted_path(points,radius=.007,n=9):
    """Straight manufactured runs with tangent circular elbows in 3D."""
    points=[Vector(p) for p in points];out=[points[0]]
    for i,corner in enumerate(points[1:-1],1):
        a=(points[i-1]-corner).normalized();b=(points[i+1]-corner).normalized()
        angle=math.acos(max(-1,min(1,a.dot(b))))
        normal=a.cross(b)
        if normal.length<1e-8 or angle<1e-5:
            out.append(corner);continue
        run=min(radius/math.tan(angle/2),(points[i-1]-corner).length*.4,(points[i+1]-corner).length*.4)
        r=run*math.tan(angle/2);centre=corner+(a+b).normalized()*(r/math.sin(angle/2))
        first=corner+a*run;last=corner+b*run;u=(first-centre).normalized()
        v=normal.normalized().cross(u)
        end=last-centre;delta=math.atan2(end.dot(v),end.dot(u))
        out.extend(centre+r*(u*math.cos(delta*t)+v*math.sin(delta*t)) for t in lin(0,1,n))
    out.append(points[-1]);return out


def transformed(mesh,M):
    mesh.v=[M@v for v in mesh.v]
    return mesh


def exact_cut(obj,cutter,name):
    """A true aperture. Cutter is temporary modeling data, never visible detail."""
    mod=obj.modifiers.new(name,'BOOLEAN')
    K.enum_set(mod,'operation','DIFFERENCE')
    K.enum_set(mod,'solver','EXACT')
    mod.object=cutter
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)
    if cutter in K.PARTS: K.PARTS.remove(cutter)
    bpy.data.objects.remove(cutter,do_unlink=True)
    return obj


def cutters_prism(points,vector):
    mesh=K.Mesh()
    mesh.prism(points,vector,'dark')
    return mesh.build('temporary.aperture','01_SHARED_BODY',bevel=0)


def hardware(mesh,a,b,radius,mat='steel',rings=20):
    """A genuinely axial machined fastener with a turned edge, not a raw cylinder."""
    a,b=Vector(a),Vector(b)
    length=(b-a).length
    axis=(b-a).normalized()
    edge=min(radius*.16,length*.12)
    turn(mesh,[(0,0),(0,radius-edge),(edge,radius),(length-edge,radius),(length,radius-edge),(length,0)],axis,a,mat,rings)
    return mesh
