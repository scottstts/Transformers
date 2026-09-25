"""Review renders of the built soldier (run inside Blender after the build):

    exec(open('/.../blender/soldier_build/render.py').read())   # OUT / VIEWS globals optional

Writes <OUT>/<view>.png under a sun and a soft studio world; the review rig
(sun, camera, world) is created once and left out of the SOLDIER collection."""
import math
import os
import bpy
from mathutils import Vector

OUT = globals().get('OUT', '/tmp/soldier')
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
RES = globals().get('RES', 900)
sc.render.resolution_x, sc.render.resolution_y = RES, RES
sc.render.film_transparent = False
world = bpy.data.worlds.get('review') or bpy.data.worlds.new('review')
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.55, 0.58, 0.62, 1)
bg.inputs['Strength'].default_value = 0.7
sc.world = world
review = bpy.data.collections.get('REVIEW') or bpy.data.collections.new('REVIEW')
if review.name not in sc.collection.children:
    sc.collection.children.link(review)
sun = bpy.data.objects.get('review.sun')
if sun is None:
    sun = bpy.data.objects.new('review.sun', bpy.data.lights.new('review.sun', 'SUN'))
    review.objects.link(sun)
sun.data.energy = 3.5
sun.data.angle = math.radians(8)
sun.rotation_euler = (math.radians(45), math.radians(8), math.radians(-35))
floor = bpy.data.objects.get('review.floor')
if floor is None:
    me = bpy.data.meshes.new('review.floor')
    me.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new('review.floor', me)
    review.objects.link(floor)
    m = bpy.data.materials.new('review.floor')
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.7, 0.7, 0.72, 1)
    b.inputs['Roughness'].default_value = 0.6
    me.materials.append(m)
cam = bpy.data.objects.get('review.cam')
if cam is None:
    cam = bpy.data.objects.new('review.cam', bpy.data.cameras.new('review.cam'))
    review.objects.link(cam)
sc.camera = cam
cam.data.lens = 60


def look(p, at, lens=60):
    cam.data.lens = lens
    cam.location = p
    d = Vector(at) - Vector(p)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


H = 3.0
SHOTS = {
    'front': ((0, -10.5, 1.5), (0, 0, 1.5), 110),
    'side': ((10.5, 0, 1.5), (0, 0, 1.5), 110),
    'back': ((0, 10.5, 1.5), (0, 0, 1.5), 110),
    'three-quarter': ((-6.5, -7.8, 2.6), (0, 0, 1.45), 105),
    'head': ((-0.9, -2.1, 2.95), (0, 0, 2.78), 70),
    'torso': ((-1.6, -3.6, 2.3), (0, 0, 2.0), 60),
    'legs': ((-2.0, -3.2, 0.7), (0, 0, 0.6), 55),
    'hands': ((-1.6, -2.3, 1.2), (-0.3, 0, 1.1), 55),
}
for view in globals().get('VIEWS', list(SHOTS)):
    p, at, lens = SHOTS[view]
    look(p, at, lens)
    sc.render.filepath = os.path.join(OUT, view + '.png')
    bpy.ops.render.render(write_still=True)
