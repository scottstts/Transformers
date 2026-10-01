"""One-command verification of the citadel build. Prints a PASS/FAIL table and writes out/verify.json.

  Blender -b --factory-startup --python-exit-code 1 --python verify.py
      audits the compiled geometry (out/compiled_geometry.npz) against the current sources.

  Blender -b ../citadel.blend --python-exit-code 1 --python verify.py -- --scene
      audits the meshes stored in citadel.blend, exactly as the live window shows them.

The sections: layout and routes (plan), freshness of the compiled geometry, coincident faces within
15 mm (coplanar), mesh hygiene (flipped, degenerate, loose, below ground) and the triangle budgets.
"""

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ctd import hygiene
from ctd.audit import CLIPPABLE, SEPARATION, Audit, verify_auditor
from ctd import geocheck
from ctd.checks import geometry_stats, plan_checks
from ctd.compile import flatten, load_writer, source_fingerprint
from ctd.plan import make_plan

BUDGETS = (("mass", 1_000_000), ("artic", 1_300_000), ("detail", 1_000_000))
BUCKET_LIMIT, SPIRE_LIMIT, MESH_LIMIT = 350_000, 120_000, 260


def kilo(n):
    return f"{n / 1000:.0f}k"


def section(rows, name, ok, line):
    rows.append({"section": name, "passed": bool(ok), "summary": line})


