"""Angular silver face, inset blue eyes and rectangular black cheek mechanics."""
import math
from mathutils import Vector
from . import kit as K, geometry as G, contract as D, robot_geometry as M, head_helmet as H

BASE=D.Curve([(.112,-.210),(.135,-.227),(.170,-.234),(.211,-.231),
              (.249,-.221),(.277,-.217),(.299,-.210)])
MASK=[(-.020,.294),(-.052,.279),(-.095,.279),(-.087,.256),
      (-.057,.243),(-.055,.155),(-.035,.120),(0,.115),(.035,.120),
      (.055,.155),(.057,.243),(.087,.256),(.095,.279),(.052,.279),(.020,.294)]


def face_point(x,z):
    # Continuous shallow camber; no triangle straddles an unmodelled crease.
    ax=math.sqrt(x*x+.000004)-.002
    knee=(ax-.046+math.sqrt((ax-.046)**2+.000004))/2
    return x,BASE(z)+.28*ax+.48*knee,z


def facial_casting():
    """Solid facial volume ties mask, orbital shelf and temples to the skull.

    The silver plates are the outer skin of this casting, not floating sheets.
    Its front follows their camber and its rear overlaps the existing skull.
    """
    m=K.Mesh();rings=[]
    width=D.Curve([(.113,.032),(.133,.063),(.172,.098),(.239,.119),
                   (.274,.125),(.299,.131),(.329,.136)])
    for z in G.lin(.113,.329,55):
        w=width(z)
        row=[]
        for u in (-1,-.78,-.43,0,.43,.78,1):
            x=u*w
            front=face_point(x,min(z,.299))[1]+.009
            if z>.285:
                t=min(1,(z-.285)/.032)
                front=front*(1-t)+(H.front_y(x,z)+.015)*t
            row.append((x,front,z))
        row += [(w,.034,z),(-w,.034,z)]
        rings.append(row)
    m.loft(rings,'dark',smooth=True)
    M.emit(m,'head.face.solid.maxillary.and.orbital.casting','head')


def detail(name,outline,surface,depth,mat='mask_alloy',radius=.001):
    """Machined plate with a deliberate corner radius and consistent relief."""
    obj=M.panel(name,'head',G.rounded_polygon(outline,radius,6),surface,depth,
                mat,spacing=.0025)
    return obj


def trim(name,path,width=.003):
    """Flattened trim with tapered, seated ends rather than chopped-off rods."""
    path=G.catmull(path,16);rings=[]
    for i,p in enumerate(path):
        t=i/(len(path)-1)
        k=.22+.78*min(1,t/.12,(1-t)/.12)
        tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        normal=Vector((0,-1,0));u=tangent.cross(normal).normalized()
        rings.append([p+u*x+normal*y for x,y in G.round_section(width*2*k,width*.85*k,12)])
    m=K.Mesh();m.loft(rings,'machined',smooth=True)
    return M.emit(m,name,'head')


def mask():
    mouth=[(-.026,.185),(-.012,.191),(.012,.191),(.026,.185),
           (.020,.179),(-.020,.179)]
    obj=M.panel('head.mask.angular.silver.face','head',G.rounded_polygon(MASK,.0015,6),face_point,.012,
            'mask_alloy',spacing=.0025,cutouts=[G.rounded_polygon(mouth,.001,6)])
    M.panel('head.mask.recessed.mouth','head',
            [(-.030,.174),(.030,.174),(.030,.196),(-.030,.196)],
            lambda x,z:(x,face_point(x,z)[1]+.008,z),.006,'dark',spacing=.005)
    m=K.Mesh()
    m.add([(-.016,-.216,.294),(.016,-.216,.294),(-.022,-.252,.237),
           (.022,-.252,.237),(-.017,-.242,.223),(.017,-.242,.223),
           (-.024,-.207,.233),(.024,-.207,.233)],
          [(0,1,3,2),(2,3,5,4),(0,2,4,6),(1,7,5,3),(4,5,7,6),(0,6,7,1)],'mask_alloy')
    M.emit(m,'head.mask.nasal.bridge.and.nose','head',.0014)
    for s in (-1,1):
        M.panel('head.mask.%s.nostril.recess'%s,'head',
                [(s*.012,.229),(s*.020,.233),(s*.019,.236),(s*.010,.232)],
                lambda x,z:(x,-.2425-(z-.223)*(.010/.014),z),.002,'dark',spacing=.003)
        detail('head.mask.%s.lower.cheek.facet'%s,
                [(s*.032,.221),(s*.053,.239),(s*.051,.158),(s*.032,.144),(s*.037,.191)],
                lambda x,z:(x,face_point(x,z)[1]-.0035,z),.003,'machined')
    detail('head.mask.lower.lip',[(-.023,.176),(0,.180),(.023,.176),(.014,.169),(-.014,.169)],
            lambda x,z:(x,face_point(x,z)[1]-.004,z),.004)
    detail('head.chin.squared.silver.keystone',
            [(-.030,.146),(-.021,.160),(.021,.160),(.030,.146),(.024,.124),(-.024,.124)],
            lambda x,z:(x,face_point(x,z)[1]-.004,z),.006)
    detail('head.chin.central.dark.inset',
            [(-.008,.120),(.008,.120),(.011,.141),(0,.151),(-.011,.141)],
            lambda x,z:(x,face_point(x,z)[1]-.009,z),.003,'dark')


