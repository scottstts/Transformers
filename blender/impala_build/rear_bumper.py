"""Photo-traced rear bumper stamping with lamp steps and a pressed plate pocket."""
import math
from . import kit as K, contract as D, geometry as G
from .body import emit


TOP=D.Curve([(0,.599),(.265,.599),(.283,.589),(.315,.550),
             (.889,.550),(.911,.571),(.924,.614),(1.034,.614)])
BOTTOM=D.Curve([(0,.380),(.30,.382),(.73,.388),(1.034,.397)])
WIDTH=D.Curve([(.378,.940),(.405,.965),(.478,1.006),(.570,1.028),(.618,1.034)])
PROFILE=[(0,.008),(.020,.014),(.065,.017),(.20,.019),(.50,.019),(.82,.016),
         (.94,.005),(1,-.014),(1.026,-.057),(1.019,-.098),(.975,-.103),
         (.975,-.091),(1.006,-.087),(1.012,-.055),(.963,-.025),(.925,-.006),
         (.82,.004),(.50,.007),(.20,.007),(.065,.005),(.025,-.004)]


def point(u,v,depth):
    a=abs(u)*1.034
    z=BOTTOM(a)+(TOP(a)-BOTTOM(a))*v
    end=max(0,min(1,(abs(u)-.84)/.16))
    end=end*end*(3-2*end)
    # Rotate each complete section around the quarter corner. Changing its
    # width separately at every height folded the old cap through itself.
    theta=end*math.pi/2
    x=math.copysign(a+.009*end+depth*math.sin(theta),u)
    y=D.tail_y(x)+.099+depth*math.cos(theta)-.245*end*end
    return x,y,z


def build():
    m=K.Mesh()
    stations=sorted(set(G.lin(-1,1,401)+[s*x/1.034 for s in (-1,1) for x in TOP.x]))
    m.loft([[point(u,v,depth) for v,depth in PROFILE] for u in stations],'chrome',smooth=True)
    obj=emit(m,'car.rear.bumper.stepped.stamping','rear_bumper',0)
    # A partial-depth native cut leaves the stamped pocket's back wall intact.
    pocket=G.rounded_rect(.316,.153,.010,16)
    cutter=G.cutters_prism([(x,D.TAIL+.111,.467+z) for x,z in pocket],(0,.16,0))
    G.exact_cut(obj,cutter,'Pressed rear registration pocket')
    K.finish(obj,.0012,35)
    m=K.Mesh()
    outer=G.rounded_rect(.328,.161,.011,16)
    inner=G.rounded_rect(.294,.142,.008,16)
    rings=[]
    for outline,depth in ((outer,.115),(outer,.121),(inner,.121),(inner,.115)):
        rings.append([(x,D.tail_y(x)+depth,.467+z) for x,z in outline])
    rings.append(rings[0])
    m.loft(rings,'chrome',cap=False,smooth=True)
    emit(m,'car.rear.plate.pressed.pocket.reveal','rear_bumper',.0005)
    for s in (-1,1):guard(s)


def guard(s):
    m=K.Mesh()
    outline=G.rounded_rect(.033,.215,.012,18)
    def face(a,b,proud=0):
        x=s*(.589+.150*b)+a
        z=.489+b
        y=D.tail_y(x)+.147+.006*math.cos(math.pi*b/.215)-.040*b+proud
        return x,y,z
    m.prism([face(a,b) for a,b in outline],(0,-.035,0),'chrome')
    emit(m,'car.rear.bumper.guard.'+str(s),'rear_bumper',.0025)
    m=K.Mesh()
    outline=G.rounded_rect(.014,.184,.0065,16)
    m.prism([face(a,b,.002) for a,b in outline],(0,-.005,0),'rubber')
    emit(m,'car.rear.guard.pad.'+str(s),'rear_bumper',.001)
