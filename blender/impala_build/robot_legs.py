"""Pierced thigh webs, layered shin stampings and articulated cast-metal boots."""
import math
from . import kit as K,geometry as G,robot_geometry as M,rig


def thigh(side,s):
    bone='thigh.'+side
    for face,y in (('front',-.141),('rear',.132)):
        p=[(-.128,-.100),(.130,-.100),(.187,-.263),(.166,-.641),
           (.102,-1.066),(-.102,-1.066),(-.166,-.641),(-.187,-.263)]
        holes=[G.rounded_polygon([(-.054,-.306),(.054,-.306),(.047,-.685),(-.047,-.685)],.025,8)]
        M.panel('thigh.'+side+'.'+face+'.pierced.load.web',bone,p,
                lambda x,z:(x,y+.021*(z/1.1)**2,z),.030,'dark',
                outward=(0,-1 if y<0 else 1,0),spacing=.017,cutouts=holes)
    p=[(-.167,-.178),(-.047,-.103),(.181,-.220),(.165,-.680),
       (.094,-.972),(-.032,-1.064),(-.155,-.873),(-.184,-.384)]
    surf=lambda x,z:(x,-.190-.057*(1-(x/.21)**2)+.029*abs(z+.48),z)
    M.panel('thigh.'+side+'.formed.front.cuirass',bone,p,surf,.020,'paint',spacing=.011)
    M.rim('thigh.'+side+'.cuirass.chrome.return',bone,p,
          lambda x,z:(x,surf(x,z)[1]-.004,z),'chrome',.016,.010)
    p=[(-.038,-.171),(.067,-.228),(.082,-.727),(.029,-.913),(-.026,-.858)]
    M.panel('thigh.'+side+'.central.machined.ridge',bone,p,
            lambda x,z:(x,surf(x,z)[1]-.017,z),.018,'machined',spacing=.014)
    for x in (-.160,.160):
        M.actuator('thigh.'+side+'.longitudinal.ram.'+str(x),bone,
                   (x,.099,-.164),(x*.70,.112,-1.066),.054)
    for i in range(4):
        z=-.309-i*.093
        p=[(.094,z+.027),(.170,z),(.163,z-.035),(.092,z-.004)]
        M.panel('thigh.'+side+'.lateral.vent.cast.lip.'+str(i),bone,p,
                lambda x,z:(s*x,-.108,z),.014,'bronze',spacing=.017)
    M.tube('thigh.'+side+'.routed.hydraulic.line',bone,[(s*.147,.184,-.112),
           (s*.197,.201,-.417),(s*.177,.194,-.786),(s*.080,.149,-1.104)],.018,'dark')
    M.bearing('knee.'+side+'.duplex.pitch.race','shin.'+side,(0,0,0),(s,0,0),.170,.394)


def shin(side,s):
    bone='shin.'+side
    # The sculpted front fender and its wheel become a single rigid outer
    # assembly. These open inner spars stay clear of that wheel's full disk.
    for x in (-.121,.121):
        m=K.Mesh()
        path=G.catmull([(x,.052,-.154),(x*1.19,.085,-.398),(x,.069,-.947),(x*.56,.017,-1.228)],16)
        G.sweep(m,path,[(-.022,-.025),(.022,-.025),(.031,-.013),(.026,.022),(-.026,.022)],'dark',(0,-1,0))
        M.emit(m,'shin.'+side+'.curved.inner.spar.'+str(x),bone)
    p=[(-.181,-.201),(-.090,-.107),(.135,-.144),(.207,-.335),
       (.169,-.906),(.072,-1.222),(-.083,-1.259),(-.174,-1.060)]
    holes=[G.rounded_polygon([(-.106,-.386),(-.048,-.370),(-.054,-.793),(-.098,-.847)],.012,6)]
    surf=lambda x,z:(x,-.197-.061*(1-(x/.23)**2)+.018*(z+.6)**2,z)
    M.panel('shin.'+side+'.inner.formed.greave',bone,p,surf,.024,'paint',spacing=.012,cutouts=holes)
    M.rim('shin.'+side+'.greave.rolled.chrome.edge',bone,p,
          lambda x,z:(x,surf(x,z)[1]-.003,z),'chrome',.018,.011)
    p=[(-.008,-.245),(.079,-.274),(.084,-.893),(.027,-1.104),(-.017,-.962)]
    M.panel('shin.'+side+'.raised.fluted.keel',bone,p,
            lambda x,z:(x,surf(x,z)[1]-.021,z),.021,'machined',spacing=.012)
    M.actuator('shin.'+side+'.front.ankle.ram',bone,(-s*.106,-.043,-.224),(-s*.081,-.021,-1.269),.046)
    M.tube('shin.'+side+'.protected.return.line',bone,[(s*.118,.044,-.143),(s*.166,.056,-.454),
           (s*.144,.031,-.988),(s*.043,-.015,-1.273)],.014,'bronze')
    # Small separate knee cap pivots with the shin, exposing the joint race.
    p=[(-.133,.057),(0,.120),(.133,.057),(.154,-.073),(.098,-.163),(-.098,-.163),(-.154,-.073)]
    surf=lambda x,z:(x,-.170-.050*(1-(x/.18)**2),z)
    M.panel('knee.'+side+'.formed.patella','shin.'+side,p,surf,.024,'robot_graphite',spacing=.011)
    M.rim('knee.'+side+'.patella.machined.border','shin.'+side,p,
          lambda x,z:(x,surf(x,z)[1]-.004,z),'machined',.013,.010)
    M.bearing('ankle.'+side+'.transverse.drive','foot.'+side,(0,.018,0),(s,0,0),.114,.288)


