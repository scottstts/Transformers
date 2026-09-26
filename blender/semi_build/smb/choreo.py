"""Transformation program: which truck parts move together, what carries them,
and the mechanism steps that take them from the truck to the robot.

Map-first: every truck part becomes a robot feature where it can.
  front clip (nose, light bar, hood, fenders, windshield, front wheels) -> the chest
  cab top halves                  -> shoulder pylons (the curved front nests into the rear)
  doors                           -> forearm shields (window at the elbow)
  quarter panels, skirts          -> thigh plates (the extender tucks behind)
  back wall                       -> back plates the van box locks against
  frame rails, fifth wheel, tandem -> the shins (calf spine, calf plates, wheels)
  rear crossmember, lamps         -> heels
  the van                         -> unhitches, rolls back, telescopes, jacks itself up
                                     and rolls in to lock onto the back as the backpack

Hosts: a bone name, '@assembly' for a sub-mechanism riding on another assembly
(its steps are then expressed in the vehicle frame), or 'world' (the van, until
its `follow` hands it to a bone).

Side-specific entries are authored for L (+x) and mirrored for R.
T: 0 = truck, 1 = robot. Reverse transformation runs the same path backward.
"""
from .mech import move, rot, dock
from . import dims as D
from .trailer import BOGIE_TUCK, BOGIE_AFT

SEC = D.VAN_LEN / D.VAN_SECTIONS
NEST = SEC - 0.045                 # each section slides this far over the one ahead
VAN_BACK = 1.20                    # the van rolls back to clear the kneeling cab
VAN_FLOOR_UP = 2.92                # jacked height gain (floor to 4.3 m)
VAN_IN = 1.38                      # roll-in to the robot's back
BOGIE_LIFT = 1.45                  # bogie retracted into the rear section: wheels clear of the floor line


def sided():
    A = {}
    # cab top halves -> shoulder pylons: split, the curved front nests under the rear, the
    # halves rise off the head and settle on the shoulders
    A['pylon'] = dict(host='clav', parts=['fairing', 'roofcap'], steps=[
        move((0.08, 0.0, 0.10), (0.04, 0.12)),
        dock(c=(0.92, 0.15, 0.72), rot=(0, 0, 0), at=(0.40, 0.72))])
    A['pylonF'] = dict(host='@pylon', parts=['fairingF'], steps=[move((0.02, -1.45, -0.08), (0.12, 0.26))])
    # doors -> forearm shields
    A['door'] = dict(host='forearm', parts=['door', 'doorGlass', 'skirtF'], steps=[
        move((0.10, 0.0, 0.02), (0.05, 0.12)),
        dock(c=(0.46, 0.0, -0.62), rot=(0, 0, 0), at=(0.24, 0.52))])
    # quarter panel + skirt -> thigh plate; it stays upright while the thigh swings up
    A['thighPlate'] = dict(host='thigh', parts=['quarter', 'skirt'], steps=[
        dock(c=(0.50, 0.0, -0.92), rot=(0, 0, 0), at=(0.14, 0.44))])
    A['thighBack'] = dict(host='@thighPlate', parts=['extender'], steps=[move((-0.03, 0.72, 0.0), (0.10, 0.22))])
    # Front road wheels become hip rotors, as in the robot reference.
    A['hipWheel'] = dict(host='thigh', parts=['wheelF'], steps=[
        move((0.22,0,0.04),(0.05,0.16)),
        dock(c=(0.61,-0.10,-0.27),rot=(0,0,0),at=(0.28,0.65))])
    # back wall -> back plates
    A['rearwall'] = dict(host='chest', parts=['rearwall', 'skirtRear'], steps=[
        dock(c=(0.62, -0.80, 0.40), rot=(0, 0, 0), at=(0.06, 0.26))])
    # the drive tandem rides the shin; it slides outboard once the leg is up
    A['tandem'] = dict(host='shin', parts=['rail', 'fifth', 'axle1', 'axle2', 'qfender1', 'qfender2', 'wheelR1', 'wheelR2'],
                       steps=[move((0.22, 0.0, 0.0), (0.62, 0.76))])
    # mud flap: slides straight back beneath the lower wheel, then stands up and settles flat
    # against the back of the calf, resting on the fifth-wheel half behind the wheel
    A['mudflap'] = dict(host='shin', parts=['mudflap'], steps=[
        move((0.0, -0.75, 0.0), (0.50, 0.58)),
        dock(c=(0.0, -0.67, -1.20), rot=(0, 0, 0), at=(0.58, 0.76))])
    A['heel'] = dict(host='foot', parts=['tail'], steps=[])
    # van bogie halves: each retracts up into the rear section before it reaches the tractor's
    # second drive axle, sliding inboard as it goes so the wheels stay inside even the narrowest
    # section; they drop again while the jacks lift the box (slower than the lift, so the wheels
    # only ever rise in the world) and widen back out once clear of the floor
    A['vanBogie'] = dict(host='@van4', parts=['vanBogie', 'wheelV'], steps=[
        move((-BOGIE_TUCK, -BOGIE_AFT, 0.0), (0.33, 0.39)),
        move((0.0, 0.0, BOGIE_LIFT), (0.33, 0.39)),
        move((0.0, 0.0, -BOGIE_LIFT), (0.50, 0.62)),
        move((BOGIE_TUCK, BOGIE_AFT, 0.0), (0.62, 0.68))])
    return A


