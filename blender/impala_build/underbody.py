"""Connected suspension, driveline, routed exhaust and pressed tank."""
import math
from mathutils import Vector
from . import kit as K, contract as D, geometry as G
from .body import emit

ENGINE_Y=-1.995


def suspension():
    for axle,end in ((D.FRONT_AXLE,'front'),(D.REAR_AXLE,'rear')):
        for s,side in ((1,'L'),(-1,'R')):
            m=K.Mesh()
            G.hardware(m,(0,axle,D.WHEEL_Z),(s*D.WHEEL_X,axle,D.WHEEL_Z),.032,'dark',32)
            emit(m,'car.chassis.'+end+'.axle.'+side,'axle.'+end+'.'+side,.001)
            m=K.Mesh()
            G.turn(m,[(-.037,.18),(-.037,.218),(-.020,.229),(.015,.229),(.027,.215),(.027,.18)],
                   (s,0,0),(s*.765,axle,D.WHEEL_Z),'dark',72,True)
            emit(m,'car.brake.'+end+'.'+side+'.drum','wheel.'+end+'.'+side,.001)
            m=K.Mesh()
            for yy in (-.186,.186):
                path=G.catmull([(s*.59,axle+yy,.287),(s*.69,axle+yy*.62,.294),(s*.777,axle,.310)],12)
                G.sweep(m,path,[(-.014,-.022),(.014,-.022),(.014,.022),(-.014,.022)],'steel',(0,0,1))
            emit(m,'car.suspension.'+end+'.'+side+'.wishbone',end+'_fender.'+side,.002)
            m=K.Mesh()
            a=Vector((s*.69,axle,.301))
            b=Vector((s*.746,axle,.627))
            G.hardware(m,a,b,.011,'steel',20)
            G.hardware(m,a.lerp(b,.12),a.lerp(b,.54),.023,'dark',28)
            axis=(b-a).normalized()
            u=axis.orthogonal().normalized()
            v=axis.cross(u)
            path=[a.lerp(b,.15+.70*t)+.041*(u*math.cos(t*math.tau*6)+v*math.sin(t*math.tau*6)) for t in G.lin(0,1,181)]
            G.sweep(m,path,G.round_section(.006,.006,8),'steel',u)
            emit(m,'car.suspension.'+end+'.'+side+'.spring.damper',end+'_fender.'+side,.0006)
            if end=='rear':
                m=K.Mesh()
                for leaf in range(4):
                    path=[(s*.612,axle+yy,.322-leaf*.005+.086*(yy/.53)**2) for yy in G.lin(-.53,.53,45)]
                    G.sweep(m,path,[(-.018,-.002),(.018,-.002),(.018,.002),(-.018,.002)],'dark',(0,0,1))
                emit(m,'car.rear.'+side+'.leaf.spring.pack','wheel.rear.'+side,.001)


def wheelhouses():
    for axle,end in ((D.FRONT_AXLE,'front'),(D.REAR_AXLE,'rear')):
        for s,side in ((1,'L'),(-1,'R')):
            m=K.Mesh()
            angles=G.lin(-.20,math.pi+.20,121)
            radius=D.TYRE_RADIUS+.029
            rows=[[(s*x,axle+radius*math.cos(a),D.WHEEL_Z+radius*math.sin(a))
                   for x in G.lin(.670,.980,25)] for a in angles]
            G.skin(m,rows,.006,(0,0,-1),'rubber')
            # The inner stamped tub closes the view into the opposite fender.
            contour=[(s*.669,axle+radius*math.cos(a),D.WHEEL_Z+radius*math.sin(a)) for a in angles]
            m.prism(contour,(-s*.006,0,0),'rubber')
            emit(m,'car.wheelhouse.'+end+'.'+side+'.formed.tub',end+'_fender.'+side,.001)


