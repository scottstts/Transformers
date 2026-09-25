# Robot combat

In robot form a left click (or the touch attack button) fights. Each robot has a four-move combo that climbs in intensity; its own powers take part in it (the truck's lift jets, the racer's power unit). Each landed blow (a move's `strike` time) charges the energy for the robot's special, a cinematic move on the same machinery (specials.md). The game side is `src/game/combat/`; the shared runtime is `src/content/transformer/combat/`; each character's moves and effects are `src/content/<character>/combat/`.

## The combo (`game/combat/combo.ts`)

- One click, one move: 1, 1-2, 1-2-3, 1-2-3-4.
- A move takes the next click only inside its chain window, which opens as the strike settles. An earlier click is ignored: that is the throttle, and it does not queue. The window may run past the move's end while the last pose holds.
- Once the window closes, the combo recovers into the stance. A click during the recovery restarts from move 1, but only after 35 % of it (so a mash right after the window doesn't restart at once).
- The finisher (move 4) loops instead: a click in its window, which opens as soon as its weapon is gone and its blow has settled, or anywhere in the recovery after it, starts move 1 at once from the pose it is settling through. Chaining combos toward a full energy meter never waits for the stance.
- While fighting, the robot doesn't walk, jump or transform, and the car can't be switched.
- The special can cut into any move; when it ends the combo goes straight into its recovery (`ComboController.recover`).

## Pose (`pose.ts`, `overlay.ts`)

The fight is one flat vector of named channels (pelvis, torso, arms, weapon, heels, root motion, and the free legs the specials carry through the air, specials.md). A move starts every channel from its current value and passes through its keys. Channels it doesn't key ease back to neutral. That is how chained moves and the recovery stay continuous. Keys run through monotone cubics (`curves.ts`): no overshoot, so an arc authored through a few poses can't bulge through the body.

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
  - the truck's overhead raise stays one-handed and offset beside the helmet; the off hand braces the haft after the downward strike, then releases while the axe stays low;
  - the post-slam brace holds the haft upright and well forward: the axe's pommel runs 0.9 m past the main hand, so a haft leaning back toward the robot buries it in the chest plate;
  - recovery releases the off hand first, before lowering the weapon, so it cannot follow the haft across the face.
- **Feet** are a world-space planner (`feet.ts`). A foot stays exactly where it landed until a step lifts it, so root motion (a lunge, a charge) never skates it.
  - Steps are authored in the move's ground frame: the origin and heading where the move began.
  - A step with no lift is a skid: it follows the body's ease-in-out, so dragged feet trail the body rather than leading it.
  - A step with a `via` point is a kick.
  - A planted foot the body outruns rises onto its toe, pivoting about the sole's toe edge, instead of floating.
- **Aim:** each move turns toward the camera's heading, by at most 40° at the first move and 26° when chained. Feet that stay planted limit how far the hips can turn.
- **Forward travel:** every move gains ground, including the jab and roundhouse. Completed move distances are 0.85 / 1.0 / 1.4 / 8.7 m for the truck and 0.6 / 0.75 / 1.05 / 10.3 m for the F1. Chaining early keeps the distance already travelled; recovery keeps that world position. Wind-ups load the pose without reversing root travel. Foot placements must be tuned alongside root distances.
- **Timing:** hips lead, spine follows, and chest follows through the strike. Punches keep a small elbow bend and rebound into guard instead of locking at full extension. The F1 dash cuts farther forward and lower, keeping the pommel clear of its chest.
- **Truck finisher:** the charge takes 3.25 s, with the slam at 1.58 s; the axe is gone and the main hand released by 2.4 s, when its window opens (the next combo can start 0.8 s after the blow, where it used to wait 2.2 s). The descent, knee compression, supporting-hand brace, release and two regathering steps are separate phases. The axe stays low and dissolves before its main-hand IK releases into a matching empty-hand guard; recovery then lowers the arm. Wrist channels retain the holding orientation during release and unwind afterwards. Compressing the off hand's grab, release and unwind below about 0.35 s each trips the arm-speed tests; the time was taken from the body's settle and the weapon's release instead, and the window lets a new combo take over the unwind.
- **Rig continuity:** elbow planes follow the actual blended wrist target, including weapons. Partial wrist grips unwrap the relative quaternion through 180° instead of switching interpolation branches. This state resets when a hand releases; fully held wrists may rebase without changing orientation.
- **Known remaining tuning:** stopping after the truck's cleave (move 3) still produces a fast upper-arm recovery. Its continuity test records this as an expected failure; the finisher and the two unarmed exits have passing speed bounds.
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
- The guard rises whenever no move is playing: a combo's recovery gives way to it. A click from the guard starts move 1 from the guard pose. Releasing it goes through the normal recovery. A special drops it.
- While guarding, the fight owns the robot (no walking, jumping or transforming) and `RobotCombat.guarded` is true.
- **Shield** (`fx/shield.ts`): an ellipsoidal field of glowing hexagonal tiles, in the character's special colour.
  - The tiles are geometry: a Goldberg tiling (the dual of a geodesic sphere, frequency 8), so hexagons keep an even size everywhere. An angular hex mapping pinched at the top. Each tile's vertices carry its centre and seed, and an edge coordinate (0 centre, 1 outline). The shader draws thin filtered outlines and lights whole tiles.
  - At rest only the outlines glow, faint and gathering at the silhouette; the tiles breathe barely. A blow flares the tiles round it toward white and sends a ring of lit tiles across the field. Tiles pop in from the ground up when it forms.
  - Keep the levels low. A bright Fresnel fill read as a milky glass bubble, and bright outlines bloomed to white.
  - It is fitted every frame to the robot's own parts: every mesh's bounds, in the heading frame round the pelvis, inside an ellipsoid of fixed shape plus a margin. That way each robot (and its guard pose) is enclosed whole. A fixed radius left the truck's shoulders outside.
  - `guardReach` gives its radius at a soldier's height; the soldiers' ring and slash reach move outside it (enemies.md).
- `CombatEffects.struck` shows an enemy blow: on the shield (flare, sparks thrown back off it, the field's thump) or, unguarded, on the armour (sparks off the steel, a scrape, a small camera kick). The robot takes no damage.
- `CombatEffects.ambient` keeps the sparks and the dropping shield running on frames outside the fight.

## Hits

- Each move's effect on enemies is data beside its keys (`<character>/combat/hits.ts`, types in `transformer/combat/hits.ts`): sector strikes at a time, sweeps over a window, radial blasts at ground points. `RobotCombat` emits them as `HitEvent`s at the move's own time, in its ground frame, through `onHit`.
- Blows are volumes on the ground in front of the robot rather than limb paths: the robots stand head and shoulders over the 3 m soldiers. See enemies.md for how soldiers take them, and `aimAssist` for the soft turn toward a nearby soldier.

## Effects (`fighter.ts`, `fx/`, `audio/`)

- **Move cues:**
  - `weapon-in` / `weapon-out` (seconds);
  - `slam` (strength): dust ring, a gash in the sand, sparks, sound, camera kick, hit-stop;
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
  3. The axe formed over the right shoulder, then a one-handed diagonal cleave into a long step. The left hand takes the haft in the guard.
  4. The thruster charge: the lift jets fire straight back (a combat override of `Thrusters`, the same plume and rocket voice), the feet plough about 7 m, a leap with an overhead raise beside the helmet, and the slam into the sand. The second hand braces the haft after impact.
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

- **`fight-probe`** prints, over time and in the robot's frame: heading, pelvis, hands, feet, ground lift and the weapon edge.
- **`fight-sheet`** renders contact sheets, one per view, with the camera following the robot; `zoom` below 1 frames the smaller F1.
- **`tests/combat.test.ts`** samples normal, early and late chains plus recovery after move 3 at 120 Hz. Checks cover wrists, the full formed haft (including pommel), cutting edge, off-hand attachment and conservative chest/pelvis/head cores. Separate tests check finger enclosure and forward travel at 30/120 Hz. These are numeric clearance checks, not a substitute for visual inspection of the meshes. Run them after every change to a move.
