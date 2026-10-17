"""Mesh writer, materials and rig empties. Metres, +X left, -Y forward, +Z up."""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler, Quaternion

TAG = 'roadster_build'
MATERIALS = {}
NODES = {}
PARTS = []
COLLS = ('01_CAR', '02_ROBOT', '03_RIG', '90_REVIEW_STAGE')


def enum_set(owner, prop, value):
    valid = {i.identifier for i in owner.bl_rna.properties[prop].enum_items}
    if value not in valid:
        raise ValueError((prop, value, sorted(valid)))
    setattr(owner, prop, value)


def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def reset():
    for o in list(bpy.data.objects):
        if o.get(TAG):
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
    NODES.clear()
    PARTS.clear()
    root = collection('ROADSTER')
    for name in COLLS:
        collection(name, root)


def material(name, color, metal=0.0, rough=0.3, coat=0.0, emission=0.0, transmit=0.0, alpha=1.0,
             ior=1.5, spec_tint=(1.0, 1.0, 1.0), spec_level=0.5):
    m = bpy.data.materials.get('roadster.' + name) or bpy.data.materials.new('roadster.' + name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for socket, value in {'Base Color': (*color, 1), 'Metallic': metal, 'Roughness': rough,
                          'Coat Weight': coat, 'Coat Roughness': 0.06,
                          'Transmission Weight': transmit, 'Emission Color': (*color, 1),
                          'Emission Strength': emission, 'Alpha': alpha, 'IOR': ior,
                          'Specular Tint': (*spec_tint, 1), 'Specular IOR Level': spec_level}.items():
        p.inputs[socket].default_value = value
    m.diffuse_color = (*color, 1)
    MATERIALS[name] = m
    if transmit:
        m.use_raytrace_refraction = True
        m.thickness_mode = 'SLAB'   # the glazing is a thin shell, not a solid
    return m


def materials():
    # Pearl white paint: the car body and the robot's armour share it.
    material('paint', (0.78, 0.78, 0.76), 0.0, 0.22, 1.0)
    material('armour', (0.80, 0.80, 0.78), 0.0, 0.30, 0.8)
    material('satin', (0.020, 0.021, 0.024), 0.15, 0.45, 0.3)        # satin black body trim
    material('trim', (0.012, 0.012, 0.014), 0.0, 0.10, 1.0)          # gloss-black door window frame posts
    material('carbon', (0.012, 0.013, 0.015), 0.2, 0.32, 0.6)        # diffuser, splitter, wing
    material('graphite', (0.028, 0.029, 0.032), 0.85, 0.38)          # robot mechanics
    material('gunmetal', (0.10, 0.10, 0.11), 0.92, 0.30)
    material('bronze', (0.38, 0.20, 0.09), 0.95, 0.30)                # copper-bronze actuator accents
    material('chrome', (0.80, 0.80, 0.82), 1.0, 0.08)
    material('rubber', (0.010, 0.010, 0.011), 0.0, 0.80)
    # Bronze-tinted glazing: clear glass that tints what passes through it (the colour is the
    # tint per surface crossed) under a bronze solar-control film, which warms and raises its
    # reflection. No coat: glass is one optically flat interface, not a lacquered panel.
    material('glass', (0.30, 0.18, 0.09), 0.0, 0.02, transmit=1.0, ior=1.52,
             spec_tint=(1.0, 0.74, 0.48), spec_level=0.6)
    material('carpet', (0.012, 0.012, 0.013), 0.0, 0.9)
    material('leather', (0.018, 0.018, 0.019), 0.0, 0.55, 0.1)
    material('seatshell', (0.82, 0.82, 0.80), 0.0, 0.25, 0.8)
    material('interior', (0.022, 0.022, 0.024), 0.1, 0.45)
    material('ambient', (1.0, 0.012, 0.010), 0.0, 0.2)               # red ambient strips (unlit)
    material('alcantara', (0.16, 0.16, 0.165), 0.0, 0.95)
    material('seatwhite', (0.74, 0.74, 0.73), 0.0, 0.55)
    material('screen', (0.010, 0.014, 0.020), 0.0, 0.05, 0.6, emission=0.3)
    material('lightbar', (0.92, 0.95, 1.0), 0.0, 0.10, emission=6.0)
    material('lamp', (0.95, 0.97, 1.0), 0.0, 0.05, emission=3.0)
    material('tail', (0.85, 0.02, 0.01), 0.0, 0.15, emission=5.0)
    weave = material('weave', (0.018, 0.019, 0.021), 0.3, 0.30, 0.8)   # carbon weave: a fine twill checker
    nt = weave.node_tree
    ck = next((n for n in nt.nodes if n.type == 'TEX_CHECKER'), None)
    if ck is None:
        p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        ck = nt.nodes.new('ShaderNodeTexChecker')
        co = nt.nodes.new('ShaderNodeTexCoord')
        nt.links.new(co.outputs['Object'], ck.inputs['Vector'])
        nt.links.new(ck.outputs['Color'], p.inputs['Base Color'])
    ck.inputs['Scale'].default_value = 260.0
    ck.inputs['Color1'].default_value = (0.012, 0.012, 0.014, 1)
    ck.inputs['Color2'].default_value = (0.024, 0.025, 0.028, 1)
    material('caliper', (0.55, 0.56, 0.58), 0.9, 0.35)                  # satin silver calipers
    material('lamphouse', (0.62, 0.63, 0.65), 0.85, 0.22)               # satin silver lamp reflector (3/4 photo)
    material('lens', (0.88, 0.91, 0.96), 0.0, 0.12, 1.0, emission=3.5)   # lit headlamp lenses (front photo)
    material('marker', (0.07, 0.012, 0.008), 0.0, 0.05, 1.0)             # red-brown tinted marker lens
    material('smoke', (0.035, 0.035, 0.038), 0.0, 0.06, 1.0)            # smoked lamp lenses
    material('nozzle', (0.80, 0.62, 0.38), 1.0, 0.22)                   # bronze nozzle liners
    material('titanium', (0.20, 0.19, 0.175), 0.9, 0.40)                 # engine vanes and blades
    material('fanblade', (0.16, 0.14, 0.12), 0.8, 0.32)                 # satin fan blades
    material('amber', (0.95, 0.45, 0.05), 0.0, 0.15, emission=2.0)
    material('visor', (0.90, 0.95, 1.0), 0.0, 0.10, emission=8.0)
    material('plate', (0.80, 0.80, 0.80), 0.0, 0.50)
    material('wheel', (0.55, 0.56, 0.57), 0.6, 0.30, 0.5)             # light aero rim faces


def node(name, coll='03_RIG', size=0.08):
    o = bpy.data.objects.new('bone.' + name, None)
    bpy.data.collections[coll].objects.link(o)
    o[TAG] = True
    enum_set(o, 'empty_display_type', 'PLAIN_AXES')
    enum_set(o, 'rotation_mode', 'QUATERNION')
    o.empty_display_size = size
    NODES[name] = o
    return o


def rot(x=0, y=0, z=0):
    return Euler(tuple(math.radians(a) for a in (x, y, z))).to_quaternion()


def mat4(p=(0, 0, 0), q=None):
    return Matrix.LocRotScale(Vector(p), q or Quaternion(), Vector((1, 1, 1)))


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t, a=0.0, b=1.0):
    u = max(0.0, min(1.0, (t - a) / (b - a))) if b > a else (1.0 if t >= b else 0.0)
    return u * u * u * (10 + u * (-15 + 6 * u))


