# Specials

Each robot has one special: a long cinematic move, unlocked by a full energy meter and played as a cutscene. The shared runtime is `src/content/transformer/combat/special.ts` (types), `src/game/combat/` (energy, director, playback in `RobotCombat`) and the lens and world reactions; each character's special is `src/content/<character>/combat/special.ts` (data) and `special-fx.ts` (its effects).

## Energy (`game/combat/energy.ts`)

- A combo move charges the meter at its `strike` time (the moment its blow lands), not when it starts. The gains climb with the move: `ENERGY_PER_MOVE`, 0.34 per full combo, so the twelfth blow of the third full combo fills it. A level within 2 % of full snaps to full, so the last blow never leaves a sliver.
- The meter belongs to the player, not the car: switching cars keeps it.
- F spends all of it, only while the robot stands, is not jumping and is not already in a special. It may cut into a combo mid-move.

## HUD (`ui/energy-meter.ts`)

- Top left, a strip of 12 skewed cells in a small glass plate (the entry button's chamfer), lit from the left like shift lights. There is no text. The cells read one registered custom property (`--level`), so a change is one style write and CSS animates it.
- A gain flashes the strip. Full lights the diamond core, glows and runs a shine along the strip. Spending discharges it.
- It takes the playing robot's special colour (`RosterEntry.special`: the truck's plasma blue, the racer's white-hot orange, the Semi's coil violet, the Bat's afterburner gold). It shows only while the robot stands, changing with the hint pill (hud.md), and hides during the cutscene and the menu.
- The robot's hint pill always shows "F for special"; while the meter is full, the F key lights up. Both labels are the same line, so the pill keeps its width.
- Letterbox bars (`CinemaBars`) slide in on `body.cinematic`, sized toward 2.39:1 and capped at 12 % of the height. The garage pill hides under the same class.

## Playback (`RobotCombat.startSpecial`)

- A special is one `CombatMove` on the same channel machinery as the combo. It captures whatever pose the fight or the stance left, so it can start mid-move. It ends in the usual recovery (`ComboController.recover`).
- While it plays, `cinematic` is true. The combo is held, and the session takes no movement, attack, jump, transform or car switch; mouse look is ignored and Tab is refused.
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

- **Surface-aware marks**: the citadel's 0.5 m packed floor map supplies height and sand/ceramic/deck class. Marks follow that floor in the vertex stage and discard where it differs by more than 0.25 m from their birth level. Ceramic shows spalled substrate, cracks, soot and chipped gouges. Deck shows dents, temper colors, bright gouges and burrs; hits eject sparks rather than chunks. The special's authored contacts, timing and damage stay the same.
- **Fused glass** (`scorch.ts`): quartz sand melted by heat sets as dark olive glass (trinitite). A crater is a bowl, rim, ejecta blanket and soot rays, with a glass floor. Its cracks and radial fissures stay hot longest. A furrow is a trench of glass that can be reignited later by a heat front (`reignite`). Temperatures cool exponentially and glow through `rendering/blackbody.ts`: Planck colour with a compressed level, and nothing below about 800 K. Heat is gone in seconds; the marks fade over 110 s.
- The decal quads are mirrored differently for craters and furrows: a furrow's (u, v) frame is left-handed, so its corners run the other way to face up. Otherwise they are back-face culled.
- **Debris** (`debris.ts`): shadow-casting crust slabs and stones. Flight, tumble (Rodrigues about a per-chunk axis) and rest are evaluated on the GPU from birth data. They lie 24 s, then settle into the sand.
- **Base surge** (`Dust.surge`): a ring of sand rolling out and a column thrown up. Grit bursts with the debris.

## Shared combat effects (`content/transformer/combat/fx/`)

- **Billows:** fire, smoke and blast dust as one premultiplied sprite pool (One, OneMinusSrcAlpha blending, own premultiplication). A billow's gas cools with age: hot, it glows and hides little; cooled, it is opaque in proportion to its density, lit from above and warmed by the fire in it. Its whole flight is evaluated from its birth data.
- **BlastLight:** one point light per fighter, dark between flashes (it drives one of the scene's fixed light slots). Its flash decays in world time. Keep it within a few times the sun: 3000 turned the sand white across the frame.
- **HeatHaze:** hot air as soft billboards that read the frame drawn so far (`viewportSharedTexture`) through rising screen-space ripples. They are drawn last (render order 4) and depth tested, so only what lies behind a patch wavers. The offset scales with the patch's size over its distance, so the ripple is the same in the world at any range. The frame copy happens only while a patch is drawn, and the mesh is hidden when none is alive. Where it is used: the truck's jets while they burn, its overcharged axe head, over its cooling glass; the racer's power unit on the limiter, along its hanging arcs, over the burning ring and its centre.
- All three are warmed with the fighter (`warm`), as are the world's debris and the racer's arcs.

## Against the soldiers

A special's hits are far bigger than the combo's (`hits.ts`, enemies.md). They are marked `special`, which throws debris 30 % harder and scorches blast victims. Its blows before its last never destroy: a soldier they empty is held doomed in its flinch through the cutscene, and the last blow (`HitEvent.final`, the latest strike or blast) breaks every doomed soldier at once, in its reach or not. Nothing disintegrates mid-cinematic.

- **Skyfall**: the launch blows everything within 10 m flat. The impact kills everything within 22 m of the crater.
- **Red Line**: each cut marks what it passes through (70 damage) and the hairpins throw what they skid into. At the flick, the blast at the ring's centre (13.5 m) takes the rest, and whatever the cuts emptied beyond it breaks with it.
- **Juggernaut**: nothing is hit on the walk in. The stamp throws everything within 26 m of the robot straight up (lift 15). The barrage's strikes (every 0.45 s, all round, 30 m) re-launch whoever they catch (lift 5.5): a falling body's upward speed is reset (`Soldier.impact`), so they are juggled; spaced closer, the resets made them climb instead of hang. The finale's burst (32 m) is the last blow and breaks everything at once.

- **Descent**: the ring's cuts (16 damage every 0.14 s, aimed at its centre) mark whatever the vortex draws in (a pull on the centre, 24 m, from the first lap to just before the plunge). The plunge at the centre (20 m) is the last blow and breaks it all.

Soldiers cannot reach the robot during the cutscene (the target is absent).

## Skyfall (Cybertruck)

- The truck's thruster charge, taken to the sky. The jets are the `Thrusters.boost` override in three modes: back (the charge), down (lift-off) and up-and-back (the dive). One exhaust axis per mode.
- Beats: the face in the visor light, the load and ignition, a launch filmed low from outside its own dust, the apex hung in slow motion and filmed from below against the sky, the dive filmed from well off to the side (from the landing site the trail foreshortened to a blob), the impact wide and high enough to see the glass, the kneel, the rise, handback behind.
- The weapon reuses the charge's raise beside the helmet and its slam, which are proven clear of the body. The axe overcharges (`Weapon.charge`): the forging emission runs toward the head, churning, the light bar burns, and the fighter's light holds on (`Fighter.charged`).
- The impact centres the crater between the knee and the axe head, so the robot kneels in its glass. Its sound arrives late by distance (explosion at 21 m).

## Juggernaut (Semi)

- A calm walk into the crowd, then the gun. Beats: the face as the eyes and the chest's light bar blaze and the air brakes vent; the walk, five metres, filmed long and low as it comes at the lens and then tracked alongside, the colour draining; the stamp, filmed wide and low from the side; the gun forming; the barrage in slow motion (tempo 0.5); a push-in on the coils charging full; the finale's burst filling the sky, filmed wide from the side, the robot skidding back from the recoil; the hero pose with the smoking gun raised upright beside its head as the pieces and embers rain down; handback behind.
- **The walk** is four unhurried strides (about 2.8 m/s): upright, chest out, head level, the fists hanging and barely swinging opposite the legs, each heavy footfall shaking the frame. It replaced a charge, which read as silly and did not fit the character: the Semi is sure of itself.
- **The stamp:** the right knee comes up to the hip as the body rears back, and the foot is driven down beside the left. The ground heaves all round: a surge rolling out, cracks run out from the foot (cold furrows), a ring of sand thrown outward, crust flung up. A 0.3 tempo dip holds the moment. It replaced a rising double blow at the crowd ahead, which read badly.
- **The barrage turns a full circle** on the spot (the `turn` channel, eased), pivoting in short steps that keep the feet under the hips, because the stamp throws soldiers up all round it. While it fires the gun seeks (`seek` cue, `Gunnery.seek`): each round aims at a body in the air within 35° of the barrels (`CombatFrame.airborne`, `Horde.airborne`), and each cannon shot at the body nearest their line, bursting on it. So every body in the air is seen being hit as the turn sweeps the gun past it.
- The finale adds its own light, lens flash and an explosion heard from the wide shot's distance on top of the burst. Embers and burning fragments rain out of it for 5 s.
- Real length: about 13 s for 8.8 s of special time. `tests/special.test.ts` measures each special's real length from its tempo curve instead of assuming one.

## Descent (Bat)

- The afterburner taken to the sky, round a vortex. Beats: the eyes blaze as the spear forms, the colour draining; it springs up and throws a quick backflip (0.46 s), coming out face down and level as the jet lights; two laps of a ring 13 m across, low over the sand, the spear trailed at its right side (the arm down, the shaft on the diagonal down, out toward the centre and back, its point skimming 0.4 m over the sand), the air going round with it and drawing the crowd in (`vortex`, a pull on the centre); the jet bursts to full and it pulls up onto the flame, the spear hanging on the diagonal at its side, and climbs over the centre; at the top, in slow motion, a forward somersault; it drops feet first, the spear point down in the right hand out ahead, the hand shifting down the shaft as it falls, and drives it into the ground at the centre (the crater of glass, the surge, lances of light out along the ground); it kneels in the glass, rises, pulls the spear out.
- **The backflip is thrown, not staged:** it already turns as the feet leave the ground and turns fastest tucked (its rate follows 1 - 0.5 cos 2πu); the old smoothstep over 0.74 s started and ended at rest and read as a rigged roll.
- **The shaft swings its own way through the flip** (`Grip.aim`, in the heading's frame, while the fist rides with the body): turned rigidly with the body it came out of the flip pointing down the chest, 1.7 m into the sand.
- **The plunge is one-handed**, the fist out ahead and to the right: the breastplate leaves no room for both hands on an upright shaft before the chest (the off arm fell short and the reach projection dragged both hands into it), and an arm held along an upright shaft puts it through the gauntlet.
- **The ring is geometry** (`special.ts`): its centre and radius place the robot at angle phi on it and head it along the tangent (`90 - phi`); the keys are sampled from a constant-acceleration build-up, so the path's speed is the jet taking hold, then steady. The ring's hits are strikes every 0.14 s aimed at the centre (`aim` -90, the spear's side), throwing what they catch on round with the body.
- **The body's pitch only runs one way**: -280° through the backflip (face down is -280, not +80), back to -360 as it pulls up (upright on the flame), and forward through a whole somersault to 0 at the apex. The channel ends where it began, so nothing unwinds in the recovery; a flip authored the short way would have spun back through the body at the hand-back.
- **Flying face down:** the legs trail as free legs (`lz` above the pelvis's ground level, feet extended to about 150°), and `air` is the lowest foot's height, so it is set from the pelvis's intended arc and the legs' height at each key; otherwise the body would rise and fall with every change of the legs.
- **The spear rides the body through the flips** (`held`): the weapon channels are in the heading's frame, which the body's pitch does not turn, so a grip held still there had the torso turn through it. The grip (the fist and the point's direction) is held in the torso's frame and turned with the pitch into the channels at each key; of the equivalent yaw and pitch pairs each key takes the one nearest the last (the grips are converted in time order), so no key swings the shaft the long way round.
- The jet is the fighter's `burn` override; in flight the jet points back along the body and drives it. The vortex is drawn about the ring's centre, fixed on the sand (`mark`) before it leaves the ground.
- Real length: about 13.6 s for 10 s of special time.

## Red Line (Ferrari F1)

- An iaido draw taken to 65 m/s. The ring geometry in `special.ts` builds the path: four cuts through the centre, each with a key on it, and three right-hand hairpins outside the rim (225 degrees of heading each). Keys, legs and body poses are generated from named poses rather than typed out.
- The blade tip trails in the sand only in the hairpins. The furrows are traced from the actual tip below 0.4 m, so the glass is where the blade was. The cuts leave `SlashArcs`, ribbons recorded from the cutting edge and shaded as burning trajectories rather than as a sheet: a thin incandescent core along the tip's path, filaments of burning gas stretched along the cut and flickering, and a burn-away from the inner edge that leaves ragged, hot-edged tatters within a second. A filled ribbon read as a solid crescent. They shed embers and shimmer while they hang, and the flick sends a flare front along each one that burns the rest away.
- The power unit free-revs in neutral against its limiter in the stance: a square LFO cuts the level and pulls the pitch (`PowerUnit`, `neutral` rpm). It then follows the robot's own speed through the gears and runs down on the overrun. The special owns `F1Effects.rev` while it plays.
- The flick sets everything off: the arcs flare in cut order, the centre (marked as the first cut crosses it) goes up 0.1 s later, and fire runs along the furrows in the order they were cut.
- The stop shot stands off the robot's side, so the ring shows beside it rather than hidden behind it.
