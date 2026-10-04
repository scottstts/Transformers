"""Peaked grille, sealed-beam optical stacks and formed bumper with real openings."""
import math
import bpy
from mathutils import Vector, Matrix
from . import kit as K, contract as D, geometry as G, badge
from .body import emit


# Top bar runs 3 mm under the hood and fender front lips, which rise at the corners.
UPPER=D.Curve([(0,.829),(.444,.829),(.760,.829),(.829,.835),(.900,.843),(.980,.847),(1.025,.849)])
LOWER=D.Curve([(0,.647),(.465,.650),(.837,.657),(1.025,.694)])


def lower_surround(x):
    """Rolled apron lip scallops under the actual sealed-beam castings."""
    z=LOWER(abs(x))
    radius=D.LAMP_BEZEL_RADIUS+.004
    for center in [-p for p in D.LAMP_X]+list(D.LAMP_X):
        dx=x-center
        if abs(dx)<radius:
            z=min(z,D.LAMP_Z-math.sqrt(radius*radius-dx*dx)-.008)
    return z


def corner_outer_x(z):
    """Outer edge of the corner lamp frame, flush inside the fender's leading edge."""
    y=D.front_shell_leading(z)
    return D.side_x(y,z)-.008


def surround_end(z):
    x=1.023
    for _ in range(4):x=corner_outer_x(z(x))
    return x


def clear_intervals(z):
    if callable(z):
        def allowed(x):
            return min(math.hypot(x-c,z(x)-D.LAMP_Z) for c in [-p for p in D.LAMP_X]+list(D.LAMP_X))>D.LAMP_BEZEL_RADIUS+.003
        xs=G.lin(-.837,.837,1201);out=[];start=None
        for a,b in zip(xs,xs[1:]):
            ok=allowed((a+b)/2)
            if ok and start is None:start=a
            elif not ok and start is not None:out.append((start,a));start=None
        if start is not None:out.append((start,xs[-1]))
        return out
    intervals=[(-.837,.837)]
    dz=z-D.LAMP_Z
    r=D.LAMP_BEZEL_RADIUS+.002
    if abs(dz)>=r: return intervals
    half=math.sqrt(r*r-dz*dz)
    for x in [-p for p in D.LAMP_X]+list(D.LAMP_X):
        pieces=[]
        for a,b in intervals:
            if b<=x-half or a>=x+half: pieces.append((a,b))
            else:
                if a<x-half: pieces.append((a,x-half))
                if b>x+half: pieces.append((x+half,b))
        intervals=pieces
    return intervals


