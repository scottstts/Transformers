"""Car assembly: the measured shell and canopy cut into panels on their carriers,
plus the fascia, tail, propulsion pack, active wing, wheels and lift jets.

Carriers (`bone.asm.*` empties) hold each panel at its car pose; the
transformation moves carriers only.
"""
import math
import bpy
from mathutils import Vector, Matrix
from . import kit as K, body as B, panels as P, wheels, rear, front, side, interior, doors

# measured seams (side frame, y z)
S1A = ((0, -0.7434, 0.316), (0, -0.833, 0.7505))    # fender | door shut line, below the marker (ridge fit)
S1B = ((0, -0.834, 0.7505), (0, -0.708, 0.867))     # fender rear edge up to the A-pillar foot (ridge fit)
S2 = ((0, 0.268, 0.341), (0, 0.543, 1.170))         # door rear shut line (ridge fit, z 0.36-0.84)
ROCKER = ((0, -0.7434, 0.316), (0, 0.268, 0.341))   # door bottom = black rocker band top
P3 = ((0, 1.893, 0.903), (0, 2.006, 0.697))         # wing end plate seam
POD_TOP = ((0, 1.848, 0.606), (0, 2.135, 0.707))   # black pod / end plate boundary (side frame)
A_PILLAR = ((0.775, -1.270, 0), (0.567, -0.342, 0))  # windshield edge in plan
ROOF_Y0, ROOF_Y1 = -0.342, 0.551
# frame seams across the side glass (side frame): the two edges of the narrow strip
# behind the A-pillar, and the front edge of the strip ahead of the door shut line
GLASS_SEAMS = (((-0.518, 0.885), (-0.237, 1.150)), ((0.307, 0.924), (0.453, 1.132)))
# the windshield's side edge (side frame, shadow-boosted 6x crop): a straight line
# from the A-pillar foot to the roof seam
SCREEN_EDGE = ((0, -0.582, 0.868), (0, -0.324, 1.146))
HOOD_Y = -1.70                                       # frunk lid front seam (top view)
WING_Y0, WING_Z0 = 1.825, 0.888     # the lid spans the deck to |x| 0.854 (top view)


def mid_planes():
    return [P.plane(*S1A, keep=(0, 0, 0.5)), P.plane(*S1B, keep=(0, 0, 0.8)), P.plane(*S2, keep=(0, 0, 0.6))]


def x_plane(x0, keep_out):
    """Vertical plane x = x0; keep |x| side: keep_out=True keeps x beyond x0 (sign of x0)."""
    s = 1 if x0 > 0 else -1
    n = Vector((-s, 0, 0)) if keep_out else Vector((s, 0, 0))
    return Vector((x0, 0, 0)), n


def axis_plane(axis, value, keep_greater):
    n = Vector((0, 0, 0))
    n[axis] = -1 if keep_greater else 1
    co = Vector((0, 0, 0))
    co[axis] = value
    return co, n


def pillar_plane(sx, keep_out):
    (x0, y0, _), (x1, y1, _) = A_PILLAR
    p, q = Vector((sx * x0, y0, 0)), Vector((sx * x1, y1, 0))
    keep = Vector((sx * 2.0, -0.8, 0)) if keep_out else Vector((0, -0.8, 0))
    return P.plane(p, q, along=(0, 0, 1), keep=keep)


def hood_edge(sx):
    """Vertical plane on the hood / fender-facet crease (plan), keeping the hood side."""
    a, b = B.sta(-1.70), B.sta(-1.505)
    p, q = Vector((sx * a['x4'], -1.70, 0)), Vector((sx * b['x4'], -1.505, 0))
    return P.plane(p, q, along=(0, 0, 1), keep=(0, -1.6, 0))


def glass_seam(sx, bot, top, half=0.001):
    """Thin slab region across the side glass along a measured seam line."""
    p, q = Vector((0, bot[0], bot[1])), Vector((0, top[0], top[1]))
    n = (q - p).cross(Vector((1, 0, 0))).normalized()
    return [(p + n * half, n), (p - n * half, -n), x_plane(sx * 0.45, True), axis_plane(2, 1.16, False)]


