# Desert world

The opening environment is an effectively unbounded desert. Distant sky and ridge meshes follow the camera; rock instances repeat around the player in deterministic tiles. The world updates instance transforms only after the player moves far enough to need recentering. Large rocks expose stable collision circles whose coordinates update with the matching instance, avoiding per-frame collider allocation.

The sun's shadow camera follows the player on a texel-snapped grid to limit shimmer. Environment lighting is baked from a separate sky and ground scene. Dust is a bounded instanced sprite simulation driven by tyre slip, impacts, and footsteps. Its billow mask samples the desert's shared mipmapped noise texture, so heavy overlapping dust does not run procedural fractal noise for every fragment. These mechanisms are world content and can be replaced by other environments without changing the Cybertruck geometry.

## Surface response

The world answers contact through `DesertSurface` (the `ContactEffects` interface): dust for tyres, footfalls and jet blasts, tyre tracks and footprints. Tracks and footprints share one imprint shader (`sand-imprint.ts`).

- **Ribbons:** one per wheel, written into a shared ring of 4096 quads (0.3 m each). Only newly written quads are uploaded. A frame without contact ends a ribbon.
- **Shading:** the ribbon has no texture. Its shader rebuilds the hardpan from the ground's own albedo and relief (`groundAlbedo`, `groundSlope` are shared with the ground material), then adds the rut, the displaced-sand lip and the chevron tread imprint as a height field lit through the normal. Outside the tyre it equals the bare ground, so its edges blend without a seam.
- **Natural variation:** noise varies the rut depth, crumbles the walls and collapses part of the tread. Tread detail fades by screen-space derivative so it doesn't shimmer at a distance.
- **Depth:** the ribbon sits 8 mm up with a depth bias against z-fighting.
- **Fading:** tracks fade over 150 s, or as the ring overwrites them.
- **Footprints:** one decal per footfall in a ring of 240. Each is a rounded, sole-shaped depression with a displaced-sand lip and transverse tread bars, fading over 90 s. The character measures its planted sole (the foot's and toe cap's lowest support points, boxed along the foot's heading), so prints match the foot.
