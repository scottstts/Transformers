"""Game export:

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/roadster.blend \
        --python blender/roadster_build/export_game.py

or, in the connected Blender, exec this file. Reads the baked timeline of the open
.blend (frame 0 the car, frame 270 the stand) and writes assets/roadster.{json,bin}
at authoring density. The .blend is not saved, so a headless run exports the file as
last saved."""
import sys
import time
ROOT = '/Users/scott/Documents/Projects/Node/Transformers/blender/roadster_build'
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
exec(open(ROOT + '/run.py').read())
from rdb import export
t = time.time()
m = export.export()
print('events', len(m['events']), 'in %.1fs' % (time.time() - t))
