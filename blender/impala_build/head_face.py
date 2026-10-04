"""Reference mask, optical sockets, jaw frame and machined cheek apertures."""
import math
from . import kit as K,geometry as G,contract as D,robot_geometry as M,head_helmet as H

MASK=[(-.018,.290),(-.058,.292),(-.108,.272),(-.097,.245),(-.071,.224),
      (-.062,.160),(-.039,.127),(-.023,.111),(0,.117),(.023,.111),(.039,.127),
      (.062,.160),(.071,.224),(.097,.245),(.108,.272),(.058,.292),(.018,.290)]
# Faceplate stays near-vertical under the brow with a shallow nose ridge.
BASE=D.Curve([(.105,-.196),(.129,-.210),(.178,-.217),(.230,-.212),(.275,-.207),(.300,-.196)])
NOSE=D.Curve([(.105,0),(.200,0),(.212,.008),(.232,.018),(.257,.015),(.280,.009),(.305,.003),(.319,0)])


def uv(points):
    return points


def face_point(x,z):
    nose=max(0,1-(abs(x)/.026)**2)**1.5*NOSE(z) if abs(x)<.026 else 0
    # Chevron plan: the faceplate sweeps back from the centreline.
    cheek=.20*abs(x)+.034*max(0,(abs(x)-.056)/.056)
    malar=.005*max(0,1-((abs(x)-.049)/.030)**2)**2*max(0,1-((z-.218)/.054)**2)**2
    return x,BASE(z)-nose+cheek-malar,z


def mask():
    # Battle-mask mouth: a framed opening with vertical vent slats.
    mouth=G.rounded_polygon([(-.031,.172),(.031,.172),(.035,.205),(.010,.212),(0,.209),(-.010,.212),(-.035,.205)],.003,5)
    creases=[[(x,z) for z in G.lin(.218,.283,30)] for x in (-.012,0,.012)]
    creases += [[(-.056,z) for z in G.lin(.146,.264,24)],[(.056,z) for z in G.lin(.146,.264,24)]]
    M.panel('head.mask.sculpted.nasal.cheek.facets','head',uv(MASK),face_point,.0055,'mask_alloy',
            spacing=.0035,cutouts=[uv(mouth)],creases=creases)
    M.panel('head.mask.mouth.recess','head',uv([(-.040,.166),(.040,.166),(.040,.218),(-.040,.218)]),
            lambda x,z:(x,face_point(x,z)[1]+.010,z),.003,'dark',spacing=.006)
    m=K.Mesh()
    for x0 in (-.020,-.0067,.0067,.020):
        bar=[(x0+u,.190+v) for u,v in G.rounded_rect(.0065,.034,.0015,4)]
        m.prism([(x,face_point(x,z)[1]+.009,z) for x,z in bar],(0,-.010,0),'mask_alloy')
    M.emit(m,'head.mask.mouth.vent.slats','head')
    chin=[(-.024,.108),(-.035,.127),(-.032,.150),(-.020,.164),(-.010,.168),
          (.010,.168),(.020,.164),(.032,.150),(.035,.127),(.024,.108),
          (.014,.116),(.017,.136),(.010,.150),(-.010,.150),(-.017,.136),(-.014,.116)]
    M.panel('head.chin.reinforced.fork','head',uv(chin),lambda x,z:(x,face_point(x,z)[1]-.006,z),
            .007,'mask_alloy',spacing=.004)
    M.panel('head.chin.central.keystone','head',uv([(-.014,.109),(.014,.109),(.012,.139),(0,.151),(-.012,.139)]),
            lambda x,z:(x,face_point(x,z)[1]-.005,z),.007,'robot_graphite',spacing=.004)