def grille():
    # Open chrome lattice: no bars pass behind a lens, and no coplanar masks.
    for row,t in enumerate((.095,.285,.475,.665,.855)):
        z=lambda x:UPPER(abs(x))*(1-t)+LOWER(abs(x))*t
        for section,(a,b) in enumerate(clear_intervals(z)):
            if b-a<.009: continue
            m=K.Mesh()
            path=[(x,D.fascia_y(x)-.005,z(x)) for x in G.lin(a,b,max(3,round((b-a)/.023)))]
            G.sweep(m,path,[(-.003,-.006),(.009,-.006),(.013,-.004),(.013,.004),(.009,.006),(-.003,.006)],'chrome',(0,-1,0))
            emit(m,'car.grille.horizontal.%02d.%02d'%(row,section),'nose',.0008)
    for i,x in enumerate(G.lin(-.900,.900,13)):
        if abs(x)>.837:continue
        a,b=LOWER(abs(x))+.002,UPPER(abs(x))-.006
        occupied=[]
        for centre in [-p for p in D.LAMP_X]+list(D.LAMP_X):
            dx=x-centre
            if abs(dx)<D.LAMP_BEZEL_RADIUS+.002:
                height=math.sqrt((D.LAMP_BEZEL_RADIUS+.002)**2-dx*dx)
                occupied.append((D.LAMP_Z-height,D.LAMP_Z+height))
        intervals=[(a,b)]
        for lo,hi in occupied:
            pieces=[]
            for a,b in intervals:
                if hi<=a or lo>=b: pieces.append((a,b))
                else:
                    if a<lo: pieces.append((a,lo))
                    if b>hi: pieces.append((hi,b))
            intervals=pieces
        for j,(a,b) in enumerate(intervals):
            if b-a<.005: continue
            m=K.Mesh()
            section=[(-.0065,-.007),(.001,-.007),(.0025,-.0055),(.0025,.0055),(.001,.007),(-.0065,.007)]
            G.sweep(m,[(x,D.fascia_y(x)+.008,z) for z in G.lin(a,b,4)],section,'chrome',(0,-1,0))
            emit(m,'car.grille.vertical.%02d.%02d'%(i,j),'nose',.0007)
    m=K.Mesh()
    rows=[[(x,D.fascia_y(x)+.087,LOWER(abs(x))+(UPPER(abs(x))-LOWER(abs(x)))*t) for x in G.lin(-.995,.995,95)] for t in G.lin(0,1,9)]
    G.skin(m,rows,.005,(0,-1,0),'dark')
    emit(m,'car.grille.recessed.radiator','nose',0)
    for name,z,height in (('top',lambda x:UPPER(abs(x)),.026),('lower',lower_surround,.022)):
        m=K.Mesh()
        # The top bar's deep header runs back under the hood and fender lips.
        back=(-.062,height/2-.010) if name=='top' else (-.007,-height/2)
        section=[back,(.002,-height/2),(.008,-height/2+.004),
                 (.009,height/2-.004),(.003,height/2),(-.062 if name=='top' else -.007,height/2)]
        end=surround_end(lambda x:z(x)+(-.004 if name=='top' else .004))
        G.sweep(m,[(x,D.grille_y(x)-.009,z(x)) for x in G.lin(-end,end,411)],section,'chrome',(0,-1,0))
        emit(m,'car.grille.'+name+'.surround','nose',.0007)
    badge.build('grille',.208,(.333,D.fascia_y(.333)-.034,.733),'nose',-1)
    m=K.Mesh()
    for x in (.270,.398):
        G.hardware(m,(x,D.fascia_y(x)-.010,.736),(x,D.fascia_y(.333)-.034,.736),.0014,'chrome',12)
    emit(m,'car.grille.script.mounting.stems','nose',.0003)
    corner_caps()


def corner_caps():
    for s in (-1,1):
        # Body leading edge is authored behind this housing. Cutting a second
        # curved pocket from the thin shell produced exposed, folded slivers.
        # The outer edge follows the fender's leading edge at every height.
        def point(u,v):
            x=.840+.183*u
            for _ in range(3):
                low=LOWER(x)+.004;high=UPPER(x)-.004
                x=.840+(corner_outer_x(low+(high-low)*v)-.840)*u
            x*=s
            return (x,D.grille_y(x),low+(high-low)*v)
        m=K.Mesh()
        G.skin(m,[[tuple(Vector(point(u,v))+Vector((0,.025,0))) for u in G.lin(0,1,31)] for v in G.lin(0,1,15)],.007,(0,-1,0),'dark')
        emit(m,'car.grille.outer.corner.recess.'+str(s),'nose',0)
        boundary=[point(u,0) for u in G.lin(0,1,31)]
        boundary+=[point(1,v) for v in G.lin(0,1,21)[1:]]
        boundary+=[point(u,1) for u in G.lin(1,0,31)[1:]]
        boundary+=[point(0,v) for v in G.lin(1,0,21)[1:-1]]
        m=K.Mesh()
        G.sweep(m,boundary,[(-.003,-.009),(.004,-.009),(.009,-.005),(.009,.005),(.004,.009),(-.003,.009)],'chrome',(0,-1,0),True)
        emit(m,'car.grille.formed.corner.frame.'+str(s),'nose',.0008)
        # The deep outer return meets the actual trimmed fender edge. It is a
        # separate housing wall, not a backward bend in the slats themselves.
        m=K.Mesh();rows=[]
        for v in G.lin(0,1,35):
            front=Vector(point(1,v));z=front.z
            y=D.front_shell_leading(z)
            x=s*(D.side_x(y,z)+.0015)
            rear=Vector((x,D.body_y(x,y,z)+.002,z))
            rows.append([front.lerp(rear,t) for t in G.lin(0,1,45)])
        # Body colour: the fender skin wraps into the lamp frame.
        G.skin(m,rows,.004,(s,0,0),'paint')
        emit(m,'car.grille.corner.housing.return.'+str(s),'nose',0)
        for i,v in enumerate((.16,.38,.60,.82)):
            m=K.Mesh()
            G.skin(m,[[tuple(Vector(point(u,v+dv))+Vector((0,-.002,0))) for u in G.lin(.03,.98,41)] for dv in G.lin(-.047,.047,5)],.009,(0,-1,0),'chrome')
            emit(m,'car.grille.corner.slat.%s.%s'%(s,i),'nose',.0007)


