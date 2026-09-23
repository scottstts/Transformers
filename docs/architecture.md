# Game structure

The browser entry handles one observed startup chain. `GameSession` owns the active scene and frame order, while input, movement, camera, rendering, character content, and the world are separate modules. The current game creates one Cybertruck and one desert world; those are content choices made at session construction.

`src/content/cybertruck/` is the character package. Its entry point creates the visual model, gait, mechanical effects, and the timing and offset needed by gameplay. Model construction, panel geometry, transform choreography, procedural materials, synthesized audio, and gait live in their own modules. Baked noise lives outside the character package for use by other content.

`src/worlds/desert/` owns scenery, lighting, ground materials, dust, and collision circles. Its entry point supplies the world, environment lighting scene, and contact effects. The character receives contact effects through a small interface, so another environment can provide different tyre and footfall feedback without changing Cybertruck code.

Gameplay motion uses an explicit state for position, heading, speed, form target, suspension, and transform progress. The two existing locomotion paths share that state. Future racing, combat, and flight should add systems around the session and character boundary as their mechanics become defined, rather than extending the current loop with mode-specific branches.

All source modules under `src/` are TypeScript. The headless model checks cover pose and assembly invariants alongside the compiler checks.
