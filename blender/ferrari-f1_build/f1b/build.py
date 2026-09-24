"""Build orchestration (run inside Blender via run.py)."""
import time
import bpy
from . import kit, scene, car

STATE = bpy.app.driver_namespace.setdefault("f1_state", {})  # survives module reloads


def car_only():
    t = time.time()
    scene.setup_stage()
    root = kit.collection('FERRARI')
    c = kit.collection('CAR', root)
    kit.clear_collection(c)
    kit.purge_orphans()
    parts = car.build(c)
    print('car parts:', len(parts), 'in %.1fs' % (time.time() - t))
    return parts


def stats(coll_name):
    dg = bpy.context.evaluated_depsgraph_get()
    tris = n = 0
    for o in bpy.data.collections[coll_name].all_objects:
        if o.type != 'MESH' or o.hide_render:
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        ev.to_mesh_clear()
        n += 1
    return n, tris


def robot_structure(coll):
    """bone -> [structure objects], authored bone-local (unparented here)."""
    from . import robot_legs, robot_torso, robot_arms, robot_head, robot_blockout, robot_armor
    struct = {}
    for mod in (robot_legs, robot_torso, robot_arms, robot_head, robot_armor):
        for bone, objs in mod.build(coll).items():
            struct.setdefault(bone, []).extend(objs)
    for bone, objs in robot_blockout.build(coll, skip=set(struct)).items():
        struct[bone] = objs
    return struct


def pose_structure(struct, W):
    for bone, objs in struct.items():
        for o in objs:
            o.parent = None
            o.matrix_world = W[bone]


def full():
    """Car + robot structure + linkage, car assemblies riding their hosts."""
    from . import assemble, linkage
    car_only()
    root = kit.collection('FERRARI')
    rc = kit.collection('ROBOT', root)
    kit.clear_collection(rc)
    rg = bpy.data.collections.get('RIG')
    if rg:
        kit.clear_collection(rg)
    sc = assemble.Scene(root)
    sc.attach_structure(robot_structure(rc))
    sc.attach_linkage(linkage.build(rc))
    sc.attach_car()
    from . import carrier, choreo
    sc.carriers = carrier.expand(choreo.carriers())
    carrier.size_all(sc, sc.carriers)
    cc = kit.collection('CARRIER', rc)
    for s in sc.carriers:
        s.build(cc)
    STATE['scene'] = sc
    return sc


def show_T(T):
    from . import bake
    return bake.apply(STATE['scene'], T)


def robot_views(tag, T=1.0, views=None):
    show_T(T)
    V = {'front': ((0.0, -8.6, 2.1), (0, 0.7, 1.85), 42), '3q': ((5.4, -6.6, 2.7), (0, 0.7, 1.85), 42),
         'side': ((8.8, 0.7, 2.0), (0, 0.7, 1.85), 42), 'back': ((-4.8, 8.0, 2.5), (0, 0.7, 1.85), 42),
         'back3q': ((5.0, 7.4, 2.8), (0, 0.7, 1.85), 42)}
    return [scene.render('%s_%s' % (tag, k), *V[k], res=(900, 1000)) for k in (views or V)]


def isolate(assemblies=None, structure=True):
    """Render only the named assemblies' car parts (None: all), with or without the robot structure."""
    sc = STATE['scene']
    keep = None
    if assemblies is not None:
        keep = set()
        for n, a in sc.asm.items():
            base = n[:-2] if n[-2:] in ('.L', '.R') else n
            if base in assemblies or n in assemblies:
                keep.update(a.parts)
    for o in bpy.data.collections['CAR'].objects:
        o.hide_render = keep is not None and o.name not in keep
    for o in bpy.data.collections['ROBOT'].all_objects:
        if o.type == 'MESH':
            o.hide_render = not structure


CAR_ALLOW = []
# suspension members pass through the sleeve panels at their pickups (sealed boots on the real car)
ROBOT_ALLOW = [('suspR', 'shin'), ('suspR', 'floorShin'), ('suspF', 'tub'), ('suspF', 'floorTub'), ('suspF', 'nose'),
               # ball joints: wishbone ends seated in the upright's clevises
               ('suspF', 'cornerF'), ('suspR', 'cornerR'),
               # the rear pickups are brackets on the shin structure; the swan necks are seated in the heels
               ('suspR', 'R.shin'), ('rwing', 'R.foot')]


