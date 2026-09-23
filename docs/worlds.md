# Desert world

The opening environment is an effectively unbounded desert. Distant sky and ridge meshes follow the camera; rock instances repeat around the player in deterministic tiles. The world updates instance transforms only after the player moves far enough to need recentering. Large rocks expose stable collision circles whose coordinates update with the matching instance, avoiding per-frame collider allocation.

The sun's shadow camera follows the player on a texel-snapped grid to limit shimmer. Environment lighting is baked from a separate sky and ground scene. Dust is a bounded instanced sprite simulation driven by tyre slip, impacts, and footsteps. These mechanisms are world content and can be replaced by other environments without changing the Cybertruck geometry.
