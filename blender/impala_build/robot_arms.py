"""Open arm mechanisms, layered gauntlets, and individually jointed hands."""
import math
from . import kit as K,geometry as G,robot_geometry as M,rig


def upperarm(side,s):
    bone='upperarm.'+side
    # Independent front/back webs leave the power train exposed at the sides.
    for face,y in (('front',-.147),('back',.139)):
        p=[(-.085,-.080),(.085,-.080),(.142,-.245),(.114,-.654),
           (.077,-.928),(-.077,-.928),(-.114,-.654),(-.142,-.245)]
        holes=[G.rounded_polygon([(-.043,-.274),(.043,-.274),(.046,-.542),(-.046,-.542)],.016,6)]
        M.panel('arm.'+side+'.'+face+'.apertured.load.web',bone,p,
                lambda x,z:(x,y+.026*(z/.94)**2,z),.025,'dark',
                outward=(0,-1 if y<0 else 1,0),spacing=.020,cutouts=holes)
    for x in (-.135,.135):
        M.actuator('arm.'+side+'.oblique.drive.'+str(x),bone,
                   (x,-.081,-.126),(x*.76,-.055,-.934),.044)
    p=[(-.124,-.200),(-.025,-.163),(.100,-.199),(.115,-.460),
       (.074,-.751),(-.020,-.845),(-.104,-.660)]
    surf=lambda x,z:(x,-.205-.033*(1-(x/.15)**2)+.022*(z+.45)**2,z)
    M.panel('arm.'+side+'.formed.biceps.cuirass',bone,p,surf,.018,'paint',spacing=.012)
    M.rim('arm.'+side+'.biceps.machined.reveal',bone,p,
          lambda x,z:(x,surf(x,z)[1]-.003,z),'machined',.013,.009)
    for i in range(3):
        z=-.333-i*.075
        p=[(-.073,z),(.063,z+.018),(.064,z-.004),(-.073,z-.020)]
        M.panel('arm.'+side+'.biceps.recessed.rib.'+str(i),bone,p,
                lambda x,z:(x,surf(x,z)[1]-.003,z),.008,'robot_graphite',spacing=.016)
    M.tube('arm.'+side+'.return.cable',bone,[(s*.115,.173,-.092),(s*.165,.195,-.348),
           (s*.140,.193,-.679),(s*.086,.163,-.936)],.016,'dark')
    M.bearing('elbow.'+side+'.pitch.race','forearm.'+side,(0,0,0),(s,0,0),.145,.335)


HOUSING=((-.105,.221,.240),(-.153,.310,.326),(-.363,.319,.333),
         (-.689,.268,.282),(-.865,.216,.224),(-.925,.180,.193))


def housing_front(z):
    """Front face of the forearm housing at a station (bone frame)."""
    rows=[(zz,.014-d/2) for zz,w,d in HOUSING]
    if z>=rows[0][0]:return rows[0][1]
    for (a,ya),(b,yb) in zip(rows,rows[1:]):
        if b<=z<=a:return ya+(yb-ya)*(z-a)/(b-a)
    return rows[-1][1]


def gauntlet_y(x,z):
    """Inner gauntlet face: seated on the housing, crowned 36 mm at the spine."""
    return housing_front(z)-.004-.036*max(0,1-(x/.2)**2)


def forearm(side,s):
    bone='forearm.'+side
    m=K.Mesh()
    rings=[]
    for z,w,d in HOUSING:
        rings.append([(x,y+.014,z) for x,y in G.rounded_rect(w,d,.038,10)])
    m.loft(rings,'dark',smooth=True)
    M.emit(m,'forearm.'+side+'.tapered.cast.power.housing',bone)
    # The rear door becomes the large outer gauntlet. This smaller plate
    # covers the other face, with a recessed spine and actual apertures.
    p=[(-.139,-.179),(-.019,-.117),(.157,-.207),(.173,-.543),
       (.103,-.867),(-.021,-.932),(-.142,-.803),(-.162,-.375)]
    holes=[G.rounded_polygon([(-.084,-.338),(-.034,-.319),(-.033,-.562),(-.080,-.588)],.009,6)]
    surf=lambda x,z:(x,gauntlet_y(x,z),z)
    M.panel('forearm.'+side+'.inner.formed.gauntlet',bone,p,surf,.019,'paint',spacing=.012,cutouts=holes)
    M.rim('forearm.'+side+'.gauntlet.rolled.chrome.edge',bone,p,
          lambda x,z:(x,surf(x,z)[1]-.004,z),'chrome',.013,.009)
    p=[(.058,-.241),(.110,-.265),(.073,-.747),(.032,-.801)]
    M.panel('forearm.'+side+'.raised.longitudinal.stamping',bone,p,
            lambda x,z:(x,surf(x,z)[1]-.012,z),.014,'machined',spacing=.013)
    for x in (-s*.147,s*.115):
        M.actuator('forearm.'+side+'.wrist.drive.'+str(x),bone,
                   (x,.107,-.232),(x*.65,.105,-.912),.038)
    M.tube('forearm.'+side+'.braided.feed',bone,[(s*.146,.117,-.106),(s*.180,.149,-.361),
           (s*.132,.151,-.682),(s*.087,.106,-.927)],.015,'bronze')
    M.bearing('wrist.'+side+'.roll.coupling','hand.'+side,(0,0,.022),(0,0,1),.107,.134)


