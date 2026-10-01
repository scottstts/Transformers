# Commander model (Blender)

The approved commander is built by `blender/commander_build/` into
`blender/commander.blend` (collection `COMMANDER`) and exported to
`assets/commander.json` and `assets/commander.bin`.

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/commander.blend --python-exit-code 1 --python blender/commander_build/export_game.py
```

The export rebuilds in the headless process and verifies that its evaluated
geometry, shading, bone transforms and materials match the approved scene.
It stops before writing assets if those differ or a checked spec requirement
fails. It leaves the approved `.blend` and the open Blender window unchanged.

## Design choices

- Rigid parts in bone-local coordinates: metres, +X left, −Y forward, +Z up.
  There are 25 bones: the soldier's 20 names, the right-hand weapon, two side
  mantle hinges and two rear tail hinges. Energy rides `blade` beneath
  `weapon`; all other required bones retain the soldier's parent hierarchy.
- The lance stands upright in the approved carry pose. Its grip sits inside
  the right fist; both sets of foot tyres rotate around their wheel bone's
  local X axle and touch the ground in the rest pose.
- The approved head has a continuous silver forehead/crown, angular face
  armor, four black antennae, red optics and a clean symmetric black rear
  shield. The neck sits inside a separate raised collar on the chest bone.
- Every part ends with an enabled `wnormal` modifier. The head uses
  `CORNER_ANGLE`, neutral weight 50, threshold 0 and sharp-edge preservation.
  Adding this modifier was verified to leave the approved head's evaluated
  positions and corner normals exactly unchanged. Other parts retain their
  existing weighted normals. Bevels use one segment.
- Standing height including antenna tips is **6.914880 m**. The user
  explicitly approved this exception to the spec's 6.6 m maximum; export
  reports the real height without resizing the model. Footprint and energy
  radius are also measured from evaluated geometry instead of the older rig
  estimates.
- There are 15 used surface slots: the three reserved slots (`glow`, `blade`,
  `visor`) and 12 other surface classes. Blender preview materials in
  `cmd/mats.py` remain the look reference. The shadow excludes the three
  reserved slots exactly as specified.
- The shared soldier exporter now accepts the model name, material prefix,
  rig, shadow exclusions and dimensions. Default soldier export options
  preserve the soldier's encoding, record order and dimensions.

## Export report

| Tier | Triangles | Budget |
|---|---:|---:|
| LOD0 | 123,250 | 140,000 |
| LOD1 (0.24) | 29,556 | 34,000 |
| LOD2 (0.07) | 8,605 | 10,000 |
| Shadow | 8,235 | 9,000 |

25 bones, 24 debris pieces. Each non-blade bone has a positive-mass box,
using the specified 1.1 t/m³ filled-box density. Rest width is 3.774029 m.

| Dimension | Metres |
|---|---:|
| `height` | 6.9148801565 |
| `wheelRadius` | 0.47 |
| `wheelX` | 0.23 |
| `ankleUp` | 0.42 |
| `thigh` | 1.42 |
| `shin` | 1.56 |
| `upper` | 1.00 |
| `fore` | 0.95 |
| `hipZ` | 3.8048798502 |
| `stanceX` | 1.1195768386 |
| `bladeLength` | 0.86 |
| `bladeRadius` | 0.0416773305 |
| `reach` | 5.0714118779 |
| `bodyRadius` | 1.6314981310 |

`tests/commander.test.ts` decodes the actual exported binary using the game's
soldier asset decoder and checks structure, geometry, budgets, shadow bone
coverage, debris bounds/mass, dimensions, energy placement and ground contact.

Validation: all 27 tests in `tests/commander.test.ts` and
`tests/enemies.test.ts` passed. Exporting the unchanged soldier scene with the
original and parameterized exporter produced byte-identical JSON and binary;
the existing `assets/soldier.*` files were left unchanged.
