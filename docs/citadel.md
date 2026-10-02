# Halcyon Citadel

The combat location is the exported Blender citadel, placed at world `(0, 680)` with its front facing the starting car. The game loads `citadel.glb` and `citadel.plan.json` through the shared asset CDN loader. Geometry stays authored in Blender; there is no procedural TypeScript rebuild of the architecture.

The objective is a complete replacement of the old location with the established combat behavior. Move timing, damage, reactions, engagement rules, reinforcement behavior and character handling remain canonical. Environment integration must also cover floor contact, navigation, camera collision, surface feedback, lighting and rendering stability.

## Plan and routes

The exported plan supplies twelve districts, twenty-one gates, twenty-nine spawn bays, floor primitives and collision shapes. The garrisons total 184 soldiers, with the commander in the crown. The farthest curtain corner is 550.1 m from the site origin; the car barrier stays 14 m beyond it, at 564.1 m.

Gate sides are normalized from their waypoints. Some exported gates list their joined districts in the reverse order, so copying the array verbatim sent bodies toward the wrong side. Routes are recomputed over yards and gates by distance, with the outside permitted only as a route's start or end. Otherwise a shortest route could leave one outer gate and enter another.

District classification prefers the highest tier where polygons nest. An outer gate's passage belongs to its inner district even beyond the curtain polygon. A 2 m district raster makes runtime classification bounded. Navigation fields cover only the gate's two districts or a yard's district, with a 24 m margin; the solver retains the established eight-way flow field and no corner cutting. Both soldier and commander fields are built during startup.

Posts retain the old patrol, sentry and bay-guard rules. A settled beat point must be in its own district, clear of colliders and on an exported walkable floor. District membership alone admits points inside building footprints or beside a bridge.

## A single floor layer

The walkable floor is a single-valued height field: tiers at 0/8/16/24 m, connected by ramps, and a 20 m metal bridge over unwalkable chasm ground. Walls guard every other level change. Collision and navigation therefore remain two-dimensional.

CPU height and surface queries use exact polygons and ramp planes in 8 m bins. Outside a floor primitive, the world's `Ground` returns desert terrain. GPU consumers read a nearest-filtered 0.5 m R32F map packed as `height + 1000 * surface`, with sand/ceramic/deck codes 0/1/2. Float32 preserves sub-millimetre floor precision without an extra sampled texture. Marks retain their birth level and discard where a neighboring floor differs by more than 0.25 m.

Enemy jump height and velocity remain local to the floor. Changing an enemy's floor immediately moves its world placement and invalidates its cached pose, including on frames when distant simulation is throttled. The horde's target floor is updated before dispatching a hit or pull, so the first blow after arriving on a tier does not use the prior frame's floor. Hits, pulls, assist and body interaction require floor separation no greater than 2.5 m; same-floor combat retains its established behavior.

Robot feet, wheels, camera clearance, debris, shell casings and effect contacts all use this ground contract. Camera rays use position-only chunks of mass geometry, 40 m across, excluding paving, deck and light slots.

## Surface response

Ceramic carries a thin film of sand: reduced dust, pale birth tint, ceramic chips and spalled/scorched marks. Deck hits give dents, gouges, temper colors and a budgeted spark pool rather than loose chunks. Neither hard surface takes footprints. Dust stores its surface tint per particle at birth, so a cloud does not change color while crossing a boundary.

Footsteps and scuffs sample the material at the actual contact. Sand retains its existing sound; ceramic and deck add fixed broadband hard-contact textures. Scuffs share a short voice budget. These changes describe the environment and do not change combat cadence or strength.

## Geometry and light

The Blender preview sand slot is excluded: the game owns terrain under the citadel. The remaining asset contains 1,570,697 triangles. Geometry is grouped by district, material slot and mass/articulation/detail class. Articulation is visible within 450 m of a bucket's bounds; detail within 120 m. Entry warm-up exposes both classes, every surface response and all shadow passes.

The exported halo was merged into the spire's alloy and light meshes. Loading partitions its 2,048 ring-shell triangles into two meshes without duplicating vertices or changing triangle totals. Only the shell rotates, at 0.025 rad/s; support arms stay fixed. Its rotationally invariant shadow remains cached. Ordinary trim emission stays below the bloom knee, while the halo, beacon, spire lantern and chasm conduits carry the hero light.

AO is baked world-space sky visibility, applied only to indirect light. Three floor-relative slices and the upward visibility/top height share a 2×2 half-float atlas: four 1536² tiles, one sampled-texture binding. Thin or vertical projected triangles rasterize their crossed cells rather than filling their bounding rectangles. Filling a diagonal wall's rectangle invented occluders in open courts. Atlas reads clamp inside each tile to prevent filtering between slices. T0 wall feet alone receive sand drifts.

Static shadows use cached light-space maps independent of view LOD. Their depth span follows the entire caster-height range and the committed map rectangle; camera movement cannot clip upstream towers or ground receivers. Bias is measured in world units, including depth quantization. See [rendering-and-boot.md](rendering-and-boot.md) for shadow filtering and the temporal image pipeline.

## Reproducible checks

`citadel-plan.mjs` reports plan, floor, navigation and CPU construction costs; `citadel-map.mjs` draws the playable map. `citadel-render.mjs` captures fixed gate views with AO/shadows/post isolated and measures actual-asset temporal flicker. `aa-probe.mjs` tests subpixel bars, camera cuts and disappearing transparent effects. `citadel-bench.mjs` measures the full scene, horde and post pipeline at each yard; `dust-bench.mjs` measures all three surfaces. `switch-probe.mjs --all` covers every ordered car switch plus commanders, floor classes and effects, requiring zero shader or pipeline builds during play.

These checks establish geometry, routing, temporal and performance contracts. Browser appearance, sound and fighting feel remain manual review concerns.
