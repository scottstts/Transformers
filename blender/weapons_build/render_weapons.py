"""Review renders of the built weapons (run after build_weapons.py, same file):

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/weapons.blend \
        --python blender/weapons_build/render_weapons.py -- <out-dir>

Writes <out-dir>/<weapon>-<view>.png: a side view of each flat, a three-quarter
view and a close view of the head, under a sun and a soft studio world."""
import math
import os
import sys
import bpy
from mathutils import Vector

args = [a for a in sys.argv[sys.argv.index('--') + 1:] if not a.startswith('--')] if '--' in sys.argv else []
out = args[0] if args else '/tmp/weapons'
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'CYCLES'
sc.render.resolution_x, sc.render.resolution_y = 960, 960
sc.render.film_transparent = False
world = bpy.data.worlds.get('review') or bpy.data.worlds.new('review')
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.42, 0.38, 0.33, 1)
bg.inputs['Strength'].default_value = 0.8
sc.world = world
sun = bpy.data.objects.get('review.sun')
if sun is None:
    sun = bpy.data.objects.new('review.sun', bpy.data.lights.new('review.sun', 'SUN'))
    sc.collection.objects.link(sun)
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
cam = bpy.data.objects.get('review.cam')
if cam is None:
    cam = bpy.data.objects.new('review.cam', bpy.data.cameras.new('review.cam'))
    sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 70


def look(p, at):
    cam.location = p
    d = Vector(at) - Vector(p)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def shots(coll, x0):
    lo = min(o.bound_box[i][2] for o in coll.all_objects for i in range(8))
    hi = max(o.bound_box[i][2] for o in coll.all_objects for i in range(8))
    mid = (lo + hi) / 2
    span = hi - lo
    d = span * 1.9
    head = hi - span * 0.22
    return {
        'side': ((x0 + 0.1, -d, mid), (x0 + 0.1, 0, mid)),
        'back': ((x0 + 0.1, d, mid), (x0 + 0.1, 0, mid)),
        'three-quarter': ((x0 + d * 0.6, -d * 0.7, mid + span * 0.25), (x0, 0, mid)),
        'head': ((x0 + span * 0.35, -span * 0.45, head + span * 0.1), (x0 + span * 0.08, 0, head)),
        'grip': ((x0 + span * 0.25, -span * 0.35, span * 0.02), (x0, 0, 0)),
    }


for name, x0 in (('AXE', 0.0), ('SWORD', 1.6)):
    coll = bpy.data.collections[name]
    for other in ('AXE', 'SWORD'):
        bpy.data.collections[other].hide_render = other != name
    for view, (p, at) in shots(coll, x0).items():
        look(p, at)
        sc.render.filepath = os.path.join(out, '%s-%s.png' % (name.lower(), view))
        bpy.ops.render.render(write_still=True)
for other in ('AXE', 'SWORD'):
    bpy.data.collections[other].hide_render = False
