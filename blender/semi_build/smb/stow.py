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