def eyes():
    for s in (-1,1):
        # Slanted optics tucked under the V visor.
        p=G.rounded_polygon([(s*x,z) for x,z in ((.026,.300),(.104,.324),(.110,.310),(.098,.294),(.050,.292),(.030,.294))],.006,10)
        cx=s*.066;cz=.306
        m=K.Mesh();rings=[]
        for scale,depth in ((1.11,.025),(1.11,-.005),(1,-.010),(.90,-.010),(.90,.025)):
            rings.append([(cx+(x-cx)*scale,H.front_y(cx+(x-cx)*scale,cz+(z-cz)*scale)+depth,cz+(z-cz)*scale) for x,z in p])
        rings.append(rings[0]);m.loft(rings,'dark',cap=False,smooth=False)
        M.emit(m,'head.eye.%s.cast.socket'%s,'head')
        lens=[(cx+(x-cx)*.895,cz+(z-cz)*.895) for x,z in p]
        M.panel('head.eye.%s.blue.optical.lens'%s,'head',lens,
                lambda x,z:(x,H.front_y(x,z)-.007,z),.004,'head_eye',spacing=.004)
        core=G.rounded_polygon([(s*x,z) for x,z in ((.040,.302),(.096,.318),(.100,.308),(.082,.298),(.046,.297))],.006,10)
        M.panel('head.eye.%s.luminous.core'%s,'head',core,
                lambda x,z:(x,H.front_y(x,z)-.008,z),.002,'eye_core',spacing=.004)


def cheeks():
    for s in (-1,1):
        outline=[(-.159,.258),(-.055,.274),(.014,.244),(.012,.139),(-.119,.109),(-.142,.130)]
        slots=[]
        for z in (.148,.177,.206):
            slots.append([(u-.030,z+v) for u,v in G.rounded_rect(.055,.011,.003,7)])
        surf=lambda y,z:(s*(H.flank_x(y,z)+.004),y,z)
        M.panel('head.cheek.%s.vented.casting'%s,'head',outline,surf,.014,'robot_graphite',
                outward=(s,0,0),spacing=.004,cutouts=slots)
        path=[]
        for x,z in uv([(.111,.277),(.102,.248),(.075,.227),(.066,.165),(.043,.131),(.026,.114)]):
            xx,yy,zz=face_point(x,z);path.append((s*(xx+.003),yy-.003,zz))
        m=K.Mesh();G.sweep(m,G.catmull(path,12),[(-.002,-.003),(.004,-.003),(.006,0),(.003,.004),(-.002,.004)],
                         'mask_alloy',(0,-1,0))
        path=[(s*(H.flank_x(y,z)+.008),y,z) for y,z in ((-.145,.252),(-.127,.181),(-.114,.123),(-.024,.098),(.020,.136))]
        G.sweep(m,G.filleted_path(path,.006,9),G.round_section(.009,.007,10),'mask_alloy',(s,0,0))
        M.emit(m,'head.jaw.%s.wraparound.reveal'%s,'head')
        m=K.Mesh()
        for y,z in ((-.112,.190),(-.100,.222)):
            x=H.flank_x(y,z)+.011
            G.turn(m,[(-.001,.006),(-.001,.011),(.003,.012),(.005,.010),(.005,.006)],
                   (s,0,0),(s*x,y,z),'head_brow_alloy',48,True)
            G.hardware(m,(s*x,y,z),(s*(x+.005),y,z),.006,'bronze',6)
        M.emit(m,'head.cheek.%s.recessed.fasteners'%s,'head')
        p=[(.109,.286),(.128,.278),(.135,.235),(.102,.160),(.052,.107),
           (.042,.122),(.066,.169),(.076,.227),(.103,.251)]
        slots=[]
        for z in (.183,.214,.245):
            x=.092+(z-.183)*.33
            slots.append([(x+u,z+v) for u,v in G.rounded_rect(.013,.009,.002,5)])
        def wrap(x,z):
            inner=D.Curve([(.107,.046),(.160,.066),(.227,.078),(.251,.104),(.286,.111)])(z)
            u=max(0,min(1,(x-inner)/max(.014,.139-inner)))
            y=face_point(inner,z)[1]*(1-u)+(H.front_y(s*x,z)-.005)*u
            return s*x,y,z
        M.panel('head.cheek.%s.front.wrap.cast.web'%s,'head',p,
                wrap,.009,'robot_graphite',spacing=.004,cutouts=slots)


def build():
    mask();eyes();cheeks()
