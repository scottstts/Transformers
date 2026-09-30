# Isola Ferro: world design

The second world: a volcanic Mediterranean island under a low golden afternoon sun. On its eastern headland, **Rocca di Ferro** is a walled cliff-top citadel town on a level tuff plateau above a harbour inlet. It plays exactly as the desert fortress does; only the place is different. The rest of the island is free roam for driving. The game starts on a title screen with a world selector (the desert or the island), and the pause menu gains a way back to it.

This is a build spec: numbers, coordinates and names are design targets. The plan tools (B1, C1) print and check them; where a check forces a change, change the number here too.

## Scope: only the place changes

**Unchanged** in both worlds:
- **Robots and cars**: models, handling, grip, gait, transformations, jumps, combos, guard, specials, profiles, energy, camera, and the fact that the robot takes no damage. The one addition is the knock-back reaction to the commander's fourth blow (§6.3).
- **Soldiers**: model, health, behaviour, alert and stand-down, beats, the ring, attacks, reinforcements that keep coming, reactions, debris.
- **Fortress rules**: the car barrier at the perimeter, the car form refused inside, the fort hint.
- **The combat effects of combos and specials**: weapons, trails, sparks, shock rings, the Bat's vortex, special billows, craters, furrows, glass, surges and ejecta. These look and sound as they do in the desert, even on island ground.

**New or changed:**
- the island and its stronghold (terrain, sea, sky, vegetation, architecture), and the world data the existing systems read (ground, colliders, districts, gates, posts, spawn doors);
- the **commander**, a new enemy with a four-move spear combo that respawns 30 s after it is destroyed (§6.2), and the robots' **knock-back** reaction to its fourth blow (§6.3);
- **Environment-coupled contact effects** (§7): step and tyre sounds, dust, footprints and tyre marks. These follow the ground's surface. The desert's surface is always sand, so the desert is identical;
- the title-screen world selector and the pause menu's Main menu (§8).

## 0. Decisions

| Topic | Decision |
|---|---|
| Setting (user) | A volcanic island of ~3.6 × 2.3 km, bounded by the sea |
| Mood (user) | Golden afternoon with a fixed sun (elevation 14°, azimuth 240°) and clear maritime air |
| Combat (user) | The desert fortress's rules, unchanged, in a new stronghold, plus a respawning commander whose combo finisher knocks the robot back |
| Terrain (delegated to me) | An offline baked heightfield (a 2 m global field with a 0.5 m inset over the stronghold and harbour), texture-backed near ground with a baked macro map far away, and cliff shell meshes for vertical rock. §3 has the reasoning |
| Stronghold ground | One exactly level plateau at 64.0 m, since soldiers stand on a level floor (`soldier.ts`). The relief lives outside its walls |

## 1. Frame, scale and budgets

