# Development checks

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` after code changes. `tests/cybertruck.test.ts` loads the exported asset and checks its integrity. It also checks:

- 101 forward and 100 reverse transform poses returning to the fold;
- orientation in game space;
- wheel ground contact on the suspension;
- that the TypeScript rig reproduces the baked T = 1 pose (a seamless handover to the gait);
- 360 walking and running frames with grounded feet;
- the lift-thruster throttle window, and that no geometry enters the exhaust during the burn.

`tests/ferrari-f1.test.ts` runs the same asset, playback, orientation, wheel-contact, handover and locomotion checks for the F1. It also checks:

- a game material for every exported slot;
- that the soles stay down while the skeleton blends into the gait;
- top speeds with the F1 profile;
- the gearbox shifting up through all eight gears and back inside the rev range.

`tests/semi.test.ts` runs the same asset, playback, orientation, wheel-contact, handover and locomotion checks for the Semi. It also checks:
- the tailored meshes' second shape (bounds enclose both, the weight runs 0 to 1);
- the van swinging about the kingpin in car form (its tyres on the ground) and not once it transforms;
- the van riding the chest while the robot walks;
- the trailer swinging within its stop through a turn and straightening after;
- the rig's collision circles keeping the van out of a boulder.

`tests/bat.test.ts` runs the same asset, playback, orientation, wheel-contact, handover and locomotion checks for the Bat. It also checks:
- the nozzle at the car's tail and down the robot's back;
- the wheel groups riding the shoulders and calves while the robot walks;
- the afterburner lighting on the boost in car form only, and spooling down after;
- the automatic shifting up through its four gears and back inside the rev range;
- the run drawing the feet in under the hips (within 0.2 m of them; the stand's are 0.46 m outside);
- the spear's shaft never passing through the torso, head or legs, nor a forearm or hand through them, through the whole combo and the special (tested against the mesh triangles, `support/clash.ts`);
- the vortex dust capped in life and gone within 0.6 s of its release.

`tests/desert-world.test.ts` checks tyre-track ribbon continuity and restarts. `tests/citadel.test.ts` checks exported geometry budgets, halo partition/rotation, CPU/GPU floor agreement, every bay/beat on walkable floor, hard-surface effects/audio and floor timing before a hit. `citadel-rendering.test.ts` checks diagonal AO raster coverage, cached shadow depth coverage through camera movement, raised-floor shell casings and previous horde motion by body identity.

`node tools/citadel-plan.mjs` reports plan, navigation and CPU boot costs; `node tools/citadel-map.mjs [out.svg]` draws floors, ramps, gates, colliders, bays and beats. `node tools/citadel-render.mjs [out-dir]` renders near/design/far gate views and lighting isolation, then checks distant trim flicker through slow camera motion at 80 m and 400 m. `node tools/aa-probe.mjs` checks subpixel stability, camera-cut reset, projection cleanup and disappearing transparent effects. The image tests use the production temporal scene buffers, not a separate AA approximation.

`tests/special.test.ts` checks, for every robot (each run as long as its tempo curve makes it in real time), that the special is well-formed (keys, cues, steps, shots and tempo inside it) and, played from the stance and cutting into a combo at 120 Hz, that it stays finite, keeps wrists, haft and edge out of the body cores, keeps the planted feet on the ground, flies and travels as far as it should, and hands back to the gait with the weapon gone. `tests/energy.test.ts` checks that three full combos fill the meter and two do not, and that it is spent whole. `tests/director.test.ts` checks the special frame's axes, hard cuts, the handback reaching the follow camera, the handback orbiting instead of passing through the robot, and the camera floor.

`tests/light-slots.test.ts` checks that the scene's light identities stay the same whichever car plays. `node tools/switch-probe.mjs --all` replays all twelve ordered switches, cached and first use, then world/floor/effect classes and a commander combo/destruction (zero programs/pipelines in play). `node tools/citadel-bench.mjs` measures the real 1080p world, player, horde and post pipeline at every yard, requiring queued throughput plus CPU simulation below 33 ms. `node tools/dust-bench.mjs` measures sand, ceramic and deck, empty versus fight versus surge. Frame reports distinguish CPU submit, whole-queue GPU span, serialized queue-complete latency and steady queued throughput; never treat summed per-pass timestamps as elapsed GPU frame time.

`node tools/gun-model.mjs <machine_gun.mp3> <cannon.mp3>` refits the Semi's gun sounds from the two recordings (`--compare` prints a take's band-envelope error against them: about 3 dB for the shot and 4 dB for the cannon). `node tools/spear-model.mjs ref_sounds/spear_poke.mp3 ref_sounds/spear_slash.mp3` refits the Bat's spear the same way (about 4 dB each).

Run `node tools/switch-probe.mjs <from> <to>` for every switch direction a new car adds; the Bat's (to and from the truck, the F1 and the Semi) build nothing in play.

`tests/combo.test.ts` checks the click combo (one click one move, chaining only inside the window, early clicks ignored, a late click restarting from move 1, nothing after move 4) and that keyed curves pass their keys without overshoot. `tests/combat.test.ts` checks, for every robot:
- four well-formed moves;
- that neutral channels reproduce the gait's stance (a seamless hand-back);
- normal/early/late chains and recovery after move 3 at 120 Hz: ground contact, wrists, full formed haft/pommel and cutting edge outside conservative body cores, off-hand grip contact, weapon cleanup and return to gait;
- handle axes enclosed by curled fingers, with the thumbs nearby;
- forward displacement on every move at 30/120 Hz (each robot's own least distances), without losing ground during recovery;
- a single click playing move 1 only (armed or not as the robot's first move is: the Bat's thrust forms its spear).
- truck finisher arm-joint speed bounds at 30/60/120 Hz and the two unarmed recovery exits; the standalone move-3 recovery continuity case is an expected failure pending its own authored exit.

`node tools/clash-probe.mjs <car> <clicks|F<t>|G|walk|run> [until]` reports, in move time, every span where the weapon's shaft, a forearm, a hand or a leg passes through the robot's own triangles, and where the weapon wrist bends past 70°. `tools/fight-probe.mjs` prints a combo's pose numbers and `tools/fight-sheet.mjs` renders contact sheets of it (combat.md). A click token `F<t>` plays the special; the sheet's `director` view films it through the special's own camera and `top` looks straight down; `PROBE_CORES=1` makes the probe report every frame a wrist or the weapon enters a body core. `tools/fx-sample.mjs <out> billows,crater-hot,crater-cold,furrows,sun` renders effect samples on their own. Contact sheets of 16 cells (1920x1080) can come back colour-banded when viewed through some image pipelines; check a suspicious sky in a cropped cell before chasing it in the renderer.

`tests/car-dynamics.test.ts` checks, for both cars:
- grip cornering without Shift (no slide);
- a held drift staying within its angle band without spinning, and scrubbing speed;
- recovery after Shift is released;
- frame-rate independence;
- aided braking at the profile rate without lock-ups.

`tests/platform.test.ts` checks that the boot gate accepts desktop Chromium and rejects Safari, Firefox, mobile browsers, iPad desktop mode and touch-only input.

`tests/movement.test.ts` checks that transform requests cannot reverse or queue during braking or playback in either direction. `tests/jump.test.ts` checks:
- frame-rate-independent jump timing at any momentum;
- one-shot take-off and landing events, and replay;
- a shorter, shallower take-off from a run;
- arm and foot-target continuity from idle, walk and run;
- two-foot landings (standing, walking) and lead-foot landings (leaps);
- no stray stride footfalls;
- planted feet moving back exactly at body speed;
- the pelvis shifting over the planted leg.

`tests/leap.test.ts` presses a running jump at four stride phases on each robot and checks that the leap springs off a loaded toe-off, keeps the run's carriage while loading, has no joint snaps, holds bent knees in the air, lands on the lead foot as a stride strike and lands without a jolt. `tests/locomotion-rig.test.ts` also checks that every walk keeps the cadence of its size, and that the heavy machines carry pelvis and chest as one block while walking. `node tools/gait-probe.mjs` measures gait timing, bounce, the view from behind (`--lateral`), sole fit (`--sole`) and jumps (`--jump`).

`tools/drift-lab.mjs` prints handling telemetry for scripted driver inputs:

```bash
node tools/drift-lab.mjs ferrari-f1 hold exit donut
```

The Blender build carries the geometry and mechanism audits (`ferrari-f1.md` has the F1 export command):

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/cybertruck_build/audit_game.py
```