class Mesh:
    """Accumulates closed solids per material slot, then writes one object."""

    def __init__(self):
        self.v, self.f, self.mi, self.slots = [], [], [], []
        self.band = {}   # face index -> ring band (lofted feature surfaces)

    def add(self, verts, faces, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        off = len(self.v)
        self.v.extend(Vector(p) for p in verts)
        for face in faces:
            self.f.append(tuple(off + i for i in face))
            self.mi.append(self.slots.index(mat))
        return self

    def loft(self, rings, mat, cap=True, closed=True):
        n = len(rings[0])
        faces = []
        span = n if closed else n - 1
        for j in range(len(rings) - 1):
            for i in range(span):
                a, b = j * n + i, j * n + (i + 1) % n
                faces.append((a, b, b + n, a + n))
        if cap:
            last = (len(rings) - 1) * n
            faces.append(tuple(reversed(range(n))))
            faces.append(tuple(last + i for i in range(n)))
        return self.add([p for r in rings for p in r], faces, mat)

    def hull(self, points, mat, M=None):
        """Faceted convex solid: the concept's low-poly armour language."""
        bm = bmesh.new()
        for p in points:
            bm.verts.new(M @ Vector(p) if M else Vector(p))
        res = bmesh.ops.convex_hull(bm, input=bm.verts)
        drop = list({g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)})
        if drop:
            bmesh.ops.delete(bm, geom=drop, context='VERTS')
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts, edges=bm.edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.verts.index_update()
        self.add([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces], mat)
        bm.free()
        return self

    def box(self, c, size, mat, q=None):
        sx, sy, sz = (a / 2 for a in size)
        pts = [Vector((x * sx, y * sy, z * sz)) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
        if q:
            pts = [q @ p for p in pts]
        return self.hull([Vector(c) + p for p in pts], mat)

    def cyl(self, a, b, r, mat, sides=24, rb=None):
        a, b = Vector(a), Vector(b)
        ax = (b - a).normalized()
        u = ax.orthogonal().normalized()
        w = ax.cross(u)
        rings = [[p + rr * (u * math.cos(i * math.tau / sides) + w * math.sin(i * math.tau / sides))
                  for i in range(sides)] for p, rr in ((a, r), (b, r if rb is None else rb))]
        return self.loft(rings, mat)

    def lathe(self, profile, mat, center, axis=(1, 0, 0), sides=48, ring=False):
        """profile: [(along, radius)]. Open profiles are closed at both ends by
        caps (end points on the axis close to a point); ring=True treats the
        profile as a closed loop: a hollow turned part (tube, annulus)."""
        c, ax = Vector(center), Vector(axis).normalized()
        u = ax.orthogonal().normalized()
        w = ax.cross(u)
        rings = [[c + ax * s + r * (u * math.cos(i * math.tau / sides) + w * math.sin(i * math.tau / sides))
                  for i in range(sides)] for s, r in profile]
        if ring:
            rings.append(rings[0])
            return self.loft(rings, mat, cap=False)
        return self.loft(rings, mat)

    def tube(self, path, r, mat, sides=10):
        path = [Vector(p) for p in path]
        rings = []
        prev_u = None
        for i, p in enumerate(path):
            t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
            u = t.orthogonal().normalized() if prev_u is None else (prev_u - t * prev_u.dot(t)).normalized()
            prev_u = u
            w = t.cross(u)
            rings.append([p + r * (u * math.cos(j * math.tau / sides) + w * math.sin(j * math.tau / sides))
                          for j in range(sides)])
        return self.loft(rings, mat)

    def sweep(self, path, profile, mat, closed=False, normal=None, scale=None, cap=True):
        """Sweep a closed 2D profile [(n, b)] along a 3D path. `normal(i, p, t)`
        returns the in-section direction for profile axis n at path point i (the
        b axis is t x n); default: a parallel-transported frame. `scale(i)`
        scales the profile per point. A closed path wraps without caps."""
        path = [Vector(p) for p in path]
        cnt = len(path)
        rings = []
        prev = None
        for i, p in enumerate(path):
            if closed:
                t = (path[(i + 1) % cnt] - path[(i - 1) % cnt]).normalized()
            else:
                t = (path[min(i + 1, cnt - 1)] - path[max(i - 1, 0)]).normalized()
            if normal is not None:
                nv = Vector(normal(i, p, t))
                nv = (nv - t * nv.dot(t)).normalized()
            elif prev is None:
                nv = t.orthogonal().normalized()
            else:
                nv = (prev - t * prev.dot(t)).normalized()
            prev = nv
            bv = t.cross(nv)
            k = scale(i) if scale else 1.0
            rings.append([p + nv * (a * k) + bv * (b * k) for a, b in profile])
        if closed:
            rings.append(rings[0])
            cap = False
        return self.loft(rings, mat, cap=cap)

    def mirrored(self):
        """Append the X mirror of everything so far (faces reversed)."""
        n = len(self.v)
        self.v.extend(Vector((-p.x, p.y, p.z)) for p in list(self.v))
        for f, m in list(zip(self.f, self.mi)):
            self.f.append(tuple(i + n for i in reversed(f)))
            self.mi.append(m)
        return self

    def build(self, name, coll, parent=None, rest=None, bevel=0.004, smooth_angle=32):
        """Write the object. Vertices are authored in world space at the parent's
        `rest` world matrix and stored in its local frame."""
        inv = rest.inverted() if rest is not None else Matrix.Identity(4)
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(inv @ p) for p in self.v], [], self.f)
        me.validate(clean_customdata=False)
        for s in self.slots:
            me.materials.append(MATERIALS[s])
        for p, i in zip(me.polygons, self.mi):
            p.material_index = i
        if self.band:
            att = me.attributes.new('band', 'INT', 'FACE')
            for fi, b in self.band.items():
                att.data[fi].value = b
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-7)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            if not e.is_manifold or e.calc_face_angle(0) > math.radians(smooth_angle):
                e.smooth = False
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.data.collections[coll].objects.link(o)
        o[TAG] = True
        if parent is not None:
            o.parent = NODES[parent] if isinstance(parent, str) else parent
            o.matrix_parent_inverse = Matrix.Identity(4)
        if bevel:
            mod = o.modifiers.new('edge fillets', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            enum_set(mod, 'limit_method', 'ANGLE')
            mod.angle_limit = math.radians(smooth_angle)
            mod.harden_normals = True
            wn = o.modifiers.new('normals', 'WEIGHTED_NORMAL')
            wn.keep_sharp = True
        PARTS.append(o)
        return o
