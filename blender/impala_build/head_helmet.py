"""Crowned helmet, separate crest stampings, V brow, ear rotors and rigid horns."""
import math
import bpy
from mathutils import Vector
from . import kit as K,geometry as G,robot_geometry as M,contract as D

# Concept helmet: nearly as deep as it is tall. The crown stays broad, peaks
# toward the front and falls away to the back, so the side reads as a wedge.
# The occiput keeps its depth down to the nape. Depth is bounded by the bonnet
# storage volume.
STATIONS=[(.055,.050,-.130,.000),(.106,.090,-.185,.050),(.180,.128,-.200,.100),
          (.258,.148,-.208,.128),(.315,.152,-.216,.138),(.365,.150,-.212,.132),
          (.410,.141,-.200,.112),(.445,.122,-.182,.082),(.468,.090,-.155,.040),
          (.481,.045,-.124,-.008),(.486,.010,-.098,-.040)]
TOP=STATIONS[-1][0]
WIDTH=D.Curve([(z,w) for z,w,f,b in STATIONS])
FRONT=D.Curve([(z,f) for z,w,f,b in STATIONS])
BACK=D.Curve([(z,b) for z,w,f,b in STATIONS])


def ring(z):
    w,f,b=WIDTH(z),FRONT(z),BACK(z)
    # Rounded occiput: the back crowns out past the flanks instead of a flat cut.
    back=[(w*math.cos(a),b*.52+(b*.48+.006)*math.sin(a)**.7,z)
          for a in (math.radians(d) for d in (30,60,90,120,150))]
    plan=[(0,f,z),(.55*w,f+.020,z),(w,f*.47,z),(w,b*.52,z),*back,
          (-w,b*.52,z),(-w,f*.47,z),(-.55*w,f+.020,z)]
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


def crown_z(y):
    """Sagittal crown height at a fore-aft station."""
    for z in G.lin(TOP,.312,200):
        if front_y(0,z)<=y<=back_y(0,z):return z
    return .312


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
    zs=sorted(set(G.lin(.312,TOP,75)+[z for z,w,f,b in STATIONS if z>=.312]))
    m.loft([ring(z) for z in zs],'robot_graphite',smooth=True)
    obj=M.emit(m,'head.helmet.crowned.cast.shell','head')
    opening=[(-.047,.072),(.047,.072),(.097,.145),(.119,.265),(.125,.319),(-.125,.319),(-.119,.265),(-.097,.145)]
    cutter=G.cutters_prism([(x,-.340,z) for x,z in opening],(0,.249,0))
    bpy.context.view_layer.update()
    cutter.matrix_world=obj.matrix_world.copy()
    G.exact_cut(obj,cutter,'Open helmet face socket')
    m=K.Mesh();rows=[]
    # Occipital housing continues the helmet's own rear plan below the brow
    # band, so the shell and nape meet without a step at the flanks.
    for z in G.lin(.115,.313,58):
        w=WIDTH(z);side=BACK(z)*.52-.045
        points=[Vector((w,side,z))]+ring(z)[24:80]+[Vector((-w,side,z))]
        row=[]
        for i,(a,c) in enumerate(zip(points,points[1:])):
            steps=6 if i in (0,len(points)-2) or (i-1)%8==7 else 1
            row.extend(tuple(a.lerp(c,t)) for t in G.lin(0,1,steps+1)[:-1])
        row.append(tuple(points[-1]));rows.append(row)
    G.skin(m,rows,.017,(0,1,0),'dark')
    M.emit(m,'head.occipital.stepped.nape.casting','head')
    return obj


def core():
    """Dark inner skull casting behind the face seams, inset inside every shell."""
    m=K.Mesh();rings=[]
    for z in G.lin(.118,.330,44):
        w,f,b=WIDTH(z),FRONT(z),BACK(z);c=(f+b)/2;half=(b-f)/2
        # Deeper front inset clears the swept-back faceplate.
        kx,kf,kb=(w-.016)/w,(half-.030)/half,(half-.016)/half
        rings.append([Vector((p.x*kx,c+(p.y-c)*(kf if p.y<c else kb),z)) for p in ring(z)])
    m.loft(rings,'dark',smooth=True)
    M.emit(m,'head.inner.skull.core','head')


def brow():
    # Heavy V visor: it overhangs the optics and comes to a point between them.
    for s in (-1,1):
        outline=[(0,.343),(.022,.330),(.140,.372),(.152,.352),(.134,.336),(.026,.298),(0,.306)]
        M.panel('head.brow.%s.angled.stamped.blade'%s,'head',outline,
                lambda x,z:(s*x,front_y(s*x,z)-.010,z),.016,'head_brow_alloy',spacing=.004)


