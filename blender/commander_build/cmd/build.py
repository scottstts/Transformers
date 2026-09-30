"""Rebuild the COMMANDER collection: one empty per bone in the rest pose and
the rigid parts riding them. Other collections, cameras and lights are kept."""
import importlib
import time
import bpy
from mathutils import Matrix
from . import rig

GROUPS = ('legs', 'torso', 'head', 'arms', 'hands', 'skirt', 'weapon')


def _collection():
    coll = bpy.data.collections.get('COMMANDER')
    if coll is None:
        coll = bpy.data.collections.new('COMMANDER')
        bpy.context.scene.collection.children.link(coll)
    for ob in list(coll.all_objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in [m for m in bpy.data.meshes if m.users == 0 and m.name.startswith('cmd.')]:
        bpy.data.meshes.remove(me)
    return coll


def _bones(coll):
    bones = {}
    for name in rig.NAMES:
        ob = bpy.data.objects.new('cmd.bone.' + name, None)
        coll.objects.link(ob)
        ob.empty_display_size = .08
        parent = rig.PARENT[name]
        if parent:
            ob.parent = bones[parent]
            ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.matrix_basis = rig.local_matrix(name)
        bones[name] = ob
    return bones


def build(groups=GROUPS):
    t = time.time()
    coll = _collection()
    bones = _bones(coll)
    parts = []
    for g in groups:
        parts += importlib.import_module('.' + g, __package__).parts()
    for p in parts:
        p.build(coll, bones)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for ob in coll.objects:
        if ob.type == 'MESH':
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            ev.to_mesh_clear()
    print('COMMANDER %s: %d parts, %d bones, %d triangles, %.1fs' % ('+'.join(groups), len(parts), len(bones), tris, time.time() - t))
    return coll
