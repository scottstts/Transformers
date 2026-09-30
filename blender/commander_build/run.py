"""Reload the commander package in the live Blender process, then build.
GROUPS may be passed in exec globals to build a subset."""
import importlib
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/scott/Documents/Projects/Node/Transformers/blender/commander_build'
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
# cmd deliberately replaces Python's debugger helper only in this build process.
for name in list(sys.modules):
    if name == 'cmd' or name.startswith('cmd.'):
        del sys.modules[name]
commander = importlib.import_module('cmd.build')
commander.build(globals().get('GROUPS', commander.GROUPS))
