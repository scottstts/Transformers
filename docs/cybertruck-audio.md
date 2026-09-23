# Cybertruck audio

All sound is synthesized with Web Audio (`src/content/cybertruck/audio/`).

## Transformation

The transformation sounds like one large electro-hydraulic machine: machine hums, motors and actuators running. Percussive and novelty sounds are deliberately excluded (earlier designs had seating clunks, plate rings, creaks, rattles, relay clacks and detuned saws; they read as silly):

- **Machine bed:** a supply hum and a pump drone run while 0 < T < 1. Each transformation start, in either direction, spools the hum up.
- **Stroke voices:** each stroke is an electric actuator, started when T crosses the stroke's start (or its end, running backwards).
  - The voice's pitch and load follow the stroke's bell-shaped speed profile: it spins up, runs, and spins down as the part eases in.
  - Nothing sounds when a stroke ends.
  - All motors share one timbre (a harmonic series with lifted slot harmonics plus a gear-mesh partial) and three fixed sizes, so overlapping strokes blend into one machine.
  - Lifter strokes are hydraulic flow and pump whine; the body's rise is two deep drive motors under a long load.
- **Merging:** mirrored L/R strokes merge into one voice, and lifters that start together share one.
- **Voice budget:** 10 voices; when full, a new stroke plays only if it is larger than the smallest one running.

## Lift thrusters

The lift thrusters (see cybertruck.md) have a rocket voice driven every frame by throttle and ground impingement:

- decorrelated pink-noise roar with turbulent swells, its lowpass opening with throttle;
- crackle, rising faster than the roar with throttle;
- sub rumble, reinforced near the ground;
- sand-wash hiss while the jets strike the ground;
- a low ignition "whump".

Crackle is what makes it a rocket rather than wind: steep positive shocks with a slower recovery and heavy-tailed amplitudes.

## Driving and walking

Driving plays only a plain electric drive motor: a soft hum following road speed with a faint, heavily lowpassed whine, silent at rest. Tyre roar, gravel and brighter motor tones were removed on request (they sounded shrill). Footfalls keep the ground thump, gravel crunch and damper exhale, with a dedicated voice gain of 0.4 before both the dry mix and reverb send. This keeps walking and running subdued while preserving their relative impact strength; jump contacts use the same footfall voice.

## Mix and textures

Textures (noise, chatter, roar, crackle) are rendered once at start-up. Continuous loops are generated past their end and crossfaded so they don't click. The mix goes through a compressor, a gentle air lowpass and an outdoor space: a ground reflection, sparse early reflections and a short dark tail.
