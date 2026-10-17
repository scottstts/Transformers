"""Cinematic film of the car (not the game, a one-off): its own scene, "Roadster
Film", 20 s at 30 fps, cut between five cameras with timeline markers (the viewport
shows the cuts when it looks through the scene camera, Numpad 0).

    exec(open('.../blender/roadster_build/run.py').read())
    from rdb import cinematic; cinematic.build()      # from the model scene

The car is a copy of every car part at its frame-0 pose (shared meshes and
materials, no build tag), so the transformation never plays here and a model
rebuild does not delete it; rerun build() after one to refresh the copy. The parts
ride a rig (film.car): parked for four shots, then it pulls away (LEAVE) under a
chase camera. Each wheel and its sidewall lettering turn on a pivot at its hub by
distance / rolling radius; the calipers ride the body. Render settings, compositing
and the final render are left to the user.
"""
import math
import bpy
from mathutils import Matrix, Vector
from . import kit as K

SCENE = 'Roadster Film'
COLL = 'FILM'
FPS, FRAMES = 30, 600

# The car pulls away along -y (forward) from rest on frame l0, at a steady
# acceleration over distance to frame l1: 0 to 54 km/h in 4 s.
LEAVE = (481, 600, 30.0)

# Shots: name, first and last frame, lens (mm, or lens keys), f-stop, camera keys
# (or an orbit), target keys, and what rides the car ('cam': camera and target in
# the car's frame). Keys are (frame, (x, y, z)); the nose is at y -2.19, the left
# (+x) side faces the side shots. Moves run at constant speed through each cut,
# keyed a few frames past both ends, so nothing settles on screen.
SHOTS = [
    dict(name='roof pan', f=(1, 120), lens=[(-4, 28.0), (124, 38.0)], fstop=5.6,
         cam=[(-4, (3.00, -5.60, 3.40)), (124, (2.70, 3.10, 3.30))],
         target=[(-4, (0.0, -0.40, 0.70)), (124, (0.0, 0.70, 0.90))]),
    dict(name='side pan zoom', f=(121, 240), lens=[(117, 30.0), (244, 58.0)], fstop=4.0,
         cam=[(117, (4.20, -3.40, 0.55)), (244, (4.60, 1.60, 0.75))],
         target=[(117, (0.60, -1.60, 0.60)), (244, (0.60, 0.90, 0.65))]),
    dict(name='front arc', f=(241, 360), lens=40, fstop=4.0,
         cam=dict(centre=(0.0, -1.40, 0.0), radius=4.3, z=(0.32, 0.55), angle=(42.0, -14.0)),
         target=[(237, (0.15, -1.60, 0.52)), (364, (0.0, -1.60, 0.56))]),
    dict(name='rear push', f=(361, 480), lens=35, fstop=4.0,
         cam=[(357, (-3.40, 5.60, 0.35)), (484, (-2.30, 4.10, 0.55))],
         target=[(357, (0.0, 1.45, 0.55)), (484, (0.0, 1.60, 0.62))]),
    # rides ahead of the car on its front-left corner, a little above: the whole car
    # in frame as it accelerates toward the lens
    dict(name='chase', f=(481, 600), lens=30, fstop=5.6, ride='cam',
         cam=[(477, (2.70, -5.80, 1.55)), (604, (2.30, -5.20, 1.35))],
         target=[(477, (0.0, -0.30, 0.55)), (604, (0.0, -0.40, 0.55))]),
]
SPIN = ('wheelF.L', 'wheelF.R', 'wheelR.L', 'wheelR.R')


def car_y(f):
    """The car's position along y at frame f (0 = parked)."""
    l0, l1, s = LEAVE
    if f <= l0:
        return 0.0
    u = (f - l0) / (l1 - l0)
    if u <= 1:
        return -s * u * u
    return -s - 2 * s * (u - 1)


