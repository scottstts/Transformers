"""Builds the soldier into the SOLDIER collection: one empty per bone (the
rest pose, parented like the skeleton) and one rigid part object per bone."""
import time
import bpy
from mathutils import Matrix
from f1b import kit as K
from . import rig, torso, head, arms, hands, legs, saber
from . import kit as S

# part name, bone, builder (left-side builders are mirrored for .R), bevel width, bevel segments
# (revolved and pre-bevelled parts carry their own chamfers: bevel 0)
CENTRE = [
    ('pelvis', 'pelvis', torso.pelvis, 0.004, 1),
    ('waist', 'spine', torso.waist, 0.003, 1),
    ('chest', 'chest', torso.chest, 0.005, 1),
    ('neck', 'neck', torso.neck, 0.0, 1),
    ('head', 'head', head.head, 0.003, 1),
    ('hilt', 'blade', saber.hilt, 0.0, 1),
    ('blade', 'blade', saber.blade, 0.0, 1),
]
SIDED = [
    ('upperarm', arms.upperarm, 0.004, 1),
    ('forearm', arms.forearm, 0.004, 1),
    ('thigh', legs.thigh, 0.005, 1),
    ('shin', legs.shin, 0.005, 1),
    ('foot', legs.foot, 0.003, 1),
    ('wheel', legs.wheel, 0.0, 1),
]


def _empties(coll):
    W = rig.rest_world()
    E = {}
    for name, parent, _, _ in rig.BONES:
        e = bpy.data.objects.new('bone.' + name, None)
        e.empty_display_type = 'PLAIN_AXES'
        e.empty_display_size = 0.05
        coll.objects.link(e)
        if parent:
            e.parent = E[parent]
            e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = rig.local_matrix(name)
        E[name] = e
    return E


# faceted parts whose facet breaks are shallower than the default bevel angle
ANGLE = {'head': 18.0, 'chest': 24.0}


def _part(name, bone, islands, coll, E, bevel, seg):
    p = S.Part(name, bone)
    for mesh, slot in islands:
        p.add(mesh, slot)
    return p.build(coll, E, bevel=bevel, seg=seg, angle=ANGLE.get(name, 32.0))


def build():
    t = time.time()
    coll = K.collection('SOLDIER')
    K.clear_collection(coll)
    E = _empties(coll)
    for name, bone, fn, bevel, seg in CENTRE:
        _part(name, bone, fn(), coll, E, bevel, seg)
    for name, fn, bevel, seg in SIDED:
        left = fn()
        _part(name + '.L', name + '.L', left, coll, E, bevel, seg)
        _part(name + '.R', name + '.R', [(S.mirror_x(m), s) for m, s in left], coll, E, bevel, seg)
    _part('hand.L', 'hand.L', hands.hand_left(), coll, E, 0.0, 1)
    _part('hand.R', 'hand.R', hands.hand_right_grip(), coll, E, 0.0, 1)
    K.purge_orphans()
    tris = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in coll.all_objects:
        if o.type == 'MESH':
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            ev.to_mesh_clear()
    print('soldier built in %.1fs: %d triangles' % (time.time() - t, tris))
    return coll
