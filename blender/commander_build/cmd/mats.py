"""Ten surface classes; the preview materials are the game's look reference.

ceramic: pearl-white gloss armour. silver: satin light alloy trim. obsidian:
gloss black armour and blades. structure: dark gunmetal frame and joints.
steel: machined bright metal. rubber: tyres. crimson: deep red lacquer.
visor: dark glass. glow: red light strips (unlit, game-driven). blade: the
lance's energy core (unlit, additive)."""
import bpy

# slot: (colour, metallic, roughness, coat)
SLOTS = {
    'ceramic': (0xE6E8EC, .15, .24, .6),
    'silver': (0xA4ACB6, .85, .26, .2),
    'obsidian': (0x0D0F13, .45, .2, .7),
    'structure': (0x24272D, .8, .36, .1),
    'steel': (0x7C8591, .95, .22, .0),
    'rubber': (0x101114, .0, .74, .0),
    'crimson': (0x7A0613, .3, .3, .5),
    'visor': (0x07090D, .2, .08, .8),
    'glow': (0xFF0A22, .0, .3, .0),
    'blade': (0xFF1A30, .0, .2, .0),
}


def rgba(h):
    def c(v):
        x = v / 255
        return x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4
    return tuple(c((h >> shift) & 255) for shift in (16, 8, 0)) + (1,)


def get(slot):
    name = 'commander.' + slot
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    col, metal, rough, coat = SLOTS[slot]
    m.diffuse_color = rgba(col)
    n.inputs['Base Color'].default_value = rgba(col)
    n.inputs['Metallic'].default_value = metal
    n.inputs['Roughness'].default_value = rough
    n.inputs['Coat Weight'].default_value = coat
    n.inputs['Coat Roughness'].default_value = .08
    glow = slot in ('glow', 'blade')
    n.inputs['Emission Color'].default_value = rgba(col) if glow else (0, 0, 0, 1)
    n.inputs['Emission Strength'].default_value = (6 if slot == 'glow' else 9) if glow else 0
    return m
