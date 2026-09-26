# Desert world

The opening environment is an effectively unbounded desert. Distant sky and ridge meshes follow the camera; rock instances repeat around the player in deterministic tiles. The world updates instance transforms only after the player moves far enough to need recentering. Large rocks expose stable collision circles whose coordinates update with the matching instance, avoiding per-frame collider allocation.

The fortress stands on a fixed site (forts.md); the tiled boulders are cleared from its grounds, and its walls and buildings join the world's colliders as capsules (`segments`).

The sun casts through three cascades (`CSMShadowNode`, practical splits, blended seams) over the view out to 150 m; each cascade snaps to its texels, and their splits are recomputed whenever the camera's fov or aspect changes (the lens kicks, the director). A single 32 m box round the player left everything beyond it unshadowed, so soldiers' and buildings' shadows popped in as they came near. Environment lighting is baked from a separate sky and ground scene. The shadow cameras (cloned into every cascade) also draw `SHADOW_ONLY_LAYER` (the soldiers' shadow proxies).

## Sky, haze and stone

`hazeColor(dir)` is the one horizon-haze colour. It is slightly blue away from the sun and warm toward it. The sky horizon, the ground fog (`fogNode`) and the base of the distant ridges all fade to it, so no seam shows where they meet. The sky has sparse cirrus: two noise fetches on a plane overhead, streaked along the wind and drifting slowly, which fade out into the horizon haze. The distant ridges keep their original flat colouring; shaded erosion gullies on them looked fake and were removed.

Rocks start as displaced icosahedra and are cut by five random fracture planes. They use creased normals: flat within a fracture face, hard at the edges between faces, and smooth over the lumpy parts. Plain flat shading showed the triangulation, and fully smooth normals turned the rocks into blobs. The rock material adds strata, dark varnish on steep faces, dust on the tops and sand banked around the base. Dust is a bounded instanced sprite simulation driven by tyre slip, impacts, and footsteps. Its billow mask samples the desert's shared mipmapped noise texture, so heavy overlapping dust does not run procedural fractal noise for every fragment. These mechanisms are world content and can be replaced by other environments without changing the Cybertruck geometry.

## Desert floor

`groundSurface(xz)` is the single description of the bare floor: albedo, roughness and the relief slope. The ground and the imprint decals both use it. The floor is hardpan with patches of paler loose sand (`drift`), and the loose sand carries wind ripples. A ripple has a gentle windward face and a steep lee face (0.16 m wavelength, 8 mm high), with its crests bent by the relief noise. The ripples are analytic, and their wander reuses the relief texture fetch, so they add no fetches. They fade out before a pixel spans half a wavelength (`fwidth` of the ripple phase), which prevents moiré. Keep the crest warp small: a strong warp turns the ripples into contour lines. Imprints subtract the ripple slope where the sand is pressed, so tyres and feet flatten the ripples.

## Surface response

The world answers contact through `DesertSurface` (the `ContactEffects` interface): dust for tyres, footfalls and jet blasts, grit, tyre tracks and footprints. A tyre reports one `TyreContact` per frame: its point, heading, ground velocity and the tread's sliding velocity over the ground. Tracks and footprints share one imprint shader (`sand-imprint.ts`).

- **Ribbons:** one per wheel, written into a shared ring of 4096 quads (0.3 m each). Only newly written quads are uploaded. A frame without contact ends a ribbon.
- **Shading:** the ribbon has no texture. Its shader rebuilds the floor from the ground's own albedo and relief (`groundSurface`, shared with the ground material), then adds the rut, the displaced-sand lip and the chevron tread imprint as a height field lit through the normal. Outside the tyre it equals the bare ground, so its edges blend without a seam.
- **Natural variation:** noise varies the rut depth, crumbles the walls and collapses part of the tread. Tread detail fades by screen-space derivative so it doesn't shimmer at a distance.
- **Depth:** the ribbon sits 8 mm up with a depth bias against z-fighting.
- **Fading:** tracks fade over 150 s, or as the ring overwrites them.
- **Sliding:** a sliding tread scrapes instead of pressing, scaled by slide speed (full at 5 m/s). The rut is up to a third shallower, the tread imprint is wiped into fine striations along the travel (faded once under a pixel), and the berm triples on the side the tyre slides toward and shrinks on the other (a per-vertex `plow` side). A tyre at an angle to its travel sweeps its tread width and its 0.36 m footprint length, so drift ribbons widen. In a drift the rears run wide of the fronts, so the four ribbons separate.
- **Roost:** a sliding tread throws a roost of dust along its slide (7 puffs/s per m/s of slide per tyre, bigger, longer-lived and taller than rolling dust) and ballistic grit (`grit.ts`): up to 1200 tiny alpha-tested clods, CPU-simulated in a ring and drawn in one call, uploaded only while something is in the air.
- **Blasts:** fused-glass craters and furrows that cool through blackbody light, crust debris, a base surge of dust and grit bursts; a special's effects call them through `ContactEffects` (specials.md).
- **Footprints:** one decal per footfall in a ring of 240. Each is a rounded, sole-shaped depression with a displaced-sand lip and transverse tread bars, fading over 90 s. The character measures its planted sole (the foot's and toe cap's lowest support points, boxed along the foot's heading), so prints match the foot.
