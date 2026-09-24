# Game structure

The browser entry handles one observed startup chain. `GameSession` owns the active scene and frame order, while input, movement, camera, rendering, character content, and the world are separate modules. The session plays one character at a time from the roster and one desert world.

## Characters

`src/content/transformer/` is the shared transformer runtime every character is built on: asset decoding (`asset/`), track playback and the live rig (`model/`), the procedural gait (`animation/`), transformation and footfall audio (`audio/`), cue merging (`cues.ts`) and the `Character` contract (`character.ts`). Geometry and choreography are authored in each character's Blender build, not in TypeScript.

Each character package (`src/content/cybertruck/`, `src/content/ferrari-f1/`) supplies only what is its own: materials for its slot names, its effects and sounds, its gait style and a `CharacterProfile` (drive limits, robot speeds, camera framing, collision radii). The game modules (`game/movement.ts`, `game/follow-camera.ts`) take these values from the profile. Tuning a car means editing its profile, not the game code.

`src/content/roster.ts` lists the playable cars: label, menu tagline and accent, loader and factory. Adding a car means adding a package and a roster entry. Assets download once per session (the promise is shared; a failed download can be retried). The last choice is remembered in local storage and used at boot.

## Switching cars

`GameSession.switchCharacter` swaps cars in either form when no transformation or jump is running. A car is built the first time it is chosen:
- download its asset;
- place it where the current car stands;
- compile its shaders against the live scene's lighting (`compileAsync(object, camera, scene)`), so the swap itself does not hitch.

Built cars stay cached (GPU resources warm) for switching back. On the swap:
- the old car's voices stop;
- a standing robot keeps its standing point (the car origin shifts by the difference in robot stations);
- one contact-free surface update ends the old tyre ribbons.

The vehicle menu (`src/ui/vehicle-menu.ts`) is the only UI besides the boot veil: a carousel of car names on a glass bar, with no descriptions or number badges. Tab opens it and releases the pointer. The arrow keys, the arrow buttons, a horizontal swipe or trackpad scroll, or a click on a faded neighbour swipe to the next car. That car is swapped in live behind the panel; the latest swipe wins while one loads, and an accent rule under the centred name shimmers while it loads. Tab, Escape, Enter or the backdrop closes the menu and resumes play. While the game is paused (pointer released) a small chip shows how to resume and open the menu. Normal play has no HUD.

## Audio

`src/audio/mix.ts` owns the one AudioContext (created on the first user interaction), the bus compressor, air lowpass, the outdoor reverb and the pre-rendered textures. Character voices build their graphs lazily on it, and `dispose()` stops their continuous voices when the car leaves the scene.

## World and motion

Baked noise and the shared image setup (`rendering/look.ts`: tone mapping, shadows, environment bake, bloom) live outside the character packages. The session and the headless preview tool use the same setup.

`src/worlds/desert/` owns scenery, lighting, ground materials, dust, tyre tracks, and collision circles. Its entry point supplies the world, environment lighting scene, and contact effects. Characters receive contact effects through a small interface, so another environment can provide different tyre and footfall feedback without changing character code.

Gameplay motion uses an explicit state for position, heading, speed, boost, form target, suspension, and transform progress. The two locomotion paths share that state. Future racing, combat, and flight should add systems around the session and character boundary as their mechanics become defined, rather than extending the current loop with mode-specific branches.

All source modules under `src/` are TypeScript. The asset tests cover pose and handover invariants alongside the compiler checks; the Blender audits cover geometry and mechanism clearance.
