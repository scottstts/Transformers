"""Headless build + game export:

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/impala.blend \
        --python blender/impala_build/export_game.py

Reads the baked timeline of the open .blend (frame 0 the car, frame 240 the robot),
reduces the authoring meshes to the game budget and writes assets/impala.{json,bin}.
The .blend is not saved. IMPALA_TRI_BUDGET=0 exports the authoring density."""
import sys
import time
sys.path.insert(0, '/Users/scott/Documents/Projects/Node/Transformers/blender')
from impala_build import export
t = time.time()
m = export.export()
print('events', len(m['events']), 'in %.1fs' % (time.time() - t))