# Forward-swept forehead fin in side profile (y, z); its base is buried in the crown.
# Its top runs level with the crown so, head-on, it reads as the central ridge.
FIN=[(-.226,.338),(-.236,.420),(-.252,.480),(-.238,.488),(-.186,.476),(-.140,.468),
     (-.130,.450),(-.175,.400),(-.200,.338)]


def fin():
    # Wedge section: a knife leading edge widening aft into the crown.
    m=K.Mesh()
    rings=[[Vector((x,y+(.018 if x else 0),z)) for y,z in FIN] for x in (-.024,0,.024)]
    m.loft(rings,'robot_graphite',cap=True,smooth=False)
    M.emit(m,'head.forehead.swept.crest.fin','head')


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
    # The crest rail caps the fin, then runs over the crown and down the back.
    m=K.Mesh()
    path=[tuple(p) for p in G.catmull([(0,-.250,.484),(0,-.238,.492),(0,-.186,.480),(0,-.150,crown_z(-.150)+.005)],8)]
    path += [(0,y,crown_z(y)+.005) for y in G.lin(-.140,back_y(0,TOP)-.004,24)]
    path += [(0,back_y(0,z)+.008,z) for z in G.lin(TOP-.010,.370,72)]
    G.sweep(m,path,[(-.006,-.012),(.002,-.012),(.006,-.009),(.007,.009),(.002,.012),(-.006,.012)],
            'head_brow_alloy',(0,-.3,1))
    M.emit(m,'head.central.longitudinal.crest','head')


EAR_Y=.036
EAR_SCALE=1.32


def blade(m,base,axis,height,width,depth,mat):
    """Tapered faceted antenna blade with a sharpened tip."""
    a=Vector(axis).normalized();u=(Vector((1,0,0))-a*a.x).normalized();v=a.cross(u)
    rings=[]
    for t in G.lin(0,1,14):
        k=1-.78*t**1.3
        c=Vector(base)+a*height*t
        rings.append([c+u*x+v*y for x,y in G.rounded_rect(width*k,depth*k,min(width,depth)*k*.22,4)])
    m.loft(rings+[[Vector(base)+a*(height+.012)]*len(rings[0])],mat,cap=True,smooth=False)


def ears():
    for s in (-1,1):
        m=K.Mesh()
        center=(s*.166,EAR_Y,.309)
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
            y=EAR_Y+.042*math.cos(angle);z=.309+.042*math.sin(angle)
            G.hardware(m,(s*.188,y,z),(s*.191,y,z),.0024,'machined',8)
        # Concept ear discs are about a third of the head height; scale the
        # stack about its seat on the flank so it stays mounted.
        seat=Vector((s*.159,EAR_Y,.309))
        m.v=[seat+(p-seat)*EAR_SCALE for p in m.v]
        M.emit(m,'head.ear.%s.layered.rotor'%s,'head')
        # Concept antennas are tall tapered blades, not round whips.
        m=K.Mesh();axis=(s*.06,.08,1);base=(s*.168,EAR_Y+.010,.350)
        blade(m,base,axis,.230,.026,.034,'robot_graphite')
        G.turn(m,[(0,.017),(.014,.017),(.018,.021),(.033,.021),(.039,.017),(.039,.013)],
               axis,base,'machined',40,True)
        M.emit(m,'head.%s.rigid.antenna.horn'%s,'head')
        outline=[(-.059,.265),(.056,.263),(.058,.314),(.029,.366),(-.025,.364),(-.056,.315)]
        M.panel('head.temple.%s.ear.yoke'%s,'head',outline,
                lambda y,z:(s*(flank_x(y+EAR_Y+.034,z)+.003),y+EAR_Y+.034,z),.008,'robot_graphite',outward=(s,0,0),spacing=.006)
        p=[(-.133,.330),(-.110,.354),(-.025,.397),(.052,.373),(.069,.343),
           (.042,.323),(-.081,.331),(-.129,.316)]
        surface=lambda y,z:(s*(flank_x(y,z)+.008),y,z)
        M.panel('head.temple.%s.swept.metal.brow.plate'%s,'head',p,surface,.011,'head_brow_alloy',
                outward=(s,0,0),spacing=.005,
                cutouts=[G.rounded_polygon([(-.078,.368),(-.031,.391),(-.021,.380),(-.063,.358)],.004,6)])
        M.rim('head.temple.%s.metal.rolled.brow.reveal'%s,'head',p,surface,
              'mask_alloy',.006,.004,hint=(s,0,0))


def build():
    shell();core();brow();fin();crest();ears()
