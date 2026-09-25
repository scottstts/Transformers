# Forts

Three garrison compounds stand in the desert (`FORT_SITES` in `src/worlds/desert/fort/plan.ts`), at driving distance from the start. They are world scenery owned by `DesertWorld.forts`; the soldiers that hold them are enemies.md.

## Plan first, then geometry

- `planFort(site)` decides everything before any triangle: the wall polygon, gates, towers, hangar, bunker, props, posts, spawn doors and colliders. It is deterministic per seed and plain data. The geometry (`build.ts` with the module builders), the colliders and the soldiers' behaviour all read the same plan.
- Fort frame: centre at the origin, +z the front gate, y up. `Fort.toWorld` / `toLocal` apply the site's yaw with three's Y rotation.
- Modules are built in their own frame (front +z) by the slot writer (`mesh.ts`). Every polygon is emitted flat with its Newell normal; analytic surfaces (cylinders, the arch, gabion bulges) pass per-vertex normals. Winding decides the facing, so each builder lists polygons counter-clockwise from outside. A fort compiles to one mesh per material slot (about 75k triangles, ~11 draws).
- Materials carry no UVs. They are world-space TSL weathering with physical causes: sand banked at the foot of walls and dusting upward faces, rain run-off streaks from top edges, sun bleaching, rust at scratches. Blotch-scale noise on large panels read as camouflage twice (the hangar skin and the containers); keep variation broad and gentle, and scratches small and sparse.

## Scale and layout

- The compound is scaled to the 3 m soldiers: 5.2 m precast T-wall slabs on an irregular octagon, 3 m corner pillars, 15 m gates (room for the truck robot), 13 m watchtowers, a 17 x 22 m Quonset hangar with an 8.5 x 6 m door, and 40 ft containers at their real size.
- Gates: front, left and right. The hangar fills the back, facing the yard; a gate opposite the front opened onto its back wall. The bunker and the containers take the back quarters, the fuel tanks the front-left. `gates` is sorted front first. The robot's only way in is a gate (its jump is ~1 m), and a test walks a truck-sized body through every one. Jersey barriers line the approaches end on; they don't stand across them.
- Wall capsules are the stem's face (r 0.55), not the footing's toe. With the footing, the robot stopped 2.5 m short of the visible wall, which read as an invisible force field.
- A robot pushing against a fort wall for a moment gets the hint to go in through a gate.
- The middle of the yard (9 m round the centre) stays open to fight in (tested). Props sit near the walls.
- The hangar's colliders leave its door open; it is where reinforcements roll out.
- The hangar skin is a real corrugated grid at the flutes' mid-depth. Its normals are tilted alternately along a sine corrugation, at 0.6 of the true slope: the full slope shimmered at a distance.

## Collision and the barrier

- Walls, pillars and building sides are capsules (`SegmentCollider`); towers and masts are circles. The robot is pushed out of capsules in `resolveCircleCollisions`; soldiers use `game/collide.ts`.
- The tiled boulders are cleared from each fort's grounds (their instances collapse and their colliders get r = 0), or they would stand in the walls. Colliders with r <= 0 must be skipped: a cleared boulder otherwise remained an invisible post the size of the body.
- The car barrier (`game/enemies/barrier.ts`): each fort has a ring 14 m outside its farthest corner. The car's speed toward the fort is capped through a 30 m band outside the ring, falling to zero at the ring, and it cannot cross. It moves along the ring and away freely.
- A car that came to be inside (the robot transformed back in the yard) may drive out; once out, the ring holds it. `GameSession.onFortHold` drives a quiet hint to transform (or, for the robot against a wall, to use a gate) (`ui/fort-hint.ts`).
