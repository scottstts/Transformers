"""Reference-trimmed panels with independent creases and a localized quarter blade."""
import math
from mathutils import Vector
from . import kit as K, contract as D, geometry as G, reference as R

PILLAR_BASE_FRONT=R.unproject(R.SIDE_TRACES['pillar_front'][-1],.942)
REAR_COWL_END=1.660


def emit(mesh,name,carrier,bevel=.001):
    return mesh.build(name,'01_SHARED_BODY',parent=carrier,bevel=bevel)


def bottom_curve(name):
    if name=='front_door': return D.traced('front_door_bottom')
    if name=='rear_door': return D.traced('rear_door_bottom')
    return D.ROCKER


def boundaries(name):
    curves={
        'front_fender':(D.front_fender_edge,D.FRONT_SEAM),
        'front_door':(D.FRONT_SEAM,D.MIDDLE_SEAM),
        'rear_door':(D.MIDDLE_SEAM,D.REAR_SEAM),
        'rear_fender':(D.REAR_SEAM,lambda z:D.TAIL),
    }
    left,right=curves[name]
    return lambda z:left(z)+D.PANEL_GAP/2,lambda z:right(z)-D.PANEL_GAP/2


def seam_endpoint(boundary,height):
    y=boundary(.8)
    for _ in range(16): y=boundary(height(y))
    return y,height(y)


def panel_outline(name):
    left,right=boundaries(name)
    bottom=bottom_curve(name)
    at=((D.NOSE+D.PANEL_GAP/2,D.CREST(D.NOSE+D.PANEL_GAP/2)) if name=='front_fender'
        else seam_endpoint(left,D.CREST))
    bt=seam_endpoint(right,D.CREST)
    ab,bb=seam_endpoint(left,bottom),seam_endpoint(right,bottom)
    p=[(y,D.CREST(y)) for y in G.lin(at[0],bt[0],max(35,round((bt[0]-at[0])/.005)))]
    p.extend((right(z),z) for z in G.lin(bt[1],bb[1],67)[1:])
    lower=[(y,bottom(y)) for y in G.lin(ab[0],bb[0],max(35,round((bb[0]-ab[0])/.012)))]
    p.extend(list(reversed(lower))[1:])
    p.extend((left(z),z) for z in G.lin(ab[1],at[1],67)[1:-1])
    return p


def side_panel(s,name):
    outline=panel_outline(name)
    left,right=boundaries(name)
    bottom=bottom_curve(name)
    lo=min(y for y,z in outline);hi=max(y for y,z in outline)
    points=[];edges=[]
    # Every stamping station shares the same longitudinal sampling. This
    # supplies edge flow through both the shoulder and the lower character
    # crease; independently phased constraint rows created alternating facets.
    stations=sorted(set(G.lin(lo,hi,max(35,round((hi-lo)/.005)))+[y for y,z in outline]))
    offsets=(.00035,.0008,.0015,.0025,.004,.006,.0085,.0115,.015,.020,.027,.035,.045)
    previous={}
    for y in stations:
        section=D.side_section(y)
        rows={('section',i):z for i,(z,x) in enumerate(section)}
        for i,((a,xa),(b,xb)) in enumerate(zip(section,section[1:])):
            count=3 if abs(xb-xa)<.002 else 9
            for j in range(1,count):rows[('span',i,j)]=a+(b-a)*j/count
        for h in offsets:rows[('shoulder',h)]=D.CREST(y)-h
        if D.blade_weight(y)>0:
            for h in (-.066,-.030,-.015,-.006,-.002,0,.002,.006,.012,.024):
                rows[('blade',h)]=D.BLADE(y)+h
        floor=D.side_bottom(y) if 'fender' in name else bottom(y)
        column={};last=None
        for key,z in sorted(rows.items(),key=lambda item:item[1]):
            if floor+.0003<z<D.CREST(y)-.00005 and left(z)<y<right(z):
                index=len(points);points.append((y,z));column[key]=index
                if last is not None:edges.append((last,index))
                if key in previous:edges.append((previous[key],index))
                last=index
        previous=column
    m=K.Mesh()
    cutouts=[]
    if name in ('front_fender','rear_fender','rear_door'):
        arch=D.FRONT_ARCH_POINTS if name=='front_fender' else D.REAR_ARCH_POINTS
        loop=[(q.x,q.y) for q in G.catmull([(y,z,0) for y,z in arch],12)]
        loop.extend(((arch[-1][0],.05),(arch[0][0],.05)))
        cutouts.append(loop)
    kind='front' if name=='front_fender' else 'rear' if name=='rear_fender' else 'door'
    G.constrained_skin(m,outline,points,edges,lambda y,z:D.side_point(s,y,z),D.SKIN,(s,0,0),cutouts=cutouts,
                       crown_surface=lambda y,t:crown_point(s,y,t,kind),top_curve=D.CREST)
    side='L' if s>0 else 'R'
    ob=emit(m,'car.'+name+'.'+side,name+'.'+side,0)
    ob['reference_contour']='side photograph: wheel cuts, seams, character line and quarter blade'
    ob['parametric_surface']='compound.'+kind
    ob['surface_side']=s


