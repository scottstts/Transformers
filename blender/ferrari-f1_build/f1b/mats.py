"""Preview materials. Slot names are the contract with the game: every slot maps
to a TSL node material of the same key in src/content/ferrari-f1/materials.ts."""
import bpy

# slot: (base color sRGB hex, metallic, roughness, emission hex or None, emission strength, clearcoat)
SLOTS = {
    'paint': (0x8e0c18, 0.0, 0.32, None, 0, 1.0),        # Rosso, deep metallic-free gloss under clearcoat
    'paintWhite': (0xe8e8e4, 0.0, 0.30, None, 0, 1.0),   # engine-cover / wing livery panels
    'carbon': (0x131416, 0.35, 0.28, None, 0, 1.0),      # lacquered visible carbon weave
    'carbonMatte': (0x18191b, 0.25, 0.55, None, 0, 0.0),  # floor, underbody, inner faces
    'rubber': (0x19191a, 0.0, 0.86, None, 0, 0.0),       # slick tyres
    'tyreMark': (0xf0c21c, 0.0, 0.62, None, 0, 0.0),     # Pirelli compound band (medium, yellow)
    'rim': (0x1d1e21, 0.9, 0.34, None, 0, 0.0),          # magnesium rim barrel, anodised black
    'brake': (0x2d2926, 0.1, 0.72, None, 0, 0.0),        # carbon-carbon disc
    'titanium': (0x8b8e92, 1.0, 0.36, None, 0, 0.0),     # plank skids, fasteners, halo mounts
    'mirror': (0xd8dde2, 1.0, 0.04, None, 0, 0.0),
    'glass': (0x0b0d10, 0.0, 0.05, None, 0, 1.0),        # smoked visor glass
    'yellow': (0xffcc12, 0.0, 0.38, None, 0, 1.0),       # Ferrari shield yellow accents
    'graphite': (0x26292d, 0.8, 0.40, None, 0, 0.0),     # robot structural castings
    'darkSteel': (0x5a5f65, 1.0, 0.30, None, 0, 0.0),    # machined joints
    'chrome': (0xe0e3e6, 1.0, 0.08, None, 0, 0.0),       # hydraulic rods
    'mech': (0x3a3e44, 0.9, 0.42, None, 0, 0.0),         # secondary mechanism parts
    'interior': (0x0d0d0e, 0.0, 0.88, None, 0, 0.0),     # cockpit liner, duct throats
    'lightRed': (0xff1a14, 0.0, 0.3, 0xff1a14, 10.0, 0.0),
    'visor': (0xffe7b0, 0.0, 0.3, 0xffe7b0, 14.0, 0.0),  # warm robot eye slit
    'core': (0xffc860, 0.0, 0.3, 0xffc860, 6.0, 0.0),    # power core glow
    'eye': (0x1f6fff, 0.0, 0.25, 0x1f6fff, 2.2, 0.0),    # robot eyes: saturated blue, not blown out
    'gold': (0xb88a3a, 1.0, 0.30, None, 0, 0.0),
    'silver': (0xd4d7dc, 0.85, 0.36, None, 0, 0.0),      # the robot's face mask (satin: reads light, not mirror-dark)
    'blackChrome': (0x0b0c0e, 1.0, 0.14, None, 0, 0.0),   # the robot's skull and dark trim         # anodised joint caps and fasteners
}


def srgb(h):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch((h >> 16) & 255), ch((h >> 8) & 255), ch(h & 255), 1.0)


def get(slot):
    if slot not in SLOTS:
        raise KeyError('unknown material slot ' + slot)
    name = 'f1.' + slot
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        build(m, slot)
    return m


def build(m, slot):
    col, metal, rough, emit, strength, coat = SLOTS[slot]
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = srgb(col)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.03
    m.diffuse_color = srgb(col)
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = srgb(emit)
        bsdf.inputs['Emission Strength'].default_value = strength
    if slot in ('carbon', 'carbonMatte'):
        # twill weave: two crossed wave textures modulate roughness and a faint tint
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (160.0, 160.0, 160.0)
        ch = nt.nodes.new('ShaderNodeTexChecker')
        ch.inputs['Color1'].default_value = srgb(0x0e0f10)
        ch.inputs['Color2'].default_value = srgb(0x202226)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], ch.inputs['Vector'])
        nt.links.new(ch.outputs['Color'], bsdf.inputs['Base Color'])


def ensure_all():
    for s in SLOTS:
        get(s)
