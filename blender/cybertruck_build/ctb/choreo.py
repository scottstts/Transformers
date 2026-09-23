"""Transformation program: which car parts move together, what carries them,
and the mechanism steps that take them from the truck to the robot.

Hosts: a bone name, or '@assembly' for a sub-mechanism riding on another
assembly (its steps are then expressed in the vehicle frame, because the host
assembly's frame IS the vehicle frame at the fold).

Side-specific entries are authored for L (+x) and mirrored for R.
T: 0 = truck, 1 = robot. Reverse transformation runs the same path backward.
"""
import math
from mathutils import Vector
from .mech import move, pop, rot, fit, seat
from . import car_body as B
from .robot_torso import TG_HINGE, TG_HUB
from .fold import LEG_SLOPE

BELT_F = B.belt(0.62)


def glass_drop(f_mid):
    """Drop that sinks the tallest end of the glass (the B-pillar end) below the belt."""
    f = B.B_SEAM
    dz = B.ztop(f) - B.belt(f)
    length = math.hypot(B.XS - B.xtop(f), dz)
    return length * (1.0 - 0.07 - 0.028 / dz) + 0.028 + 0.010   # glass height + seal + clearance


def roll_down(f_mid, t_tilt, t_in, t_drop, df=0.0, extra=0.0):
    """Window roll-down (vehicle frame): tilt the tumblehome glass to vertical about
    its lower outer edge, step into the door's glass slot, drop into the door."""
    zb = B.belt(f_mid) + 0.028
    xb = B.XS - 0.028 / (B.ztop(f_mid) - B.belt(f_mid)) * (B.XS - B.xtop(f_mid))
    lean = math.degrees(math.atan2(B.XS - B.xtop(f_mid), B.ztop(f_mid) - B.belt(f_mid)))
    slot_mid = 0.5 * (0.902 + 0.970) + 0.006   # glass outer face; +-2 deg twist stays inside the slot
    # the glass is boxed in by a vertical seam to the crease trim above (inboard) and a horizontal
    # seam to the seal below: its only free first move is out along the facet normal (outward and
    # up). Then tilt upright about the lower edge, slide in over the seal into the slot, drop.
    nx, nz = math.cos(math.radians(lean)), math.sin(math.radians(lean))     # outward normal (x, z)
    step = 0.03             # clears the neighbouring skins (28 mm) and trims before the tilt
    px, pz = xb + nx * step, zb + nz * step
    t0, t1 = t_in
    return [
        # (df: back off the pillar-side sail skin the glass edge runs along; restored as it drops)
        move((nx * step, df, nz * step), (t0, t0 + (t1 - t0) * 0.5)),
        rot('f', -lean, (px, f_mid, pz), t_tilt),
        # restore df while still outboard and upright, slide in over the slot, then drop into it
        move((0.0, -df, 0.0), (t_tilt[1] - 0.005, t_tilt[1] + 0.01)),
        move((slot_mid - px, 0.0, 0.0), (t_tilt[1] + 0.005, t_tilt[1] + 0.025)),
        move((0.0, 0.0, -(glass_drop(f_mid) + extra - (zb - pz))), (max(t_drop[0], t_tilt[1] + 0.025), t_drop[1])),
    ]
VAULT_SEAM = B.TAIL + 0.04 + 4 * (B.VAULT - B.TAIL - 0.04) / 8     # seam between the tonneau halves
VAULT_A = ['vault%d.%s' % (i, S) for S in 'LR' for i in range(4)]
VAULT_B = ['vault%d.%s' % (i, S) for S in 'LR' for i in range(4, 8)]
DECK_SLOPE = math.degrees(math.atan2(B.Z_APEX - B.Z_TAIL, B.APEX - B.TAIL))
POD_X = 0.385             # pod's inboard face in robot mode (clear of the forearm's roof crease)
VAULT_BACK = 0.406        # folded tonneau back face on the chest (chest front at 0.40)
DECK_F_SQUARE = math.degrees(math.atan2(B.Z_APEX - B.Z_NOSE, B.NOSE - B.APEX)) - LEG_SLOPE   # hood / windshield to the leg
VAULT_TOP = 1.08          # folded tonneau top: under the tailgate swing arm and its hub
POD_HUB_Z = -0.54         # rear-pod turntable hub on the slide carriage (upper-arm z)
POD_X_FRONT = 0.375       # front pod inboard face in robot mode: outboard of the thigh door (0.366)
POD_TOP = 0.23            # front pod top above the knee: its liner stays below the knee, the fender's rear
                          # edge rises outboard of the door, and the pod clears the sole line by 10 cm
