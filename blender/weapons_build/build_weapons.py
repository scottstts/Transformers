"""Headless build + game export of the combat weapons:

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/weapons.blend \
        --python blender/weapons_build/build_weapons.py

Rebuilds each weapon from the scripts into its own collection of
blender/weapons.blend (the axe at the origin, the sword beside it), saves the
file and writes public/models/cybertruck-axe.{json,bin} and
ferrari-f1-sword.{json,bin}. Pass `-- --no-save` to export without saving."""
import sys
import time
import importlib
import bpy

BLENDER = '/Users/scott/Documents/Projects/Node/Transformers/blender'
for p in (BLENDER + '/weapons_build', BLENDER + '/ferrari-f1_build'):
    if p not in sys.path:
        sys.path.insert(0, p)
for name in [m for m in sys.modules if m in ('wpn', 'f1b') or m.startswith(('wpn.', 'f1b.'))]:
    del sys.modules[name]
wpn = importlib.import_module('wpn')
from wpn import axe, sword, export  # noqa: E402
from f1b import kit as K  # noqa: E402

WEAPONS = [(axe, 'cybertruck-axe', 0.0), (sword, 'ferrari-f1-sword', 1.6)]

t = time.time()
for module, asset, x in WEAPONS:
    coll = K.collection(module.NAME.upper())
    K.clear_collection(coll)
    meta = module.build(coll)
    m = export.export(module.NAME, coll, asset, meta)
    # display offset only (the export reads the parts at the origin)
    for o in coll.all_objects:
        o.location.x += x
    print('%s: %d triangles, %d slots, z %.2f..%.2f' % (asset, m['triangles'], len(m['meshes']), *m['extent']))
K.purge_orphans()
if '--no-save' not in sys.argv:
    bpy.ops.wm.save_mainfile()
print('weapons built in %.1fs' % (time.time() - t))
