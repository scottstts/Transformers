"""Entry point. Execute inside Blender:

    exec(open('/.../blender/semi_build/run.py').read())

Reloads the smb package so edits on disk take effect."""
import importlib
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/scott/Documents/Projects/Node/Transformers/blender/semi_build'
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
for name in [m for m in sys.modules if m == 'smb' or m.startswith('smb.')]:
    del sys.modules[name]
smb = importlib.import_module('smb')
