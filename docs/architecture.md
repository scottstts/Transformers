# Game structure

The browser entry handles one observed startup chain. `GameSession` owns the active scene and frame order, while input, movement, camera, rendering, character content, and the world are separate modules. The session plays one character at a time from the roster and one desert world.

## Characters

`src/content/transformer/` is the shared transformer runtime every character is built on: asset decoding (`asset/`), track playback and the live rig (`model/`), the procedural gait (`animation/`), transformation and footfall audio (`audio/`), cue merging (`cues.ts`) and the `Character` contract (`character.ts`). Geometry and choreography are authored in each character's Blender build, not in TypeScript.

Each character package (`src/content/cybertruck/`, `src/content/ferrari-f1/`) supplies only what is its own: materials for its slot names, its effects and sounds, its gait style, its fighting (`combat/`: four moves, its weapon and effects, combat.md; its special and the special's effects, specials.md) and a `CharacterProfile` (drive limits, robot speeds, camera framing, collision radii). A character's weapon is a separate asset loaded with it (weapons.md). The game modules (`game/movement.ts`, `game/follow-camera.ts`) take these values from the profile. Tuning a car means editing its profile, not the game code.

`src/content/roster.ts` lists the playable cars: label, menu tagline and accent, loader and factory. Adding a car means adding a package and a roster entry. Assets download once per session (the promise is shared; a failed download can be retried). The last choice is remembered in local storage and used at boot.

## Switching cars

`GameSession.switchCharacter` swaps cars in either form when no transformation or jump is running. A car is built the first time it is chosen:
- download its vehicle and weapon assets together; the roster load promise is typed as `PlayableTransformerAsset`, so it cannot report ready without the weapon;
- place it where the current car stands;
- compile its shaders against the live scene's lighting (`compileAsync(object, camera, scene)`), then keep the combat weapon/effects warm through the hidden settle frames so geometry uploads plus the weapon cast-shadow pipeline are submitted before the cover lifts.

Built cars stay cached (GPU resources warm) for switching back. On the swap:
- the old car's voices stop;
- a standing robot keeps its standing point (the car origin shifts by the difference in robot stations);
- one contact-free surface update ends the old tyre ribbons.

Besides the touch controls, the in-game UI is the vehicle menu (`src/ui/vehicle-menu.ts`), the special's energy meter in the top-left corner and the cutscene's letterbox bars (`src/ui/energy-meter.ts`, specials.md). The menu cannot open during a cutscene, and the meter and pill hide under it. Collapsed, it is a small hint pill at the bottom of the screen (`Tab` to switch, `R` to transform; while the pointer is released it says to click to play). Opening the menu grows the same glass panel out of the pill into a carousel of car names. The panel is laid out at full size the whole time and one `clip-path` transition does the morph, so nothing reflows. The pill's width comes from the measured label (`--hint-w`) and is measured again only on resize or a label change. Tab opens the menu without releasing the pointer lock: mouse look and game keys pause while it is open, and the keyboard drives it. Escape still releases the pointer (browsers reserve it), which leaves the menu open for the mouse. The arrow keys, the arrow buttons (once the pointer is free), a horizontal swipe or trackpad scroll, or a click on a faded neighbour swipe to the next car. While a car loads, a dark cover with a loading rule hides the screen. The controls lock (like a transformation), the menu ignores swipes and closing, and the audio output is held silent (`AudioMix.hold`); the voices keep running. The swap happens behind the cover. `switchCharacter` resolves only after a few more frames are drawn and the GPU queue drains, so first-use uploads and pipeline builds land out of sight. The cover lifts, the sound fades in and the menu closes back to play, all at once. A failed load leaves the menu open with the reason. Before this, the new engine could be heard while the picture was still stalled on those first frames. Tab, Escape, Enter or the backdrop closes the menu and resumes play.

## Touch devices

`platform/device.ts` decides once at boot (`hover: none` and `pointer: coarse`) whether to use touch controls. A touch device never locks the pointer (`FollowCamera.pointerLock = false`). `ui/touch-controls.ts` drives the same `GameInput` and camera as the keyboard and mouse:
- a floating stick on the left 45 % of the screen, which centres under the thumb;
- a drag anywhere else to look (`FollowCamera.look`, the same path as mouse movement);
- a transform button;
- jump, attack and special buttons, shown only while the robot stands (`GameSession.onStandingChange`); the special's rim shows its energy;
- a held drift button in the jump button's exact slot while the car is fully settled. It drives the same Shift state as the keyboard and is released as soon as transformation, switching, the menu, or focus loss makes car actions unavailable.

The stick maps onto the keyboard controls rather than adding a separate car mode. Forward and back switch the throttle on and off, as W and S do, and sideways steers the car proportionally. In car form the stick never implies Shift, even at full deflection: ordinary joystick driving stays in the same aided regime as desktop WASD. The held Drift button is the only touch source for the car's Shift state, and releasing it follows the exact desktop Shift-release path. For the robot, the stick gives a camera-relative walking direction and pushing it to the rim still runs. The menu pill moves to the top on touch screens, clear of the thumbs, and a tap opens it. The touch controls hide and release every finger while the menu is open.

## Audio

`src/audio/mix.ts` owns the one AudioContext (created on the first user interaction), the bus compressor, air lowpass, the outdoor reverb and the pre-rendered textures. Character voices build their graphs lazily on it, and `dispose()` stops their continuous voices when the car leaves the scene.

## World and motion

Baked noise and the shared image setup (`rendering/look.ts`: tone mapping, shadows, environment bake, bloom) live outside the character packages. The session and the headless preview tool use the same setup.

`src/worlds/desert/` owns scenery, lighting, ground materials, dust, tyre tracks, and collision circles. Its entry point supplies the world, environment lighting scene, and contact effects. Characters receive contact effects through a small interface, so another environment can provide different tyre and footfall feedback without changing character code.

Gameplay motion uses an explicit state for position, heading, forward and lateral velocity, tyre slide, form target, suspension, and transform progress. Car handling is `game/car-dynamics.ts` (car-handling.md); robot gait and jumps are robot-locomotion.md. The two locomotion paths share that state. Combat (combat.md) is a system around the session: `RobotCombat` owns the combo and the special, writes the fight's root motion into the same state and lays its pose over the gait through the model's rig overlay. The special's director and the camera reactions and hit-stop (`CameraFx`) sit after the follow camera, in that order, and the special's tempo scales the world's clock (specials.md). Future racing and flight should be added the same way, rather than extending the loop with mode-specific branches.

All source modules under `src/` are TypeScript. The asset tests cover pose and handover invariants alongside the compiler checks; the Blender audits cover geometry and mechanism clearance.
