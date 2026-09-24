"""Headless build + game export:

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/ferrari-f1-transformer.blend \
        --python blender/ferrari-f1_build/export_game.py

Rebuilds the car, robot and mechanisms from the scripts, writes
public/models/ferrari-f1.{json,bin}. The open .blend is not saved: the build is
deterministic and the working file already carries the same timeline."""
import sys
import time
ROOT = '/Users/scott/Documents/Projects/Node/Transformers/blender/ferrari-f1_build'
sys.path.insert(0, ROOT)
exec(open(ROOT + '/run.py').read())
from f1b import build, export
t = time.time()
sc = build.full()
print('built in %.1fs' % (time.time() - t))
m = export.export(sc)
print('events', len(m['events']), 'in %.1fs' % (time.time() - t))
