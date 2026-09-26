# Cybertruck character

The car, the robot and the transformation between them are authored procedurally in Blender (`blender/cybertruck_build/`, package `ctb`) and exported as one asset, `public/models/cybertruck.{json,bin}`. The game replays that asset; it does not build geometry. Rebuild and export with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/cybertruck_build/export_game.py
```

The export also saves `blender/cybertruck-transformer-baked.blend` with the timeline keyed (240 frames = T 0..1) for scrubbing.

## Frames

Authoring frame: x = robot left, -y = forward, z = up, metres. The runtime keeps it and applies one -90° X rotation into three.js (y up, +z forward). The robot stands where its ankles lay in the truck: `rig.dims.robotF` (2.10 m ahead of the car origin) is the gameplay `robotOffset`. The duration (8 s) comes from the asset.

## Body proportions

Datums live in `ctb/car_body.py`. Overall dimensions follow the production truck: 5.68 m long, 3.81 m wheelbase, 1.80 m tall. `refs/ref_images/cybertruck3.jpeg` is the 2019 prototype blueprint (231.7 in long, 75 in tall). Use it for station ratios measured from the axles, not for absolute sizes.

- **Top line:** the apex sits about 43 % of the length back from the nose, just ahead of the B-pillar. The front deck is steeper and shorter than the rear deck.
- **Windshield and hood:** the windshield base (`WS_BASE`) sits just ahead of the front axle, so the hood is short. The glass is split at `WS_SPLIT`. The upper part is sized for the thigh plate; the lower part, cowl, hood and wipers form one shin plate, about as long as the old hood. There is one wiper per half because the halves go to separate legs.
- **Roof glass:** split at the B-pillar line (`B_SEAM`). The piece ahead of the pillar would make the forearm plate longer than the forearm.
- **Tail:** the top edge is at 1.34 m, and the belt meets it there. The sail facet closes to a point, so the rear top edge runs horizontally at full width.
- **Rear face:** 0.62 m of steel (0.72–1.34 m), topped by the light band and a 2 cm steel lip. It is raked 7.4° (`REAR_RAKE`), bottom edge forward; that is the most the folded robot's helmet clears (the blueprint shows about 9°). The tail surface ring is sheared onto this plane, so the rear panels are cut with side-view regions (`rear_face_region`), not top-view strips.
- **Rear bumper:** a black wedge raked parallel to the rear face, standing 5 cm proud of the tailgate's foot. Its underside rises toward the tail. It has a hidden pocket in its inboard top for the folded helmet.
- **Tailgate hub:** `TG_HUB` sits behind the light band. `TG_HINGE` is derived from `TG_HUB_SWUNG`, so moving the hub never changes where the lid lands in robot mode.
- **Door seams and wheel arches** stay as they are. The front door seam is tied to the front flare width, so moving it means reshaping the arch.

## Robot head

- **Neck joint:** a chrome ball on the neck column, centred on the head pivot. The head's socket has a spherical cavity 4 mm clear of the ball, so the joint stays visibly closed at any head pitch. The socket rim sits 1.8 cm above the column, which allows ±8° of pitch.
- **Helmet details:** a dark crown band at brow height, a brow hood pitched 7° down over the visor, and bolt circles on the ears. There are vented, bolted plates on the flank and back facets. `facet_frame` shears these plates onto the flat helmet facet between two stations, so they sit flush at any height.
- **Fold limits:** the head retracts into the chest's head well at the fold. Keep additions within the plan limits in `robot_head.py`, and keep the crown low: the crown faces the tailgate at the fold.

## Asset and runtime

Nodes are the mechanism's rigid bodies: 55 bones, car assemblies (a group of panels that move together), hub-centred wheels and lifter stages. Geometry is stored per node and material slot in the node's frame (quantized positions, octahedral normals), decoded to float at load. Every node's local transform relative to its parent is baked for each frame, plus the ground lift; playback samples and slerps between frames. Material slot names are the contract with `materials.ts`. The container and its playback are shared with every character (`src/content/transformer/`, see architecture.md); the Cybertruck supplies its sole nodes (foot bones and toe caps).

At T >= 0.9 the skeleton blends into the live rig (`transformer/model/rig.ts`): the exported stand pose, the gait's channels and the same two-bone leg IK as the Blender build (a test asserts the TypeScript stand reproduces the baked T = 1 pose). The ground lift then comes from the foot and toe-cap support points. In car mode the body takes the suspension matrix and the wheels stay unsprung, spinning and steering; the car state fades out over the first 6 % of T.

The asset loads inside the observed startup chain (download overlaps GPU initialization); a missing or malformed asset fails boot through the error view.

## Lift thrusters

The rise about the feet is carried by two plasma jets (`fx/thrusters.ts`, `fx/plasma.ts`), added in the game without touching the model: the exhaust leaves flush ports on the chest's back plate, which faces the ground inside the truck and clears every panel during the burn (a test sweeps the flame against all geometry).

- **Gimbal:** the jets are gimballed 70 % toward world down, so the thrust points up at any body pitch and the exhaust sweeps away from the legs.
- **Throttle:** follows the cosine of the body's elevation (gravity's torque about the feet). It ignites at T 0.272-0.302, burns hardest at lift-off and cuts off at 0.70-0.80, so it also brakes the descent in reverse.
- **Rendering:** each jet is an emissive volume ray-marched inside a tight, depth-tested proxy frustum. The march starts at the proxy's front face and ends at its analytic exit or the ground plane. The scene depth buffer is not read, because a multisampled depth copy is invalid and GPU validation errors are fatal here. Anything inside a proxy would get the plume behind it drawn over it, so the proxies hug the jets, and the few-centimetre ground sheet is not a volume: its emission is integrated over height analytically and drawn on a disc just above the sand, so wheels and feet occlude it exactly.
- **Structure:** no visible start: the jet fades in over its first 0.45 m with a turbulent, ragged onset, then a short core, Mach diamonds at high throttle, and a blue-to-violet turbulent mixing layer that widens downstream.
- **Other effects:** a point light (kept in the scene at zero intensity so the light count, and so the shaders, never change), a radial dust blast and a slight camera rumble.
- **Combat charge:** the fourth fighting move drives the same jets (`Thrusters.boost`): throttle and exhaust axis come from the move (straight back, a third down) instead of the lift schedule, so the plume, ground blast and rocket voice are the lift's own (combat.md). The special, Skyfall, drives them straight down to launch and up and back to dive (specials.md); `Thrusters.ports` and `axis` expose the outlets for its trail.

## Robot locomotion

The gait and jump are shared by every robot (robot-locomotion.md). The truck robot walks at 5.1 m/s and runs at 15 m/s with `HEAVY_GAIT`: 2.025 / 4.6 m steps at the original step rates, long stance, a 7 cm weight shift, heel and toe roll about its 0.31 / 0.62 m sole edges.

## Controls and camera

A transform request made while moving waits until the car has stopped (below 0.3 m/s, sliding included). Further R presses are ignored while braking for the transform or playing it in either direction, with no queued reversal. A fresh press after completion transforms back. The car uses direct throttle, brake, reverse and steering inputs on a dynamic single-track model (car-handling.md), independent of camera orientation; Shift drifts. Robot movement is camera-relative and pivots around the robot standing point. Drive limits and handling (grip 1.2, drift grip 0.7, AWD with 62 % rear), robot speeds, camera framing and collision radii are `CYBERTRUCK_PROFILE` (`src/content/cybertruck/index.ts`).

Click to enter with pointer lock. W/S or up/down drive and brake/reverse, A/D or left/right steer, R transforms, Shift drifts (full power, driver aids off, loose rear) or runs; in robot form WASD and the arrows move in camera space, Space jumps, a click fights (combat.md) and F plays the special once its meter is full (specials.md). Tab opens the vehicle menu. Escape releases pointer lock. Normal play has no HUD.

The camera orbits at 7.875 m in car form and 12.75 m in robot form, easing between them during the transformation; zoom is disabled and a pitch limit keeps it above the ground. While driving keys are held it returns behind the car after 0.3 s without mouse movement (toward the travel direction while drifting). Switching cars keeps the orbit angle; the new car's focus heights and distances ease in over 1.2 s (the fast follow smoothing would read as a snap). Re-locking the pointer (after the vehicle menu, or a click after Escape) never moves the camera. Browsers can report the cursor's whole unlocked travel as the first locked movement, whenever it arrives. So the first mouse event after every lock is dropped, as is anything within 80 ms of locking and any single event over 400 px. The vehicle menu keeps the pointer locked and holds mouse look while it is open, so closing it resumes play without a re-lock.
