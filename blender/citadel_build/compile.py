"""Build and compile the citadel's exposed geometry outside the live UI.

Run: Blender -b --factory-startup --python compile.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ctd.checks import geometry_stats
from ctd.compile import exposed, save_writer, source_fingerprint
from ctd.districts import emit
from ctd.geom import Writer
from ctd.kit import architecture, foundations, ramps
from ctd.kit.industry import pipe_network
from ctd.plan import make_plan, write_plan

SOURCE_FINGERPRINT = source_fingerprint()
PLAN, WRITER = make_plan(), Writer()
foundations.floors(WRITER, PLAN)
ramps.build(WRITER, PLAN)
foundations.walls(WRITER, PLAN)
emit(WRITER, PLAN)
architecture.build(WRITER, PLAN)
pipe_network(WRITER, PLAN)
passes = []
for pass_index in range(1, 6):
    WRITER, report = exposed(WRITER, pass_index, PLAN)
    # Keep the report readable: the worst offenders per pass, not every pair.
    report["groups_total"] = len(report.get("groups", []))
    report["groups"] = report.get("groups", [])[:40]
    passes.append(report)
    if report["passed"]:
        break
(ROOT / "out").mkdir(exist_ok=True)
save_writer(WRITER, ROOT / "out" / "compiled_geometry.npz")
write_plan(PLAN, ROOT / "out")
metadata = {"fingerprint": SOURCE_FINGERPRINT, "passes": passes,
            "clean_at_blender_precision": passes[-1]["passed"], "geometry": geometry_stats(WRITER)}
(ROOT / "out" / "compile_report.json").write_text(json.dumps(metadata, indent=2) + "\n")
print("CTD_COMPILE done", metadata["clean_at_blender_precision"], metadata["geometry"], flush=True)