def lamp(x,index):
    center=(x,D.fascia_y(x),D.LAMP_Z)
    m=K.Mesh()
    G.turn(m,[(-.079,0),(-.078,.020),(-.066,.039),(-.050,.056),(-.023,.0705),(-.007,.0739),
              (-.004,.0791),(.004,D.LAMP_BEZEL_RADIUS),(.011,.0801),(.012,.0751),(.006,.0720),(-.023,.0671),
              (-.049,.0521),(-.065,.0307),(-.073,0)],(0,-1,0),center,'chrome',144)
    for s in (-1,1):
        G.hardware(m,(x+s*.005,center[1]+.080,D.LAMP_Z-.006),
                   (x+s*.005,center[1]+.031,D.LAMP_Z-.006),.0007,'steel',12)
    emit(m,'car.headlamp.%d.reflector_bezel'%index,'nose',0)
    m=K.Mesh()
    G.turn(m,[(-.060,0),(-.059,.006),(-.039,.007),(-.031,.010),(-.020,.009),(-.015,0)],
           (0,-1,0),center,'bulb_glass',48)
    emit(m,'car.headlamp.%d.bulb.envelope'%index,'nose',0)
    m=K.Mesh()
    path=[(x-.005+.010*t,center[1]+.032+.001*math.cos(t*math.tau*5),D.LAMP_Z-.006+.001*math.sin(t*math.tau*5)) for t in G.lin(0,1,61)]
    G.sweep(m,path,G.round_section(.00035,.00035,6),'bronze',(0,0,1))
    emit(m,'car.headlamp.%d.filament'%index,'nose',0)
    m=K.Mesh()
    # The lens owns a closed, curved, ribbed glass shell; it stands 2 mm inside
    # the bezel's rolled lip. The distinct back plane prevents flicker.
    rings=[]
    for side in (0,1):
        radii=G.lin(0,D.LAMP_RADIUS,28) if side==0 else G.lin(D.LAMP_RADIUS,0,64)
        for r in radii:
            ring=[]
            for a in G.lin(0,math.tau,161)[:-1]:
                xx=r*math.cos(a)
                zz=r*math.sin(a)
                dome=.0085*(1-(r/D.LAMP_RADIUS)**2)
                # A smooth outer dome and ribs on its inner face change the
                # optical thickness. Parallel wavy faces cancel refraction.
                mask=max(0,1-(r/D.LAMP_RADIUS)**6)
                flute=(.00135*(.5+.5*math.cos(xx*math.tau/.0065))+
                       .00025*(.5+.5*math.cos(zz*math.tau/.009))+
                       .00035*(.5+.5*math.cos(r*math.tau/.014)))*mask
                ring.append((x+xx,center[1]-.007-dome+side*(.0022+flute),D.LAMP_Z+zz))
            rings.append(ring)
    m.loft(rings,'lamp',cap=False,smooth=True)
    emit(m,'car.headlamp.%d.sealed.fluted.lens'%index,'nose',0)
    m=K.Mesh()
    G.turn(m,[(.008,.0735),(.009,.0735),(.010,.0752),(.008,.076)],(0,-1,0),center,'rubber',144,True)
    emit(m,'car.headlamp.%d.lens.retaining.gasket'%index,'nose',0)


