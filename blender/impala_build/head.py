"""Reference head and telescopic mechanical neck; no scale-based deployment."""
from . import kit as K,geometry as G,robot_geometry as M,head_face,head_helmet


def neck():
    m=K.Mesh()
    G.turn(m,[(-.020,0),(-.020,.092),(-.006,.104),(.016,.101),(.025,.065),
              (.103,.064),(.112,.080),(.133,.076),(.143,.053),(.148,0)],
           (0,0,1),(0,0,0),'dark',96)
    for z in (.014,.058,.100):
        G.turn(m,[(z,.064),(z+.005,.079),(z+.011,.078),(z+.016,.064)],
               (0,0,1),(0,0,0),'chrome',80,True)
    M.emit(m,'neck.turned.cervical.column','neck')
    M.bearing('neck.pitch.gimbal','neck',(0,0,.135),(1,0,0),.046,.100)
    m=K.Mesh()
    G.turn(m,[(.150,.033),(.150,.045),(.184,.049),(.217,.042),(.225,.034),(.225,.026)],
           (0,0,1),(0,0,0),'dark',80,True)
    M.emit(m,'neck.upper.skull.socket','neck')
    m=K.Mesh()
    G.turn(m,[(-.015,.030),(-.015,.046),(.019,.048),(.047,.044),(.073,.038),(.073,.027)],
           (0,0,1),(0,.008,0),'dark',80,True)
    M.emit(m,'head.underside.rigid.cervical.coupling','head')
    for s in (-1,1):
        path=[(s*.095,-.035,-.037),(s*.098,-.055,.018),(s*.074,-.036,.100),(s*.051,-.017,.142)]
        M.tube('neck.%s.articulated.throat.strut'%s,'neck',path,.008,'machined')
        path=[(s*.067,.077,-.021),(s*.061,.080,.047),(s*.047,.053,.128)]
        M.tube('neck.%s.routed.cervical.hose'%s,'neck',path,.012,'dark')
    outline=[(-.036,-.025),(.036,-.025),(.047,.008),(.031,.112),(0,.137),(-.031,.112),(-.047,.008)]
    M.panel('neck.central.throat.blade','neck',outline,lambda x,z:(x,-.088+.26*z,z),.009,'machined',spacing=.006)


def build():
    M.materials()
    from . import robot_refit
    robot_refit.neck()
    start=len(K.PARTS)
    head_helmet.build();head_face.build()
    # Authored physical size, retained at exactly unit object scale throughout
    # deployment. The previous helmet was too small against the car chest.
    for obj in K.PARTS[start:]:
        for vertex in obj.data.vertices:
            p=vertex.co
            p*=1.13
        obj.data.update()