def eyes():
    for s in (-1,1):
        p=[(.024,.302),(.048,.312),(.113,.334),(.114,.312),(.093,.291),(.046,.287)]
        p=[(s*x,z) for x,z in p];cx=s*.070;cz=.308
        def surface(x,z):return x,H.front_y(x,z)-.009,z
        # A deep closed socket body extends into the temple casting. The
        # lens-bearing front and its side walls share the same boundary.
        boundary=M.sample_boundary(p,.003)
        m=K.Mesh()
        m.loft([[(x,surface(x,z)[1]+.003,z) for x,z in boundary],
                [(x,-.082,z) for x,z in boundary]],'dark',smooth=False)
        M.emit(m,'head.eye.%s.solid.orbital.housing'%s,'head')
        M.panel('head.eye.%s.deep.black.socket'%s,'head',p,surface,.019,'dark',spacing=.004)
        lens=[(cx+(x-cx)*.73,cz+(z-cz)*.65) for x,z in p]
        M.panel('head.eye.%s.blue.optic'%s,'head',lens,
                lambda x,z:(x,surface(x,z)[1]-.003,z),.003,'head_eye',spacing=.003)
        core=[(cx+(x-cx)*.53,cz+(z-cz)*.38) for x,z in p]
        M.panel('head.eye.%s.luminous.center'%s,'head',core,
                lambda x,z:(x,surface(x,z)[1]-.005,z),.002,'eye_core',spacing=.003)
        path=[(s*x,min(surface(s*x,z)[1],face_point(s*x,z)[1]-.003),z)
              for x,z in ((.028,.290),(.048,.281),(.090,.284),(.123,.307))]
        trim('head.eye.%s.lower.orbital.rim'%s,path,.0027)


def cheeks():
    for s in (-1,1):
        p=[(-.146,.272),(-.073,.294),(-.016,.267),(-.011,.169),
           (-.087,.132),(-.139,.124),(-.157,.149)]
        def side(y,z):return s*(.113+.020*max(0,min(1,(z-.140)/.13))),y,z
        M.panel('head.cheek.%s.angular.black.casting'%s,'head',p,side,.015,
                'robot_graphite',outward=(s,0,0),spacing=.006)
        q=[(.091,.278),(.131,.289),(.134,.246),(.111,.163),
           (.065,.118),(.034,.114),(.055,.155),(.058,.242)]
        def wrap(x,z):
            u=max(0,min(1,(x-.055)/.080))
            return s*x,face_point(.055,z)[1]*(1-u)+(-.115)*u,z
        M.panel('head.cheek.%s.front.angular.web'%s,'head',q,wrap,.012,
                'robot_graphite',spacing=.005)
        path=[wrap(x,z) for x,z in ((.096,.278),(.059,.242),(.056,.158),(.033,.117))]
        trim('head.cheek.%s.silver.face.boundary'%s,path,.0021)
        path=[side(y,z) for y,z in ((-.146,.125),(-.087,.132),(-.008,.169),(.029,.214))]
        M.tube('head.jaw.%s.straight.silver.rail'%s,'head',path,.004,'machined')
        m=K.Mesh()
        for y,z in ((-.115,.188),(-.110,.222)):
            x=abs(side(y,z)[0])+.006
            G.turn(m,[(0,0),(0,.012),(.004,.014),(.008,.012),(.008,0)],
                   (s,0,0),(s*x,y,z),'dark',40)
            G.turn(m,[(.008,.006),(.008,.011),(.012,.010),(.012,.006)],
                   (s,0,0),(s*x,y,z),'bronze',40,True)
            G.hardware(m,(s*(x+.008),y,z),(s*(x+.012),y,z),.005,'machined',6)
        M.emit(m,'head.cheek.%s.twin.recessed.bronze.fasteners'%s,'head')
        for i in range(3):
            z=.197+i*.024
            M.panel('head.cheek.%s.rear.cooling.slot.%s'%(s,i),'head',
                    [(-.061,z),(-.032,z+.006),(-.032,z+.012),(-.061,z+.006)],
                    lambda y,z:(side(y,z)[0]+s*.002,y,z),.002,'dark',
                    outward=(s,0,0),spacing=.005)


def build():
    facial_casting();mask();eyes();cheeks()
