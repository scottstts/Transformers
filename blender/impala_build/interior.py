"""Sewn bench upholstery, period instruments, controls and pressed underbody."""
import math
from mathutils import Vector
from . import kit as K, geometry as G, contract as D
from .body import emit


def benches():
    for name,y in [('front',-.250),('rear',.700)]:
        carrier=name+'_bench'
        for part,stations in [('cushion',[(.454,1.52,.42,y),(.480,1.57,.46,y),(.590,1.57,.46,y),(.625,1.50,.40,y)]),
                              ('back',[(.532,1.53,.136,y+.233),(.567,1.576,.175,y+.259),(.854,1.572,.161,y+.334),
                                       (.996,1.496,.136,y+.375),(1.018,1.41,.088,y+.378)])]:
            m=K.Mesh()
            controls=G.catmull([(z,w,d) for z,w,d,yy in stations],8)
            centre=D.Curve([(z,yy) for z,w,d,yy in stations])
            m.loft([[(x,centre(q.x)+v,q.x) for x,v in G.rounded_rect(q.y,q.z,min(.045,q.z*.4),16)] for q in controls],
                   'leather',smooth=True)
            emit(m,'car.interior.'+name+'.bench.'+part,carrier,.010)
        m=K.Mesh()
        front=D.Curve([(.583,y+.180),(.70,y+.205),(.854,y+.2535),(.976,y+.293)])
        rows=[]
        for z in G.lin(.584,.975,65):
            row=[]
            for x in G.lin(-.714,.714,159):
                phase=(x+.714)/.0714
                pillow=.003*(.5+.5*math.cos(phase*math.tau))**.8
                edge=max(0,1-(abs(x)/.714)**12)
                row.append((x,front(z)-.002-pillow*edge,z))
            rows.append(row)
        G.skin(m,rows,.005,(0,-1,0),'leather')
        emit(m,'car.interior.'+name+'.bench.formed.pleats',carrier,0)
        m=K.Mesh()
        for xx in G.lin(-.680,.680,19):
            G.sweep(m,[(xx,y+v,.626) for v in G.lin(-.17,.17,23)],G.round_section(.0015,.0015,6),'leather',(0,0,1))
            G.sweep(m,[(xx,front(.583+.392*t)-.0025,.583+.392*t) for t in G.lin(0,1,51)],G.round_section(.0012,.0012,6),'leather',(0,-1,0))
        for z in (.862,.961):
            G.sweep(m,[(x,front(z)-.007,z+.005*(1-(x/.704)**8)) for x in G.lin(-.704,.704,99)],
                    G.round_section(.007,.005,10),'leather',(0,-1,0))
        emit(m,'car.interior.'+name+'.bench.stitching',carrier,0)
        m=K.Mesh()
        for x in (-.62,.62):
            m.prism([(x+a,y-.02,.636+b) for a,b in G.rounded_rect(.047,.035,.008,8)],(0,.012,0),'chrome')
        emit(m,'car.interior.'+name+'.seatbelt.buckles',carrier,.001)