def _clear(sc):
    coll = bpy.data.collections.get(COLL)
    if coll is None:
        coll = bpy.data.collections.new(COLL)
    if coll.name not in sc.collection.children:
        sc.collection.children.link(coll)
    for o in list(coll.all_objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            # the film's own cameras, lights and floor (the car copies share the
            # model's meshes, which stay in use)
            for pool in (bpy.data.cameras, bpy.data.lights, bpy.data.meshes):
                if data.name in pool and pool[data.name] == data:
                    pool.remove(data)
                    break
    for c in list(coll.children):
        bpy.data.collections.remove(c)
    sc.timeline_markers.clear()
    return coll


def _sub(parent, name):
    c = bpy.data.collections.new(name)
    parent.children.link(c)
    return c


def _empty(coll, name, loc=(0, 0, 0), parent=None, size=0.1):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = loc
    if parent is not None:
        e.parent = parent
        e.matrix_parent_inverse = Matrix.Identity(4)
    coll.objects.link(e)
    return e


def _car(coll, src_scene):
    """The car parts at frame 0 on the rig; each wheel (and its lettering) on a
    pivot at its hub."""
    src_scene.frame_set(0)
    rig = _empty(coll, 'film.car', size=0.6)
    pivots = {w: _empty(coll, 'film.spin.' + w, bpy.data.objects['bone.' + w].matrix_world.translation.copy(),
                        rig, 0.3) for w in SPIN}
    n = 0
    for o in bpy.data.collections['01_CAR'].all_objects:
        if o.type != 'MESH' or o.name.startswith('car.lid.') or o.hide_render:
            continue
        M = o.matrix_world.copy()
        c = o.copy()
        c.animation_data_clear()
        c.constraints.clear()
        if K.TAG in c:
            del c[K.TAG]
        c.name = 'film.' + o.name
        wheel = next((w for w in SPIN if o.name == 'car.' + w or o.name.startswith('car.' + w + '.')), None)
        host = pivots[wheel] if wheel else rig
        c.parent = host
        c.matrix_parent_inverse = Matrix.Identity(4)
        c.matrix_basis = Matrix.Translation(-host.location) @ M if wheel else M
        coll.objects.link(c)
        n += 1
    # motion: a key every frame while it moves, held before
    for f in range(LEAVE[0], FRAMES + 1):
        y = car_y(f)
        rig.location = (0.0, y, 0.0)
        rig.keyframe_insert('location', index=1, frame=f)
        for p in pivots.values():
            p.rotation_euler = (-y / p.location.z, 0.0, 0.0)
            p.keyframe_insert('rotation_euler', index=0, frame=f)
    for o in [rig] + list(pivots.values()):
        for fc in _fcurves(o.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
    return rig, n


def _ground_material():
    """Vibrant bronze, glossy enough to mirror the car: half metallic with a clear
    coat, its roughness and tone drifting softly over a few metres (and finer
    over centimetres), so it reads as a real poured floor and its reflections show
    the car's motion in the chase."""
    m = bpy.data.materials.get('film.ground') or bpy.data.materials.new('film.ground')
    m.use_nodes = True
    nt = m.node_tree
    for nd in [nd for nd in nt.nodes if nd.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL')]:
        nt.nodes.remove(nd)
    p = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    p.inputs['Metallic'].default_value = 0.55
    p.inputs['Coat Weight'].default_value = 0.6
    p.inputs['Coat Roughness'].default_value = 0.04
    tc = nt.nodes.new('ShaderNodeTexCoord')

    def noise(scale, detail):
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = scale
        nz.inputs['Detail'].default_value = detail
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        return nz
    broad, fine = noise(0.18, 4.0), noise(9.0, 8.0)
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = 0.75
    nt.links.new(broad.outputs['Fac'], mix.inputs[0])
    sc_ = nt.nodes.new('ShaderNodeMath')
    sc_.operation = 'MULTIPLY'
    sc_.inputs[1].default_value = 0.25
    nt.links.new(fine.outputs['Fac'], sc_.inputs[0])
    nt.links.new(sc_.outputs[0], mix.inputs[2])
    rough = nt.nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value, rough.inputs['To Max'].default_value = 0.08, 0.26
    nt.links.new(mix.outputs[0], rough.inputs['Value'])
    nt.links.new(rough.outputs['Result'], p.inputs['Roughness'])
    tone = nt.nodes.new('ShaderNodeMix')
    tone.data_type = 'RGBA'
    tone.inputs[6].default_value = (0.42, 0.20, 0.06, 1)      # deep bronze
    tone.inputs[7].default_value = (0.70, 0.38, 0.13, 1)      # bright bronze
    nt.links.new(broad.outputs['Fac'], tone.inputs['Factor'])
    nt.links.new(tone.outputs[2], p.inputs['Base Color'])
    return m


def _stage(coll, sc, car_coll):
    """A wide bronze ground to the horizon under a faint dusk sky, lit like the
    reference photos' studio (below). Values are a starting point for the user's
    lighting pass."""
    me = bpy.data.meshes.new('film.ground')
    s = 1000.0
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new('film.ground', me)
    me.materials.append(_ground_material())
    coll.objects.link(ground)

    def light(name, kind, loc, aim, energy, size=(1.0, 1.0), color=(1, 1, 1), car_only=False, rig=None):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.shape = 'RECTANGLE'
            ld.size, ld.size_y = size
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        d = Vector(aim) - Vector(loc)
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        if car_only:
            # lights only the car: the glossy floor mirrored the panel as a
            # hard-edged white slab
            o.light_linking.receiver_collection = car_coll
        if rig is not None:      # travels with the car, so the chase keeps its light
            o.parent = rig
            o.matrix_parent_inverse = Matrix.Identity(4)
        coll.objects.link(o)
        return o
    # The reference photos' studio: one raking key from the front-right and above, a
    # spot whose soft-edged beam lays a pool on the floor ahead of the car and catches
    # the hood and front facets while the side grades off into shadow toward the
    # tail; everything else falls to near black. A faint top light carries the roof
    # line, a thin strip draws the shoulder highlight and a dim rim separates the
    # silhouette (all three on the car only). The sun is a trace, just enough to
    # read the ground's horizon.
    rig = bpy.data.objects['film.car']
    key = light('film.key', 'SPOT', (-4.6, -5.8, 6.2), (0.4, -0.6, 0.2), 2200, color=(1.0, 0.97, 0.93), rig=rig)
    key.data.spot_size = math.radians(48)
    key.data.spot_blend = 0.55
    key.data.shadow_soft_size = 0.5
    light('film.top', 'AREA', (0.0, 0.2, 4.8), (0.0, 0.2, 0.0), 90, (2.4, 5.0), car_only=True, rig=rig)
    light('film.strip', 'AREA', (4.2, 0.0, 2.3), (0.0, 0.0, 0.6), 60, (0.3, 7.5), car_only=True, rig=rig)
    light('film.rim', 'AREA', (0.0, 7.0, 2.6), (0.0, 0.5, 0.6), 110, (4.0, 1.2), (0.92, 0.95, 1.0),
          car_only=True, rig=rig)
    light('film.sun', 'SUN', (12.0, -26.0, 13.0), (0.0, 0.0, 0.0), 0.15, color=(1.0, 0.86, 0.68))

    # dusk sky: dark overhead, a warm glow along the horizon for the floor to mirror
    w = bpy.data.worlds.get('film.world') or bpy.data.worlds.new('film.world')
    w.use_nodes = True
    nt = w.node_tree
    for nd in [nd for nd in nt.nodes if nd.type not in ('BACKGROUND', 'OUTPUT_WORLD')]:
        nt.nodes.remove(nd)
    bg = next(nd for nd in nt.nodes if nd.type == 'BACKGROUND')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.0, (0.10, 0.06, 0.035, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.22, (0.012, 0.014, 0.022, 1)
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.3
    sc.world = w


def _key(obj, path, keys, interp='LINEAR'):
    for f, v in keys:
        setattr(obj, path, v)
        obj.keyframe_insert(path, frame=f)
    for fc in _fcurves(obj.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = interp


def _fcurves(action):
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    out = []                                   # layered actions (Blender 4.4+)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out += list(bag.fcurves)
    return out


def _camera(coll, name, lens, fstop):
    cd = bpy.data.cameras.new(name)
    cd.sensor_width = 36.0
    cd.clip_start = 0.05
    cd.clip_end = 3000.0
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = fstop
    if isinstance(lens, list):
        _key(cd, 'lens', lens)
    else:
        cd.lens = lens
    cam = bpy.data.objects.new(name, cd)
    coll.objects.link(cam)
    return cam


def _aim(coll, cam, keys, parent=None):
    t = _empty(coll, cam.name + '.target', parent=parent, size=0.08)
    _key(t, 'location', [(f, Vector(v)) for f, v in keys])
    c = cam.constraints.new('TRACK_TO')
    c.target = t
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    cam.data.dof.focus_object = t
    return t


def _orbit(spec, f0, f1, n=8):
    """Camera keys on an arc around centre: angle from -y (the nose) toward +x."""
    c = Vector(spec['centre'])
    (z0, z1), (a0, a1) = spec['z'], spec['angle']
    keys = []
    for k in range(n + 1):
        u = k / n
        a = math.radians(a0 + (a1 - a0) * u)
        keys.append((round(f0 - 4 + (f1 - f0 + 8) * u),
                     c + Vector((spec['radius'] * math.sin(a), -spec['radius'] * math.cos(a), z0 + (z1 - z0) * u))))
    return keys


def bake_master(sc=None):
    """Bake the cut into one camera, film.camera (the scene camera): every frame it
    takes the live shot camera's world transform, lens, f-stop and focus distance.
    Keys are linear inside a shot (motion blur stays smooth) and constant into each
    cut (a hard cut, no blur across it). Rerun after editing a shot camera."""
    sc = sc or bpy.data.scenes[SCENE]
    cams = bpy.data.collections['FILM_CAMERAS']
    old = bpy.data.objects.get('film.camera')
    if old is not None:
        data = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        bpy.data.cameras.remove(data)
    cd = bpy.data.cameras.new('film.camera')
    cd.sensor_width = 36.0
    cd.clip_start, cd.clip_end = 0.05, 3000.0
    cd.dof.use_dof = True
    master = bpy.data.objects.new('film.camera', cd)
    master.rotation_mode = 'QUATERNION'
    cams.objects.link(master)
    shots = sorted(((m.frame, bpy.data.objects['film.cam%d %s' % (i, s['name'])])
                    for i, (s, m) in enumerate(zip(SHOTS, sorted(sc.timeline_markers, key=lambda m: m.frame)), 1)),
                   key=lambda t: t[0])
    cuts = {f for f, _ in shots[1:]}
    prev_q = None
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f)
        cam = [c for f0, c in shots if f0 <= f][-1]
        M = cam.matrix_world
        loc, q, _ = M.decompose()
        if prev_q is not None and f not in cuts:
            q.make_compatible(prev_q)
        prev_q = q
        master.location = loc
        master.rotation_quaternion = q
        cd.lens = cam.data.lens
        cd.dof.aperture_fstop = cam.data.dof.aperture_fstop
        fo = cam.data.dof.focus_object
        cd.dof.focus_distance = (fo.matrix_world.translation - loc).length if fo else cam.data.dof.focus_distance
        master.keyframe_insert('location', frame=f)
        master.keyframe_insert('rotation_quaternion', frame=f)
        cd.keyframe_insert('lens', frame=f)
        cd.dof.keyframe_insert('aperture_fstop', frame=f)
        cd.dof.keyframe_insert('focus_distance', frame=f)
    for owner in (master, cd):
        for fc in _fcurves(owner.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT' if int(round(kp.co.x)) + 1 in cuts else 'LINEAR'
    for m in sc.timeline_markers:
        m.camera = None
    sc.camera = master
    sc.frame_set(sc.frame_start)
    return master


def build():
    src = bpy.context.scene
    if src.name == SCENE:
        raise RuntimeError('run build() from the model scene')
    sc = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    coll = _clear(sc)
    car_coll = _sub(coll, 'FILM_CAR')
    rig, n = _car(car_coll, src)
    _stage(_sub(coll, 'FILM_STAGE'), sc, car_coll)
    cams = _sub(coll, 'FILM_CAMERAS')
    for i, s in enumerate(SHOTS, 1):
        f0, f1 = s['f']
        cam = _camera(cams, 'film.cam%d %s' % (i, s['name']), s['lens'], s['fstop'])
        ride = s.get('ride') == 'cam'
        if ride:
            cam.parent = rig
            cam.matrix_parent_inverse = Matrix.Identity(4)
        if isinstance(s['cam'], dict):
            _key(cam, 'location', _orbit(s['cam'], f0, f1), 'BEZIER')
        else:
            _key(cam, 'location', [(f, Vector(v)) for f, v in s['cam']])
        _aim(cams, cam, s['target'], rig if ride else None)
        m = sc.timeline_markers.new(s['name'], frame=f0)
        m.camera = cam
        if i == 1:
            sc.camera = cam
    sc.frame_start, sc.frame_end = 1, FRAMES
    sc.render.fps, sc.render.fps_base = FPS, 1.0
    win = bpy.context.window
    win.scene = sc                  # the bake reads the film scene's evaluated cameras
    bake_master(sc)
    win.scene = src
    return {'scene': sc.name, 'car_parts': n, 'cameras': len(SHOTS)}
