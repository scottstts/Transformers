"""Reference head: swept crown lances, upswept optics and a mechanical jaw.

The front and profile designs follow batmobile-transformer.jpeg. Crown
surfaces run longitudinally into the occiput; none converges on a pole.
Armor ribbons have closed undersides and explicit bevels. Normals follow
the longitudinal lanes, with sharp splits at the designed crosswise keels.
"""
import math
from mathutils import Vector
from . import kit, rkit
from .kit import V
from .rkit import Part
from .robot_head import plate, shell_surface
from .shape import lathe, curve1


def ribbon(stations, side=1, thickness=.023):
    """Closed longitudinal plate; stations=(x,f,z,half-width,keel height).

    Two broad faces meet on a central keel, with narrow edge chamfers.
    Every visible face is explicitly triangulated where the station bends.
    The backing follows the same topology; no nonplanar cap n-gons.
    """
    # Smooth only ALONG each designed strip. Crosswise keels remain sharp.
    # Uniform parameter sampling avoids a star of triangles at the crown.
    tracks=[curve1([(float(i),st[k]) for i,st in enumerate(stations)]) for k in range(5)]
    stations=[tuple(fn(i/4) for fn in tracks) for i in range(4*(len(stations)-1)+1)]
    us=(-1,-.84,0,.84,1)
    points=[]
    for x,f,z,w,h in stations:
        for u in us:
            crown_lift=.018*max(0,min(1,(z-.45)/.13))*(1-abs(u))
            points.append((side*(x+w*u),f+h*(1-abs(u)),z+crown_lift))
    faces=[]
    for r in range(len(stations)-1):
        for j in range(4):
            a=r*5+j
            faces.extend([[a,a+1,a+6],[a,a+6,a+5]])
    # Backing closes into the cranium. It does not project through the face.
    inner=[]
    for x,f,z in points:
        toward=Vector((-x,-.025-f,.31-z)).normalized()*thickness
        inner.append((x+toward.x,f+toward.y,z+toward.z))
    return shell_surface(points,faces,inner)


def polygon_strip(outer, inner, side=1, thickness=.020):
    """A broad fitted cheek/brow rail between two authored edge polylines."""
    points=[]
    for a,b in zip(outer,inner):
        points.extend([(side*a[0],a[1],a[2]),(side*b[0],b[1],b[2])])
    faces=[]
    for i in range(len(outer)-1):
        a=2*i
        faces += [[a,a+1,a+3],[a,a+3,a+2]]
    return shell_surface(points,faces,[(x,f-thickness,z) for x,f,z in points])


def fin(side, secondary=False):
    """Long narrow horn with a diamond cross-section, rooted in the helmet."""
    if secondary:
        stations=[(.18,.237,-.095,.040,.085),(.37,.286,-.102,.044,.097),
                  (.51,.315,-.160,.027,.064),(.635,.331,-.224,.0015,.003)]
    else:
        stations=[(.35,.200,-.087,.045,.107),(.51,.238,-.091,.037,.109),
                  (.67,.256,-.162,.017,.062),(.845,.270,-.239,.0013,.003)]
    rings=[]
    for z,x,f,w,d in stations:
        rings.append([V(side*(x+w*u),f+d*v,z) for u,v in
                      ((-.7,.75),(0,1),(1,.12),(.54,-1),(-.7,-.67))])
    return kit.loft(rings,True,True)


def optics(side):
    # A four-sided upswept slit. The angular housing is wider than the lens.
    rim=[(.030,.343,.296),(.209,.259,.367),(.187,.282,.312),(.062,.350,.260)]
    c=sum((Vector(p) for p in rim),Vector())/4
    outside=[(side*x,f,z) for x,f,z in rim]
    inside=[]
    for p in rim:
        q=c+(Vector(p)-c)*.86
        inside.append((side*q.x,q.y+.003,q.z))
    points=outside+inside
    faces=[[j,(j+1)%4,4+(j+1)%4,4+j] for j in range(4)]
    housing=shell_surface(points,faces,[(x,f-.018,z) for x,f,z in points])
    well=plate([(side*x,f-.020,z) for x,f,z in rim],.018)
    lens=plate([(x,f-.005,c.z+(z-c.z)*.62) for x,f,z in inside],.012)
    return housing,well,lens


def finish(part,coll,width=.002,armor=True):
    o=part.build(coll,width,3,28)
    if armor:
        # Weighted normals on smooth polygon fans caused the earlier dents.
        # Preserve their designed keels with explicit sharp edge boundaries.
        o.data.shade_smooth()
        o.data.set_sharp_from_angle(angle=math.radians(24))
        # Surface normals follow each swept lane. Weighted face-area normals
        # would flatten the long strip against its small end-cap triangles.
        for modifier in list(o.modifiers):
            if modifier.type=='WEIGHTED_NORMAL':
                o.modifiers.remove(modifier)
    return o