- World frame: x east, y up, **+z south**, metres, sea level y = 0. The island's centre is near the origin.
- Actor sizes that set every clearance: soldier 3.0 m, F1 robot ~3.8 m, truck robot ~5.5 m, Semi robot ~7 m, commander ~6 m (`dims.height`). Cars reach 58 m/s (F1).
- Stronghold clearances:
  - streets the soldiers patrol are ≥ 14 m wide;
  - arches between districts are ≥ 12 m wide and ≥ 11 m clear;
  - piazzas (the districts' yards) are ≥ 50 m across;
  - alleys narrower than 8 m are scenery only: barred, off the nav, collided.

### Performance budgets

Measured with `tools/island-bench.mjs` (B3) at fixed views and the 4 MP buffer cap.

| System | GPU ms | Notes |
|---|---|---|
| Terrain and cliffs | 1.6 | §3.6 |
| Ocean (incl. FFT) | 1.5 | FFT compute ≤ 0.4 |
| Stronghold and harbour town | 3.0 | near detail ≤ 150 m of its bucket |
| Vegetation | 2.5 | impostors beyond 400 m |
| Shadows | 2.0 | cascades every frame, cached levels amortised |
| Characters, horde, commander | 2.0 | |
| Effects (dust, spray) | 1.0 | in a full fight |
| Post | 1.5 | no heat shimmer on the island |
| **Total** | **≤ 15.1** | worst view: a fight in the Duomo piazza, looking west over the harbour |

- At most 4 M triangles on screen from any view, and at most 700 draws.
- CPU: world update ≤ 1.5 ms, no per-frame allocation.
- Boot after choosing the island: download ≤ 20 MB (textures included), plan and meshes ≤ 2.5 s, bakes ≤ 1 s.
- GPU memory ≤ 800 MB for the whole game with the island loaded.

## 2. The island

### 2.1 Map (schematic; the coordinate tables are authoritative)

```
                                      NORTH (−z)
  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
  ~          ____ north cliff road: gallery G-W ___ viaduct V ___ gallery G-E ___         ~
  ~       __/  SCIARA                                                         \__ .----------.
  ~     _/    black ash      .-^^^^^-.                      COLLE EST            |  ROCCA DI  |
  ~    /      slope         / CENERE  \    crater road         olive groves      |   FERRO    |
  ~   |                     \ caldera /    ~ 9 hairpins ~   PASSO + chapel     neck (64 m)   |
  ~   |    WEST SLOPES       '-.___.-'                                     Salita|'--cliffs--'
  ~ LH|    maquis                                                 cypress avenue\ ~ inlet ~~
  ~   |  (Capo Ovest)      VINEYARD TERRACES             CAVA                  MARINA (town) ~
  ~    \                                                 quarry                   /          ~
  ~     \__      PINETA (stone pines)                                         __/            ~
  ~        \___  BAIA DORATA beach ____  S▸  MARINELLA _______________________/               ~
  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
   ☀ low in the WSW (azimuth 240°)          SOUTH (+z)          LH lighthouse   S▸ spawn
```

### 2.2 Coast and relief

The coastline is an authored closed Catmull-Rom spline of ~90 control points (`island/plan/coast.ts`). Each span is typed **beach**, **rocky shelf** or **cliff**, and cliff spans carry a top height and a rock type (tuff or basalt). The spline yields a signed-distance field (+ inland) and an arclength table for the beach swash (§4.3).

Landmass extents:
- main body: x −1700…1150, z −1150…1000;
- the eastern headland: x 1150…1950, z −460…380, split by a harbour inlet into the Rocca butte (north) and the Marina shore (south).

| Feature | Where | Form |
|---|---|---|
| Monte Cenere | caldera centre (−350, −300) | Rim 540 m at radius 260 m, caldera floor 430 m inside 190 m, crater lake at 440 m. Radial gullies. The north flank ends in 60–120 m basalt sea cliffs, and the south flank eases into vineyard terraces |
| Sciara | x −900…−400, z −900…−500 | A black ash slope at 12–22° with ash dunes 20 m apart and 1.5 m high. An open drifting field |
| Capo Ovest | (−1610, 140) | A headland on a 45 m cliff with the lighthouse |
| Pineta and Baia Dorata | x −900…−100, z 650…980 | A crescent beach 900 m long, low dunes, stone pines behind |
| Marinella | (300…480, 820…960) | A fishing village and small harbour |
| Passo | (500, −150), 180 m | The saddle crossroads and chapel |
| Colle Est | (800, −450), ≤ 230 m | Olive-grove hills, capped for the sun check (§4.1) |
| Cava | (700, 250) | A tuff quarry with 4 benches of 6 m |
| Vallone | gorge at (250, −980) | 45 m deep, crossed by the viaduct |
| **Rocca butte** | x 1400…1900, z −430…−90 | Level plateau at **64.0 m**, sheer tuff cliffs on the north, east and inlet sides. The neck to the mainland is at x 1300…1400, z −330…−190 (§5) |
| Harbour inlet | x 1320…1900, z −60…140, mouth to the east | A fjord-like calanque 120–200 m wide, 6–14 m deep, sheltered |
| Marina | x 1250…1800, z 140…380 | The harbour town on the inlet's south shore, 2–25 m. Free roam, drivable |
| Seabed | offshore | depth = −min(60, 4 + 0.08·(−d)) with 20 m-scale noise; beaches follow a 1:20 profile |

Relief is a field bundle (`threejs-procedural-fields`):
- coast distance → island mask → volcano cone, caldera and gullies → hills → mesoscale fbm (wavelengths 80/35/15 m, amplitudes 6/2.5/0.8 m), scaled by **wildness** (0 on roads, platforms and town, 1 in the open) → the carves (roads, platforms, the plateau, harbours, beach profile).
- Off-road slopes outside cliff bands and the volcano's upper cone are kept ≤ 30° by construction, so the cars' own suspension handles all of them.

### 2.3 Roads

Roads are splines with a solved height profile (`island/plan/roads.ts`), each smoothed until its grade and vertical-curvature limits pass. The profile carves the terrain: a flat deck to the shoulder, then cut or fill at 1:1.5 blended into the relief.

| Road | Surface | Width | Length | Limits | Character |
|---|---|---|---|---|---|
| R1 Litoranea (ring) | asphalt | 9 m | ~8.5 km | grade ≤ 8 %, radius ≥ 70 m (two 25 m hairpins at Capo Ovest) | A 1.2 km fast sweeper along Baia Dorata (the F1's top-speed stretch), and the north cliff section with galleries G-W (120 m at (−200, −1080)) and G-E (80 m at (650, −1060)) and the viaduct |
| R2 Strada del Cratere | asphalt | 6.5 m | ~3.2 km, Passo → rim car park (520 m) | grade ≤ 11 %, 9 hairpins of radius 16–22 m | Drift hairpins |
| R3 Via di Mezzo | asphalt | 8 m | ~2.4 km | grade ≤ 9 % | Marinella → Passo → north coast |
| R4 tracks | dirt, sand, gravel | 4 m (quarry 8 m) | ~5.7 km | grade ≤ 14 % | Two designed crests on the vineyard track, tuned with `tools/road-drive.mjs`: ≤ 1.2 s flight, landing ≤ 7 m/s for the pickup |
| R5 Marina and Salita | cobble in town, asphalt on the Salita | 10 m | Marina streets ~1.4 km; Salita 780 m | Salita grade ≤ 8 % | The **Salita** climbs from the inlet's head (1300, 120) along a ledge cut in the cliff, with one switchback, to the neck (1360, −260) at 64 m. It ends at the car barrier before the land gate |
| Cypress avenue | asphalt | 8 m | 900 m | | R1 toward the headland, cypresses 8 m apart |

- **Viaduct** at (250, −980): 140 m long, 45 m over the gorge, five tuff-and-basalt arches with a parapet. Its deck is the ground (the heightfield carries the deck inside its footprint), and the gorge beneath is rock meshes.
- **Galleries**: open rock sheds with a pillar every 6 m on the sea side. The ground stays heightfield. Roof and pillars are camera obstacles and static casters.
- **Furniture**: steel guardrails on bends above drops over 2 m, basalt parapets on cliff sections, kilometre stones. Colliders are capsule chains.

### 2.4 Regions

| Region | Car | Robot |
|---|---|---|
| Baia Dorata | Wet sand at the waterline, dry sand with deep ruts up the beach. Drives into water to 0.6 m | Wading to 1.8 m |
| Pineta | A sand track between pines (trunks are colliders) | |
| Sciara | Open ash drifting, dark roost | Deep ash prints |
| Vineyards | A dirt track with two crests. Vine rows are soft (driven through with a leaf burst) | |
| Crater road | Hairpins, and the view over the whole island from the rim | |
| Cava | Haul road and bench jumps | Bench-to-bench leaps |
| North coast | Galleries, viaduct, cliffs | |
| Marina | Harbour streets, quays, the Salita climb | Main streets fit robots |

Surface looks and sounds follow the ground (§7). Grip is the cars' own model everywhere.

**Spawn**: (−60, 860) on R1, facing east, the sun behind and to the right. The Rocca's west-facing cliffs and walls are lit gold 1.7 km to the ENE, with the campanile standing above them. The entry broadside (`FollowCamera.showSide`) frames the car from the south-west with the sea and the sun path behind.

### 2.5 Free-roam landmarks

| Landmark | Spec |
|---|---|
| Faro di Capo Ovest | 32 m octagonal rendered tower with a black lantern (emissive glow, no light object) and a keeper's house |
| Marinella | 32 houses from the town kit (§5.4), a 90 m breakwater, 5 moored boats, a piazzetta and fountain |
| Marina | ~110 houses on terraces up from the quays, a quay 26 m wide along 380 m of the inlet, a fish loggia, 6 magazzini (36 × 14 × 11 m), two moles with an 18 m harbour light, 12 moored boats. Its streets climb the slope in ramps; the Salita leaves from its west end |
| Cappella del Passo | A tuff chapel with a bell gable and a cypress-walled cemetery |
| Crater rim | A car park wall and 3 fumaroles (steam sprites, fog-free like the dust) |
| Cava | Cut tuff faces with tool marks and a rusted crusher |

## 3. Terrain

The terrain is most of this build, so every choice below trades visual quality against cost.

### 3.1 Data: baked offline

`tools/island-bake.mjs` evaluates the plan (coast, relief, roads, plateau, platforms) in Node and writes `public/worlds/island/`. Every file is gzip'd and decoded at load with the native `DecompressionStream`.

| File | Cells | Format | Raw → gz |
|---|---|---|---|
| `height.bin` | 2 m over x −2400…2400, z −1800…1800 (2400 × 1800) | uint16, 1 cm steps from −80 m, row-delta encoded | 8.6 → ~3 MB |
| `height-inset.bin` | 0.5 m over x 1180…1960, z −480…400 (1560 × 1760) | same | 5.5 → ~1.5 MB |
| `classes.bin` | 2 m, global | uint8 surface class (§3.4) | 4.3 → ~0.3 MB |
| `walk.bin` | 2 m global and 0.5 m inset | uint8: walkable bits (car, robot) and distance to the nearest wall (dm), for push-out | ~0.8 MB |
| `macro.bin` | 8 m, global (600 × 450) | RGBA8: regional albedo tint, dryness, rock exposure, canopy | ~0.6 MB |
| `plan.hash` | | the plan's hash | |

- The CPU and the GPU read the same baked numbers, so they cannot drift.
- The 2 m field carries roads and hills, which are smooth by construction. The 0.5 m inset keeps every step of the Marina's platforms, retaining walls, quays and the Salita's ledge inside its wall's footprint (walls are 1.2–1.6 m thick).
- The world errors at load on a stale hash (the plan changed without a re-bake), and a test checks the committed hash.

### 3.2 Ground queries (CPU)

- `IslandGround.height(x, z)`: the bake's heights are widened to Float32 at load (~28 MB of CPU memory in all). The query is a bicubic lookup in the inset inside its rectangle, blended into the global field across the inset's outer 16 m (both baked from the same function), and a bilinear lookup for sea-floor points deeper than −15 m. It costs ~0.1 µs.
- Inside the stronghold the plateau is exactly 64.0 m: `Stronghold.floor` (§6.1).
- `maxSlope` (for `groundRay`) is the true maximum outside cliff bands, measured by the bake.
- `walkable(x, z, car | robot)` and the push-out come from `walk.bin`. Cliff bands and water deeper than the limit (car 0.6 m, robot 1.8 m) are walls, resolved like the colliders in `movement.ts`. The desert's ground reports everything walkable.

### 3.3 Mesh

- **CDLOD**: a quadtree of instanced 32 × 32 patches (`TerrainMesh`, moved to the kit, §10.2) with a `heightNode(xz)` that is a bicubic fetch of the baked textures. Level 0 is 1 m spacing out to ~5 km, with crack-free morphing between levels.
- **Near and far materials are separate draws**: levels 0–2 (≤ ~250 m) use the near material, the rest the far material. 4 draws in all.
- **Deep sea floor is skipped**: a patch whose maximum height is below −15 m is not drawn: the ocean is opaque there (§4.3).
- **Cliff bands**: the bake pushes the heightfield inside the cliff's rock mass (lowered toward the foot in the band), so the heightfield never pokes through a cliff face. The only hole mask is under the viaduct deck.
- ~130 k triangles on screen.

### 3.4 Surfaces

Surface classes (`classes.bin` plus the road and paving polygons):

| Class | Contact surface (§7) |
|---|---|
| beach sand (dry, wet) | sand |
| dune sand | sand |
| dry grass on soil | soil |
| maquis soil | soil |
| forest floor (pine needles) | soil |
| black ash | ash |
| bare rock | stone |
| vineyard soil | soil |
| gravel | gravel |
| asphalt | asphalt |
| cobble and flags | stone |
| shallow water | water, by the water column at the point |

Roads, paving and the stronghold's floor are resolved exactly from their polygons (a spatial grid of road segments and paved polygons), so a tyre on a road's edge knows it is on asphalt. The 2 m class map covers the rest.

### 3.5 Material

The field bundle: height, slope, cavity (30 m and 3 m), coast distance, water column, wildness, class and the macro map. It drives six ground layers: basalt rock, tuff rock, soil, dry grass, ash, and sand (dry and wet).

- **Near** (levels 0–2): texture-backed PBR sets (CC0, KTX2): basalt, tuff, soil with dry grass, ash, gravel. They're sampled world-planar on flats and triplanar on slopes above 35°, with stochastic tiling (hash-rotated tiles blended by a noise weight) so no repeat reads at the car's eye height.
  - **Height-blend**: sand and ash settle into rock cracks by the layer heights.
  - The macro map tints everything, so each region keeps its identity.
  - The desert's analytic sand ripples and ash grain sparkle are reused for sand and ash, faded by footprint.
  - Fetch budget: ≤ 12 per fragment (3 layers × packed albedo and normal/roughness, macro, the fields texture, sun-shadow height, sky visibility).
- **Far**: the macro map's albedo, the fields texture's normal and slope-derived rock exposure, sun-shadow height and sky visibility, ≤ 5 fetches, with no texture sets. From the crater rim the island reads through its regional colours (black Sciara, gold slopes, grey-green groves), and nothing tiles at a distance.
- **Fields texture**: computed once at load on the GPU from the baked heights (normal xz, slope, 3 m cavity; RGBA8, global and inset). It replaces per-vertex and per-fragment gradient fetches.
- **Asphalt, cobble and paving** are ribbons and slabs (§2.3, §5.4). The terrain beneath is lowered 6 cm inside their footprint, and their outer edges dip 6 cm to meet it, so nothing is coplanar.

### 3.6 Cliffs

Cliffs are meshes; the Rocca's tuff walls are the island's hero forms.

- **Shells**: along every cliff span of the coast and the butte, a wall surface runs from the top-edge polyline down to the foot (the sea notch or a talus apron). It's built in 100 m chunks at 1.5 m vertex spacing near, with 3 LOD tiers.
- **Form**, displaced by named fields:
  - bedding strata every 1.2–4 m, with softer beds recessed 0.2–0.8 m (differential erosion);
  - vertical joints every 6–20 m breaking the face into creased facets (the desert rocks' creased normals);
  - a wave-cut notch 2 m tall at sea level with an overhang of up to 1.5 m;
  - a talus of instanced boulders at the foot (the desert rock generator), bedded on the heightfield.
- **Material**:
  - Tuff (the Rocca): pale golden with honeycomb tafoni in the soft beds, and white salt crust in the splash zone below 4 m.
  - Basalt (the volcano's north cliffs): dark, with hints of columnar jointing.
  - Both carry moss or lichen only on north-facing faces.
- **Budget**: ~600 k triangles over all chunks at LOD0, ≤ 200 k on screen from any view. All shells are static shadow casters.
- **Collision and camera**: cliff bands are non-walkable (§3.2). Parapets run on every cliff top reachable on foot. Camera proxies are the chunk bounds' boxes.

### 3.7 Cost summary

| Item | Cost |
|---|---|
| CDLOD, near and far | ~130 k triangles, 4 draws, ~0.8 ms |
| Cliff shells | ≤ 200 k triangles on screen, ~0.5 ms |
| Talus and boulders | instanced, ~0.2 ms |
| Downloads | ~6 MB of terrain data and ≤ 14 MB of texture sets |
| GPU memory | ~150 MB for heights, fields, classes, macro and texture sets |

## 4. The look

### 4.1 Sun and air

- The direction toward the sun is (−0.840, 0.242, 0.485): elevation 14°, azimuth 240°, fixed. Shadows fall ENE at about 4× height.
- **Sun check**: `tools/island-map.mjs` reports the sunlit fraction (from the sun-shadow height bake, §4.4) of the stronghold's plateau, the Marina and the spawn. Each must be ≥ 95 %. The knobs are Colle Est's cap and the azimuth.
- **Atmosphere**: the desert's scattering model is generalised to a parameter set (§10.2). The island's values:
  - maritime Mie haze: scale height 0.9 km, single-scatter albedo 0.98, g 0.76;
  - haze about 8 % at 1 km, 25 % at 3 km, 50 % at 8 km;
  - white balance set so the sun reads gold;
  - exposure per world, set so a sunlit tuff wall has the brightness of the desert's sunlit sand.
- **Clouds**: a cumulus band over the sea on the NE–E horizon, lit peach, and sparse altocumulus overhead. They are raymarched once at load into a 2048 × 1024 upper-hemisphere texture (the sun is fixed), and the sky reads them with one fetch. They drift by rotating the lookup at 0.2°/min.
- No heat shimmer. The post pipeline takes it per world.

### 4.2 Palette

Buildings and props are world-space and UV-free.

| Surface | Look |
|---|---|
| Tuff (butte, walls, town stone) | Golden ochre ~0.38, porous, soft arrises; block coursing from world space; rising damp at wall feet |
| Basalt (cobbles, parapets, volcano) | Dark grey-brown 0.09–0.12 |
| Lime render (houses) | Muted pastels (ochre, pink, pale yellow, white, sage); peeling to tuff by exposure and noise; rain streaks under sills and cornices; sun bleaching on south and west faces; salt bloom near the sea |
| Terracotta roofs | Barrel tiles as geometry within 60 m, normal-only beyond; moss in the laps of north faces |
| Shutters and ironwork | Faded green and blue shutters, black wrought balconies |
| Asphalt | Aged grey 0.12 with patches, cracks and paint worn in the wheel paths (texture-backed; markings analytic) |
| Enemy installations | The fort's kit, gunmetal and olive |

### 4.3 The sea

Following `threejs-spectral-ocean`:
- **Open water**: three FFT cascades of 256² (bands 250–40 m, 40–6 m, 6–0.8 m) from a 6 m/s WNW wind, giving Hs ~0.9 m. Derivative normals, persisted Jacobian foam, and the camera-following warped grid to the horizon.
- **Colour** comes from the baked depth, `seaLevel − ground(xz)`, with Beer-Lambert absorption `exp(−(0.25, 0.04, 0.02)·path)`: turquoise over sand, deep blue off the shelf. It's opaque beyond 12 m of depth. The sun's glitter path lies to the WSW.
- **Beaches** (Baia Dorata, two coves, Marinella's): the coastal breaker and swash system, on the coast spline's beach spans.
- **Cliffs**: a foam band from shoreline distance and wave height, and spray bursts from a fixed, always-drawn, faded sprite pool where crests meet cliff spans. The Rocca's cliff foot gets this all around the butte.
- **The inlet and harbours**: a **shelter** field baked from the coast SDF and the moles scales the spectrum to ripples, so the water is calm and reflective. The Rocca's cliffs and the town reflect in it.
- In the water, cars drive the seabed to 0.6 m and robots wade to 1.8 m (§3.2).

### 4.4 Light bakes

All one-time, at `world.prepare`:
- **Sun-shadow height**: per cell, the height below which a point there lies in the terrain's shadow, marched toward the sun over the baked heights with the static buildings and cliff shells rasterised in. It is filtered for a soft penumbra, at 2 m globally and 0.5 m in the inset. One fetch gives every receiver (terrain, buildings, trees, characters, soldiers) the long shadows of the volcano and the cliffs. The cached shadow levels own near casters, and this bake covers everything past the far level's 720 m.
- **Sky visibility**: the fort's `SkyVisibility`, generalised to a domain and cell size: 0.42 m over the stronghold, 0.5 m over the Marina, 2 m over the island for terrain and groves. ≤ 600 ms.
- **Environment**: the sky with its baked clouds over the island's mean ground radiance.

### 4.5 Vegetation

Following `threejs-procedural-vegetation`: species presets, deterministic growth, rooted wind, and tiers that keep the species.

| Species | Instances | Near (≤ 80 m) | Mid (≤ 400 m) | Far | Where |
|---|---|---|---|---|---|
| Stone pine | ~1800 (3 presets × 3 seeds) | ~12k tris | ~1.5k | octahedral impostor | Pineta, roadsides, hills |
| Cypress | ~700 (2 presets) | ~6k | ~800 | impostor | Avenue, cemetery, the Rocca's cloister and gardens |
| Olive | ~2500 (3 presets) | ~9k | ~1.2k | impostor | Colle Est in 7 m rows with jitter, terraces |
| Maquis shrubs | ~40k, 3 LODs | | | | Slopes by slope and moisture |
| Prickly pear, agave | ~1200 | | | | Coast, town edges, cliff tops |
| Vines | ~9k row segments | | | | Vineyard terraces |
| Grass | GPU-computed within 60 m, 40 blades/m² | | | | The dry-grass class |

- Scatter is deterministic from the fields and excluded from roads, platforms, colliders and the stronghold's streets.
- Wind comes from 290°, matching the sea.
- Trunks over 0.3 m radius are circle colliders. Shrubs, vines and grass are soft.
- Trees are static shadow casters; grass and shrubs cast none.

## 5. Rocca di Ferro

A walled citadel town on the level tuff butte, occupied by the soldiers' faction. The fortress's systems run on it exactly as they run on the desert fort: districts with garrisons, gates between districts, a perimeter the car cannot cross, the car form refused inside, and the same fort hint. Their modern overlay (T-walls, HESCO, masts, floodlights, containers: the fort's kit) sits over the old stone.

### 5.1 Plan

```
                                north cliffs (64 m to the sea)
      .-----------------------------------------------------------------------------.
      |               |   D2 DUOMO        |               |   D5 CASERMA              )
neck  |   D1 PORTA    |   cathedral,      |  D4 CITTADELLA|   convent barracks,       )  east
═══▶ G1  gate court   G  campanile        G   keep +      G   cloister yard          ) cliffs
Salita|   barbican,   |-------G-----------|   parade      |------------G--------------)
      |   garages     |   D3 MERCATO      G   ground      G   D6 BASTIONE             )
      |               |   piazza, portici |               |   gun platform, masts     /
      '--------------G2 (Porta Marina, from the cliff ramp)----------------------------'
                          south cliffs → harbour inlet
```

- **Plateau**: x 1400…1900, z −430…−90, exactly **64.0 m** to the rampart line. The soldiers' `floor` is 64.0.
- **Perimeter**: a low curtain wall (6–8 m, crenellated, a wall-walk as scenery) along every cliff edge. On the land side (x ≈ 1400) is a bastioned front with a dry ditch before it (the gate bridge is ground, and the ditch is scenery the walls wall off).

### 5.2 Gates and barrier

| Gate | Where | Joins | Notes |
|---|---|---|---|
| G1 Porta di Terra | (1400, −260) | outside ↔ D1 | Main gate: a gate tower 16 × 14 × 24 m, arch 12 × 11 m. The Salita ends before it |
| G2 Porta Marina | (1560, −95) | outside ↔ D3 | The top of a 12 m-wide ramp cut diagonally across the south cliff from a landing on the inlet's quay (Bonifacio's cliff stair, as a ramp) |
| Divider arches | see the plan | district ↔ district | Always open. Arches through building rows and inner walls |

- **Car barrier**: `CarBarrier` generalised from a ring to a polygon (§10.3), with the same behaviour. It encloses the plateau and crosses the Salita 14 m before G1 and the cliff ramp's foot on the quay. The car stops there, and the fort hint says to go in through a gate.
- **Robot inside**: the car form is refused within the perimeter, and the robot pushing against the walls outside is told the way in.

### 5.3 Districts

Each district has a polygon, a yard (its piazza), posts and beats, spawn doors, and a garrison size. Garrisons total ~108.

| District | Extent (x) | Yard | Spawn doors | Garrison | Buildings |
|---|---|---|---|---|---|
| D1 Porta (gate court) | 1400–1500 | Barbican court 70 × 60 m | 2 guard garages (the fort's), the barbican stable doors | 18 | Barbican, gate tower, guardhouse, checkpoint canopies |
| D2 Duomo | 1500–1640, north | Piazza del Duomo 90 × 60 m | The cathedral's west doors, the palazzo's carriage arch | 18 | Duomo (a nave of 64 × 26 m, a 30 m façade with a rose window), campanile 9 × 9 × 52 m, Palazzo del Vescovo |
| D3 Mercato | 1500–1640, south | Market piazza 70 × 54 m around a fountain (Ø 10 m, a collider) | Market warehouse doors | 16 | Portici on two sides, the church of San Pietro, the loggia |
| D4 Cittadella (the citadel) | 1640–1760, full width | Parade ground 80 × 70 m | The keep's vehicle bay | 22 | Inner walls with four corner towers, the keep (28 × 28 × 34 m, a comms mast on the roof), the arsenal |
| D5 Caserma | 1760–1900, north | Cloister yard 60 × 60 m | The convent gate, barracks doors | 18 | The old convent turned barracks: cloister arcade, refectory, dormitory ranges |
| D6 Bastione | 1760–1900, south and the tip | Gun platform 90 × 70 m | Casemate doors | 16 | Pentagonal bastion with embrasures, old bronze cannons, radar and masts (the fort's comms kit), a generator farm |

- The nav graph: D1–D2, D1–D3, D2–D3, D2–D4, D3–D4, D4–D5, D4–D6, D5–D6, plus the two perimeter gates. It loops around the citadel and never routes through the outside.
- Posts: patrols circle the piazza, sentries pace beside each gate, a guard stands at each spawn door. Beat points stand clear of colliders and inside their district.

### 5.4 Construction

Plan first, then geometry (`forts.md`, `threejs-procedural-architecture`):

- `planRocca()` decides everything as deterministic plain data before any triangle: streets, piazzas, blocks, landmarks' footprints, districts, gates, the nav graph, posts, spawn doors, colliders and camera proxies. `tools/rocca-map.mjs` draws it top-down and `tools/rocca-plan.mjs` prints the fort-plan diagnostics (districts, gates, reachability, module counts, triangles per bucket, timings). The same diagnostics exist for the Marina (`planMarina()`).
- **Streets and blocks**: the main street (Via Grande, 16 m) runs from G1 east to the citadel, and a parallel south street (14 m) runs through the Mercato, with cross streets. Blocks between streets are filled with continuous rows of houses; party walls are hidden and never get a façade.
- **Town kit grammar** (`island/town/`, shared by the Rocca, the Marina and Marinella):
  - mass: ground floor 4.2 m, upper floors 3.2 m, 3–5 storeys; hipped barrel-tile roofs or flat terraces with parapets;
  - façade: bays of 3.4 m; arched doors or shopfronts on the ground floor; recessed windows (25 cm reveals) with shutters above; balconies on ~30 % of bays; string courses and cornices; corner quoins; chimneys, water tanks and antennas;
  - exposed edges are resolved before any façade is placed.
  - Openings are real within 150 m of their bucket. The far LOD is massing plus roof planes with a façade shader drawing the bay grid's windows.
- **Marina ground**: its platforms and quays are level or evenly graded, with a tuff retaining wall (battered 1:10, coping stones) wherever neighbours differ by more than 0.4 m. The 0.5 m inset puts every step inside a wall's footprint. The Marina's streets are ramps (cordonate: treads rising 12 cm every 2.5 m, the heightfield being the ramp), so wheels and feet never float.
- **The Rocca's floor** is paving 3 cm proud of the plateau (the fort's `PavedGround`: feet and wheels sink those 3 cm; footprints and tyre ribbons hide under the slabs): basalt cobbles in streets, limestone flags in piazzas.
- **Landmarks** are hand-authored modules with the dimensions in §5.2, §5.3 and §2.5. Their silhouettes (the campanile, the keep, the bastion's point, the barbican) are designed to read from the spawn at 1.7 km.
- **Enemy overlay**: the fort's modules placed by the same rules (whole groups or nothing, clear of yards, lanes and walls): T-wall chicanes and checkpoint canopies at D1, HESCO at the bastion, containers and garages, floodlight towers, masts on the keep and the Duomo roof, sandbag posts, flags that all fly one way.
- **Trees** in the cloister and gardens are cypresses and pines, as colliders.

### 5.5 Draw cost and light

- Buckets are by district (~6 for the Rocca, ~6 for the Marina), one mesh per material slot per bucket, main and detail. Detail draws within 150 m of its bucket, and the far LOD beyond. Both tiers exist from boot, and the warm-up reveals them (§9).
- Targets:
  - Rocca: ~1.0 M triangles of near detail, ≤ 700 k on screen from any view, ≤ 200 draws;
  - Marina: ~0.6 M near.
- All of it is static casters in the cached shadow levels. Camera obstruction uses the plan's box proxies in a grid.
- Sky visibility covers the Rocca at 0.42 m and the Marina at 0.5 m (§4.4). Salt and dust darken wall feet in the material.

## 6. Enemies

### 6.1 Soldiers: unchanged

The same soldier, garrisons, alert and stand-down, ring, attacks, reinforcements, reactions and debris (`enemies.md`). They read the stronghold's districts, gates, nav, colliders, posts, spawns and `floor` (64.0 m) through the contract (§10.3).

What the soldiers themselves emit goes through the environment rules (§7). Their wheel sound follows the surface under them. Their breakup and debris sounds are the parts' own metal and stay as they are.

### 6.2 The commander

**Asset**: `public/models/commander.{json,bin}`, in the soldier's asset format (`content/soldier/asset.ts`): rigid parts by bone, three LOD tiers, a shadow proxy, pieces and `dims`. It loads through `content/commander/asset.ts` (the soldier's decoder, name `commander`).
- **Skeleton**: the soldier's 20 bone names and hierarchy, plus a `weapon` bone under `hand.R`.
- **Spear**: part of the model, riding the `weapon` bone in the right hand, always present. Its energy parts (if any) are the `blade` slot on the `blade` bone.
- **Wheels**: the `wheel.*` bones, with the axle along local X. It rolls like the soldiers.
- **Material slots**: `commander.<slot>`. `glow` and `blade` are unlit and driven by the game, and `visor` is glass. The other slots are ported from the preview materials in `blender/commander.blend`.
- **`dims`**: the soldier's fields plus `reach` (right shoulder to spear tip, arm straight) and `bodyRadius` (its footprint).

**In the game** (`src/content/commander/`, `src/game/enemies/commander.ts`):
- **Rendering**: its own instance of the horde renderer's skinning path, with capacity 2 (the living one, plus the last one's debris while it lies), every tier and a shadow proxy. Its health bar is the soldiers' health-bar draw, larger, tinted with the commander's light colour.
- **Fighting**: it uses the soldiers' rules at its own size:
  - it joins the ring at `bodyRadius`;
  - it strikes only while the robot is `present`, and its blows stop at the raised shield;
  - moves 1–3 land through the same `onStruck` path, so the robot shows them with its existing `struck` effects and takes no damage. Move 4 also knocks the robot back (§6.3).
- **The combo**: four spear moves, authored in the game on its rig channels (`content/commander/moves.ts`, as the soldiers' poses are). Each is a hit volume in the ground frame where the move starts. *R* is `dims.reach`.

  | # | Move | Strike at (s) | Length (s) | Volume | Travel | Struck strength |
  |---|---|---|---|---|---|---|
  | 1 | Thrust: the spear drawn back at the hip and driven straight out | 0.50 | 0.85 | a line *R* + 1.5 m long, 1.6 m wide | 1.2 m forward | 0.6 |
  | 2 | Backhand sweep: the spear swung flat across the front, right to left | 0.35 | 0.80 | a 200° sector at *R* | 0.5 m | 0.7 |
  | 3 | Overhead slam: raised above the head in both hands and brought down; a dust burst at the tip (`ContactEffects.burst`) | 0.65 | 1.10 | a line *R* + 0.5 m long, 2.4 m wide | 1.0 m | 0.8 |
  | 4 | Spinning strike: a long coiled wind-up, then a full turn with the spear level at arm's length | 0.95 | 1.60 | 360° at *R* − 0.5 m | 0 | 1.0, knock-back |

  - Each move starts as the previous one ends.
  - **Combo length** is rolled with `Math.random()` as a combo starts: 40 % move 1 alone, 40 % moves 1–2, 20 % moves 1–2–3–4.
  - It starts a combo when the robot is within *R* + 1 m and ±60° of its heading. Each move turns it toward the robot as it starts (at most 45°). After the combo's last move it recovers for 1.0–1.4 s before the next.
  - The spear's `blade` glow brightens through each wind-up and flashes at the strike. Move 4's wind-up is the longest and brightest, so the knock-back reads before it lands.
  - A blow that would launch a soldier (finisher, blast) snaps it into a hit pose and ends its combo. Lighter blows don't interrupt it.
- **Taking blows**: health 2400 (eight soldiers' worth), so it lasts 5–6 combos. Blows jolt its springs but snap it into a hit pose only if they would launch a soldier (finishers, blasts). It is thrown only past a soldier's launch thresholds, and then at 40 % of the distance (six times the mass).
- **Specials**: the same hold as soldiers (doomed until the last blow, settled after the cutscene).
- **Energy**: blows on it charge the special's energy as blows on soldiers do.
- **Targeting**: aim assist and the Semi's rounds (`Horde.ray`) see it as they see a soldier, with its larger body sphere. Only the horde's query sets change; the robots' code stays the same.
- **Alert**: it belongs to the whole stronghold.
  - At peace it patrols the citadel's parade ground.
  - When any garrison is alerted, it heads for the robot through the gate graph. It uses its own nav fields, built at boot for its radius.
  - It stands down with the garrisons (1 s after the robot leaves the stronghold) and returns to the citadel.
- **Respawn**: one lives at a time. The first stands on the parade ground from boot. **30 s** (`COMMANDER_RESPAWN`) after it is destroyed, a new one rolls out of the spawn door nearest the robot that is out of the camera's view (else the nearest), or the keep's vehicle bay while the stronghold is at peace.
- **Breakup**: the soldiers' debris physics on its pieces, with the can-bank strikes played at its parts' larger shells.
- **Sound**: heavy wheels on the surface under it (§7) and servos, modelled from recordings as the soldiers' sounds are. The spear's thrusts and sweeps are fitted from `ref_sounds/spear_poke.mp3` and `spear_slash.mp3` (`tools/spear-model.mjs`) as heavier, slower takes. The robots' blows landing on it use the existing hit bank.

The commander is on the island only (`Stronghold.commander`).

### 6.3 Knock-back on the robot

The commander's fourth blow knocks the robot back. This is the one change to robot combat, and it is scoped to this reaction.

- **When it lands**: the robot is inside move 4's volume, `present` (not airborne, not in a special) and not guarding. A guarded robot takes it on the shield like any enemy blow (the shield's full-strength flare) and is not knocked back.
- **What it does** (`RobotCombat.knockback(from, strength)`, called by the session from the commander's hit event):
  - It ends whatever the robot is doing on its feet. A combo move ends as `cancel()` ends it, and the continuation memory clears. A walk or a run stops. A formed weapon dissolves over its usual 0.18 s.
  - It plays the **knock-back reaction**, a `CombatMove` on the fight's channels: the body thrown back from the blow (torso bent back ~20°, the head following), the arms flung up and out, then a stumble of two backward steps (the far foot first) through the feet planner, and a settle into the stance. 0.9 s in all.
  - Root travel: 3.0 m straight away from the commander, fast then easing (a monotone curve), resolved against colliders like any movement.
  - Camera: a kick along the view and a short shake (`CameraFx`, strength 1).
  - Sound: the robot's own `struck` at full strength, and its planted footfalls (surface-keyed, §7).
- **Control**: for the reaction's first 0.6 s no attack, guard, jump, transform or movement input is taken. From 0.6 s, movement takes the robot back (the reaction hands back as a combo's recovery does, over 0.24 s), and a click starts combo move 1.
- **Authoring**: one shared set of keys (`transformer/combat/knockback.ts`) in the channels' own terms (they're mirrored and measured from each rig at rest). Each robot's combat data carries its amplitude and step lengths (`<character>/combat/knockback.ts`).
- **Render**: no new render path. It plays existing channels, cues, footfalls and camera reactions.

## 7. Environment-coupled effects

The rule, from the user: only what would plausibly change with a different environment changes. Combo- and special-specific effects stay exactly as they are.

The characters learn the ground through two added queries on `ContactEffects`:
- `surface(x, z)` → `'sand' | 'stone' | 'asphalt' | 'soil' | 'gravel' | 'ash' | 'water'`
- `dustColor(x, z)`

The desert answers `'sand'` and its current dust colour everywhere. Every surface-keyed parameter set has a `sand` entry holding today's values exactly, so the desert is identical.

**Changes with the surface:**

| Effect | Where | On the island |
|---|---|---|
| Robot footstep sound | `transformer/audio/footfall.ts` (each robot's mass tuning unchanged) | Per-surface press and grind layers: stone flags and cobble (a hard knock with grit scrape), asphalt, soil and grass, gravel crunch, ash, a water slosh. Fitted from recordings |
| Footprint and step dust | the world's `ContactEffects.footprint` | Prints on sand, ash, soil and wet beach sand. A scuff and a faint grey dust on stone and asphalt. A splash and ring in water |
| Tyre sound: roll, slide and grain | `transformer/audio/tyres.ts` | Per-surface layers: the asphalt drift squeal, cobble rumble, gravel crunch, soil, ash hiss, water hiss |
| Tyre dust, roost, grit and tracks | the world's `ContactEffects.tyre` | Rubber marks and tyre smoke on asphalt (fog-free sprites, `dust-bench` budget); dust, ruts and roost on soil, gravel and ash; faint marks on cobble; spray and wake in water |
| Fight dust from footwork, landings and slams' dust rings | the world's `ContactEffects.burst` and `blast` | The same machinery, counts and timing; the colour and density come from `dustColor` (pale grey on stone, near-black on ash, sand on sand) |
| Soldiers' (and the commander's) wheel sound | `content/soldier/audio.ts` | Per surface, as tyres |
| Ambience and reverb | world-owned (`island/ambience.ts`) | Surf, waves on rocks, wind in pines, cicadas, harbour lapping. A short slapback in the Rocca's streets (by sky visibility at the listener), the outdoor reverb elsewhere |

**Unchanged** (combo- or special-specific, or the character's own machine). These play exactly as in the desert, on any ground:
- weapons, trails, sparks, shock rings, shields;
- the Bat's vortex sand, the specials' billows;
- `crater`, `furrow`, `reignite`, `surge` and `eject`: special and finisher effects, including the truck axe's cold furrow and the fused glass. They keep their current look on every surface;
- the jets' plumes and jet-wash sounds (`cybertruck/audio/rocket.ts`, `bat/audio/jet.ts`);
- engine and motor voices, servo and machine voices, blast and cannon sounds, the soldiers' hit bank, and the debris metal.

Checks: a test renders every surface-keyed audio take with the `sand` set and compares it with the takes rendered before the change (identical). Desert preview shots are identical. A diff of `src/content/` shows only the surface-key plumbing.

## 8. Title and pause

### 8.1 Title and world selector (`ui/title-menu.ts`)

- The entry veil stays as the title screen, with a drawn backdrop per world in the current SVG style. The desert keeps its sun and ridges. The island shows a sea horizon, the volcano's cone on the left, the cliff-top Rocca with its campanile on the right, and the low sun left of centre with a glitter path. Switching worlds crossfades the backdrop.
- Boot runs to the title: modules, WebGPU, the saved car, the soldier (and the commander asset if the island is preselected). Then the gauge morphs into the **world carousel**, the vehicle menu's component extracted to `ui/carousel.ts`:
  - the same interaction as the vehicle menu: arrows, A/D, drag, click a neighbour; Enter or a click on the centred name confirms;
  - Entries: **The Desert** ("Open dunes and the fortress", sand accent) and **Isola Ferro** ("A volcanic island and the Rocca", terracotta accent).
- Confirming collapses the carousel back into the gauge for the world's stages (download, build, bake light, audio, compile shaders, first frame). Then the **Enter** button and the live scene, exactly as today.
- The choice is saved in local storage (`transformer.world`). `BOOT_STEPS` splits into boot stages and world stages.

### 8.2 Pause menu

- The plate keeps **Resume** as the primary action and adds **Main menu** below it, quieter.
- The first click turns it into "Leave to the main menu?". A second click within 4 s confirms, and Resume, Escape or the timeout cancels.
- Leaving tears the session down (§10.4) and returns to the title with the current world selected.

## 9. Warm-up coverage

No pipeline may be built in play. What the island adds, and how each item is warmed:

| Thing | Hidden in play by | Warm route |
|---|---|---|
| Terrain near and far draws, cliff LOD tiers, talus | distance and LOD | `reveal()` shows every tier of every chunk with culling off |
| Rocca and Marina near detail and far LOD | distance swap | `reveal()` shows both tiers of every bucket (the fort's `showAllDetail`, generalised) |
| Vegetation tiers and impostors | distance | `reveal()` forces one instance per tier per species |
| GPU grass | a distance ring | always drawn, with a fixed count |
| Ocean, foam, swash, harbour, spray | never hidden (spray is faded) | drawn from the warm frame; FFT and foam compute run on it |
| Surface effects: rubber marks, tyre smoke, splashes, wakes, per-surface prints | ring buffers and pools | `ContactEffects.warm(true)`, one of each |
| Fumaroles, lighthouse glow | never hidden | always drawn |
| Commander: every tier, its debris, weapon lit, health bar | not yet spawned, or respawning | its renderer's `warm(true)` draws the living tiers and the debris pieces, as the horde's does |
| Sun-shadow height, sky visibility, fields texture, clouds | one-time compute | run in `prepare()` before the warm draw |

`tools/switch-probe.mjs` gains `WORLD=island` and reports 0 pipelines built in play for every car switch. A new `tools/rocca-probe.mjs` also reports 0 for a scripted fight on the island: the robot walks in, garrisons alert and reinforce, the commander dies and respawns, specials play, and the robot leaves. It drives past every region and tier on the way.

## 10. Architecture changes

### 10.1 The world contract (`src/worlds/world.ts`)

```ts
interface WorldDefinition {
  id: 'desert' | 'island'
  label: string; tagline: string; accent: string
  art: () => SVGElement                               // title backdrop
  load(ctx: WorldLoadContext): Promise<GameWorld>     // dynamic import of the world package
}

interface GameWorld {
  readonly root: Object3D
  readonly ground: Ground                             // height, maxSlope, walkable
  readonly contactEffects: ContactEffects             // + surface(), dustColor()
  readonly colliders: CircleCollider[]; readonly segments: SegmentCollider[]
  readonly cameraObstacles: CameraObstacles
  readonly look: WorldLook                            // sun, exposure, post options (shimmer), static shadow levels
  readonly spawn: { x: number; z: number; yaw: number }
  readonly stronghold: Stronghold
  readonly ambience: WorldAmbience
  environmentScene(): Scene
  prepare(renderer: WebGPURenderer): Promise<void>    // bakes
  reveal(): () => void
  update(camera: Camera, focus: Vector3, dt: number): void
  dispose(): void
}
```

`src/worlds/registry.ts` lists both worlds. The desert becomes an adapter with no change in behaviour or look.

### 10.2 Shared world kit (`src/worlds/kit/`)

Shared by both worlds, moved out of `worlds/desert/` with no behaviour change:
- the mesh writer and slot buckets;
- `SkyVisibility`, generalised to a domain and cell size;
- the fort's modules (T-walls, HESCO, sandbags, masts, floodlights, containers, garages, paving) and their materials;
- the dust, grit, imprint, scorch and debris machinery, keyed by surface;
- the atmosphere model with parameters (`tests/atmosphere.test.ts` checks the desert's tables bit for bit);
- the CDLOD `TerrainMesh`, taking a `heightNode(xz)`.

### 10.3 Stronghold contract (`src/game/enemies/stronghold.ts`)

The horde, garrisons, navigation and barrier import the desert's `Fort` and `FortPlan` today. They move to this contract:

```ts
interface Stronghold {
  readonly districts: StrongholdDistrict[]   // polygon, bounds circle, yard, posts, spawns, garrison, index
  readonly gates: StrongholdGate[]           // the fort's gate data: waypoints either side, lane, districts joined
  readonly nav: number[][]                   // the gate graph (next hop), as plan.nav
  readonly grid: ColliderGrid
  readonly circles: CircleCollider[]; readonly segments: SegmentCollider[]
  readonly floor: number                     // the level pad's height (desert 0, Rocca 64)
  readonly barrier: Float32Array             // the car barrier polygon (the desert's ring, as a polygon)
  readonly commander: boolean                // desert false
  districtAt(x: number, z: number): number   // −1 outside
  inside(x: number, z: number): boolean      // within the perimeter
  near(x: number, z: number): boolean        // for the fort hint
}
```

- The desert fort adapts to it (`worlds/desert/fort/stronghold.ts`, with `districtAt` implemented by its existing `sectorAt`).
- The soldiers add `floor` to their placement and landing. The desert's floor is 0.
- `tests/enemies.test.ts` passes unchanged on the desert, and runs the same walk-in and stand-down checks on the Rocca.

### 10.4 Lifecycle (`src/game/app.ts`)

- `main.ts` stays tiny. `GameApp` owns the `GpuHost`, the one `AudioMix` (moved up from the session: one AudioContext per page) and the asset caches (the roster, the soldier, the commander).
- `app.enterWorld(def)` builds a `GameSession(world, …)`, runs the world stages and starts the loop. `app.leaveWorld()`:
  1. clears the loop;
  2. calls `session.dispose()`: input, camera, voices, the horde and commander renderers, the characters built in it, the post pipeline, the environment texture, and `world.dispose()` (geometries, materials, textures, render targets including shadow levels and bakes, storage buffers, compute nodes);
  3. shows the title.
- Downloaded assets stay cached. Characters are rebuilt per session (their effects hold the world's `ContactEffects`) from the same assets and profiles, so they are the same cars.
- `GpuHost.fail` stays the only other thing that stops the loop.
- `tools/world-cycle-probe.mjs` cycles desert → island → desert three times headlessly. `renderer.info` memory must return to the baseline ±2 % after each leave.

### 10.5 Module layout

```
src/game/app.ts
src/game/enemies/stronghold.ts, commander.ts
src/content/commander/                 asset, rig, moves, materials, renderer, audio
src/content/transformer/combat/knockback.ts, src/content/<character>/combat/knockback.ts
src/worlds/world.ts, registry.ts, kit/
src/worlds/island/
  plan/        coast.ts relief.ts roads.ts regions.ts rocca.ts marina.ts
  terrain/     data.ts (bake decode) ground.ts mesh.ts material.ts fields.ts classes.ts cliffs.ts
  sky/         atmosphere params, clouds.ts
  sea/         ocean.ts cascades.ts swash.ts shelter.ts spray.ts
  roads/       ribbons.ts furniture.ts galleries.ts viaduct.ts
  vegetation/  species/ scatter.ts impostors.ts grass.ts
  town/        grammar.ts house.ts landmarks/ (barbican gate-tower duomo campanile palazzo portici keep convent bastion lighthouse chapel magazzini moles)
  rocca/       build.ts overlay.ts stronghold.ts
  surface.ts   IslandSurface (ContactEffects)
  ambience.ts
  world.ts     IslandWorld
src/ui/carousel.ts, title-menu.ts
tools/island-bake.mjs island-map.mjs rocca-map.mjs rocca-plan.mjs road-drive.mjs island-bench.mjs rocca-probe.mjs world-cycle-probe.mjs ambience-model.mjs
```

## 11. Build steps

Each step ends lint-, type- and test-clean. **⏸ review** marks a stop for the user's visual inspection before refinement. Every rendering step adds its warm-up route (§9) in the same change.

### Phase A: foundation (the desert must not change)

**A1 World contract and kit.**
- Build: `GameWorld`, the registry, the desert adapter; the session takes a world; the post pipeline takes `WorldLook`; move the kit (§10.2).
- Accept: desert preview shots identical; `switch-probe` 0 in every direction; all tests pass.

**A2 Stronghold contract.**
- Build: the horde, garrisons, nav and barrier on `Stronghold`; the fort adapts; `floor`; the barrier as a polygon.
- Accept: `enemies.test.ts` unchanged and passing; a desert `fight-sheet` matches.

**A3 Surface channel.**
- Build: `surface()` and `dustColor()`; the surface-keyed sets in `footfall.ts`, `tyres.ts` and the soldier audio with only `sand` filled; the desert answers sand.
- Accept: audio take comparison identical; preview identical; the `src/content/` diff is plumbing only.

**A4 Lifecycle and menus.**
- Build: `GameApp`, the AudioMix moved up, the carousel extracted, the title selector, Main menu, disposal. The island entry is a dev-only stub until B3.
- Accept: `world-cycle-probe` at baseline; `pause-menu.test.ts` extended (confirm, cancel, timeout); a new `title-menu.test.ts`.
- ⏸ review: the title and pause flows.

### Phase B: the island

**B1 Plan.**
- Build: the coast spline and spans, relief fields, regions, the plateau and inlet, the sun constants; `island-map.mjs` (relief shading, coast types, regions, the sun check).
- Accept: sun check ≥ 95 %; the coast is simple (test).
- ⏸ review: the map.

**B2 Roads and bake.**
- Build: road splines and profile solving, the carves, `island-bake.mjs` (all §3.1 files and the hash), `IslandGround` and walkability.
- Accept: `tests/island-plan.test.ts` (grades and radii per road, the ring closed, walkable along every road, off-road slopes ≤ 30° outside cliff bands); `road-drive.mjs` runs every car along every road (airtime, landings, lateral g, stuck points 0).

**B3 Terrain rendering.**
- Build: CDLOD over the bake with near and far draws and the deep-floor skip; the fields texture; the terrain material with texture sets and macro map; `island-bench.mjs`.
- Accept: a CPU/GPU parity test (≤ 1 mm at 10k points); within the §3.7 costs.
- ⏸ review: drive the island.

**B4 Cliffs.**
- Build: cliff shells and LODs, talus, collision and camera proxies, the cliff-band push into the heightfield.
- Accept: no heightfield poke-through (a test samples the shell against the field); budget.
- ⏸ review: the Rocca's cliffs from the Marina and the spawn.

**B5 Sky and light.**
- Build: atmosphere parameters, the cloud bake, the sun, environment, sun-shadow height, sky visibility at 2 m, static shadow levels.
- Accept: desert atmosphere tables unchanged; bakes ≤ 1 s.
- ⏸ review: the golden-hour look.

**B6 Sea.**
- Build: FFT cascades (with the skill's impulse and frequency test), depth colour, shelter, beach swash, cliff foam and spray, the water walls.
- Accept: the FFT test; ≤ 1.5 ms.
- ⏸ review: the coast and the inlet.

**B7 Roads rendered.**
- Build: ribbons, markings, shoulders, guardrails and parapets with colliders, galleries, the viaduct, the Salita's ledge.
- Accept: no coplanar faces (ribbon offsets tested); `road-drive` clean.
- ⏸ review.

**B8 Vegetation.**
- Build: species, scatter, tiers and impostors, grass, wind, trunk colliders.
- Accept: counts and triangles per tier printed; budget.
- ⏸ review: the stone pine first, then the rest.

**B9 Island surface.**
- Build: `IslandSurface` (§7): per-surface prints, marks, smoke, dust colour, splashes, wakes; the surface-keyed audio sets fitted from recordings.
- Accept: `dust-bench` with smoke-heavy drifting ≤ 1.5 ms.

**B10 Free-roam places.**
- Build: the town kit's first use (Marinella), the Marina and its quays, lighthouse, chapel, rim and fumaroles, quarry; ambience.
- ⏸ review: one Marina block first, then the rest.

### Phase C: Rocca di Ferro

**C1 Plan.**
- Build: `planRocca()` with districts, gates, nav, posts, spawns, colliders and camera proxies; `rocca-map`, `rocca-plan`.
- Accept: `tests/rocca-plan.test.ts` with the fort's plan checks (every district reachable without passing outside, gate lanes clear, posts and beats clear of colliders and inside their district, a spawn door in every district), plus the §1 clearances and the level floor.
- ⏸ review: the map.

**C2 Buildings.**
- Build: blocks from the town kit, the perimeter curtain and the land front, the divider arches.
- ⏸ review: one district first.

**C3 Landmarks.**
- Build: the barbican and gate tower, the Duomo and campanile, the palazzo, the portici and San Pietro, the citadel and keep, the convent, the bastion, the Porta Marina ramp.
- ⏸ review: after the Duomo, and after the citadel.

**C4 Occupation and light.**
- Build: the enemy overlay from the fort kit, flags, sky visibility at 0.42 m, static casters, buckets and LOD; soldiers placed and running (the stronghold wired to the horde).
- Accept: `enemies.test.ts` Rocca cases; `island-bench` worst views within budget; `switch-probe WORLD=island` 0.
- ⏸ review: fight in the Rocca.

### Phase D: the commander

**D1 Asset.**
- Build: the loader, the rig from its bones, and the materials for its slots.
- Accept: a new `tests/commander.test.ts` checks the asset: version, the required bones, the `weapon` bone, the slots, the `dims` fields, three LOD tiers and the shadow proxy.

**D2 In game.**
- Build: renderer and health bar; the four-move combo as poses and hit volumes; the 40/40/20 combo roll; the soldiers' rules at its size; stronghold-wide alert and nav at its radius; the 30 s respawn; breakup; sound.
- Accept: `tests/commander.test.ts`:
  - the combo lengths over 10k seeded rolls come out 40/40/20 ± 1.5 %, and only lengths 1, 2 and 4 occur;
  - respawn timing, and one alive at a time;
  - the special hold;
  - moves 1–3 reach the robot only through `onStruck`.
- Accept: `rocca-probe` 0 pipelines.
- ⏸ review: fight it.

**D3 Knock-back.**
- Build: the shared reaction keys, each robot's amplitude and steps, `RobotCombat.knockback`, the session wiring from the commander's move 4.
- Accept: `tests/combat.test.ts`, for every robot at 30 and 120 Hz, knocked back from the stance, from inside each combo move and from a run:
  - finite throughout;
  - wrists, weapon and edge outside the body cores;
  - planted feet on the ground, with no skating;
  - root travel 3.0 ± 0.2 m;
  - a formed weapon gone by the end;
  - the hand-back to the gait with no joint-speed spike.
  - Also: nothing happens when the robot is guarding or airborne; input is refused for 0.6 s, then movement and a click are taken.
- ⏸ review: the reaction on each robot.

### Phase E: docs

- Split this design into modular docs as each phase lands: `island.md` (terrain, cliffs, sea, look), `rocca.md` (plan and construction), `commander.md`, `world-lifecycle.md`.
- Update `architecture.md`, `enemies.md`, `worlds.md`, `forts.md`, `rendering-and-boot.md` and `checks.md` where the contracts changed, and the `index.html` meta text.

## 12. Inputs needed from the user

- **Commander model**: `public/models/commander.{json,bin}` and `blender/commander.blend`, before D1.
- **Recordings** for `ref_sounds/` (never shipped):
  - footsteps on stone flags, cobble, gravel and soil (a heavy boot is fine as a base for the fit);
  - tyres on asphalt (rolling and a drift squeal), cobble and gravel;
  - surf on sand, waves on rocks, wind in pines, cicadas, harbour lapping;
  - heavy machinery servos and heavy wheels for the commander.
