"""Entry point, executed inside the connected Blender:

    exec(open('/Users/scott/Documents/Projects/Node/Transformers/blender/roadster_build/run.py').read())

Reloads the rdb package so edits on disk take effect, then exposes `rdb`.
"""
import importlib
import sys

ROOT = '/Users/scott/Documents/Projects/Node/Transformers/blender/roadster_build'
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
for _name in [m for m in sys.modules if m == 'rdb' or m.startswith('rdb.')]:
    del sys.modules[_name]
rdb = importlib.import_module('rdb')
from rdb import build as rdb_build  # noqa: E402
