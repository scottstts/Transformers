"""Crowned armor. Rows: (z, center x, half width, forward edge, forward ridge)."""
from .kit import V
import math
from .shape import curve1


def surface_forward(rows,x,z):
    xc,w,f,ridge=[curve1([(r[0],r[k]) for r in rows])(z) for k in range(1,5)]
    u=max(-1,min(1,(x-xc)/w))
    return f+(ridge-f)*math.cos(u*math.pi/2)


def inset(rows,outline,lift=0.009,thickness=0.018):
    """A fitted dark inset or painted marking following the armor curvature."""
    rim=[]
    for a,b in zip(outline,outline[1:]+outline[:1]):
        for k in range(3):
            t=k/3
            x,z=a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t
            rim.append(V(x,surface_forward(rows,x,z)+lift,z))
    center=sum(rim,V(0,0,0))/len(rim)
    center.y=-surface_forward(rows,center.x,center.z)-lift
    n=len(rim)
    verts=rim+[center]+[p+V(0,-thickness,0) for p in rim]
    faces=[[i,(i+1)%n,n] for i in range(n)]
    faces.append(list(range(n+1,2*n+1)))
    faces += [[i,n+1+i,n+1+(i+1)%n,(i+1)%n] for i in range(n)]
    return verts,faces


def shield(rows, thickness=0.045):
    # Monotone splines keep authored corners in the silhouette without the
    # bottle-like regular sections of the previous limb armor.
    tracks=[curve1([(r[0],r[k]) for r in rows]) for k in range(1,5)]
    zs=[a[0]+(b[0]-a[0])*j/4 for a,b in zip(rows,rows[1:]) for j in range(4)]+[rows[-1][0]]
    rows=[(z,*(fn(z) for fn in tracks)) for z in zs]
    us=(-1,-0.8,-0.4,0,0.4,0.8,1)
    width=len(us)
    verts=[]
    for back in (False,True):
        for z,x,w,f,ridge in rows:
            d=thickness if back else 0
            verts.extend(V(x+w*u,f+(ridge-f)*math.cos(u*math.pi/2)-d,z) for u in us)
    n=len(rows)*width
    faces=[]
    for i in range(len(rows)-1):
        for k in range(width-1):
            a=i*width+k
            faces.append([a,a+1,a+width+1,a+width])
            faces.append([n+a+width,n+a+width+1,n+a+1,n+a])
    rim=list(range(width))+[i*width+width-1 for i in range(1,len(rows))]+list(range(n-2,n-width-1,-1))+[i*width for i in range(len(rows)-2,0,-1)]
    faces += [[a,b,b+n,a+n] for a,b in zip(rim,rim[1:]+rim[:1])]
    return verts,faces