def crown_section(y,kind):
    if kind=='front':
        inner=D.hood_height(D.HOOD_HALF_WIDTH,y);ix=D.HOOD_HALF_WIDTH+D.PANEL_GAP
    elif kind=='rear':
        inner=deck_height(.760,y);ix=.763
    else:
        inner=D.SILL(y)-.002;ix=.889
    root=None;weight=0
    if kind!='front' and PILLAR_BASE_FRONT[1]-.12<y<REAR_COWL_END:
        if y<PILLAR_BASE_FRONT[1]:
            root=(PILLAR_BASE_FRONT[0],PILLAR_BASE_FRONT[2])
            weight=(y-PILLAR_BASE_FRONT[1]+.12)/.12
            weight=weight*weight*(3-2*weight)
        elif y<=PILLAR_BASE_AFT[1]:
            u=(y-PILLAR_BASE_FRONT[1])/(PILLAR_BASE_AFT[1]-PILLAR_BASE_FRONT[1])
            root=(PILLAR_BASE_FRONT[0]*(1-u)+PILLAR_BASE_AFT[0]*u,
                  PILLAR_BASE_FRONT[2]*(1-u)+PILLAR_BASE_AFT[2]*u)
            weight=1
        else:
            u=(y-PILLAR_BASE_AFT[1])/(REAR_COWL_END-PILLAR_BASE_AFT[1])
            p=rear_cowl_point(u,1)
            root=(p[0],p[2])
            weight=1
        if root[0]<=ix:
            ix,inner=root
    elif kind=='rear' and REAR_COWL_END<=y<REAR_COWL_END+.160:
        # The cowl's horizontal landing tangent must continue into the quarter.
        # Fading it into the ordinary stamping avoids a change of section at
        # the trunk's leading edge, even when both border points coincide.
        root=(ix,inner)
        u=(y-REAR_COWL_END)/.160
        weight=1-u*u*(3-2*u)
    return ix,inner,root,weight


def crown_point(s,y,t,kind):
    ix,inner,root,weight=crown_section(y,kind)
    outer=D.CREST(y);ox=D.side_x(y,outer)
    z=inner*(1-t)+outer*t+.004*math.sin(math.pi*t)
    x=s*(ix+(ox-ix)*t)
    if root and root[0]<ox-.001:
        if root[0]>ix+.00001:
            section=D.Curve([(ix,inner),root,(ox,outer)])
            section.m[1]=0
        else:
            section=D.Curve([(ix,inner),(ox,outer)])
            section.m[0]=0
        z=z*(1-weight)+section(abs(x))*weight
    return x,D.body_y(x,y,z),z


def finish_normals(force=False):
    """Normals of the authored stamp, independent of CDT triangle density."""
    for obj in K.PARTS:
        kind=obj.get('parametric_surface')
        if not kind:continue
        s=obj['surface_side'];mesh=obj.data
        if not force and obj.get('stamp_normals_valid') and mesh.has_custom_normals:continue
        fields=mesh.attributes.get('impala.surface.field')
        category=kind.split('.')[1]
        cache={};normals=[(0,0,0)]*len(mesh.loops)
        for polygon in mesh.polygons:
            field=fields.data[polygon.index].value if fields else 0
            if not field:continue
            hint=Vector((s,0,0)) if field==1 else Vector((0,0,1))
            direction=polygon.normal.dot(hint)
            # Keep actual boundary/jamb normals at the edges of each skin.
            if abs(direction)<.35:continue
            sign=1 if direction>0 else -1
            for loop in polygon.loop_indices:
                index=mesh.loops[loop].vertex_index
                key=(index,field)
                if key not in cache:
                    p=mesh.vertices[index].co;y=float(p.y);z=float(p.z);x=float(p.x)
                    for _ in range(12):y=float(p.y)-(D.body_y(x,y,z)-y)
                    if field==1:
                        v=max(0,D.CREST(y)-z)
                        surface=lambda a,b:D.side_point(s,a,D.CREST(a)-b)
                    else:
                        ix=crown_section(y,category)[0]
                        ox=D.side_x(y,D.CREST(y))
                        v=max(0,min(1,(abs(x)-ix)/(ox-ix)))
                        surface=lambda a,b:crown_point(s,a,b,category)
                    e=.00001
                    a,b=surface(y+e,v),surface(y-e,v)
                    c,d=surface(y,v+e),surface(y,max(0,v-e) if field==1 else v-e)
                    du=Vector(tuple(aa-bb for aa,bb in zip(a,b)))
                    dv=Vector(tuple(cc-dd for cc,dd in zip(c,d)))
                    normal=du.cross(dv).normalized()
                    if normal.dot(hint)<0:normal=-normal
                    cache[key]=normal
                normals[loop]=tuple(cache[key]*sign)
        mesh.normals_split_custom_set(normals)
        mesh.update()
        obj['stamp_normals_valid']=True


