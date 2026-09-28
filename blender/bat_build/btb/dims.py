"""Tumbler datums (metres), from the Wayne Enterprises blueprint (15 ft x 9 ft,
12 in grid) checked against the photos. Stations s are measured back from the
front of the front tyres; the authoring frame's forward coordinate is
f = S0 - s (origin midway between the axles, the game's car origin).

The car is narrow in front (a slim central beak between two fat front tyres
on exposed arms) and massive at the rear (four 44 in swamper tyres side by
side, the jet nozzle between the inner pair)."""

S0 = 2.25                  # origin station
FA_S = 0.45                # front axle
RA_S = 4.05                # rear axle (3.60 m wheelbase)
NOSE_S = 0.03              # beak tip
TAIL_S = 4.50              # nozzle lip / rear deck end

# wheels
FR_R = 0.43                # front tyre radius
FR_W = 0.52                # front tyre width (the film car's fat front tyres)
FR_X = 0.58                # front wheel centre (lateral): a narrow front track, the arms outboard
RR_R = 0.555               # rear tyre radius (44 x 19.5 swamper)
RR_W = 0.47
RR_XO = 1.075              # outer rear tyre centre
RR_XI = 0.56               # inner rear tyre centre

# body
BODY_HW = 1.31             # flank half width (the widest line, mid height)
CREASE_Z = 0.92            # flank crease (the widest line)
SILL_Z = 0.26              # lower edge of the flanks
BELLY_Z = 0.19             # floor pan underside
BODY_FRONT_S = 1.24        # flanks' front faces (behind the front tyres)
BODY_REAR_S = 3.40         # flanks' rear faces (ahead of the rear tyres)
WS_BASE_S, WS_BASE_Z = 1.30, 0.95     # windshield base (centre)
ROOF_FRONT_S, ROOF_FRONT_Z = 1.86, 1.31
ROOF_REAR_S, ROOF_Z = 2.98, 1.37
DECK_S = 3.72              # rear deck end over the nozzle pod
BEAK_HW = 0.20             # beak half width
NOZZLE_R = 0.17            # nozzle exit (bronze lip)
NOZZLE_Z = 0.83
POD_R = 0.285              # nozzle pod half width


def f(s):
    return S0 - s


FA_F = f(FA_S)             # +1.80
RA_F = f(RA_S)             # -1.80
