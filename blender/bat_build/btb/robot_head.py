"""Shared closed-plate geometry and the reference-head build entry point.

Head design lives in head_concept.py. These mesh helpers are also used by
the robot torso and limbs; coordinates are (x, forward, z).
"""
from collections import Counter
from mathutils import Vector
from .kit import V


def plate(points, depth=0.02):
    n=len(points)
    verts=[V(*p) for p in points]
    verts += [p+Vector((0,depth,0)) for p in verts]
    faces=[list(range(n)),list(range(2*n-1,n-1,-1))]
    faces += [[i,(i+1)%n,(i+1)%n+n,i+n] for i in range(n)]
    return verts,faces


def ridge(points, peak, depth=0.025):
    n=len(points)
    verts=[V(*p) for p in points]+[V(*peak)]
    verts += [V(x,f-depth,z) for x,f,z in points]
    faces=[[i,(i+1)%n,n] for i in range(n)]
    faces += [list(range(2*n,n,-1))]
    faces += [[i,n+1+i,n+1+(i+1)%n,(i+1)%n] for i in range(n)]
    return verts,faces


def mirrored(points, side):
    return [(side*x,f,z) for x,f,z in points]


def shell_surface(points, faces, inner):
    """Close an authored surface, including every aperture's reveal wall."""
    n=len(points)
    verts=[V(*p) for p in points]+[V(*p) for p in inner]
    edges=Counter(tuple(sorted((a,b))) for fc in faces for a,b in zip(fc,fc[1:]+fc[:1]))
    out=list(faces)+[[n+i for i in reversed(fc)] for fc in faces]
    for fc in faces:
        for a,b in zip(fc,fc[1:]+fc[:1]):
            if edges[tuple(sorted((a,b)))]==1:
                out.append([a,b,n+b,n+a])
    return verts,out


def build(coll):
    from .head_concept import build as concept_build
    return concept_build(coll)