def hood():
    xs=sorted(set(G.lin(-D.HOOD_HALF_WIDTH,D.HOOD_HALF_WIDTH,171)+
                  [s*x for s in (-1,1) for x in D.HOOD_SECTION.x]))
    for part,a,b,rows_count in (('front',D.NOSE+.002,-1.795,83),('rear',-1.795,-.955,91)):
        m=K.Mesh()
        rows=[[(x,D.body_y(x,y,D.hood_height(x,y)),D.hood_height(x,y)) for x in xs]
              for y in G.lin(a,b,rows_count)]
        # Vertical thickness keeps the two faces from crossing at the rolled
        # nose. Edge/jamb faces keep their own normals, not the hood normals.
        m.grid_shell(rows,depth=(0,0,-D.SKIN))
        obj=emit(m,'car.hood.'+part+'.stamped.skin','hood.'+part,0)
        obj['hood_shared_hinge_y']=-1.795
        # Both stamps share the exact edge position and analytical tangent.
        # Closed inner skins provide thickness; the outer edge has no gap.
        normals=[]
        for vertex in obj.data.vertices:
            x,world_y,z=vertex.co;y=world_y;e=.00001
            for _ in range(20):y=world_y-(D.body_y(x,y,D.hood_height(x,y))-y)
            def surface(u,v):
                h=D.hood_height(u,v)
                return Vector((u,D.body_y(u,v,h),h))
            du=surface(x+e,y)-surface(x-e,y)
            dv=surface(x,y+e)-surface(x,y-e)
            normals.append(du.cross(dv).normalized())
        loop_normals=[]
        for polygon in obj.data.polygons:
            for loop in polygon.loop_indices:
                normal=normals[obj.data.loops[loop].vertex_index]
                loop_normals.append(tuple((normal if polygon.normal.z>=0 else -normal)
                                          if abs(polygon.normal.z)>.50 else polygon.normal))
        obj.data.normals_split_custom_set(loop_normals)


def deck_height(x,y):
    centre=D.Curve([(1.48,1.123),(1.70,1.092),(2.05,1.025),(2.39,.956),(2.68,.888),(2.81,.851)])(y)
    edge=D.Curve([(1.48,1.055),(1.70,1.032),(2.05,.982),(2.39,.935),(2.68,.881),(2.81,.854)])(y)
    surface=D.Curve([(0,centre),(.60,centre-.002),(.684,centre-.004),(.730,(centre+edge)/2),(.760,edge)])(abs(x))
    ridge=.009*math.exp(-(x/.012)**2)*max(0,min(1,(y-1.54)/.13,(2.76-y)/.12))
    return surface+ridge


PILLAR_BASE_AFT=(.684,D.REAR_SCREEN_BOTTOM-.025,
                 deck_height(.684,D.REAR_SCREEN_BOTTOM-.025)+.006)


def rear_cowl_point(t,u):
    """Continue the deck channels below the glass, with a tangent at the lid."""
    blend=t*t*(3-2*t)
    y=(D.REAR_SCREEN_BOTTOM-.025*u*u)*(1-t)+REAR_COWL_END*t
    x=u*(.684+(.763-.684)*blend)
    z=deck_height(u*(.684+(.760-.684)*blend),y)+.006*(1-blend)
    return x,D.body_y(x,y,z),z


def deck():
    m=K.Mesh()
    G.skin(m,[[(x,D.body_y(x,y,deck_height(x,y)),deck_height(x,y)) for x in G.lin(-.760,.760,99)] for y in G.lin(REAR_COWL_END,D.TAIL-.006,99)],D.SKIN)
    emit(m,'car.trunk.lid','trunk',0)


