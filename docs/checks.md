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

`tests/desert-world.test.ts` checks tyre-track ribbon continuity and restarts.

`tests/combo.test.ts` checks the click combo (one click one move, chaining only inside the window, early clicks ignored, a late click restarting from move 1, nothing after move 4) and that keyed curves pass their keys without overshoot. `tests/combat.test.ts` checks, for both robots:
- four well-formed moves;
- that neutral channels reproduce the gait's stance (a seamless hand-back);
- normal/early/late chains and recovery after move 3 at 120 Hz: ground contact, wrists, full formed haft/pommel and cutting edge outside conservative body cores, off-hand grip contact, weapon cleanup and return to gait;
- handle axes enclosed by curled fingers, with the thumbs nearby;
- forward displacement on every move at 30/120 Hz, without losing ground during recovery;
- a single click playing move 1 only.
- truck finisher arm-joint speed bounds at 30/60/120 Hz and the two unarmed recovery exits; the standalone move-3 recovery continuity case is an expected failure pending its own authored exit.

`tools/fight-probe.mjs` prints a combo's pose numbers and `tools/fight-sheet.mjs` renders contact sheets of it (combat.md).

`tests/car-dynamics.test.ts` checks, for both cars:
- grip cornering without Shift (no slide);
- a held drift staying within its angle band without spinning, and scrubbing speed;
- recovery after Shift is released;
- frame-rate independence;
- aided braking at the profile rate without lock-ups.

`tests/input.test.ts` checks that the touch stick maps onto the keyboard controls: an on/off throttle, proportional steering, Shift (drift or run) at the rim and a camera-relative robot direction. It also checks that the mobile drift button holds and releases that same Shift state.

`tests/movement.test.ts` checks that transform requests cannot reverse or queue during braking or playback in either direction. `tests/jump.test.ts` checks:
- frame-rate-independent jump timing at any momentum;
- one-shot take-off and landing events, and replay;
- a shorter, shallower take-off from a run;
- arm and foot-target continuity from idle, walk and run;
- two-foot landings (standing, walking) and lead-foot landings (leaps);
- no stray stride footfalls;
- planted feet moving back exactly at body speed;
- the pelvis shifting over the planted leg.

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
