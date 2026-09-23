# Development checks

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` after code changes. `tests/cybertruck.test.ts` loads the exported asset and checks its integrity. It also checks:

- 101 forward and 100 reverse transform poses returning to the fold;
- orientation in game space;
- wheel ground contact on the suspension;
- that the TypeScript rig reproduces the baked T = 1 pose (a seamless handover to the gait);
- 360 walking and running frames with grounded feet;
- the lift-thruster throttle window, and that no geometry enters the exhaust during the burn.

`tests/desert-world.test.ts` checks tyre-track ribbon continuity and restarts.

`tests/movement.test.ts` checks that transform requests cannot reverse or queue during braking or playback in either direction. `tests/jump.test.ts` checks frame-rate-independent jump timing, one-shot take-off/landing events, replay, arm and foot-target continuity from idle/walk/run, and a two-foot landing without stray stride footfalls.

The Blender build carries the geometry and mechanism audits. Run them after changing panels, the robot or the choreography, then re-export:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/cybertruck-transformer.blend --python blender/cybertruck_build/audit_game.py
```

It reports islands, clashes and coplanar faces at T = 0 and T = 1, the lowest parts in robot mode, the clash sweep over the transformation, and the support gate (see transformation-mechanics.md).

For a look at effects without a browser, `tools/preview.mjs` renders fixed shots headlessly with the game's renderer and post pipeline (Dawn WebGPU in Node). Shots are the transformation frames (`rise-*`, `plume-detail`) and tyre tracks after a drive (`tracks*`):

```bash
node tools/preview.mjs preview-out rise-close tracks-low
```

The browser view is left for manual visual review. Headless checks catch invalid or drifting transforms and solid clashes. They cannot judge silhouette, shading or the feel of motion and sound.
