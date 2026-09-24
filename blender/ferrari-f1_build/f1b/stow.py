"""Stowing the robot's own armour for car mode.

The robot is designed first; its armour then has to disappear inside the car.
A stow program moves a robot part in its bone's frame from the robot pose
(identity) into its stowed pose, as ordinary mechanism steps authored in the
robot -> car direction: the first step listed is the first to run when the
robot folds up. Windows are given in the transformation's own time T
(0 = car, 1 = robot); the stow displacement at T is the program run to
tau = 1 - T, so at T = 1 every part is exactly where the robot design put it.

Specs are authored for the L side (object names ending .L) and mirrored.
"""
import bpy
from mathutils import Matrix, Vector
from . import mech
from .mech import move, rot, fit

# object base name -> [step specs] (bone-local coordinates, windows in T)
SPECS = {
    # pauldron: rolls back 90 deg about the shoulder axis (its depth lies along the car), then
    # slides in and down the arm into the widest part of the sidepod
    'A.pauldron': [rot('x', 90.0, (0.50, 0.0, 0.0), (0.20, 0.32)), move((-0.24, -0.08, -0.24), (0.14, 0.24))],
    # the helmet sinks onto the neck (telescoping collar) so the horns stay inside the cover
    'R.head.helmet': [move((0.0, -0.030, -0.070), (0.86, 0.97))],
    # pecs and the yoke plate slide back over the chest core
    'A.pec': [move((-0.03, -0.15, 0.0), (0.30, 0.42))],
    'A.yoke': [move((0.0, -0.10, -0.04), (0.32, 0.44))],
    # gauntlet turns its fin up over the forearm
    'A.gauntlet': [rot('z', 180.0, (0.0, 0.0, 0.0), (0.40, 0.54)), move((-0.05, 0.03, 0.0), (0.34, 0.42))],
    # calf shell rides up the shin into the survival cell
    'A.calf': [move((-0.04, -0.07, 0.40), (0.24, 0.38))],
    'A.kneecap': [move((0.0, -0.11, 0.0), (0.30, 0.40))],
    # the sole platform: side flaps fold over onto it like a book (stacked), then it rises and slides
    # back into the nose
    'A.sole': [move((0.0, -0.44, 0.10), (0.64, 0.74))],
    'A.flapOut': [rot('f', 180.0, (0.085, 0.30, -0.215), (0.74, 0.84)), move((0.0, -0.44, 0.10), (0.64, 0.74))],
    'A.flapIn': [rot('f', -180.0, (-0.085, 0.30, -0.170), (0.74, 0.84)), move((0.0, -0.44, 0.10), (0.64, 0.74))],
    # the robot's feet fold flat into the nose: the sole plate rises round the ankle
    'R.foot.body': [move((0.0, 0.0, 0.075), (0.62, 0.72))],
    'R.toe.cap': [move((0.0, -0.04, 0.10), (0.62, 0.72))],
}


def _tau(spec):
    kind, at, ease, vec, axis, deg, pivot = spec
    a, b = at
    return (kind, (1.0 - b, 1.0 - a), ease, vec, axis, deg, pivot)


def specs_for(name):
    if name[-2:] in ('.L', '.R'):
        base, side = name[:-2], name[-1]
    elif '.L.' in name or '.R.' in name:
        side = 'L' if '.L.' in name else 'R'
        base = name.replace('.L.', '.').replace('.R.', '.')
    else:
        base, side = name, None
    lst = SPECS.get(base)
    if not lst:
        return None
    if side == 'R':
        lst = [mech.mirror_spec(s) for s in lst]
    return [_tau(s) for s in lst]


class Stow:
    def __init__(self, obj, specs):
        pts = [v.co.copy() for v in obj.data.vertices]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        c0 = (lo + hi) / 2
        from .assemble import xfz_bounds
        self.steps = mech.build_steps(specs, lambda D: D @ c0, lambda D: xfz_bounds(D, pts))

    def matrix(self, T):
        return mech.displacement(self.steps, 1.0 - T)


def build(structure):
    """{object: Stow} for every structure object with a stow program."""
    out = {}
    for bone, objs in structure.items():
        for o in objs:
            sp = specs_for(o.name)
            if sp:
                out[o] = Stow(o, sp)
    return out