def dashboard():
    m=K.Mesh()
    profile=[(-.093,-.048),(-.060,-.075),(.072,-.071),(.108,-.015),(.097,.046),(.071,.061),(-.072,.068),(-.108,.043)]
    G.sweep(m,[(x,-.680-.025*(1-(x/.81)**2),.938-.012*(x/.81)**2) for x in G.lin(-.801,.801,71)],profile,'leather',(0,-1,0))
    emit(m,'car.interior.dashboard.rolled.pad','dashboard',.009)
    m=K.Mesh()
    G.skin(m,[[(x,-.568+.030*(z-.83),z) for x in G.lin(-.784,.784,59)] for z in G.lin(.784,.944,19)],.012,(0,1,0),'tan')
    emit(m,'car.interior.dashboard.instrument.face','dashboard',.004)
    for i,(x,r) in enumerate(((.308,.055),(.451,.056),(.594,.045),(.153,.027))):
        center=(x,-.556,.864)
        m=K.Mesh()
        G.turn(m,[(0,r-.004),(.004,r),(.010,r),(.012,r-.004),(.008,r-.007),(0,r-.007)],(0,1,0),center,'chrome',56,True)
        G.turn(m,[(.004,0),(.004,r-.008),(.007,r-.008),(.007,0)],(0,1,0),center,'dark',48)
        for a in G.lin(-.72,3.85,13):
            rr=r-.015
            G.hardware(m,(x+rr*math.cos(a),-.549,.864+rr*math.sin(a)),
                       (x+(rr-.004)*math.cos(a),-.548,.864+(rr-.004)*math.sin(a)),.0006,'ivory',6)
        G.sweep(m,[(x,-.546,.864),(x+r*.64,-.546,.864+r*.12)],G.round_section(.0018,.001,6),'ivory',(0,1,0))
        emit(m,'car.interior.gauge.%d'%i,'dashboard',.0004)
    m=K.Mesh()
    m.prism([(x-.057,-.546,.854+z) for x,z in G.rounded_rect(.144,.055,.008,8)],(0,-.011,0),'dark')
    for x in (-.13,.015): G.hardware(m,(x,-.547,.851),(x,-.531,.851),.009,'chrome',20)
    for z in G.lin(.84,.869,5): G.sweep(m,[(-.113,-.532,z),(.002,-.532,z)],G.round_section(.002,.002,6),'chrome',(0,1,0))
    emit(m,'car.interior.period.radio','dashboard',.001)
    m=K.Mesh()
    G.sweep(m,[(-.744,-.552,.819),(-.324,-.552,.819)],G.round_section(.007,.007,10),'chrome',(0,1,0))
    emit(m,'car.interior.glovebox.handle','dashboard',.0006)
    center=Vector((.443,-.343,.929))
    axis=Vector((0,.73,.69)).normalized()
    u=Vector((1,0,0))
    v=axis.cross(u)
    m=K.Mesh()
    G.hardware(m,(.443,-.590,.757),center,.026,'dark',32)
    path=[center+.163*(u*math.cos(a)+v*math.sin(a)) for a in G.lin(0,math.tau,97)[:-1]]
    G.sweep(m,path,G.round_section(.019,.019,14),'leather',axis,True)
    G.turn(m,[(-.018,0),(-.018,.043),(.012,.045),(.020,.033),(.021,0)],axis,center,'chrome',56)
    for s in (-1,1): G.sweep(m,[center+u*s*.029,center+u*s*.135-v*.025],G.round_section(.016,.006,12),'chrome',axis)
    path=[center+axis*.018+.126*(u*math.cos(a)+v*math.sin(a)) for a in G.lin(.20,math.pi-.20,57)]
    G.sweep(m,path,G.round_section(.005,.005,10),'chrome',axis)
    emit(m,'car.interior.steering.column.wheel.horn','dashboard',.0008)
    m=K.Mesh()
    G.sweep(m,G.catmull([(.409,-.427,.859),(.332,-.420,.897),(.285,-.430,.920)],12),G.round_section(.006,.006,10),'chrome',(0,1,0))
    G.turn(m,[(-.012,0),(-.009,.013),(.012,.013),(.016,0)],(1,0,0),(.279,-.430,.921),'ivory',28)
    emit(m,'car.interior.column.shifter','dashboard',.0008)


