# Game structure

The browser entry handles one observed startup chain. `GameSession` owns the active scene and frame order, while input, movement, camera, rendering, character content, and the world are separate modules. The current game creates one Cybertruck and one desert world; those are content choices made at session construction.

`src/content/cybertruck/` is the character package. Its entry point turns the exported asset (see cybertruck.md) into the visual model, gait, mechanical effects, and the timing and offset needed by gameplay. The package keeps these in their own modules: asset decoding (`asset/`), track playback and the live rig (`model/`), gait, procedural materials, world-space effects such as the lift thrusters (`fx/`), and synthesized audio (`audio/`). Geometry and choreography are authored in the Blender build (`blender/cybertruck_build/`), not in TypeScript. Baked noise and the shared image setup (`rendering/look.ts`: tone mapping, shadows, environment bake, bloom) live outside the character package; the session and the headless preview tool use the same setup.

`src/worlds/desert/` owns scenery, lighting, ground materials, dust, tyre tracks, and collision circles. Its entry point supplies the world, environment lighting scene, and contact effects. The character receives contact effects through a small interface, so another environment can provide different tyre and footfall feedback without changing Cybertruck code.

Gameplay motion uses an explicit state for position, heading, speed, form target, suspension, and transform progress. The two existing locomotion paths share that state. Future racing, combat, and flight should add systems around the session and character boundary as their mechanics become defined, rather than extending the current loop with mode-specific branches.

All source modules under `src/` are TypeScript. The asset tests cover pose and handover invariants alongside the compiler checks; the Blender audits cover geometry and mechanism clearance.
