"""Reference head and telescopic mechanical neck; no scale-based deployment."""
from . import kit as K,geometry as G,robot_geometry as M,head_face,head_helmet


# Armoured cervical sleeve: broad at the collar, tapering up into the skull
# between the jaw castings so the head reads as carried, not perched.
SLEEVE=[(-.030,0),(-.030,.100),(-.005,.106),(.060,.100),(.130,.090),
        (.175,.082),(.205,.072),(.225,.062),(.235,.054),(.235,0)]


def sleeve_radius(z):
    for (z0,r0),(z1,r1) in zip(SLEEVE[1:-1],SLEEVE[2:-1]):
        if z0<=z<=z1:return r0+(r1-r0)*(z-z0)/(z1-z0)
    return SLEEVE[1][1]


def neck():
    m=K.Mesh()
    G.turn(m,SLEEVE,(0,0,1),(0,0,0),'robot_graphite',96)
    M.emit(m,'neck.armoured.cervical.sleeve','neck')
    m=K.Mesh()
    for z in (.030,.090,.150):
        r=sleeve_radius(z)
        G.turn(m,[(z,r-.002),(z+.004,r+.006),(z+.010,r+.006),(z+.014,r-.002)],
               (0,0,1),(0,0,0),'chrome',80,True)
    M.emit(m,'neck.sleeve.machined.rings','neck')
    for s in (-1,1):
        path=[(s*.062,.090,-.021),(s*.057,.088,.060),(s*.047,.071,.160)]
        M.tube('neck.%s.routed.cervical.hose'%s,'neck',path,.012,'dark')


def build():
    M.materials()
    from . import robot_refit
    robot_refit.neck();neck()
    start=len(K.PARTS)
    head_helmet.build();head_face.build()
    # Authored physical size, retained at exactly unit object scale throughout
    # deployment, proportioned against the car-hood chest.
    for obj in K.PARTS[start:]:
        for vertex in obj.data.vertices:
            p=vertex.co
            p*=1.42
            # Seated lower on the cervical sleeve for a short, heavy neck.
            p.z-=.045
        obj.data.update()
