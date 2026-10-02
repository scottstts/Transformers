# The commander (in game)

Every district of the citadel has its own commander (`game/enemies/commander-post.ts`, `commander.ts`; content in `src/content/commander/`; model: commander-model.md). It is the soldier's body plan at 7 m: `Commander` extends `Soldier` with its own tuning (`COMMANDER`), poses, rig and a combo, so wheels, falls, the special's hold and the break-up are the soldier's.

## Rig and poses

- `CommanderRig` redefines the right arm's rest as the left arm's mirror. The export's rest is the parade carry (arm bent, lance upright), so channel zero is a hanging arm. The lance stays rigid in the fist. The skirt plates (`mantle.*`, `tail.*`) hinge on the pelvis and follow the thighs (`afterLegs`).
- The lance is gripped 2.7 m from its tip, with 4.2 m of shaft behind the fist, across the fist (a hammer grip). The fist stays out to the right or well in front so the butt runs back outside the skirt. Horizontal sweeps need the fist extended forward.
- Arm channels for key poses are fitted with `node tools/commander-probe.mjs solve '<json>'` (fist place and shaft direction; extreme wrists penalised; no shaft or forearm crossing the body's triangles). `pose`, `blend`, `move` and `combo` check frames. `tests/commander-fight.test.ts` runs the same crossing check (`tests/support/commander-clash.ts`) over every key pose, the stance blends and every frame of the whole combo chained from each stance.
- At peace it carries the lance at a slope. Alerted, it levels it (`ready`), and charging it couches it (`roll`). The built pose is never shown.

## The combo (`combo.ts`)

A heavy lancer on wheels, its lance's red energy flaring through every blow. Its moves use its wheels (dashes, pivots, a spin), which makes it its own fighter rather than another spear robot.

1. **Joust:** sunk back with the lance couched, a two-metre dash on its wheels that drives the point home, then a skidding brake with the point riding up.
2. **Pivot sweep:** wound right, it pivots on its wheels and carries the lance flat across the front, then loops the point up and back.
3. **Sky splitter:** reared up with the lance overhead, a hang, then the whole body down from a lunge, the point into the sand (burst, chunks, surge, camera quake).
4. **Whirlwind:** coiled hard, more than a full turn on its wheels with the lance level (a ring of trail), through the robot (knock-back, sand surge), the finish held a beat.

Authoring rules:

- **Phrasing:** every move has an anticipation, a tightening beat, a blow snapped through in about 0.1 s, follow-through past it, and a loop back to the guard.
- **Overlapping action:** the root `turn` is the hips and leads; the chest's `twist` follows and overshoots.
- **Keys:** each key pose is whole (every body channel), passed through monotone curves.

The lance core's brightness is the `glow` channel. A move's effect cues (`flash`, `charge`, `skid`, `slam`, `whirl`) go to the horde, which shows them with its warmed sparks and billows and the world's contact effects. The crimson lance trail is a `SwingTrail` per post, shown only in a combo. It resets every frame the commander is dead: updated only while it lived, it hung frozen in the air after its death.

## Fighting

- **Distances** are the soldiers', measured between the two bodies (engage.ts: `ENGAGE_GAP`, `ATTACK_WINDOW`, `SLASH_REACH`), scaled by its height over theirs (2.3) and then by 1.4 for the lance's reach. It stands 5 m off, swings within 7.3 m and reaches 6.8 m.
- **Moving in:** a move's travel stretches to cover the gap (up to 1.6 times its keyed travel) but only as far as leaves 1.2 m between the bodies.
- **In reach it holds its side** and only keeps the distance. Coming round toward the robot's front for a better spot while already in reach kept it circling through the soldiers instead of fighting. Out of reach it comes round toward the front.
- **Nimble, not mindless:** the soldiers turn away to roll beyond 3.5 m of their point. The commander strafes on its steering wheels within 16 m, with its lance on the robot (`shuffle`). It is fast (12 m/s charge, 22 m/s² acceleration, 7 rad/s turning) and leans into its acceleration: forward into a dash, back against a brake, over into a strafe.
- **Roll:** `comboLength`: moves 1-2, or the whole combo one time in three. The roll itself was never wrong: the player's blows used to break full combos early, and a broken one looked like a pair. A full combo's lance burns 1.3x hotter from the first move, the tell that the knock-back is coming.
- **Taking blows** is the combat contract (combat.md, `game/combat/contract.ts`). Mid-combo (any combo, `inCombo`), only a special's blow or vacuum interrupts it: other blows take health and rock its springs, and health running out still destroys it. Out of a combo it takes every blow as a soldier does, through the same code, at its weight:
  - 40 % of the push (`push`);
  - thrown only past a lift of 7.5 m/s, never by knock alone;
  - a special's lift reaches it whole, at a soldier's threshold, so a special throws it as high as the soldiers;
  - it brakes and skids a little harder and lies longer (1.4-2.2 s, rising over 1.3 s).
  It also takes the soldiers' body blows: thrown into a wall, barged by the robot, and bowling or bowled by a flying body. There is no poise. In a special, emptied, it is held with the soldiers until the special's last blow.
- **No reel:** soldiers don't swing for 1.2 s after a blow; the commander may start a combo as soon as a flinch or fall ends. The next combo after one of its own waits 0.7-1.3 s.
- **Health:** 2000.
- **Bodies:** it and the robot push each other apart (`Horde.shove`), and soldiers give way to it.
- **Its district only:** it fights while its district's garrison is alerted and the robot is in its district, or left it under the garrisons' `CALL_OFF` (1 s) ago, so a step through a gate does not flicker it. It never follows the fight into a neighbouring district (its garrison does): a fight meets one commander at a time. Otherwise it goes home and walks its yard.
- **Yard walk:** five points on a ring at 0.35 of the yard's radius, each pushed clear of the scenery at its radius, and dropped off the floor or out of the district (`beatPoints`, tested for every district).
- **Respawn:** replaced 30 s after it is destroyed, from its own district's spawn bay.
- **Cost of twelve:** they share one way-finding grid at their radius (one grid per post took seconds at boot) and one rendered take bank (`commanderBank`, per audio context). A calm commander far from the camera is stepped every 2nd or 6th frame, as garrisons are.
- **Drawing:** one `HordeRenderer` for all of them, capacity one per district (detail tiers at 60 / 160 m), and a 1.7x health bar. `Horde.warm` covers the renderer and the trail. `tools/switch-probe.mjs` plays a forced whole combo and the break-up, and reports 0 pipelines built in play.

## Sound

- **Swings:** the spear's fitted takes at 0.8 rate.
- **Moves:** a low servo push, the lance's charge crackle, and the slam's ground thump with sand raining back.
- **Wheels:** a heavy-wheel bed that follows its speed.
- **Its blow on the robot** (`strike-bank.ts`, pre-rendered at load, about 90 ms): a heavy point striking thick plate. It has hard micro-contacts and a skid, a dense cluster of low, beating plate modes (140 Hz–1.9 kHz, near-twin pairs, low modes ringing longest), and the body's deep thud. The lance's energy arcs into the metal as a thinning train of snaps. That arc is what tells it from soldiers' blades and the robots' blows. The knock-back take is heavier and longer. On a raised shield it plays quieter and dulled under the shield's own sound.

## Knock-back on the robots

`transformer/combat/knockback.ts` is one `CombatMove` for every robot. `RobotCombat.knockback(from)` plays it:

- **Start:** the robot turns to face the blow. A combo is cancelled and its continuation forgotten, a walk stops, and a formed weapon dissolves.
- **Body:** the body is thrown back and the arms are flung up and out.
- **Travel:** it travels `0.55 * hipZ + 0.6` m straight back (monotone), with two stumble steps and a settle. It plays for 0.95 s, then the ordinary recovery takes over.
- **Control:** for the first 0.6 s, clicks, guard and movement are ignored. After that, movement releases the robot and a click starts move 1. A raised guard takes the blow on the shield.
- **Tests:** `tests/combat.test.ts` knocks every robot back from the stance, from behind, from a run and from inside each combo move, at 30 and 120 Hz. It checks travel, monotone retreat, facing, grounded feet, hands clear of the body cores and the return to the gait, plus the control lock and the guard.
