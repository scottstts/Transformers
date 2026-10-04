"""Reference head and telescopic mechanical neck; no scale-based deployment."""
from . import kit as K,robot_geometry as M,head_face,head_helmet,cervical


def neck():
    cervical.neck()


def build():
    M.materials()
    neck()
    start=len(K.PARTS)
    head_helmet.build();head_face.build()
    # Authored physical size, retained at exactly unit object scale throughout
    # deployment, proportioned against the car-hood chest.
    for obj in K.PARTS[start:]:
        for vertex in obj.data.vertices:
            p=vertex.co
            p*=1.42
            # Seated lower on the cervical sleeve for a short, heavy neck.
            p.z-=.185
        obj.data.update()