def bumper():
    m=K.Mesh()
    # Multi-level rolled stamped cross section with a rounded upper ledge.
    profile=[(-.007,-.070),(-.002,-.078),(.050,-.078),(.070,-.064),(.079,.043),
             (.056,.066),(.025,.073),(-.004,.054),(-.010,.040),(-.007,-.065)]
    # Sweep's across points down for a +X path, so the cross-section is inverted.
    def central_ring(x):
        ring=[(x,D.fascia_y(x)-.042-depth,.545+.006*(1-(x/.960)**2)+z) for depth,z in profile]
        # Apron and bumper are one solid stamping, with one owner for their
        # upper ledge. No second closed skin lies on the bumper crown.
        top=(x,D.grille_y(x)+.003,lower_surround(x)+.005)
        ring[7:7]=[top,(x,top[1]+.007,top[2]-.003)]
        return ring
    def returned_ring(s,u):
        angle=min(1,u/.55)*math.pi/2
        x=D.Curve([(0,.900),(.35,1.029),(.65,1.034),(1,1.031)])(u)
        y=D.Curve([(0,D.fascia_y(.900)-.042),(.35,-2.510),(.65,-2.417),(1,-2.300)])(u)
        z=D.Curve([(0,.545+.006*(1-(.900/.960)**2)),(.35,.535),(.65,.510),(1,.481)])(u)
        height=1+.563*u
        depth_scale=1-.88*u*u*(3-2*u)
        ring=[]
        for depth,zz in profile:
            height_z=zz*height
            yy=y-depth*depth_scale*math.cos(angle)-.47*height_z*u*u
            xx=x+depth*depth_scale*math.sin(angle)
            ring.append((s*xx,yy,z+height_z))
        # A finite return section remains planar right through the end cap.
        start=Vector(central_ring(s*.900)[7])
        upper_z=D.Curve([(0,start.z),(.35,.696),(.65,.654),(1,.588)])(u)
        upper=Vector((s*(x+.009*math.sin(angle)),y+.009*math.cos(angle)-.47*(upper_z-z)*u*u,upper_z))
        if u<.15:
            blend=u/.15;blend=blend*blend*(3-2*blend)
            upper=start.lerp(upper,blend)
        ring[7:7]=[tuple(upper),tuple(upper+Vector((-s*.007*math.sin(angle),.007*math.cos(angle),-.003)))]
        return ring
    rings=[returned_ring(-1,u) for u in G.lin(1,0,51)]
    rings.extend(central_ring(x) for x in G.lin(-.900,.900,151)[1:-1])
    rings.extend(returned_ring(1,u) for u in G.lin(0,1,51))
    m.loft(rings,'chrome',smooth=True)
    obj=emit(m,'car.front.bumper.stamped','front_bumper',0)
    for s in (-1,1):
        cx=s*.690
        opening=G.rounded_rect(.603,.041,.008,12)
        cutter=G.cutters_prism([(s*.482+x,-2.91,.553+z) for x,z in opening],(0,.55,0))
        G.exact_cut(obj,cutter,'Long open bumper indicator slot')
        outline=G.rounded_rect(.170,.037,.007,12)
        m=K.Mesh()
        path=[(cx+x,D.fascia_y(cx+x)-.119,.553+z) for x,z in outline]
        G.sweep(m,path,G.round_section(.004,.003,10),'chrome',(0,-1,0),True)
        emit(m,'car.front.indicator.frame.'+str(s),'front_bumper',.0004)
        m=K.Mesh()
        rows=[[(cx+x,D.fascia_y(cx+x)-.114-.0007*(.5+.5*math.cos(x*math.tau/.007)),.553+z)
               for x in G.lin(-.080,.080,81)] for z in G.lin(-.015,.015,17)]
        G.skin(m,rows,.003,(0,-1,0),'amber')
        emit(m,'car.front.indicator.lens.'+str(s),'front_bumper',.0004)
        m=K.Mesh()
        G.skin(m,[[(s*.482+x,D.fascia_y(s*.482+x)-.084,.553+z) for x in G.lin(-.301,.301,45)] for z in G.lin(-.023,.023,7)],
               .003,(0,-1,0),'dark')
        emit(m,'car.front.bumper.slot.recess.'+str(s),'front_bumper',.0004)
    K.finish(obj,.0025)
    for s in (-1,1):
        x=s*.468
        m=K.Mesh()
        points=[(x-.013,D.fascia_y(x)-.140,.470),(x+.013,D.fascia_y(x)-.140,.470),
                (x+.017,D.fascia_y(x)-.136,.688),(x+.009,D.fascia_y(x)-.128,.714),
                (x-.009,D.fascia_y(x)-.128,.714),(x-.017,D.fascia_y(x)-.136,.688)]
        m.prism(points,(0,.033,0),'chrome')
        emit(m,'car.front.bumper.overrider.'+str(s),'front_bumper',.004)
        m=K.Mesh()
        m.prism([(x-.007,D.fascia_y(x)-.145,.479),(x+.007,D.fascia_y(x)-.145,.479),
                 (x+.007,D.fascia_y(x)-.145,.686),(x-.007,D.fascia_y(x)-.145,.686)],(0,.006,0),'rubber')
        emit(m,'car.front.overrider.pad.'+str(s),'front_bumper',.004)
    m=K.Mesh()
    G.skin(m,[[(x,D.fascia_y(x)+.042,z+.017*(1-(x/.84)**2)) for x in G.lin(-.84,.84,70)] for z in G.lin(.385,.490,17)],.008,(0,-1,0))
    emit(m,'car.front.lower.curved.valance','nose',.001)
    plate('front',.553,D.fascia_y(0)-.131,-1,'front_bumper')
    for s in (-1,1):
        m=K.Mesh()
        ring=returned_ring(s,.86)
        face=Vector(ring[3]).lerp(Vector(ring[4]),.82)
        G.hardware(m,face-Vector((s*.003,0,0)),face+Vector((s*.003,0,0)),.007,'chrome',32)
        emit(m,'car.front.bumper.corner.fastener.'+str(s),'front_bumper',.0006)


