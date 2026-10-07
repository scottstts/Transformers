# HUD readouts

The speedometer (`src/ui/speedometer.ts`) and the hit streak (`src/ui/hit-counter.ts`) follow the energy meter's language: the special's colour as the accent, chamfered glass plates, mono labels. They hide with the rest of the HUD before the game is ready, with the vehicle menu open and while paused. The speedometer also hides under a cutscene; the hit streak stays up through one. The session feeds them through two hooks (`onHits`, `onFrame`), wired in `attachControls`.

The bottom robot hint includes **E — Flash Move** alongside fight, guard, transformation, vehicle switching and special. Both energy-meter states share that label, keeping the hint's width stable when F becomes ready.

## Speedometer

- Bottom left, with no plate: the dial lies directly on the picture. An edgeless radial shade and dark drop shadows on the marks and text keep it readable over bright sand. A boxed glass plate looked heavy there.
- The energy plate, the speedometer and the hint pill's label change together on the robot's stance (`onStandingChange`): the speedometer shows in car form and through a transformation, the energy plate only in the stance, and both use the label's crossfade (out over 0.25 s, in after 0.1 s). The speedometer reads the speed over the ground, the forward and sideways velocity together, so a drift still counts.
- A 270° dial of 45 segments. Full scale is the car's boosted top speed rounded up to 20 km/h. Segments past the normal top speed are the ember stretch, reached only with the boost. km/h is the main readout and mph sits in the dial's open foot.
- It writes to the DOM only when the whole km/h changes: one custom property (`--v`) that every segment reads in CSS, plus two text nodes.

## Hit streak

- On the right, a third of the way up. It exists only during a streak: the first hit brings it in, and it fades out 3 s after the last hit. Nothing is on screen between streaks.
- Every enemy a blow catches adds one, so a sweep through four soldiers adds four.
- A special holds the streak open: its blows keep counting whatever the gaps between them, the rail stays full, and the 3 s start again when the cutscene ends (`HitCounter.hold`, from `onCinematicChange`).
- The streak's clock runs on played frames (`onFrame`'s real dt), so a pause holds it. The draining rail is a 3 s CSS animation that pauses with the game, which keeps it in step with the clock.
- A hit restarts the punch and the rail by toggling between twin keyframe names, so there is no forced reflow per hit. It runs hotter from 10 hits and glows from 30.