def roof_edge(sx, outboard=False):
    """The roof centre strip's edge (top view): |x| 0.160 at the windshield seam,
    0.095 at the rear glass seam."""
    p, q = Vector((sx * 0.160, ROOF_Y0, 0)), Vector((sx * 0.095, ROOF_Y1, 0))
    keep = Vector((sx * 2.0, 0, 0)) if outboard else Vector((0, 0, 0))
    return P.plane(p, q, along=(0, 0, 1), keep=keep)


def carrier(name, at):
    n = K.node('asm.' + name, size=0.25)
    n.location = Vector(at)
    return n


def adopt(obj, node, name, bevel=0.004, smooth_angle=24, nsrc=None):
    """Move a world-space solid onto its carrier and give it its finish."""
    obj.name = 'car.' + name
    obj.data.name = 'car.' + name
    obj.data.transform(node.matrix_basis.inverted() @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.parent = node
    obj.matrix_parent_inverse = Matrix.Identity(4)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    bpy.data.collections['01_CAR'].objects.link(obj)
    set_smooth(obj, smooth_angle)
    if nsrc is not None:
        # carry the uncut loft's normals onto the cut panel: boolean cuts leave
        # long thin triangles whose interpolated normals read as patches
        # only on the lofted surface itself, not on cut walls or caps
        from mathutils.bvhtree import BVHTree
        bvh = BVHTree.FromPolygons([nsrc.matrix_world @ v.co for v in nsrc.data.vertices],
                                   [list(p.vertices) for p in nsrc.data.polygons])
        mw = obj.matrix_world
        on = [v.index for v in obj.data.vertices
              if bvh.find_nearest(mw @ v.co)[3] is not None
              and bvh.find_nearest(mw @ v.co)[3] < 0.0006]
        vg = obj.vertex_groups.new(name='on_surface')
        vg.add(on, 1.0, 'REPLACE')
        dt = obj.modifiers.new('surface normals', 'DATA_TRANSFER')
        dt.object = nsrc
        dt.vertex_group = 'on_surface'
        dt.use_loop_data = True
        dt.data_types_loops = {'CUSTOM_NORMAL'}
        K.enum_set(dt, 'loop_mapping', 'POLYINTERP_NEAREST')
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=dt.name)
    if bevel:
        mod = obj.modifiers.new('edge fillets', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        K.enum_set(mod, 'limit_method', 'ANGLE')
        mod.angle_limit = math.radians(smooth_angle)
        mod.harden_normals = nsrc is None
        if nsrc is None:
            wn = obj.modifiers.new('normals', 'WEIGHTED_NORMAL')
            wn.keep_sharp = True
    K.PARTS.append(obj)
    return obj


def set_smooth(obj, smooth_angle=24):
    """Smooth shading with sharp edges on the loft's feature lines."""
    me = obj.data
    for p in me.polygons:
        p.use_smooth = True
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    band = bm.faces.layers.int.get('band')
    soft = set(obj.get('soft_points', ()))
    for e in bm.edges:
        if not e.is_manifold:
            e.smooth = False
            continue
        a = b = 0
        if band is not None:
            a, b = e.link_faces[0][band], e.link_faces[1][band]
        if a and b:
            # lofted surface: transverse edges smooth, feature creases sharp
            if a == b:
                e.smooth = True
            else:
                lo, hi = min(a, b), max(a, b)
                k = 0 if hi - lo > 1 else lo
                e.smooth = k in soft
        else:
            e.smooth = e.calc_face_angle(0) <= math.radians(smooth_angle)
    bm.to_mesh(me)
    bm.free()
    return obj


def arch_outline(prof, yc, zc):
    """(y, z) loop of a measured wheel opening, closed well below the hub."""
    fine = []
    for (a0, r0), (a1, r1) in zip(prof, prof[1:]):
        for k in range(4):
            t = k / 4
            a, r = math.radians(a0 + (a1 - a0) * t), r0 + (r1 - r0) * t
            fine.append((yc - r * math.cos(a), zc + r * math.sin(a)))
    a, r = math.radians(prof[-1][0]), prof[-1][1]
    fine.append((yc - r * math.cos(a), zc + r * math.sin(a)))
    return fine + [(fine[-1][0], zc - 0.6), (fine[0][0], zc - 0.6)]


def arches(obj):
    for name, (x, y, z, w) in B.WHEELS.items():
        sx = 1 if x > 0 else -1
        loop = arch_outline(B.ARCH_FRONT if name.startswith('wheelF') else B.ARCH_REAR, y, z)
        c = K.Mesh().loft([[Vector((sx * 0.45, yy, zz)) for yy, zz in loop],
                           [Vector((sx * 1.30, yy, zz)) for yy, zz in loop]], 'satin')
        co = c.build('cutter', '90_REVIEW_STAGE', bevel=0)
        K.PARTS.remove(co)
        P._boolean(obj, co, 'DIFFERENCE')
        bpy.data.objects.remove(co, do_unlink=True)
        # wheel well: the tyre sits in a cavity behind a thin fender skin
        # each slice ends 22 mm inside the body side at that station, so the
        # cavity never breaks through the skin where the body narrows
        rings = []
        R0 = 0.430
        for k in range(41):
            yy = y - R0 + 2 * R0 * k / 40
            hz = math.sqrt(max(1e-6, R0 * R0 - (yy - y) ** 2))
            st = B.sta(yy)
            xe = min(st['x1'], st['x2'], st['x3']) - 0.022
            rings.append([Vector((sx * xx, yy, zz)) for xx, zz in ((0.40, z - hz), (xe, z - hz), (xe, z + hz), (0.40, z + hz))])
        well = K.Mesh().loft(rings, 'satin')
        co = well.build('cutter', '90_REVIEW_STAGE', bevel=0)
        K.PARTS.remove(co)
        P._boolean(obj, co, 'DIFFERENCE')
        bpy.data.objects.remove(co, do_unlink=True)


def raw(mesh, name):
    o = mesh.build(name, '90_REVIEW_STAGE', bevel=0, smooth_angle=24)
    K.PARTS.remove(o)
    return o


def body_panels():
    global NSRC
    NSRC = {'shell': raw(B.shell_mesh(), 'nsrc.shell'), 'front': raw(B.shell_mesh(flank=True), 'nsrc.front'),
            'canopy': raw(B.canopy_mesh(), 'nsrc.canopy')}
    shell = raw(B.shell_mesh(), 'src.shell')
    front_shell = raw(B.shell_mesh(flank=True), 'src.shell.front')
    arches(shell)
    arches(front_shell)
    slots = []
    for sx in (-1, 1):                # swan-neck slots in the deck, under the lid
        sl = K.Mesh()
        sl.hull([(sx * 0.41 + d, y, z) for d in (-0.007, 0.007) for y in (1.94, 2.13) for z in (0.70, 0.887)], 'satin')
        slots.append(sl)
    for m in rear.cutters() + front.cutters() + [interior.cutter()] + slots + side.cutter() + [B.canopy_seat_mesh()]:                                          # bar housing, diffuser mask
        co = raw(m, 'cutter')
        P._boolean(shell, co, 'DIFFERENCE')
        P._boolean(front_shell, co, 'DIFFERENCE')
        bpy.data.objects.remove(co, do_unlink=True)
    # the lower tail rakes forward under the end plates (side frame)
    # the side pods rake forward from z 0.70 (side frame); the centre keeps the
    # diffuser's own rake (rear.rake_y)
    for sx in (1, -1):
        rake = P.region([P.plane((0, 2.135, 0.70), (0, 2.033, 0.21), keep=(0, 3.0, 0.3)), axis_plane(2, 0.70, False),
                         x_plane(sx * 0.60, True)])
        P._boolean(shell, rake, 'DIFFERENCE')
        bpy.data.objects.remove(rake, do_unlink=True)
    rake = P.region([P.plane((0, 2.135, 0.70), (0, 2.033, 0.21), keep=(0, 3.0, 0.3)), axis_plane(2, 0.608, False)])
    P._boolean(shell, rake, 'DIFFERENCE')
    bpy.data.objects.remove(rake, do_unlink=True)
    canopy = raw(B.canopy_mesh(), 'src.canopy')
    shell['soft_points'] = [3, 5, 7]
    NSRC['shell']['soft_points'] = [3, 5, 7]
    NSRC['front']['soft_points'] = [5]
    NSRC['canopy']['soft_points'] = [1, 5, 9]
    for o in NSRC.values():
        set_smooth(o)
    front_shell['soft_points'] = [5]
    canopy['soft_points'] = [1, 5, 9]   # side glass bulge and roof crown

    mid = mid_planes()
    door_r = {sx: mid + [x_plane(sx * 0.70, True), P.plane(*ROCKER, keep=(0, 0, 1.0))] for sx in (1, -1)}
    rear_r = [P.plane(*S2, keep=(0, 2, 0.6))]
    # end plates are skins over the tail corners: a top strip of the deck and a
    # side skin 20 mm inside the corner's plan outline (top view 0.915 -> 0.815)
    plate_side = {sx: [P.plane(*P3, keep=(0, 2.3, 0.9)), P.plane(*POD_TOP, keep=(0, 2.0, 1.0)), axis_plane(2, WING_Z0, False),
                       P.plane((sx * 0.895, 1.84, 0), (sx * 0.795, 2.17, 0), along=(0, 0, 1), keep=(sx * 2.0, 2.0, 0))]
                  for sx in (1, -1)}
    wing_r = [axis_plane(1, WING_Y0, True), axis_plane(2, WING_Z0, True)]
    shield = [axis_plane(1, ROOF_Y0, False), P.plane(*SCREEN_EDGE, keep=(0, -1.5, 0.9))]
    door_glass = {sx: [roof_edge(sx, outboard=True), axis_plane(1, ROOF_Y1, False),
                       P.plane(*S2, keep=(0, 0, 0.6))] for sx in (1, -1)}
    roof_r = [roof_edge(1), roof_edge(-1), axis_plane(1, ROOF_Y0, True), axis_plane(1, ROOF_Y1, False)]

    out = {}
    hood_r = [axis_plane(1, HOOD_Y, True), axis_plane(1, -1.505, False), axis_plane(2, 0.60, True),
              hood_edge(1), hood_edge(-1)]
    out['hood'] = P.cut(front_shell, 'hood', keep=[hood_r])[0]
    # flap: under the marker notch; its top edge runs from the wheel opening to the
    # marker's front-top corner, then follows the marker's front and lower edges
    (ft, rt, rb, fb) = side.MARKER
    flap_r = {sx: [x_plane(sx * 0.87, True), axis_plane(1, -1.20, True), P.plane(*S1A, keep=(0, -2, 0.5)),
                   axis_plane(2, side.FLAP_BOTTOM, True),
                   P.plane((0, -1.20, 0.720), (0, ft[0], ft[1]), keep=(0, -1.1, 0.5))] for sx in (1, -1)}
    notch = [P.plane((0, ft[0], ft[1]), (0, fb[0], fb[1]), keep=(0, -0.9, 0.7)),
             P.plane((0, fb[0], fb[1]), (0, rb[0], rb[1]), keep=(0, -0.9, 0.8))]
    for sx, s in ((1, 'L'), (-1, 'R')):
        out['flap.' + s] = P.cut(front_shell, 'flap.' + s, keep=[flap_r[sx]], remove=[notch])[0]
    # the nose keeps the notch: it loses the flap as two convex pieces, ahead of
    # the marker's front edge and under its lower edge
    b_front = P.plane((0, ft[0], ft[1]), (0, fb[0], fb[1]), keep=(0, -1.2, 0.7))
    b_back = P.plane((0, ft[0], ft[1]), (0, fb[0], fb[1]), keep=(0, -0.9, 0.7))
    c_below = P.plane((0, fb[0], fb[1]), (0, rb[0], rb[1]), keep=(0, -0.9, 0.5))
    flap_cut = [flap_r[sx] + extra for sx in (1, -1) for extra in ([b_front], [b_back, c_below])]
    out['nose'] = P.cut(front_shell, 'nose', remove=[mid[:2], hood_r] + flap_cut)[0]
    for sx, s in ((1, 'L'), (-1, 'R')):
        out['door.' + s] = P.cut(shell, 'door.' + s, keep=[door_r[sx]])[0]
        out['door.%s.glass' % s] = P.cut(canopy, 'door.%s.glass' % s, keep=[door_glass[sx]], 
                                          remove=[shield] + [glass_seam(sx, *g) for g in GLASS_SEAMS], cap='satin')[0]
        out['plate.' + s] = P.cut(shell, 'plate.' + s, keep=[plate_side[sx]], remove=[wing_r])[0]
    out['tub'] = P.cut(shell, 'tub', keep=[mid], remove=[door_r[1], door_r[-1]])[0]
    out['wing'] = P.cut(shell, 'wing', keep=[wing_r])[0]
    # black side pods behind the rear wheels (side frame): their top edge rises
    # rearward from (1.848, 0.606) to (2.135, 0.707)
    pod_r = {sx: [P.plane(*POD_TOP, keep=(0, 2.0, 0.3)), axis_plane(1, 1.70, True),
                  x_plane(sx * 0.60, True)] for sx in (1, -1)}
    for sx, s in ((1, 'L'), (-1, 'R')):
        pod = P.cut(shell, 'pod.' + s, keep=[pod_r[sx]], remove=[plate_side[sx]])[0]
        for i in range(len(pod.data.materials)):
            pod.data.materials[i] = K.MATERIALS['satin']
        out['pod.' + s] = pod
    out['tail'] = P.cut(shell, 'tail', keep=[rear_r], remove=[plate_side[1], plate_side[-1],
                                                             wing_r, pod_r[1], pod_r[-1]])[0]
    out['screen'] = P.cut(canopy, 'screen', keep=[shield], cap='glass')[0]
    out['roof'] = P.cut(canopy, 'roof', keep=[roof_r], cap='glass')[0]
    out['rearglass'] = P.cut(canopy, 'rearglass', remove=[shield, roof_r, door_glass[1], door_glass[-1]],
                             cap='glass')[0]
    for o in (shell, front_shell, canopy):
        bpy.data.objects.remove(o, do_unlink=True)
    return out


def centre(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return (lo + hi) / 2


# ---- details -------------------------------------------------------------

STRUT_X, STRUT_TOP, STRUT_BASE = 0.41, (2.07, 0.884), (1.95, 0.60)


def wing_struts(node, tail):
    """Wing struts (back.JPG x +-0.41): a blade 9 x 28 mm pinned under the lid
    that slides in a sleeve fixed in the tail; aero.deployed aims each blade from
    its lid pin at the sleeve, so the pair stays joined in every pose. The blade
    is as long as the deployed span, its lower part hidden in the sleeve."""
    from . import aero
    prof = [(0.0045 * math.cos(a), 0.014 * math.copysign(abs(math.sin(a)) ** 0.6, math.sin(a)))
            for a in [k * math.tau / 16 for k in range(16)]]
    sleeve = K.Mesh()
    for sx in (-1, 1):
        top = Vector((sx * STRUT_X, *STRUT_TOP))
        base = Vector((sx * STRUT_X, *STRUT_BASE))
        deployed_top = aero.wing_motion(1.0) @ top
        length = (deployed_top - base).length + 0.04
        n = K.node('asm.wing.strut.' + ('L' if sx > 0 else 'R'), size=0.06)
        n.location = top
        m = K.Mesh()
        d = (base - top).normalized()
        m.sweep([top + d * 0.004, top + d * length], prof, 'carbon', normal=lambda i, p, t: (1, 0, 0))
        m.build('car.wing.strut.' + ('L' if sx > 0 else 'R'), '01_CAR', parent=n, rest=n.matrix_basis.copy(), bevel=0.0)
        # sleeve: a dark tube round the blade's lower end, fixed in the tail
        sd = (base - deployed_top).normalized()
        sleeve.sweep([base - sd * 0.10, base + sd * 0.08],
                     [(a * 1.6 + math.copysign(0.002, a), b * 1.25) for a, b in prof], 'graphite',
                     normal=lambda i, p, t: (1, 0, 0))
    sleeve.build('car.tail.strut.sleeves', '01_CAR', parent=tail, rest=tail.matrix_basis.copy(), bevel=0.0)


JETS = (('jet.FL', 0.70, -0.95, 0.36), ('jet.FR', -0.70, -0.95, 0.36),
        ('jet.RL', 0.70, 1.98, 0.58), ('jet.RR', -0.70, 1.98, 0.58))


def jets():
    """Lift jets (door-open and propeller photos): behind each front wheel and
    under each rear pod. A gunmetal sleeve fixed in the body and a telescoping
    chrome stage with a bell nozzle (`asm.jet.*.stage`), both stowed flush
    with the underside in car mode (z = top of the sleeve)."""
    for name, x, y, z in JETS:
        node = K.node('asm.' + name, size=0.15)
        node.location = (x, y, z)
        c = Vector((x, y, z))
        m = K.Mesh()
        m.lathe([(0.0, 0.0), (0.0, 0.058), (-0.012, 0.062), (-0.10, 0.062), (-0.11, 0.056), (-0.11, 0.047),
                 (-0.002, 0.047), (-0.002, 0.0)], 'gunmetal', c, (0, 0, 1), 40)
        for k in range(6):   # ribs round the sleeve
            zz = -0.02 - k * 0.014
            m.lathe([(zz, 0.0615), (zz, 0.066), (zz - 0.006, 0.066), (zz - 0.006, 0.0615)], 'graphite', c, (0, 0, 1), 40)
        m.build('car.' + name, '01_CAR', parent=node, rest=node.matrix_basis.copy(), bevel=0.0008)
        st = K.node('asm.' + name + '.stage', size=0.1)
        st.location = (x, y, z)
        s = K.Mesh()
        s.lathe([(-0.004, 0.0), (-0.004, 0.044), (-0.150, 0.044), (-0.158, 0.050), (-0.196, 0.058), (-0.200, 0.055),
                 (-0.163, 0.040), (-0.163, 0.0)], 'chrome', c, (0, 0, 1), 40)
        s.lathe([(-0.150, 0.0), (-0.150, 0.038), (-0.198, 0.050), (-0.198, 0.0)], 'graphite', c, (0, 0, 1), 32)
        s.build('car.' + name + '.stage', '01_CAR', parent=st, rest=st.matrix_basis.copy(), bevel=0.0008)


NSRC = {}
FRONT_PANELS = ('nose', 'hood', 'flap.L', 'flap.R')


def build():
    bpy.context.view_layer.update()
    parts = body_panels()
    nodes = {}
    for name, obj in parts.items():
        host = name.split('.glass')[0].replace('.side', '')
        if name in ('screen',):
            host = 'nose'
        if name == 'rearglass':
            host = 'tail'
        if host not in nodes:
            src = parts[host] if host in parts else obj
            nodes[host] = carrier(host, centre(src))
    for name, obj in parts.items():
        host = 'nose' if name == 'screen' else 'tail' if name == 'rearglass' else name.split('.glass')[0].replace('.side', '')
        glass = name in ('screen', 'rearglass', 'roof') or name.endswith('.glass')
        src = NSRC['canopy'] if glass else NSRC['front'] if name in FRONT_PANELS else NSRC['shell']
        adopt(obj, nodes[host], name, bevel=0.0008 if glass else 0.0015, nsrc=src)
    for o in NSRC.values():
        bpy.data.objects.remove(o, do_unlink=True)
    front.build(nodes['nose'])
    side.build(nodes['nose'])
    side.build_rear(nodes['tail'])
    interior.build(nodes['tub'])
    doors.build(nodes)
    rear.build(nodes['tail'])
    wing_struts(nodes['wing'], nodes['tail'])
    wheels.build()
    jets()
    return nodes
