"""Truck datums (metres). Stations s are measured back from the nose; the authoring
frame's forward coordinate is f = S0 - s (origin midway between the front axle and
the tandem centre, as the game's car origin)."""

S0 = 3.95                  # origin station
FA_S = 1.70                # front axle
RA1_S = 5.62               # first drive axle
RA2_S = 6.94               # second drive axle (52 in tandem)
CAB_REAR_S = 5.00          # cab back wall
FRAME_END_S = 7.62         # rear crossmember face

WHEEL_R = 0.52             # 295/80R22.5
TYRE_W = 0.29
FRONT_X = 1.035            # front wheel centre (lateral)
DUAL_IN_X = 0.755          # inner dual centre
DUAL_OUT_X = 1.075         # outer dual centre
AXLE_Z = WHEEL_R

BODY_W = 1.25              # lower cab half width
GLASS_TOP_Z = 2.72         # the black glass band's top line, round the whole cab
SIDE_GLASS_Z = 1.66        # side window sill
WS_BASE_Z = 1.52           # windshield base at the centreline
LIGHT_Z = 0.985            # light bar centre
VALENCE_Z = 0.47           # black lower valence top
SKIRT_Z = 0.70             # side skirt top line (white body above)
ROOF_Z = 3.98              # roof top
DOOR_S = (2.40, 3.40)      # door seams
QUARTER_S = 4.28           # rear side panel / extender seam
ARCH_R = 0.64              # front wheel arch

RAIL_X = 0.44              # frame rail centre (lateral)
RAIL_TOP = 1.13            # frame rail top
RAIL_H = 0.30
FIFTH_S = 6.25             # fifth wheel centre (kingpin), over the tandem
FIFTH_Z = 1.26             # fifth wheel top


def f(s):
    return S0 - s

# 28 ft pup van (dry box), kingpin 1.0 m behind its front wall
KINGPIN_BACK = 1.00
VAN_FRONT_S = FIFTH_S - KINGPIN_BACK
VAN_LEN = 8.53
VAN_REAR_S = VAN_FRONT_S + VAN_LEN
VAN_HW = 1.295             # half width (2.59 m)
VAN_FLOOR = 1.285          # box underside (clears the fifth wheel top)
VAN_TOP = 4.05
VAN_AXLE_S = VAN_REAR_S - 1.45
VAN_SECTIONS = 5           # telescoping sections, front (innermost) to rear (outermost, doors)
VAN_STEP = 0.024           # each section grows this much per side over the one ahead of it
