# Cybertruck audio

All sound is synthesized with Web Audio (`src/content/cybertruck/audio/`) on the game's shared mix (`src/audio/mix.ts`). The transformation machine and the footfall voice are shared with other characters (`src/content/transformer/audio/`); the Cybertruck plays them with the `HEAVY_MACHINE` and `HEAVY_FOOT` tunings.

## Transformation

The transformation should sound like a recording of a real machine doing it, built the way film transformations are: layers of real mechanical sounds, one articulated event per visible motion, big machines pitched low and heard from metres away (`transformer/audio/machine.ts`, shared by every character).

Three designs were rejected:
- **Novelty sounds:** seating clunks, plate rings, creaks, rattles, relay clacks and detuned saws read as silly.
- **Clean tones:** motors built from clean oscillator tones gliding with each stroke sounded like a synthesizer.
- **Close, high motors:** motors in a 430–1000 Hz band, strongly pulsed, with bright hiss, fast 0.2 s starts and a close, dry mix sounded "like an electric drill in my ears".

So everything is low, soft-edged and distant:

- **Drives** (slides, hinges, the robot's joints): large, slow geared motors.
  - A soft noise whirr in a low band (the truck's medium drive tops out at 150 Hz) that rises with speed, only lightly stirred by the rotor.
  - The motor's load rumble behind it, and a faint gear mesh that wanders with tooth error.
  - Moves ramp up and down smoothly over about 0.4 s. Nothing sounds when a stroke ends except a seat (below).
- **Ratchet:** turning car parts run through a gear train. Rapid tooth engagements ring the gearbox housing, a deep "trrrt" that speeds and slows with the move. The robot's own long joint moves are smooth harmonic drives with no ratchet.
- **Friction:** sliding panels add a soft rolling rush from their guides.
- **Seat:** a larger part arriving at its stop settles with a deep, damped thump, mostly heard through the body. It is not a clank.
- **Hydraulics** (lifters, telescoping struts): a low flow rush and the cylinder's rumble. When the valve closes, the line bleeds a soft breath of air.
- **Weight lift:** when the body takes its own weight, the rams work hard and the frame carries a slow low strain.
- **Power unit:** one hydraulic pump runs while 0 < T < 1: piston ripple (shaft rate times pistons) over broadband pump noise, mostly heard through the frame.
  - It spools up from rest at each start, in either direction.
  - It labours (pitch sags, level rises) with the flow that running strokes draw.
  - It coasts down when the transformation ends.
- **Body:** every voice is also heard through the chassis, a bank of panel modes. The truck is stainless steel: low modes that ring briefly (`HEAVY_MACHINE`). The shared colouring makes the strokes one machine.
- **Distance:** one lowpass over the whole machine (1.5 kHz for the truck) and a generous reverb send put the listener metres away.
- **Variation:** each actuator's speed, gearing and housing are seeded by its name, so a part sounds the same every time.
- **Merging:** mirrored L/R strokes merge into one voice, and lifters that start together share one.
- **Voice budget:** 12 voices; when full, a new stroke plays only if it is larger than the smallest one running. Noise bands are normalised to their bandwidth, so narrow and broad parts sit at the intended levels.

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

Textures (noise, chatter, roar, crackle) are rendered once when the shared mix starts. Continuous loops are generated past their end and crossfaded so they don't click. The mix goes through a compressor, a gentle air lowpass and an outdoor space: a ground reflection, sparse early reflections and a short dark tail.
