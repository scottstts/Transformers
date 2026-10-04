"""Crowned hardtop, compound glass, swept rear sail panels and lowered side windows."""
import math
from mathutils import Vector
from . import kit as K, contract as D, geometry as G, reference as R
from .body import emit, deck_height, rear_cowl_point, PILLAR_BASE_FRONT

PILLAR_TOP_T=(.593+.293)/(D.ROOF_REAR-.015+.293)


def roof_point(t,u):
    y=(-.271048-.021952*u*u)*(1-t)+(D.ROOF_REAR-.015*u*u)*t
    crown=D.ROOF_CENTRE(y)
    drop=crown-D.ROOF_EDGE(y)
    return (u*D.ROOF_WIDTH(y),y,crown-(drop-.010)*u*u-.010*u**6)


def wind_point(t,u,rear=False):
    upper=Vector(roof_point(1 if rear else 0,u))
    if not rear:upper.z-=.016+.008*max(0,1-u*u)
    if rear:
        lower=Vector((u*.684,D.REAR_SCREEN_BOTTOM-.025*u*u,deck_height(u*.684,D.REAR_SCREEN_BOTTOM-.025*u*u)+.006))
    else:
        lower=Vector((u*.825,D.COWL+.102*u*u,D.HOOD_CENTRE(D.COWL)-.016*u*u+.004))
    p=lower.lerp(upper,t)
    p.y+=(-1 if not rear else 1)*.009*math.sin(math.pi*t)*(1-u*u)
    return tuple(p)


def glazing():
    m=K.Mesh()
    G.skin(m,[[roof_point(t,u) for u in G.lin(-1,1,93)] for t in G.lin(0,1,109)],.014,inner_mat='tan')
    emit(m,'car.hardtop.compound.crown','roof',.0011)
    for rear,label in ((False,'front'),):
        m=K.Mesh();rows=[]
        for t in G.lin(0,1,29):
            rows.append([tuple(Vector(roof_point(1 if rear else 0,u)).lerp(Vector(wind_point(1,u,rear)),t))
                         for u in G.lin(-1,1,97)])
        G.skin(m,rows,.008,(0,1 if rear else -1,1))
        emit(m,'car.hardtop.formed.'+label+'.header','roof',0)
    for rear,name in ((False,'windshield'),(True,'rear_screen')):
        hint=(0,1 if rear else -1,1)
        m=K.Mesh()
        G.skin(m,[[wind_point(t,u,rear) for u in G.lin(-1,1,97)] for t in G.lin(0,1,43)],.003,hint,'glass')
        emit(m,'car.'+name+'.compound.glass',name,0)
        boundary=[wind_point(0,u,rear) for u in G.lin(-1,1,95)]
        boundary+=[wind_point(t,1,rear) for t in G.lin(0,1,42)[1:]]
        boundary+=[wind_point(1,u,rear) for u in G.lin(1,-1,95)[1:]]
        boundary+=[wind_point(t,-1,rear) for t in G.lin(1,0,42)[1:-1]]
        for mat,w,h,proud in [('rubber',.016,.010,.001),('chrome',.009,.005,.006)]:
            offset=Vector(hint).normalized()*proud
            m=K.Mesh()
            G.sweep(m,[Vector(p)+offset for p in boundary],G.round_section(w,h,14),mat,hint,True)
            emit(m,'car.'+name+'.'+mat+'.seal',name,.00055)