It reports islands, clashes and coplanar faces at T = 0 and T = 1, the lowest parts in robot mode, the clash sweep over the transformation, and the support gate (see transformation-mechanics.md).

The audits point to problems; they are not a gate. The Cybertruck's current transformation was reviewed visually and accepted, including the small, hidden contacts the audits still list. Judge by visibility and scale: fix large visible pass-throughs, floating parts and anything poking through a car panel, and leave small hidden overlaps. After a design change, bake and review the timeline visually first. Run the audits only when a visible problem needs locating, or before reworking the choreography.

For a look at effects without a browser, `tools/preview.mjs` renders fixed shots headlessly with the game's renderer and post pipeline (Dawn WebGPU in Node). Shots are:
- the transformation frames (`rise-*`, `plume-detail`);
- tyre tracks after a drive (`tracks*`);
- a left drift and its roost (`drift`, `drift-roost`) and its marks (`drift-marks*`);
- the opening broadside (`side`);
- the robot standing (`robot-front`, `robot-hand`);
- the nearest boulder (`boulder`):

```bash
node tools/preview.mjs preview-out rise-close tracks-low
```

`PREVIEW_CAR=ferrari-f1` renders the same shots with the F1 (the `rise-*` framing is set for the truck).

The browser view is left for manual visual review. Headless checks catch invalid or drifting transforms and solid clashes. They cannot judge silhouette, shading or the feel of motion and sound.
