"""Transformation program: which car parts move together, what carries them,
and the mechanism steps that take them from the car to the robot.

Map first, hide only when it won't map:
  canopy roof, rear sides, liner      -> the cape: the torso's back shell in both modes
  windshield, spine, visor            -> fold back over the roof: a raised collar on the cape
  canopy front sides (big windows)    -> the bat wings over the shoulders
  cheeks, headlamps                   -> the pectoral plates of the chest chevron, flipped over the head
  beak ramp                           -> the chevron's keel; the nose box slides into the chest's slot
  front arms, hubs, front wheels      -> the shoulder wheels (drawn up, then swung onto the shoulders)
  flank fronts, shelf, bronze panel   -> the shin guards
  rear quarters, intakes              -> the thigh plates
  nozzle pod, deck, roll hoop         -> the jet pack on the back, nozzle down
  rear corners: outer tyre, fender,
    skirt, lamp rail, spoiler flaps   -> the calves (outer tyre outboard, flaps as fins)
  inner tyres, trailing arms          -> behind the calves

The wheel groups are world-hosted: they stay where the car left them (drawing up
off the ground once the feet carry the weight) until their arms hand them to
the bone that carries them in robot mode (`follow`).

Hosts: a bone name, '@assembly' (steps in the vehicle frame), or 'world'.
Side-specific entries are authored for L (+x) and mirrored for R. Dock targets
are host-frame points (x, f, z) and attitudes relative to the part's car
attitude. T: 0 = car, 1 = robot; the reverse runs the same path backward.
"""
import math
from mathutils import Matrix, Vector
from .mech import move, rot, dock, wmove
from . import dims as D

DRAW_UP = 0.24                     # the wheels draw up once the feet and fists take the weight
DRAW = (0.10, 0.22)


def _euler(xto, zto):
    """Dock attitude (x, f, z degrees) that maps the car's +x to `xto` and +z to `zto` (design vectors)."""
    from .kit import V
    X = V(*xto).normalized()
    Z = V(*zto).normalized()
    Y = Z.cross(X)
    M = Matrix((X, Y, Z)).transposed()
    e = M.to_euler('XYZ')
    return (math.degrees(e.x), -math.degrees(e.y), math.degrees(e.z))


def _stand():
    """Bone worlds of the stand (the robot at T = 1, before the lift, which is zero there)."""
    from . import motion, rig
    return motion.world(1.0, rig.Skeleton())[0]


def _world(bone, p):
    from .kit import V
    w = _stand()[bone] @ V(*p)
    return (w.x, -w.y, w.z)


