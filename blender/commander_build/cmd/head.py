"""Commander helmet, authored against the front and profile reference views.

The forehead is a projecting central spear between swept silver side plates.
The cranial cage stays behind these plates; it does not define the front face.
"""
import math
from mathutils import Vector
from . import kit as K


class HeadPart(K.Part):
    def build(self,coll,bones):
        ob=super().build(coll,bones)
        # Corner-angle weighting preserves the curved panels' authored smooth
        # normals; face-area weighting pinches their densely sampled quads.
        mod=ob.modifiers['wnormal']
        mod.mode='CORNER_ANGLE'
        mod.keep_sharp=True
        mod.weight=50
        mod.thresh=0.0
        return ob


def spline(points,t):
    """Cubic interpolation through authored stations, with linear end tangents."""
    q=t*(len(points)-1)
    i=min(int(q),len(points)-2)
    u=q-i
    b,c=Vector(points[i]),Vector(points[i+1])
    a=Vector(points[i-1]) if i else b*2-c
    d=Vector(points[i+2]) if i+2<len(points) else c*2-b
    return (b*2+(c-a)*u+(a*2-b*5+c*4-d)*u*u+
            (-a+b*3-c*3+d)*u*u*u)*.5


def skin(rows,thickness=.012,offset=(0,1,0),steps=48,columns=12):
    """A curved sheet from three longitudinal rails; no nonplanar n-gon fans."""
    verts,faces=[],[]
    rails=list(zip(*rows))
    normal=Vector(offset).normalized()
    for layer in (0,1):
        for k in range(steps+1):
            a,b,c=[spline(rail,k/steps) for rail in rails]
            for j in range(columns+1):
                u=j/columns
                v=a.lerp(b,u*2) if u<=.5 else b.lerp(c,u*2-1)
                verts.append(v+normal*(thickness if layer else 0))
    count=(steps+1)*(columns+1)
    for k in range(steps):
        for j in range(columns):
            i=k*(columns+1)+j
            q=[i,i+1,i+columns+2,i+columns+1]
            faces.extend((q,[v+count for v in reversed(q)]))
    rim=(list(range(columns+1))+[k*(columns+1)+columns for k in range(1,steps+1)]+
         [steps*(columns+1)+j for j in range(columns-1,-1,-1)]+
         [k*(columns+1) for k in range(steps-1,0,-1)])
    for i,j in zip(rim,rim[1:]+rim[:1]):faces.append([i,j,j+count,i+count])
    return verts,faces


def panel(points, thickness=.012, ridge=None, inward=(0, 1, 0)):
    """Closed plate preserving its sculpted front outline and depth."""
    front = [Vector(v) for v in points]
    n = len(front)
    offset = Vector(inward).normalized() * thickness
    verts = front + [v + offset for v in front]
    faces = [list(reversed(range(n, 2*n)))]
    if ridge is None:
        faces.append(list(range(n)))
    else:
        verts.append(Vector(ridge))
        faces.extend((i, (i+1) % n, 2*n) for i in range(n))
    faces.extend((i, n+i, n+(i+1) % n, (i+1) % n) for i in range(n))
    return verts, faces


def cage():
    # The front is a folded polygon, with a narrower swept upper cranium.
    stations = [(.105,.146,-.075,.160),(.230,.213,-.170,.203),
                (.345,.214,-.222,.220),(.440,.199,-.200,.218),
                (.525,.164,-.146,.200),(.574,.111,-.073,.162),
                (.600,.053,.008,.111),(.611,.006,.060,.070)]
    rings = []
    for k in range(41):
        z,w,front,back=spline(stations,k/40)
        depth=back-front
        # Each ring keeps the same convex vertex order. Fixed front offsets
        # used to run past the rear contour as the upper rings narrowed.
        half = [(0,front),(.40*w,front+.12*depth),(.78*w,front+.30*depth),
                (w,front+.55*depth),(.94*w,front+.78*depth),
                (.52*w,back-.025*depth),(0,back)]
        section = half + [(-x,y) for x,y in reversed(half[1:-1])]
        section = [(x*.88,y+.025) for x,y in section]
        ring=[]
        for x,y in section:
            zz=z
            if y>-.170 and z>.4:
                guide=[(yy,zz) for zz,ww,yy in DORSAL[6:]]
                zz=min(z,K.table_at(guide,y)[0]-.047)
            ring.append((x,y,zz))
        rings.append(ring)
    return K.ring_loft(rings)


