# Robot combat

In robot form a left click fights. Each robot has a four-move combo that climbs in intensity; its own powers take part in it (the truck's lift jets, the racer's power unit, the Semi's gun, the Bat's afterburner). Each landed blow (a move's `strike` time) charges the energy for the robot's special, a cinematic move on the same machinery (specials.md). The game side is `src/game/combat/`; the shared runtime is `src/content/transformer/combat/`; each character's moves and effects are `src/content/<character>/combat/`.

## The combo (`game/combat/combo.ts`)

- One click, one move: 1, 1-2, 1-2-3, 1-2-3-4.
- A move chains the next when its chain window opens, as the strike settles. A click earlier in the move is buffered and fires as the window opens: mashing plays the combo at its authored cadence and no click is lost (an action-game input buffer; the old unbuffered throttle swallowed clicks and read as unresponsive). The window may run past the move's end while the last pose holds.
- Once the window closes, the combo recovers into the stance. A click anywhere in the recovery restarts from move 1 at once.
- The finisher (move 4) loops instead: a click in its window, which opens as soon as its weapon is gone and its blow has settled, or anywhere in the recovery after it, starts move 1 at once from the pose it is settling through. Chaining combos toward a full energy meter never waits for the stance.
- Each move has a grounded `cancelAt` boundary, independent of the next-attack window. Holding movement takes over there unless an attack is already buffered; holding guard takes priority over movement. Walking resumes immediately while the pose fades. Jumping, transforming and switching remain locked while an attack owns the body.
- A movement exit remembers the **next** attack for 0.85 s. Reposition and click during that interval to continue 1 → 2 → 3 → 4, including after the overlay has fully faded. A finisher continues at move 1. Waiting longer, a hard cancel, guard or special clears continuation. Ordinary stationary recovery still restarts at move 1.
- Input belongs to the frame interval: crossing a narrow chain window consumes its buffered press even if the frame ends beyond the window. A fresh press at recovery entry starts a new combo instead of disappearing.
- The special can cut into any move; when it ends the combo goes straight into its recovery (`ComboController.recover`).

## Pose (`pose.ts`, `overlay.ts`)

The fight is one flat vector of named channels (pelvis, torso, arms, weapon, heels, root motion, and the free legs the specials carry through the air, specials.md). A move starts every channel from its current value and passes through its keys. Channels it doesn't key ease back to neutral. Keys run through monotone cubics (`curves.ts`): no overshoot, so an arc authored through a few poses can't bulge through the body. Body and arm channels carry their analytic incoming velocity when it agrees with the next segment, bounded by the monotone Hermite slope limit. An opposing segment brakes at entry. Weapon frames, grip weights and free legs keep their authored entry slopes for clearance. Root velocity is rotated into the next move's ground frame; locomotion speed can feed entry, and the outgoing lunge can feed walking.

- **Fists:**
  - Each fist is authored as a direction, reach and elbow roll from its shoulder, in the chest frame: a torso twist carries the punch.
  - Arm channels are mirrored, so one set of numbers means the same move on either side.
  - Two-bone IK solves each arm.
  - Handle grips use a separate finger curl from punching fists, with thumb opposition. The handle axis sits inside the curled finger loop, rather than below a fully closed fist.
- **Weapon:**
  - A gun is held by pistol grips (`CombatBuild.pistol`): the grip runs across the fist, the barrels leave past the knuckles, the top faces the index finger. The same weapon channels place it; `w.pitch` 90 with `w.roll` 180 aims the barrels level ahead, top up.
  - It is placed in the body frame: the heading, at the pelvis, from the main shoulder's rest place. The torso's twist and lean don't turn it.
  - In the chest frame (the first attempt), 60° of twist plus 46° of lean compounded with the weapon's own angles, and a cleave ended behind the robot. In the body frame, the authored arc is the arc on screen, and the arms and torso follow it.
  - The main hand is solved to the grip; the off hand solves onto the off grip where the weapon actually is.
  - With two hands engaged, the weapon wrist target is projected into both arms' shared reach before either arm is solved. This bounded, allocation-free correction preserves elbow flexion and prevents the off hand clamping short of the haft. It measures the off grip from where the main hand holds the haft, after `w.slide`. Reach correction is not collision avoidance: authored arcs still need clearance checks.
- **Raised arms need an outward elbow side** (the arm channel `out`, 0..1). The default elbow side is the stance's (out, back, down) projected across the arm; an arm raised overhead and a little forward or across points almost straight away from it, so the projection spins and the upper arm, with the shoulder armour it carries (the truck's pauldron, shoulder gearbox and wheel pod), turns over in its socket in a frame. `out` hands the side to straight outward, where a raised arm's elbow goes, and `elbow` rolls from there. A move keys it on while the arm is low (the two sides nearly agree there) and off once the arm is back down; at 0 the solve is the stance's, so moves that leave it alone are unchanged. The guards hold their fists just short of that zone. `node tools/fight-probe.mjs` with `PROBE_DT` prints the elbows (`eR`, `eL`): an elbow moving far faster than its hand is a flip.
- **Two-handed grips need the haft in front of the body.** With the head of the weapon up and back, the off grip sits behind the helmet, and the far arm would cross the face. So:
  - wind-ups are one-handed, and the second hand takes the haft after the strike or in front;
  - the truck's combo raise stays one-handed and offset beside the helmet;
  - Skyfall's apex hold is two-handed with the haft laid up across to the left, each arm on its own side: the right fist over the right brow, the left over the left of the helmet, the blade high over the left shoulder. The truck's forearms carry the door and roof slabs (about a metre each) and its chest the vault and tailgate, so the fists stay apart, in front of the helmet and clear of the chest. Both arms take the outward elbow side (`out`, below) from early in the raise; the right keeps it through the dive and the strike and hands back as the axe bites, the left until it lets go of the haft. The edge is rolled to the front (`w.roll` -90). The off hand takes the haft once the axe has arrived overhead (its fist rises out to the side and over the top to the grip) and lets go as the dive tips the body over;
  - a chop that reaches the ground is one-handed too. The off grip is 0.95 m further down the haft, toward the head, and a haft steep enough to bite the sand puts it beyond the off arm; the reach projection then lifts the whole axe about 1.2 m clear of the ground. The free arm sweeps back against the chop instead;
  - the axe's pommel runs 0.9 m past the main hand: a haft leaning back toward the robot buries it in the chest plate, and a low carry at the hip must turn the head slightly inward (the pommel outward) and move the grip outward before it arrives, or the pommel passes through the hip;
  - recovery releases the off hand first, before lowering the weapon, so it cannot follow the haft across the face.
