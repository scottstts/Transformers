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
    # the knee guard slides back over the knee drum while the knees splay in the car
    'R.shin.kneecap': [move((0.0, -0.26, 0.10), (0.06, 0.40))],
    # the forearm fins slide into the gauntlet in the car
    'R.forearm.blades': [move((-0.26, 0.0, 0.0), (0.30, 0.50))],
    # the pauldron slides in over the shoulder slide in the car
    'R.clav.pauldron': [move((-0.24, 0.0, 0.0), (0.20, 0.44))],
}

# telescoping sections: object base name -> the child joint whose slide it follows
FOLLOW = {
    'R.thigh.lower': 'shin',
    'R.shin.lower': 'foot',
    'R.upperarm.lower': 'forearm',
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


class Follow:
    """A telescoping section: rides its bone by the slide of the child joint it carries
    (the knee clevis follows the knee as the thigh telescopes)."""

    def __init__(self, skel, child):
        self.skel, self.child = skel, child
        self.steps = []

    def matrix(self, T):
        from . import motion
        _, P = motion.world(T, self.skel)
        return Matrix.Translation(P[self.child][1])


def build(structure, skel=None):
    """{object: Stow | Follow} for every structure object with a stow program or a
    telescoping follow."""
    out = {}
    for bone, objs in structure.items():
        for o in objs:
            side = 'L' if '.L.' in o.name else 'R' if '.R.' in o.name else None
            base = o.name.replace('.L.', '.').replace('.R.', '.')
            if side and base in FOLLOW and skel is not None:
                out[o] = Follow(skel, FOLLOW[base] + '.' + side)
                continue
            sp = specs_for(o.name)
            if sp:
                out[o] = Stow(o, sp)
    return out