def rear_base():
    """Single symmetric quad surface for the black occipital shield."""
    stations=[(.058,.083,.188),(.140,.131,.235),(.260,.171,.260),
              (.380,.161,.261),(.489,.104,.248)]
    rings=[]
    for k in range(49):
        z,w,y=spline(stations,k/48)
        front=[Vector((w*u,y-.065*u*u,z))
               for u in (-1+2*j/32 for j in range(33))]
        rings.append(front+[v-Vector((0,.016,0)) for v in reversed(front)])
    return K.ring_loft(rings)


def crown_cap():
    """Silver dorsal cap with transverse arch and longitudinal sweep."""
    stations = [(-.187,.578,.056),(-.111,.610,.104),(-.018,.625,.124),
                (.077,.613,.132),(.159,.582,.125),(.214,.535,.108)]
    rings = []
    for k in range(65):
        y,z,w=spline(stations,k/64)
        front=[]
        for j in range(17):
            t=-1+2*j/16
            front.append((t*w,y+.012*t*t,z-.031*t*t))
        rings.append(front+[(x,yy,zz-.012) for x,yy,zz in reversed(front)])
    return K.ring_loft(rings)


def welded(mesh):
    verts,faces=mesh
    unique,lookup,remap=[],{},[]
    for v in verts:
        key=tuple(round(c,8) for c in v)
        if key not in lookup:
            lookup[key]=len(unique)
            unique.append(v)
        remap.append(lookup[key])
    return unique,[[remap[i] for i in face] for face in faces]


# The ridge is deeper at the brow and retreats strongly toward the crown.
CREST = [(.158,.003,-.353),(.245,.030,-.362),(.345,.084,-.338),
         (.440,.111,-.294),(.510,.108,-.242),(.563,.086,-.186),
         (.578,.082,-.170)]

DORSAL = CREST + [(.604,.105,-.105),(.621,.124,-.018),
                  (.613,.132,.077),(.582,.125,.159),(.535,.108,.214)]


def dorsal_sheet():
    """One joined sheet from the brow to the nape; the crown cannot float above it."""
    rings=[]
    steps,columns=110,32
    shape=[(.023,0,0)]*7+[(.012,.013,0),(0,.025,0),
                          (0,.031,0),(0,.031,0),(0,.025,0)]
    for k in range(steps+1):
        t=k/steps
        z,w,y=spline(DORSAL,t)
        fold,drop,_=spline(shape,t)
        za,_,ya=spline(DORSAL,max(0,t-.001))
        zb,_,yb=spline(DORSAL,min(1,t+.001))
        inward=Vector((0,zb-za,-(yb-ya))).normalized()*.012
        front=[Vector((w*u,y-.005+fold*abs(u),z-drop*u*u))
               for u in (-1+2*j/columns for j in range(columns+1))]
        rings.append(front+[v+inward for v in reversed(front)])
    return K.ring_loft(rings),steps,2*(columns+1)


def crest():
    return skin([[(-w,y+.023,z),(0,y-.005,z),(w,y+.023,z)]
                 for z,w,y in CREST],.014,steps=64,columns=16)


def crest_at(z):
    lo,hi=0.,6/(len(DORSAL)-1)
    for _ in range(32):
        t=(lo+hi)*.5
        if spline(DORSAL,t).x<z:lo=t
        else:hi=t
    return spline(DORSAL,(lo+hi)*.5)


def rune(stations,proud=.010):
    rings=[]
    for k in range(49):
        z=K.lerp(stations[0][0],stations[-1][0],k/48)
        w=K.table_at(stations,z)[0]
        y=crest_at(z).z-proud
        rings.append([(-w,y,z),(w,y,z),(w,y+.003,z),(-w,y+.003,z)])
    return K.ring_loft(rings)


