"""Short cervical joint seated in a broad, chest-supported angular collar."""
from . import kit as K, geometry as G, robot_geometry as M


def neck():
    # The articulation is buried in the collar; only the upper bearing shows.
    m=K.Mesh()
    G.turn(m,[(-.100,0),(-.100,.116),(-.072,.123),(-.020,.112),
              (.035,.100),(.061,.082),(.061,0)],(0,0,1),(0,0,0),'dark',64)
    M.emit(m,'neck.recessed.cervical.block','neck')
    m=K.Mesh()
    G.turn(m,[(.014,.083),(.014,.102),(.024,.105),(.031,.101),
              (.031,.083)],(0,0,1),(0,0,0),'machined',64,True)
    M.emit(m,'neck.upper.yaw.race','neck')
    for s in (-1,1):
        M.actuator('neck.%s.short.oblique.pitch.ram'%s,'neck',
                   (s*.129,.036,-.056),(s*.086,.012,.054),.026)
        M.tube('neck.%s.recessed.power.bundle'%s,'neck',
               [(s*.090,.079,-.082),(s*.106,.086,-.020),(s*.075,.058,.049)],.009)
    # A single squat throat shield, not a stack resembling a long vertebra.
    M.panel('neck.short.throat.shield','neck',
            [(-.088,-.047),(-.075,.028),(0,.053),(.075,.028),(.088,-.047),(0,-.064)],
            lambda x,z:(x,-.104-.013*(1-abs(x)/.09),z),.015,
            'robot_graphite',spacing=.008)
    M.tube('neck.throat.upper.arris','neck',
           [(-.075,-.106,.029),(0,-.117,.054),(.075,-.106,.029)],.003,'machined')
    m=K.Mesh()
    G.turn(m,[(-.061,0),(-.061,.068),(-.043,.086),(-.010,.079),
              (.003,.060),(.003,0)],(0,0,1),(0,.010,0),'dark',64)
    M.emit(m,'head.underside.gimballed.socket','head')


def collar():
    # Closed, faceted lower saddle spans the sternum and hides the spinal post.
    # Upper side wings embrace the jaw; the central notch clears the chin.
    m=K.Mesh()
    rows=[]
    for z,w,front,back in ((.650,.235,-.058,.290),(.699,.301,-.120,.311),
                            (.781,.280,-.119,.308),(.839,.215,-.074,.282)):
        rows.append([(-w*.64,front,z),(w*.64,front,z),(w,front+.071,z),
                     (w,back-.035,z),(w*.66,back,z),(-w*.66,back,z),
                     (-w,back-.035,z),(-w,front+.071,z)])
    m.loft(rows,'robot_graphite')
    M.emit(m,'chest.collar.faceted.load.saddle','chest',.007)
    for s in (-1,1):
        p=[(.030,.730),(.173,.704),(.299,.754),(.265,.858),
           (.169,.941),(.111,.921),(.109,.858),(.040,.828)]
        def front(x,z):
            return s*x,-.134+.072*max(0,min(1,(z-.760)/.18)),z
        M.panel('chest.%s.solid.gorget.guard'%s,'chest',p,front,.038,
                'paint',spacing=.011)
        # Selective bright upper edge leaves the lower saddle visually solid.
        M.tube('chest.%s.gorget.rolled.rim'%s,'chest',
               [front(x,z) for x,z in p[2:7]],.005,'machined')
        # Broad side load webs connect front collar, rear saddle and jaw seat.
        q=[(-.044,.776),(.255,.755),(.293,.831),(.241,.938),
           (.115,.965),(.015,.931),(-.065,.854)]
        M.panel('chest.%s.collar.lateral.load.web'%s,'chest',q,
                lambda y,z:(s*(.175+.072*max(0,min(1,(.92-z)/.15))),y,z),
                .031,'robot_graphite',outward=(s,0,0),spacing=.013,
                cutouts=[[(.099,.814),(.210,.811),(.223,.854),(.162,.887),(.110,.874)]])
        M.actuator('chest.%s.collar.seated.diagonal.strut'%s,'chest',
                   (s*.236,.208,.765),(s*.119,.179,.918),.027)
        m=K.Mesh()
        for x,z in ((.203,.790),(.157,.883)):
            y=front(x,z)[1]
            G.hardware(m,(s*x,y-.003,z),(s*x,y-.014,z),.011,'bronze',6)
        M.emit(m,'chest.%s.collar.recessed.fixings'%s,'chest')
    # Broad rear bridge, with an open center for the upper bearing.
    M.panel('chest.collar.rear.saddle.bridge','chest',
            [(-.235,.759),(.235,.759),(.204,.876),(.115,.927),
             (.078,.874),(-.078,.874),(-.115,.927),(-.204,.876)],
            lambda x,z:(x,.295-.045*(z-.76)/.17,z),.033,
            'robot_graphite',outward=(0,1,0),spacing=.012)
