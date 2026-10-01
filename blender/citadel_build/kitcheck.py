"""Kit sheet: every module kind built alone, with triangles, coplanar findings and hygiene.

Run headless: Blender -b --factory-startup --python kitcheck.py [-- kind ...]
The raw column counts coincident faces before the compile resolves them; the other columns are
defects the compile cannot repair (flipped faces, over-shared edges, loose or degenerate data).
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ctd import hygiene
from ctd.audit import Audit
from ctd.compile import blender_precision, flatten
from ctd.geom import Writer
from ctd.kit.massing import build
from ctd.plan import make_plan


def kit_rows(kinds=None):
    plan = make_plan()
    samples = {}
    for m in plan["modules"]:
        samples.setdefault((m["kind"], m["variant"], bool(m["bays"])), m)
    rows = []
    for (kind, variant, bays), m in sorted(samples.items()):
        if kinds and kind not in kinds:
            continue
        writer = Writer()
        build(writer, m)
        writer = blender_precision(writer)
        triangles, _, owners, keys, _ = flatten(writer)
        coplanar = Audit(triangles, owners, [".".join(k) for k in keys]).run(False)
        health = hygiene.check(writer)
        classes = {"mass": 0, "artic": 0, "detail": 0}
        for (_, _, lod), buffer in writer.buffers.items():
            classes[lod] += len(buffer["faces"])
        rows.append({"kind": kind, "variant": variant, "bays": bays, "triangles": health["triangles"],
                     **classes, "raw_coplanar": coplanar["findings"], "flipped": health["flipped"],
                     "over_shared_edges": health["over_shared_edges"], "loose_vertices": health["loose_vertices"],
                     "zero_area": health["zero_area"], "below_ground": health["below_ground"],
                     "defects": health["by_mesh"]})
    return rows


def main():
    kinds = set(sys.argv[sys.argv.index("--") + 1:]) if "--" in sys.argv else None
    rows = kit_rows(kinds)
    header = f"{'module':<22}{'tris':>8}{'mass':>8}{'artic':>8}{'detail':>8}{'coplanar':>10}{'flipped':>9}{'shared':>8}{'loose':>7}"
    print(header)
    for r in rows:
        name = f"{r['kind']}{'/v' + str(r['variant']) if r['variant'] else ''}{'/bay' if r['bays'] else ''}"
        print(f"{name:<22}{r['triangles']:>8}{r['mass']:>8}{r['artic']:>8}{r['detail']:>8}"
              f"{r['raw_coplanar']:>10}{r['flipped']:>9}{r['over_shared_edges']:>8}{r['loose_vertices']:>7}")
    for r in rows:
        if r["defects"]:
            print("DEFECTS", r["kind"], json.dumps(r["defects"]))
    (ROOT / "out").mkdir(exist_ok=True)
    (ROOT / "out" / "kit_sheet.json").write_text(json.dumps(rows, indent=2) + "\n")


main()
