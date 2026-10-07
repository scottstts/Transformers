# Impala character

The 1967 Impala, its robot (5.47 m, the pickup robot's size) and the transformation are authored in Blender (`blender/impala_build/`, impala-model.md) and exported as `assets/impala.{json,bin}`; the cutlass is `assets/impala-cutlass.{json,bin}` (weapons.md). The package is `src/content/impala/`. The exported model is the authority for everything in game: proportions, slots and colours come from the build (`kit.py` `materials()`).

## Runtime choices

- **Feet:** the foot and toe castings are `part:` nodes (the bones carry no geometry), so `footNodes` names `part:foot.*` / `part:toe.*`.
- **Soles** (fitted with `gait-probe.mjs --sole`): toe 0.65, heel 0.19, rounded 9 cm, ankle 0.417. The heel pad stands up to 9 mm higher than the toe pad (the bottom rakes about a degree), levelled by `soleTilt` -1; with it the walk's foot-flat stays under 3 g at 60 Hz (asset test).
- **Gait:** the heavy machine scaled to 2.87 m hips (walk 3.77 m/s on 2.27 m steps, Froude 0.48; run 14.5 m/s on 4.26 m steps), the stand's wide feet (0.94 m out against 0.47 m hips) drawn in while moving. The run is a `runCycle` run: its flight is ballistic (1.4 g at 60 Hz), and the ground projection leaves the body its height while both feet are up.
- **Hands** (rig.ts `HandLayout`): the knuckle row runs across the hand (the fingers flex about X), the thumb sits on the opposite side of the row from the finger named `index`, and each forearm turns in 32 degrees about its own axis in the stand. The rig reads all three from the bones: the gait keeps the turn and flexes each finger by its own stand angle, so the handover from the baked timeline is seamless (the asset test checks the stand to 1e-4).
- **Profile** (`IMPALA_PROFILE`): measured from the car (3.14 m wheelbase, 1.68 m track, 0.36 m tyres, the front axle 1.61 m ahead of the origin). A heavy, soft cruiser: low grip that gives up early (1.02 at 0.16 rad), all drive at the rear and a loose drift rear (0.64), 15 m/s² drum brakes, more roll and pitch than the others (1.15 Hz ride), 42 / 54 m/s.
- **Materials** (`materials.ts`): every slot at the build's linear colour, metalness, roughness and coat. The Tuxedo black lacquer carries a little orange peel in its coat's roughness; chrome a faint wiping. Lamps are tungsten-warm emissives (`IMPALA_LIGHTS`: the headlamps dim to the chest's share in robot form, the tail lamps brighten braking, the markers blink while it transforms). The eyes are the build's blue and blaze with `eyeBoost`.
- **Glass** is opaque, dark and clear-coated, as on every car: blended panes are reactive coverage to the temporal resolve (rendering-and-boot.md) and shimmer at windscreen size. The cabin trim behind it is hidden.
- **Effects** (`effects.ts`): a tyre leaving or meeting the sand during the transformation throws dust, read from the posed wheel contacts, so it holds both ways without authored events.

## Audio (`audio/`)

- **Engine** (`big-block.ts`): fitted to `ref_sounds/67_impala_engine.mp3` (a pull through the gears) by `tools/engine-model.mjs`, which writes `engine-model.ts`: at low revs (about 2200 rpm) and high (about 5000) the engine orders (harmonics of rpm / 120, relative to the firing order) and the noise between them (its band shape, its RMS against the orders', how deeply it pulses at the firing rate). The voice plays each timbre's orders as a periodic wave at measured amplitude (with a second bank a few cents off), crossfaded by revs, and its noise as a seamless shaped loop (`shapedNoise`, frequency-domain synthesis) played at the revs' ratio to the timbre's, pulsed at the firing rate. The analysis windows are short (85 ms at high revs), so the pull's rising revs keep the orders apart from the noise. Its output level sits about 2 dB over the Bat's V8 in the mix.
- **Gearbox:** a three-speed automatic, 2.48 / 1.48 / 1.00 (the recording's shift drops the revs by about 1.45, its 2-3), shift points rising with throttle, kickdown.
- **Transformation:** the shared machine in a body of large thin pressed-steel panels (modes ringing longer than an armoured body's). **Tyres:** narrow bias-ply, higher and thinner squeal.
- **The cutlass's bite** is the soldiers' `cutlass` blow (enemies.md), fitted to `ref_sounds/cutlass_hit.mp3`; its swing is the shared swing voice.
- **Lightning** (`combat/audio/lightning.ts`): a strike's snap and the channel's rip, then thunder rolling in late by distance; a continuous arc voice (crackle and ionised hiss over a low ground rumble) while the discharge runs.

## Effects (`combat/fx/`)

- **Blade arcs** (`blade-arcs.ts`): the heavy cuts' light, recorded from the edge between `arc` cues: a white-hot line along the tip's path over a crimson sheet that tears away from the base side, gone within a third of a second. The shared trail is the faint film smear on every swing.
- **Lightning** (`lightning.ts`): bolts by midpoint displacement with forks, camera-facing segment quads in one instanced additive draw (2400 segments), a return-stroke flash, a stepped current flicker. Generation is allocation-free; a strike uploads its run of the ring in at most two ranges (tested). A crawling bolt keeps to the ground a few centimetres over it.
- **Shock ring** (`shock-ring.ts`): a band of crimson light expanding round the robot, eased out, pooled as three instances.
- **Lights:** the forming weapon's and the blast's (the fighter's), and the discharge's (`ThunderFx`), the third slot.