def sails():
    for s,side in ((1,'L'),(-1,'R')):
        # Both boundaries are authored curves. The aft one is the same edge
        # sampled by the back glass, so the metal and window meet exactly.
        controls=[R.unproject(p,x) for p,x in zip(R.SIDE_TRACES['pillar_front'],(.845,.872,.915,.942))]
        controls[0]=roof_point(PILLAR_TOP_T,1)
        fx=D.Curve([(i/3,float(p[0])) for i,p in enumerate(controls)])
        fy=D.Curve([(i/3,float(p[1])) for i,p in enumerate(controls)])
        fz=D.Curve([(i/3,float(p[2])) for i,p in enumerate(controls)])
        rows=[]
        for t in G.lin(0,1,65):
            front=Vector((s*fx(t),fy(t),fz(t)))
            aft=Vector(wind_point(1-t,s,True))
            row=[]
            for u in G.lin(0,1,27):
                p=front.lerp(aft,u)
                roof_edge=Vector(roof_point(PILLAR_TOP_T+(1-PILLAR_TOP_T)*u,s))
                top_chord=Vector(roof_point(PILLAR_TOP_T,s)).lerp(Vector(wind_point(1,s,True)),u)
                p+=(roof_edge-top_chord)*(1-t)
                p.x+=s*.021*math.sin(math.pi*u)*math.sin(math.pi*t)
                p.z+=.012*math.sin(math.pi*u)*math.sin(math.pi*t)
                row.append(tuple(p))
            rows.append(row)
        m=K.Mesh()
        G.skin(m,rows,.016,(s,0,.5),inner_mat='tan')
        emit(m,'car.hardtop.swept.sail.'+side,'rear_screen',0)
        m=K.Mesh()
        # Drip rail flows around the hardtop window, following its rear sweep.
        path=[roof_point(t,s) for t in G.lin(0,PILLAR_TOP_T,75)]
        path+=[(s*fx(t),fy(t),fz(t)) for t in G.lin(0,1,65)[1:]]
        G.sweep(m,[(x+s*.002,y,z-.004) for x,y,z in path],G.round_section(.010,.009,12),'chrome',(s,0,0))
        emit(m,'car.hardtop.drip.molding.'+side,'roof',.00065)
        # A-pillar with a stamped black face and a small chrome reveal.
        path=[wind_point(t,s) for t in G.lin(0,1,45)]
        m=K.Mesh()
        G.sweep(m,[(x+s*.004,y+.004,z) for x,y,z in path],G.round_section(.028,.027,20),'paint',(s,0,0))
        emit(m,'car.hardtop.A.pillar.'+side,'roof',.001)
        m=K.Mesh()
        G.sweep(m,[(x+s*.012,y+.009,z) for x,y,z in path],G.round_section(.008,.008,12),'chrome',(s,0,0))
        emit(m,'car.A.pillar.window.trim.'+side,'roof',.0005)
        # Vent wing glass fills the whole four-sided opening: pillar foot, top,
        # rear post and the sill line, in its own chromed frame.
        triangle=[(s*.835,-.754,1.021),(s*.771,-.250,1.341),(s*.890,-.307,1.014),(s*.893,-.736,1.009)]
        m=K.Mesh()
        m.prism(triangle,(-s*.003,0,0),'glass')
        emit(m,'car.front_door.vent.glass.'+side,'front_door.'+side,.0005)
        m=K.Mesh()
        G.sweep(m,triangle,G.round_section(.010,.012,12),'chrome',(s,0,0),True)
        emit(m,'car.front_door.vent.frame.'+side,'front_door.'+side,.0005)
        for a,b,carrier in ((D.DOOR_FRONT,D.DOOR_SPLIT,'front_door.'+side),(D.DOOR_SPLIT,D.DOOR_REAR,'rear_door.'+side)):
            m=K.Mesh()
            stop=min(b-.006,PILLAR_BASE_FRONT[1]-.004)
            path=[(s*.895,y,D.SILL(y)+.004) for y in G.lin(a+.006,stop,44)]
            G.sweep(m,path,G.round_section(.018,.007,14),'chrome',(s,0,0))
            emit(m,'car.'+carrier+'.window.sill',carrier,.0005)


