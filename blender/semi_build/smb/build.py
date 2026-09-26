"""Build orchestration (run inside Blender via run.py)."""
import time
import bpy
from . import kit, scene, car

STATE = bpy.app.driver_namespace.setdefault("semi_state", {})  # survives module reloads


def car_only():
    t = time.time()
    scene.setup_stage()
    root = kit.collection('SEMI')
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
    """bone -> [structure objects], authored bone-local."""
    from . import robot_legs, robot_torso, robot_arms, robot_head
    struct = {}
    for mod in (robot_legs, robot_torso, robot_arms, robot_head):
        for bone, objs in mod.build(coll).items():
            struct.setdefault(bone, []).extend(objs)
    return struct


def full():
    """Truck + robot structure + mechanisms in one scene, car assemblies riding their hosts."""
    from . import assemble, carrier, choreo
    car_only()
    root = kit.collection('SEMI')
    rc = kit.collection('ROBOT', root)
    kit.clear_collection(rc)
    rg = bpy.data.collections.get('RIG')
    if rg:
        kit.clear_collection(rg)
    sc = assemble.Scene(root)
    sc.attach_structure(robot_structure(rc))
    sc.attach_car()
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
