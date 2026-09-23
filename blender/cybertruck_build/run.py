"""Entry point. Execute inside Blender:

    exec(open('/.../blender/cybertruck_build/run.py').read())

Reloads the ctb package so edits on disk take effect, then runs `TASK`
(set in the calling namespace, default 'car')."""
import importlib
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/scott/Documents/Projects/Node/Transformers/blender/cybertruck_build'
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
for name in [m for m in sys.modules if m == 'ctb' or m.startswith('ctb.')]:
    del sys.modules[name]
ctb = importlib.import_module('ctb')
