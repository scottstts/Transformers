"""Swept Impala helmet: raised sagittal blades, cut brow and compact ear hubs."""
import math
from mathutils import Vector
from . import kit as K, geometry as G, robot_geometry as M, contract as D

STATIONS=[(.110,.076,-.135,.025),(.160,.108,-.153,.069),
          (.240,.132,-.169,.100),(.315,.143,-.207,.114),
          (.365,.141,-.201,.110),(.410,.128,-.175,.094),
          (.447,.102,-.141,.069),(.469,.059,-.090,.030),
          (.478,.009,-.041,-.018)]
WIDTH=D.Curve([(z,w) for z,w,f,b in STATIONS])
FRONT=D.Curve([(z,f) for z,w,f,b in STATIONS])
BACK=D.Curve([(z,b) for z,w,f,b in STATIONS])


def ring(z):
    w,f,b=WIDTH(z),FRONT(z),BACK(z)
    # One C1 rounded-square section shared by shell and applied temple panels.
    # The previous piecewise flank had a moving kink crossed by arbitrary
    # panel triangles, producing the sawtooth highlight on both temples.
    def power(v):return math.copysign(abs(v)**(2/3),v)
    return [Vector((w*power(math.cos(a)),(f+b)/2+(b-f)/2*power(math.sin(a)),z))
            for a in G.lin(0,math.tau,161)[:-1]]


def front_y(x,z):
    w,f,b=WIDTH(z),FRONT(z),BACK(z)
    u=min(1,abs(x)/w)
    return (f+b)/2-(b-f)/2*max(0,1-u**3)**(1/3)


def flank_x(y,z):
    w,f,b=WIDTH(z),FRONT(z),BACK(z)
    t=min(.9999,abs((y-(f+b)/2)/((b-f)/2)))
    return w*max(0,1-t**3)**(1/3)


def shell():
    m=K.Mesh()
    m.loft([ring(z) for z in G.lin(.315,.478,88)],'robot_graphite',smooth=True)
    M.emit(m,'head.helmet.swept.cranial.shell','head')
    m=K.Mesh();rows=[]
    for z in G.lin(.130,.316,28):
        w=WIDTH(z)-.010;b=BACK(z)
        rows.append([(w,-.045,z),(w,.045,z),(.64*w,b,z),
                     (-.64*w,b,z),(-w,.045,z),(-w,-.045,z)])
    G.skin(m,rows,.016,(0,1,0),'dark')
    M.emit(m,'head.occipital.open.nape.housing','head')
    m=K.Mesh()
    m.loft([[(x,y,z) for x,y in ((-w,-.146),(w,-.146),(w,.035),(-w,.035))]
            for z,w in ((.123,.059),(.180,.087),(.283,.112),(.329,.118))], 'dark')
    M.emit(m,'head.inner.skull.core','head',.003)


def crest():
    # Raised blade stampings sweep up and back from the V tip.
    central=[(-.222,.306),(-.224,.367),(-.200,.448),(-.142,.494),
             (-.057,.515),(.017,.506),(.014,.485),(-.053,.489),
             (-.131,.467),(-.177,.419),(-.195,.357)]
    m=K.Mesh()
    m.prism([(-.015,y,z) for y,z in G.rounded_polygon(central,.004,8)],(.030,0,0),'robot_graphite')
    M.emit(m,'head.crest.raised.swept.central.blade','head',.002)
    for s in (-1,1):
        path=[(s*.016,y,z) for y,z in central[1:6]]
        M.tube('head.crest.%s.silver.edge'%s,'head',path,.0024,'machined')
        outline=[(-.204,.332),(-.202,.389),(-.166,.447),(-.100,.480),
                 (-.017,.487),(.060,.457),(.082,.409),(.053,.404),
                 (.020,.441),(-.035,.457),(-.102,.449),(-.152,.413),(-.175,.354)]
        def surface(y,z):
            return s*(.056+.050*max(0,min(1,(.460-z)/.120))),y,z
        M.panel('head.crest.%s.swept.side.blade'%s,'head',G.rounded_polygon(outline,.004,8),surface,
                .014,'robot_graphite',outward=(s,0,0),spacing=.005)
        M.tube('head.crest.%s.machined.outer.arris'%s,'head',
               [surface(y,z) for y,z in outline[1:7]],.003,'machined')
        p=[(-.168,.367),(-.117,.427),(-.043,.451),(.039,.423),
           (.041,.381),(-.014,.367),(-.048,.343),(-.102,.342)]
        obj=M.panel('head.temple.%s.recessed.crown.panel'%s,'head',G.rounded_polygon(p,.003,8),
                lambda y,z:(s*(flank_x(y,z)+.004),y,z),.006,'robot_graphite',
                outward=(s,0,0),spacing=.0025)


