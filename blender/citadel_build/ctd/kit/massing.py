"""Module dispatch for the fabricated citadel kit."""

from .barbican import build as build_barbican
from .buildings import build as build_building
from .drums import build as build_drum
from .hydroponics import build as build_dome
from .industry import cargo, cistern_details, condenser, hangar, heatbank
from .sensors import dish, mast, stack
from .sentinels import build as build_sentinel
from .shells import radial
from .spire import build as build_spire
from .street import guard


BUILDERS = {"spire": build_spire, "barbican": build_barbican, "hangar": hangar,
            "tower": build_drum, "lantern": build_drum, "pinnacle": build_drum,
            "dome": build_dome, "condenser": condenser, "heatbank": heatbank,
            "cargo": cargo, "sentinel": build_sentinel, "dish": dish,
            "mast": mast, "stack": stack, "guard": guard}


def build(w, m):
    if m["kind"] == "cistern":
        import math
        y = m["y"]
        profile = [(9, y), (8.7, y + 10)]
        for j in range(1, 13):
            a = j * math.pi / 24
            profile.append((max(0.03, 8.7 * math.cos(a)), y + 10 + 2 * math.sin(a)))
        radial(w, m, profile, sides=64)
        cistern_details(w, m)
    else:
        BUILDERS.get(m["kind"], build_building)(w, m)
