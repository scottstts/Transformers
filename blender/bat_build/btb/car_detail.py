"""Authored secondary Tumbler surfaces, welded into their existing assemblies.

Design coordinates are (x, station from nose, z). Keeping the original part
names means all facets, vents and fasteners inherit the existing timeline.
"""
from mathutils import Vector
from . import kit, rkit, dims as D
from .facet import P
from .kit import V


def folded(outline, peak, thickness=.022, normal=(1,0,0)):
    n=len(outline)
    d=Vector(normal).normalized()*thickness
    v=[P(*p) for p in outline]+[P(*peak)]
    v += [P(*p)-d for p in outline]
    f=[[i,(i+1)%n,n] for i in range(n)]
    f += [list(range(2*n,n,-1))]
    f += [[i,n+1+i,n+1+(i+1)%n,(i+1)%n] for i in range(n)]
    return v,f


def sample_skin(points,faces,s,z):
    """Outermost x at (station,height), projected onto explicit triangles."""
    hits=[]
    for fc in faces:
        for k in range(1,len(fc)-1):
            a,b,c=[points[i] for i in (fc[0],fc[k],fc[k+1])]
            d=(b[2]-c[2])*(a[1]-c[1])+(c[1]-b[1])*(a[2]-c[2])
            if abs(d)<1e-12: continue
            u=((b[2]-c[2])*(s-c[1])+(c[1]-b[1])*(z-c[2]))/d
            v=((c[2]-a[2])*(s-c[1])+(a[1]-c[1])*(z-c[2]))/d
            w=1-u-v
            if min(u,v,w)>=-1e-6: hits.append(u*a[0]+v*b[0]+w*c[0])
    return max(hits) if hits else None


def flank_armor():
    """Two layered armor plates, with front AND back fitted to skin.

    The old plates used flat backs across a bent flank. These plates sample
    the support at every vertex and have triangulated underside topology.
    Their support gaskets close the reveal; peaks do not share smoothing
    normals across the large armor facets.
    """
    from .body import FLANK_FRONT, _floor
    base=_floor(FLANK_FRONT)
    base_faces=[[0,1,4],[0,4,3],[1,2,5],[1,5,4],[3,4,7],[3,7,6],
                [4,5,8],[4,8,7]]
    supports=[(base,base_faces)]
    out=[]
    specs=[
        ([(1.40,.846),(1.91,.898),(2.28,.897),(2.22,.631),(1.94,.585),(1.40,.599)],
         (1.94,.737),.042,'armor'),
        ([(1.43,.537),(1.97,.550),(2.27,.578),(2.27,.219),(1.97,.207),(1.43,.258)],
         (1.98,.405),.033,'graphite')]

    def seat(s,z):
        values=[sample_skin(p,f,s,z) for p,f in supports]
        return max(v for v in values if v is not None)

    for outline,center,rise,slot in specs:
        n=len(outline)
        samples=outline+[center]
        front=[(seat(s,z)+.028+(rise if i==n else 0),s,z) for i,(s,z) in enumerate(samples)]
        back=[(seat(s,z)+.004,s,z) for s,z in samples]
        triangles=[[i,(i+1)%n,n] for i in range(n)]
        faces=triangles+[[n+1+i for i in reversed(f)] for f in triangles]
        faces += [[i,n+1+i,n+1+(i+1)%n,(i+1)%n] for i in range(n)]
        out.append((([P(*p) for p in front+back],faces),slot))
        # Thin black edge seal fills the visible seating line continuously.
        gasket_top=[(seat(s,z)+.009,s,z) for s,z in samples]
        gasket_base=[(seat(s,z)-.004,s,z) for s,z in samples]
        out.append((([P(*p) for p in gasket_top+gasket_base],faces),'armorDark'))
        supports.append((front,triangles))
    # Small seated fasteners, with dark counterbore collars.
    for s,z in ((1.46,.622),(2.19,.654)):
        x=seat(s,z)
        out.append((rkit.cylinder((x+.001,D.f(s),z),.012,.009,'x',16),'armorDark'))
        out.append((rkit.cylinder((x+.006,D.f(s),z),.007,.006,'x',6),'darkSteel'))
    return out


def detail(parts):
    def attach(name, mesh_slots, sided=True):
        for suffix,sg in ([('.L',1),('.R',-1)] if sided else [('',1)]):
            o=parts[name+suffix]
            # Panels are open skins with Solidify; the new details are CLOSED
            # solids. Bake the skin's thickness before appending the solids,
            # otherwise Solidify makes a second inside-out copy of every
            # armor plate, producing doubled rims and pinched bevel corners.
            skin=any(m.type=='SOLIDIFY' for m in o.modifiers)
            if skin:
                for m in list(o.modifiers):
                    if m.type in ('BEVEL','WEIGHTED_NORMAL'):
                        o.modifiers.remove(m)
                kit.apply_modifiers(o)
            b=kit.Builder()
            for mesh,slot in mesh_slots:
                b.add_mesh(mesh if sg>0 else kit.mirror_x(mesh),slot)
            kit.append_builder(o,b)
            if skin:
                kit.finish(o,.002,2,30)

    attach('flankF',flank_armor())
    for side in ('L','R'):
        parts['flankF.'+side].data.shade_flat()
    attach('hip',[
        (folded([(1.258,3.095,.978),(1.277,3.36,.971),(1.36,3.37,.767),
                  (1.386,2.82,.635),(1.302,2.48,.269)],
                 (1.397,2.91,.759)),'graphite')])

    # Canopy side sills and door release: low ribs seated in the shelf's skin.
    from .body import shelf_z
    sill=[]
    for st in (1.98,2.10,2.22):
        z0,z1=shelf_z(1.07,st),shelf_z(1.07,st+.06)
        sill.append((rkit.plate_x([(D.f(st),z0-.012),(D.f(st+.06),z1-.012),
                                   (D.f(st+.055),z1+.007),(D.f(st),z0+.007)],
                                  1.045,1.095,.002),'armorDark'))
    attach('shelfF',sill)

    # Retaining bolts only at corners and real plate junctions.
    for name, points in {
        'hip':[(1.284,3.30,.94),(1.365,2.82,.65)],
        'armCone':[],
    }.items():
        if points:
            attach(name,[(rkit.cylinder((x,D.f(st),z),.009,.009,'x',6),'darkSteel')
                         for x,st,z in points])

    # Spoiler frames use diagonal braces and clevis pins instead of lone posts.
    braces=[]
    for x in (.48,1.06):
        for a,b in (((3.68,1.275),(4.26,1.526)),((4.22,1.18),(3.97,1.48))):
            braces.append((kit.bar(V(x,D.f(a[0]),a[1]),V(x,D.f(b[0]),b[1]),
                                   kit.chamfer_rect(.024,.034,.005)),'chassis'))
        for st,z in ((4.26,1.526),(3.97,1.48)):
            braces.append((rkit.cylinder((x,D.f(st),z),.022,.049,'x',12),'darkSteel'))
            braces.append((rkit.cylinder((x+.028,D.f(st),z),.009,.009,'x',6),'bronze'))
    attach('flaps',braces)

    # A split raised spine breaks up the roof without changing its envelope.
    roof=[]
    for s in (-1,1):
        roof.append((folded([(s*.035,2.13,1.39),(s*.19,2.44,1.416),
                             (s*.14,2.77,1.407),(s*.035,2.91,1.394)],
                            (s*.076,2.46,1.445),.016,(0,0,1)),'armor'))
    attach('roof',roof,False)
