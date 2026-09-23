"""Build orchestration (run inside Blender via run.py)."""
import time
import bpy
from . import kit, scene, car, car_parts


def car_only():
    t = time.time()
    scene.setup_stage()
    root = kit.collection('CYBERTRUCK')
    c = kit.collection('CAR', root)
    kit.clear_collection(c)
    kit.purge_orphans()
    parts = car.build(c)
    parts.update(car_parts.build(c, parts))
    print('car panels:', len(parts), 'in %.1fs' % (time.time() - t))
    return parts


def stats(coll_name):
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    n = 0
    for o in bpy.data.collections[coll_name].all_objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        ev.to_mesh_clear()
        n += 1
    return n, tris


STATE = bpy.app.driver_namespace.setdefault("ct_state", {})  # survives module reloads


def blockout():
    """Car + skeleton + blockout volumes, car assemblies riding on their hosts."""
    from . import assemble, robot_blockout
    parts = car_only()
    root = kit.collection('CYBERTRUCK')
    rc = kit.collection('ROBOT', root)
    kit.clear_collection(rc)
    rg = bpy.data.collections.get('RIG')
    if rg:
        kit.clear_collection(rg)
    sc = assemble.Scene(root)
    struct = {}
    from . import robot_legs, robot_torso, robot_arms, robot_head
    for mod in (robot_legs, robot_torso, robot_arms, robot_head):
        struct.update(mod.build(rc))
    for bone, objs in robot_blockout.build(rc, skip=set(struct)).items():
        struct[bone] = objs
    sc.attach_structure(struct)
    from . import linkage
    sc.attach_linkage(linkage.build(rc))
    sc.attach_car()
    STATE['scene'] = sc
    return sc


def show_T(T):
    from . import bake
    return bake.apply(STATE['scene'], T)


def show_fold():
    show_T(0.0)


def show_rest():
    sc = STATE['scene']
    sc.set_pose(sc.skel.fk({}), 1.0)
    bpy.context.view_layer.update()


def head_views(tag):
    from . import scene
    show_rest()
    return [scene.render(tag + '_head', (1.6, -2.4, 5.7), (0, 0.3, 5.4), 45, hide=('CAR',)),
            scene.render(tag + '_headside', (2.6, 0.3, 5.5), (0, 0.3, 5.4), 45, hide=('CAR',))]


def torso_views(tag):
    from . import scene
    show_rest()
    hide = ('CAR',)
    return [scene.render(tag + '_torso3q', (4.5, -5.5, 5.0), (0, 0.3, 3.9), 40, hide=hide),
            scene.render(tag + '_torsoback', (-4.0, 5.5, 5.2), (0, 0.3, 3.9), 40, hide=hide)]


def legs_views(tag):
    from . import scene
    show_rest()
    return [scene.render(tag + '_legs3q', (4.2, -5.2, 2.0), (0.4, 0.3, 1.5), 42),
            scene.render(tag + '_legsback', (-3.6, 5.0, 1.8), (0.4, 0.3, 1.5), 42)]


def robot_views(tag):
    from . import scene
    show_rest()
    out = []
    out.append(scene.render(tag + '_front', (0.0, -13.0, 3.2), (0, -0.3, 2.9), 45))
    out.append(scene.render(tag + '_3q', (9.0, -10.5, 4.2), (0, -0.3, 2.9), 42))
    out.append(scene.render(tag + '_side', (14.0, -0.3, 3.0), (0, -0.3, 2.9), 40))
    out.append(scene.render(tag + '_back', (-6.0, 11.5, 4.0), (0, -0.3, 2.9), 42))
    return out


def show_stand():
    show_T(1.0)


def contact_sheet(tag, Ts=(0.0, 0.12, 0.24, 0.34, 0.42, 0.50, 0.58, 0.66, 0.76, 0.88, 1.0), eye=(10.5, -7.5, 3.6), target=(0, 0, 1.9), lens=32):
    from . import scene
    out = []
    for T in Ts:
        show_T(T)
        out.append(scene.render('%s_T%03d' % (tag, int(round(T * 100))), eye, target, lens, res=(640, 400)))
    return out


ROBOT_ALLOW = []
CAR_ALLOW = [('mirror.', 'door.'), ('mirror.', 'sealF.'), ('wiper', 'cowl.')]


def audit_pose(label, islands=False):
    from . import audit
    objs = [o for c in ('CAR', 'ROBOT') for o in bpy.data.collections[c].objects]
    ms = audit.gather(objs)
    out = {}
    if islands:
        out['islands'] = audit.island_report([m for m in ms if m.name.startswith('R.')])
    out['clash'] = sorted(audit.clash_report(ms, CAR_ALLOW + ROBOT_ALLOW, where=True), key=lambda r: -r[2])
    out['coplanar'] = audit.coplanar_report(ms)
    print('== %s: %s' % (label, ', '.join('%s %d' % (k, len(v)) for k, v in out.items())))
    for k, v in out.items():
        for r in v[:60]:
            print('  ', k, r)
    return out


def owners(sc):
    """object name -> mechanism owner (assembly, bone structure, lifter)."""
    own = {}
    for a in sc.asm.values():
        for p in a.parts:
            own[p] = a.name
    for bone, lst in sc.structure.items():
        for o in lst:
            own[o.name] = 'bone:' + bone
    for L, S, bone, panel, objs in sc.lifters:
        for o in objs:
            own[o.name] = 'lift:%s.%s' % (L.name, S)
    return own


def transition_report(samples=40, sides=('L', 'C', '')):
    """Clash sweep grouped by mechanism owner, one side shown, plus the support gate."""
    from . import sweep, support
    sc = STATE['scene']
    rows = sweep.sweep(sc, samples=samples, allow=CAR_ALLOW, verbose=False)
    own = owners(sc)
    grp = {}
    for (a, b), (t0, t1, w, wt) in rows:
        k = tuple(sorted((own.get(a, a), own.get(b, b))))
        g = grp.setdefault(k, [9, 0, 0, 0])
        g[0], g[1] = min(g[0], t0), max(g[1], t1)
        if w > g[2]:
            g[2], g[3] = w, wt
    print('clash sweep: %d part pairs, %d owner pairs' % (len(rows), len(grp)))
    for k, g in sorted(grp.items(), key=lambda kv: kv[1][0]):
        if any(x.endswith('.R') for x in k):
            continue
        print('   %-24s %-24s %.3f..%.3f  w%d @ %.3f' % (k[0], k[1], g[0], g[1], g[2], g[3]))
    sup = support.audit(sc, samples=samples // 2, verbose=False)
    print('support: %d unsupported' % len(sup))
    for n, (t0, t1, g, gt) in sup:
        if n.endswith('.R'):
            continue
        print('   %-16s T %.3f..%.3f  gap %.3f @ %.3f' % (n, t0, t1, g, gt))
    return rows, sup
