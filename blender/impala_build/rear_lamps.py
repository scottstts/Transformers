"""Continuous rear chrome wave, cast recesses and five-section optical lenses."""
from . import kit as K, contract as D, geometry as G
from .body import emit


OPENING=[(.349,.610),(.883,.610),(.883,.714),(.388,.714)]
CAST=[(.300,.575),(.930,.575),(.950,.596),(.950,.654),(.916,.728),
      (.875,.737),(.389,.737),(.349,.723),(.300,.651)]
UPPER=[(.954,.651),(.924,.727),(.896,.741),(.852,.747),(.391,.745),
       (.356,.733),(.334,.709),(.296,.658),(.20,.657),(0,.655)]
LOWER=[(-.954,.651),(-.947,.603),(-.933,.579),(-.906,.566),(-.349,.566),
       (-.323,.575),(-.295,.602),(-.18,.606),(0,.608)]


def opening(s):
    return [(s*x,z) for x,z in G.rounded_polygon(OPENING,.007,16)]


def chrome_wave():
    # A single joined border owns both lamp brows and the central recess.
    path=UPPER+list(reversed([(-x,z) for x,z in UPPER[:-1]]))
    path+=LOWER[1:]+list(reversed([(-x,z) for x,z in LOWER[:-1]]))[1:]
    # A closed tangent fillet retains the straight runs without Catmull-Rom
    # reversing its tangent at a short elbow adjoining a long chrome run.
    samples=G.rounded_polygon(path,.022,16)
    m=K.Mesh()
    section=[(-.003,-.009),(.001,-.011),(.006,-.010),(.009,-.006),(.010,0),
             (.009,.006),(.006,.010),(.001,.011),(-.003,.009)]
    G.sweep(m,[(x,D.tail_y(x)+.023,z) for x,z in samples],section,'chrome',(0,1,0),True)
    emit(m,'car.rear.connected.lamp.and.center.chrome.surround','tail',0)


def lamp(s,tail):
    outline=opening(s)
    cutter=G.cutters_prism([(x,D.TAIL-.11,z) for x,z in outline],(0,.21,0))
    G.exact_cut(tail,cutter,'Traced five-section tail lamp recess')
    m=K.Mesh()
    outer=[(s*x,z) for x,z in G.rounded_polygon(CAST,.012,12)]
    points=[(s*x,z) for x in G.lin(.31,.94,51) for z in G.lin(.58,.73,21)]
    G.constrained_skin(m,outer,points,[],lambda x,z:(x,D.tail_y(x)+.018,z),.008,(0,1,0),'dark',cutouts=[outline])
    emit(m,'car.rear.lamp.cast.recess.'+str(s),'tail',0)
    for i,(a,b,mat) in enumerate(((.353,.490,'red_lens'),(.496,.513,'red_lens'),
                                 (.520,.689,'clear_lens'),(.695,.712,'red_lens'),(.719,.880,'red_lens'))):
        low,high=.614,.710
        top=max(a,.388)+.002 if i==0 else a
        p=G.rounded_polygon([(a,low),(b,low),(b,high),(top,high)],.003,12)
        rings=[]
        for depth,shrink in ((-.014,0),(.014,0),(.016,.0015)):
            rings.append([(s*(x+shrink if x<(a+b)/2 else x-shrink),D.tail_y(s*x)+depth,
                           z+shrink if z<(low+high)/2 else z-shrink) for x,z in p])
        m=K.Mesh();m.loft(rings,mat,cap=True,smooth=True)
        emit(m,'car.rear.lamp.%s.section.%d'%(s,i),'tail',.0003)
        m=K.Mesh()
        for z in G.lin(low+.005,high-.005,17):
            left=max(a+.003,.349+.039*(z-.610)/.104+.003)
            if left>=b-.003:continue
            G.sweep(m,[(s*x,D.tail_y(s*x)+.0163,z) for x in G.lin(left,b-.003,31)],
                    G.round_section(.00065,.00045,6),mat,(0,1,0))
        emit(m,'car.rear.lamp.%s.section.%d.optical.ribs'%(s,i),'tail',0)
    m=K.Mesh()
    for x in (.493,.5165,.692,.7155):
        G.sweep(m,[(s*x,D.tail_y(s*x)+.022,z) for z in G.lin(.611,.713,21)],
                G.round_section(.004,.004,12),'chrome',(0,1,0))
    emit(m,'car.rear.lamp.four.lens.dividers.'+str(s),'tail',.0003)


def build(tail):
    for s in (-1,1):lamp(s,tail)
    chrome_wave()