def trim():
    for s,side in ((1,'L'),(-1,'R')):
        for a,b,name in ((D.DOOR_FRONT,D.DOOR_SPLIT,'front_door.'+side),(D.DOOR_SPLIT,D.DOOR_REAR,'rear_door.'+side)):
            m=K.Mesh()
            G.skin(m,[[(s*.887,y,z) for y in G.lin(a+.018,b-.018,31)] for z in G.lin(.450,.975,31)],.010,(-s,0,0),'tan')
            emit(m,'car.interior.'+name+'.door.card',name,.003)
            m=K.Mesh()
            path=G.catmull([(s*.884,a+.29,.697),(s*.812,a+.31,.711),(s*.812,a+.57,.711),(s*.884,a+.60,.697)],12)
            G.sweep(m,path,G.round_section(.059,.025,14),'leather',(-s,0,0))
            emit(m,'car.interior.'+name+'.armrest',name,.004)
            m=K.Mesh()
            G.hardware(m,(s*.885,b-.170,.808),(s*.823,b-.170,.808),.010,'chrome',22)
            G.sweep(m,[(s*.823,b-.170,.808),(s*.818,b-.219,.824)],G.round_section(.007,.007,10),'chrome',(-s,0,0))
            emit(m,'car.interior.'+name+'.window.crank',name,.0008)
    m=K.Mesh()
    G.hardware(m,(0,-.332,1.453),(0,-.398,1.363),.006,'chrome',20)
    m.prism([(x,-.408,1.342+z) for x,z in G.rounded_rect(.240,.063,.030,16)],(0,.014,0),'leather')
    emit(m,'car.interior.rearview.mirror','roof',.001)


def floor():
    cross=[(-.856,.334),(-.70,.346),(-.225,.345),(-.16,.427),(-.085,.445),(.085,.445),(.16,.427),(.225,.345),(.70,.346),(.856,.334)]
    for zone,a,b in (('front',-1.017,-.4),('middle',-.4,.6),('rear',.6,1.200)):
        m=K.Mesh()
        G.skin(m,[[(x,y,z) for x,z in cross] for y in G.lin(a,b,25)],.018,(0,0,1),'dark')
        emit(m,'car.floor.'+zone+'.pressed.transmission.tunnel','floor.'+zone,0)
    for zone,a,b in (('front',-2.170,-.4),('middle',-.4,.6),('rear',.6,2.150)):
        for s in (-1,1):
            m=K.Mesh()
            G.sweep(m,[(s*.621,y,.315+.012*math.cos(y)) for y in G.lin(a,b,37)],
                    [(-.032,-.023),(.032,-.023),(.032,.023),(-.032,.023)],'dark',(0,0,-1))
            emit(m,'car.chassis.'+zone+'.boxed.rail.'+str(s),'floor.'+zone,0)
    for y in (-.82,.28,1.03):
        m=K.Mesh()
        G.sweep(m,[(x,y,.327) for x in G.lin(-.604,.604,27)],G.round_section(.049,.067,12),'steel',(0,0,-1))
        emit(m,'car.chassis.crossmember.'+str(y),'floor.'+('front' if y<-.4 else 'middle' if y<.6 else 'rear'),.003)


def parcel_shelf():
    m=K.Mesh()
    outline=G.rounded_rect(1.34,.345,.024,12)
    cutouts=[]
    for x in (-.49,.49):
        cutouts.append([(x+.055*math.cos(a),1.337+.055*math.sin(a)) for a in G.lin(0,math.tau,65)[:-1]])
    G.constrained_skin(m,[(x,y+1.337) for x,y in outline],[],[],lambda x,y:(x,y,1.003),.007,(0,0,1),'leather',cutouts=cutouts)
    emit(m,'car.interior.rear.parcel.shelf','rear_bench',0)
    for s in (-1,1):
        m=K.Mesh();x=s*.49;holes=[]
        for i in range(-6,7):
            for j in range(-6,7):
                u=i*.0075+j%2*.00375;v=j*.0065
                if math.hypot(u,v)<.050:
                    holes.append([(u+.0015*math.cos(a),v+.0015*math.sin(a)) for a in G.lin(0,math.tau,9)[:-1]])
        outline=[(.056*math.cos(a),.056*math.sin(a)) for a in G.lin(0,math.tau,97)[:-1]]
        G.constrained_skin(m,outline,[],[],lambda u,v:(x+u,1.337+v,1.005+.0015*(1-(u*u+v*v)/.056**2)),
                           .0012,(0,0,1),'dark',cutouts=holes)
        G.turn(m,[(0,.055),(.001,.058),(.003,.058),(.004,.055)],(0,0,1),(x,1.337,1.003),'dark',96,True)
        emit(m,'car.interior.rear.speaker.perforated.grille.'+str(s),'rear_bench',0)


def build():
    floor()
    benches()
    dashboard()
    trim()
    parcel_shelf()
