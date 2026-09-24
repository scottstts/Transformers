"""Entry point. Execute inside Blender:

    exec(open('/.../blender/ferrari-f1_build/run.py').read())

Reloads the f1b package so edits on disk take effect."""
import importlib
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/scott/Documents/Projects/Node/Transformers/blender/ferrari-f1_build'
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
for name in [m for m in sys.modules if m == 'f1b' or m.startswith('f1b.')]:
    del sys.modules[name]
f1b = importlib.import_module('f1b')
