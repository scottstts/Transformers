"""Crowned helmet, separate crest stampings, V brow, ear rotors and rigid horns."""
import math
import bpy
from mathutils import Vector
from . import kit as K,geometry as G,robot_geometry as M,contract as D

STATIONS=[(.055,.042,-.118,-.048),(.106,.077,-.181,-.019),(.180,.124,-.195,.028),
          (.258,.146,-.204,.066),(.315,.151,-.220,.082),(.365,.146,-.207,.077),
          (.423,.126,-.150,.065),(.467,.083,-.081,.039),(.491,.035,-.023,.011)]
WIDTH=D.Curve([(z,w) for z,w,f,b in STATIONS])
FRONT=D.Curve([(z,f) for z,w,f,b in STATIONS])
BACK=D.Curve([(z,b) for z,w,f,b in STATIONS])


def ring(z):
    w,f,b=WIDTH(z),FRONT(z),BACK(z)
    plan=[(0,f,z),(.55*w,f+.020,z),(w,f*.47,z),(w,b*.52,z),
          (.73*w,b,z),(-.73*w,b,z),(-w,b*.52,z),(-w,f*.47,z),(-.55*w,f+.020,z)]
    return [Vector((x,y,z)) for x,y in G.rounded_polygon([(x,y) for x,y,z in plan],.008,8)]


def front_y(x,z):
    p=ring(z);values=[]
    x=max(min(a.x for a in p)+1e-7,min(max(a.x for a in p)-1e-7,x))
    for a,b in zip(p,p[1:]+p[:1]):
        if min(a.x,b.x)<=x<=max(a.x,b.x) and abs(a.x-b.x)>1e-8:
            values.append(a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x))
    return min(values) if values else FRONT(z)


def back_y(x,z):
    p=ring(z);values=[]
    x=max(min(a.x for a in p)+1e-7,min(max(a.x for a in p)-1e-7,x))
    for a,b in zip(p,p[1:]+p[:1]):
        if min(a.x,b.x)<=x<=max(a.x,b.x) and abs(a.x-b.x)>1e-8:
            values.append(a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x))
    return max(values) if values else BACK(z)


def flank_x(y,z):
    p=ring(z);values=[]
    y=max(min(a.y for a in p)+1e-7,min(max(a.y for a in p)-1e-7,y))
    for a,b in zip(p,p[1:]+p[:1]):
        if min(a.y,b.y)<=y<=max(a.y,b.y) and abs(a.y-b.y)>1e-8:
            values.append(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y))
    return max(values) if values else WIDTH(z)


def shell():
    m=K.Mesh()
    # The cranial helmet ends at the brow. It is not an egg-shaped shell
    # running continuously from the crown to the chin.
    zs=sorted(set(G.lin(.312,.491,75)+[z for z,w,f,b in STATIONS if z>=.312]))
    m.loft([ring(z) for z in zs],'robot_graphite',smooth=True)
    obj=M.emit(m,'head.helmet.crowned.cast.shell','head')
    opening=[(-.047,.072),(.047,.072),(.097,.145),(.119,.265),(.125,.319),(-.125,.319),(-.119,.265),(-.097,.145)]
    cutter=G.cutters_prism([(x,-.340,z) for x,z in opening],(0,.249,0))
    bpy.context.view_layer.update()
    cutter.matrix_world=obj.matrix_world.copy()
    G.exact_cut(obj,cutter,'Open helmet face socket')
    m=K.Mesh();rows=[]
    # Separate occipital housing with a diagonal jaw-to-nape break. A flat
    # rear spine and chamfered shoulders replace the rounded lower skull.
    for z in G.lin(.115,.321,58):
        w=WIDTH(z);b=BACK(z)
        outline=[(-w*.92,b-.055),(-w*.75,b),(-w*.44,b+.007),
                 (w*.44,b+.007),(w*.75,b),(w*.92,b-.055)]
        row=[]
        for a,c in zip(outline,outline[1:]):
            row.extend((a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t,z) for t in G.lin(0,1,9)[:-1])
        row.append((*outline[-1],z));rows.append(row)
    G.skin(m,rows,.017,(0,1,0),'dark')
    M.emit(m,'head.occipital.stepped.nape.casting','head')
    return obj


def brow():
    for s in (-1,1):
        outline=[(0,.338),(.018,.324),(.125,.359),(.137,.347),(.126,.333),(.022,.302),(0,.313)]
        M.panel('head.brow.%s.angled.stamped.blade'%s,'head',outline,
                lambda x,z:(s*x,front_y(s*x,z)-.006,z),.009,'head_brow_alloy',spacing=.004)


