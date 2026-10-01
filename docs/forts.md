# The fortress

One fortress stands in the desert (`FORT_SITES` in `src/worlds/desert/fort/plan.ts`), its main gate facing the start ~180 m off. It is world scenery owned by `DesertWorld.forts`; the soldiers that hold it are enemies.md. It replaced three separate forts: the fighting wanted one map with distinct places and layers, not three copies of one compound.

## Layers and districts

- **Perimeter** (`perimeter.ts`): T-wall slabs under concertina wire on an irregular ten-sided ring (~340 m across), watchtowers inside its corners, four gates (main, both flanks, rear) with booth, raised boom, sandbag positions and jersey-barrier approach.
- **Districts** (`sectors.ts`): six wedges about the citadel's centre, split by T-wall dividers running straight out from the citadel to a perimeter corner. Every divider meets the ring *at a corner* (the ring has a corner on every divider's ray), so no divider butts into a slab run mid-way. A district is a bearing range about the centre, so a point's district is two polygon tests and an `atan2` (`sectorAt`).
- **Citadel** (`citadel.ts`, `rampart.ts`, `gatehouse.ts`): a star trace (curtains with pointed bastions) of battered reinforced concrete with a wall-walk, two gatehouses (the front one bridged), round the command keep and its parade ground. Stairs climb the inner face beside the front gatehouse.
- Roles (`districts.ts`): gate court (the main road, flags, guard garages, checkpoint canopies, the admin HQ), motor pool, airfield (the two Quonset hangars), comms (radar, masts, generator farm, rear road), fuel depot, barracks, citadel. The four flank districts share a shape: a narrow inner band against the rampart, the yard, and an outer band (r 118-170 m) for the big buildings.
- **Divider gates sit near the citadel end** (~28 % along the divider), so the gates between districts make a ring route round the rampart and the yards sit between them. Mid-divider gates put their lanes across the outer bands and nothing big fitted.

## Plan first, then geometry

