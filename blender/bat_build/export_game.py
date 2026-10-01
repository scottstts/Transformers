"""Headless build + game export:

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/bat.blend \
        --python blender/bat_build/export_game.py

Rebuilds the Tumbler, robot and mechanisms from the scripts, bakes the
timeline (the density warp) and writes assets/bat.{json,bin}. The open
.blend is not saved: the build is deterministic and the working file already
carries the same timeline."""
import sys
import time
ROOT = '/Users/scott/Documents/Projects/Node/Transformers/blender/bat_build'
sys.path.insert(0, ROOT)
exec(open(ROOT + '/run.py').read())
import bpy
from btb import build, bake, export
t = time.time()
sc = build.full()
bake.bake(sc, step=1, warp=True)
bpy.context.scene.frame_set(0)
print('built in %.1fs' % (time.time() - t))
m = export.export(sc)
print('events', len(m['events']), 'in %.1fs' % (time.time() - t))
