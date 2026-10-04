"""Folded cast shoulder mantles, layered hip/thigh plates and enclosed ankle drives."""
import math
import bpy
from mathutils import Vector
from . import kit as K,geometry as G,robot_geometry as M,motion

DEPLOYS={}


def carrier(name,bone,stowed,opened,q,span):
    key='robot.armour.'+name
    if key not in K.NODES:K.node(key)
    DEPLOYS[key]={'bone':bone,'a':K.transform(stowed,q),'b':K.transform(opened),'span':span}
    return 'armour.'+name


def shoulder(side,s):
    bone=carrier('shoulder.'+side,'shoulder.'+side,(-s*.200,0,-.080),(0,0,0),
                 K.rotation(y=s*90),(.16,.83))
    # Crowned outer cap with a genuine recessed cooling aperture. Each face
    # turns into the surrounding surface, instead of a flat polygon slab.
    p=[(.085,-.055),(.084,.188),(.179,.349),(.354,.356),(.484,.231),
       (.508,.067),(.409,-.164),(.263,-.224),(.133,-.162)]
    hole=G.rounded_polygon([(.211,.152),(.327,.167),(.399,.099),(.330,.043),(.235,.072)],.019,8)
    def front(x,z):
        return s*x,-.213-.047*math.sin(math.pi*(x-.085)/.43)+.055*((z-.08)/.35)**2,z
    M.panel('armour.'+side+'.shoulder.crowned.mantle',bone,p,front,.031,'paint',spacing=.011,cutouts=[hole])
    M.rim('armour.'+side+'.shoulder.rolled.reveal',bone,p,
          lambda x,z:(s*x,front(x,z)[1]-.004,z),'chrome',.014,.010)
    for i in range(4):
        z=.154-i*.025
        outline=[(.219,z+.005),(.359,z+.014),(.371,z-.001),(.227,z-.010)]
        M.panel('armour.'+side+'.shoulder.cavity.louvre.'+str(i),bone,outline,
                lambda x,z:(s*x,-.190+.065*(x-.24),z),.008,'bronze',spacing=.017)
    # The top shell wraps from the front mantle over the pitch bearing.
    m=K.Mesh();rows=[]
    for u in G.lin(0,1,31):
        rows.append([(s*(.112+.374*v),-.197+.371*u,
                      .272+.064*math.sin(math.pi*v)-.110*(2*u-1)**2)
                     for v in G.lin(0,1,43)])
    G.skin(m,rows,.015,(0,0,1),'paint');M.emit(m,'armour.'+side+'.shoulder.compound.top.shell',bone)
    p=[(.103,.018),(.163,.271),(.371,.272),(.475,.142),(.426,-.149),(.271,-.216),(.147,-.150)]
    M.panel('armour.'+side+'.shoulder.dorsal.cast.yoke',bone,p,
            lambda x,z:(s*x,.190+.023*math.sin(x*9),z),.026,'dark',outward=(0,1,0),spacing=.015,
            cutouts=[G.rounded_polygon([(.223,.071),(.326,.078),(.348,-.059),(.242,-.105)],.017,8)])
    M.bearing('armour.'+side+'.shoulder.outer.differential',bone,(s*.344,.005,.064),(s,0,0),.118,.079)
    M.actuator('armour.'+side+'.shoulder.diagonal.support',bone,
               (s*.121,.132,-.124),(s*.438,.087,.192),.045)
    M.tube('armour.'+side+'.shoulder.looped.supply',bone,[(s*.113,.079,-.073),(s*.128,.171,.102),
           (s*.248,.184,.239),(s*.351,.157,.152)],.015,'dark')


