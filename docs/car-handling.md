# Car handling and drifting

`src/game/car-dynamics.ts` is a dynamic single-track model shared by every car: forward speed, lateral velocity and yaw rate, per-axle tyre forces under load transfer (and downforce for the F1). The car origin is its centre of mass (both assets have it mid-wheelbase; `frontAxle` in the drive profile places the axles). Sub-steps are fixed at 1/300 s, so handling is frame-rate independent (tested). `tools/drift-lab.mjs` prints telemetry for scripted inputs (hold, neutral, exit, countersteer, donut, handbrake, high-speed entry) and is how the values were tuned.

## Two regimes, one key

- **Aids on (no Shift):** traction control and ABS. The profile's `accel` / `brake` are delivered exactly as tuned, no wheel spins or locks, and only part of that load comes off cornering grip. A physically capped model braked at ~1.2 g instead of the tuned 18 m/s² and made the F1 wheelspin off the line, which changed the established feel; the aids keep it.
- **Aids off (Shift):** full power (the old boost), all drive to the rear (a drift mode; the truck is otherwise AWD), rear grip down to `driftGrip`, the footbrake biased to the rear like a handbrake. Each axle now transmits only what it grips; demand beyond it becomes wheelspin or lock. Once an axle slides, its force points against its tread's slip velocity. This is what makes a drift scrub speed instead of gaining it: a rear sliding sideways at 10 m/s with 4 m/s of wheelspin pushes mostly sideways. An earlier version scaled drive and cornering proportionally on the friction circle and the car accelerated through drifts.

Shift used to be boost only. Keeping the boost power inside the drift key means a player holding Shift on a straight still gets it; turning with it held breaks the rear loose.

## The drift driver's hands

Keyboard steering is on/off, so raw countersteer is unplayable. Once the rear slides, the front wheels are steered as a drift driver's hands would: along the front axle's travel (caster self-alignment), plus a PD correction holding a body slip angle. The player's steering picks the angle, as a fraction of the car's steering lock (the hands need about that much countersteer, and the F1's small lock is why its drifts are shallower):

- neutral: 0.62 of the lock;
- into the turn: up to the full lock;
- away from the turn: toward none (straightens; held with Shift it swings into a linked drift the other way).

Details that mattered:
- The hands engage quickly and hand back slowly (12/s on, 2.5/s off). Instant switching made the steering saw between the player's lock and countersteer.
- They fade out below 5-9 m/s: at a crawl a power slide is a donut, steered into the turn.
- The crawl-speed fallback to plain steering geometry (no tyre slip below ~2.6 m/s) is skipped while the rear spins, otherwise every donut stalls.
- Past 0.9 rad of body slip a restoring yaw (fading in with speed) prevents spins at speed.

Releasing Shift restores the rear over ~0.25 s and the same hands catch the slide: it straightens in about half a second with a couple of degrees of overshoot.

## What the rest of the game reads

`MotionState` carries per-axle tread slide (`slideFront/Rear`, sideways) and `spinFront/Rear` (wheelspin backwards, lock forwards), `drift` (smoothed 0..1) and the tyre accelerations. `contactMotion` turns them into each contact patch's ground velocity and tread slide vector (`Tyres` in `transformer/tyres.ts` feeds the world's `ContactEffects.tyre`). Body roll uses the true lateral acceleration. `speed` is still forward speed; the transformation waits for the whole velocity (forward and sideways) to settle.

The chase camera swings 65 % of the slip angle toward the travel direction, so a drifting car is seen at its angle rather than the view spinning with its nose. Engine and motor audio follow the driven wheels' surface speed, so wheelspin revs them up.
