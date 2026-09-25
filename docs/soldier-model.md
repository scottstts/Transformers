# Soldier model (Blender)

The enemy soldier (`ref_images/soldier.jpeg`) is built by `blender/soldier_build/` into `blender/soldier.blend` (collection `SOLDIER`) and exported to `public/models/soldier.{json,bin}`:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/soldier.blend --python blender/soldier_build/export_game.py
```

Inside a running Blender: `exec(open('.../soldier_build/run.py').read())`, then `from sol import build; build.build()`. `render.py` makes the review shots.

## Design choices

- 3.0 m tall, approved by the user: about 54 % of the Cybertruck robot and 80 % of the F1. No single height is 60-75 % of both.
- **Rigid parts, no skinning.** One part per bone (20 bones, including a spinning wheel bone per foot and the energy blade's own bone on the right hand). Parts are modelled in their bone's frame (`rig.py`: x left, -y forward, z up, limbs hanging along -Z), so the export stores them as-is. That frame is what makes the horde renderer (one draw per slot) and the break-apart (a piece per bone) possible.
- **Head**: a spherical skull under a gloss-black dome helmet whose rim runs from the brow down to the nape and flares forward into a brim. Under the brim is a narrow faceted face: a smoked visor band over an angular jaw. A cyan light strip runs under the brim and down both visor edges (the reference's lit outline). The head keeps the round-skull rule; the brim and face are layers on it.
- **Feet**: a fork on each ankle carries an axle housing with two tyres either side of it. The shin ends in a tongue between the fork's cheeks, so the ankle has a real clevis. The tyres' inner faces clear the lower shin.
- **The grip**: the right fist closes on the hilt, finger links placed on a circle round the hilt axis. The hilt runs along the hand's forward axis, so shoulder pitch, elbow and wrist all aim the blade in one plane (poses.ts relies on this).
- **Budget**: bevel modifiers use one segment and small parts are pre-chamfered. LOD0 is ~85k triangles; LOD1 (collapse 0.24) and LOD2 (0.07) are decimated before the weighted-normal modifier, so their shading stays clean. The shadow proxy is LOD2 without the emissive and visor slots. Most of the triangles are in curved shells, so planar dissolve bought almost nothing; the saving comes from tiering.
- **Pieces**: each bone's part box and a mass (a filled box at ~1.1 t/m^3) are exported for the debris.