def sided():
    A = {}
    # flank front -> shin guard: its outer face turns forward, the shelf inward, the front down the shin
    A['shinPlate'] = dict(host='shin', parts=['shelfF', 'flankF', 'louvre', 'flankFront'], steps=[
        dock(c=(-0.02, 0.50, -0.44), rot=_euler((0, 1, 0), (-1, 0, 0)), at=(0.18, 0.62))])
    A['thighPlate'] = dict(host='thigh', parts=['shelfR', 'flankR', 'hip', 'intake', 'flankRear'], steps=[
        dock(c=(0.57, 0.0, -0.50), rot=(90, 0, 0), at=(0.30, 0.66))])
    A['wing'] = dict(host='chest', parts=['csideF', 'glassS0'], steps=[
        move((-0.35, -0.06, 0.0), (0.40, 0.52)),
        dock(c=(0.72, -0.30, 1.62), rot=(-90, 24, 0), at=(0.52, 0.90))])
    # the canopy's rear sides fold in against the back on the roof-edge hinge
    A['scapula'] = dict(host='chest', parts=['csideR', 'glassS1', 'bpillar'], steps=[
        move((0.0, 0.0, 0.62), (0.50, 0.78)), rot('z', -20, pivot=(0.46, -0.44, 0.0), at=(0.70, 0.90))])
    # the chevron plates swing out ahead of the face, flip over and come back onto the chest
    # the front grilles swing out ahead of the face, then settle on the abdomen under the chevron
    A['grille'] = dict(host='chest', parts=['grille'], steps=[
        move((0.0, 0.55, 0.0), (0.30, 0.46)),
        dock(c=(0.30, 0.40, 0.12), rot=(0, 0, 0), at=(0.56, 0.82))])
    A['chev'] = dict(host='chest', parts=['cheek', 'headlamp'], steps=[
        move((0.0, 0.35, 0.0), (0.12, 0.26)),
        rot('x', 180, pivot=(0.0, 0.495, 1.15), at=(0.54, 0.74)),
        move((0.0, -0.35, 0.0), (0.74, 0.84))])
    hub = _world('clav.L', (1.10, -0.40, 0.70))
    # out to the side, up behind the rising shoulders, then in onto the shoulder's back
    A['frontWheel'] = dict(host='world', parts=['armCone', 'hub', 'wheelF', 'steer'], follow=('clav', 0.80, 0.90), steps=[
        wmove((0, 0, DRAW_UP), DRAW),
        wmove((hub[0] - D.FR_X + 0.35, 0.10, 0.35), (0.20, 0.36)),
        dock(c=(hub[0] + 0.40, hub[1] + 0.95, hub[2]), rot=(-60, 0, 0), anchor='wheelF.L', at=(0.36, 0.62)),
        dock(c=hub, rot=(-90, 0, 0), anchor='wheelF.L', at=(0.62, 0.86))])
    chub = _world('shin.L', (0.61, -0.04, -0.80))
    A['corner'] = dict(host='world', parts=['wheelRo', 'fenderO', 'fenderSkirt', 'lampRailO'], follow=('shin', 0.78, 0.90), steps=[
        wmove((0, 0, DRAW_UP), DRAW),
        wmove((0.45, -0.30, 0.10), (0.20, 0.32)),
        dock(c=chub, rot=(0, 0, 0), anchor='wheelRo.L', at=(0.32, 0.84))])
    # the spoiler flaps ride with the jet pack (their base beams lie against the pod's flanks):
    # stabiliser fins standing off the back
    A['flapStack'] = dict(host='@pod', parts=['flaps'], steps=[rot('f', 70, pivot=(0.42, D.f(3.90), 1.25), at=(0.60, 0.86))])
    A['innerWheel'] = dict(host='@corner', parts=['wheelRi', 'fenderI', 'lampRailI'], steps=[
        move((-0.04, -0.80, 0.10), (0.50, 0.82))])
    return A


def singles():
    return {
        'cape': dict(host='chest', parts=['roof'], steps=[]),
        # the rear deck slope hinges out at the roof's rear edge, clearing the hips
        'tail': dict(host='@cape', parts=['roofRear'], steps=[rot('x', 24, pivot=(0.0, D.f(2.98), 1.37), at=(0.58, 0.86))]),
        'collar': dict(host='@cape', parts=['visor', 'visorLamps', 'spine', 'glassF.L', 'glassF.R', 'bezelF.L', 'bezelF.R'], steps=[
            rot('x', -60, pivot=(0.0, D.f(1.88), 1.33), at=(0.24, 0.50))]),
        # the ramp and its nose box flip together (the ramp stays on the box), the box nesting in the chest's slot
        'keel': dict(host='chest', parts=['beakRamp', 'beakBox'], steps=[
            move((0.0, 0.35, 0.0), (0.10, 0.24)),
            rot('x', 180, pivot=(0.0, 0.545, 1.29), at=(0.52, 0.74)),
            move((0.0, -0.35, 0.0), (0.74, 0.86))]),
        # the pod lifts off the rear deck on its rails, then rides up the back
        'pod': dict(host='chest', parts=['pod', 'deck', 'hoop'], steps=[
            move((0.0, -1.20, 0.0), (0.28, 0.46)),
            dock(c=(0.0, -1.20, 0.30), rot=(-90, 0, 0), at=(0.46, 0.86))]),
    }


def carriers():
    """Telescoping struts that carry the travels: anchors bone-local, attach points on the part
    in the car (snapped onto its surface). The wheel arms stay engaged throughout: they are what
    holds the world-hosted wheels."""
    from .carrier import Strut
    return [
        (Strut('podRail.L', 'chest', (0.22, -0.24, -0.70), 'pod', (0.20, D.f(3.50), 0.50), r=0.035), True),
        (Strut('cornerArm.L', 'shin.L', (0.28, -0.04, -0.80), 'corner.L', (0.80, D.RA_F, D.RR_R), r=0.055, snap=False), True),
        (Strut('wheelArm.L', 'clav.L', (0.62, -0.15, 0.15), 'frontWheel.L', (0.96, D.f(0.90), 0.50), r=0.045, snap=False), True),
    ]