- **The Bat fights one-handed, the spear at its side** (`bat/combat/moves.ts`): the fist beside the right hip, the shaft on the diagonal, the point ahead and low; the free hand an open palm that balances every blow. A first two-handed hold (the left hand a metre up the shaft, the body turned side-on) put the right fist and the shaft into the stomach: the chest's breastplate reaches a metre ahead of the pelvis at chest height, so there is no room in front of it for a shaft held across, nor for two hands on an upright one.
  - **Where along the shaft the hand is** is its own channel (`w.slide`, shared): at the grip band at rest, at the middle for the spin, at the butt (0.1 m of it behind the fist) for thrusts and sweeps, which gives the whole 6.3 m of reach and runs the shaft out through the hand as a thrust drives. The weapon hangs off the overlay's live grip matrix, so the slide moves it.
  - **The wrist follows the forearm** (`CombatBuild.wristFollows`): the overlay picks the shaft's roll so the knuckles run on along the forearm the IK will give, and `w.roll` only turns them off that line. A pose names where the fist is, where the point goes and the slide.
  - **The arm must stay well off the shaft's line** (35° or more): the gauntlet is 0.39 m in radius at the wrist against the fist's 0.26 m offset, so a shaft nearly along the forearm puts whatever is behind the fist through it. Swung poses (`swing`) place the fist on a straight arm from the shoulder where the torso's turn and lean carry it, the arm lowered and the shaft level, the point trailing the hand into a sweep and leading it out; a bent arm at the hip let the elbow drop and the forearm run level along a level shaft (17° apart). Moving the slide while the arm swings drags the long butt through the arm: the hand goes to the butt while the arm hangs at the side, and back only once it hangs again.
  - Only the first move turns the forming shaft onto its line at once (`LINE_UP`); the others take it up formed from the last move's pose. The sweep's chain opens only once its loop is coming down the right side, so a spammed click starts the flurry from there.
  - A spin's turns stay in `w.yaw` while the hand holds the spear; they are taken off only after `w.wield` is 0, when the channels move nothing, so the next move never unwinds them through the wrist. The spin is over the head clear of everything above the shoulders (the fins reach 3.0 m above the pelvis, the shoulder wheel 2.8 m, the fist at 3.35 m), and it comes down only once the point has come round behind to the right, out ahead of the shoulder wheel.
  - `node tools/clash-probe.mjs bat <clicks>` tests the shaft, forearms, hands and legs against the robot's own triangles each frame and reports spans in move time (bat.test.ts runs the same test over the combo and the special); what it still reports are single frames of the butt cap brushing the gauntlet.
