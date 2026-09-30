# Commander model: integration spec (Blender)

The commander is a heavy enemy that fights beside the soldiers (`docs/soldier-model.md`). Its look comes from the user's reference images. This spec covers what the game needs from the model: structure, frames, naming, sizes, budgets and the export. Anything not listed here is a free design choice.

The model is drawn and animated exactly like the soldier. Each rigid part rides one bone. The game keeps one matrix per bone and poses the rig procedurally (moves are authored in the game, not in Blender). A destroyed commander breaks into its parts as physics pieces.

## Files

- Build scripts: `blender/commander_build/`, package `cmd/`, with `run.py` (reloads the package inside a running Blender), `export_game.py` (headless build and export) and `render.py` (review shots). The layout is the same as `blender/soldier_build/`.
- Scene: `blender/commander.blend`, collection `COMMANDER`.
- Export: `public/models/commander.json` and `public/models/commander.bin`.
- Headless export:
  ```bash
  /Applications/Blender.app/Contents/MacOS/Blender -b blender/commander.blend --python blender/commander_build/export_game.py
  ```
- The export reuses `blender/soldier_build/sol/export.py`, parameterised by name, material prefix, rig module, shadow-skip slots and dims. The soldier's export output must stay byte-identical.
- A short `docs/commander-model.md` records the build's design choices, in the manner of `docs/soldier-model.md`.
- Scope: the agent touches only these files. It does not change game code under `src/`.

## Frame and units

- Metres. Authoring frame: **x = the commander's left, −y = forward, z = up**. It stands at the origin, facing −y, on the ground plane z = 0.
- A bone frame has its origin at the joint. Limbs hang along local −Z, local −Y faces forward, and local +X is the commander's left.
- Parts are modelled in their bone's frame. The build functions receive bone-local coordinates, so the export stores parts as they are. This is the soldier's convention (`sol/rig.py`).

## Skeleton

- The skeleton is data in `cmd/rig.py`: name, parent, joint position relative to the parent, and rest rotation, as in `sol/rig.py`. A Blender armature is optional and is used only for preview posing.
- **Required bones**: the soldier's 20 bones, with the same names and hierarchy:
  - centre: `pelvis` (root), `spine`, `chest`, `neck`, `head`;
  - per side: `thigh.L/.R`, `shin.L/.R`, `foot.L/.R`, `wheel.L/.R`, `upperarm.L/.R`, `forearm.L/.R`, `hand.L/.R`;
  - `blade`.
- **Extra bones** are allowed for parts that move on their own: a `weapon` bone under `hand.R`, and extra wheel bones or armour flaps if the design has them. Parts that only ride a body segment go on that segment's bone.
- At most 32 bones.
- **Rest pose**: standing straight, arms hanging slightly out from the body with a soft elbow, feet on the ground.
- **Joint placement**: each joint origin sits at the true pivot of its parts, so a rotation about it never opens a gap or pushes a part through its neighbour.

## Locomotion

- It rolls on wheeled feet, like the soldiers. The game moves it with the soldiers' rolling model and spins the wheel bones.
- Each `wheel.*` bone's local X is the axle. A tyre's centre is at the wheel bone's origin, and its outer radius touches z = 0 in the rest pose.
- Every wheel on a foot rides that foot's wheel bone. Multiple axles per foot use extra wheel bones named `wheel2.L/.R` and so on.

## Weapon

- It holds one weapon in the right hand, on the `weapon` bone (a child of `hand.R`).
- Any energy part (a blade, a beam edge) rides the `blade` bone, in material slot `blade`. The energy runs along the `blade` bone's local +Z from its origin to `bladeLength`. The game grows and dims it through that slot.
- The grip closes around the handle the way the soldier's fist closes on its hilt: finger parts are placed on a circle about the handle axis.

## Size

| Quantity | Target |
|---|---|
| Height, standing, to the top of the head | 5.8–6.6 m |
| Body footprint: the radius around the pelvis's vertical axis enclosing the feet and wheels at rest | ≤ 1.9 m |
| Reach: from the right shoulder joint to the weapon's far tip, arm straight | 5–8 m |
| Widest point, arms at rest | ≤ 4.4 m |

It fights in 14 m streets and passes arches 12 m wide and 11 m clear.

## Joint clearance

The game poses the rig through these ranges (degrees, relative to rest). Parts must not visibly pass through each other anywhere inside them. Small hidden contacts at the joints are fine.

