# Enemy soldiers

Each fort (forts.md) keeps a garrison of 3 m wheeled robot soldiers. The game side is `src/game/enemies/`: `horde.ts` (garrisons, behaviour, hits, spawning, culling), `soldier.ts` (one body's physics, reactions and pose), `debris.ts` (the break-apart) and `barrier.ts` (the car ring). The soldier's asset, rig, poses, materials, renderer and sound are `src/content/soldier/`; its Blender build is soldier-model.md.

## Rendering the horde

- The whole horde is a fixed number of draws, whatever its size: one mesh per material slot per detail tier, plus one shadow proxy. Every vertex carries its bone index; the renderer keeps an affine 3x4 matrix per bone per drawn soldier and one vec4 of state per soldier (heat, dissolve, lights, blade) in two storage buffers, and the TSL vertex stage skins the rigid parts from them (`materials.ts`). Normals follow by assigning `normalLocal` in the position node, as three's batching does.
- The tiers are distance bands (`LOD_DISTANCE`: 26 / 70 m). `Horde.drawFor` culls soldiers to the frustum on the CPU, sorts them near to far and hands the list over; since the tiers are bands of a sorted list, each tier is one consecutive run of the buffers. One material per slot serves all tiers: a per-mesh `userData.base` (read with `onObjectUpdate`) offsets the instance index.
- Only the used prefix of each buffer is uploaded (`addUpdateRange`).
- Shadows: the lit meshes cast none. A merged, slot-less LOD2 proxy lives on `SHADOW_ONLY_LAYER` (`rendering/layers.ts`), which the sun's shadow camera enables and the view camera doesn't. It draws the soldiers within 42 m (a prefix of the sorted list). It shrinks parts toward their bone origin as they dissolve, so shadows don't outlive the burning debris.
- A destroyed soldier is the same instance: the debris writes its bones' matrices into its rig.
- Keep CPU culling generous for debris (7 m sphere), which scatters from the body.

## Behaviour

- **Alert**: a garrison is alerted when the target is inside the wall polygon, and called off when the target is more than 25 m beyond the barrier ring. Alerted soldiers light their blades and fight; otherwise they return to their posts.
- **The ring**: the nearest `RING` (7) close in at the robot's body radius + 1.55 m (or just outside its raised shield, `EnemyTarget.guard`); the rest hold 5 m further out, drifting round. The fighting ring leans 30 % of the way round toward the robot's heading. Without that, soldiers stayed wherever they arrived from, and a robot facing the emptiest side missed whole combos.
- **Attacks**: at most `ATTACKERS` (3) swing at once. A slash lands at a fixed moment of its strike; it hits if the robot is within reach and inside a 60 degree cone of the soldier's heading. Soldiers only reach the robot while it is `present` (not in a special's cutscene, not airborne).
- **Gates**: a soldier on the other side of the walls from its target heads for the nearest gate's near waypoint, then its far one.
- **Wheels**: soldiers roll. Near their point they shuffle holonomically (each foot steers its wheels toward the motion); far away they face the way they roll. Coasting has low friction, sideways skidding high. After a blow they brake hard (`SOLDIER.brake`): free-rolling knock-back carried them ~20 m and scattered the crowd out of reach.
- **Aim assist**: `RobotCombat.aimAssist` turns a move toward the nearest standing soldier within 7 m and 0.9 rad of the camera's heading. It uses the same re-aim limit as the camera aim.

## Hits and reactions

- The robots' blows are authored per move as ground-plane volumes (`transformer/combat/hits.ts`): sector strikes, sweeps along a move's path, and radial blasts. A robot's fist or edge path would sail over a 3 m soldier's head, so contact is not traced from limbs.
- A sweep hits each soldier once (a serial per sweep), throwing it along the motion and out of the path. Sweep knock is capped at 16 m/s.
- Reactions come from physics plus pose springs. The push goes into the wheel velocity. Past `launchLift` or `launchKnock` the soldier flies ballistically, tumbling about the axis across the push. The tumble rate is set from the flight time so it turns about a third of a revolution and lands on its back or face; a fixed rate spun it upright again. Landed upright it staggers; otherwise it lies 1.1-1.9 s and gets up.
- Bodies bowl each other over: a collision faster than 5 m/s between a flying and a standing soldier shares momentum as an impact. A body thrown into a wall faster than 7 m/s takes damage.
- A connected strike adds a short hit-stop in the session.

## Breaking apart (`debris.ts`)

- Every part is a rigid box (its bone's box and mass from the export). Pieces fly off with the blow, a scatter out from the chest and a tumble. Ground contact is an impulse at the deepest box corner with full inertia.
- Friction must also act on resting contact, bounded by the weight the piece bears. With friction only on impact, pieces slid like ice. Lying pieces plough the sand, which damps their motion.
- Pieces don't collide with each other or with the walls.
- They lie 4 s, then burn away over 1 s (the materials' noise dissolve with a blackbody edge), 5 s in all. Heat glow on whole parts is for blasts only; any heat on cuts read as red-hot parts.

## Reinforcements

A garrison is 14. When a fight cuts it below 8, a wave rolls out of the hangar door one soldier every 1.1 s until it is whole again. At peace it refills one every 5 s. Refilling whenever the garrison was short made kills invisible.

## Sound (`content/soldier/audio.ts`)

- Two shared continuous voices follow the whole horde's distance-weighted activity: wheels on sand, and the plasma blades. A voice per soldier would cost too much, and identical loops read as synthetic.
- Events are one-shots capped at 6 per frame, delayed and dulled by distance.

## Tools and tests

- `node tools/enemy-sample.mjs <out> <samples>` renders soldiers, key poses, reactions and fort views headlessly (`tools/preview/enemies.ts`).
- `BRAWL=<fort> node tools/fight-sheet.mjs ...` fights that fort's garrison in its yard. The log prints living and destroyed counts; `HITS=1` prints every hit event with the soldiers around it. `G<t0>-<t1>` in the click list holds the guard.
- `tests/enemies.test.ts` seeds `Math.random`, because the AI and the debris draw on it.