def build(coll):
    core=Part('R.head.skull')
    # A compact cast skull, hidden behind the authored armor. Broad side and
    # back masses supply depth without turning the forehead into a dome.
    rings=[]
    for z,w,f,b in ((.035,.105,.135,-.13),(.14,.188,.192,-.21),
                     (.28,.237,.191,-.263),(.415,.241,.177,-.270),
                     (.53,.185,.075,-.237),(.58,.11,-.025,-.17)):
        # the side edge's front and rear points must stay in order, or the ring
        # folds over itself (the crown ring did: a z-fighting fold on top)
        sf,sb=f-.08,b+.075
        if sf-sb<.01:
            sf,sb=(sf+sb)/2+.005,(sf+sb)/2-.005
        rings.append([V(x,y,z) for x,y in ((0,f),(.65*w,f),(w,sf),(w,sb),
                     (.6*w,b),(-.6*w,b),(-w,sb),(-w,sf),(-.65*w,f))])
    core.add(kit.loft(rings,True,True),'armorDark')
    core.add(lathe([(0,-.012),(.117,-.012),(.136,.02),(.12,.061),(0,.061)],32,'z'),'darkSteel')
    cowl=Part('R.head.cowl')
    face=Part('R.head.face')
    eye=Part('R.head.optics')

    # Central spear-shaped crown: low at the bridge, widening above the
    # eyes, then flowing rearward across the head. No polar triangle fan.
    cowl.add(ribbon([(0,.347,.282,.006,.010),(0,.317,.352,.037,.025),
                     (0,.263,.452,.072,.039),(0,.179,.545,.089,.046),
                     (0,.055,.603,.063,.032),(0,-.074,.608,.052,.023),
                     (0,-.201,.551,.066,.015),(0,-.265,.429,.057,.009)],
                    thickness=.030),'graphite')
    for s in (-1,1):
        # Each brow/crown side is one swept solid ribbon, tapering to the
        # bridge. The highlight follows the same gesture as the reference.
        cowl.add(ribbon([(.023,.342,.286,.014,.012),(.087,.303,.358,.029,.025),
                         (.152,.229,.452,.037,.039),(.179,.130,.542,.032,.032),
                         (.170,-.015,.586,.028,.021),(.180,-.173,.490,.028,.014),
                         (.203,-.231,.332,.033,.010)],s,.026),'armor')
        # The outer eyebrow turns up toward the root of the tall crown blade.
        cowl.add(polygon_strip(
            [(.024,.355,.310),(.115,.312,.386),(.225,.224,.414),(.249,.095,.497)],
            [(.040,.353,.294),(.126,.310,.358),(.236,.206,.380),(.264,.076,.460)],s,.028),'graphite')
        cowl.add(fin(s),'armor')
        cowl.add(fin(s,True),'armor')
        # Occipital armor joins the fins to the jaw hinge rather than leaving
        # the side of the head as a slab or exposing a naked spherical core.
        cowl.add(ribbon([(.215,-.211,.486,.031,.014),(.246,-.252,.351,.028,.012),
                         (.231,-.254,.205,.029,.011),(.166,-.205,.095,.028,.009)],s,.025),'graphite')
        housing,well,lens=optics(s)
        face.add(housing,'graphite')
        eye.add(well,'interior')
        eye.add(lens,'eye')

        # The zygomatic blade sits immediately below the eye; two broad
        # faces replace the previous collection of disconnected cheek shards.
        face.add(polygon_strip(
            [(.041,.351,.255),(.124,.326,.294),(.224,.247,.338),(.253,.109,.275)],
            [(.069,.353,.232),(.143,.325,.259),(.233,.231,.287),(.256,.098,.244)],s,.026),'darkSteel')
        # Mandibular yoke: a long tapered casting swept back at the hinge.
        face.add(ribbon([(.235,.110,.278,.024,.016),(.214,.178,.205,.032,.022),
                         (.164,.236,.119,.036,.025),(.098,.283,.046,.029,.019),
                         (.045,.287,.005,.015,.009)],s,.026),'graphite')
        # Recessed cheek insert occupies the bounded space inside the yoke.
        face.add(polygon_strip(
            [(.088,.302,.232),(.132,.273,.164),(.089,.280,.062)],
            [(.170,.271,.256),(.184,.218,.165),(.120,.253,.068)],s,.021),'armorDark')
        core.add(rkit.drum((s*.248,-.063,.197),.043,.032,'x',24,.004),'darkSteel')
        core.add(rkit.cylinder((s*.267,-.063,.197),.020,.006,'x',12),'armorDark')
        core.add(rkit.cylinder((s*.272,-.063,.197),.008,.006,'x',6),'bronze')

    # Projecting nasal spine and the narrow mechanical lower mask are long,
    # readable planes. The pointed chin closes the yoke without loose pieces.
    face.add(ribbon([(0,.352,.303,.010,.020),(0,.357,.260,.035,.031),
                     (0,.327,.207,.044,.035),(0,.290,.164,.035,.025)],
                    thickness=.025),'armor')
    face.add(ribbon([(0,.291,.191,.069,.024),(0,.314,.142,.061,.029),
                     (0,.305,.075,.049,.029),(0,.285,.007,.021,.014)],
                    thickness=.027),'graphite')
    # Three short machined reliefs in a fitted black respirator inset.
    face.add(plate([(-.025,.343,.153),(.025,.343,.153),(.019,.329,.083),
                    (0,.326,.064),(-.019,.329,.083)],.010),'armorDark')
    for z,f in ((.132,.344),(.112,.339),(.092,.335)):
        face.add(plate([(-.017,f,z),(.017,f,z),(.017,f,z+.005),(-.017,f,z+.005)],.004),'mech')
    return {'head':[finish(core,coll,.002,False),finish(cowl,coll,.0023),
                    finish(face,coll,.0015),finish(eye,coll,.0005)]}
