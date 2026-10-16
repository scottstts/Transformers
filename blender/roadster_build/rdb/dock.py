"""Where every car assembly docks on the robot (rest = standing robot).

Each dock is a rigid map D from car coordinates to robot rest coordinates;
a carrier docked on host bone b sits at D @ M_car (its car-mode world matrix)
and is stored relative to b. Concept sheet reading (rig.py datums):

  chest     the nose clip, nose forward, pitched 12 deg nose-down: the light bar
            at y -0.99, z 4.67 (concept light bar 4.67); its fenders are the chest's
            white flanks rising to the shoulders, its black front is the lower band
  screen    folded forward flat over the clip's cowl: the black glass top of the
            chest, ending at the neck
  back      the tail standing rear end down: rear glass facing back, the four fans
            and nozzles thrusting down (the flight pack), the roof capping its top,
            the floor tub between it and the back
  forearms  the gullwing doors: skin outward as the forearm shield, front edge at
            the wrist; the door glass and posts fold in against the skin
  shoulders the front wheels, outboard of the shoulder joints (pauldron wheels)
  calves    the rear wheels on the outer calves (concept: front, 3/4 and back views)
"""
import math
from mathutils import Matrix, Vector
from . import rig

NOSE_PITCH = math.radians(12)
LIGHT_CAR = Vector((0, -2.19, 0.565))
LIGHT_ROBOT = Vector((0, -0.99, 4.67))
# the floor tub and the tail fold up the back as a hinge chain: the tub stands on its
# front edge (TUB_HINGE) against the back, its floor (with the stowed cabin) facing the
# robot; the tail turns 180 deg over the tub's rear-bottom edge (TAIL_HINGE) and hangs
# rear end down behind it, rear glass facing back, fans and nozzles thrusting down
TUB_HINGE = Vector((0, -0.74, 0.34))
TAIL_HINGE = Vector((0, 0.27, 0.14))
TUB_ROBOT = Vector((0, 0.50, 4.30))         # where the tub's hinge edge docks on the back
DOOR_CAR = Vector((0.853, -0.185, 0.624))
DOOR_ROBOT = Vector((rig.SHOULDER_X + 0.17, rig.SHOULDER_Y + 0.04, 3.72))
WHEEL_F_CAR = Vector((0.76, -1.405, 0.397))
WHEEL_R_CAR = Vector((0.79, 1.506, 0.392))
PAULDRON_HUB = Vector((rig.SHOULDER_X + 0.30, rig.SHOULDER_Y, rig.SHOULDER_Z))   # tyre clear of the bicep
CALF_HUB = Vector((rig.HIP_X + 0.43, 0.14, 1.46))

HOST = {}   # carrier -> host bone (filled by groups())


def about(p_car, p_robot, R):
    return Matrix.Translation(p_robot) @ R @ Matrix.Translation(-p_car)


def rx(a):
    return Matrix.Rotation(a, 4, 'X')


def mirror_x(v):
    return Vector((-v.x, v.y, v.z))


def D_nose():
    return about(LIGHT_CAR, LIGHT_ROBOT, rx(NOSE_PITCH))


def D_tub():
    return about(TUB_HINGE, TUB_ROBOT, rx(math.radians(90)))


def R_tail():
    """The tail's turn over the tub's rear edge (car space)."""
    return about(TAIL_HINGE, TAIL_HINGE, rx(math.radians(-180)))


def D_tail():
    return D_tub() @ R_tail()


def D_door(s):
    c = DOOR_CAR if s > 0 else mirror_x(DOOR_CAR)
    r = DOOR_ROBOT if s > 0 else mirror_x(DOOR_ROBOT)
    return about(c, r, rx(math.radians(90)))


def D_wheel(front, s):
    c = WHEEL_F_CAR if front else WHEEL_R_CAR
    r = PAULDRON_HUB if front else CALF_HUB
    if s < 0:
        c, r = mirror_x(c), mirror_x(r)
    return about(c, r, Matrix.Identity(4))


def groups():
    """carrier name -> (host bone, D)."""
    g = {}
    for n in ('nose', 'hood', 'flap.L', 'flap.R', 'jet.FL', 'jet.FR', 'jet.FL.stage', 'jet.FR.stage'):
        g[n] = ('chest', D_nose())
    for n in ('tail', 'wing', 'wing.strut.L', 'wing.strut.R', 'plate.L', 'plate.R', 'pod.L', 'pod.R',
              'jet.RL', 'jet.RR', 'jet.RL.stage', 'jet.RR.stage'):
        g[n] = ('chest', D_tail())
    g['tub'] = ('chest', D_tub())
    for S, s in (('L', 1), ('R', -1)):
        g['door.' + S] = ('forearm.' + S, D_door(s))
        g['wheelF.' + S] = ('upperarm.' + S, D_wheel(True, s))
        g['hub.F.' + S] = ('upperarm.' + S, D_wheel(True, s))
        g['wheelR.' + S] = ('shin.' + S, D_wheel(False, s))
        g['hub.R.' + S] = ('shin.' + S, D_wheel(False, s))
    HOST.clear()
    HOST.update({k: v[0] for k, v in g.items()})
    return g


