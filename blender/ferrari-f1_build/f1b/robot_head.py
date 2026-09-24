"""Reference-shaped Ferrari helmet in head-local (x, forward, z).

Folded solid armor panels surround recessed optics. The mask, nose and jaw
have explicitly authored planes, rather than being projected onto a sphere.
All islands use the existing R.head.helmet object and material contract.
"""
import math
from mathutils import Vector
from . import kit, rkit, rig
from .kit import V
from .rkit import Part
from .shape import lathe


CRANIUM = [(.030,.052,.050,.000), (.065,.084,.070,-.004),
           (.130,.130,.095,-.006), (.225,.147,.117,-.008),
           (.285,.142,.123,-.014), (.340,.113,.108,-.021),
           (.372,.071,.076,-.024), (.382,.028,.035,-.023)]


def armor(points, thick=0.008, ridge=None):
    """Watertight plate with an authored front and recessed back.

    Optional ridge point creates deliberate planar facets on the front.
    """
    n = len(points)
    verts = [V(*q) for q in points] + [V(x, f-thick, z) for x, f, z in points]
    faces = [list(range(n, 2*n))[::-1]]
    faces += [[i, (i+1)%n, (i+1)%n+n, i+n] for i in range(n)]
    if ridge is None:
        faces.append(list(range(n)))
    else:
        verts.append(V(*ridge))
        faces += [[i, (i+1)%n, 2*n] for i in range(n)]
    return verts, faces


def plate(p, points, slot, side=1, thick=0.008, ridge=None):
    p.add(armor([(side*x,f,z) for x,f,z in points], thick,
                (side*ridge[0],ridge[1],ridge[2]) if ridge else None), slot)


def strip(p, rows, slot, thick=0.006):
    """Solid ribbon with shared quad topology along paired section points."""
    front = [V(*v) for pair in rows for v in pair]
    verts = front + [v+Vector((0,thick,0)) for v in front]
    n = len(front)
    faces = []
    for i in range(0,n-2,2):
        faces += [[i,i+1,i+3,i+2], [i+n+2,i+n+3,i+n+1,i+n]]
    rim = list(range(0,n,2)) + list(range(n-1,0,-2))
    faces += [[a,b,b+n,a+n] for a,b in zip(rim,rim[1:]+rim[:1])]
    p.add((verts,faces),slot)


def curved_strip(p, rows, slot, thick=0.006):
    """Crown ribbons have curved longitudinal flow and crisp lateral edges."""
    a = rkit.smooth_path([r[0] for r in rows], 5)
    b = rkit.smooth_path([r[1] for r in rows], 5)
    solid_grid(p, list(zip(a,b)), slot, abs(thick))


def solid_grid(p, rows, slot, thick):
    """Close a curved panel along its surface normals, never a fixed axis.

    This matters over the crown and around the back: a forward extrusion
    there would cut sideways through the neighboring shell layers.
    """
    rows = [[V(*v) for v in row] for row in rows]
    nr,nc = len(rows),len(rows[0])
    outer = [v for row in rows for v in row]
    inner = []
    for i,row in enumerate(rows):
        for j,v in enumerate(row):
            u = row[min(j+1,nc-1)]-row[max(0,j-1)]
            t = rows[min(i+1,nr-1)][j]-rows[max(0,i-1)][j]
            normal = u.cross(t).normalized()
            if normal.dot(v-Vector((0,.014,.205)))<0:
                normal.negate()
            inner.append(v-normal*thick)
    n=len(outer)
    faces=[]
    for i in range(nr-1):
        for j in range(nc-1):
            a=i*nc+j
            faces.extend([[a,a+1,a+nc+1,a+nc],
                          [a+n+nc,a+n+nc+1,a+n+1,a+n]])
    rim=(list(range(nc)) + [i*nc+nc-1 for i in range(1,nr)] +
         list(range(n-2,n-nc-1,-1)) + [i*nc for i in range(nr-2,0,-1)])
    faces += [[a,b,b+n,a+n] for a,b in zip(rim,rim[1:]+rim[:1])]
    start = len(p.b.faces)
    p.add((outer+inner,faces),slot)
    p.smooth_faces.extend(range(start,len(p.b.faces)))