def parts():
    p = HeadPart('head','head',bevel=.0015,angle=38)
    p.add(cage(),'obsidian')
    p.add(rear_base(),'obsidian')
    sheet,steps,section=dorsal_sheet()
    first=len(p.faces)
    p.add(sheet,'head_alloy')
    p.add(([],[]),'face_alloy')
    capslot=p.slots.index('face_alloy')
    for row in range(60,steps):
        for col in range(section):p.fslot[first+row*section+col]=capslot
    # A narrow recessed dark face, covered by the silver jaw plates below.
    p.add(K.loft([(-.112,K.sec(.025,.068,.5,.5,-.225)),
                  (-.049,K.sec(.123,.169,.5,.5,-.182,keel=.037)),
                  (.088,K.sec(.265,.250,.5,.5,-.133,keel=.062)),
                  (.228,K.sec(.367,.294,.5,.5,-.118,keel=.077)),
                  (.308,K.sec(.357,.262,.5,.5,-.085,keel=.078))],0),
          'obsidian',sharp=True)
    for mirrored in (False,True):
        # Swept silver forehead side lobe, ending in a point beside the eye.
        p.add(skin([
            [(.055,-.347,.189),(.065,-.340,.200),(.077,-.323,.211)],
            [(.062,-.323,.290),(.129,-.281,.315),(.174,-.185,.337)],
            [(.113,-.254,.400),(.150,-.205,.418),(.190,-.115,.433)],
            [(.118,-.202,.497),(.145,-.148,.505),(.174,-.083,.517)],
            [(.095,-.145,.550),(.111,-.106,.552),(.127,-.053,.555)]],
            .014), 'casque',mirrored)
        # The antenna forms the outer border; an extra overlapping blade here
        # would cut through the silver temple cap.
        # Dark eye cavity, red slit and raised upper black brow.
        p.add(panel([(.023,-.362,.188),(.096,-.317,.252),
                     (.191,-.226,.324),(.209,-.171,.306),
                     (.154,-.282,.232),(.035,-.365,.170)],.014),
              'visor',mirrored)
        p.add(panel([(.027,-.370,.185),(.102,-.324,.249),
                     (.186,-.235,.314),(.176,-.254,.289),
                     (.087,-.339,.217)],.006),'optic',mirrored)
        p.add(skin([
            [(.024,-.362,.211),(.027,-.364,.220),(.030,-.352,.233)],
            [(.098,-.330,.256),(.103,-.324,.268),(.105,-.306,.279)],
            [(.191,-.228,.324),(.199,-.213,.337),(.209,-.190,.350)]],
            .011,steps=32,columns=4),'obsidian',mirrored)
        # Broad silver V below the eyes, with its centre left dark.
        p.add(skin([
            [(.010,-.296,-.082),(.022,-.292,-.088),(.034,-.284,-.084)],
            [(.015,-.323,.004),(.050,-.310,.009),(.078,-.282,.011)],
            [(.020,-.352,.096),(.075,-.326,.103),(.125,-.266,.114)],
            [(.026,-.370,.166),(.091,-.338,.213),(.153,-.285,.265)]],
            .012,steps=48,columns=12),'face_alloy',mirrored)
        # Outer cheek armour wraps under the temple instead of rounding out.
        p.add(skin([
            [(.043,-.250,-.099),(.095,-.110,-.085),(.105,.030,-.051)],
            [(.097,-.260,.005),(.165,-.130,.001),(.199,.080,.029)],
            [(.154,-.269,.165),(.219,-.120,.157),(.246,.060,.183)],
            [(.177,-.260,.254),(.230,-.092,.251),(.244,.081,.277)]],
            .018,steps=40,columns=8),'obsidian',mirrored)
        p.add(panel([(.247,-.141,.233),(.247,.061,.252),
                     (.247,.069,.185),(.247,-.086,.038),
                     (.247,-.186,-.040),(.247,-.192,.021)],.016,
                    inward=(-1,0,0)), 'casque',mirrored)
        p.add(panel([(.251,-.141,.233),(.251,-.128,.219),
                     (.251,-.180,.062),(.251,-.192,.021)],.006,
                    inward=(-1,0,0)), 'steel',mirrored)
        # Segmented temple housing and inset red angular actuator.
        p.add(panel([(.222,-.047,.365),(.263,.050,.341),
                     (.254,.195,.262),(.207,.201,.091),
                     (.190,.076,.030),(.214,-.077,.187)],.030,
                    (.281,.078,.227),inward=(-1,0,0)), 'obsidian',mirrored)
        p.add(panel([(.277,.039,.290),(.281,.089,.302),
                     (.260,.140,.207),(.254,.074,.189)],.009,
                    inward=(-1,0,0)), 'crimson',mirrored)
        p.add(panel([(.280,.047,.274),(.280,.076,.282),
                     (.262,.119,.218),(.261,.090,.214)],.004,
                    inward=(-1,0,0)), 'optic',mirrored)
        # Octagonal ear frame surrounds a concentric red bearing.
        ear=(.282,.097,.236)
        p.add(K.drum(ear,.091,.038,'X',32), 'structure',mirrored)
        p.add(welded(K.ring((.309,.097,.236),.102,.069,.017,'X',8)),
              'obsidian',mirrored)
        p.add(welded(K.ring((.319,.097,.236),.059,.050,.009,'X',40)),
              'optic',mirrored)
        p.add(K.cyl((.316,.097,.236),.047,.010,'X',32), 'crimson',mirrored)
        for dy in (-.025,-.012,0,.012,.025):
            p.add(K.rod((.323,.097+dy,.217),(.323,.097+dy,.255),.0018,6),
                  'structure',mirrored)
        for yy,zz in ((.064,.325),(.170,.225),(.071,.155)):
            p.add(K.hex_bolt((.311,yy,zz),(1,0,0),.008,.004),
                  'steel',mirrored)
        p.add(panel([(.273,.054,.349),(.263,.151,.361),
                     (.268,.217,.289),(.308,.162,.292),
                     (.316,.098,.303)],.012,inward=(-1,0,0)),
              'silver',mirrored,True)
        # Long outer blades have the pronounced rearward sweep of the profile.
        p.add(K.spike([(.225,-.028,.229,.038,.067),
                       (.260,.039,.410,.037,.065),
                       (.285,.121,.644,.026,.045),
                       (.328,.340,1.070,.001,.001)],4,phase=math.pi/4),
              'obsidian',mirrored,True)
        p.add(K.spike([(.249,-.037,.390,.006,.010),
                       (.275,.105,.642,.005,.012),
                       (.324,.327,1.047,.0003,.0004)],4), 'steel',mirrored)
        p.add(K.spike([(.146,-.207,.235,.035,.059),
                       (.143,-.101,.494,.035,.070),
                       (.150,.029,.716,.023,.047),
                       (.155,.190,.920,.0008,.0008)],4,phase=math.pi/4),
              'obsidian',mirrored,True)
        # Large silver side wings, rising over a second dark rear blade.
        p.add(panel([(.234,.080,.347),(.210,.200,.406),
                     (.185,.420,.480),(.258,.260,.315),
                     (.261,.083,.297)],.022,(.255,.220,.375),
                    inward=(-1,0,0)), 'silver',mirrored)
        p.add(skin([
            [(.216,-.100,.353),(.214,-.100,.448),(.156,-.100,.545)],
            [(.237,.040,.372),(.232,.040,.476),(.166,.040,.582)],
            [(.246,.142,.340),(.231,.142,.452),(.184,.142,.537)],
            [(.238,.208,.295),(.232,.208,.364),(.208,.208,.430)]],
            .013,offset=(-1,0,0),steps=40,columns=12), 'face_alloy',mirrored)
        p.add(panel([(.244,.079,.317),(.262,.297,.336),
                     (.211,.469,.340),(.202,.190,.194)],.021,
                    (.281,.216,.276),inward=(-1,0,0)), 'obsidian',mirrored)
        # Peaked nape armour and small rear V light.
        p.add(panel([(.105,.222,.461),(.151,.220,.389),
                     (.211,.176,.261),(.174,.209,.272),
                     (.111,.240,.367),(.089,.237,.438)],.009,
                    inward=(0,-1,0)), 'steel',mirrored)
        p.add(panel([(0,.273,.369),(.084,.261,.281),
                     (.073,.267,.317),(0,.274,.393)],.004,
                    inward=(0,-1,0)), 'optic',mirrored)
    # The nose is a dark vertical spear inside the lower silver V.
    p.add(panel([(-.022,-.373,.163),(0,-.383,.189),(.022,-.373,.163),
                 (.014,-.337,.027),(0,-.300,-.049),(-.014,-.337,.027)],
                .013,(0,-.366,.071)), 'obsidian')
    p.add(panel([(-.023,-.292,-.047),(.023,-.292,-.047),
                 (.030,-.282,-.090),(-.030,-.282,-.090)],.008), 'face_alloy')
    for z in (-.060,-.077):
        p.add(K.hex_bolt((0,-.299,z),(0,-1,0),.004,.003),'steel')
    # Tapered red rune on the central forehead, continuing below the eyes.
    p.add(rune([(.158,.0008),(.245,.009),(.345,.011),
                (.369,.019),(.394,.009)]),'optic')
    p.add(rune([(.416,.006),(.487,.010),(.530,.013),(.573,.008)]),'optic')
    p.add(rune([(.235,.0006),(.255,.0035),(.348,.0035),(.362,.0006)],.013),
          'optic_core')
    return [p]
