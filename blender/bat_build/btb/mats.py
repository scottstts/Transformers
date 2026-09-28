"""Preview materials. Slot names are the contract with the game: every slot maps
to a TSL node material of the same key in src/content/bat/materials.ts."""
import bpy

PREFIX = 'bat.'

# slot: (base color sRGB hex, metallic, roughness, emission hex or None, emission strength, clearcoat)
SLOTS = {
    # the Tumbler: flat military black armour over a dark chassis, bronze accents
    'armor': (0x25272a, 0.48, 0.43, None, 0, 0.0),       # satin black with readable planar highlights
    'armorDark': (0x121314, 0.3, 0.66, None, 0, 0.0),    # recessed / underside plates, vents
    'bronze': (0x8a6a45, 1.0, 0.36, None, 0, 0.0),       # brushed bronze accent panels, nozzle rim
    'glass': (0x090c10, 0.15, 0.16, None, 0, 0.35),      # smoked canopy glass, subdued reflections
    'rubber': (0x141414, 0.0, 0.90, None, 0, 0.0),       # off-road tyres
    'rim': (0x1a1b1c, 0.8, 0.46, None, 0, 0.0),          # black steel wheels
    'chassis': (0x202225, 0.6, 0.50, None, 0, 0.0),      # tube frame, arms, struts
    'copper': (0x7c3a22, 1.0, 0.40, None, 0, 0.0),       # coil springs, shock bodies (the film's red-brown)
    'steel': (0x8e9296, 1.0, 0.36, None, 0, 0.0),        # bare steel: shafts, pins, fasteners
    'nozzle': (0x6f5a44, 1.0, 0.30, None, 0, 0.0),       # heat-tinted titanium petals inside the jet
    'lamp': (0xf4f7ff, 0.0, 0.2, 0xf4f7ff, 10.0, 0.0),   # front lamps
    'amber': (0xff8a1c, 0.0, 0.3, 0xff8a1c, 5.0, 0.0),   # side markers
    'lightRed': (0xff1a14, 0.0, 0.3, 0xff1a14, 6.0, 0.0),
    'interior': (0x0b0b0c, 0.0, 0.90, None, 0, 0.0),     # cockpit, apertures, duct throats
    # robot
    'graphite': (0x26282b, 0.8, 0.40, None, 0, 0.0),     # structural castings
    'darkSteel': (0x4c5055, 1.0, 0.30, None, 0, 0.0),    # machined joints
    'chrome': (0xd8dbde, 1.0, 0.10, None, 0, 0.0),       # hydraulic rods
    'mech': (0x34373c, 0.9, 0.42, None, 0, 0.0),         # secondary mechanism parts
    'blackChrome': (0x0b0c0e, 1.0, 0.16, None, 0, 0.0),  # cowl, dark trim
    'eye': (0xffc35b, 0.0, 0.25, 0xffb23a, 3.5, 0.0),    # narrow warm gold optics
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
        build(get(s), s)
