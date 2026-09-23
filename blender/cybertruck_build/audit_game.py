"""Headless audit: static poses and the transition sweep + support gate.

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/cybertruck-transformer.blend \\
        --python blender/cybertruck_build/audit_game.py
"""
import sys
sys.path.insert(0, "/Users/scott/Documents/Projects/Node/Transformers/blender/cybertruck_build")
exec(open('/Users/scott/Documents/Projects/Node/Transformers/blender/cybertruck_build/run.py').read())
from ctb import build, bake
import bpy
sc = build.blockout()
build.show_T(0.0)
build.audit_pose('T0', islands=True)
build.show_T(1.0)
build.audit_pose('T1', islands=True)
objs, W, N, lift = bake.object_worlds(sc, 1.0)
low = {}
for o, M in objs.items():
    z = min((M @ v.co).z for v in o.data.vertices) if len(o.data.vertices) else 9
    low[o.name] = z
print('T1 lowest parts:', sorted(low.items(), key=lambda kv: kv[1])[:6])
build.transition_report(int(sys.argv[-1]) if sys.argv[-1].isdigit() else 80)
