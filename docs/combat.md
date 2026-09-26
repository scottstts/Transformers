# Robot combat

In robot form a left click (or the touch attack button) fights. Each robot has a four-move combo that climbs in intensity; its own powers take part in it (the truck's lift jets, the racer's power unit). Each landed blow (a move's `strike` time) charges the energy for the robot's special, a cinematic move on the same machinery (specials.md). The game side is `src/game/combat/`; the shared runtime is `src/content/transformer/combat/`; each character's moves and effects are `src/content/<character>/combat/`.

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
  - It is placed in the body frame: the heading, at the pelvis, from the main shoulder's rest place. The torso's twist and lean don't turn it.
  - In the chest frame (the first attempt), 60° of twist plus 46° of lean compounded with the weapon's own angles, and a cleave ended behind the robot. In the body frame, the authored arc is the arc on screen, and the arms and torso follow it.
  - The main hand is solved to the grip; the off hand solves onto the off grip where the weapon actually is.
  - With two hands engaged, the weapon wrist target is projected into both arms' shared reach before either arm is solved. This bounded, allocation-free correction preserves elbow flexion and prevents the off hand clamping short of the haft. Reach correction is not collision avoidance: authored arcs still need clearance checks.
- **Two-handed grips need the haft in front of the body.** With the head of the weapon up and back, the off grip sits behind the helmet, and the far arm would cross the face. So:
  - wind-ups are one-handed, and the second hand takes the haft after the strike or in front;
  - the truck's overhead raise stays one-handed and offset beside the helmet;
  - a chop that reaches the ground is one-handed too. The off grip is 0.95 m further down the haft, toward the head, and a haft steep enough to bite the sand puts it beyond the off arm; the reach projection then lifts the whole axe about 1.2 m clear of the ground. The free arm sweeps back against the chop instead;
  - the axe's pommel runs 0.9 m past the main hand: a haft leaning back toward the robot buries it in the chest plate, and a low carry at the hip must turn the head slightly inward (the pommel outward) and move the grip outward before it arrives, or the pommel passes through the hip;
  - recovery releases the off hand first, before lowering the weapon, so it cannot follow the haft across the face.
- **Feet** are a world-space planner (`feet.ts`). A foot stays exactly where it landed until a step lifts it, so root motion (a lunge, a charge) never skates it.
  - Steps are authored in the move's ground frame: the origin and heading where the move began.
  - A step with no lift is a skid: it follows the body's ease-in-out, so dragged feet trail the body rather than leading it.
  - A step with a `via` point is a kick.
  - Redirecting an unfinished step preserves its current height and toe pitch as well as its ground position and heading. The residual height/pitch fades into the new arc; a pivot or early chain cannot teleport a raised foot down to the sand.
  - A planted foot the body outruns rises onto its toe, pivoting about the sole's toe edge, instead of floating.
- **Aim (steering):** each move, chained or not, aims where the player steers as it starts: the movement keys or stick, camera-relative, else the way the robot faces (not the camera). Aim assist then turns it onto the nearest standing soldier within 8 m and 0.55 rad of a steered heading (1.0 rad of the facing). A move may turn the robot all the way round: the root turn settles in the move's first 0.2 s and, past 20°, both feet pivot into the new heading (0.12 / 0.17 s steps, the farther foot first). The old 40° / 26° limits made holding S behind a combo do nothing.
- **Movement takes the robot back** (`RobotCombat.release`, `ComboController.cancellable`): during recovery or at the move's grounded exit, holding a direction gives the gait ownership immediately. The pose hands back over 0.24 s (`active` is false while `loose`), and the weapon dissolves in 0.18 s before the overlay disappears. A click, guard or special re-plants the feet where the model shows them. Continuation is independent of this visual fade. Finishers can reform their weapon after a movement gap; an already formed weapon does not replay its forging sound.
- **Forward travel:** every move gains ground, including the jab and roundhouse. Completed move distances are 0.85 / 1.0 / 1.4 / 8.7 m for the truck and 0.6 / 0.75 / 1.05 / 10.3 m for the F1. Chaining early keeps the distance already travelled; recovery keeps that world position. Wind-ups load the pose without reversing root travel. Foot placements must be tuned alongside root distances.
- **Timing:** hips lead, spine follows, and chest follows through the strike. Punches keep a small elbow bend and rebound into guard instead of locking at full extension. The earliest attack links are 0.42 / 0.54 / 0.92 / 2.15 s for the truck and 0.28 / 0.66 / 0.68 / 1.64 s for F1. Grounded movement exits are 0.44 / 0.56 / 0.98 / 2.15 s and 0.30 / 0.66 / 0.74 / 1.58 s respectively. The roundhouse must finish its kicking-foot landing before releasing movement. F1's draw-cut transfers weight onto the striking side with hips, spine and chest turning in sequence; its dash finishes dissolving the sword before the loop window.
- **Truck cleave:** rear-hip compression and lateral weight shift precede hip rotation; the spine follows, then the chest, then the axe head. The lead foot lands before impact, and the rear foot catches the follow-through. The head accelerates from the loaded shoulder through the diagonal cut and remains low afterwards; raising it straight back to an upright guard would erase the impression of weight. The free arm counterbalances the swing. A dedicated `recovery` channel path holds the low weapon frame during dissolution, releases the main grip, and unwinds the wrist over the remaining recovery instead of dragging all channels straight to zero.
- **Truck finisher:** the charge takes 2.95 s, with the slam at 1.28 s and the loop/movement boundary at 2.15 s. The shorter drive feeds a side-offset overhead raise; the pelvis starts the downward effort before the spine and chest.
  - **The chop is a full-body hinge,** not an arm movement. The hips (about 28°), spine and chest (about 15° each) pitch forward over the lead knee while the knees absorb the landing (0.9 m drop). The extended arm then puts the blade tip 0.1–0.2 m into the sand about 4.5 m ahead. The earlier version kept the torso nearly upright, so the edge stopped 0.3 m above the ground and the axe ended held head-down in front of the chest.
  - **The finish is the pull-back.** The body stands up while the grip draws back and the weapon frame lowers, both keyed together. That keeps the head in the cut for about 1 m of drag before it lifts into a low carry at the right hip, edge forward. The axe dissolves there, and the empty hand is received at the carry's arm position.
  - The weapon frame rides the pelvis height, so any change to `hipDrop` during the drag needs matching `w.z` keys, or the head leaves the cut early.
  - The free arm's return from its counter-swing is spread over 0.65 s; faster returns trip the joint-speed test.
- **Rig continuity:** elbow planes follow the actual blended wrist target, including weapons. Partial wrist grips unwrap the relative quaternion through 180° instead of switching interpolation branches. This state resets when a hand releases; fully held wrists may rebase without changing orientation.
- **Recovery checks:** stopping after the truck's cleave now has a passing joint-speed bound alongside both unarmed exits. Both characters' finisher returns are checked for fast wrist/shoulder unwinds.
- **Hand-over:** the overlay blends with the gait by one weight: in over 0.12 s, out over the last 0.22 s of the recovery. Neutral arm channels are measured from the rig at rest, so the recovery ends in the gait's exact stance (a test checks this).

## Weapons (`weapon.ts`; geometry: weapons.md)

- The weapon hangs off the main hand's node at the grip. It exists only while a move wants it.
- **Forming:** a front runs out from the grip toward both ends, with a noise-ragged edge. The metal glows at the front and cools behind it, and the materials discard beyond it, so nothing is blended or sorted. Dissolving runs the same front back into the hand, tip first.
- **Timing:** a weapon forms only once the hand is where the weapon should be. Forming earlier swept the half-formed weapon through the shoulder.
- **Overcharge:** `Weapon.charge` (0..1) runs the forging afterglow back out along the metal toward the head, churning with noise (a special, specials.md).
- **Looks:**
  - The truck's axe forms from blue plasma (its jets' plasma). Its light-bar strip flares with swing speed.
  - The racer's sword forms from white-hot metal as it is drawn from the left hip, the draw becoming the slash. Sword draws are horizontal yaw sweeps: going through upright whipped the blade over the shoulder and through the torso.
