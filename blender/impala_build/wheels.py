"""Redline touring tyres, five pierced kidney vents and dished factory hubcaps."""
import math
from . import kit as K, contract as D, geometry as G
from .body import emit


def build_one(s,y,label):
    name='wheel.'+label
    center=(s*D.WHEEL_X,y,D.WHEEL_Z)
    profile=[(-.111,.275),(-.119,.286),(-.121,.304),(-.117,.325),(-.103,.343),
             (-.085,.349),(-.061,.352),(-.027,.352),(.011,.352),(.043,.352),
             (.076,.350),(.096,.345),(.112,.332),(.122,.312),(.122,.292),
             (.115,.278),(.110,.273),(.099,.281),(.088,.312),(.066,.326),
             (-.064,.326),(-.088,.312),(-.100,.281),(-.111,.275)]
    # Resample the physical section, including its rounded bead and shoulders.
    section=G.catmull([(x,r,0) for x,r in profile],8)
    m=K.Mesh()
    rings=[]
    segments=384
    for p in section:
        # The inner bead seats on the 249 mm rim. Resizing only the outer
        # tread previously left a daylight annulus between rim and tyre.
        x=p.x
        r=.247+(p.y-.273)*(D.TYRE_RADIUS-.247)/(.352-.273)
        ring=[]
        for i in range(segments):
            a=i*math.tau/segments
            radius=r
            if r>.336 and abs(x)<.103:
                grooves=sum(.0030*math.exp(-((x-g)/.0028)**4) for g in (-.071,-.035,0,.035,.071))
                # Chevron transverse sipes join the longitudinal water channels.
                phase=(a*48/math.tau+abs(x)*13)%1
                sipe=.0027*math.exp(-((phase-.50)/.13)**4)
                radius-=grooves+sipe
            yy=y+radius*math.cos(a)
            zz=D.WHEEL_Z+radius*math.sin(a)
            # Loaded contact is in the rubber, not a body panel below ground.
            zz=max(.0015,zz)
            ring.append((s*(D.WHEEL_X+x),yy,zz))
        rings.append(ring)
    m.loft(rings,'rubber',cap=False,smooth=True)
    tire=emit(m,'car.'+name+'.molded.tyre',name,0)
    tire['tyre_radius_m']=D.TYRE_RADIUS
    tire['body_clearance_axis']='X; upper tyre is intentionally behind the wheel opening'
    for suffix,r,axial,width,mat in [('redline',.282,.1235,.0028,'redline'),('sidewall.rib',.306,.1225,.0012,'rubber')]:
        m=K.Mesh()
        G.turn(m,[(axial-width/2,r-.0015),(axial+width/2,r-.0015),(axial+width/2,r+.0015),(axial-width/2,r+.0015)],
               (s,0,0),center,mat,144,True)
        emit(m,'car.'+name+'.'+suffix,name,.0003)
    m=K.Mesh()
    G.turn(m,[(-.109,.235),(-.110,.246),(-.098,.258),(-.077,.253),(.103,.253),(.123,.247),
              (.131,.239),(.122,.230),(.107,.235),(-.090,.235)],(s,0,0),center,'steel',144,True)
    emit(m,'car.'+name+'.rim.barrel',name,.0008)
    m=K.Mesh()
    G.turn(m,[(.118,.245),(.128,.249),(.134,.246),(.133,.235),(.130,.230),(.123,.233)],
           (s,0,0),center,'chrome',144,True)
    emit(m,'car.'+name+'.rolled.rim.bead',name,.00065)
    m=K.Mesh()
    # The broad face dishes IN from the rolled outer lip. Only the small hub
    # rises from that recessed bed, and it still stays inside the lip's plane.
    G.turn(m,[(.123,.234),(.131,.231),(.125,.224),(.109,.212),(.094,.198),(.088,.186),
              (.083,.179),(.084,.148),(.083,.129),(.081,.120),(.082,.112),(.091,.105),
              (.104,.083),(.108,.064),(.111,0),(.106,0),(.103,.064),(.099,.082),
              (.086,.101),(.077,.110),(.076,.120),(.078,.129),(.079,.148),(.078,.178),
              (.083,.185),(.089,.198),(.104,.212),(.120,.224),(.126,.230)],
           (s,0,0),center,'chrome',144,True)
    cap=emit(m,'car.'+name+'.pierced.dished.hubcap',name,0)
    cap['precision_weld_m']=.0000005
    for i in range(5):
        a=i*math.tau/5+math.pi/10
        # The openings are curved kidney slots cut through the formed metal.
        points=[]
        for da,r in [(-.160,.164),(-.148,.181),(-.085,.187),(.085,.187),(.148,.181),
                     (.160,.164),(.122,.151),(.055,.147),(-.055,.147),(-.122,.151)]:
            points.append((s*(D.WHEEL_X+.065),y+r*math.cos(a+da),D.WHEEL_Z+r*math.sin(a+da)))
        smooth=G.catmull(points,4,True)
        cutter=G.cutters_prism(smooth,(s*.14,0,0))
        G.exact_cut(cap,cutter,'Pierced kidney vent %d'%i)
    K.finish(cap,.0011)
    m=K.Mesh()
    G.turn(m,[(.100,.086),(.108,.088),(.114,.082),(.115,.065),(.111,.060),(.107,.080)],
           (s,0,0),center,'chrome',96,True)
    emit(m,'car.'+name+'.hub.medallion.ring',name,.0006)
    m=K.Mesh()
    G.turn(m,[(.107,0),(.107,.060),(.112,.060),(.117,.047),(.118,0)],(s,0,0),center,'chrome',96)
    emit(m,'car.'+name+'.hub.medallion',name,.0004)
    m=K.Mesh()
    for a in G.lin(0,math.tau,6)[:-1]:
        r=.070
        G.hardware(m,(s*(D.WHEEL_X+.106),y+r*math.cos(a),D.WHEEL_Z+r*math.sin(a)),
                   (s*(D.WHEEL_X+.116),y+r*math.cos(a),D.WHEEL_Z+r*math.sin(a)),.0052,'chrome',6)
    emit(m,'car.'+name+'.hub.fasteners',name,.0003)
    # The valve follows the same radial dish datum and stays outside the slots.
    m=K.Mesh()
    for r,axial in ((.101,.0950),(.123,.0825),(.143,.0845)):
        G.turn(m,[(axial,r-.0007),(axial+.0005,r-.0007),(axial+.0005,r+.0007),(axial,r+.0007)],
               (s,0,0),center,'dark',144,True)
    emit(m,'car.'+name+'.pressed.face.concentric.reveals',name,0)
    m=K.Mesh()
    G.turn(m,[(.025,.135),(.050,.135),(.058,.180),(.064,.211),(.060,.226),
              (.047,.228),(.037,.205)],(s,0,0),center,'dark',128,True)
    emit(m,'car.'+name+'.inner.cast.drum.ring',name,.0006)
    m=K.Mesh()
    section=[(.037,.177),(.055,.211),(.054,.224),(.047,.225),(.041,.207),(.032,.177)]
    m.loft([[(s*(D.WHEEL_X+x),y+r*math.cos(a),D.WHEEL_Z+r*math.sin(a)) for x,r in section]
            for a in G.lin(-.95,.85,49)],'redline',smooth=True)
    emit(m,'car.'+name+'.painted.inner.barrel.sector',name,.0006)
    a=4.55
    m=K.Mesh()
    G.hardware(m,(s*(D.WHEEL_X+.115),y+.221*math.cos(a),D.WHEEL_Z+.221*math.sin(a)),
               (s*(D.WHEEL_X+.139),y+.221*math.cos(a),D.WHEEL_Z+.221*math.sin(a)),.004,'rubber',16)
    emit(m,'car.'+name+'.valve',name,.0005)


def build():
    for s,side in ((1,'L'),(-1,'R')):
        for y,end in ((D.FRONT_AXLE,'front'),(D.REAR_AXLE,'rear')): build_one(s,y,end+'.'+side)
