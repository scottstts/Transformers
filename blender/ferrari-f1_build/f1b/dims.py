"""Design contract of the car, in metres (authoring frame: x = car left,
f = forward, z = up; origin mid-wheelbase on the ground).

Proportions follow the 2025 SF-25: 3.60 m wheelbase, 2.0 m overall width,
18-inch wheels (720 mm front / 725 mm rear), 305 / 405 mm tyres. A few
stations are stylised where the transformer packaging needs room: the
cockpit sits ~0.2 m forward of a real car's helmet line (the robot's head is
the helmet) and the engine cover stays full enough to house the legs.
Every body part is positioned from this table or from a surface built from it.
"""

FA, RA = 1.80, -1.80                 # axle stations
WHEELBASE = FA - RA

# tyres / wheels
FR_R, FR_W = 0.360, 0.305            # front tyre radius, width
RR_R, RR_W = 0.3625, 0.405           # rear
RIM_R = 0.2286                       # 18" bead seat
FR_X = 0.800                         # front hub centre half-track (outer tyre face 0.9525)
RR_X = 0.795                         # rear hub (outer face 0.9975: 2.0 m overall)

# longitudinal stations
NOSE_TIP = 2.985
BULKHEAD = 2.000                     # nose crash structure / survival cell joint
COCKPIT_F, COCKPIT_R = 1.060, 0.100  # cockpit opening, front and rear edges
ROLL_HOOP = -0.240
POD_INLET = 0.840                    # sidepod inlet lip station (bodycage)
POD_END = -1.350
COVER_END = -1.760                   # engine-cover exit
TAIL = -2.430                        # rear face of the car: the robot's soles (rain lights in the heels)
COVER_TAIL = -2.205                  # gearbox cover ends at the ankle line; the feet form the tail
FW_LE, FW_TE = 3.050, 2.420          # front wing leading / trailing edge (centre)
RW_LE, RW_TE = -1.960, -2.395        # rear wing

# heights
ROLL_HOOP_Z = 0.955
RIM_Z = 0.600                        # cockpit rim
HALO_TOP = 0.925
PLANK_Z = 0.020                      # plank underside (static ride height)
FLOOR_TOP = 0.090                    # floor upper surface at the reference plane

# lateral
FLOOR_HW = 0.820                     # floor half width (edge wings)
POD_HW = 0.760                       # sidepod max half width
FW_SPAN = 0.965                      # front wing half span (endplate outer face)
RW_SPAN = 0.550                      # rear wing half span; clears inner tyre walls

G = 0.0025                           # half reveal: panel gap 5 mm
SKIN = 0.014                         # composite body skin
