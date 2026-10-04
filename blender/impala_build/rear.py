"""Recessed triplet lamp cavities, curved rear bumper and stencil-owned badge."""
import math
from . import kit as K, contract as D, geometry as G, badge, rear_bumper, rear_lamps
from .body import emit
from .front import plate


LAMP_Z=.662


def lamp_outline(w,h,inset=.031):
    return G.rounded_polygon([(-w/2,-h/2),(w/2,-h/2),(w/2-inset,h/2),(-w/2+inset,h/2)],(.014,.014,.026,.026),12)


def lamp(s):
    cx=s*.616
    outline=lamp_outline(.520,.105,.015)
    # Matched black cast surround and rolled chrome perimeter own the cavity.
    m=K.Mesh()
    rings=[]
    for width,height,depth in ((.615,.131,.004),(.615,.131,.021),(.522,.105,.028),(.510,.098,.004)):
        p=lamp_outline(width,height,.031)
        rings.append([(cx+x,D.tail_surface_y(cx+x,LAMP_Z+z)+depth,LAMP_Z+z) for x,z in p])
    rings.append(rings[0])
    m.loft(rings,'dark',cap=False,smooth=True)
    emit(m,'car.rear.lamp.cast.surround.'+str(s),'tail',.001)
    m=K.Mesh()
    rings=[]
    for width,height,depth in ((.642,.140,.016),(.647,.137,.025),(.614,.114,.035),(.607,.108,.019)):
        p=lamp_outline(width,height,.033)
        rings.append([(cx+x,D.tail_surface_y(cx+x,LAMP_Z+z)+depth,LAMP_Z+z) for x,z in p])
    rings.append(rings[0])
    m.loft(rings,'chrome',cap=False,smooth=True)
    emit(m,'car.rear.lamp.rolled.perimeter.'+str(s),'tail',.001)
    m=K.Mesh()
    G.sweep(m,[(cx+x,D.tail_y(cx+x)+.018,.589) for x in G.lin(-.322,.322,45)],
            [(-.010,-.006),(.017,-.006),(.023,0),(.017,.008),(-.010,.008)],'chrome',(0,1,0))
    emit(m,'car.rear.lamp.lower.stamped.ledge.'+str(s),'tail',.0013)
    for i,(offset,mat) in enumerate(((-.173,'red_lens'),(0,'clear_lens'),(.173,'red_lens'))):
        m=K.Mesh()
        p=lamp_outline(.161,.097,.007 if i else .012)
        rings=[]
        for depth,k in ((-.020,.98),(.007,1),(.010,.94)):
            rings.append([(cx+offset+x*k,D.tail_y(cx+offset+x*k)+depth,LAMP_Z+z*k) for x,z in p])
        m.loft(rings,mat,cap=True,smooth=True)
        emit(m,'car.rear.lamp.%s.%d.lens'%(s,i),'tail',.0009)
        # Raised rib geometry is bonded to the molded lens, not a duplicate face.
        m=K.Mesh()
        for z in G.lin(LAMP_Z-.038,LAMP_Z+.038,15):
            G.sweep(m,[(cx+offset+x,D.tail_y(cx+offset+x)+.0105,z) for x in G.lin(-.068,.068,24)],
                    G.round_section(.0007,.0005,6),mat,(0,1,0))
        emit(m,'car.rear.lamp.%s.%d.ribs'%(s,i),'tail',0)
    m=K.Mesh()
    for offset in (-.0865,.0865):
        G.sweep(m,[(cx+offset,D.tail_y(cx+offset)+.013,z) for z in G.lin(LAMP_Z-.05,LAMP_Z+.05,9)],G.round_section(.007,.008,12),'chrome',(0,1,0))
    emit(m,'car.rear.lamp.dividers.'+str(s),'tail',.0005)
    return outline


