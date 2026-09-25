"""Preview materials. Slot names are the contract with the game: every slot maps
to a TSL node material of the same key in src/content/soldier/materials.ts.
Blender materials are named `soldier.<slot>`."""
import bpy

# slot: (base colour sRGB hex, metallic, roughness, emission hex or None, emission strength, clearcoat)
SLOTS = {
    'alloy': (0xc3c7cc, 1.0, 0.30, None, 0, 0.0),        # satin anodised aluminium shells
    'alloyDark': (0x7d8288, 1.0, 0.36, None, 0, 0.0),    # recessed/secondary alloy faces
    'shell': (0x0c0d0f, 0.0, 0.22, None, 0, 1.0),        # gloss black helmet / knee caps (clear-coated polymer)
    'polymer': (0x17181a, 0.0, 0.55, None, 0, 0.0),      # satin black joint housings, glove backs
    'rubber': (0x121212, 0.0, 0.88, None, 0, 0.0),       # tyres, boots, glove palms
    'mech': (0x33373c, 0.9, 0.42, None, 0, 0.0),         # structural castings, cores
    'steel': (0x8d9297, 1.0, 0.28, None, 0, 0.0),        # machined pins, fasteners, hubs
    'visor': (0x050607, 0.2, 0.06, None, 0, 1.0),        # smoked face glass
    'red': (0xc4251b, 0.0, 0.40, None, 0, 1.0),          # unit marking panels
    'glow': (0x6fd8ff, 0.0, 0.30, 0x6fd8ff, 9.0, 0.0),   # cyan status light strips
    'blade': (0xe6fbff, 0.0, 0.30, 0x7fdcff, 24.0, 0.0),  # energy blade core
}


def srgb(h):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch((h >> 16) & 255), ch((h >> 8) & 255), ch(h & 255), 1.0)


def get(slot):
    if slot not in SLOTS:
        raise KeyError('unknown soldier material slot ' + slot)
    name = 'soldier.' + slot
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        _build(m, SLOTS[slot])
    return m


def _build(m, spec):
    col, metal, rough, emit, strength, coat = spec
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = srgb(col)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.04
    m.diffuse_color = srgb(col)
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = srgb(emit)
        bsdf.inputs['Emission Strength'].default_value = strength
