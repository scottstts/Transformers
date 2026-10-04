"""Small semantic mesh writer; metres, +X left, -Y forward, +Z up."""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

MATERIALS = {}
NODES = {}
PARTS = []
ROOT = None


def enum_set(owner, prop, value):
    valid = {i.identifier for i in owner.bl_rna.properties[prop].enum_items}
    if value in valid:
        setattr(owner, prop, value)
    else:
        raise ValueError((prop, value, sorted(valid)))


def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def reset():
    global ROOT
    # Only this build's objects are owned here; retain any user additions.
    for o in list(bpy.data.objects):
        if o.get('impala_build'):
            bpy.data.objects.remove(o, do_unlink=True)
    NODES.clear()
    PARTS.clear()
    ROOT = collection('IMPALA')
    for name in ('01_SHARED_BODY', '02_MECHANICAL_CORE', '03_RIG', '04_LINKAGES', '90_REVIEW_STAGE'):
        collection(name, ROOT)


def material(name, color, metal=0, rough=0.3, coat=0, emission=0, transmit=0):
    m = bpy.data.materials.get('impala.' + name) or bpy.data.materials.new('impala.' + name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for socket, value in {'Base Color': (*color, 1), 'Metallic': metal, 'Roughness': rough,
                          'Coat Weight': coat, 'Coat Roughness': 0.17,
                          'Transmission Weight': transmit, 'Emission Color': (*color, 1),
                          'Emission Strength': emission}.items():
        p.inputs[socket].default_value = value
    m.diffuse_color = (*color, 1)
    MATERIALS[name] = m
    return m


def materials():
    material('paint', (0.002, 0.006, 0.014), 0.24, 0.12, 0.92)
    paint=next(n for n in MATERIALS['paint'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    paint.inputs['Coat Roughness'].default_value=.065
    material('chrome', (0.72, 0.76, 0.80), 1, 0.095)
    material('steel', (0.19, 0.24, 0.29), 0.88, 0.32)
    material('dark', (0.030, 0.041, 0.053), 0.82, 0.39)
    material('bronze', (0.26, 0.17, 0.070), 0.84, 0.3)
    material('rubber', (0.006, 0.007, 0.009), 0, 0.76)
    material('glass', (0.55, 0.70, 0.76), 0, 0.012, 0.1, transmit=1)
    material('armour_glass', (.010,.022,.030), .18, .13, .60, transmit=.05)
    material('lamp', (0.96, 0.98, 0.98), 0, 0.018, 0.05, transmit=1)
    material('bulb_glass', (.89,.94,.95), 0, .045, transmit=.98)
    material('clear', (0.63, 0.65, 0.62), 0.05, 0.25, 0.3)
    material('redline', (0.40, 0.016, 0.009), 0, 0.48)
    material('ivory', (0.62, 0.55, 0.40), 0.03, 0.47)
    material('red', (0.45, 0.014, 0.007), 0.22, 0.25, 0.45)
    material('red_lens', (0.65, 0.023, 0.003), 0, 0.17, 0.4, emission=.08, transmit=.22)
    material('clear_lens', (.80, .84, .82), 0, .12, .2, transmit=.35)
    material('amber', (0.70, 0.18, 0.013), 0.15, 0.24, 0.5)
    material('blue', (0.018, 0.30, 0.95), 0.20, 0.22, emission=3)
    material('enamel_blue', (0.008, 0.055, 0.22), 0.25, 0.25, 0.4)
    material('plate_ink', (0.006, 0.023, 0.12), 0, 0.40)
    material('tan', (0.33, 0.205, 0.073), 0, 0.57)
    material('leather', (0.006, 0.016, 0.025), 0, 0.62, 0.05)
    p=next(n for n in MATERIALS['leather'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Specular IOR Level'].default_value=.20
    material('plate', (0.72, 0.69, 0.51), 0.2, 0.4)
    material('floor', (0.16, 0.18, 0.21), 0.15, 0.63)
    for name in ('glass','lamp','bulb_glass'):
        MATERIALS[name].use_raytrace_refraction=True
        MATERIALS[name].use_transparent_shadow=False


def node(name):
    o = bpy.data.objects.new('bone.' + name, None)
    bpy.data.collections['03_RIG'].objects.link(o)
    o['impala_build'] = True
    enum_set(o, 'empty_display_type', 'PLAIN_AXES')
    enum_set(o, 'rotation_mode', 'QUATERNION')
    o.empty_display_size = 0.09
    NODES[name] = o
    return o


def rotation(x=0, y=0, z=0):
    return Euler(tuple(math.radians(a) for a in (x, y, z))).to_quaternion()


def transform(p=(0, 0, 0), q=None, scale=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(p), q or rotation(), Vector(scale))


class Mesh:
    def __init__(self):
        self.v, self.f, self.slots, self.mi, self.smooth = [], [], [], [], []
        self.face_fields=[]

    def add(self, vertices, faces, mat='paint', smooth=False):
        if mat not in self.slots:
            self.slots.append(mat)
        off = len(self.v)
        self.v.extend(Vector(v) for v in vertices)
        for face in faces:
            self.f.append(tuple(off + i for i in face))
            self.mi.append(self.slots.index(mat))
            self.smooth.append(smooth)
            self.face_fields.append(0)
        return self

    def loft(self, rings, mat='paint', cap=True, smooth=False):
        n = len(rings[0])
        faces = []
        for j in range(len(rings)-1):
            for i in range(n):
                faces.append((j*n+i, j*n+(i+1)%n, (j+1)*n+(i+1)%n, (j+1)*n+i))
        if cap:
            faces.extend([tuple(reversed(range(n))), tuple((len(rings)-1)*n+i for i in range(n))])
        return self.add([v for ring in rings for v in ring], faces, mat, smooth)

    def box(self, center, size, mat='dark', q=None):
        cx = Vector(center)
        sx, sy, sz = [a/2 for a in size]
        v = [Vector((x*sx, y*sy, z*sz)) for x,y,z in
             ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
        if q:
            v = [q @ a for a in v]
        return self.add([cx+a for a in v], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat)

    def prism(self, points, depth=(0, 0.04, 0), mat='paint'):
        a, d = [Vector(p) for p in points], Vector(depth)
        return self.loft([a, [v+d for v in a]], mat)

    def cyl(self, a, b, radius, mat='steel', sides=24, radius_b=None):
        a, b = Vector(a), Vector(b)
        axis = (b-a).normalized()
        u = axis.orthogonal().normalized()
        v = axis.cross(u)
        rings = []
        for p,r in ((a,radius),(b,radius if radius_b is None else radius_b)):
            rings.append([p+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)) for i in range(sides)])
        return self.loft(rings, mat, smooth=True)

    def tube(self, path, radius, mat='chrome', sides=10, close=False):
        path = [Vector(p) for p in path]
        if close:
            path.append(path[0])
        rings = []
        for i,p in enumerate(path):
            tangent = path[min(i+1,len(path)-1)]-path[max(i-1,0)]
            if tangent.length < 1e-8:
                tangent = Vector((0,0,1))
            tangent.normalize()
            u=tangent.orthogonal().normalized()
            v=tangent.cross(u)
            rings.append([p+radius*(u*math.cos(j*math.tau/sides)+v*math.sin(j*math.tau/sides)) for j in range(sides)])
        return self.loft(rings,mat,smooth=True)

    def revolve_x(self, profile, mat='chrome', sides=64, center=(0,0,0)):
        c=Vector(center)
        rings=[[c+Vector((x,r*math.cos(i*math.tau/sides),r*math.sin(i*math.tau/sides)))
                for i in range(sides)] for x,r in profile]
        return self.loft(rings,mat,cap=False,smooth=True)

    def grid_shell(self, rows, mat='paint', depth=(0,0,-0.025)):
        n,m=len(rows),len(rows[0])
        v=[Vector(p) for row in rows for p in row]
        d=Vector(depth)
        faces=[]
        for i in range(n-1):
            for j in range(m-1):
                f=(i*m+j,i*m+j+1,(i+1)*m+j+1,(i+1)*m+j)
                faces.extend([f,tuple(n*m+k for k in reversed(f))])
        boundary=list(range(m))+[i*m+m-1 for i in range(1,n)]+[(n-1)*m+j for j in range(m-2,-1,-1)]+[i*m for i in range(n-2,0,-1)]
        for a,b in zip(boundary,boundary[1:]+boundary[:1]):
            faces.append((a,b,b+n*m,a+n*m))
        return self.add(v+[p+d for p in v],faces,mat,smooth=True)

    def build(self,name,coll='02_MECHANICAL_CORE',parent=None,origin=(0,0,0),bevel=0.007):
        me=bpy.data.meshes.new(name)
        org=Vector(origin)
        me.from_pydata([tuple(v-org) for v in self.v],[],self.f)
        if any(self.face_fields):
            field=me.attributes.new(name='impala.surface.field',type='INT',domain='FACE')
            for item,value in zip(field.data,self.face_fields):item.value=value
        me.validate(clean_customdata=False)
        me.update()
        for slot in self.slots:
            me.materials.append(MATERIALS[slot])
        for p,idx,sm in zip(me.polygons,self.mi,self.smooth):
            p.material_index=idx
            p.use_smooth=sm
        bm=bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.000002)
        bad=[f for f in bm.faces if f.calc_area()<1e-12]
        if bad: bmesh.ops.delete(bm,geom=bad,context='FACES_ONLY')
        loose=[v for v in bm.verts if not v.link_faces]
        if loose: bmesh.ops.delete(bm,geom=loose,context='VERTS')
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        unseen=set(bm.faces)
        while unseen:
            stack=[unseen.pop()]
            component=[]
            while stack:
                f=stack.pop()
                component.append(f)
                for e in f.edges:
                    for adjacent in e.link_faces:
                        if adjacent in unseen:
                            unseen.remove(adjacent)
                            stack.append(adjacent)
            if all(e.is_manifold for f in component for e in f.edges):
                volume=0
                for f in component:
                    anchor=component[0].verts[0].co
                    p=[v.co-anchor for v in f.verts]
                    volume+=sum(p[0].dot(p[i].cross(p[i+1]))/6 for i in range(1,len(p)-1))
                if volume<0: bmesh.ops.reverse_faces(bm,faces=component)
        for e in bm.edges:
            if e.is_manifold and e.calc_face_angle()>math.radians(50): e.smooth=False
        bm.to_mesh(me)
        bm.free()
        o=bpy.data.objects.new(name,me)
        bpy.data.collections[coll].objects.link(o)
        o['impala_build']=True
        o['review_status']='REBUILD_REFERENCE_REVIEW'
        o['topology_contract']='closed solid or paired surface shell'
        if parent:
            o.parent=NODES[parent] if isinstance(parent,str) else parent
            o.matrix_parent_inverse=Matrix.Identity(4)
        if bevel: finish(o,bevel)
        PARTS.append(o)
        return o


def finish(obj,radius=.001,angle=45):
    mod=obj.modifiers.new('Manufactured edge fillets','BEVEL')
    mod.width=radius
    mod.segments=3
    enum_set(mod,'limit_method','ANGLE')
    mod.angle_limit=math.radians(angle)
    mod=obj.modifiers.new('Corner normals','WEIGHTED_NORMAL')
    mod.keep_sharp=True
    return obj


def finalize(parts=None):
    """Resolve modifier topology within each named part, preserving separate joins."""
    for obj in list(PARTS if parts is None else parts):
        if obj.type in ('FONT','CURVE'):
            bpy.context.view_layer.update()
            me=bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            if obj.get('letter_width') and me.vertices:
                lo=min(v.co.x for v in me.vertices)
                hi=max(v.co.x for v in me.vertices)
                center=(lo+hi)/2
                width=obj['letter_width']/(hi-lo)
                for vertex in me.vertices:vertex.co.x=(vertex.co.x-center)*width
                me.update()
            replacement=bpy.data.objects.new(obj.name+'.resolved',me)
            bpy.data.collections['01_SHARED_BODY'].objects.link(replacement)
            replacement.parent=obj.parent
            replacement.matrix_local=obj.matrix_local.copy()
            for key,value in obj.items(): replacement[key]=value
            name=obj.name
            PARTS[PARTS.index(obj)]=replacement
            bpy.data.objects.remove(obj,do_unlink=True)
            replacement.name=name
            obj=replacement
        if obj.type!='MESH': continue
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        for modifier in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
        bm=bmesh.new()
        bm.from_mesh(obj.data)
        # Boolean/bevel seams can differ by one float step in world space.
        # Turned hubcaps opt into a 0.5 micrometre tolerance at these seams.
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=obj.get('precision_weld_m',.00000001))
        wire=[e for e in bm.edges if not e.link_faces]
        if wire: bmesh.ops.delete(bm,geom=wire,context='EDGES')
        loose=[v for v in bm.verts if not v.link_faces]
        if loose: bmesh.ops.delete(bm,geom=loose,context='VERTS')
        if obj.name=='car.cowl.pressed.plenum':
            boundary=[e for e in bm.edges if e.is_boundary]
            # Restore the triangular inner-skin sliver at a native Boolean
            # cusp. The actual vents have complete, closed jamb walls.
            if len(boundary)==3 and max(e.calc_length() for e in boundary)<.01:
                bmesh.ops.holes_fill(bm,edges=boundary,sides=3)
        if obj.name in ('car.rear_fender.L','car.rear_fender.R'):
            # At the door/arch intersection CDT can form a sub-micrometre-wide
            # sliver. Its area removal leaves a three-edge cusp, not a hole in
            # the intended surface. Collapse ONLY that measured local cusp.
            boundary=[e for e in bm.edges if e.is_boundary]
            if len(boundary)==3 and max(e.calc_length() for e in boundary)<.000060:
                verts=list({v for e in boundary for v in e.verts})
                bmesh.ops.remove_doubles(bm,verts=verts,dist=.000060)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        unseen=set(bm.faces)
        while unseen:
            stack=[unseen.pop()]
            faces=[]
            while stack:
                f=stack.pop()
                faces.append(f)
                for edge in f.edges:
                    for neighbor in edge.link_faces:
                        if neighbor in unseen:
                            unseen.remove(neighbor)
                            stack.append(neighbor)
            if all(e.is_manifold for f in faces for e in f.edges):
                volume=0
                for f in faces:
                    anchor=faces[0].verts[0].co
                    p=[v.co-anchor for v in f.verts]
                    volume+=sum(p[0].dot(p[i].cross(p[i+1]))/6 for i in range(1,len(p)-1))
                if volume<0: bmesh.ops.reverse_faces(bm,faces=faces)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    bpy.context.view_layer.update()


def chamfer(w,d,c=0.04):
    x,y=w/2,d/2
    c=min(c,x*0.6,y*0.6)
    return [(-x+c,-y),(x-c,-y),(x,-y+c),(x,y-c),(x-c,y),(-x+c,y),(-x,y-c),(-x,-y+c)]


def armor(mesh, stations, mat='paint'):
    # (z, width, depth, centre_x, centre_y); profiled shell, never a block primitive.
    rings=[]
    for z,w,d,cx,cy in stations:
        rings.append([(x+cx,y+cy,z) for x,y in chamfer(w,d)])
    mesh.loft(rings,mat)
    return mesh
