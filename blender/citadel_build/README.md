# Halcyon Citadel — Blender build

This directory is exclusively the procedural Blender build. Do not read, edit,
export to, or port anything into the game without Scott's explicit approval.

Operating boundary (Scott's instruction, retained verbatim):

> tasks/citadel.md is your task, but ONLY the part about blender build, ref_images/citadel_ref_layout.png is a reference layout--do NOT treat this as a precise floor plan, it is for a rough structural layout guidance only
>
> now blender/citadel.blend is open, you build it in blender/citadel_build/
>
> I need to stress this: this is a PURE blender build, you have the specs and context, just build it, you do NOT need to reference the game code, every file i mentioned here is what you need to build this out, again do NOT read any code in the game, they are irrelevant
>
> as you build i want you to sync your builds periodically in the blender window i have opened here so i can view it. do NOT attempt to port it or go anything beyond blender until i give explicit approval on the build
>
> FOR COMPACTION: THE ABOVE INSTRUCTION SHOULD BE INCLUDED IN FULL AND EXPLICITLY FOR EVERY COMPACTION, AND BE TREATED AS THE OPERATING BOUNDARY THROUGHOUT.
>
> now start

The build follows sections 1–11 of `tasks/citadel.md`. Coordinates inside the package are
fort-frame metres `(x, height, z)`; `blender_io.py` alone maps them to Blender `(x, -z, height)`
and imports `bpy`. All source changes use native file editing tools.

## Pipeline

Every run writes its reports and caches to `out/`, which is created on demand and holds only disposable output.

| Step | Command | Result |
|---|---|---|
| Kit sheet | `Blender -b --factory-startup --python kitcheck.py [-- kind ...]` | each module alone: triangles per class, coincident faces, flipped faces, shared edges (`out/kit_sheet.json`) |
| Compile | `Blender -b --factory-startup --python compile.py` | builds the geometry, then audits and clips faces that lie on top of each other, up to 5 passes (`out/compiled_geometry.npz`, `out/compile_report.json`). About 8 minutes. |
| Sync | in the live Blender: `runpy.run_path(".../run.py", init_globals={...})` | loads the compiled geometry, uploads it, saves `citadel.blend` (seconds). Globals: `RAW` (skip the compile), `FORCE_COMPILED`, `GROUPS`, `VIEW`, `SAVE`. |
| Verify | `Blender -b --factory-startup --python-exit-code 1 --python verify.py [-- --scene]` | one PASS/FAIL table: layout and routes, compile freshness, coincident faces, material swaps, hygiene, budgets (`out/verify.json`, `out/verify.txt`). `--scene` audits the meshes stored in `citadel.blend`. |
| Export | `Blender -b blender/citadel.blend --python-exit-code 1 --python blender/citadel_build/export_game.py` (from the repo root) | `assets/citadel.glb` (the meshes in `citadel.blend`, packed losslessly by `tools/citadel-pack.mjs`) and `assets/citadel.plan.json`. The .blend is not saved. |

## Game export

- One glTF node per `bucket × slot × class`, in the fort frame (glTF +Y up equals `(x, height, z)`), with identity transforms.
- The game reads the node extras `ctd_bucket`, `ctd_slot`, `ctd_lod` and `ctd_triangles`. It never reads the node name, because three strips the dots from it.
- Each vertex has a float position and the custom split normal, and nothing else: no UVs, colours or materials. The game supplies a world-space material for each slot.
- `EXT_meshopt_compression` with no quantisation, decoded by GLTFLoader's `MeshoptDecoder`. Blender's own meshopt option quantises positions to 0.25 m over the citadel's extent, so it is not used.
- The glTF exporter drops exact duplicate triangles (about 500 in all). Corners whose custom normal has zero length are written as +Y.

## Checks

- **Coincident faces** (`ctd/audit.py`): two faces whose planes lie within 15 mm over their
  overlap are a finding. Four kinds: `coplanar`, `near_coincident` (clipped by the compile and
  gating), `crossing` and `wedge` (shallow-angle pairs within 4°, advisory). Pairs where both faces are
  wholly below the ground surface are excluded (`ctd/geocheck.py: buried_mask`).
- **Material swaps** (`compile_report.json: material_swaps`): exact same-plane overlaps between
  two different materials are resolved by a tie-break, and each one is recorded. Review this list
  when a doorway or gate shows a patch of the wrong material.
- **Hygiene** (`ctd/hygiene.py`): flipped faces (winding against authored normals), degenerate
  and loose geometry, edges shared by three or more faces.
- **Geometry against the plan** (`ctd/geocheck.py`): `floor_agreement` and `overhead` implement the
  brief's floor and clearance checks on the compiled triangles. They are not yet part of `verify.py`.
- **Origin tracing**: set `Writer.trace = True` before building and `writer.origins` names the
  generator that emitted every triangle.

## Open items

- The compile leaves about 135 residual near-coincident pairs after 5 passes (listed in
  `out/verify.json: coplanar.gating_groups`).
- `geocheck.overhead` flags the cistern pipes: the plan gives them no collider capsules.
- The G-main gate dressing sits 4 m in front of the barbican's raked face.
