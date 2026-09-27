# Semi character

The Tesla Semi tractor with a 28 ft pup van, its robot (a seven-metre heavy, a head taller than the Cybertruck's) and the transformation are authored procedurally in Blender (`blender/semi_build/`, package `smb`). They are exported as `public/models/semi.{json,bin}` in the shared container and runtime (`src/content/transformer/`). Export with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/semi.blend --python blender/semi_build/export_game.py
```

The export rebuilds the scene from the scripts and does not save the `.blend`; the working file already carries the baked 9 s timeline for scrubbing.

## Transformation (`smb/choreo.py`)

- **Map first, hide only when it won't map.** Truck parts become robot features where they can: the front clip (nose, light bar, hood, fenders, windshield, front wheels) is the chest; the cab's top halves the shoulder pylons; the doors the forearm shields; quarters and skirts the thigh plates; the back wall the back plates; frame rails, fifth wheel and tandem the shins; the rear crossmember and lamps the heels.
- **The robot rises like a knight standing** (`motion.py`): upright in the cab with its legs laid back along the frame, it kneels up and stands.
- **The van is a mechanism of its own.** It unhitches, puts down its front jacks, rolls back clear of the kneeling cab, telescopes its five sections rear-first, retracts its bogie into the rear section (the wheels lift inside it and narrow before they could clash with the second-to-last pair, then drop and widen again), jacks itself up on its rear jacks, rolls in and locks onto the robot's back as the backpack; the jacks retract last.
- **Carriers keep travelling panels attached:** telescoping rams from a bone (`Strut`), and jack outriggers from an assembly down to the ground, with castor feet (`Jack`).
- **Panel tailoring** (`robot_fit.py`): nested cab panels and the van change their envelope between T 0.30 and 0.78 through editable shape keys (the truck's Basis is never changed). This is a modelling allowance for panels that must pack tighter on the robot than they sit on the truck.

## Export (`smb/export.py`)

Nodes as for the F1 (ferrari-f1.md), with three additions the runtime supports generically (`TransformerOptions`, `format.ts`):

- **World-hosted van.** `asm:van0` has no parent while it drives its own mechanism (parent -1, tracks in the car frame); the van's jacks are `part:` nodes on their section. The runtime `carried` option (`asm:van0` → `bone:chest`) keeps its baked place on the chest once the skeleton is live, so the backpack follows the gait. The Blender follow window is T 0.84–0.88, before the gait blend starts at 0.9.
- **Morph targets for the tailoring.** A shape key can't be a rigid node or a scale (the clip tapers, the pylons shear), so a tailored mesh stores a second position and normal set (`morphPosition`, `morphNormal`, quantized over their own box) and the manifest one per-frame weight (`morph`, `robot_fit.amount` of the warped T). Positions are exported in the truck shape. Normals of the second shape go through the tailoring's Jacobian; the van's wheels shift rigidly. At runtime each tailored mesh uses a per-slot clone of its material whose position node blends the two shapes by one model uniform (normals via `normalLocal`, shadows included). Three's built-in morph targets were not used: they make a uniform and a pipeline per mesh.
- **Trailer articulation.** The runtime `trailer` option swings `asm:van0` about the kingpin by `model.articulation` in car form (faded out with the car state as it transforms).

## Runtime choices

- **Rig** as the F1's: wide stance (`stanceX` 1.04 against 0.64 hips), feet planted 5 cm ahead of the hips, knee pole the pelvis front (`kneePoleUp` 0). The robot stands 0.4 m behind the car origin (`robotF` −0.4).
- **Soles:** every node the foot bones carry except carrier struts (the foot, the toe block and the heel assembly).
- **Profile** (`SEMI_PROFILE`):
  - drive: 4.58 m wheelbase (front axle to tandem centre), 0.52 m tyres, 31 / 40 m/s (Shift), 5.5 / 8 m/s² drive, 11 m/s² braking, all drive on the tandem, a big steering lock, heavy pitch and roll about a 1.1 m pivot;
  - trailer: kingpin 2.3 m behind the origin, 6.08 m to the van's axle, ±0.19 rad (car-handling.md);
  - collision: circles along the tractor and the van (movement.ts `carBody` and `trailer.circles`), not one radius;
  - robot: walk 4.5 m/s with 3.3 m steps, run 17 m/s with 5.6 m steps. The walk sits at Froude 0.5 like the others' (it walked at 5.9 m/s, twice the natural rate for 4.2 m hips, with a catwalk hip swing); its pelvis and chest are carried nearly as one block over a 9 cm weight shift, with a half vault. The run's stride scales with the legs (a third longer than the pickup's) and its speed with their square root, so the cadence is slower, as a big body's is. The sole's toe edge is 1.02 m ahead of the ankle (measured; modelled at 0.95 m, the toe-off drove the sole 2–4 cm into the ground). The wide stand is drawn in under the hips while it moves (`track` 0.72 / 0.64). The torso is carried upright (`lean` 0.9 / 0.45° per m/s) and the run stands tall: short support (26 % of the cycle), the foot landing close under the body (`reach` 0.38) and straight support legs (`kneeFloor` 8°), no run crouch. With the truck's defaults and a 6.1 m stride the long contact sweep sank the pelvis 0.8 m below the stand, a crouching run; now it rides about 0.13 m below;
  - camera: the car framed about the middle of the rig (`carAhead` −3.1 m) from 15 m; the robot from 16.5 m at a 5.2 m focus. The opening broadside keeps the whole 14 m rig in frame (`carHalfLength`).
- **Materials** (`materials.ts`), one per `smb/mats.py` slot plus the gun's `glow`: pearl white multi-coat with faint orange peel; piano-black trim; grained black plastic; the van's painted aluminium with road film low down; brushed aluminium and steel; frame paint with grime gathered low; scrubbed truck rubber. Emissives are driven by `SEMI_LIGHTS`: `head` (the light bar, the chest's in robot form, dimmer there), `tail` (brighter braking), `marker` (the ambers, blinking like hazards while it transforms) and `eyes`.

## Effects (`effects.ts`)

- The eyes come on as the head rises out of the chest (the neck's second stroke).
- Tyres: ten tyres as eight contacts (duals are one node). Their dust, grit and tracks use 0.29 m singles and 0.6 m duals. The van's tyres are measured from their own motion (`Tyres` for `trailer` wheels): heading along the van, velocity from last frame, only sideways slide counts.
- Touchdowns during the transformation, from the posed soles, as on the F1.

## Audio (`audio/`)

Everything must sound like a recording of the real thing.

- **Transformation:** the shared machine at its biggest (`SEMI_MACHINE`): slower, lower drives and pump than the pickup's, a long steel-and-aluminium body with low, well-spaced modes, heard from further off.
- **Air brakes:** a broadband rush of air through the relay valve, fixed filters and levels only. They vent as the truck comes to rest from above 2 m/s, as a transformation starts (either way) and as the truck settles back onto its tyres, never twice within 1.5 s.
- **Drive:** three motors as one deep hum and a faint filtered whine following the driven wheels, silent at rest.
- **Footfall** and **tyres:** the shared voices, the roster's heaviest tuning.
- **The gun** (`gun.ts`, `gun-bank.ts`, generated `gun-models.ts`): see combat.md.