def inlay(p, outline, surface, ridge, slot, side):
    """Clip an inlay to each folded armor facet, avoiding intersecting trim.

    The front depth is barycentrically interpolated on the host surface;
    the tiny positive offset represents the actual applied metal inlay.
    """
    def cross(a,b,c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    for a,b in zip(surface,surface[1:]+surface[:1]):
        tri = [a,b,ridge]
        t = [(v[0],v[2]) for v in tri]
        if cross(*t)<0:
            tri.reverse(); t.reverse()
        poly = list(outline)
        for u,v in zip(t,t[1:]+t[:1]):
            clipped=[]
            if not poly:
                break
            for q,r in zip(poly,poly[1:]+poly[:1]):
                dq,dr = cross(u,v,q),cross(u,v,r)
                if dq>=-1e-10:
                    clipped.append(q)
                if (dq>0)!=(dr>0) and abs(dq-dr)>1e-12:
                    k=dq/(dq-dr)
                    clipped.append((q[0]+k*(r[0]-q[0]),q[1]+k*(r[1]-q[1])))
            poly=clipped
        if len(poly)<3:
            continue
        area=cross(*t)
        if abs(area)<1e-12:
            continue
        clean=[]
        for q in poly:
            if not clean or math.dist(q,clean[-1])>1e-7:
                clean.append(q)
        if len(clean)>2 and math.dist(clean[0],clean[-1])<1e-7:
            clean.pop()
        if len(clean)<3:
            continue
        points=[]
        for q in clean:
            w=[cross(t[1],t[2],q)/area,cross(t[2],t[0],q)/area,cross(t[0],t[1],q)/area]
            points.append((q[0],sum(v[1]*k for v,k in zip(tri,w))+.0012,q[1]))
        plate(p,points,slot,side,.0015)


def skull(p):
    """Tapered cranial casting, set back behind the separate mask."""
    # The casting is an internal support, with clearance to the shell's inner
    # wall. Its previous full-size ellipse crossed the chord of rear plates.
    sections = [(z,.86*w,.80*d,fc) for z,w,d,fc in CRANIUM]
    n = 64
    verts = [V(w*math.sin(2*math.pi*j/n),fc+d*math.cos(2*math.pi*j/n),z)
             for z,w,d,fc in sections for j in range(n)]
    faces = [list(range(n))[::-1]]
    for k in range(len(sections)-1):
        for j in range(n):
            a,b = k*n+j,k*n+(j+1)%n
            faces.append([a,b,b+n,a+n])
    faces.append(list(range((len(sections)-1)*n,len(sections)*n)))
    start = len(p.b.faces)
    p.add((verts,faces),'blackChrome')
    p.smooth_faces.extend(range(start,len(p.b.faces)))
    # Original head socket; the neck assembly is unchanged.
    p.add(kit.revolve([(0,-.030),(.064,-.030),(.072,-.016),(.070,.030),
                      (.050,.052),(0,.052)],32),'darkSteel')


def face(p):
    """Narrow orbital slits, folded silver mask and a split pointed chin."""
    for s in (1,-1):
        plate(p,[(.012,.166,.222),(.123,.117,.273),(.127,.122,.236),
                 (.043,.185,.195),(.016,.188,.202)],'interior',s,.012)
        # Recessed optic and machined lower orbital lip.
        plate(p,[(.025,.194,.205),(.110,.145,.241),(.121,.136,.254),
                 (.115,.137,.232),(.038,.190,.194)],'titanium',s,.006)
        plate(p,[(.025,.187,.219),(.112,.143,.256),(.101,.153,.239),
                 (.041,.190,.210)],'eye',s,.006)
        plate(p,[(.035,.192,.220),(.105,.154,.250),(.095,.161,.241),
                 (.044,.195,.217)],'eye',s,.003)
        # Black facial casting exposes deep channels beside a narrow silver mask.
        plate(p,[(.006,.189,.199),(.104,.136,.223),(.106,.132,.156),
                 (.060,.150,.065),(.014,.173,.030)],'blackChrome',s,.014,(.055,.179,.139))
        # Two long folded planes meet at the nose ridge, tapering sharply below.
        # The reference has no human nose or grille: the whole mask is the keel.
        plate(p,[(.005,.205,.202),(.034,.191,.196),(.103,.148,.230),
                 (.078,.170,.181),(.052,.189,.143),(.032,.210,.084),
                 (.006,.226,.098)],'silver',s,.010,(.034,.225,.165))
        plate(p,[(.100,.140,.215),(.113,.126,.216),(.082,.154,.155),
                 (.048,.183,.093),(.038,.192,.081),(.056,.177,.149)],
              'darkSteel',s,.007,(.078,.169,.161))
        # Small bifurcated chin tips below the dark chevron separation.
        plate(p,[(.007,.224,.088),(.029,.212,.075),(.034,.199,.063),
                 (.014,.185,.033),(.005,.195,.056)],'silver',s,.007,(.017,.222,.071))
        strip(p,[[(s*.113,.138,.205),(s*.120,.134,.206)],
                 [(s*.095,.150,.130),(s*.103,.141,.132)],
                 [(s*.055,.162,.060),(s*.064,.151,.057)],
                 [(s*.018,.180,.028),(s*.025,.165,.029)]],'darkSteel',.005)
    plate(p,[(-.003,.204,.205),(.003,.204,.205),(.004,.224,.101),
             (0,.225,.095),(-.004,.224,.101)],'darkSteel',thick=.004)
    plate(p,[(-.006,.190,.067),(.006,.190,.067),(.012,.177,.033),
             (0,.179,.022),(-.012,.177,.033)],'blackChrome',thick=.006)


def cheeks(p):
    for s in (1,-1):
        # Black gasket and folded red cheek blade wrapping around the temple.
        plate(p,[(.120,.118,.262),(.158,.057,.264),(.157,.058,.172),
                 (.123,.098,.089),(.050,.142,.021),(.076,.151,.087),(.113,.144,.175)],
              'carbon',s,.015,(.138,.130,.170))
        plate(p,[(.125,.133,.254),(.152,.091,.254),(.148,.098,.180),
                 (.117,.131,.112),(.054,.154,.025),(.082,.162,.104),(.108,.160,.175)],
              'paint',s,.012,(.130,.160,.186))
        strip(p,[[(s*.120,.144,.242),(s*.125,.145,.244)],
                 [(s*.107,.166,.177),(s*.112,.166,.178)],
                 [(s*.080,.168,.108),(s*.085,.163,.105)]],'silver',.003)
        plate(p,[(.147,.080,.183),(.162,.038,.199),(.157,.026,.126),
                 (.106,.088,.056),(.124,.102,.111)],'paint',s,.011,(.157,.080,.139))


def brow(p):
    for s in (1,-1):
        plate(p,[(.002,.204,.220),(.045,.190,.248),(.142,.112,.324),
                 (.179,.070,.354),(.136,.144,.270),(.039,.211,.218)],
              'blackChrome',s,.014,(.093,.185,.274))
        surface=[(.003,.214,.229),(.047,.202,.259),(.144,.123,.331),
                 (.170,.086,.349),(.129,.158,.277),(.036,.223,.231)]
        ridge=(.085,.194,.280)
        plate(p,surface,'paint',s,.012,ridge)
        # Swept silver inlay follows the reference's angular V.
        inlay(p,[(.022,.244),(.051,.262),(.151,.337),(.111,.289),(.049,.249)],
              surface,ridge,'silver',s)


def crest(p):
    # Segmented crown ribs, separated by narrow dark channels.
    for s in (1,-1):
        for x0,x1,slot in ((.032,.067,'darkSteel'),(.074,.105,'blackChrome')):
            curved_strip(p,[[(s*x0,.104,.295),(s*x1,.088,.300)],
                     [(s*x0*.94,.075,.349),(s*x1*.93,.060,.343)],
                     [(s*x0*.80,.008,.383),(s*x1*.80,.003,.374)],
                     [(s*x0*.80,-.067,.367),(s*x1*.84,-.061,.355)],
                     [(s*x0,-.112,.316),(s*x1,-.099,.308)]],slot,.013)
    # Substrate closes the forehead down onto the cranium beneath the red crest.
    curved_strip(p,[[(-.008,.209,.240),(.008,.209,.240)],
                    [(-.031,.165,.300),(.031,.165,.300)],
                    [(-.031,.091,.362),(.031,.091,.362)],
                    [(-.021,.025,.384),(.021,.025,.384)],
                    [(-.015,-.052,.372),(.015,-.052,.372)]],'blackChrome',.032)
    curved_strip(p,[[(-.003,.224,.232),(.003,.224,.232)],
             [(-.024,.182,.308),(.024,.182,.308)],
             [(-.025,.112,.372),(.025,.112,.372)],
             [(-.015,.056,.410),(.015,.056,.410)],
             [(-.012,-.018,.401),(.012,-.018,.401)],
             [(-.011,-.088,.356),(.011,-.088,.356)],
             [(-.009,-.120,.303),(.009,-.120,.303)]],'paint',.017)
    plate(p,[(-.004,.228,.242),(0,.232,.229),(.004,.228,.242),
             (.005,.213,.276),(0,.216,.285),(-.005,.213,.276)],'paint',thick=.005)
    p.add(rkit.plate_x([(.113,.363),(.063,.425),(.037,.448),(.015,.445),
                       (-.009,.398),(-.085,.353)],-.007,.007,.0015),'paint')
    # Solid center spine under the crown ribbon, closing the dorsal return.
    p.add(rkit.plate_x([(.108,.367),(.060,.411),(-.018,.402),(-.088,.356),
                       (-.120,.303),(-.103,.297),(-.071,.344),(-.022,.370),
                       (.037,.368),(.073,.340)],-.011,.011,.001),'paint')
    # Black-bordered forehead shield and a tiny modeled heraldic horse relief.
    def badge_point(x,z,lift=0):
        return (x,.188-(z-.306)*.98+lift,z)
    ferrari_badge(p, badge_point)


def ferrari_badge(p, badge_point):
    """Shared shield and modeled horse, with a caller-supplied host surface."""
    outline = [(-.015,.335),(.015,.335),(.014,.310),(0,.295),(-.014,.310)]
    plate(p,[badge_point(x,z,.004) for x,z in outline],'blackChrome',thick=.004)
    plate(p,[badge_point(x*.83,.315+(z-.315)*.84,.006) for x,z in outline],'yellow',thick=.003)
    horse = [(-.003,.320),(-.006,.325),(-.003,.327),(.001,.324),(.002,.329),
             (.006,.329),(.007,.326),(.004,.324),(.004,.321),(.008,.318),
             (.009,.314),(.006,.314),(.005,.317),(.002,.317),(.003,.313),
             (.001,.310),(.004,.305),(.001,.304),(-.002,.309),(-.005,.305),
             (-.007,.306),(-.004,.312),(-.006,.315),(-.005,.319),(-.008,.320),
             (-.009,.323),(-.007,.324),(-.007,.321)]
    plate(p,[badge_point(x,z,.009) for x,z in horse],'blackChrome',thick=.002)


def horns(p):
    for s in (1,-1):
        plate(p,[(.131,.105,.287),(.168,.078,.314),(.324,-.004,.489),
                 (.249,.036,.355),(.181,.074,.272)],'carbon',s,.013,(.207,.092,.354))
        plate(p,[(.140,.118,.291),(.169,.094,.322),(.324,.001,.489),
                 (.240,.055,.369),(.180,.095,.283)],'paint',s,.010,(.207,.102,.355))
        plate(p,[(.178,.098,.300),(.239,.059,.370),(.315,.010,.476),
                 (.244,.052,.354),(.190,.084,.293)],'yellow',s,.003)
        plate(p,[(.240,.056,.385),(.324,.003,.489),(.302,.016,.452)],'silver',s,.002)
        plate(p,[(.095,.029,.342),(.110,.014,.405),(.121,.008,.428),
                 (.120,-.007,.358),(.111,.002,.331)],'paint',s,.007,(.114,.024,.378))


def ears(p):
    for s in (1,-1):
        center = (s*.148,-.006,.217)
        def rotor(profile,slot,seg=64,closed=False):
            start = len(p.b.faces)
            p.add(lathe([(r,s*h) for r,h in profile],seg,'x',center=center,closed=closed),slot)
            p.smooth_faces.extend(range(start,len(p.b.faces)))
        rotor([(0,-.011),(.052,-.011),(.058,-.004),(.058,.008),(.051,.016),(0,.016)],'graphite')
        rotor([(.041,.014),(.049,.014),(.052,.019),(.049,.024),(.041,.024)],'gold',closed=True)
        rotor([(0,.017),(.033,.017),(.035,.022),(.032,.026),(0,.026)],'blackChrome')
        rotor([(0,.025),(.017,.025),(.018,.030),(.014,.034),(0,.034)],'darkSteel')
        p.many(rkit.bolt_ring(center,(s,0,0),.044,6,.0032,.0025,.025,math.pi/6),'titanium')
        for j in range(3):
            p.add(rkit.hose([(s*.138,-.037,.263-j*.016),(s*.159,-.055,.248-j*.017),
                            (s*.153,-.064,.185-j*.014)],.0035,8,4),'darkSteel')


def rear(p):
    def point(z, angle, lift=0):
        for a,b in zip(CRANIUM,CRANIUM[1:]):
            if a[0]<=z<=b[0]:
                t=(z-a[0])/(b[0]-a[0])
                w,d,fc=[a[j]+t*(b[j]-a[j]) for j in (1,2,3)]
                q=math.radians(angle)
                return ((w+lift)*math.sin(q),fc+(d+lift)*math.cos(q),z)
        raise ValueError('rear shell outside cranial envelope')
    # Recessed central spine closes the split between the two red back plates.
    solid_grid(p,[[point(z,174+12*j/6,.002) for j in range(7)]
                  for z in (.082,.110,.160,.225,.285,.325,.351)],'carbon',.005)
    for s in (1,-1):
        # Wrap the shell around the skull with enough azimuth stations to
        # preserve curvature. Each outer wall has a matching recessed wall.
        stations=[(.082,112,169),(.110,101,173),(.160,94,176),
                  (.225,94,176),(.285,99,175),(.325,109,172),(.351,129,166)]
        rows=[]
        for z,lo,hi in stations:
            rows.append([point(z,s*(lo+(hi-lo)*j/16),.008) for j in range(17)])
        solid_grid(p,rows,'paint',.008)
        # Gasket at the nape remains below the armor, inside its outer surface.
        for k in range(3):
            z=.082+.018*k
            rows=[[point(zz,s*(130+43*j/12),.011) for j in range(13)]
                  for zz in (z,z+.006)]
            solid_grid(p,rows,'carbon',.004)


def neck():
    p = Part('R.neck.column')
    top = rig.HEAD_Z - rig.NECK_Z
    p.add(kit.revolve([(0.0, -0.050), (0.070, -0.050), (0.088, -0.030), (0.086, -0.010), (0.070, 0.010), (0.058, 0.050),
                       (0.046, top - 0.030), (0.042, top - 0.004), (0.0, top - 0.004)], 28), 'darkSteel')
    for z in (0.018, 0.048, 0.078):
        p.add(rkit.plate_z([(x, f) for x, f in kit.chamfer_rect(0.150, 0.140, 0.040)], z - 0.008, z + 0.008, 0.003), 'graphite')
    for s in (1, -1):
        p.add(rkit.hose([(s * 0.040, -0.060, -0.020), (s * 0.052, -0.080, 0.050), (s * 0.040, -0.064, top - 0.010)], 0.010), 'rubber')
        p.add(rkit.hose([(s * 0.070, 0.020, -0.030), (s * 0.080, 0.030, 0.050), (s * 0.060, 0.030, top - 0.020)], 0.008), 'rubber')
    return [p]


def head():
    h = Part('R.head.helmet')
    h.smooth_faces = []
    for detail in (skull,face,cheeks,brow,crest,horns,ears,rear):
        detail(h)
    return [h]


def build_head(coll):
    """Same authored shading for full builds and live head-only refreshes."""
    p = head()[0]
    o = p.b.build(p.name, coll, smooth=False)
    for i in p.smooth_faces:
        o.data.polygons[i].use_smooth = True
    kit.finish(o, 0.0007, 3, 25)
    return o


def build(coll):
    return {'neck': [p.build(coll, 0.004, 2, 30) for p in neck()],
            'head': [build_head(coll)]}