- **Materials:** each weapon has forged copies of its character's materials. Compiling skips invisible objects, so the session warms the weapon, trail and sparks during boot and first-time car switches. Warmup forces the complete weapon and its cast-shadow path visible under the loading cover and submits real hidden frames, so shader pipelines and geometry uploads are complete before play resumes.

## Guard

- Holding the right mouse button (or the touch guard button) raises the guard. It is `CharacterCombat.guard`, a `CombatMove` whose keys ease into a defensive pose and then hold, played on the same channels. The truck uses a boxer's high guard; the racer crosses its forearms.
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

## Effects (`fighter.ts`, `fx/`, `audio/`)

- **Move cues:**
  - `weapon-in` / `weapon-out` (seconds);
  - `slam` (strength): dust ring where the edge reaches lowest, sparks, sound, camera kick, hit-stop;
  - a fighter with a `cut` width (the truck's axe, 0.32 m) cuts the ground wherever its edge goes below it. The gash is a cold furrow (`ContactEffects.furrow` with heat 0: trench and berms, no glass or soot). It spans every point the edge has reached along the line it first cut, and is re-laid as the drag extends it, so the bite shows at the blow. The F1 has no `cut`: its special lays its own hot furrows, which a cold one would cover;
  - camera: `kick`, `shake`, `punch`, `pull`, `stop`;
  - `servo` (a joint drive on the character's machine voice);
  - character cues: `boost` (the truck's jets), `ers` (the racer's power unit).
- **Trail:** the smear a fast edge leaves on film. It is a faint additive ribbon between the cutting edge's ends over about 0.1 s, sub-sampled between frames, and only above swing speed. A bright opaque sheet was rejected as unrealistic.
- **Sparks and embers:** one instanced pool. Flight (linear drag plus gravity, stopped on the sand) is evaluated in the vertex stage from birth data, so a burst uploads only its slots.
- **Light:** one point light per fighter lights the forming weapon. It stays in the scene at zero, like the thruster light, so the light count and the shaders never change.
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
  - Nothing is a percussive "hit".

## The moves

- **Cybertruck** (a brawler with an axe):
  1. A stepping right cross.
  2. A pivoting left hook (rear foot through).
  3. A rear-leg load with the axe forming over the right shoulder, then a hip-driven diagonal cleave into a long step. The free arm counterbalances it and the axe settles into a low carry.
  4. The thruster charge: the lift jets fire straight back (a combat override of `Thrusters`, the same plume and rocket voice), the feet plough about 7 m, a leap with an overhead raise beside the helmet, and a one-handed chop, the whole body hinged forward, that cuts into the sand; it drags the axe back out as it stands and carries it low at the hip while it dissolves.
- **Ferrari F1** (fast and light):
  1. A snap jab.
  2. A pivoting roundhouse, the support foot on its ball.
  3. The draw-cut from the left hip.
  4. The ERS dash:
     - the real power-unit voice fires up, screams through the gears and runs down (`F1Effects.rev` overrides the car-form drive);
     - the rain light strobes and the wheels on the legs spin;
     - a 9 m burst with a horizontal cut as it passes, a skid to a stop and a flick of the blade.

## Authoring

Tune moves with numbers first, then pictures:

```bash
node tools/fight-probe.mjs cybertruck 0,0.6,1.35,2.5 5 0.05
node tools/fight-sheet.mjs out/combo cybertruck 0,0.6,1.35,2.5 2.6:4.5:12 right,quarter 1.2
```

- **`fight-probe`** prints, over time and in the robot's frame: heading, pelvis, shoulders, hands, feet, ground lift and the weapon edge (its height shows whether a blade reaches the ground).
- **`fight-sheet`** renders contact sheets, one per view, with the camera following the robot; `zoom` below 1 frames the smaller F1.
- **`tests/combat.test.ts`** samples normal, early and late chains, loops, and recovery after move 3 at 120 Hz. Checks cover wrists, the full formed haft (including pommel), cutting edge, off-hand attachment and conservative chest/pelvis/head cores. Movement tests at 30/120 Hz resume both during the overlay fade and after it has ended, reverse aim, continue all four moves and loop, and verify armed strikes still have their weapon. Separate tests check finger enclosure, forward travel, recovery joint speeds, input-window crossings, continuation expiry, bounded velocity inheritance, interrupted foot arcs, and that the truck finisher cuts the ground at the blow (and only then). These are numeric checks, not a substitute for visual inspection of the meshes. Run them after every change to a move.
