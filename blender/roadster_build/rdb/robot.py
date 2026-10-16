"""Robot assembly: the skeleton's empties and every robot casting on its bone.

Castings are authored in world rest coordinates (rig rest = the standing
robot) and stored in their bone's frame. A casting that is stowed in car mode
hangs from a nest node (`bone.part.<name>`) between it and its bone, at the
casting's own centre, so the transformation can slide or squash it in place.
"""
import bpy
from mathutils import Vector, Matrix
from . import kit as K, rig

# (bone, part name, finish): bevel width and the smoothing angle (facet edges
# sharper than it are bevelled; the faceted armour keeps every facet crisp)
FINISH = {'armour': (0.006, 12), 'mech': (0.004, 30), 'smooth': (0.003, 40), 'fine': (0.0015, 30)}
HEAD_FINISH = {'head.core': (0.002, 40), 'head.helm': (0.002, 20), 'head.face': (0.0015, 20),
               'head.white': (0.0025, 15), 'head.ear': (0.001, 30), 'neck': (0.003, 30)}


def reset():
    for o in list(bpy.data.objects):
        if o.get(K.TAG) and o.name.startswith(('robot.', 'bone.robot.', 'bone.part.')):
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
    for k in [k for k in K.NODES if k.startswith(('robot.', 'part.'))]:
        del K.NODES[k]


def nest(name, bone, centre):
    """Nest node at a casting's centre, child of its bone."""
    n = K.node('part.' + name, size=0.05)
    n.parent = K.NODES['robot.' + bone]
    n.matrix_parent_inverse = Matrix.Identity(4)
    n.matrix_basis = Matrix.Translation(Vector(centre) - rig.HEADS[bone])
    n['nest_bone'] = bone
    n['nest_offset'] = list(Vector(centre) - rig.HEADS[bone])
    return n


def place(mesh, name, bone, finish='armour', nested=True):
    """Write a casting under its bone (through a nest node at its centre)."""
    if not mesh.v:
        return None
    w, a = HEAD_FINISH.get(name, FINISH[finish])
    if nested:
        lo = Vector([min(p[i] for p in mesh.v) for i in range(3)])
        hi = Vector([max(p[i] for p in mesh.v) for i in range(3)])
        c = (lo + hi) / 2
        n = nest(name, bone, c)
        o = mesh.build('robot.' + name, '02_ROBOT', parent=n, rest=Matrix.Translation(c), bevel=w, smooth_angle=a)
    else:
        o = mesh.build('robot.' + name, '02_ROBOT', parent='robot.' + bone, rest=rig.rest(bone), bevel=w,
                       smooth_angle=a)
    return o


def build(parts=None):
    from . import r_head
    reset()
    rig.create()
    bpy.context.view_layer.update()
    out = {}
    hm = r_head.build_meshes()
    out['head.core'] = place(hm['core'], 'head.core', 'head', 'smooth')
    out['head.helm'] = place(hm['helm'], 'head.helm', 'head', 'armour')
    out['head.face'] = place(hm['face'], 'head.face', 'head', 'armour')
    out['head.white'] = place(hm['white'], 'head.white', 'head', 'armour')
    out['head.ear'] = place(hm['ear'], 'head.ear', 'head', 'fine')
    out['neck'] = place(r_head.neck_meshes(), 'neck', 'neck', 'mech')
    from . import r_torso, r_arm, r_leg
    for fn in (r_torso.chest, r_torso.chest_shell, r_torso.spine, r_torso.pelvis):
        for name, (mesh, finish) in fn().items():
            out[name] = place(mesh, name, name.split('.')[0], finish)
    parts = dict(r_torso.hips())
    for s in (1, -1):
        parts.update(r_arm.side(s))
        parts.update(r_leg.side(s))
    for name, (mesh, finish, bone) in parts.items():
        out[name] = place(mesh, name, bone, finish)
    return {'castings': len([v for v in out.values() if v])}
