# Weapons

The robots' combat weapons are authored procedurally in Blender (`blender/weapons_build/`, package `wpn`) into `blender/weapons.blend`. Each is exported as its own asset, loaded with its character:
- `public/models/cybertruck-axe.{json,bin}`;
- `public/models/ferrari-f1-sword.{json,bin}`.

The large character assets are not touched. Build, save the `.blend` and export with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/weapons.blend --python blender/weapons_build/build_weapons.py
```

`render_weapons.py` (run after the build, `-- <out-dir>`) renders review views of both weapons.

## Frame and export

- **Weapon frame:** +z runs along the haft or blade toward the head or tip, +x faces the cutting edge and y is normal to the flats. The main hand's grip centre is the origin.
- **Grips in the hands:** the haft leaves the fist past the index finger and the edge faces the knuckles, the same for either hand. Two hands on one haft therefore hold it palm to palm.
- **Export:** one rigid body per weapon, stored per material slot with the characters' mesh encoding.
- **Manifest:** also carries the grips (`main`, `off`), the cutting edge's two ends (traced for the trail), the z extent and the radius (for the forming front).
- **Materials:** slots are the character's own (`src/content/<character>/materials.ts`) plus the weapon's own:
  - `glow`: the axe's light-bar strip;
  - `blade`: the sword's polished steel.
  Blender materials are named `<weapon>.<slot>`. A boolean hands its cut faces the cutter's material, so `wpn.kit.cut` reassigns them.
- **Kit:** the kit reuses the F1 build's polygon kit (`f1b.kit`: sections, lofts, revolves, bevel prisms, manifold booleans, the angle-limited bevel finish).

## Design

- **Axe (Cybertruck robot, 5.8 m):** 3.7 m overall, with a 0.15 m chamfered-square haft. It is built in the truck's language: flat, faceted stainless planes with hard creases, and graphite structure layered over them.
  - **Blade:** a bearded blade with a ground double bevel (flats at 7 cm, a 4 mm land at the edge) and two faceted lightening windows. A graphite armour plate is bolted over the blade root; its window openings are cut larger than the blade's for a reveal.
  - **Light bar:** a strip sunk in a groove parallel to the edge, like the truck's front light bar.
  - **Head:** a lozenge eye with stainless side plates and collars, a faceted back spike and a spear point.
  - **Haft:** langets down it below the eye, banded rubber wraps at both hand stations, a faceted pommel.
- **Sword (F1 robot, 3.7 m):** 2.7 m overall. It is built from the car's vocabulary.
  - **Blade:** double-edged with a hexagonal ground section, and a carbon inlay 1.2 mm proud of both flats.
  - **Guard:** a crossguard shaped like the front wing: a swept carbon main plane, a red flap and painted endplates.
  - **Grip and pommel:** a banded grip, and a centre-lock wheel nut for a pommel, with a yellow drive ring as the car's nuts are colour-coded.
- **Joins:** every penetration is declared and structural: hafts through eyes, roots sunk into their sockets, strips 1 mm into their grooves. Plates and wraps are proud.
