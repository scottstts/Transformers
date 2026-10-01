"""Run in the existing Blender: procedural plan → pure buffers → Blender upload.

Globals read from the caller: GROUPS (build subset), RAW (skip the compiled geometry), VIEW (a view name),
SAVE (write citadel.blend, default True). Verify afterwards with verify.py.
"""

import importlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
for module_name in list(sys.modules):
    if module_name == "ctd" or module_name.startswith("ctd."):
        del sys.modules[module_name]

from ctd import blender_io
from ctd.districts import emit
from ctd.geom import Writer
from ctd.kit import architecture, foundations, ramps
from ctd.kit.industry import pipe_network
from ctd.plan import make_plan, write_plan
from ctd.checks import geometry_stats
from ctd.compile import load_writer, source_fingerprint

GROUPS = globals().get("GROUPS", {"floors", "ramps", "walls", "landmarks"})
PLAN = make_plan()
WRITER = Writer()
blender_io.bootstrap()
compiled = ROOT / "out" / "compiled_geometry.npz"
metadata = ROOT / "out" / "compile_report.json"
ready = (compiled.exists() and metadata.exists()
         and json.loads(metadata.read_text()).get("clean_at_blender_precision", False)
         and json.loads(metadata.read_text())["fingerprint"] == source_fingerprint())
force = globals().get("FORCE_COMPILED", False) and compiled.exists()
if (ready or force) and not globals().get("RAW", False):
    WRITER = load_writer(compiled)
    print("CTD_BUILD using exposed geometry" + ("" if ready else " (forced: not current or not yet clean)"), flush=True)
else:
    if "floors" in GROUPS:
        foundations.floors(WRITER, PLAN)
    if "ramps" in GROUPS:
        ramps.build(WRITER, PLAN)
    if "walls" in GROUPS:
        foundations.walls(WRITER, PLAN)
    emit(WRITER, PLAN, GROUPS)
    if globals().get("FABRICATION", True):
        architecture.build(WRITER, PLAN)
        pipe_network(WRITER, PLAN)
    print("CTD_BUILD raw geometry; compile.py resolves its planar interfaces", flush=True)
OBJECTS = blender_io.upload(WRITER)
write_plan(PLAN, ROOT / "out")
(ROOT / "out" / "geometry_stats.json").write_text(json.dumps(geometry_stats(WRITER), indent=2) + "\n")
if globals().get("VIEW"):
    blender_io.view(VIEW)
if globals().get("SAVE", True):
    blender_io.save(ROOT.parent / "citadel.blend")
print({"phase": "Fabrication", "modules": len(PLAN["modules"]), "floor_pieces": len(PLAN["floor"]),
       "gates": len(PLAN["gates"]), "spawns": len(PLAN["spawns"]), **WRITER.counts()})