def node_name(carrier):
    return 'bone.' + carrier if carrier.startswith('wheel') else 'bone.asm.' + carrier


# ---- sub-carriers split off the car's assemblies for the transformation

SCREEN_HINGE = Vector((0, -1.44, 0.86))       # the windscreen's base edge (car)
GLASS_HINGE = Vector((0.80, 0.0, 0.88))      # the door glass's belt line (car, left)


def F_screen():
    """Car-space map stowing the windscreen once the cabin has folded into the
    floor tub: laid flat (its 15 deg rake taken out) into the tub's slab beside the
    folded cabin, centred on the tub. It rides the tub onto the back, hidden between the pack
    and the robot."""
    c = Vector((0, -0.89, 1.00))                  # the glass's centre in the car
    return Matrix.Translation(SCREEN_STOW) @ rx(math.radians(-15)) @ Matrix.Translation(-c)


SCREEN_STOW = Vector((0, -0.235, 0.24))           # inside the tub's slab, with the folded cabin
ROOF_HINGE = Vector((0, 0.549, 1.18))      # the roof's rear edge on the rear glass


def F_roof():
    """The roof strip folds down about its rear edge into the tail's open front:
    on the robot it lies across the flight pack's top as a black glass lid."""
    return about(ROOF_HINGE, ROOF_HINGE, rx(math.radians(90)))


def F_glass(s):
    """Door glass folded down about the belt line inside the door skin."""
    h = GLASS_HINGE if s > 0 else mirror_x(GLASS_HINGE)
    return about(h, h, Matrix.Rotation(math.radians(-115 * s), 4, 'Y'))


SPLITS = {   # new carrier: (car objects moved onto it, pivot (car))
    'screen': (['car.screen'], SCREEN_HINGE),
    'door.L.glass': (['car.door.L.glass', 'car.door.L.post0', 'car.door.L.post1'], GLASS_HINGE),
    'door.R.glass': (['car.door.R.glass', 'car.door.R.post0', 'car.door.R.post1'], mirror_x(GLASS_HINGE)),
    'cabin': (['car.cabin'], Vector((0, -0.24, 0.30))),
}


def car_matrix(o):
    return Matrix([list(o['car_mw'][i * 4:i * 4 + 4]) for i in range(4)])


def capture():
    """Record every car carrier's car-mode world matrix (frame 0) once."""
    import bpy
    for o in bpy.data.objects:
        if o.type == 'EMPTY' and o.name.startswith(('bone.asm.', 'bone.wheel')) and 'car_mw' not in o:
            o['car_mw'] = [v for row in o.matrix_world for v in row]


def split():
    """Create the sub-carriers (world nodes at their car pose) and move their car
    objects onto them, keeping every object's world placement."""
    import bpy
    from . import kit as K
    for name, (objs, pivot) in SPLITS.items():
        nn = 'bone.asm.' + name
        n = bpy.data.objects.get(nn)
        if n is None:
            n = K.node('asm.' + name, size=0.15)
        n.parent = None
        n.matrix_world = Matrix.Translation(pivot)
        n['car_mw'] = [v for row in n.matrix_world for v in row]
        for on in objs:
            o = bpy.data.objects[on]
            mw = car_matrix(o.parent) @ o.matrix_parent_inverse @ o.matrix_basis
            o.parent = n
            o.matrix_parent_inverse = Matrix.Identity(4)
            o.matrix_basis = n.matrix_world.inverted() @ mw


def groups_all():
    g = groups()
    g['screen'] = ('chest', D_tub() @ F_screen())
    g['roof'] = ('tail', D_tail() @ F_roof())
    for S, s in (('L', 1), ('R', -1)):
        g['door.%s.glass' % S] = ('forearm.' + S, D_door(s) @ F_glass(s))
    HOST.update({k: v[0] for k, v in g.items()})
    return g


def preview():
    """Place every carrier at its dock on the rest-pose robot."""
    import bpy
    for c, (host, D) in groups_all().items():
        o = bpy.data.objects.get(node_name(c))
        if o is None:
            continue
        if o.animation_data:
            o.animation_data.action = None
        o.matrix_world = D @ car_matrix(o)
