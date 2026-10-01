# Bat character

The Tumbler, its robot (5.4 m, about the pickup robot's size) and the transformation are authored procedurally in Blender (`blender/bat_build/`, package `btb`) and exported as `assets/bat.{json,bin}` in the shared container and runtime (`src/content/transformer/`). The spear is `assets/bat-spear.{json,bin}` (weapons.md). Export with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/bat.blend --python blender/bat_build/export_game.py
```

The export rebuilds the scene from the scripts and does not save the `.blend`; the working file already carries the baked 8 s timeline.

## Transformation (`btb/choreo.py`, `btb/motion.py`)

- **The gargoyle rise.** The car is the robot in a low, wide crouch: feet on the floor pan at the rear, fists knuckle-down under the chest, the canopy its back shell. The feet and fists plant, the wheels draw up on their arms, and it rises through a gargoyle crouch into the stance. It stays grounded (something always visibly carries the body) and only ever rises. A first pass (a face-down pike and a jet jump) was rejected: it levitated with nothing under it, crouched and stood twice, and symmetric parts cut through each other.
- A 5.8 m robot does not pack into the 4.6 m Tumbler; the legs telescope (`legs.TELE`).
- **World-hosted wheel groups.** The front wheels (on the shoulders in robot form) and the rear corners (on the calves) stay where the car left them while they draw up and swing round the rising body, then are handed to their bone (`follow`). In game they are `carried` (`asm:frontWheel.*` by `bone:clav.*`, `asm:corner.*` by `bone:shin.*`), so they follow the gait from the hand-over on.
- Per-node scale tracks exist in the format but are not used.

## Runtime choices

- **Two tyre sizes.** The turf fronts (0.43 m) are smaller than the swampers (0.555 m, `dims.wheelRadius`): `frontWheelRadius` puts the front contacts on the sand and spins the fronts faster, so they roll with the rears instead of skidding.
- **Soles:** the foot and toe bones. The heel's edge lies between the ground projection's 26 box directions (it found the heel up to 7 cm high through the heel strike, and the walk jolted at 6 g at every foot-flat); the soles are sampled along their rolling plane (`rollSupport`), which brings the walk to about 3 g. Heel 0.33, toe 0.86 (fitted against the mesh with `--sole`: the toe is chamfered, so a longer edge keeps the toe-off within 1 cm), ankle 0.40.
- **Gait:** the pickup's heavy machine scaled to 2.76 m hips (strides by the legs, speeds by their square root): walk 3.7 m/s with 2.18 m steps (Froude 0.5), run 14.2 m/s with 4.1 m steps; the run on the Semi's short, straight-legged support with the wide stand's track drawn in (robot-locomotion.md).
- **Profile** (`BAT_PROFILE`): 3.6 m wheelbase, 38 / 58 m/s (Shift: the afterburner), 9 / 17 m/s² drive, mostly rear drive on the swampers, a soft long-travel ride (1.3 Hz, 0.2 m bump); collision circles narrow at the beak, wide at the rear.
- **Materials** (`materials.ts`), one per `btb/mats.py` slot plus the spear's: satin military black with desert dust settled low and on upward faces, brushed bronze accents, heat-tinted titanium nozzle petals that glow with the burn (`BAT_LIGHTS.nozzle`, lagging the jet as metal heats and cools), gold eyes.

## The afterburner (`fx/afterburner.ts`)

- One jet serves the car's boost (Shift with the throttle on, car form only), the fight and the special (`BatEffects.burn`, the fighter's `burn` cue). It spools like a turbine (faster up than down).
- The flame is placed on the pod node's nozzle lip (`LIP`, pod-frame coordinates from `btb/body.py`); in robot form the pod is the jet pack on the back, nozzle down, so the flame points at the sand 1.1 m behind the heels. If the pod's geometry moves in Blender, `LIP` moves with it.
- Its light is the character's third point light, with the weapon's and the blast's: the Bat uses every slot (`POINT_LIGHT_SLOTS`). Another light needs another slot for every car.

## Audio (`audio/`)

- **Engine** (`v8.ts`): a cross-plane V8 through a four-speed automatic, built like the F1's power unit (engine orders on one periodic wave, rasp pulsed at the firing frequency) but with the uneven bank pulses in the low and half orders (the burble), a lumpy idle and soft converter shifts. It runs down as the car transforms.
- **Jet** (`jet.ts`): roar, reheat rumble and crackle rising faster than the roar, the sand scoured under it, a faint turbine whine following the spool, and a soft thud as the reheat lights.
- **Transformation:** the shared machine in a thick-plated body: low, well-damped panel modes.
- **The spear:** combat.md.

## Vortex dust (`combat/fx/vortex.ts`)

- A Rankine vortex: the free spiral's rate goes as 1 / r^2 only down to a core (where it would pass 16 m/s) that turns as one. The pure 1 / r^2 spiral whipped motes near the centre round at up to 27 turns a second, which strobed against the robot inside it.
- Motes are drawn in at a steady rate and live at most 2.6 s; drawn in exponentially the far ones lived 11 s and hung on long after the vortex. When the vortex lets go (`release`) every mote still in the air fades within 0.6 s.
- Motes fade out within 1.3–2.9 m of the fighter's upright axis, so no sprite slices through its body. Soft depth fading would need the scene pass's depth, which is 4x multisampled and cannot be copied into a single-sample texture mid-pass.