def main():
    started = time.monotonic()
    use_scene = "--scene" in sys.argv
    out = ROOT / "out"
    rows, details = [], {}
    verify_auditor()

    compiled, meta = out / "compiled_geometry.npz", out / "compile_report.json"
    fingerprint = source_fingerprint()
    report = json.loads(meta.read_text()) if meta.exists() else {}
    fresh = compiled.exists() and report.get("fingerprint") == fingerprint
    clean = bool(report.get("clean_at_blender_precision"))
    section(rows, "compile", fresh and clean,
            f"compiled geometry matches the sources ({fingerprint[:8]}), {len(report.get('passes', []))} pass(es)"
            if fresh and clean else
            "compiled geometry is missing or stale: run `Blender -b --factory-startup --python compile.py`"
            if not fresh else
            f"compiled geometry is current but the compile did not converge in {len(report['passes'])} passes: "
            f"{report['passes'][-1]['coplanar_pairs'] + report['passes'][-1]['near_coincident_pairs']} coincident pairs left")
    if not fresh:
        return finish(rows, details, started)
    writer = load_writer(compiled)

    geometry = geometry_stats(writer)
    plan = make_plan()
    plan_report = plan_checks(plan, geometry)
    details["plan"] = plan_report
    robot, soldier = plan_report["routes"]["robot"], plan_report["routes"]["soldier"]
    section(rows, "layout", not plan_report["errors"],
            f"{plan_report['gate_count']} gates, {plan_report['spawn_count']} spawns, garrison {plan_report['garrison']}; "
            f"robot/soldier unreachable cells {robot['unreachable_cells']}/{soldier['unreachable_cells']}; "
            f"unguarded edges {plan_report['unguarded_height_edges']}; floor disagreements "
            f"{plan_report['floor_overlap_disagreements']}; unsupported bases {len(plan_report['supports']['floating_bases'])}"
            if not plan_report["errors"] else "; ".join(plan_report["errors"]))

    if use_scene:
        from ctd import blender_io
        triangles, owners, names = blender_io.scene_triangles()
        source = "citadel.blend scene"
    else:
        triangles, _, owners, keys, _ = flatten(writer)
        names = [".".join(k) for k in keys]
        source = "compiled geometry"
    ignore = geocheck.buried_mask(plan, triangles)
    audit = Audit(triangles, owners, names, ignore=ignore).run()
    details["coplanar"] = {k: v for k, v in audit.items() if k != "groups"}
    details["coplanar"]["groups"] = audit["groups"][:40]
    details["coplanar"]["gating_groups"] = [g for g in audit["groups"] if g["kind"] in CLIPPABLE][:40]
    section(rows, "coplanar", audit["passed"],
            f"0 coincident or near-coincident faces within {SEPARATION * 1000:.0f} mm, 0 zero-area, over "
            f"{len(triangles):,} triangles in {len(names)} meshes ({source}; {audit['broad_phase_candidates']:,} candidate "
            f"pairs tested, {audit['buried_pairs_excluded']:,} pairs wholly below ground excluded); "
            f"{audit['advisory_shallow_pairs']} shallow-angle pairs (advisory, not gated)"
            if audit["passed"] else
            f"{audit['findings']} face pairs: {audit['coplanar_pairs']} coplanar, {audit['near_coincident_pairs']} within "
            f"{SEPARATION * 1000:.0f} mm, {audit['crossing_pairs']} crossing, {audit['wedge_pairs']} wedge; "
            f"{audit['zero_area_faces']} zero-area ({source}); worst coincident: "
            + "; ".join(f"{'/'.join(o.split('.', 1)[1] for o in g['objects'])} x{g['count']} at "
                        f"{[round(v) for v in g['examples'][0]['at']]}" for g in details["coplanar"]["gating_groups"][:3]))

    swaps = (report.get("passes") or [{}])[0].get("material_swaps")
    if swaps:
        details["material_swaps"] = swaps
        top = "; ".join(f"{s['owner'].split('.', 1)[1]} over {s['covered'].split('.', 1)[1]} {s['area_m2']} m2" for s in swaps["top"][:3])
        section(rows, "swaps", True, f"{swaps['pairs']} exact same-plane overlaps between different materials were "
                f"resolved by the compile's tie-break ({swaps['area_m2']} m2, advisory); largest: {top}")

    health = hygiene.check(writer)
    details["hygiene"] = health
    bad = health["flipped"] + health["zero_area"] + health["loose_vertices"] + health["below_ground"]
    section(rows, "hygiene", bad == 0,
            f"{health['flipped']} flipped ({health['flipped_slivers']} sub-cm2 slivers ignored), {health['zero_area']} zero-area, {health['loose_vertices']} loose vertices, "
            f"{health['below_ground']} below y=0 over {health['triangles']:,} triangles; "
            f"{health['over_shared_edges']} edges shared by 3+ faces (info)")

    budget = []
    for name, limit in BUDGETS:
        count = geometry["by_class"].get(name, 0)
        budget.append((f"{name} {kilo(count)}/{kilo(limit)}", count <= limit))
    worst = max(((n, c) for n, c in geometry["by_bucket"].items() if n != "spire"), key=lambda p: p[1])
    spire = geometry["by_bucket"].get("spire", 0)
    budget.append((f"bucket {worst[0]} {kilo(worst[1])}/{kilo(BUCKET_LIMIT)}", worst[1] <= BUCKET_LIMIT))
    budget.append((f"spire {kilo(spire)}/{kilo(SPIRE_LIMIT)}", spire <= SPIRE_LIMIT))
    budget.append((f"meshes {geometry['meshes']}/{MESH_LIMIT}", geometry["meshes"] <= MESH_LIMIT))
    section(rows, "budgets", all(ok for _, ok in budget), ", ".join(text for text, _ in budget))
    return finish(rows, details, started)


def finish(rows, details, started):
    ok = all(r["passed"] for r in rows)
    lines = [f"  {'PASS' if r['passed'] else 'FAIL'}  {r['section']:<9}{r['summary']}" for r in rows]
    text = "\n".join(["CITADEL VERIFY"] + lines + [f"  {'CLEAR' if ok else 'NOT CLEAR'} in {time.monotonic() - started:.0f} s"])
    print(text, flush=True)
    out = ROOT / "out"
    out.mkdir(exist_ok=True)
    (out / "verify.json").write_text(json.dumps({"passed": ok, "sections": rows, **details}, indent=2, default=float) + "\n")
    (out / "verify.txt").write_text(text + "\n")
    if not ok:
        raise RuntimeError("citadel verification failed")


main()
