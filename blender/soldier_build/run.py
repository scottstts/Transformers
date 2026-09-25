"""Entry point. Execute inside Blender:

    exec(open('/.../blender/soldier_build/run.py').read())

Reloads the sol (and shared f1b) packages so edits on disk take effect."""
import importlib
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/scott/Documents/Projects/Node/Transformers/blender/soldier_build'
F1B = os.path.join(os.path.dirname(ROOT), 'ferrari-f1_build')
for p in (ROOT, F1B):
    if p not in sys.path:
        sys.path.insert(0, p)
for name in [m for m in sys.modules if m in ('sol', 'f1b') or m.startswith(('sol.', 'f1b.'))]:
    del sys.modules[name]
sol = importlib.import_module('sol')
