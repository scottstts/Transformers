# Forts

Three garrison compounds stand in the desert (`FORT_SITES` in `src/worlds/desert/fort/plan.ts`), at driving distance from the start. They are world scenery owned by `DesertWorld.forts`; the soldiers that hold them are enemies.md.

## Plan first, then geometry

- `planFort(site)` decides everything before any triangle: the wall polygon, gates, hangars, every module (typed by kind), cables, posts, spawn doors and colliders. It is deterministic per seed and plain data. The geometry (`build.ts`, which dispatches a builder per module kind), the colliders and the soldiers' behaviour all read the same plan.
- Fort frame: centre at the origin, +z the front gate, y up. `Fort.toWorld` / `toLocal` apply the site's yaw with three's Y rotation.
- Modules are built in their own frame (front +z) by the slot writer (`mesh.ts`). Every polygon is emitted flat with its Newell normal; analytic surfaces (cylinders, revolves, tubes, the arch, gabion bulges) pass per-vertex normals. Winding decides the facing, so each builder lists polygons counter-clockwise from outside.
- Materials carry no UVs. They are world-space TSL weathering with physical causes: sand banked at the foot of walls and dusting upward faces, rain run-off streaks from top edges, sun bleaching, rust at scratches. Blotch-scale noise on large panels read as camouflage twice (the hangar skin and the containers); keep variation broad and gentle, and scratches small and sparse. Paint laid on a surface (the helipad's markings) is a separate slot with a depth bias, a few millimetres over it.

## Scale and layout

- Twice the first forts' size each way (~180 m across, radius 80 to 92 m). Every part stays at its real size, scaled to the 3 m soldiers: 5.2 m precast T-wall slabs topped with concertina wire on an irregular octagon, 3 m corner pillars, 15 m gates (room for the truck robot), 13 m watchtowers on all eight corners, two 18 x 26 m Quonset hangars, 40 ft containers, 20 ft housing units.
- Gates: front, left and right, each with a guard booth, a raised boom, sandbag positions behind the wall and jersey barriers lining the approach end on. `gates` is sorted front first. The robot's only way in is a gate (its jump is ~1 m); a test walks a truck-sized body through every one.
- `layout.ts` places modules only where they fit: inside the walls 4.5 m clear of them, off the open yard (24 m round the centre), off the gate lanes (18 m wide, gate to yard) and clear of everything already placed. What doesn't fit a fort's irregular octagon is tried elsewhere or left out; randomness never repairs a layout. A group (a row of housing units, a bund and its tanks, a canopy and what it shelters) goes in whole or not at all. Its members are composed by the caller and checked only against what was already there.
- The hangars fill the back with their aprons kept clear; reinforcements roll out of both doors. The four quadrants between the lanes take a role each, in an order that varies by fort: barracks (3 rows of 4 housing units facing each other across walkways under shade sails, latrines, a water tank, a generator), command (the two-storey HQ with a blast wall before its door, a helipad, the bunker, a guyed lattice radio mast), supply (a motor-pool canopy over tyres, drums and crates, container stacks two high) and fuel (three tanks in a bund with their manifold and pump, a water tower, generators). A tight quadrant turns the HQ along it; whatever still has no room (the helipad, the bunker) is placed wherever there is room before the clutter (pallets, crates, drums, tyres, sandbags) fills in.
- Floodlight masts ring the yard; timber power poles run along the lanes, wired pole to pole.
- Wall capsules are the stem's face (r 0.55), not the footing's toe. With the footing, the robot stopped 2.5 m short of the visible wall, which read as an invisible force field. A robot pushing against a fort wall for a moment gets the hint to go in through a gate.
- The hangar skin is a real corrugated grid at the flutes' mid-depth. Its normals are tilted alternately along a sine corrugation, at 0.6 of the true slope: the full slope shimmered at a distance. The canopy roof uses the same.

## Draw cost

- A fort is ~260 to 345k triangles, about half of it detail, in ~85 meshes. Geometry is bucketed by quadrant (`MeshWriter.bucket`), one mesh per material slot per bucket, so the view and each of the sun's shadow cascades draw only the quadrants they cover; a whole-fort mesh per slot put the entire fort into every shadow pass.
- Small things (slab lifting loops, razor wire, wall lamps, clutter, poles and cables) go in each quadrant's detail bucket, drawn only within 120 m of its bounds (`Forts.update`).
- Nothing in a fort is ever hidden from the boot warm-up: the session compiles and draws the whole scene once with frustum culling off (`rendering/warm.ts`), so the forts' pipelines and uploads (and their shadow casters') are done before play. Compiling only what the start camera saw made the first sight of a fort hitch.

## Collision and the barrier

- Walls, pillars and building sides are capsules (`SegmentCollider`); towers, masts, poles, posts of sails and canopies, drums and tyres are circles. Colliders come with each placed module (by kind, `Layout.collide`). The robot is pushed out of capsules in `resolveCircleCollisions`; soldiers use `game/collide.ts`. Every guard post stands clear of every collider (tested).
- The tiled boulders are cleared from each fort's grounds (their instances collapse and their colliders get r = 0), or they would stand in the walls. Colliders with r <= 0 must be skipped: a cleared boulder otherwise remained an invisible post the size of the body.
- The car barrier (`game/enemies/barrier.ts`): each fort has a ring 14 m outside its farthest corner. The car's speed toward the fort is capped through a 30 m band outside the ring, falling to zero at the ring, and it cannot cross. It moves along the ring and away freely.
- Inside the ring the robot cannot turn back into the car (`Forts.within`); the hint says so. A car could never have driven in, so none should appear there. `GameSession.onFortHold` drives the quiet hints (`ui/fort-hint.ts`).