def foot(side,s):
    bone='foot.'+side
    m=K.Mesh()
    plan=[(-.240,-.222),(.240,-.222),(.264,-.118),(.251,.174),(.187,.237),(-.187,.237),(-.251,.174),(-.264,-.118)]
    rings=[]
    for z,factor in ((-.410,1),(-.393,1),(-.345,.97),(-.320,.82)):
        rings.append([(x*factor,y*factor,z) for x,y in G.rounded_polygon(plan,.018,7)])
    m.loft(rings,'dark',smooth=True);M.emit(m,'boot.'+side+'.heel.cast.sole',bone)
    # Curved arch leaves the ankle bearing visible above a substantial sole.
    p=[(-.204,-.317),(-.203,-.186),(-.086,-.094),(.074,-.066),
       (.195,-.156),(.211,-.310)]
    for x in (-.193,.193):
        M.panel('boot.'+side+'.arched.side.web.'+str(x),bone,p,
                lambda y,z:(x,y,z),.026,'dark',outward=(1 if x>0 else -1,0,0),spacing=.012)
    p=[(-.222,-.257),(-.182,-.071),(.182,-.071),(.222,-.257)]
    M.panel('boot.'+side+'.ankle.front.stamping',bone,p,
            lambda x,z:(x,-.160-.068*(1-(x/.24)**2),z),.020,'paint',spacing=.014)
    M.rim('boot.'+side+'.ankle.chrome.return',bone,p,
          lambda x,z:(x,-.164-.068*(1-(x/.24)**2),z),'chrome',.015,.009)
    for x in (-.095,.095):
        M.actuator('boot.'+side+'.arch.stay.'+str(x),bone,(x,.125,-.324),(x*.74,.018,-.090),.027)
    # The articulated toe is a separate casting with its own tread and skin.
    bone='toe.'+side;m=K.Mesh()
    plan=[(-.249,.047),(.249,.047),(.278,-.217),(.244,-.433),(.161,-.477),(-.161,-.477),(-.244,-.433),(-.278,-.217)]
    rings=[]
    for z,factor in ((-.120,1),(-.102,1),(-.064,.975),(-.033,.83)):
        rings.append([(x*factor,y*factor,z) for x,y in G.rounded_polygon(plan,.023,8)])
    m.loft(rings,'dark',smooth=True);M.emit(m,'boot.'+side+'.toe.cast.sole',bone)
    p=[(-.192,.024),(.192,.024),(.235,-.211),(.204,-.421),(.117,-.459),(-.117,-.459),(-.204,-.421),(-.235,-.211)]
    surf=lambda x,y:(x,y,.040+.045*(1-(x/.26)**2)-.079*max(0,min(1,-y/.46)))
    M.panel('boot.'+side+'.formed.toe.cap',bone,p,surf,.020,'paint',outward=(0,0,1),spacing=.014)
    M.rim('boot.'+side+'.toe.chrome.edge',bone,p,
          lambda x,y:(x,y,surf(x,y)[2]+.005),'chrome',.014,.009,hint=(0,0,1))
    m=K.Mesh()
    for y in (-.096,-.206,-.316,-.416):
        G.sweep(m,[(-.217,y,-.126),(.217,y,-.126)],G.round_section(.012,.030,8),'rubber',(0,0,-1))
    G.hardware(m,(-.256,.002,.011),(.256,.002,.011),.029,'machined',32)
    M.emit(m,'boot.'+side+'.toe.tread.and.hinge',bone)


def build():
    for side,s in (('L',1),('R',-1)):
        thigh(side,s);shin(side,s);foot(side,s)
