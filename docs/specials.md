# Specials

Each robot has one special: a long cinematic move, unlocked by a full energy meter and played as a cutscene. The shared runtime is `src/content/transformer/combat/special.ts` (types), `src/game/combat/` (energy, director, playback in `RobotCombat`) and the lens and world reactions; each character's special is `src/content/<character>/combat/special.ts` (data) and `special-fx.ts` (its effects).

## Energy (`game/combat/energy.ts`)

- A combo move charges the meter at its `strike` time (the moment its blow lands), not when it starts. The gains climb with the move: `ENERGY_PER_MOVE`, 0.34 per full combo, so the twelfth blow of the third full combo fills it. A level within 2 % of full snaps to full, so the last blow never leaves a sliver.
- The meter belongs to the player, not the car: switching cars keeps it.
- F (desktop) or the touch special button spends all of it, only while the robot stands, is not jumping and is not already in a special. It may cut into a combo mid-move.

## HUD (`ui/energy-meter.ts`)

- Top left, a strip of 12 skewed cells in a small glass plate (the entry button's chamfer), lit from the left like shift lights. There is no text. The cells read one registered custom property (`--level`), so a change is one style write and CSS animates it.
- A gain flashes the strip. Full lights the diamond core, glows and runs a shine along the strip. Spending discharges it.
- It takes the playing robot's special colour (`RosterEntry.special`: the truck's plasma blue, the racer's white-hot orange). It dims when the robot is not standing, and hides during the cutscene and the menu.
- Touch: the corner meter is hidden, and the energy shows only on the special button, which sits left of attack in the same row. Its rim is a conic ring of the same level, and it glows while ready. The desktop hint pill adds "F special" only while the meter is full.
- Letterbox bars (`CinemaBars`) slide in on `body.cinematic`, sized toward 2.39:1 and capped at 12 % of the height. The garage pill and touch controls hide under the same class.

## Playback (`RobotCombat.startSpecial`)

- A special is one `CombatMove` on the same channel machinery as the combo. It captures whatever pose the fight or the stance left, so it can start mid-move. It ends in the usual recovery (`ComboController.recover`).
- While it plays, `cinematic` is true. The combo is held, and the session takes no movement, attack, jump, transform or car switch; mouse and touch look are ignored and Tab is refused.
- **Free legs.** Feet normally belong to the world planner (feet.ts), so a body flying 30 m, or crossing 13 m in 0.2 s, would stretch its legs back to where it took off. The `R.free` / `L.free` channels hand a foot to a target carried with the body (`lx`, `ly`, `lz`, `lp`). While a foot is fully free, the planner keeps re-planting it under that target, so when `free` eases back to 0 it lands and stays where it is. Author the landing with `lz` at 0 and `air` at 0 on the same frame.
- **Tempo.** The special's `tempo` curve (over special time) multiplies the world's clock: slow motion runs everything (pose, particles, decals, blast waves) slower, while the camera, lens flash and audio keep real time. Hit-stop still works on top.
- Keys may reach `MAX_KEYS` (48). Monotone cubics give a hard landing only if the last airborne key sits a frame before the ground; a key's slope at a turnaround is zero.

## Director (`game/combat/director.ts`)

- It plays the special's `shots` in the special's ground frame (origin and heading where it began), so the same cut frames it wherever it is played. Eye and look points are keyed separately, each in its own frame: `ground`, `body` (pelvis), `head`, or `weapon` (its head end). A shot can pan a fixed ground camera after a flying robot, optionally with operator `lag`.
- Shots cut hard by default. Every ease between two poses, including shot blends and the handback, orbits the pelvis: yaw about it on the short side, distance and height interpolated, looking at the blend of both look points. A linear blend from the robot's face to its back went straight through it.
- The follow camera keeps updating underneath. At `handback` it is swung to `handbackView` (behind the truck; in front of the racer, so the burning ring is behind it and W walks back toward it), and the last shot eases into it by the end.
- The camera never goes below 0.3 m. The fight's camera reactions (shake, kick, lens) apply after the director.

## Lens (`rendering/lens.ts`, via `CameraFx`)

- **Shockwave:** a refracting ring (the derivative of a Gaussian shell) around the blast's projection. Its radius follows Sedov-Taylor growth, R = 24 (E t^2)^(1/5), in world time. The post pass reads the scene through it with its own texture node. There is one wave at a time.
- **Flash:** exposure is lifted before tone mapping, so it blows out through the shoulder, and it decays in real time. A flash in world time lasted seconds in slow motion.
- **Zone:** the grade drains saturation to a quarter, steepens the curve and cools the shadows. `AudioMix.muffle` closes the mix's air lowpass (11 kHz to 520 Hz) with it.
- Keep emitters within a sane HDR range at close range. The visor or arcs at 3x crushed the bloom into halos.

## World reactions (desert, via `ContactEffects`)

- **Surface-aware marks**: the world knows where the fortress is paved (`PavedGround`, from the plan's aprons, roads, gate passages, bays, garage and hangar floors and helipads). The sand's marks are cut away under the slabs and concrete's marks drawn on each paving level instead: a spalled scar showing aggregate, radial and ring cracks, soot and rays, a scored gouge with chipped lips for a dragged edge; crust thrown off a slab is broken concrete. Each mark lists the (at most 8) paved shapes near it when it is laid and its fragments test only those: testing every shape across a crater's quad cost more than the mark. Before, the sand crater's depth bias drew it over the slabs.
- **Fused glass** (`scorch.ts`): quartz sand melted by heat sets as dark olive glass (trinitite). A crater is a bowl, rim, ejecta blanket and soot rays, with a glass floor. Its cracks and radial fissures stay hot longest. A furrow is a trench of glass that can be reignited later by a heat front (`reignite`). Temperatures cool exponentially and glow through `rendering/blackbody.ts`: Planck colour with a compressed level, and nothing below about 800 K. Heat is gone in seconds; the marks fade over 110 s.
- The decal quads are mirrored differently for craters and furrows: a furrow's (u, v) frame is left-handed, so its corners run the other way to face up. Otherwise they are back-face culled.
- **Debris** (`debris.ts`): shadow-casting crust slabs and stones. Flight, tumble (Rodrigues about a per-chunk axis) and rest are evaluated on the GPU from birth data. They lie 24 s, then settle into the sand.
- **Base surge** (`Dust.surge`): a ring of sand rolling out and a column thrown up. Grit bursts with the debris.

## Shared combat effects (`content/transformer/combat/fx/`)

- **Billows:** fire, smoke and blast dust as one premultiplied sprite pool (One, OneMinusSrcAlpha blending, own premultiplication). A billow's gas cools with age: hot, it glows and hides little; cooled, it is opaque in proportion to its density, lit from above and warmed by the fire in it. Its whole flight is evaluated from its birth data.
- **BlastLight:** one point light per fighter, kept at zero (constant light count). Its flash decays in world time. Keep it within a few times the sun: 3000 turned the sand white across the frame.
- **HeatHaze:** hot air as soft billboards that read the frame drawn so far (`viewportSharedTexture`) through rising screen-space ripples. They are drawn last (render order 4) and depth tested, so only what lies behind a patch wavers. The offset scales with the patch's size over its distance, so the ripple is the same in the world at any range. The frame copy happens only while a patch is drawn, and the mesh is hidden when none is alive. Where it is used: the truck's jets while they burn, its overcharged axe head, over its cooling glass; the racer's power unit on the limiter, along its hanging arcs, over the burning ring and its centre.
- All three are warmed with the fighter (`warm`), as are the world's debris and the racer's arcs.

## Against the soldiers

A special's hits are far bigger than the combo's (`hits.ts`, enemies.md). They are marked `special`, which throws debris 30 % harder and scorches blast victims. Its blows before its last never destroy: a soldier they empty is held doomed in its flinch through the cutscene, and the last blow (`HitEvent.final`, the latest strike or blast) breaks every doomed soldier at once, in its reach or not. Nothing disintegrates mid-cinematic.

- **Skyfall**: the launch blows everything within 10 m flat. The impact kills everything within 22 m of the crater.
- **Red Line**: each cut marks what it passes through (70 damage) and the hairpins throw what they skid into. At the flick, the blast at the ring's centre (13.5 m) takes the rest, and whatever the cuts emptied beyond it breaks with it.

Soldiers cannot reach the robot during the cutscene (the target is absent).

## Skyfall (Cybertruck)

- The truck's thruster charge, taken to the sky. The jets are the `Thrusters.boost` override in three modes: back (the charge), down (lift-off) and up-and-back (the dive). One exhaust axis per mode.
- Beats: the face in the visor light, the load and ignition, a launch filmed low from outside its own dust, the apex hung in slow motion and filmed from below against the sky, the dive filmed from well off to the side (from the landing site the trail foreshortened to a blob), the impact wide and high enough to see the glass, the kneel, the rise, handback behind.
- The weapon reuses the charge's raise beside the helmet and its slam, which are proven clear of the body. The axe overcharges (`Weapon.charge`): the forging emission runs toward the head, churning, the light bar burns, and the fighter's light holds on (`Fighter.charged`).
- The impact centres the crater between the knee and the axe head, so the robot kneels in its glass. Its sound arrives late by distance (explosion at 21 m).

## Red Line (Ferrari F1)

- An iaido draw taken to 65 m/s. The ring geometry in `special.ts` builds the path: four cuts through the centre, each with a key on it, and three right-hand hairpins outside the rim (225 degrees of heading each). Keys, legs and body poses are generated from named poses rather than typed out.
- The blade tip trails in the sand only in the hairpins. The furrows are traced from the actual tip below 0.4 m, so the glass is where the blade was. The cuts leave `SlashArcs`, ribbons recorded from the cutting edge and shaded as burning trajectories rather than as a sheet: a thin incandescent core along the tip's path, filaments of burning gas stretched along the cut and flickering, and a burn-away from the inner edge that leaves ragged, hot-edged tatters within a second. A filled ribbon read as a solid crescent. They shed embers and shimmer while they hang, and the flick sends a flare front along each one that burns the rest away.
- The power unit free-revs in neutral against its limiter in the stance: a square LFO cuts the level and pulls the pitch (`PowerUnit`, `neutral` rpm). It then follows the robot's own speed through the gears and runs down on the overrun. The special owns `F1Effects.rev` while it plays.
- The flick sets everything off: the arcs flare in cut order, the centre (marked as the first cut crosses it) goes up 0.1 s later, and fire runs along the furrows in the order they were cut.
- The stop shot stands off the robot's side, so the ring shows beside it rather than hidden behind it.
