"""Reference helmet: deep rounded shell, wraparound optics, compact metal mask.

The side silhouette has a full occipital volume. The curved brow, narrow eyes,
flat chin and close-fitting cheek strips follow semi-transformer.jpeg.
"""
import math
from mathutils import Vector
from . import kit, rkit
from .kit import V
from .rkit import Part
from .shape import lathe, curve1


def plate(points, depth=0.025):
    n=len(points)
    verts=[V(*p) for p in points]
    verts += [p+Vector((0,depth,0)) for p in verts]
    faces=[list(range(n)),list(range(2*n-1,n-1,-1))]
    faces += [[i,(i+1)%n,(i+1)%n+n,i+n] for i in range(n)]
    return verts,faces


def solid_grid(rows,thickness=0.022):
    """Close a sampled face surface, including its entire rim."""
    nr,nc=len(rows),len(rows[0])
    verts=[V(*p) for row in rows for p in row]
    N=len(verts)
    verts += [p+Vector((0,thickness,0)) for p in verts]
    faces=[]
    for i in range(nr-1):
        for j in range(nc-1):
            a=i*nc+j
            faces += [[a,a+1,a+nc+1,a+nc],[N+a+nc,N+a+nc+1,N+a+1,N+a]]
    rim=list(range(nc))+[i*nc+nc-1 for i in range(1,nr)]+list(range(N-2,N-nc-1,-1))+[i*nc for i in range(nr-2,0,-1)]
    faces += [[a,b,b+N,a+N] for a,b in zip(rim,rim[1:]+rim[:1])]
    return verts,faces


def brow(a):
    a=abs(a)
    if a<1.04: return 0.405+0.085*(math.sin(a/1.04*math.pi/2)**1.7)
    if a<1.58: return 0.49-0.29*(a-1.04)/0.54
    return 0.20-0.035*(a-1.58)/(math.pi-1.58)


def helmet_point(a,t,inset=0):
    e0=math.asin((brow(a)-0.46)/0.48)
    e=e0+(math.pi/2-e0)*t
    return ( (0.372-inset)*math.cos(e)*math.sin(a),
            -0.065+(0.515-inset)*math.cos(e)*math.cos(a),
             0.46+(0.48-inset)*math.sin(e))


def shell():
    na,ne=80,24
    verts=[]
    for d in (0,0.026):
        for j in range(ne):
            for i in range(na):
                a=-math.pi+2*math.pi*i/na
                verts.append(V(*helmet_point(a,j/ne,d)))
    N=na*ne; faces=[]
    for side in (0,N):
        for j in range(ne-1):
            for i in range(na):
                a=side+j*na+i; b=side+j*na+(i+1)%na
                f=[a,b,b+na,a+na]
                faces.append(f if side==0 else f[::-1])
        pole=len(verts);verts.append(V(0,-0.065,0.94-(0.026 if side else 0)))
        for i in range(na):
            f=[side+(ne-1)*na+i,side+(ne-1)*na+(i+1)%na,pole]
            faces.append(f if side==0 else f[::-1])
    for i in range(na):
        k=(i+1)%na;faces.append([k,i,i+N,k+N])
    return verts,faces


def front(x):
    return -0.050+0.505*math.sqrt(max(0.04,1-(x/0.381)**2))


def cheek(s):
    inner=curve1([(0.065,0.15),(0.15,0.18),(0.26,0.218),(0.36,0.295),(0.45,0.334)])
    outer=curve1([(0.065,0.225),(0.15,0.268),(0.26,0.315),(0.36,0.36),(0.45,0.359)])
    rows=[]
    for i in range(23):
        z=0.065+0.385*i/22
        rows.append([(s*x,front(x)+0.030,z)
                     for x in [inner(z)+(outer(z)-inner(z))*j/4 for j in range(5)]])
    return solid_grid(rows,0.030)


def fin(s):
    # Tapered blade grows back out of the ear mount and splays slightly out.
    # Its sharp tip has actual thickness, rather than a rectangular antenna.
    outline=[(0.359,-0.12,0.29),(0.395,-0.33,0.45),(0.47,-0.48,1.015),
             (0.458,-0.43,1.045),(0.412,-0.30,0.77),(0.366,-0.11,0.49)]
    verts=[V(s*x,f,z) for x,f,z in outline]
    verts += [V(s*(x+0.024*(1-min(1,max(0,(z-0.4)/0.65)))+0.004),f,z) for x,f,z in outline]
    n=len(outline)
    faces=[list(range(n)),list(range(2*n-1,n-1,-1))]
    faces += [[i,(i+1)%n,(i+1)%n+n,i+n] for i in range(n)]
    return verts,faces


