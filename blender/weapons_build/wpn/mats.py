"""Preview materials of the weapons. A weapon's slots are its character's slots
(src/content/<character>/materials.ts) plus the weapon's own:

  glow   the axe's light-bar strip (emissive, driven by the weapon in game)
  blade  the sword's polished blade steel

Blender materials are named `<weapon>.<slot>`; the exporter writes the slot."""
import bpy

# slot: (base colour sRGB hex, metallic, roughness, emission hex or None, emission strength, clearcoat)
SLOTS = {
    'axe': {
        'steel': (0xb9bdc1, 1.0, 0.24, None, 0, 0.0),
        'graphite': (0x2a2d31, 0.85, 0.38, None, 0, 0.0),
        'darkSteel': (0x5c6166, 1.0, 0.3, None, 0, 0.0),
        'chrome': (0xe2e4e6, 1.0, 0.08, None, 0, 0.0),
        'mech': (0x3b3f44, 0.9, 0.42, None, 0, 0.0),
        'rubber': (0x141414, 0.0, 0.9, None, 0, 0.0),
        'glow': (0xdff0ff, 0.0, 0.3, 0xdff0ff, 8.0, 0.0),
    },
    'sword': {
        'blade': (0xc9ccd0, 1.0, 0.16, None, 0, 0.0),
        'carbon': (0x131416, 0.35, 0.28, None, 0, 1.0),
        'paint': (0x8e0c18, 0.0, 0.32, None, 0, 1.0),
        'paintWhite': (0xe8e8e4, 0.0, 0.30, None, 0, 1.0),
        'yellow': (0xffcc12, 0.0, 0.38, None, 0, 1.0),
        'titanium': (0x8b8e92, 1.0, 0.36, None, 0, 0.0),
        'rubber': (0x19191a, 0.0, 0.86, None, 0, 0.0),
        'blackChrome': (0x0b0c0e, 1.0, 0.14, None, 0, 0.0),
        'gold': (0xb88a3a, 1.0, 0.30, None, 0, 0.0),
    },
}


def srgb(h):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch((h >> 16) & 255), ch((h >> 8) & 255), ch(h & 255), 1.0)


def get(weapon, slot):
    if slot not in SLOTS[weapon]:
        raise KeyError('unknown %s material slot %s' % (weapon, slot))
    name = '%s.%s' % (weapon, slot)
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        _build(m, SLOTS[weapon][slot])
    return m


def _build(m, spec):
    col, metal, rough, emit, strength, coat = spec
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = srgb(col)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.03
    m.diffuse_color = srgb(col)
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = srgb(emit)
        bsdf.inputs['Emission Strength'].default_value = strength