- **Feet** are a world-space planner (`feet.ts`). A foot stays exactly where it landed until a step lifts it, so root motion (a lunge, a charge) never skates it.
  - Steps are authored in the move's ground frame: the origin and heading where the move began.
  - A step with no lift is a skid: it follows the body's ease-in-out, so dragged feet trail the body rather than leading it.
  - A step with a `via` point is a kick.
  - Redirecting an unfinished step preserves its current height and toe pitch as well as its ground position and heading. The residual height/pitch fades into the new arc; a pivot or early chain cannot teleport a raised foot down to the sand.
  - A planted foot the body outruns rises onto its toe, pivoting about the sole's toe edge, instead of floating.
- **Aim (steering):** each move, chained or not, aims where the player steers as it starts: the movement keys or stick, camera-relative, else the way the robot faces (not the camera). Aim assist then turns it onto the nearest standing soldier within 8 m and 0.55 rad of a steered heading (1.0 rad of the facing). A move may turn the robot all the way round: the root turn settles in the move's first 0.2 s and, past 20°, both feet pivot into the new heading (0.12 / 0.17 s steps, the farther foot first). The old 40° / 26° limits made holding S behind a combo do nothing.
- **Movement takes the robot back** (`RobotCombat.release`, `ComboController.cancellable`): during recovery or at the move's grounded exit, holding a direction gives the gait ownership immediately. The pose hands back over 0.24 s (`active` is false while `loose`), and the weapon dissolves in 0.18 s before the overlay disappears. A click, guard or special re-plants the feet where the model shows them. Continuation is independent of this visual fade. Finishers can reform their weapon after a movement gap; an already formed weapon does not replay its forging sound.
- **Forward travel:** every move gains ground, including the jab and roundhouse. Completed move distances are 0.85 / 1.0 / 1.4 / 8.7 m for the truck, 0.6 / 0.75 / 1.05 / 10.3 m for the F1, 1.2 / 1.0 / 0.6 / 1.4 m for the Semi (its gun moves stand and fire: a step in, a lunge) and 0.95 / 0.9 / 1.15 / 1.3 m for the Bat (its spear reaches: lunges and steps in). Chaining early keeps the distance already travelled; recovery keeps that world position. Wind-ups load the pose without reversing root travel. Foot placements must be tuned alongside root distances.
- **Timing:** hips lead, spine follows, and chest follows through the strike. Punches keep a small elbow bend and rebound into guard instead of locking at full extension. The earliest attack links are 0.42 / 0.54 / 0.62 / 1.58 s for the truck and 0.22 / 0.53 / 0.42 / 1.08 s for F1. Grounded movement exits are 0.44 / 0.56 / 0.66 / 1.58 s and 0.24 / 0.53 / 0.46 / 1.02 s respectively. The roundhouse must finish its kicking-foot landing before releasing movement. F1's draw-cut transfers weight onto the striking side with hips, spine and chest turning in sequence; its dash finishes dissolving the sword before the loop window. The sword forms only once the hand holds the hilt (`w.wield` complete), and the weapon channels reach the hip before the wield ramp starts, which keeps the forming haft and the hand clear of the chest.
- **Truck cleave:** rear-hip compression and lateral weight shift precede hip rotation; the spine follows, then the chest, then the axe head. The lead foot lands before impact, and the rear foot catches the follow-through. The head accelerates from the loaded shoulder through the diagonal cut and remains low afterwards; raising it straight back to an upright guard would erase the impression of weight. The free arm counterbalances the swing. A dedicated `recovery` channel path holds the low weapon frame during dissolution, releases the main grip, and unwinds the wrist over the remaining recovery instead of dragging all channels straight to zero.
- **The truck's axe snaps** like the racer's sword. The cleave's coil over the shoulder tightens and holds, then the head goes through about 166° in 0.1 s to the bite at 0.48 s, with a hit-stop and a camera punch; the axe forms by 0.41 s.
- **Truck finisher:** the charge takes 2.2 s: the skid ends at 0.46 s, the leap hangs a beat at its top (0.72 s) with the axe cocked, the chop comes down in 0.2 s to the slam at 0.92 s, and the loop/movement boundary is at 1.58 s, as the axe finishes dissolving. The shorter drive feeds a side-offset overhead raise; the pelvis starts the downward effort before the spine and chest.
  - **The chop is a full-body hinge,** not an arm movement. The hips (about 28°), spine and chest (about 15° each) pitch forward over the lead knee while the knees absorb the landing (0.9 m drop). The extended arm then puts the blade tip 0.1–0.2 m into the sand about 4.5 m ahead. The earlier version kept the torso nearly upright, so the edge stopped 0.3 m above the ground and the axe ended held head-down in front of the chest.
  - **The finish is the pull-back.** The body stands up while the grip draws back and the weapon frame lowers, both keyed together. That keeps the head in the cut for about 1 m of drag before it lifts into a low carry at the right hip, edge forward. The axe dissolves there, and the empty hand is received at the carry's arm position.
  - The weapon frame rides the pelvis height, so any change to `hipDrop` during the drag needs matching `w.z` keys, or the head leaves the cut early.
  - The free arm's return from its counter-swing is spread over 0.65 s; faster returns trip the joint-speed test.