def arch_trim(s,axle,carrier):
    arch=D.FRONT_ARCH_POINTS if axle==D.FRONT_AXLE else D.REAR_ARCH_POINTS
    path=[D.side_point(s,q.x,q.y) for q in G.catmull([(y,z,0) for y,z in arch],12)]
    m=K.Mesh()
    G.sweep(m,[(x-s*.004,y,z) for x,y,z in path],G.round_section(.006,.018,14),'paint',(s,0,0))
    emit(m,'car.'+carrier+'.arch.return',carrier,0)
    m=K.Mesh()
    section=[(-.001,-.009),(.000,-.011),(.003,-.011),(.006,-.008),
             (.007,0),(.006,.008),(.003,.011),(.000,.011),(-.001,.009)]
    G.sweep(m,[(x+s*.002,y,z) for x,y,z in path],section,'chrome',(s,0,0))
    emit(m,'car.'+carrier+'.arch.molding',carrier,.0003)


def rocker(s,a,b,carrier):
    for i,(lo,hi) in enumerate(D.arch_segments(a,b,D.MOLDING_Z)):
        if hi-lo<.015:continue
        # The reference's leading fender is bare paint. The side molding starts
        # behind the front wheel, rather than extending underneath its bumper.
        if carrier.startswith('front_fender') and hi<D.FRONT_AXLE:continue
        m=K.Mesh()
        path=[(s*(D.side_x(y,D.MOLDING(y))+.003),D.body_y(s*D.side_x(y,D.MOLDING(y)),y,D.MOLDING(y)),D.MOLDING(y))
              for y in G.lin(lo+.003,hi-.003,max(15,round((hi-lo)/.014)))]
        profile=[(-.001,-.015),(.003,-.015),(.005,-.010),(.007,-.008),(.006,0),
                 (.007,.008),(.005,.012),(.003,.015),(-.001,.015)]
        G.sweep(m,path,profile,'chrome',(s,0,0))
        emit(m,'car.'+carrier+'.rocker.molding.'+str(i),carrier,.0003)
    if 'door' in carrier:
        name=carrier.split('.')[0];curve=bottom_curve(name);left,right=boundaries(name)
        lo,_=seam_endpoint(left,curve);hi,_=seam_endpoint(right,curve)
        outline=[(y,curve(y)-.003) for y in G.lin(lo,hi,75)]
        outline+=list(reversed([(y,D.ROCKER(y)) for y in G.lin(lo,hi,75)]))
        points=[(y,z) for y in G.lin(lo,hi,55) for z in G.lin(D.ROCKER(y)+.004,curve(y)-.008,12)]
        m=K.Mesh()
        G.constrained_skin(m,outline,points,[],lambda y,z:D.side_point(s,y,z),D.SKIN,(s,0,0))
        emit(m,'car.'+carrier+'.fixed.lower.rocker',carrier,0)


def handles(s,a,b,carrier):
    rear='rear_door' in carrier
    _,y,z=R.unproject((1400,408) if rear else (1042,409),1.012)
    x=s*(D.side_x(y,z)+.006);m=K.Mesh()
    m.loft([[(x+s*depth,y+u,z+v) for u,v in G.rounded_rect(w,h,.007,12)]
            for depth,w,h in ((0,.263,.024),(.0021,.263,.024),(.0025,.2622,.0232))],
           'chrome',smooth=True)
    lever=G.catmull([(x+s*.004,y-.128,z+.004),(x+s*.014,y-.094,z+.010),
                   (x+s*.017,y+.092,z+.008),(x+s*.009,y+.121,z-.004)],16)
    G.sweep(m,lever,G.round_section(.009,.012,16),'chrome',(s,0,0))
    G.hardware(m,(x,y+.110,z-.004),(x+s*.018,y+.110,z-.004),.012,'chrome',32)
    emit(m,'car.'+carrier+'.handle',carrier,0)
    if not rear:
        m=K.Mesh()
        G.turn(m,[(0,0),(0,.015),(.002,.018),(.003,.014),(.003,0)],(s,0,0),(x,y+.096,z-.083),'chrome',48)
        m.prism([(x+s*.0035,y+.092,z-.089),(x+s*.0035,y+.100,z-.089),
                 (x+s*.0035,y+.100,z-.078),(x+s*.0035,y+.092,z-.078)],(-s*.001,0,0),'dark')
        emit(m,'car.'+carrier+'.lock',carrier,.0002)


def build():
    hood();deck()
    for s,label in ((1,'L'),(-1,'R')):
        regions=[(D.NOSE,D.DOOR_FRONT,'front_fender'),(D.DOOR_FRONT,D.DOOR_SPLIT,'front_door'),
                 (D.DOOR_SPLIT,D.DOOR_REAR,'rear_door'),(D.DOOR_REAR,D.TAIL,'rear_fender')]
        for a,b,name in regions:
            carrier=name+'.'+label
            side_panel(s,name);rocker(s,a,b,carrier)
            if 'door' in name:handles(s,a,b,carrier)
        arch_trim(s,D.FRONT_AXLE,'front_fender.'+label)
        arch_trim(s,D.REAR_AXLE,'rear_fender.'+label)