def hip(side,s):
    # Follow the thigh's hip pivot: walking cannot swing its armour into the
    # guard. A solid casting below connects the raised plate to that pivot.
    bone=carrier('hip.'+side,'thigh.'+side,(s*.012,0,.045),(s*.012,-.080,.050),K.rotation(z=-s*87),(.30,.87))
    p=[(-.019,.189),(.146,.246),(.287,.129),(.310,-.119),(.231,-.401),(.080,-.531),(-.058,-.364),(-.074,-.056)]
    p=[(x,z if z>=0 else z*.72) for x,z in p]
    def surf(x,z):return s*x,-.281-.047*(1-((x-.12)/.24)**2)+.055*abs(z+.12),z
    M.panel('armour.'+side+'.hip.outer.curved.skirt',bone,p,surf,.025,'paint',spacing=.014)
    M.rim('armour.'+side+'.hip.skirt.machined.return',bone,p,
          lambda x,z:(s*x,surf(x,z)[1]-.005,z),'machined',.012,.009)
    for i in range(3):
        z=-.065-i*.098
        p=[(.011,(z+.051)*.72),(.231,(z+.008)*.72),(.214,(z-.041)*.72),(.056,(z-.015)*.72)]
        M.panel('armour.'+side+'.hip.overlap.scale.'+str(i),bone,p,
                lambda x,z:(s*x,surf(x,z)[1]-.025,z),.011,'robot_graphite',spacing=.015)
    M.bearing('armour.'+side+'.hip.skirt.hinge',bone,(s*.132,-.266,.189),(0,-1,0),.060,.049)
    # The root is inside the hip differential's axle cap in thigh space;
    # the other end enters the skirt hinge. Both ends share the same mount
    # during gait, rather than leaving a plate floating ahead of the body.
    m=K.Mesh()
    path=G.filleted_path([(s*.058,.080,-.050),(s*.098,-.070,.015),
                         (s*.132,-.266,.189)],.026,9)
    G.sweep(m,path,[(-.030,-.036),(.030,-.036),(.030,.036),(-.030,.036)],'dark',(1,0,0))
    M.emit(m,'armour.'+side+'.hip.skirt.cast.pivot.mount',bone)
    M.actuator('armour.'+side+'.hip.skirt.rear.stay',bone,
               (s*.132,-.265,.070),(s*.218,-.260,-.234),.028)
    m=K.Mesh()
    for x,y,z in ((s*.132,-.265,.070),(s*.218,-.260,-.234)):
        for dz in (-.023,.023):
            m.prism([(x-.028,y-.008,z+dz),(x+.028,y-.008,z+dz),
                     (x+.032,-.330,z+dz),(x-.032,-.330,z+dz)],(0,0,.010),'dark')
        G.hardware(m,(x,-.338,z),(x,-.319,z),.012,'bronze',6)
    M.emit(m,'armour.'+side+'.hip.stay.bonded.clevises',bone)


def thigh(side,s):
    bone='thigh.'+side
    for outward in (-1,1):
        p=[(-.101,-.197),(.097,-.145),(.172,-.371),(.141,-.744),(.054,-1.034),(-.078,-.964),(-.113,-.541)]
        surf=lambda y,z:(outward*(.181+.066*math.sin(math.pi*(-z-.1)/1.0)),y,z)
        M.panel('armour.'+side+'.thigh.lateral.compound.guard.'+str(outward),bone,p,surf,
                .018,'robot_graphite',outward=(outward,0,0),spacing=.014,
                cutouts=[G.rounded_polygon([(-.027,-.393),(.041,-.353),(.067,-.682),(-.014,-.757)],.019,7)])
        M.rim('armour.'+side+'.thigh.guard.rolled.border.'+str(outward),bone,p,surf,
              'machined',.010,.007,hint=(outward,0,0))
    for i in range(3):
        z=-.363-i*.155
        p=[(-.145,z+.041),(-.015,z+.068),(.155,z+.018),(.149,z-.034),(-.013,z+.016),(-.139,z-.011)]
        M.panel('armour.'+side+'.thigh.stepped.transverse.flute.'+str(i),bone,p,
                lambda x,z:(x,-.252-.014*(1-(x/.17)**2),z),.013,'machined',spacing=.014)
    M.bearing('armour.'+side+'.thigh.rear.gearcase',bone,(0,.171,-.254),(0,1,0),.118,.067)


