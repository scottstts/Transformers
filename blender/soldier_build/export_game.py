"""Headless build + game export of the enemy soldier:

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/soldier.blend \
        --python blender/soldier_build/export_game.py

Rebuilds the SOLDIER collection from the scripts, saves the .blend (pass
`-- --no-save` to skip) and writes public/models/soldier.{json,bin}."""
import sys
import time
import bpy
ROOT = '/Users/scott/Documents/Projects/Node/Transformers/blender/soldier_build'
sys.path.insert(0, ROOT)
exec(open(ROOT + '/run.py').read())
from sol import build, export  # noqa: E402
t = time.time()
coll = build.build()
m = export.export(coll)
print('soldier: LOD triangles %s, shadow %d, %d bones, %d pieces in %.1fs' % (
    [l['triangles'] for l in m['lods']], m['shadow']['triangles'], len(m['bones']), len(m['pieces']), time.time() - t))
if '--no-save' not in sys.argv:
    bpy.ops.wm.save_mainfile()