def crest():
    for s in (-1,1):
        # Separate pressed forehead flanks follow the helmet crown; their
        # inset vents are real openings, with a darker casting behind them.
        outline=[(.026,.345),(.120,.382),(.094,.442),(.038,.471),(.026,.439)]
        slots=[[(.072+u,.416+v) for u,v in G.rounded_rect(.012,.073,.003,8)]]
        surf=lambda x,z:(s*x,front_y(s*x,z)-.004,z)
        M.panel('head.forehead.%s.pressed.vented.flank'%s,'head',outline,surf,.007,'robot_graphite',spacing=.004,cutouts=slots)
        M.rim('head.forehead.%s.chrome.edge'%s,'head',outline,
              lambda x,z:(s*x,surf(x,z)[1]-.002,z),'head_brow_alloy',.005,.003)
        m=K.Mesh()
        path=[]
        for z in G.lin(.353,.465,60):
            x=s*WIDTH(z)*.72
            path.append((x,front_y(x,z)-.009,z))
        G.sweep(m,path,[(-.003,-.003),(.002,-.003),(.004,0),(.002,.003),(-.003,.003)],
                'head_brow_alloy',(s*.3,-.3,1))
        M.emit(m,'head.helmet.%s.longitudinal.crown.ribs'%s,'head')
    m=K.Mesh()
    path=[(0,front_y(0,z)-.012,z) for z in G.lin(.327,.491,92)]
    path += [(0,y,.500) for y in G.lin(front_y(0,.491)-.008,back_y(0,.491)+.008,16)]
    path += [(0,back_y(0,z)+.012,z) for z in G.lin(.491,.370,72)]
    G.sweep(m,path,[(-.006,-.012),(.002,-.012),(.006,-.009),(.007,.009),(.002,.012),(-.006,.012)],
            'head_brow_alloy',(0,-.5,1))
    M.emit(m,'head.central.longitudinal.crest','head')
    M.panel('head.forehead.central.inset','head',[(-.014,.344),(.014,.344),(.018,.420),(.012,.452),(-.012,.452),(-.018,.420)],
            lambda x,z:(x,front_y(x,z)-.014,z),.003,'robot_graphite',spacing=.004)


def ears():
    for s in (-1,1):
        m=K.Mesh()
        center=(s*.166,.006,.309)
        G.turn(m,[(-.007,.029),(-.007,.048),(.003,.052),(.013,.051),(.019,.046),
                  (.019,.037),(.013,.032),(.003,.029)],(s,0,0),center,'dark',96,True)
        G.turn(m,[(.015,.037),(.016,.047),(.021,.049),(.025,.044),(.025,.035),(.019,.033)],
               (s,0,0),center,'mask_alloy',96,True)
        G.turn(m,[(.016,0),(.016,.032),(.022,.034),(.027,.030),(.029,0)],
               (s,0,0),center,'bronze',80)
        G.turn(m,[(.028,.012),(.028,.022),(.032,.023),(.034,.019),(.034,.012)],
               (s,0,0),center,'machined',64,True)
        G.turn(m,[(.030,0),(.030,.010),(.035,.011),(.037,.009),(.037,0)],
               (s,0,0),center,'bronze',64)
        for angle in G.lin(0,math.tau,5)[:-1]:
            y=.006+.042*math.cos(angle);z=.309+.042*math.sin(angle)
            G.hardware(m,(s*.188,y,z),(s*.191,y,z),.0024,'machined',8)
        M.emit(m,'head.ear.%s.layered.rotor'%s,'head')
        m=K.Mesh()
        G.turn(m,[(0,0),(0,.011),(.016,.015),(.034,.012),(.100,.008),(.198,.005),(.205,.004),(.207,0)],
               (s*.030,.025,1),(s*.167,.011,.350),'robot_graphite',40)
        G.turn(m,[(0,.009),(.014,.009),(.018,.012),(.033,.012),(.039,.009),(.039,.006)],
               (s*.030,.025,1),(s*.167,.011,.355),'machined',40,True)
        M.emit(m,'head.%s.rigid.antenna.horn'%s,'head')
        outline=[(-.059,.265),(.056,.263),(.058,.314),(.029,.366),(-.025,.364),(-.056,.315)]
        M.panel('head.temple.%s.ear.yoke'%s,'head',outline,
                lambda y,z:(s*(flank_x(y+.040,z)+.003),y+.040,z),.008,'robot_graphite',outward=(s,0,0),spacing=.006)
        p=[(-.133,.330),(-.110,.354),(-.025,.397),(.052,.373),(.069,.343),
           (.042,.323),(-.081,.331),(-.129,.316)]
        surface=lambda y,z:(s*(flank_x(y,z)+.008),y,z)
        M.panel('head.temple.%s.swept.metal.brow.plate'%s,'head',p,surface,.011,'machined',
                outward=(s,0,0),spacing=.005,
                cutouts=[G.rounded_polygon([(-.078,.368),(-.031,.391),(-.021,.380),(-.063,.358)],.004,6)])
        M.rim('head.temple.%s.metal.rolled.brow.reveal'%s,'head',p,surface,
              'mask_alloy',.006,.004,hint=(s,0,0))


def build():
    shell();brow();crest();ears()