- **Rig continuity:** elbow planes follow the actual blended wrist target, including weapons. Partial wrist grips unwrap the relative quaternion through 180° instead of switching interpolation branches. This state resets when a hand releases; fully held wrists may rebase without changing orientation.
- **Recovery checks:** stopping after the truck's cleave now has a passing joint-speed bound alongside both unarmed exits. Both characters' finisher returns are checked for fast wrist/shoulder unwinds.
- **Hand-over:** the overlay blends with the gait by one weight: in over 0.12 s, out over the last 0.22 s of the recovery. Neutral arm channels are measured from the rig at rest, so the recovery ends in the gait's exact stance (a test checks this).

## Weapons (`weapon.ts`; geometry: weapons.md)

- The Semi's gun is held one-handed, braced along the forearm like an arm cannon. The robot's shoulders stand 3.2 m apart against 2.7 m arms, so the left hand can't reach the foregrip in front of the body (it would need about 3.4-3.9 m). Its `w.two` stays 0 and the free arm balances or guards.

- The weapon hangs off the main hand's node at the grip. It exists only while a move wants it.
- **Forming:** a front runs out from the grip toward both ends, with a noise-ragged edge. The metal glows at the front and cools behind it, and the materials discard beyond it, so nothing is blended or sorted. Dissolving runs the same front back into the hand, tip first.
- **Timing:** a weapon forms only once the hand is where the weapon should be. Forming earlier swept the half-formed weapon through the shoulder.
- **Overcharge:** `Weapon.charge` (0..1) runs the forging afterglow back out along the metal toward the head, churning with noise (a special, specials.md).
- **Looks:**
  - The truck's axe forms from blue plasma (its jets' plasma). Its light-bar strip flares with swing speed.
  - The racer's sword forms from white-hot metal as it is drawn from the left hip, the draw becoming the slash. Sword draws are horizontal yaw sweeps: going through upright whipped the blade over the shoulder and through the torso.
  - The Semi's gun forms from the coils' violet discharge. Its coils (`glow`) glow with their charge.
  - The Bat's spear forms from the afterburner's orange fire; a special overcharges it as it climbs, and it sheds sparks and shimmers the air round its head.
- **No trail for a gun:** `FighterStyle.trail` is optional; the Semi has none (a swung gun is not an edge).
- **Materials:** each weapon has forged copies of its character's materials. Compiling skips invisible objects, so the session warms the weapon, trail and sparks during boot and first-time car switches. Warmup forces the complete weapon and its cast-shadow path visible under the loading cover and submits a real hidden draw, so shader pipelines and geometry uploads are complete before play resumes. On a first car switch that draw happens before ordinary frame updates can hide idle effects again; this also covers the Semi's flashes, tracers and casings before combo 3 fires.

## The combat contract (`game/combat/contract.ts`)

