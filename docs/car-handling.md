# Car handling and drifting

`src/game/car-dynamics.ts` is a dynamic single-track model shared by every car: forward speed, lateral velocity and yaw rate, per-axle tyre forces under load transfer (and downforce for the F1). The car origin is its centre of mass (both assets have it mid-wheelbase; `frontAxle` in the drive profile places the axles). Sub-steps are fixed at 1/300 s, so handling is frame-rate independent (tested). `tools/drift-lab.mjs` prints telemetry for scripted inputs (hold, neutral, exit, countersteer, donut, handbrake, high-speed entry) and is how the values were tuned.

A frame with `dt <= 0` is a true simulation freeze (used while a character switch is hidden): control-facing throttle/boost state may be refreshed, but the tyre integrator and all motion state stay untouched. This is required because the tyre stop-distance math divides by the integration step and must never be entered with a zero step.

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

## Trailer (the Semi's van)

`DriveProfile.trailer` hitches a trailer behind the car and `MotionState.articulation` holds its yaw against the car (+ left). It follows kinematically, inside the fixed sub-steps: its axle rolls without sliding, so its yaw rate is the hitch's velocity across it over the hitch-to-axle length. It swings behind a turn and in again, and jack-knifes against its stop in reverse, as a real one does. It does not load the car's dynamics.

- The stop is small (±0.19 rad): the pup's front wall clears the cab's extenders by 25 cm. In a tight turn it sits on the stop and is dragged, and its tyres show the scrub (they are measured from their own motion, `Tyres`).
- A transformation straightens it: the articulation eases to zero once the progress leaves 0, while the model fades it out with the car state.
- Collision in car form is a chain of circles along the car and along the trailer at its articulation (`movement.ts`); a single radius let the van pass through rocks.
- The pickup and the F1 collide as chains of circles too (`carBody`, fitted to the car's measured outline). One circle round the middle reached 1.3 m past their flanks, so they struck rocks they were well clear of.

## On the ground's relief

The car rides the landform (worlds.md) on a spring-damper suspension: each profile's `rideFrequency` sets its stiffness and its static sag, which is also the travel its wheels can drop before they leave the ground. `bump` is the travel to the bump stops, with damping ratio 0.42 for all. Every sub-step (`suspend`):

- The ground is measured under both axles and both sides (`track`), so bumps shorter than the car average out, and its pitch and roll come from the same four heights.
- The springs' support pushes along the ground's normal, so a slope pulls the car down it and a landing on a rising face knocks speed off, with no separate slope term.
- The tyres grip in proportion to the load the springs carry (`load`): light over a crest (it slides there), heavy in a dip, none in the air. The aids deliver drive and brake only as far as the wheels are pressed on.
- Where the ground falls away faster than gravity can follow, the springs top out and the car flies. Its yaw rate is kept, and nothing grips or steers until it lands into its bump stops (`impact`, the closing speed, drives a dust burst under every tyre and a camera jolt).
- Attitude (`attitude`, per frame): on the ground it tracks the ground's plane with its rates fed forward (no lag) through a stiff, lightly damped spring, so a landing rocks it. In the air the pitch eases toward half the flight path (nose down as it falls) and the roll levels. It is the model root's tilt; the accel pitch and roll, and the suspension's travel (`lift`), stay on the sprung body.

`placeCar` stands the car at rest on the ground (the spawn, and every robot frame so the car form starts settled). `tools/terrain-stats.mjs` drives each car at full throttle across a dune field and prints its airtime, flights and hardest landing; it is how the dunes were tuned.

With Shift held, a crest's light rear steps out, and the drift hands then hold the slide as they do on flat ground (neutral holds a drift). Holding Shift straight across dunes therefore turns into a drift the player steers.

## What the rest of the game reads

`MotionState` carries per-axle tread slide (`slideFront/Rear`, sideways) and `spinFront/Rear` (wheelspin backwards, lock forwards), `drift` (smoothed 0..1) and the tyre accelerations. `contactMotion` turns them into each contact patch's ground velocity and tread slide vector (`Tyres` in `transformer/tyres.ts` feeds the world's `ContactEffects.tyre`). Body roll uses the true lateral acceleration. `speed` is still forward speed; the transformation waits for the whole velocity (forward and sideways) to settle.

The chase camera swings 65 % of the slip angle toward the travel direction, so a drifting car is seen at its angle rather than the view spinning with its nose. Engine and motor audio follow the driven wheels' surface speed, so wheelspin revs them up.