def brow():
    for s in (-1,1):
        p=[(.015,.332),(.059,.346),(.129,.369),(.138,.353),
           (.113,.337),(.034,.309),(.017,.311)]
        M.panel('head.brow.%s.tapered.bronze.blade'%s,'head',p,
                lambda x,z:(s*x,front_y(x,z)-.013,z),.010,'head_brow_alloy',spacing=.004)
        M.tube('head.brow.%s.upper.silver.arris'%s,'head',
               [(s*x,front_y(x,z)-.016,z) for x,z in p[1:4]],.002,'machined')
    m=K.Mesh()
    m.prism([(-.018,-.221,.344),(0,-.234,.301),(.018,-.221,.344),
             (.013,-.212,.368),(-.013,-.212,.368)],(0,.014,0),'robot_graphite')
    M.emit(m,'head.brow.central.black.keel','head',.001)


def ears():
    for s in (-1,1):
        c=(s*.144,.022,.312);m=K.Mesh()
        G.turn(m,[(-.006,0),(-.006,.042),(.003,.050),(.014,.050),
                  (.019,.043),(.019,0)],(s,0,0),c,'robot_graphite',72)
        G.turn(m,[(.018,.033),(.018,.041),(.022,.044),(.027,.041),
                  (.027,.034),(.023,.032)],(s,0,0),c,'machined',72,True)
        G.turn(m,[(.020,0),(.020,.031),(.027,.031),(.030,.024),(.030,0)],
               (s,0,0),c,'dark',64)
        G.turn(m,[(.029,0),(.029,.020),(.036,.019),(.040,.012),(.040,0)],
               (s,0,0),c,'bronze',48)
        for a in G.lin(0,math.tau,7)[:-1]:
            y=.022+.036*math.cos(a);z=.312+.036*math.sin(a)
            G.hardware(m,(s*.170,y,z),(s*.173,y,z),.0026,'dark',6)
        M.emit(m,'head.ear.%s.compact.recessed.hub'%s,'head')
        m=K.Mesh()
        m.loft([[(s*(.146+x),.031+y,z) for x,y in
                 ((-w,-d),(w,-d),(w,d),(-w,d))]
                for z,w,d in ((.346,.017,.024),(.393,.015,.019),
                              (.505,.008,.010),(.571,.002,.003))],'robot_graphite')
        M.emit(m,'head.%s.tapered.antenna.blade'%s,'head',.001)
        M.panel('head.%s.antenna.socket.plate'%s,'head',
                [(-.010,.346),(-.005,.381),(.051,.377),(.062,.348)],
                lambda y,z:(s*.161,y,z),.010,'dark',outward=(s,0,0),spacing=.006)
        for i in range(3):
            z=.190+i*.050
            p=[(-.010,z),(.072,z+.013),(.097,z+.039),(.063,z+.053),(-.006,z+.032)]
            M.panel('head.nape.%s.overlapping.lame.%s'%(s,i),'head',p,
                    lambda y,z:(s*(flank_x(y,z)+.007),y,z),.013,
                    'robot_graphite',outward=(s,0,0),spacing=.008)
            M.tube('head.nape.%s.lame.edge.%s'%(s,i),'head',
                   [(s*(flank_x(y,h)+.010),y,h) for y,h in p[:3]],.0025,'machined')


def build():
    shell();crest();brow();ears()