CLIP = ['valence', 'bumper', 'lightbar', 'lightcorner.L', 'lightcorner.R', 'hood', 'fender.L', 'fender.R',
        'archReturn.L', 'archReturn.R',
        'windshield', 'apillar.L', 'apillar.R', 'qglass.L', 'qglass.R', 'archLiner.L', 'archLiner.R', 'markers',
        'mirror.L', 'mirror.R', 'frontAxle']


def singles():
    S = {
        # front clip -> chest: slides forward off the arms, then rides back up onto the chest,
        # pitched so the windshield stands upright
        'clip': dict(host='chest', parts=CLIP, steps=[
            move((0.0, 0.80, 0.12), (0.03, 0.15)),
            dock(c=(0.0, 0.86, 0.18), rot=(22, 0, 0), at=(0.30, 0.66))]),
        # the van: rolls back on its bogie and front jacks, the rear sections telescope forward over
        # the front one (rear first), the jacks lift the box, it rolls in and the chest takes it
        'van0': dict(host='world', parts=['van0'], follow=('chest', 0.84, 0.88), steps=[
            move((0.0, -VAN_BACK, 0.10), (0.08, 0.22)),
            move((0.0, 0.0, VAN_FLOOR_UP - 0.10), (0.46, 0.60)),
            move((0.0, VAN_IN, 0.0), (0.70, 0.86))]),
        'van1': dict(host='@van0', parts=['van1'], steps=[move((0.0, NEST, 0.0), (0.36, 0.46))]),
        'van2': dict(host='@van1', parts=['van2'], steps=[move((0.0, NEST, 0.0), (0.32, 0.42))]),
        'van3': dict(host='@van2', parts=['van3'], steps=[move((0.0, NEST, 0.0), (0.28, 0.38))]),
        'van4': dict(host='@van3', parts=['van4'], steps=[move((0.0, NEST, 0.0), (0.24, 0.34))]),
    }
    return S


def carriers():
    """Outrigger jacks: two on the van's front corner posts, two on the rear section's."""
    from .carrier import Jack
    from .trailer import section_dims
    hw0, zb0, zt0, s00, s01 = section_dims(0)
    hw4, zb4, zt4, s40, s41 = section_dims(D.VAN_SECTIONS - 1)
    from .carrier import Strut
    return [(Jack('jackF.L', 'van0', (hw0 + 0.10, D.f(s00 + 0.06), zt0 - 0.20), window=(0.06, 0.88)), True),
            (Jack('jackR.L', 'van4', (hw4 + 0.10, D.f(s41 - 0.10), zt4 - 0.20), window=(0.36, 0.88)), True),   # down before the bogie retracts
            # rams that carry the travelling panels (anchors bone-local, attach points on the part in the truck)
            (Strut('clipArm.L', 'chest', (0.55, 0.40, 0.30), 'clip', (0.55, D.f(1.70), 1.30), r=0.07), True),
            (Strut('pylonArm.L', 'clav.L', (0.95, 0.0, 0.26), 'pylon.L', (0.60, D.f(4.20), 2.90), r=0.07), True),
            (Strut('doorArm.L', 'forearm.L', (0.30, 0.0, -0.60), 'door.L', (1.10, D.f(2.90), 1.30), r=0.05,
                   window=(0.08, 0.52), engage=0.05), True),
            (Strut('thighArm.L', 'thigh.L', (0.38, 0.0, -0.90), 'thighPlate.L', (1.10, D.f(3.85), 1.40), r=0.06,
                   window=(0.12, 0.44), engage=0.05), True),
            (Strut('rearArm.L', 'chest', (0.60, -0.62, 0.40), 'rearwall.L', (0.60, D.f(4.90), 1.70), r=0.06,
                   window=(0.03, 0.26), engage=0.03), True)]