def build():
    m=K.Mesh()
    rows=[]
    for t in G.lin(0,1,49):
        row=[]
        for u in G.lin(-1,1,119):
            # The deck lid's trailing edge overhangs the panel's top flange.
            x=u*D.side_x(D.TAIL,.858)
            # Tracks just under the lid and quarter trailing edges, without a ramp
            # at the lid/quarter seam.
            top=.858+.012*abs(u)**6-.014+.011*max(0,min(1,(abs(x)-.74)/.26))
            z=.554+(top-.554)*t
            x=u*D.side_x(D.TAIL,z)
            row.append((x,D.tail_surface_y(x,z),z))
        rows.append(row)
    G.skin(m,rows,.009,(0,1,0))
    obj=emit(m,'car.rear.sculpted.tail.panel','tail',0)
    rear_lamps.build(obj)
    K.finish(obj,.0015)
    badge.build()
    rear_decoration()
    rear_bumper.build()
    plate('rear',.467,D.TAIL+.122,1,'rear_bumper',width=.286,height=.137,letter_size=.095)
    m=K.Mesh()
    G.skin(m,[[(x,D.tail_y(x)-.004,z) for x in G.lin(-.883,.883,71)] for z in G.lin(.376,.460,23)],.008,(0,1,0))
    emit(m,'car.rear.lower.valance','tail',.001)
    for s in (-1,1):
        x=s*.764
        m=K.Mesh()
        # Rolled tubular tips have open dark interiors and an actual rim wall.
        G.turn(m,[(-.240,.025),(-.040,.025),(0,.027),(.020,.027),(.024,.025),(.019,.023),(-.240,.023)],
               (0,1,0),(x,2.900,.361),'chrome',64,True)
        emit(m,'car.exhaust.rolled.tip.'+str(s),'tail',.0005)


def rear_decoration():
    m=K.Mesh()
    outline=[(-.302,.026),(.302,.026),(.282,-.026),(-.282,-.026)]
    m.prism([(x,D.tail_surface_y(x,.707+z)+.011,.707+z) for x,z in outline],(0,.006,0),'chrome')
    emit(m,'car.rear.center.stamped.V.trim','tail',.002)
    m=K.Mesh()
    outline=[(-.287,.019),(.287,.019),(.274,-.019),(-.274,-.019)]
    m.prism([(x,D.tail_surface_y(x,.707+z)+.019,.707+z) for x,z in outline],(0,.003,0),'clear')
    for s in (-1,1):
        for x,w in ((.090,.059),(.167,.070),(.241,.050)):
            m.prism([(s*x+a,D.tail_surface_y(s*x,.707)+.024,.707+b) for a,b in G.rounded_rect(w,.021,.0015,5)],(0,.002,0),'red')
    emit(m,'car.rear.center.red.white.inlay','tail',.0005)
    m=K.Mesh()
    m.prism([(x,D.tail_surface_y(x,.707)+.029,.707+z) for x,z in G.rounded_rect(.054,.039,.002,6)],(0,.004,0),'chrome')
    m.prism([(x,D.tail_surface_y(x,.707)+.034,.707+z) for x,z in G.rounded_rect(.043,.030,.0015,5)],(0,.002,0),'enamel_blue')
    outline=[(-.017,-.004),(-.007,-.004),(-.007,-.008),(.007,-.008),(.007,-.004),(.017,-.004),
             (.017,.004),(.007,.004),(.007,.008),(-.007,.008),(-.007,.004),(-.017,.004)]
    m.prism([(x,D.tail_surface_y(x,.707)+.038,.707+z) for x,z in outline],(0,.002,0),'bronze')
    emit(m,'car.rear.center.bowtie.medallion','tail',.0005)
    m=K.Mesh()
    G.turn(m,[(0,0),(0,.012),(.006,.015),(.010,.013),(.011,.008),(.012,0)],(0,1,0),(0,D.tail_surface_y(0,.772)+.001,.772),'chrome',32)
    emit(m,'car.trunk.lock.medallion','tail',.0005)