def plate(name,z,y,facing,carrier,width=.276,height=.120,letter_size=.083):
    m=K.Mesh()
    outline=G.rounded_rect(width,height,.007,12)
    m.prism([(x,y,z+h) for x,h in outline],(0,-facing*.0025,0),'plate')
    emit(m,'car.'+name+'.Kansas.plate',carrier,.001)
    m=K.Mesh()
    G.sweep(m,[(x,y+facing*.0018,z+h) for x,h in outline],G.round_section(.0035,.0035,8),'chrome',(0,facing,0),True)
    emit(m,'car.'+name+'.plate.frame',carrier,.0004)
    for text,size,zz in [('KAZ 2Y5',letter_size,z-.042 if name=='rear' else z-.037),
                         ('KANSAS',.018,z+height*.267),('CN',.009,z+height*.15)]:
        curve=bpy.data.curves.new('plate.lettering','FONT')
        curve.body=text
        curve.font=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/'+('DIN Condensed Bold.ttf' if text=='KAZ 2Y5' else 'Arial Bold.ttf'),check_existing=True)
        K.enum_set(curve,'align_x','CENTER')
        curve.size=size
        curve.extrude=.0003
        curve.materials.append(K.MATERIALS['plate_ink'])
        obj=bpy.data.objects.new('car.'+name+'.plate.'+text,curve)
        bpy.data.collections['01_SHARED_BODY'].objects.link(obj)
        obj['impala_build']=True
        if text=='KAZ 2Y5':obj['letter_width']=.219 if name=='rear' else .215
        obj.parent=K.NODES[carrier]
        obj.location=(0,y+facing*.0025,zz)
        obj.rotation_euler=(math.pi/2 if facing<0 else math.pi/2,0,0 if facing<0 else math.pi)
        K.PARTS.append(obj)
    m=K.Mesh()
    for x in (-width*.417,width*.417):
        G.hardware(m,(x,y,z+height*.408),(x,y+facing*.004,z+height*.408),.003,'steel',12)
    emit(m,'car.'+name+'.plate.screws',carrier,.0003)


def build():
    grille()
    for i,x in enumerate([-p for p in D.LAMP_X]+list(D.LAMP_X)): lamp(x,i)
    bumper()