def calf(side,s):
    bone=carrier('calf.'+side,'shin.'+side,(0,.020,-.045),(0,0,0),K.rotation(z=-s*72),(.37,.93))
    p=[(.096,-.248),(.257,-.181),(.341,-.355),(.323,-.856),(.197,-1.186),(.096,-1.107),(.081,-.619)]
    def surf(x,z):return s*x,-.119-.056*math.sin(math.pi*(-z-.18)/1.1),z
    M.panel('armour.'+side+'.calf.outer.flared.greave',bone,p,surf,.023,'paint',spacing=.014,
            cutouts=[G.rounded_polygon([(.179,-.428),(.259,-.449),(.239,-.796),(.163,-.743)],.016,8)])
    M.rim('armour.'+side+'.calf.flared.chrome.return',bone,p,
          lambda x,z:(s*x,surf(x,z)[1]-.004,z),'chrome',.013,.010)
    M.actuator('armour.'+side+'.calf.exposed.lift.cylinder',bone,
               (s*.235,.074,-.272),(s*.169,.098,-1.142),.052)
    for i in range(4):
        z=-.393-i*.104
        p=[(.142,z+.023),(.297,z),(.290,z-.042),(.145,z-.017)]
        M.panel('armour.'+side+'.calf.overlap.baffle.'+str(i),bone,p,
                lambda x,z:(s*x,.127,z),.012,'dark',outward=(0,1,0),spacing=.015)
    M.bearing('armour.'+side+'.calf.rear.drive.race',bone,(s*.153,.163,-.392),(0,1,0),.095,.067)


def ankle(side,s):
    bone='foot.'+side
    for sign in (-1,1):
        p=[(-.101,-.071),(-.148,-.099),(-.237,-.291),(-.156,-.361),(.207,-.361),(.271,-.297),(.251,-.202),(.127,-.126)]
        surface=lambda y,z:(sign*(.205+.035*math.sin(math.pi*(z+.36)/.3)),y,z)
        M.panel('armour.'+side+'.ankle.compound.side.guard.'+str(sign),bone,p,surface,
                .026,'paint',outward=(sign,0,0),spacing=.013,
                cutouts=[G.rounded_polygon([(-.034,-.184),(.069,-.191),(.081,-.296),(-.058,-.293)],.016,8)])
        M.rim('armour.'+side+'.ankle.cast.reveal.'+str(sign),bone,p,surface,'chrome',.010,.008,hint=(sign,0,0))
        M.bearing('armour.'+side+'.ankle.guard.recessed.pin.'+str(sign),bone,(sign*.231,-.011,-.140),
                  (sign,0,0),.061,.045)
    p=[(-.194,-.160),(.194,-.160),(.226,-.326),(.149,-.381),(-.149,-.381),(-.226,-.326)]
    M.panel('armour.'+side+'.boot.formed.heel.cover',bone,p,
            lambda x,z:(x,.246+.029*(1-(x/.24)**2),z),.021,'paint',outward=(0,1,0),spacing=.014)
    M.rim('armour.'+side+'.boot.heel.chrome.edge',bone,p,
          lambda x,z:(x,.251+.029*(1-(x/.24)**2),z),'chrome',.014,.010,hint=(0,1,0))


def glazing_frame(side,s):
    pane=[(-.299,1.027),(-.246,1.343),(.214,1.355),(.232,1.027)]
    outline=[(-.329,1.003),(-.270,1.370),(.242,1.382),(.262,1.003)]
    pane=G.rounded_polygon(pane,.007,6);outline=G.rounded_polygon(outline,.014,9)
    def surface(y,z):return s*(.919-.130*max(0,min(1,(z-1.025)/.330))),y,z
    m=K.Mesh();G.constrained_skin(m,outline,[],[],surface,.011,(s,0,0),'paint',cutouts=[pane])
    m.build('robot.armour.'+side+'.window.pierced.black.casting','02_MECHANICAL_CORE',parent='window.front.'+side,bevel=0)
    m=K.Mesh();G.sweep(m,[surface(y,z) for y,z in outline],G.round_section(.012,.010,12),'chrome',(s,0,0),True)
    m.build('robot.armour.'+side+'.window.outer.rolled.chrome.reveal','02_MECHANICAL_CORE',parent='window.front.'+side,bevel=0)


def build():
    DEPLOYS.clear()
    for obj in list(K.PARTS):
        if not obj.name.startswith('robot.armour.'):continue
        mesh=obj.data;K.PARTS.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
        if mesh.users==0:bpy.data.meshes.remove(mesh)
    start=len(K.PARTS)
    for side,s in (('L',1),('R',-1)):
        shoulder(side,s);hip(side,s);thigh(side,s);calf(side,s);ankle(side,s);glazing_frame(side,s)
    K.finalize(K.PARTS[start:])
    return {'formed_parts':len(K.PARTS)-start,'folding_carriers':len(DEPLOYS)}


def worlds(t,core):
    return {name:core[spec['bone']]@motion.mix(spec['a'],spec['b'],motion.smooth(t,*spec['span']))
            for name,spec in DEPLOYS.items()}