def phalanx(side,name,index,length,width):
    bone=name+str(index)+'.'+side
    m=K.Mesh();rings=[]
    for z,w,d in ((-length*.08,width*.69,.054),(-length*.25,width,.074),
                  (-length*.74,width*.89,.069),(-length*.96,width*.57,.047)):
        rings.append([(x,y+.004,z) for x,y in G.rounded_rect(w,d,.013,6)])
    m.loft(rings,'dark',smooth=True)
    M.emit(m,'hand.'+side+'.'+name+'.phalange.'+str(index),bone)
    p=[(-width*.34,-length*.21),(width*.34,-length*.21),(width*.38,-length*.73),
       (width*.24,-length*.88),(-width*.24,-length*.88),(-width*.38,-length*.73)]
    M.panel('hand.'+side+'.'+name+'.dorsal.plate.'+str(index),bone,p,
            lambda x,z:(x,-.039-.006*(1-(x/(width*.5))**2),z),.006,'machined',spacing=.010)
    m=K.Mesh()
    for z in (-.010,-length+.009):
        G.turn(m,[(-width*.56,.013),(-width*.56,.025),(width*.56,.025),(width*.56,.013)],
               (1,0,0),(0,0,z),'bronze',40,True)
        G.hardware(m,(-width*.61,0,z),(width*.61,0,z),.009,'machined',16)
    M.emit(m,'hand.'+side+'.'+name+'.hinge.pins.'+str(index),bone)
    if index==3:
        p=[(-width*.28,-length+.037),(width*.28,-length+.037),(width*.19,-length+.012),(-width*.19,-length+.012)]
        M.panel('hand.'+side+'.'+name+'.grip.pad',bone,p,lambda x,z:(x,.041,z),.009,
                'rubber',outward=(0,1,0),spacing=.011)


def hand(side,s):
    bone='hand.'+side
    m=K.Mesh();rings=[]
    for z,w,d in ((-.048,.170,.140),(-.092,.294,.152),(-.205,.337,.152),(-.253,.318,.118)):
        rings.append([(x,y,z) for x,y in G.rounded_rect(w,d,.035,10)])
    m.loft(rings,'dark',smooth=True);M.emit(m,'hand.'+side+'.sculpted.palm.casting',bone)
    p=[(-.132,-.112),(-.080,-.082),(.074,-.082),(.135,-.117),(.135,-.214),
       (.092,-.244),(-.097,-.244),(-.139,-.211)]
    surf=lambda x,z:(x,-.080-.013*(1-(x/.15)**2),z)
    M.panel('hand.'+side+'.dorsal.knuckle.plate',bone,p,surf,.009,'robot_graphite',spacing=.011)
    M.rim('hand.'+side+'.knuckle.border',bone,p,lambda x,z:(x,surf(x,z)[1]-.003,z),'machined',.007,.005)
    m=K.Mesh()
    for i in range(4):
        x=(i-1.5)*.085
        G.sweep(m,[(x,-.095,-.100),(x,-.098,-.215)],G.round_section(.014,.008,8),'chrome',(0,-1,0))
        G.hardware(m,(x,-.069,-.247),(x,-.099,-.247),.012,'bronze',6)
    M.emit(m,'hand.'+side+'.metacarpal.rails.and.fasteners',bone)
    for i,name in enumerate(rig.FINGERS):
        width=(.073,.077,.074,.064)[i]
        for index,length in enumerate(rig.PHAL,1):phalanx(side,name,index,length,width)
    M.bearing('hand.'+side+'.thumb.saddle.pivot',bone,(-s*.151,.020,-.112),(s,0,0),.046,.040)
    for index,length in enumerate((.090,.065,.055),1):phalanx(side,'thumb',index,length,.078)


def build():
    for side,s in (('L',1),('R',-1)):
        upperarm(side,s);forearm(side,s);hand(side,s)
