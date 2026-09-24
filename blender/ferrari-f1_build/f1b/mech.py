"""Mechanism steps: rigid slides and hinges in a host frame.

An assembly's displacement is D(T) = S_n(T) @ ... @ S_1(T) (host frame), each
step progressing over its own time window. Because later steps premultiply,
the steps form a physical serial chain: the last step is the joint nearest the
host, the first the joint nearest the part. A step's pivot is expressed in the
host frame as it stands when the step runs.

Coordinates are (x, f, z): x lateral (+ = robot left), f forward, z up.
Axes: 'x' pitch (+ tips the top forward), 'f' roll, 'z' yaw.
"""
import math
from mathutils import Vector, Matrix
from .kit import V


def smooth(u):
    return u * u * u * (u * (u * 6 - 15) + 10)


def lock(u):
    """Travel, a touch of overshoot, then settle: a latch seating."""
    e = smooth(u)
    k = min(1.0, max(0.0, (u - 0.6) / 0.4))
    return e + math.sin(math.pi * k) * 0.035 * (1 - u * 0.4)


EASE = {'smooth': smooth, 'lock': lock, 'linear': lambda u: u}

AXES = {'x': Vector((1, 0, 0)), 'f': Vector((0, -1, 0)), 'z': Vector((0, 0, 1))}


class Step:
    def __init__(self, kind, at, ease='smooth', vec=None, axis=None, deg=0.0, pivot=None):
        self.kind = kind          # 'move' | 'rot' | 'pop'
        self.at = at
        self.ease = EASE[ease]
        self.vec = vec            # Blender-space vector (move / pop)
        self.axis = axis          # Blender-space unit vector
        self.deg = deg
        self.pivot = pivot        # Blender-space point, or 'c' (resolved later)

    def u(self, T):
        a, b = self.at
        return min(1.0, max(0.0, (T - a) / (b - a)))

    def matrix(self, T):
        u = self.u(T)
        if u <= 0.0:
            return Matrix.Identity(4)
        if self.kind == 'pop':
            k = math.sin(math.pi * u)
            return Matrix.Translation(self.vec * k)
        e = self.ease(u) if u < 1.0 else 1.0
        if self.kind == 'move':
            return Matrix.Translation(self.vec * e)
        p = self.pivot
        return Matrix.Translation(p) @ Matrix.Rotation(math.radians(self.deg * e), 4, self.axis) @ Matrix.Translation(-p)


def move(df_xfz, at=(0, 1), ease='smooth'):
    x, f, z = df_xfz
    return ('move', at, ease, V(x, f, z), None, 0.0, None)


def pop(df_xfz, at=(0, 1)):
    x, f, z = df_xfz
    return ('pop', at, 'linear', V(x, f, z), None, 0.0, None)


def rot(axis, deg, pivot='c', at=(0, 1), ease='smooth'):
    return ('rot', at, ease, None, axis, deg, pivot)


def fit(targets, at=(0, 1), ease='smooth'):
    """Solved slide: after the preceding steps, move the assembly so that its
    bounding-box faces land on targets, e.g. {'x+': 0.30, 'f+': 0.28, 'z-': -1.2}
    (host frame, x/f/z coordinates). Axes without a target do not move."""
    return ('fit', at, ease, dict(targets), None, 0.0, None)


def seat(direction, clearance=0.001, against=None, at=(0, 1), ease='smooth'):
    """Solved slide along `direction` (x, f, z) until the assembly rests on the
    target geometry (default: the host bone's structure) with `clearance`."""
    return ('seat', at, ease, dict(dir=direction, clearance=clearance, against=against), None, 0.0, None)


def mirror_spec(spec):
    """Mirror an L-side step spec to the R side (x -> -x).
    Pivots: 'c' (current centre), ['c', dx, df, dz] (offset centre), (x, f, z) (point)."""
    kind, at, ease, vec, axis, deg, pivot = spec
    if kind == 'seat':
        d = dict(vec)
        d['dir'] = (-vec['dir'][0], vec['dir'][1], vec['dir'][2])
        if vec['against']:
            d['against'] = [a.replace('.L', '.R') for a in vec['against']]
        return (kind, at, ease, d, axis, deg, pivot)
    if kind == 'fit':
        t = {}
        for k, v in vec.items():
            if k[0] == 'x':
                t['x' + {'+': '-', '-': '+', 'c': 'c'}[k[1]]] = -v
            else:
                t[k] = v
        return (kind, at, ease, t, axis, deg, pivot)
    if vec is not None:
        vec = Vector((-vec.x, vec.y, vec.z))
    if isinstance(axis, Vector):
        axis = Vector((-axis.x, axis.y, axis.z))
        deg = -deg
    elif axis is not None and axis != 'x':
        deg = -deg
    if isinstance(pivot, tuple):
        pivot = (-pivot[0], pivot[1], pivot[2])
    elif isinstance(pivot, list):
        pivot = ['c', -pivot[1], pivot[2], pivot[3]]
    return (kind, at, ease, vec, axis, deg, pivot)


def build_steps(specs, center_fn, bounds_fn=None, seat_fn=None):
    """Resolve specs into Steps. center_fn(D) -> current assembly centre (Blender
    space, host frame) after displacement D, used for pivot 'c' / ['c', dx, df, dz].
    bounds_fn(D) -> (lo, hi) in (x, f, z) coordinates, used by 'fit'."""
    steps = []
    D = Matrix.Identity(4)
    for kind, at, ease, vec, axis, deg, pivot in specs:
        if kind == 'seat':
            d = V(*vec['dir']).normalized()
            kind, vec = 'move', d * seat_fn(D, d, vec['clearance'], vec['against'])
        if kind == 'fit':
            lo, hi = bounds_fn(D)
            d = [0.0, 0.0, 0.0]
            for key, target in vec.items():
                i = 'xfz'.index(key[0])
                cur = hi[i] if key[1] == '+' else lo[i] if key[1] == '-' else (lo[i] + hi[i]) / 2
                d[i] = target - cur
            kind, vec = 'move', V(*d)
        ax = AXES[axis] if isinstance(axis, str) else axis
        pv = None
        if kind == 'rot':
            if pivot == 'c':
                pv = center_fn(D)
            elif isinstance(pivot, list) and pivot and pivot[0] == 'c':
                pv = center_fn(D) + V(*pivot[1:])
            else:
                pv = V(*pivot)
        st = Step(kind, at, ease, vec, ax, deg, pv)
        steps.append(st)
        D = st.matrix(1e9) @ D
    return steps


def displacement(steps, T):
    D = Matrix.Identity(4)
    for st in steps:
        D = st.matrix(T) @ D
    return D
