"""Preview materials. Slot names are the contract with the game: every slot maps
to a TSL node material of the same key in src/content/cybertruck/materials.ts."""
import bpy

# slot: (base color sRGB hex, metallic, roughness, emission hex or None, emission strength)
SLOTS = {
    'steel': (0xb9bdc1, 1.0, 0.24, None, 0),       # brushed stainless body armour
    'glass': (0x0a0c0f, 0.0, 0.04, None, 0),       # tinted glazing
    'plastic': (0x151617, 0.0, 0.55, None, 0),     # black textured trim / cladding
    'tonneau': (0x1d1f22, 0.4, 0.45, None, 0),     # vault cover
    'rubber': (0x141414, 0.0, 0.9, None, 0),
    'aero': (0x232527, 0.3, 0.45, None, 0),        # wheel cover spokes
    'aeroDark': (0x0f1011, 0.2, 0.55, None, 0),
    'graphite': (0x2a2d31, 0.85, 0.38, None, 0),   # robot structural castings
    'darkSteel': (0x5c6166, 1.0, 0.3, None, 0),    # machined joints
    'chrome': (0xe2e4e6, 1.0, 0.08, None, 0),      # hydraulic rods
    'interior': (0x0c0c0d, 0.0, 0.85, None, 0),
    'mech': (0x3b3f44, 0.9, 0.42, None, 0),        # secondary mechanism parts
    'lightWhite': (0xf4f7ff, 0.0, 0.3, 0xf4f7ff, 12.0),
    'lightRed': (0xff1a12, 0.0, 0.3, 0xff1a12, 10.0),
    'lightAmber': (0xffa028, 0.0, 0.3, 0xffa028, 6.0),
    'visor': (0xe8f4ff, 0.0, 0.3, 0xe8f4ff, 14.0),
    'core': (0xdff0ff, 0.0, 0.3, 0xdff0ff, 6.0),
    'reflector': (0x5a0805, 0.2, 0.3, 0x200000, 1.0),
}


def srgb(h):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch((h >> 16) & 255), ch((h >> 8) & 255), ch(h & 255), 1.0)


def get(slot):
    if slot not in SLOTS:
        raise KeyError('unknown material slot ' + slot)
    name = 'ct.' + slot
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        build(m, slot)
    return m


def build(m, slot):
    col, metal, rough, emit, strength = SLOTS[slot]
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = srgb(col)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = srgb(col)
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = srgb(emit)
        bsdf.inputs['Emission Strength'].default_value = strength
    if slot == 'steel':
        # brushed grain: stretched noise drives roughness and a faint tint
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (60.0, 1.2, 60.0)
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 6.0
        nz.inputs['Detail'].default_value = 8.0
        ramp = nt.nodes.new('ShaderNodeMapRange')
        ramp.inputs['To Min'].default_value = 0.17
        ramp.inputs['To Max'].default_value = 0.32
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
        nt.links.new(nz.outputs['Fac'], ramp.inputs['Value'])
        nt.links.new(ramp.outputs['Result'], bsdf.inputs['Roughness'])
    if slot == 'glass':
        bsdf.inputs['Coat Weight'].default_value = 1.0
        bsdf.inputs['Coat Roughness'].default_value = 0.02


def ensure_all():
    for s in SLOTS:
        get(s)