| Joint | Range |
|---|---|
| Spine and chest | twist ±60, lean forward 35, back 20, side ±20 |
| Neck and head | yaw ±60, pitch ±35 |
| Shoulder | pitch −170…+60, abduction 0…110, twist ±60 |
| Elbow | 0…135 |
| Wrist | pitch ±60, yaw ±30 |
| Hip | pitch −95…+40, abduction 0…35 |
| Knee | 0…120 |
| Foot (ankle) | pitch ±30, roll ±15 |
| Wheels | full rotation |

## Materials

- Every material is named `commander.<slot>`. The export rejects any other material on a part.
- A slot is a surface class. The game builds one material per slot, ported from the Blender preview materials in `cmd/mats.py`, which are the look reference for the game.
- Slots with fixed meaning:
  - `glow`: light strips and lamps. Unlit; the game drives their brightness.
  - `blade`: the weapon's energy part. Unlit and additive.
  - `visor`: glass.
- These three are left out of the shadow proxy.
- All other slot names are free. Keep them to ~12 or fewer; each is one draw per LOD tier.

## Parts and geometry

- Every mesh object carries a custom property `bone` naming the bone it rides. Every triangle belongs to exactly one bone.
- There is no skinning, no vertex groups for deformation, and no shape keys. Modifiers are fine: the export evaluates them.
- Geometry quality follows the project rules:
  - clean, sophisticated hard-surface forms with no primitive look;
  - no coplanar faces (no flicker), no unintended overlaps, no detached or floating parts;
  - every part is visibly carried by its neighbour.
- A weighted-normal modifier named `wnormal` sits last on each part. The export decimates LOD1 and LOD2 ahead of it.
- Bevels use one segment. Small parts are pre-chamfered.

## Budget

| Tier | Triangles |
|---|---|
| LOD0 | ≤ 140k |
| LOD1 (collapse ratio ~0.24) | ≤ 34k |
| LOD2 (collapse ratio ~0.07) | ≤ 10k |
| Shadow proxy (LOD2 minus `glow`, `blade`, `visor`) | ≤ 9k |

Each tier's shading holds up at its distance. The game shows LOD1 from ~26 m and LOD2 from ~70 m.

## Export format

The manifest has the soldier's schema (`src/content/soldier/asset.ts`), with `version: 1` and `name: "commander"`:

- `bones`: name, parent index (−1 for the root), rest `t` (x, y, z) and `q` (x, y, z, w) relative to the parent.
- `lods`: three tiers. Each is one merged mesh record per slot: int16 quantized positions in the bone frame with the record's `min` and `max`, octahedral int16 normals, a uint8 bone index per vertex, and a uint16 index (uint32 at 65,536 vertices or more).
- `shadow`: one position-only record.
- `pieces`: per bone, the box of its parts (centre and half extents in the bone frame, `blade` parts excluded) and a mass (the box filled at 1.1 t/m³).
- `dims`:

  | Field | Meaning |
  |---|---|
  | `height` | standing height |
  | `wheelRadius`, `wheelX`, `ankleUp` | as the soldier's |
  | `thigh`, `shin`, `upper`, `fore` | segment lengths |
  | `hipZ` | pelvis joint height |
  | `stanceX` | foot centre's lateral offset |
  | `bladeLength`, `bladeRadius` | the energy part |
  | `reach` | shoulder to weapon tip, arm straight |
  | `bodyRadius` | the body footprint above |

## Workflow

1. Build a rough pass from the reference images. Render the review shots with `render.py`: front, side, back, three-quarter, the head close up, and the weapon in hand. Show them to the user and stop for feedback.
2. Refine after the user's review, then export.
3. Report the export's printout: LOD triangles, shadow triangles, bone count, piece count, dims.

## Acceptance

The game's `tests/commander.test.ts` checks the exported asset for:

- manifest `version` 1, `name` `commander`, ≤ 32 bones, all required bone names present with a valid hierarchy;
- every vertex's bone index valid, every slot named, `glow`, `blade` and `visor` absent from the shadow proxy;
- three LOD tiers and a shadow proxy within the budget;
- a piece for every bone that has a non-blade part, each with a positive mass;
- every `dims` field present; `height`, `reach` and `bodyRadius` inside the size table;
- the wheels touching z = 0 in the rest pose (within 1 cm), with the rest pose's lowest point on the wheels.