def audit_pose(label, T=None, islands=False, limit=60):
    from . import audit
    if T is not None:
        show_T(T)
    objs = [o for c in ('CAR', 'ROBOT') for o in bpy.data.collections[c].all_objects if o.type == 'MESH']
    ms = audit.gather(objs)
    out = {}
    if islands:
        out['islands'] = audit.island_report([m for m in ms if m.name.startswith('R.')])
    out['clash'] = sorted(audit.clash_report(ms, CAR_ALLOW + ROBOT_ALLOW, where=True), key=lambda r: -r[2])
    out['coplanar'] = audit.coplanar_report(ms)
    print('== %s: %s' % (label, ', '.join('%s %d' % (k, len(v)) for k, v in out.items())))
    for k, v in out.items():
        for r in v[:limit]:
            print('  ', k, r)
    return out


REVIEW_CAMS = {
    'seq': ((7.8, -6.8, 3.4), (0, -0.8, 1.2), 30),
    'front': ((0.0, -10.0, 2.3), (0, -1.1, 1.95), 38),
    '3q': ((6.0, -8.0, 3.1), (0, -1.1, 1.95), 38),
    'side': ((9.5, -1.1, 2.2), (0, -1.1, 1.95), 38),
    'back3q': ((-5.5, 6.0, 3.3), (0, -1.1, 1.95), 38),
}


def review(tag, frames=(0, 48, 96, 144, 192, 240), views=('front', '3q', 'side', 'back3q'), res=(560, 700)):
    """Bake-free review renders: a sequence strip from the 'seq' camera and robot-mode views at the last frame."""
    out = []
    for fr in frames:
        out.append(scene.render('%s_seq_%03d' % (tag, fr), *REVIEW_CAMS['seq'], res=(640, 480), frame=fr))
    for v in views:
        out.append(scene.render('%s_%s' % (tag, v), *REVIEW_CAMS[v], res=res, frame=frames[-1]))
    return out


def hero(tag, views=('front', '3q', 'side', 'back3q'), car=False, res=(560, 700)):
    """Robot-mode review at the last frame; car parts hidden unless car=True."""
    for o in bpy.data.collections['CAR'].objects:
        o.hide_render = not car
    try:
        return [scene.render('%s_%s' % (tag, v), *REVIEW_CAMS[v], res=res, frame=240) for v in views]
    finally:
        for o in bpy.data.collections['CAR'].objects:
            o.hide_render = False


def car_shell():
    """The car's closed outer body (hidden), the containment audit's reference."""
    from . import bodycage
    c = kit.collection('AUDIT', kit.collection('FERRARI'))
    kit.clear_collection(c)
    o = bodycage.build(c, 'audit.shell')
    kit.apply_modifiers(o)
    o.hide_render = True
    o.hide_set(True)
    return o


def audit_stow(limit=40):
    """Robot parts outside the car body at T = 0."""
    from . import audit
    bpy.context.scene.frame_set(0)       # baked keys drive the objects: pose through the timeline
    show_T(0.0)
    shell = bpy.data.objects.get('audit.shell') or car_shell()
    objs = [o for o in bpy.data.collections['ROBOT'].all_objects if o.type == 'MESH']
    rows = audit.containment_report(shell, objs)
    print('== stow: %d robot parts outside the car' % len(rows))
    for r in rows[:limit]:
        print('  ', r)
    return rows


def head_clearance(yaws=range(-60, 61, 15), frame=240):
    """Smallest gap between the helmet swept through head yaws (about the head joint) and the
    car parts on the backpack / collar: the in-game head-look envelope."""
    import math
    from mathutils import Matrix
    from mathutils.bvhtree import BVHTree
    bpy.context.scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()

    def world(o):
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        vs = [o.matrix_world @ v.co for v in me.vertices]
        fs = [list(p.vertices) for p in me.polygons]
        ev.to_mesh_clear()
        return vs, fs
    V, F, names = [], [], []
    for o in bpy.data.collections['CAR'].objects:
        if o.name.startswith(('wheelF', 'fwing', 'toe', 'pylon', 'shin', 'floorShin', 'cornerF', 'suspF')):
            continue
        vs, fs = world(o)
        b = len(V)
        V += vs
        F += [[b + i for i in f] for f in fs]
        names += [o.name] * len(fs)
    T = BVHTree.FromPolygons(V, F)
    vs, _ = world(bpy.data.objects['R.head.helmet'])
    H = bpy.data.objects['bone.head'].matrix_world
    loc = [H.inverted() @ v for v in vs[::2]]
    out = []
    for yaw in yaws:
        R = H @ Matrix.Rotation(math.radians(yaw), 4, 'Z')
        best = (9.0, None)
        for p in loc:
            hit = T.find_nearest(R @ p)
            if hit[0] is not None and hit[3] < best[0]:
                best = (hit[3], names[hit[2]])
        out.append((yaw, round(best[0], 3), best[1]))
    return out
