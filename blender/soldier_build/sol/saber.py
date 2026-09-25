"""The energy blade (bone `blade`: origin at the emitter, +Z along the blade).
The hilt runs back through the right fist along -Z; the blade core is a thin
emissive capsule the game drives (ignition, glow, trail)."""
import math
from mathutils import Matrix, Vector
from . import kit as S

BLADE_LEN = 1.25
CORE_R = 0.017


def hilt():
    out = []
    # emitter shroud with a lit throat, knurled grip, weighted pommel
    shroud = [(0.0, -0.004), (0.02, -0.004), (0.02, 0.0), (0.03, -0.006), (0.032, -0.02), (0.032, -0.055), (0.026, -0.062), (0.0, -0.062)]
    out.append((S.revolve(shroud, 28, axis='Z'), 'steel'))
    out.append((S.revolve([(0.0, -0.002), (0.019, -0.002), (0.019, 0.004), (0.0, 0.004)], 24, axis='Z'), 'glow'))
    out.append((S.cyl((0, 0, -0.165), 0.0205, 0.21, 'Z', 24), 'mech'))
    for k in range(9):
        z = -0.08 - k * 0.018
        prof = [(0.0, -0.006), (0.021, -0.006), (0.0235, -0.003), (0.0235, 0.003), (0.021, 0.006), (0.0, 0.006)]
        out.append((S.revolve(prof, 24, axis='Z', M=Matrix.Translation(Vector((0, 0, z)))), 'rubber'))
    pommel = [(0.0, -0.262), (0.024, -0.262), (0.029, -0.27), (0.029, -0.292), (0.022, -0.302), (0.0, -0.302)]
    out.append((S.revolve(pommel, 28, axis='Z'), 'steel'))
    # activation stud on the shroud
    out.append((S.cyl((0.0, -0.033, -0.04), 0.007, 0.012, 'Y', 12), 'glow'))
    return out


def blade():
    prof = [(0.0, 0.0), (CORE_R * 0.8, 0.0)]
    prof += [(CORE_R, 0.02), (CORE_R, BLADE_LEN - CORE_R)]
    prof += [(CORE_R * math.cos(math.pi / 2 * k / 5), BLADE_LEN - CORE_R + CORE_R * math.sin(math.pi / 2 * k / 5)) for k in range(1, 6)]
    prof[-1] = (0.0, BLADE_LEN)
    return [(S.revolve(prof, 20, axis='Z'), 'blade')]