HOOD_TOP = 0.085          # hood top above the knee axis: under the windshield's lower edge, clear of the instep
DOOR_LANE = 0.20          # door's outer lane: its cassette clears the front flare
RB_FACE = -0.5185         # rear bumper inner face on the back module's ribs (chest f)
RB_TOP = 1.20             # ... and its top edge on the back (chest z)


def sided():
    """name -> dict(host, parts, steps) for the L side.
    Limb armour is the car's own cross-section slice at that station, compacted
    onto the limb core; `fit` datums state where each slice lands (host frame).
    Every transit is carried: panels ride their limb's lifters (linkage), slide
    on its pads, hinge on a parent, or ride a carriage -- none sails free.

    Phases: 0.00-0.30 unlock in the truck (fold held); 0.30-0.90 the robot rises
    about its planted feet; limb armour docks while its joints stay shallow."""
    A = {}
    # ---------------------------------------------------------------- thigh: door + windshield
    A['door'] = dict(host='thigh', parts=['door', 'sealF', 'rockerF', 'doorIn'], steps=[
        # out on the lifters past the rear door's skin and the front flare, parked low in that outer lane
        # (the fists thread out over its belt edge) ...
        move((DOOR_LANE, -0.10, 0.0), (0.24, 0.30)),
        fit({'f+': 0.285, 'z+': -0.03}, (0.60, 0.64)),
        # ... and draw in onto the pads once the arms have swung off the flank
        seat((-1, 0, 0), 0.0008, None, (0.64, 0.69)),
    ])
    # the window rolls down into the door: step in, tilt upright about its lower edge, slide into the slot, drop
    A['winF'] = dict(host='@door', parts=['winF'], steps=roll_down(0.62, (0.12, 0.15), (0.10, 0.12), (0.17, 0.20), -0.018))   # after the B-pillar has dropped
    # the mirror folds down flat against the door skin about its arm root
    A['mirror'] = dict(host='@door', parts=['mirror'], steps=[
        rot('f', -117, (B.XS - 0.012, 1.01, B.belt(1.01) - 0.02), (0.01, 0.03)),
    ])
    # the black cowl strip stays with the windshield: it becomes the thigh plate's lower trim
    A['windshield'] = dict(host='thigh', parts=['windshield', 'creaseF', 'cowl'], steps=[
        # squares up to the thigh and settles onto its lifters, then slides up the thigh
        fit({'z+': -0.01}, (0.58, 0.64)),
        # (after the door has drawn in: the A-pillar trim leg settles outboard of it)
        rot('x', -DECK_F_SQUARE, ['c', 0, 0, -0.55], (0.69, 0.75)),
        fit({'x-': -0.215}, (0.69, 0.75)),
        seat((0, -1, 0), 0.0008, None, (0.69, 0.75)),
    ])
    # ---------------------------------------------------------------- lower leg: the front corner
    A['hood'] = dict(host='shin', parts=['hood'], steps=[
        # squares up to the shin onto its lifters, slides up clear of the foot's swing ...
        # (lifts clear of the cowl and the nose strip first: both are skins on the same deck)
        move((0.0, 0.03, 0.0), (0.10, 0.12)),
        rot('x', -DECK_F_SQUARE, 'c', (0.12, 0.17)),
        fit({'z+': -0.02}, (0.17, 0.23)),
        seat((0, -1, 0), 0.0008, None, (0.23, 0.27)),
        # ... and past the knee once it has flexed away from the windshield
        fit({'z+': HOOD_TOP}, (0.76, 0.81)),
    ])
    # the whole front corner (fascia corner, bumper corner, fender, arch, wheel) rides the calf
    A['pod'] = dict(host='shin', parts=['fender', 'flareF', 'linerF', 'marker', 'wheelF', 'noseO', 'lightbarO', 'fbumperO'], steps=[
        # a step out on the lifters frees the fender from the crease and cowl seams (they run along the
        # tumblehome); up the calf once the door has slid up the thigh
        move((0.055, 0.0, 0.0), (0.06, 0.10)),
        # out on its lifters to ride outboard of the thigh door, then up the calf once the hood is home
        fit({'x-': POD_X_FRONT}, (0.76, 0.81)),
        fit({'z+': POD_TOP}, (0.81, 0.87)),
    ])
    A['toecap'] = dict(host='foot', parts=['nose', 'lightbar', 'fbumper'], steps=[])
    # ---------------------------------------------------------------- upper arm: rear quarter pod
    # the rear corner rides its carriage (lifter) out, turns 90 deg on the carriage's hub into a pauldron
    # (sail up, arch down, wheel outboard) and slides up the carriage face to the shoulder
    A['rpod'] = dict(host='upperarm', parts=['quarter', 'flareR', 'linerR', 'rail', 'wheelR', 'rockerQ'], steps=[
        fit({'x-': POD_X}, (0.11, 0.20)),          # once the rear glass is down in its door
        rot('x', -90, (POD_X, 0.0, POD_HUB_Z), (0.40, 0.50)),
        fit({'z+': 0.25, 'fc': 0.0}, (0.50, 0.58)),
    ])
    # ---------------------------------------------------------------- forearm: cab-rear slice
    A['rdoor'] = dict(host='forearm', parts=['rdoor', 'sealR', 'rockerR', 'rdoorIn'], steps=[
        fit({'f+': 0.205, 'z+': -0.10}, (0.40, 0.50)),
        seat((-1, 0, 0), 0.0008, None, (0.50, 0.54)),
    ])
    A['winR'] = dict(host='@rdoor', parts=['winR', 'pillar'], steps=roll_down(-0.45, (0.04, 0.07), (0.02, 0.04), (0.09, 0.10)))
    A['roof'] = dict(host='forearm', parts=['roofglass', 'creaseR'], steps=[
        # the roof falls DECK_SLOPE toward the tail: square it to the forearm as it settles
        rot('x', DECK_SLOPE, 'c', (0.10, 0.18)),
        seat((0, -1, 0), 0.0008, None, (0.10, 0.18)),
        fit({'xc': 0.0, 'z+': -0.10}, (0.18, 0.26)),
        seat((0, -1, 0), 0.0008, None, (0.26, 0.30)),
    ])
    return A


