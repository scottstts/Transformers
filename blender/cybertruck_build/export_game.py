"""Headless build + game export:

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/cybertruck-transformer.blend \
        --python blender/cybertruck_build/export_game.py

Rebuilds the car, robot and mechanisms from the scripts, writes
public/models/cybertruck.{json,bin}, bakes the timeline and saves a scrubbable
copy as blender/cybertruck-transformer-baked.blend."""
import sys
import time
sys.path.insert(0, "/Users/scott/Documents/Projects/Node/Transformers/blender/cybertruck_build")
exec(open('/Users/scott/Documents/Projects/Node/Transformers/blender/cybertruck_build/run.py').read())
from ctb import build, export
t = time.time()
sc = build.blockout()
print('built in %.1fs' % (time.time() - t))
m = export.export(sc)
print('events', len(m['events']))
from ctb import bake
bake.bake(sc, step=1)
import bpy
bpy.ops.wm.save_as_mainfile(filepath='/Users/scott/Documents/Projects/Node/Transformers/blender/cybertruck-transformer-baked.blend', copy=True)
print('saved baked blend')
