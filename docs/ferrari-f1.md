# Ferrari F1 character

The SF-25-style car, its robot and the transformation are authored procedurally in Blender (`blender/ferrari-f1_build/`, package `f1b`). They are exported as `public/models/ferrari-f1.{json,bin}`, in the same container and runtime as the Cybertruck (`src/content/transformer/`). Export with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/ferrari-f1-transformer.blend --python blender/ferrari-f1_build/export_game.py
```

The export rebuilds the scene from the scripts (they reproduce the working `.blend` exactly) and does not save the `.blend`; the working file already carries the baked timeline for scrubbing.

## Export (`f1b/export.py`)

- **Nodes:**
  - Bones carry their fixed structure.
  - Robot parts that move on their bone are `part:` nodes: the stowed armour (`stow.py`) and every stage of the carrier struts (`carrier.py`). Their per-frame local transform is relative to that bone.
  - Car assemblies are `asm:` nodes on their host bone or assembly.
  - Wheels are hub-centred `wheel:` nodes on their corner assembly. The hub is the wheel object's origin.

  The exporter fails if a rendered mesh is in no node or in two nodes.
- **Playback time:** the Blender timeline is baked through the density warp (`bake.density_warp`), which evens out motion density. Frame f of the asset is the pose at T = warp[f], so the game plays the same pacing. Event times are mapped into playback time, and the game only ever sees playback time.
- **Ground contact:** the game's lift ignores the carrier struts. They carry car parts, never the machine's weight. In the build a retracted stage stack can hang below a sole or the floor (see below), and the Blender bake lets it touch the ground. In game the soles and tyres do.
- **Events:**
  - every assembly and stow step (hinge or slide);
  - carrier strokes, from windows where a strut's span changes;
  - skeleton actuation windows, from the joint travel of the bone groups (`rig:rise`, `spine`, `legs`, `arms`, `neck`, `curl`).

  The robot sits up and then rises, so `rig:rise` has two windows.
- **Rig block:** besides the Cybertruck's dims it carries:
  - `stanceX`: the feet stand wider than the hips;
  - `footF`: the feet plant just behind the hips;
  - `kneePoleUp = 1`: the knee pole is the pelvis front blended with pelvis up, as in `motion.world`.

## Runtime choices

- **Live rig handover** (shared rig):
  - Gait channels for spine, chest, neck and head act on top of the exported stand, because the racer's stand leans its spine 8° and levels its head.
  - The leg IK takes its hinge axis from the leg plane. It is identical to the old pole-projection frame whenever the thigh does not pass the pole, and never flips the twist when it does.
  - Tests assert the TypeScript stand reproduces the baked T = 1 pose, and that the soles stay on the ground through the 0.9–1 blend.
- **Soles:** every node the foot bones carry except carrier struts: the foot and toe structure, the sole platform and flaps, and the wing halves and nose tip that dock on the foot.
- **Profile** (`F1_PROFILE`):
  - drive: 3.6 m wheelbase, 0.36 m rolling radius, 58 / 80 m/s top speed (Shift), 11 / 15 m/s² drive, 34 m/s² braking;
  - handling: rear drive, grip 1.45 plus downforce (+75 % at 50 m/s), a small steering lock, so its drifts hold shallower angles than the truck's (car-handling.md);
  - chassis: a stiff low car (a third of the truck's pitch and roll) pivoting at 0.3 m;
  - robot: walk 3.2 m/s, run 7.8 m/s; its hips are two thirds as high as the truck robot's, so the gait style scales stride, lift, sway and jump crouch down, swings the arms and hips a little more and rolls on a longer sole (heel 0.43, toe 0.78 m from the ankle; the wing halves dock on the foot);
  - camera: 7.2 m behind the car and 10.2 m from the robot.
- **Materials** (`materials.ts`), one per `f1b/mats.py` slot:
  - Paint is clearcoated, with faint orange peel in the coat.
  - Carbon is a 3 mm 2×2 twill on a sharpened three-plane projection of the part. It fades to its mean tone once a tow is under a pixel, so there is no moiré at driving distance. Lacquered carbon has a clearcoat; matte carbon does not.
  - Emissives: `lightRed` (the rain light, heel lights in robot form), `eye`, and `core`, driven by `F1_LIGHTS`.

## Effects (`effects.ts`)

- No thrusters: the robot sits up and rises on its own legs.
- **Touchdowns:** during the transformation, a foot that lifts clear (10 cm) and comes back down (2 cm) lands with a footfall and dust. This is read from the posed soles, so it holds in both directions.
- **Rain light:** flashes at 4 Hz while the car harvests energy (lift-off or braking above 5 m/s), as on the real car.
- **Eyes:** come on as the helmet settles onto the neck (the `stow:R.head.helmet` window).
- **Tyres:** dust, grit and tracks use the real tread widths, 305 mm front and 405 mm rear.
- **ERS dash:** the fourth fighting move sets `F1Effects.rev`, which drives the power unit in robot form (its start, a run through the gears, its run-down) and strobes the rain light as in a real ERS deployment (combat.md). The special, Red Line, owns `rev` while it plays: it free-revs the power unit against its limiter (`neutral` rpm: the ignition cut stutters level and pitch), then gears it to the robot's own speed (specials.md).

## Audio (`audio/`)

Everything must sound like a recording of the real thing: no percussive, novelty or cartoon sounds.

- **Power unit** (`power-unit.ts`): the 1.6 L V6 turbo-hybrid.
  - **Harmonic body:** one periodic wave at the four-stroke cycle frequency (rpm / 120), with the engine orders as harmonics: firing (6 per cycle) and its multiples, the bank order (3), and weak orders from cylinder spread. A second copy a few cents off beats against it.
  - **Rasp:** band-limited noise amplitude-modulated at the firing frequency.
  - **Whines:** the turbo/MGU-H and MGU-K whines are kept very faint (shrill tones were rejected before).
  - **Gearbox (`Gearbox`):** 8 speeds, upshift at 11 600 rpm with an 18 ms torque dip (no clunk), rev-matched downshifts, launch revs from clutch slip.
  - **Idle:** hunts slightly around 4 800 rpm.
  - **Start and stop:** it starts with a rev flare the first time audio runs and whenever the car re-forms, and it runs down as the transformation begins. No pops or crackles.
- **Transformation:** the shared machine (see cybertruck-audio.md) as a racer would build it (`RACER_MACHINE`): smaller, quicker drives (still low: a 220 Hz top whirr) with a faster ratchet, a small fast pump, and a stiff, well-damped carbon monocoque. Its panel modes are higher and die away quickly, so its seats are drier than the truck's. It is heard through a 2 kHz distance lowpass.
- **Footfall:** the shared voice tuned for a lighter robot (`RACER_FOOT`).
- **Tyres:** the shared sliding-tyre voice (cybertruck-audio.md) with a lighter roar (`RACER_TYRES`, 1.1 kHz lowpass). The power unit follows the rear wheels' surface speed, so wheelspin in a drift revs it.

## Build issues found at export (left as authored)

- From T ≈ 0.8, each foot's retracted heel-arm strut stages nest behind their base, down through the sole. They reach about 10 cm below it, so the Blender stand rests on them. In game they are below the sand while standing, but they show under a lifted foot.
- In car form the backpack mast's strut base hangs about 2 cm below the floor to the ground.
- The front hubs sit 1 cm above `dims.FR_R`, so the front tyres clear the ground by about 9 mm; the rear tyres carry the car.
