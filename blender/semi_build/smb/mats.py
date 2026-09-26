"""Preview materials. Slot names are the contract with the game: every slot maps
to a TSL node material of the same key in src/content/semi/materials.ts."""
import bpy

PREFIX = 'semi.'

# slot: (base color sRGB hex, metallic, roughness, emission hex or None, emission strength, clearcoat)
SLOTS = {
    'paint': (0xe9ebea, 0.0, 0.30, None, 0, 1.0),        # pearl white body paint under clearcoat
    'trim': (0x0c0d0e, 0.0, 0.34, None, 0, 1.0),         # gloss black trim, pillars, mirror housings
    'blackMatte': (0x151617, 0.0, 0.72, None, 0, 0.0),   # textured black valence, skirts, fenders
    'glass': (0x07090b, 0.0, 0.04, None, 0, 1.0),        # dark tinted glass
    'rubber': (0x161617, 0.0, 0.88, None, 0, 0.0),       # tyres, mud flaps, seals
    'rim': (0xc6cacd, 1.0, 0.22, None, 0, 0.0),          # polished aluminium wheels
    'hubcap': (0xd9dcde, 1.0, 0.12, None, 0, 0.0),       # front aero wheel covers
    'chassis': (0x1b1c1e, 0.4, 0.55, None, 0, 0.0),      # painted frame rails, axles, fifth wheel
    'steel': (0x8e9296, 1.0, 0.38, None, 0, 0.0),        # bare steel: fifth-wheel top, fasteners
    'lamp': (0xf4f7ff, 0.0, 0.2, 0xf4f7ff, 12.0, 0.0),   # headlight bar and headlight clusters
    'amber': (0xff8a1c, 0.0, 0.3, 0xff8a1c, 6.0, 0.0),   # roof marker lights, side markers
    'lightRed': (0xff1a14, 0.0, 0.3, 0xff1a14, 6.0, 0.0),
    'van': (0xe4e6e6, 0.15, 0.34, None, 0, 0.6),         # trailer skin: white painted aluminium
    'alu': (0xc3c7ca, 1.0, 0.30, None, 0, 0.0),          # bare aluminium rails, posts, door frame
    'tapeRed': (0xa8141b, 0.0, 0.25, None, 0, 1.0),      # conspicuity tape (retroreflective)
    'tapeWhite': (0xdfe3e6, 0.3, 0.2, None, 0, 1.0),
    'interior': (0x0d0d0e, 0.0, 0.88, None, 0, 0.0),     # cab interior, apertures, duct throats
    # robot
    'graphite': (0x24272b, 0.8, 0.40, None, 0, 0.0),     # structural castings
    'darkSteel': (0x55595e, 1.0, 0.30, None, 0, 0.0),    # machined joints
    'chrome': (0xe0e3e6, 1.0, 0.08, None, 0, 0.0),       # hydraulic rods
    'mech': (0x383c42, 0.9, 0.42, None, 0, 0.0),         # secondary mechanism parts
    'blackChrome': (0x0b0c0e, 1.0, 0.14, None, 0, 0.0),  # skull, dark trim
    'silver': (0xd4d7dc, 0.85, 0.36, None, 0, 0.0),      # face mask
    'orange': (0xe8641a, 0.0, 0.4, None, 0, 1.0),        # small orange marker accents
    'eye': (0x2a8cff, 0.0, 0.25, 0x2a8cff, 3.0, 0.0),    # robot eyes: cool blue
}


def srgb(h):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch((h >> 16) & 255), ch((h >> 8) & 255), ch(h & 255), 1.0)


def get(slot):
    if slot not in SLOTS:
        raise KeyError('unknown material slot ' + slot)
    name = PREFIX + slot
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


def ensure_all():
    for s in SLOTS:
        get(s)