def driveline():
    m=K.Mesh()
    G.turn(m,[(-.075,.035),(-.05,.055),(.030,.055),(.052,.035),(.075,.030),(1.760,.030),(1.787,.045),(1.820,.045)],
           (0,1,0),(0,-.445,.270),'steel',36,True)
    emit(m,'car.driveline.propeller.shaft','driveline',.001)
    m=K.Mesh()
    G.turn(m,[(-.155,.045),(-.134,.093),(-.080,.130),(.072,.130),(.133,.088),(.155,.045),(.135,.032),(-.134,.032)],
           (1,0,0),(0,D.REAR_AXLE,.286),'dark',64,True)
    emit(m,'car.driveline.cast.differential','floor.rear',.002)
    m=K.Mesh()
    for x in G.lin(-.09,.09,7):
        G.sweep(m,[(x,D.REAR_AXLE-.118,.220),(x,D.REAR_AXLE-.123,.290),(x,D.REAR_AXLE-.092,.360)],G.round_section(.008,.008,8),'dark',(0,-1,0))
    emit(m,'car.differential.cast.cooling.ribs','floor.rear',.001)
    # Authored sump/timing-pan stations, retaining a visibly cast shoulder. The
    # block sits forward in the bay, clear of the robot head packed behind it.
    m=K.Mesh()
    rings=[]
    for z,w,d in ((.252,.259,.421),(.268,.392,.590),(.378,.420,.680),(.524,.364,.650)):
        rings.append([(x,ENGINE_Y+y,z) for x,y in G.rounded_rect(w,d,.064,10)])
    m.loft(rings,'dark',smooth=True)
    emit(m,'car.engine.cast.sump','engine',.006)
    m=K.Mesh()
    for y in G.lin(ENGINE_Y-.245,ENGINE_Y+.255,9):
        G.sweep(m,[(-.150,y,.264),(.150,y,.264)],G.round_section(.016,.009,8),'steel',(0,0,-1))
    emit(m,'car.engine.sump.ribs','engine',.001)
    for s in (-1,1):
        m=K.Mesh()
        for y in G.lin(ENGINE_Y-.230,ENGINE_Y+.210,4):
            p=G.catmull([(s*.172,y,.452),(s*.282,y,.408),(s*.307,y+.08,.319)],12)
            G.sweep(m,p,G.round_section(.027,.027,12),'bronze',(s,0,0))
        emit(m,'car.engine.exhaust.manifold.'+str(s),'engine',.001)
        p=G.catmull([(s*.307,-1.65,.315),(s*.40,-.88,.318),(s*.42,.10,.326),
                     (s*.49,.89,.326),(s*.63,1.42,.420),(s*.73,1.83,.365),
                     (s*.764,2.42,.361),(s*.764,2.67,.361)],12)
        for zone,a,b in (('front',-1.65,-.4),('middle',-.4,.6),('rear',.6,2.67)):
            q=[]
            for u,v in zip(p,p[1:]):
                if u.y<=a<=v.y:q.append(u.lerp(v,(a-u.y)/(v.y-u.y)))
                if a<u.y<b:q.append(u)
                if u.y<=b<=v.y:q.append(u.lerp(v,(b-u.y)/(v.y-u.y)))
            m=K.Mesh();G.sweep(m,q,G.round_section(.043,.043,14),'steel',(s,0,0))
            emit(m,'car.exhaust.'+zone+'.routed.pipe.'+str(s),'floor.'+zone,.001)
        m=K.Mesh()
        G.turn(m,[(-.243,.021),(-.226,.054),(-.20,.064),(.192,.064),(.226,.054),(.243,.021),(.243,0),(-.243,0)],
               (0,1,0),(s*.46,.57,.326),'steel',48,True)
        emit(m,'car.exhaust.rolled.muffler.'+str(s),'floor.middle',.003)
        for yy,xx,zz in ((.43,.447,.326),(.71,.474,.326),(2.43,.764,.361)):
            m=K.Mesh()
            G.sweep(m,G.catmull([(s*xx,yy,zz),(s*(xx-.012),yy+.024,zz+.055),
                                 (s*(xx-.030),yy+.032,zz+.085)],8),
                    G.round_section(.009,.005,8),'rubber',(s,0,0))
            emit(m,'car.exhaust.bonded.hanger.'+str(s)+'.'+str(yy),
                 'floor.middle' if yy<.6 else 'floor.rear',.001)
    m=K.Mesh()
    rings=[]
    for z,w,d in ((.282,.893,.473),(.300,1.049,.610),(.408,1.071,.621),(.448,1.004,.564)):
        rings.append([(x,2.04+y,z) for x,y in G.rounded_rect(w,d,.072,12)])
    m.loft(rings,'dark',smooth=True)
    emit(m,'car.fuel.tank.pressed.shell','tail',.009)
    for s in (-1,1):
        m=K.Mesh()
        G.sweep(m,G.catmull([(s*.31,1.761,.447),(s*.31,1.740,.317),(s*.31,2.313,.279),(s*.31,2.349,.445)],12),
                [(-.024,-.002),(.024,-.002),(.024,.002),(-.024,.002)],'steel',(1,0,0))
        emit(m,'car.fuel.tank.strap.'+str(s),'tail',.002)
    cradle()


def cradle():
    """Boxed crossmember the tank sits on, carried by two arms from the tail."""
    m=K.Mesh()
    G.sweep(m,[(x,2.040,.305) for x in G.lin(-.600,.600,25)],
            [(-.030,-.022),(.030,-.022),(.030,.022),(-.030,.022)],'steel',(0,0,1))
    for s in (-1,1):
        G.sweep(m,[(s*.560,y,.305+.520*max(0,(y-2.200))) for y in G.lin(2.010,2.770,16)],
                [(-.022,-.020),(.022,-.020),(.022,.020),(-.022,.020)],'steel',(s,0,0))
    emit(m,'car.fuel.tank.cradle.crossmember','tail',.002)


def build():
    suspension()
    driveline()