def singles():
    hf, hz = TG_HINGE
    uf, uz = TG_HUB
    return {
        # tonneau cover as a tri-fold: the cab-end half flips back over the tail-end half (hinge on the
        # top face at the half seam, 3 mm above it so the two top faces stay apart) ...
        'vaultB': dict(host='@vaultA', parts=VAULT_B, steps=[
            rot('x', -180, (0.0, VAULT_SEAM, B.ztop(VAULT_SEAM) + 0.0015), (0.04, 0.14)),
        ]),
        # ... then the folded pair squares up to the chest front on the chest lifters (the deck
        # slopes DECK_SLOPE to the tail) and slides down under the tailgate arm's reach
        'vaultA': dict(host='chest', parts=VAULT_A, steps=[
            rot('x', DECK_SLOPE, 'c', (0.60, 0.68)),
            fit({'f-': VAULT_BACK, 'z+': VAULT_TOP}, (0.60, 0.68)),
        ]),
        # tailgate on its swing arm: turn half a turn on the hub (light bar to the top), then the arm
        # swings 90 deg over the chest's front edge and lays it on the folded tonneau
        'tgarm': dict(host='chest', parts=['tgarm'], steps=[
            rot('x', 90, (0.0, hf, hz), (0.70, 0.80)),
        ]),
        'tailgate': dict(host='chest', parts=['tailgate', 'lightband', 'taillight', 'tailcap'], steps=[
            rot('z', 180, (0.0, uf, uz), (0.60, 0.70)),
            rot('x', 90, (0.0, hf, hz), (0.70, 0.80)),
        ]),
        # rear bumper: onto the chest's top, slide back over its edge, down its back
        'rbumper': dict(host='chest', parts=['rbumper.L', 'rbumper.R'], steps=[
            seat((0, 0, -1), 0.0015, None, (0.42, 0.45)),
            fit({'f+': RB_FACE + 0.03}, (0.45, 0.51)),
            # round the back module's top edge while the post still bears, then down the back
            move((0.0, -0.03, -0.10), (0.51, 0.54)),
            fit({'z+': RB_TOP}, (0.54, 0.60)),
        ]),
        'wiper': dict(host='@windshield.R', parts=['wiper'], steps=[
            # park along the right windshield half's outer edge
            rot(Vector((0, -0.27, 1)).normalized(), 76.7, (-0.62, B.A_BASE + B.COWL / 2, B.ztop(B.A_BASE + B.COWL / 2)), (0.01, 0.03)),
        ]),
    }