def build(coll):
    core=Part('R.head.skull')
    core.add(rkit.frame([(0.04,0.27,0.39,0.07,-0.14),(0.18,0.43,0.53,0.12,-0.14),
                         (0.44,0.56,0.62,0.15,-0.16),(0.69,0.50,0.59,0.14,-0.15)],cap=0.03),'graphite')
    core.add(lathe([(0,0.005),(0.18,0.005),(0.205,0.04),(0.18,0.10),(0,0.10)],40,'z'),'darkSteel')
    helmet=Part('R.head.helmet')
    helmet.add(shell(),'paint')
    # Recess-like hairline seams delineate the broad, smooth central crown.
    for s in (-1,1):
        path=[]
        for i in range(32):
            t=i/31
            x=s*(0.095+0.056*t)
            r=math.sqrt(1-(x/0.372)**2)
            e=-0.08+1.51*t
            f=-0.065+0.515*r*math.cos(e)
            z=0.46+0.48*r*math.sin(e)
            path.append((x,f+0.003,z+0.003))
        helmet.add(rkit.hose(path,0.0028,6,2),'mech')
        # Short dark service slots at the rear of the crown, as in the front ref.
        rows=[]
        for j in range(10):
            t=0.65+0.17*j/9
            row=[]
            for k in range(4):
                x=s*(0.095+0.056*t+(k/3-0.5)*0.017)
                r=math.sqrt(1-(x/0.372)**2)
                e=-0.08+1.51*t
                row.append((x,-0.065+0.515*r*math.cos(e)+0.006,
                            0.46+0.48*r*math.sin(e)+0.004))
            rows.append(row)
        helmet.add(solid_grid(rows,0.012),'graphite')
    face=Part('R.head.face')
    # Continuous curved black orbital surround, behind the overhanging brow.
    rows=[]
    for j in range(10):
        row=[]
        for i in range(49):
            a=-1.22+2.44*i/48
            x,f,top=helmet_point(a,0)
            top-=0.009
            bot=0.30+0.045*(abs(x)/0.235) if abs(x)<=0.235 else 0.345-0.10*(abs(x)-0.235)/0.11
            z=bot+(top-bot)*j/9
            row.append((x,f-0.008,z))
        rows.append(row)
    face.add(solid_grid(rows,0.028),'blackChrome')
    for s in (-1,1):
        # Slender, curved slit optics. Wider at the outer temple, fading to
        # a fine inner point; no flat rectangular eye stickers.
        rows=[]
        for j in range(2):
            row=[]
            for i in range(19):
                t=i/18; x=0.095+0.19*t
                a=math.asin(x/0.372)
                z=brow(a)-0.040-(0.007+0.016*math.sin(math.pi*t)**0.55)*(1-j)
                row.append((s*x,front(x)+0.007,z))
            rows.append(row)
        face.add(solid_grid(rows,0.011),'eye')
        face.add(cheek(s),'paint')
        # Two compact, dark machined planes meet along a shallow central keel.
        # The chin is flat and broad, with no beak or dangling cheek points.
        mask=[(s*0.007,0.530,0.303),(s*0.11,0.47,0.35),(s*0.235,0.35,0.345),
              (s*0.188,0.36,0.245),(s*0.132,0.351,0.075),(s*0.007,0.450,0.075)]
        face.add(plate(mask,0.038),'darkSteel')
        # Fine bevel on the outer edge gives the metallic mask its outline.
        face.add(rkit.hose([(s*0.224,0.359,0.339),(s*0.18,0.369,0.242),
                             (s*0.128,0.361,0.081)],0.007,8,4),'darkSteel')
    face.add(plate([(-0.116,0.363,0.076),(0.116,0.363,0.076),
                    (0.108,0.353,0.054),(-0.108,0.353,0.054)],0.022),'blackChrome')
    ears=Part('R.head.temples')
    for s in (-1,1):
        ears.add(rkit.drum((s*0.359,-0.165,0.35),0.129,0.059,'x',40,0.008),'graphite')
        ears.add(rkit.cylinder((s*0.394,-0.165,0.35),0.079,0.018,'x',32),'darkSteel')
        ears.add(rkit.cylinder((s*0.407,-0.165,0.35),0.043,0.014,'x',24),'blackChrome')
        ears.many(rkit.bolt_ring((s*0.410,-0.165,0.35),(s,0,0),0.102,6,0.010,0.006),'darkSteel')
        ears.add(fin(s),'graphite')
        # Nape plates make the back of the helmet read as a substantial shell.
        ears.add(rkit.plate_x([(-0.25,0.24),(-0.47,0.30),(-0.51,0.17),
                               (-0.36,0.055),(-0.20,0.085)],
                              *((0.21,0.29) if s>0 else (-0.29,-0.21)),0.015),'paint')
    return {'head':[p.build(coll,0.0025,2,35) for p in (core,helmet,face,ears)]}
