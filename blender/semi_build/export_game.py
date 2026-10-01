"""Headless build + game export:

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/semi.blend \
        --python blender/semi_build/export_game.py

Rebuilds the truck, van, robot and mechanisms from the scripts, bakes the
timeline (the density warp and robot_fit's panel tailoring) and writes
assets/semi.{json,bin}. The open .blend is not saved: the build is
deterministic and the working file already carries the same timeline."""
import sys
import time
ROOT = '/Users/scott/Documents/Projects/Node/Transformers/blender/semi_build'
sys.path.insert(0, ROOT)
exec(open(ROOT + '/run.py').read())
import bpy
from smb import build, bake, export, robot_fit
t = time.time()
sc = build.full()
bake.bake(sc, step=1, warp=True)
bpy.context.scene.frame_set(0)
robot_fit.apply(sc, 0.0)             # meshes are exported in their truck shape; the morph carries the tailoring
print('built in %.1fs' % (time.time() - t))
m = export.export(sc)
print('events', len(m['events']), 'in %.1fs' % (time.time() - t))