- `planFort(site)` decides everything before any triangle: perimeter, citadel, dividers, gates and which districts each joins, the gate graph (`nav`), modules, posts, spawn doors and colliders. Deterministic per seed, plain data. `tools/fort-map.mjs` draws it top-down (footprints, reserved ground, yards, beats, spawns, colliders); `tools/fort-plan.mjs` prints districts, gates, module counts, triangles per bucket and timings.
- Fort frame: +z the front, y up; the citadel's centre is at `plan.centre`. `Fort.toWorld` / `toLocal` apply the site's yaw with three's Y rotation.
- Modules are built in their own frame (front +z) by the slot writer (`mesh.ts`). Polygons are emitted flat with their Newell normal; `polyFacing` winds a polygon to face a given direction (swept sections whose winding depends on the profile's direction). Analytic surfaces pass per-vertex normals.
- `facade()` sorts its openings along the facade before pairing pier edges. Unsorted, a door listed after its windows produced a pier across the door and overlapping, inverted pier boxes (the old HQ had this).
- Materials carry no UVs: world-space TSL weathering with physical causes (sand banked at wall feet and on upward faces, run-off from top edges, sun bleaching, rust at scratches). Paving has its own dust rule (drift bands): the walls' "sand at every foot" rule buried surfaces at ground level. The radome's panel seams come from its normal (a sphere's normal is its direction from the centre), footprint-filtered.

## Layout (`layout.ts`, `districts.ts`)

- A module is placed only where it fits: all four corners in one district; clear of every wall line by that wall's margin (T-walls 4.5 m, the rampart's foot 7.5 m, which covers its 4.6 m body plus a walkway); off the yards (circles), the gate lanes (16 m either side of a T-wall gate, 30 m of a citadel gate) and the roads; clear of everything placed. Randomness never repairs a layout: positions are asked for in each wedge's polar terms (`Zone.p(r, t)`) and searched round on a spiral.
- A group (a barracks block, a tank farm, a canopy and what it shelters, a garage and its apron) goes in whole or not at all.
- Garages and hangars reserve their paved apron; the apron and the yard must not overlap (a hangar's apron into a yard was why hangars first failed to place).
- Road poles are not placed in the gate court's yard (the road runs through it); the cable line breaks there rather than spanning it.
- Every district has at least one spawn door (garage bays, hangar doors, the keep's vehicle bay); a district whose designed garage did not fit gets one wherever there is room.

## Construction notes

- **Rampart**: its section is swept along each run with mitred corners (the offset per metre of section depth at a vertex is `(n0 + n1) / (1 + n0·n1)`), so faces of adjacent stretches meet on the bisector. Runs are cast in pours of at most 7.5 m, each with its own tone: pour-to-pour tone is what marks cast walls, and it costs no geometry. Merlons stand only on straight stretches, 1.4 m clear of corners. Counterforts and lamps keep 19 m from a run's ends (the gatehouses and the stairs). Run ends are buried in the gatehouse towers (the towers are wider, deeper and taller than the section), so they have no end caps.
- **Dividers** start inside the rampart: 1.6 m behind a bastion's point, 0.9 m behind a flat curtain, so the battered face still covers the slab end at the slab's full height.
- **Gatehouse**: the bridge soffit is 9.3 m (the robots pass under it); the tower face the bridge meets has no opening.
- **Keep**: the vehicle bay runs through both podium floors; the floor band and the second-floor slab break round it. The control room's glass leans out.
- **Garage**: only the front's open bays show the hall; its closed doors are a corrugated slat curtain. Corrugation everywhere is tilted normals at 0.6 of the true slope (the full slope shimmered at a distance).
- **HESCO rows** build only the row's outer faces: the walls between cells are hidden.
- **Paving** is slabs 3 cm proud of the sand in bays of at most 6 m with chamfered top edges: a joint reads as a groove in raking light. Feet and wheels sink those 3 cm; tyre ribbons hide under the slabs, and no footprint is laid on them (worlds.md).
- **Flags** all fly one way (one wind over the fortress): their modules share one yaw.

## Draw cost

- ~940k triangles in ~177 meshes. Geometry is bucketed by district (`MeshWriter.bucket`), one mesh per material slot per bucket, main and detail; detail (slab loops, razor wire, clutter, poles and cables) draws only within 120 m of its bucket's bounds (`Forts.update`). A T-wall slab is bucketed by the district it faces into.
- Entry warm-up explicitly exposes every district's distance-hidden detail (`Forts.showAllDetail`) and disables frustum culling for the hidden draw. It restores the normal detail visibility afterward.
- Shadows: every fort mesh is a static caster (`Forts.staticCasters`, `castShadow` kept off so the cascades skip it). It is drawn only into the sun's cached shadow levels, which redraw when the camera has moved a tenth of a level. Detail goes into every level but the coarsest. The 190 m level still holds a drum or a crate and reaches past where detail is shown at all; limiting detail to the two finest levels dropped its shadows beyond ~55 m. Detail shown or hidden (`Forts.toggled`) redraws only the fine levels it touches: invalidating every level on each toggle redrew the whole fortress several times whenever the car drove along the ring. Before, the whole fortress was redrawn into three cascades every frame, and nothing beyond 150 m was shadowed.

## Light round the fortress

- **Sky visibility** (`sky-visibility.ts`): the fortress's ambient occlusion, baked once. The CPU rasterizes the highest surface over every 0.42 m cell (walls on edge and small triangles mark every cell they span; broad ones interpolate their plane). One GPU compute pass then takes horizons in 16 directions at 0.3, 2.5 and 7 m. It stores what a level surface sees (cosine-weighted) and what a wall facing each quarter sees, so a wall is darkened only by what stands in front of it, never by itself. A surface reads it 1 m out along its normal and 0.3 m up, at its height, weighted by its normal: three fetches, scaling only the ambient light (`aoNode`). Under a roof a level surface keeps only the side light, with a floor of 0.3 (the sunlit sand's bounce). The fort materials, the terrain, the drifts and the ground decals all use it, so a footprint in a dark alley is as dark as the sand around it. It reads as open sky until baked (`Forts.bake`, from `world.prepare` after the renderer is up).
- **Drifts** (`drifts.ts`): sand banked against every wall face that looks into the dunes' wind, highest at the wall and running out concave, with a low tail on the lee side, its height wandering along the wall. They come from the wall colliders (a capsule's side is its wall's face; T-walls start inside the stem, over the footing). Only faces in the open get them (the height map shows no roof beyond), and the rampart is left bare. The outer edge dips 3 cm under the ground so the two meet along a line, never coplanar. The sand is the floor's own surface. ~86 k triangles in 90 m chunks, each its own draw, so those out of view are culled.
- **Surface relief** (`materials.ts` `relief`): the normal bumped by a world-space relief through screen-space derivatives (the modules have no UVs). It covers concrete pores, lift lines every 1.2 m and form-tie holes, dents and chipped-paint edges on steel, trowelled render, weathered wood grain, lumpy sandbags, broom-finished paving and scored container paint. Most of it reuses noise the colour already fetches. The analytic features fade out once they are under a pixel. Double-sided cloth is left flat.

## Collision and the barrier

- Walls, pillars and building sides are capsules; round things are circles. The rampart is one capsule per stretch down the middle of its body (toe to inner face). Colliders come with each placed module (by kind, `Layout.collide`); garages and the keep leave their open doors' spans open and wall their bays.
- `Fort.grid` (`game/collide.ts` `ColliderGrid`) bins the colliders on a 12 m grid for the soldiers: a hundred soldiers each testing ~900 colliders every frame cost more than the rest of their simulation.
- The car barrier (`game/enemies/barrier.ts`) is a ring 14 m outside the farthest corner about the site's origin; the robot is told the way in ("go in through a gate") only while it is outside the perimeter: inside, it brushes buildings all the time.