How every robot and every enemy interact, through the shared machinery only, so a new robot or enemy follows it by using that machinery (robots' blows as `HitEvent`s and `PullEvent`s marked `special` in a special; enemies as `Soldier`s; enemy blows through the horde):

1. **Enemies mid-combo:** an enemy in the middle of its combo (`Soldier.inCombo`: the commander's combo; a soldier's slash is not one) cannot be interrupted, except by a special's blow or vacuum. Other blows still take its health, and empty health destroys it (rule 4 aside).
2. **Enemies otherwise:** every enemy takes every hit effect a soldier does through the same code: flinch, knock-back, launch, fall, vacuum seizure and the body blows (walls, barging, bowling). Its weight (`UnitTuning.push`, 1 a soldier's, 0.4 the commander's) sizes how far it is knocked and lifted, along with its own launch threshold and how long it lies. A special's lift reaches every enemy whole, at a soldier's threshold, so a special throws them all as high.
3. **The robot:** the commander's knock-back (its combo's fourth move) interrupts whatever a robot is doing on its feet, a combo included, except a special or a raised guard.
4. **The special's hold:** in a special, an enemy its blows (or anything else) empty is held, not destroyed. Soldiers and the commander alike break apart at the special's last blow, or as it ends (`enemyHeld`).

`tests/contract.test.ts` runs every robot in the roster against it:
- each of its combo and special blows on a soldier and on an idle commander (the same reaction, the commander pushed by its share and thrown as high by a special);
- on the commander mid-combo (only the special's interrupt);
- its special's hold on both until the last blow;
- the knock-back in its combo, standing, in its special and behind its guard.

## Knock-back

The commander's whirl knocks the robot back unless it guards (`RobotCombat.knockback`, `transformer/combat/knockback.ts`; commander.md): one shared move scaled by each robot's hip height and stance, 0.6 s with no input, then movement or a click takes it back.

## Guard

- Holding the right mouse button raises the guard. It is `CharacterCombat.guard`, a `CombatMove` whose keys ease into a defensive pose and then hold, played on the same channels. The truck uses a boxer's high guard; the racer crosses its forearms.
- The guard rises whenever no move is playing, or a move could be cut short by movement (combo.ts `cancellable`): a combo's recovery gives way to it. A click from the guard starts move 1 from the guard pose. Releasing it goes through the normal recovery. A special drops it.
- While guarding, the fight owns the robot (no walking, jumping or transforming) and `RobotCombat.guarded` is true.
- **Shield** (`fx/shield.ts`): a sphere of glowing hexagonal tiles, in the character's special colour, sunk a little into the sand.
  - The tiles are geometry: a Goldberg tiling (the dual of a geodesic sphere, frequency 8), so hexagons keep an even size everywhere. An angular hex mapping pinched at the top. Each tile's vertices carry its centre and seed, and an edge coordinate (0 centre, 1 outline). The shader draws thin filtered outlines and lights whole tiles.
  - At rest only the outlines glow, faint and gathering at the silhouette; the tiles breathe barely and a band of light climbs the field every 2.8 s. Where the sphere enters the sand a continuous seam of light (filtered by its footprint) marks the cut. A blow flares the tiles round it toward white and sends a ring of lit tiles across the field. Tiles pop in from the ground up when it forms.
  - Keep the levels low. A bright Fresnel fill read as a milky glass bubble, and bright outlines (twice) bloomed to white with the tint lost.
  - Shape: a true sphere, never an ellipsoid. Its centre stands over the pelvis at 42 % of the robot's height; its radius is the farthest part-bounds corner from there plus 0.4 m, measured only while it forms (it may only grow then) and held rigid afterwards. The earlier ellipsoid refitted every frame read as a squashed egg.
  - `guardReach` gives its radius at a soldier's height; the soldiers' ring and slash reach move outside it (enemies.md).
- `CombatEffects.struck` shows an enemy blow: on the shield (flare, sparks thrown back off it, the field's thump) or, unguarded, on the armour (sparks off the steel, a scrape, a small camera kick). The robot takes no damage.
- `CombatEffects.ambient` keeps the sparks and the dropping shield running on frames outside the fight.

## Hits

- Each move's effect on enemies is data beside its keys (`<character>/combat/hits.ts`, types in `transformer/combat/hits.ts`): sector strikes at a time, sweeps over a window, radial blasts at ground points. `RobotCombat` emits them as `HitEvent`s at the move's own time, in its ground frame, through `onHit`.
- Blows are volumes on the ground in front of the robot rather than limb paths: the robots stand head and shoulders over the 3 m soldiers. See enemies.md for how soldiers take them, and `aimAssist` for the soft turn toward a nearby soldier.
- Damage is tuned against a soldier's 300 health: a combo's first three blows leave a soldier standing (flinching blow by blow), its finisher takes it down. Retuning a move's damage changes where in the combo soldiers fall.
- **Pulls** (a vacuum): over a window, everything within a radius of a ground point (in the move's ground frame, or `ahead` of the standing point as the body moves) is drawn toward it at up to a speed, without damage. `RobotCombat.onPull` hands one `PullEvent` per frame to `Horde.pull`; a pulled soldier staggers (it cannot drive against it) and slides in on its wheels, slowing as it arrives (speed proportional to distance, so the crowd gathers instead of overshooting). The Bat's finisher and special draw the crowd in before their big blows.
- **Bite:** a landed strike gives a moment of hit-stop. A flurry's strikes (the Bat's, a dozen within a second) set `bite: false`: stops every 95 ms slowed the flurry to half speed.

## Effects (`fighter.ts`, `fx/`, `audio/`)

- **Move cues:**
  - `weapon-in` / `weapon-out` (seconds);
  - `slam` (strength): dust ring where the edge reaches lowest, sparks, sound, camera kick, hit-stop;
  - a fighter with a `cut` width (the truck's axe, 0.32 m) cuts the ground wherever its edge goes below it. The gash is a cold furrow (`ContactEffects.furrow` with heat 0: trench and berms, no glass or soot). It spans every point the edge has reached along the line it first cut, and is re-laid as the drag extends it, so the bite shows at the blow. The F1 has no `cut`: its special lays its own hot furrows, which a cold one would cover;
  - camera: `kick`, `shake`, `punch`, `pull`, `stop`;
  - `servo` (a joint drive on the character's machine voice);
  - character cues: `boost` (the truck's jets), `ers` (the racer's power unit).
- **Gun cues** (Semi, `semi/combat/gunnery.ts`): `fire` (1/0), `charge` (0..1 the coils), `fuse` (m: the next cannon shot bursts in the air that far out if it meets nothing first), `cannon` (strength); `gust` is a kick's blast of air throwing the sand ahead.
- **Trail:** the smear a fast edge leaves on film. It is a faint additive ribbon between the cutting edge's ends over about 0.1 s, sub-sampled between frames, and only above swing speed. A bright opaque sheet was rejected as unrealistic.
- **Sparks and embers:** one instanced pool. Flight (linear drag plus gravity, stopped on the sand) is evaluated in the vertex stage from birth data, so a burst uploads only its slots.
- **Light:** one point light per fighter lights the forming weapon. It is dark between uses and, like every character light, drives one of the scene's fixed light slots (rendering-and-boot.md), so the scene's lights and shaders never change.
- **Camera** (`game/combat/camera-fx.ts`): applied after the follow camera and never fed back into it.
  - A kick is a spring along the view.
  - Shakes are bounded sine sums.
  - The lens punch and pull-back ease in and out.
  - Hit-stop slows the world's clock (fight, gait, effects); the camera keeps real time.
- **Sound:**
  - **Swing voice:** flow noise off the fastest fist, foot or edge. Level goes with speed cubed, and the band slides up with speed (a turbulent body band plus an edge band). The truck's is low and heavy, the racer's thinner.
  - **Forming and dissolving:** a torch-like roaring hiss with crackle.
  - **Slam:** ground pressure, thump, sand thrown up and raining back.
  - **Fighting footfalls** plant the foot (`plantFoot`: dust, footprint, shake at the fighting style's share of a running step) and play the character's own footfall at the move's step strength.
  - The robot's side has no percussive "hit"; a blow landing on soldiers sounds from the soldiers' side (enemies.md, Sound: the blows).
- **The Semi's gun** is synthesised from two recordings (`ref_sounds/`, never shipped): `tools/gun-model.mjs` fits spectral-envelope models (28 third-octave bands over time, `audio/spectral.ts`, the method of the soldiers' blows) and writes `semi/audio/gun-models.ts`.
  - **Machine gun:** one period of the burst from a shot's onset, averaged over the recording's inner shots. It carries the previous shots' tails as the recording does, so its takes tile at the recorded rate (677 rounds a minute, 88.6 ms). The takes may not stretch in time, or the burst would drift off its rate. Rounds are scheduled at their offset within the frame so frame timing never makes the burst stutter. Slow motion stretches the gaps, never the rounds. A tail take rings on when it stops.
  - **Cannon:** the fitted cannon shot, delayed (343 m/s) and dulled by its distance. A burst's own explosion layers the shared `explosion` on it.
  - **Coils charging:** a transformer's hum (brown noise through narrow bands at 100 and 200 Hz, not an oscillator) and corona crackle; levels only.
  - The takes render once, about 150 ms, under the loading cover.
- **The Bat's spear** is synthesised the same way from two recordings (`ref_sounds/spear_poke.mp3`, `spear_slash.mp3`, never shipped): `tools/spear-model.mjs` fits the thrust (a rising rush and the thud as it goes home) and the slash (a rush, then the blade's ring: six partials between 325 Hz and 3.7 kHz, measured through narrow bands with the broadband noise they also pass taken off, median-smoothed) and writes `bat/combat/audio/spear-models.ts`. A take is cued so its loudest moment (`POKE_PEAK`, `SLASH_PEAK`) falls on the blow; takes never repeat back to back, so a flurry of a dozen thrusts does not loop audibly. `--compare` prints a take's error against the recordings (about 4 dB).

## The moves

- **Cybertruck** (a brawler with an axe):
  1. A stepping right cross.
  2. A pivoting left hook (rear foot through).
  3. A rear-leg load with the axe forming over the right shoulder, then a hip-driven diagonal cleave into a long step. The free arm counterbalances it and the axe settles into a low carry.
  4. The thruster charge: the lift jets fire straight back (a combat override of `Thrusters`, the same plume and rocket voice), the feet plough about 7 m, a leap with an overhead raise beside the helmet, and a one-handed chop, the whole body hinged forward, that cuts into the sand; it drags the axe back out as it stands and carries it low at the hip while it dissolves.
- **Semi** (kicks from seven metres up, then the gun; data in `semi/combat/`):
  1. A push kick: the right knee chambers to hip height and the sole drives straight out, the body leaning back over the left leg; a gust of sand thrown ahead.
  2. A turning side kick: the hips turn right on the pivoting right foot and the left heel drives out at a soldier's head height, the torso leaning away, the eyes on the target.
  3. The sweep: the gun forms as the right arm comes to the hip; a braced wide step, then the machine gun swept from right to left across the front (±38°, barrels 20° down: the rounds strike the crowd pressing in, and the sand about 11 m out). The torso turns with it and the left arm is out against the recoil.
  4. The cannon: a long lunge, the gun raised straight out from the shoulder and aimed 38° down, the coils charge, the blast. The gun bucks up, the body rocks back over the rear leg and the ground about 10 m ahead goes up; its hit is the whole half circle ahead (20 m), thrown as any blow is. The smoking gun comes down to the hip and dissolves.
  - **Rounds are seen, not traced for damage.** Every round is a tracer from the rotary muzzle along the posed barrels, with a little scatter, to whatever it strikes: the first soldier's body along it (`CombatFrame.probe`, `Horde.ray`: a sphere about each chest, which follows a soldier thrown into the air), the sand, or nothing within 90 m. Rounds are slowed to 420 m/s so they read as streaks. Each has a muzzle flash and its light, a casing thrown from the port, and every second one a wisp of smoke. The damage is the move's authored strikes: every soldier in the half circle ahead (22 m) is hit round by round (11 strikes of 11) and pushed straight back from the robot, out along the arc (`StrikeHit.outward`: radial like a blast, without a blast's damage falloff). A run of narrow strikes following the aim picked out too few targets.
  - **The cannon's slug** leaves its ionised channel hanging along the whole path (a lingering tracer). It bursts on the first body, on the sand (a crater, surge and thrown crust) or at its fuse in the air.
  - **Guard:** the right forearm across the chest like a bar, the left fist up by the face.
- **Bat** (all spear, formed in the right hand out of the afterburner's fire; data in `bat/combat/`):
  1. The thrust: the body coils right, the left foot steps in, hips and shoulders turn through and the arm drives the shaft out through the hand to its butt, the point home nine metres out; the palm swings back; the point circles as it comes back to the side.
  2. The sweep, backhand: wound hard left, the arm reaching across the front and the point trailing out behind to the left, then unwound flat round the whole front, the point trailing the hand in and leading it out, and the body opens wide to the right, the spear rising out behind it; it swings on round the outside of the right side to the rest.
  3. The flurry: a long step in, leaning over the lead knee, twelve straight-arm thrusts in 1.1 s at aims across the front, each leaving a lance smeared out past the point, three phantoms fanned round it, two shock rings cracking open round the point (`fx/rings.ts`) and heat shimmer; every soldier in the front half circle (8.8 m) is hit thrust by thrust (9 damage, no hit-stops), then a coil and the last, heaviest thrust from a deeper lunge.
  4. The maelstrom: the spear up nearly upright at the right shoulder, tipped level overhead and spun clockwise on the long lever, the hand sliding in to the middle as it speeds up (1.6 to 4.2 turns a second), sand drawn in toward a point 3.6 m ahead, turning with it (`fx/vortex.ts`, a pull within 17 m); still turning it comes forward over the head and down across the front to the left, run out to its butt, and one broad backhand sweep crosses the front to the right (about 200°, low, a wall of air and sand, `crescent`), the body opened wide and held a beat, then round the outside into a low closing stance.
  - **The sweeps go to the right.** Swung from the right hand toward the left, the arm closed across the chest and cramped the swing; backhand, the arm reaches across only at the wind-up and the swing opens the body out to the right, a longer arc and a wide finish. Swinging back to the rest from there, the spear goes round the outside of the right side, never back across the body.
  - **They snap.** The coil tightens a moment at the wind-up, then the whole arc to the open finish goes at once: 0.2 s in the sweep, 0.14 s in the maelstrom (about 1900 and 2500° a second across the front), with a hit-stop, a camera punch and the wall of air (`crescent`) at the blow. Spread over 0.4 s they read as slow and soft.
  - **Guard:** the spear level across the front in both hands, low and a metre out (under the breastplate), the hand slid 0.8 m toward the butt so the hands stand wide.
- **Ferrari F1** (fast and light):
  1. A snap jab.
  2. A pivoting roundhouse, the support foot on its ball.
  3. The draw-cut from the left hip: coiled over the hilt, the coil held a beat while the sword forms, then the blade crosses the whole front in 0.1 s (about 2500° a second) and opens wide to the right, with a hit-stop, a camera punch and kick at the blow.
  4. The ERS dash:
     - the real power-unit voice fires up, screams through the gears and runs down (`F1Effects.rev` overrides the car-form drive);
     - the rain light strobes and the wheels on the legs spin;
     - a 9 m burst in 0.2 s with a horizontal cut as it passes, a skid to a stop and a flick of the blade, 1.3 s in all.
  - **The racer snaps.** Its jab and roundhouse land at 0.16 and 0.32 s, the draw-cut at 0.26 s and the dash's cut at 0.38 s; every link opens as the follow-through settles.

## Authoring

Tune moves with numbers first, then pictures:

```bash
node tools/fight-probe.mjs cybertruck 0,0.6,1.35,2.5 5 0.05
node tools/fight-sheet.mjs out/combo cybertruck 0,0.6,1.35,2.5 2.6:4.5:12 right,quarter 1.2
```

- **`fight-probe`** prints, over time and in the robot's frame: heading, pelvis, shoulders, hands, feet, ground lift and the weapon edge (its height shows whether a blade reaches the ground). It also prints the head, the weapon's head end and off grip, how far the off hand's grip sits from it (`gapL`: a two-handed hold that falls short) and which way the edge faces (`blade`). `PROBE_DT` steps it finer (the combat tests run at 1/120), `PROBE_CH` appends pose channels, `PROBE_PARTS` prints the posed bounds of matching body nodes and `PROBE_PROFILE=<x>` the body's top outline in the fore-aft plane at that lateral offset, which a raised weapon must clear.
- **`fight-sheet`** renders contact sheets, one per view, with the camera following the robot; `zoom` below 1 frames the smaller F1.
- **`tests/combat.test.ts`** samples normal, early and late chains, loops, and recovery after move 3 at 120 Hz. Checks cover wrists, the full formed haft (including pommel), cutting edge, off-hand attachment and conservative chest/pelvis/head cores. Movement tests at 30/120 Hz resume both during the overlay fade and after it has ended, reverse aim, continue all four moves and loop, and verify armed strikes still have their weapon. Separate tests check finger enclosure, forward travel, recovery joint speeds, input-window crossings, continuation expiry, bounded velocity inheritance, interrupted foot arcs, and that the truck finisher cuts the ground at the blow (and only then). These are numeric checks, not a substitute for visual inspection of the meshes. Run them after every change to a move.
