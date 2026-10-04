"""Subpixel contour tracing of the user's Chevrolet badge stencil."""
import math
import bpy
import numpy as np
from mathutils import Matrix, Vector
from . import kit as K, contract as D

STENCIL='/Users/scott/Documents/Projects/Node/Transformers/ref_images/67_impala_chevrolet_logo.jpg'


def contours(image,threshold=.88):
    w,h=image.size
    pixels=np.empty(w*h*4,dtype=np.float32)
    image.pixels.foreach_get(pixels)
    luminance=pixels.reshape(h,w,4)[:,:,:3].mean(axis=2)
    # Blender converts this JPEG's sRGB samples to linear; trace the pale edge
    # at a high threshold, retaining the thin connecting strokes.
    edges={}
    points={}
    table={1:[(3,0)],2:[(0,1)],3:[(3,1)],4:[(1,2)],5:[(3,2),(0,1)],
           6:[(0,2)],7:[(3,2)],8:[(2,3)],9:[(2,0)],10:[(0,3),(1,2)],
           11:[(1,2)],12:[(1,3)],13:[(0,1)],14:[(3,0)]}
    for y in range(h-1):
        for x in range(w-1):
            values=[luminance[y,x],luminance[y,x+1],luminance[y+1,x+1],luminance[y+1,x]]
            code=sum((1<<i) for i,v in enumerate(values) if v<threshold)
            if code not in table: continue
            corners=[(x,y),(x+1,y),(x+1,y+1),(x,y+1)]
            def crossing(e):
                a,b=e,(e+1)%4
                t=float((threshold-values[a])/(values[b]-values[a]))
                p=(corners[a][0]+t*(corners[b][0]-corners[a][0]),corners[a][1]+t*(corners[b][1]-corners[a][1]))
                key=(round(p[0],5),round(p[1],5))
                points[key]=p
                return key
            for a,b in table[code]:
                p,q=crossing(a),crossing(b)
                edges.setdefault(p,[]).append(q)
                edges.setdefault(q,[]).append(p)
    loops=[]
    while edges:
        start=next(iter(edges))
        current=start
        previous=None
        loop=[]
        for _ in range(w*h):
            loop.append(points[current])
            neighbors=edges[current]
            nxt=next((v for v in neighbors if v!=previous),neighbors[0])
            del edges[current]
            previous,current=current,nxt
            if current==start: break
            if current not in edges: break
        if current==start and len(loop)>5:
            area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(loop,loop[1:]+loop[:1]))/2
            if abs(area)>.8: loops.append(loop)
    return loops


def contains(p,poly):
    result=False
    x,y=p
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: result=not result
    return result


def simplify_contour(loop,tolerance=.10):
    """Remove sampling noise within a tenth of one source pixel."""
    def rdp(points):
        if len(points)<3: return points
        ax,ay=points[0]
        bx,by=points[-1]
        dx,dy=bx-ax,by-ay
        length=math.hypot(dx,dy)
        distances=[abs(dx*(p[1]-ay)-dy*(p[0]-ax))/max(length,1e-10) for p in points[1:-1]]
        peak=max(distances)
        if peak<=tolerance: return [points[0],points[-1]]
        i=distances.index(peak)+1
        return rdp(points[:i+1])[:-1]+rdp(points[i:])
    split=max(range(1,len(loop)),key=lambda i:(loop[i][0]-loop[0][0])**2+(loop[i][1]-loop[0][1])**2)
    return rdp(loop[:split+1])[:-1]+rdp(loop[split:]+loop[:1])[:-1]


def build(name='rear',width=.220,center=None,carrier='tail',facing=1):
    image=bpy.data.images.load(STENCIL,check_existing=True)
    loops=[simplify_contour(loop) for loop in contours(image)]
    flat=[p for loop in loops for p in loop]
    bounds=(min(p[0] for p in flat),max(p[0] for p in flat),min(p[1] for p in flat),max(p[1] for p in flat))
    scale=width/(bounds[1]-bounds[0])
    cx,cy=(bounds[0]+bounds[1])/2,(bounds[2]+bounds[3])/2
    curve=bpy.data.curves.new('Chevrolet.REFERENCE_STENCIL','CURVE')
    K.enum_set(curve,'dimensions','2D')
    # Verified against the live 2D setter: NONE/BACK/FRONT/BOTH. Static RNA
    # incorrectly lists the 3D FULL/HALF modes for this contextual property.
    curve.fill_mode='BOTH'
    curve.resolution_u=2
    curve.extrude=.0009
    curve.bevel_depth=.00018
    curve.bevel_resolution=3
    for loop in loops:
        depth=sum(contains(loop[0],other) for other in loops if other is not loop)
        area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(loop,loop[1:]+loop[:1]))
        if (area>0)!=(depth%2==0): loop=list(reversed(loop))
        spline=curve.splines.new('POLY')
        spline.points.add(len(loop)-1)
        for p,(x,y) in zip(spline.points,loop): p.co=((x-cx)*scale,(y-cy)*scale,0,1)
        spline.use_cyclic_u=True
    curve.materials.append(K.MATERIALS['chrome'])
    obj=bpy.data.objects.new('car.'+name+'.Chevrolet.traced_stencil',curve)
    bpy.data.collections['01_SHARED_BODY'].objects.link(obj)
    obj['impala_build']=True
    obj['reference_stencil']=STENCIL
    obj['trace_contours']=len(loops)
    obj['trace_pixels']=sum(len(loop) for loop in loops)
    obj['badge_width_m']=width
    obj['construction']='Raised chrome, source-image contours including letter counters'
    obj.parent=K.NODES[carrier]
    center=center or (-.652,D.tail_surface_y(-.652,.802)+.0025,.802)
    placement=Matrix.Translation(Vector(center))@Matrix(((-facing,0,0,0),(0,0,facing,0),(0,1,0,0),(0,0,0,1)))
    obj.matrix_local=placement
    bpy.context.view_layer.update()
    mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    original_name=obj.name
    shell=bpy.data.objects.new(original_name+'.mesh',mesh)
    bpy.data.collections['01_SHARED_BODY'].objects.link(shell)
    shell.parent=obj.parent
    shell.matrix_local=placement
    for key,value in obj.items(): shell[key]=value
    bpy.data.objects.remove(obj,do_unlink=True)
    shell.name=original_name
    obj=shell
    if facing>0:
        matrix=placement
        inverse=matrix.inverted()
        for vertex in mesh.vertices:
            p=matrix@vertex.co
            p.y+=D.tail_surface_y(p.x,p.z)-D.tail_surface_y(center[0],center[2])
            vertex.co=inverse@p
        mesh.update()
    K.PARTS.append(obj)
    return obj