def cowl():
    m=K.Mesh()
    lower=[(u*.764,-.950) for u in G.lin(-1,1,101)]
    upper=[wind_point(0,u)[:2] for u in G.lin(1,-1,101)]
    holes=[]
    for x in G.lin(-.622,.622,64):
        outline=G.rounded_rect(.007,.036,.003,5)
        holes.append([(x+a,-.918+b) for a,b in outline])
    def surface(x,y):
        t=.5
        for _ in range(8):
            u=x/(.764+.061*t)
            t=max(0,min(1,(y+.950)/(.080+.102*u*u)))
        a=D.hood_height(u*.764,-.950)
        b=wind_point(0,u)[2]
        return (x,y,a*(1-t)+b*t)
    points=[]
    for t in G.lin(.02,.98,25):
        for u in G.lin(-.99,.99,103):
            p=Vector((u*.764,-.950,0)).lerp(Vector((*wind_point(0,u)[:2],0)),t)
            points.append((p.x,p.y))
    G.constrained_skin(m,lower+upper,points,[],surface,.006,(0,0,1),cutouts=holes)
    emit(m,'car.cowl.pressed.plenum','windshield',0)
    m=K.Mesh()
    m.prism([(-.71,-.95,1.016),(.71,-.95,1.016),(.71,-.885,1.016),(-.71,-.885,1.016)],(0,0,-.004),'dark')
    emit(m,'car.cowl.vent.plenum','windshield',.0006)
    m=K.Mesh();rows=[]
    for t in G.lin(0,1,31):
        row=[]
        for u in G.lin(-1,1,113):
            row.append(rear_cowl_point(t,u))
        rows.append(row)
    G.skin(m,rows,.004,(0,0,1))
    # Rides with the backlight; the tail carrier crosses the robot torso.
    emit(m,'car.rear_screen.formed.lower.cowl','rear_screen',0)
    for s in (-1,1):
        x=s*.42
        m=K.Mesh()
        G.hardware(m,(x,-.842,1.035),(x,-.842,1.043),.012,'chrome',28)
        path=G.catmull([(x,-.842,1.043),(x-s*.13,-.88,1.045),(x-s*.29,-.889,1.044)],8)
        G.sweep(m,path,G.round_section(.011,.006,10),'chrome',(0,0,1))
        blade=G.catmull([(x-s*.03,-.898,1.049),(x-s*.26,-.895,1.051),(x-s*.48,-.876,1.052)],10)
        G.sweep(m,blade,G.round_section(.010,.007,10),'rubber',(0,0,1))
        emit(m,'car.windshield.wiper.'+str(s),'windshield',.0005)


def rolled_windows():
    """Full-size hardtop panes roll into the doors, then rise on the shoulders."""
    for s,side in ((1,'L'),(-1,'R')):
        for label,p in (
            ('front',[(-.299,1.027),(-.246,1.343),(.214,1.355),(.232,1.027)]),
            ('rear',[(.246,1.027),(.244,1.352),(.572,1.339),(.843,1.206),(1.093,1.046),(1.101,1.026)])):
            p=G.rounded_polygon(p,.007,6)
            def surface(y,z):
                return s*(.919-.130*max(0,min(1,(z-1.025)/.330))),y,z
            m=K.Mesh()
            points=[(y,z) for y in G.lin(min(q[0] for q in p),max(q[0] for q in p),33)
                    for z in G.lin(1.030,1.353,17)]
            G.constrained_skin(m,p,points,[],surface,.003,(s,0,0),'armour_glass' if label=='front' else 'glass')
            emit(m,'car.'+label+'_door.rolled.main.glass.'+side,'window.'+label+'.'+side,0)
            m=K.Mesh();G.sweep(m,[surface(y,z) for y,z in p],G.round_section(.009,.007,12),'chrome',(s,0,0),True)
            emit(m,'car.'+label+'_door.rolled.glass.chrome.edge.'+side,'window.'+label+'.'+side,0)


def mirrors():
    for s,side in ((1,'L'),(-1,'R')):
        x=s*.956
        m=K.Mesh()
        shoe=G.rounded_rect(.083,.041,.012,8)
        m.prism([(x,y-.418,1.026+z) for y,z in shoe],(s*.009,0,0),'chrome')
        path=G.catmull([(x,-.418,1.028),(s*1.003,-.385,1.051),(s*1.033,-.356,1.105)],12)
        G.sweep(m,path,G.round_section(.013,.012,12),'chrome',(s,0,0))
        center=(s*1.038,-.355,1.123)
        axis=(s*.29,.956,.018)
        G.turn(m,[(-.018,0),(-.017,.039),(-.008,.058),(.001,.063),(.008,.059),(.007,.055),(-.001,.055),(-.004,0)],
               axis,center,'chrome',96)
        emit(m,'car.front_door.mirror.housing.'+side,'front_door.'+side,.0005)
        m=K.Mesh()
        G.turn(m,[(.007,0),(.007,.054),(.009,.054),(.010,0)],axis,center,'chrome',96)
        emit(m,'car.front_door.mirror.face.'+side,'front_door.'+side,0)


def build():
    glazing()
    sails()
    cowl()
    mirrors()
    rolled_windows()
