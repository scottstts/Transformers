# Cybertruck character

The car, the robot and the transformation between them are authored procedurally in Blender (`blender/cybertruck_build/`, package `ctb`) and exported as one asset, `public/models/cybertruck.{json,bin}`. The game replays that asset; it does not build geometry. Rebuild and export with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/cybertruck-transformer.blend --python blender/cybertruck_build/export_game.py
```

The export also saves `blender/cybertruck-transformer-baked.blend` with the timeline keyed (240 frames = T 0..1) for scrubbing.

## Frames

Authoring frame: x = robot left, -y = forward, z = up, metres. The runtime keeps it and applies one -90° X rotation into three.js (y up, +z forward). The robot stands where its ankles lay in the truck: `rig.dims.robotF` (2.10 m ahead of the car origin) is the gameplay `robotOffset`. The duration (8 s) comes from the asset.

## Asset and runtime

Nodes are the mechanism's rigid bodies: 55 bones, car assemblies (a group of panels that move together), hub-centred wheels and lifter stages. Geometry is stored per node and material slot in the node's frame (quantized positions, octahedral normals), decoded to float at load. Every node's local transform relative to its parent is baked for each frame, plus the ground lift; playback samples and slerps between frames. Material slot names are the contract with `materials.ts`.

At T >= 0.9 the skeleton blends into the live rig (`model/rig.ts`): the exported stand pose, the gait's channels and the same two-bone leg IK as the Blender build (a test asserts the TypeScript stand reproduces the baked T = 1 pose). The ground lift then comes from the foot and toe-cap support points. In car mode the body takes the suspension matrix and the wheels stay unsprung, spinning and steering; the car state fades out over the first 6 % of T.

The asset loads inside the observed startup chain (download overlaps GPU initialization); a missing or malformed asset fails boot through the error view.

## Lift thrusters

The rise about the feet is carried by two plasma jets (`fx/thrusters.ts`, `fx/plasma.ts`), added in the game without touching the model: the exhaust leaves flush ports on the chest's back plate, which faces the ground inside the truck and clears every panel during the burn (a test sweeps the flame against all geometry).

- **Gimbal:** the jets are gimballed 70 % toward world down, so the thrust points up at any body pitch and the exhaust sweeps away from the legs.
- **Throttle:** follows the cosine of the body's elevation (gravity's torque about the feet). It ignites at T 0.272-0.302, burns hardest at lift-off and cuts off at 0.70-0.80, so it also brakes the descent in reverse.
- **Rendering:** each jet is an emissive volume ray-marched inside a tight, depth-tested proxy frustum. The march starts at the proxy's front face and ends at its analytic exit or the ground plane. The scene depth buffer is not read, because a multisampled depth copy is invalid and GPU validation errors are fatal here. Anything inside a proxy would get the plume behind it drawn over it, so the proxies hug the jets, and the few-centimetre ground sheet is not a volume: its emission is integrated over height analytically and drawn on a disc just above the sand, so wheels and feet occlude it exactly.
- **Structure:** no visible start: the jet fades in over its first 0.45 m with a turbulent, ragged onset, then a short core, Mach diamonds at high throttle, and a blue-to-violet turbulent mixing layer that widens downstream.
- **Other effects:** a point light (kept in the scene at zero intensity so the light count, and so the shaders, never change), a radial dust blast and a slight camera rumble.

## Controls and camera

A transform request made while moving waits until speed is below 0.3 m/s; R may reverse an in-progress transform. The car uses direct throttle, brake, reverse and steering inputs with bicycle yaw, independent of camera orientation. Robot movement is camera-relative and pivots around the robot standing point. Motion values in `src/game/movement.ts` are this character's defaults.

Click to enter with pointer lock. W/S or up/down drive and brake/reverse, A/D or left/right steer, R transforms, Shift boosts or runs; in robot form WASD and the arrows move in camera space. Escape releases pointer lock. Normal play has no HUD.

The camera orbits at 7.875 m in car form and 12.75 m in robot form, easing between them during the transformation; zoom is disabled and a pitch limit keeps it above the ground. While driving keys are held it returns behind the car after 0.3 s without mouse movement.
