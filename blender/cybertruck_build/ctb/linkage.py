"""Lifters: the robot-side linkage that carries a car panel while it is away from
its limb.

A lifter is a mount pad on telescoping rods running in bores in the limb frame.
At rest (extension 0) the pad is the limb's ordinary mount pad -- the datum the
panel seats on in robot mode. While the panel moves, the lifter extends along
its axis until the pad touches the panel (ray cast against the posed panel),
so the panel is always visibly carried. Extension is a pure function of the
panel's pose at T, which keeps the bake, the audits and the game export in
lockstep.

Authoring is bone-local for the L side (x = lateral out, f = forward,
z = along the bone); the R side is mirrored.
"""
import math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from . import kit, rkit
from .kit import V

AXES = {'x': Vector((1, 0, 0)), 'f': Vector((0, -1, 0)), 'z': Vector((0, 0, 1))}
CONTACT = 0.0008          # pad-to-panel standoff when bearing
ENGAGE = 0.028            # minimum overlap between telescoping stages
HOOD_DATUM = 0.284        # hood seat on the shin: 4 mm over the front wheel-well liner's top


class Lifter:
    def __init__(self, name, bone, panel, top, axis, half, rods, stages=2, tube=0.16, r=0.016, thick=0.026, sided=True):
        """top: pad top-face centre (x, f, z) at rest; axis: 'x' | 'f' | 'z' (outward);
        half: pad half sizes along the two in-plane axes (u, v); rods: [(u, v)] offsets."""
        self.name, self.bone, self.panel = name, bone, panel
        self.top = Vector(top)
        self.axis = axis
        self.half, self.rods = half, rods
        self.stages, self.tube, self.r, self.thick = stages, tube, r, thick
        self.sided = sided

    @property
    def stroke(self):
        return self.stages * (self.tube - ENGAGE)

    def frame(self):
        """(origin, axis, u, v) in authoring coordinates (Blender vectors)."""
        a = AXES[self.axis]
        u, v = {'x': (AXES['f'], AXES['z']), 'f': (AXES['x'], AXES['z']), 'z': (AXES['x'], AXES['f'])}[self.axis]
        return V(*self.top), a, u, v

    def radii(self):
        """Outer radius of each moving stage (1 .. stages); the last is the solid rod."""
        return [self.r - 0.0055 * k for k in range(self.stages)]

    # ------------------------------------------------------------- geometry
    def meshes(self):
        """Stage meshes at rest, index 0 = outer tube .. last = pad + rods."""
        o, a, u, v = self.frame()
        base = o - a * self.thick                     # pad bottom = host-side datum
        M = Matrix.Identity(4)
        for c, vec in enumerate((u, v, a)):
            for r_ in range(3):
                M[r_][c] = vec[r_]
        M.translation = base
        rad = self.radii()
        out = []
        for k in range(self.stages):
            isl = []
            last = k == self.stages - 1
            for du, dv in self.rods:
                if last:
                    prof = [(0.0, -self.tube), (rad[k] - 0.002, -self.tube), (rad[k], -self.tube + 0.002), (rad[k], 0.002), (0.0, 0.002)]
                else:
                    ri = rad[k + 1] + 0.0012
                    prof = [(ri, -self.tube), (rad[k] - 0.002, -self.tube), (rad[k], -self.tube + 0.002),
                            (rad[k], -0.012), (rad[k] + 0.0035, -0.010), (rad[k] + 0.0035, -0.002), (rad[k] - 0.001, 0.0),
                            (ri, 0.0)]
                isl.append((kit.revolve(prof, 20, axis='Z', M=M @ Matrix.Translation((du, dv, 0))), 'chrome' if last else 'darkSteel'))
            if last:
                hu, hv = self.half
                pad = kit.chamfer_rect(2 * hu, 2 * hv, min(hu, hv) * 0.35)
                isl.append((kit.bevel_prism(pad, 0.0, self.thick, 0.004, 2, M=M), 'mech'))
            out.append(isl)
        return out

    def bores(self):
        """Host-frame cutters for the outer tubes (L side)."""
        o, a, u, v = self.frame()
        base = o - a * self.thick
        out = []
        r = self.radii()[0] + 0.005          # clears the outer tube's gland collar
        for du, dv in self.rods:
            c = base + u * du + v * dv - a * (self.tube / 2 + 0.002)
            ax = self.axis
            out.append(rkit.bore((c.x, -c.y, c.z), r, self.tube + 0.012, ax))
        return out

    def pocket(self, depth=0.05):
        """Cutter clearing the pad's footprint (+3 mm) down into a fairing (L side)."""
        o, a, u, v = self.frame()
        hu, hv = self.half
        base = o - a * (self.thick + depth)
        M = Matrix.Identity(4)
        for c, vec in enumerate((u, v, a)):
            for r_ in range(3):
                M[r_][c] = vec[r_]
        M.translation = base
        return kit.bevel_prism(kit.chamfer_rect(2 * hu + 0.006, 2 * hv + 0.006, min(hu, hv) * 0.35), 0.0, depth + self.thick + 0.01, 0.0, 1, M=M)

    def probes(self):
        """Pad top points that bear on the panel (authoring coordinates)."""
        o, a, u, v = self.frame()
        hu, hv = self.half
        # full footprint (corners, edge midpoints, centre): a pad bearing on a sloped face touches at an edge
        return [o + u * (su * hu) + v * (sv * hv) for su in (-1, 0, 1) for sv in (-1, 0, 1)]




# ----------------------------------------------------------------------- specs
# L side, bone-local. Pads sit on the datums the panels seat on in robot mode.

def specs():
    return [
        # thigh: door on its outer side (door inner face datum x = 0.246), rods clear the knee drum
        Lifter('doorlift.hip', 'thigh', 'door', (0.245, 0.0, -0.80), 'x', (0.13, 0.045), [(-0.075, 0.0), (0.075, 0.0)], 3, 0.232),
        Lifter('doorlift.knee', 'thigh', 'door', (0.245, 0.0, -1.08), 'x', (0.13, 0.045), [(-0.075, 0.0), (0.075, 0.0)], 3, 0.232),
        # thigh: windshield on its front
        Lifter('wslift.hip', 'thigh', 'windshield', (0.0, 0.30, -0.86), 'f', (0.11, 0.04), [(-0.07, 0.0), (0.07, 0.0)], 3, 0.22),
        Lifter('wslift.knee', 'thigh', 'windshield', (0.0, 0.30, -1.08), 'f', (0.11, 0.04), [(-0.07, 0.0), (0.07, 0.0)], 3, 0.22),
        # shin: hood on its front, front-corner pod on its outer side
        Lifter('hoodlift.knee', 'shin', 'hood', (0.0, HOOD_DATUM, -0.78), 'f', (0.11, 0.04), [(-0.07, 0.0), (0.07, 0.0)], 2, 0.19),
        Lifter('hoodlift.ankle', 'shin', 'hood', (0.0, HOOD_DATUM, -1.22), 'f', (0.11, 0.04), [(-0.07, 0.0), (0.07, 0.0)], 2, 0.19),
        Lifter('podlift.knee', 'shin', 'pod', (0.2145, 0.0, -0.45), 'x', (0.15, 0.04), [(-0.08, 0.0), (0.08, 0.0)], 2, 0.12, thick=0.012),
        Lifter('podlift.ankle', 'shin', 'pod', (0.2145, 0.0, -0.95), 'x', (0.15, 0.04), [(-0.08, 0.0), (0.08, 0.0)], 2, 0.12, thick=0.012),
        # forearm: rear door on its outer side
        # (short tubes: the forearm wall over the hand sleeve is 35 mm)
        Lifter('rdoorlift.elbow', 'forearm', 'rdoor', (0.185, 0.0, -0.30), 'x', (0.11, 0.035), [(-0.065, 0.0), (0.065, 0.0)], 1, 0.034, 0.012, thick=0.02),
        Lifter('rdoorlift.wrist', 'forearm', 'rdoor', (0.185, 0.0, -0.80), 'x', (0.11, 0.035), [(-0.065, 0.0), (0.065, 0.0)], 1, 0.034, 0.012, thick=0.02),
        # forearm: roof glass on the deck rail (bores stop 1 cm over the hand sleeve)
        Lifter('rooflift.elbow', 'forearm', 'roof', (-0.07, 0.325, -0.36), 'f', (0.055, 0.035), [(0.0, 0.0)], 2, 0.13, 0.017, 0.025),
        Lifter('rooflift.wrist', 'forearm', 'roof', (-0.07, 0.325, -0.88), 'f', (0.055, 0.035), [(0.0, 0.0)], 2, 0.13, 0.017, 0.025),
        # upper arm: the rear-corner pod's carriage; the pod turns on its centre (the hub) into the pauldron
        Lifter('podlift', 'upperarm', 'rpod', (0.1995, 0.0, -0.54), 'x', (0.13, 0.27), [(-0.085, -0.20), (0.085, -0.20), (-0.085, 0.20), (0.085, 0.20)],
               3, 0.18, 0.016, 0.028),
        # chest: folded tonneau on its front (pads rise out of pockets in the chest face)
        # chest: rear bumper rides a post off the back module's top while it slides over the edge
        Lifter('rblift', 'chest', 'rbumper', (0.0, -0.455, 1.15), 'z', (0.36, 0.05), [(-0.30, 0.0), (0.30, 0.0)], 1, 0.15, 0.018, 0.025, False),
        # (rods outboard of the head well, below the shoulder bays)
        Lifter('vaultlift.low', 'chest', 'vaultA', (0.0, 0.4055, 0.40), 'f', (0.42, 0.04), [(-0.36, 0.0), (0.36, 0.0)], 2, 0.16, 0.018, 0.02, False),
        Lifter('vaultlift.high', 'chest', 'vaultA', (0.0, 0.4055, 0.585), 'f', (0.42, 0.04), [(-0.36, 0.0), (0.36, 0.0)], 2, 0.16, 0.018, 0.02, False),
    ]


def sided_specs():
    """[(lifter, side, bone name, panel assembly name)]."""
    out = []
    for L in specs():
        if not L.sided:
            out.append((L, 'C', L.bone, L.panel))
            continue
        for S in ('L', 'R'):
            out.append((L, S, L.bone + '.' + S, L.panel + '.' + S))
    return out


def bores_for(bone):
    """L-side bore cutters for a limb frame."""
    cut = []
    for L in specs():
        if L.bone == bone:
            cut += L.bores()
    return cut


def pockets_for(bone, names):
    """Pad pockets for the named lifters (cut into fairings the pads sit in)."""
    return [L.pocket() for L in specs() if L.bone == bone and L.name in names]


def build(coll):
    """Stage objects: [(lifter, side, bone, panel, [stage objects])]."""
    out = []
    for L, S, bone, panel in sided_specs():
        objs = []
        for k, isl in enumerate(L.meshes()):
            b = kit.Builder()
            for m, slot in isl:
                if S == 'R':
                    m = kit.mirror_x(m)
                b.add_mesh(m, slot)
            o = b.build('%s.%d.%s' % (L.name, k, S), coll)
            kit.finish(o, 0.002, 2, 30)
            objs.append(o)
        out.append((L, S, bone, panel, objs))
    return out


def stage_offsets(L, e):
    """Travel of each stage for pad extension e (outer tube .. pad)."""
    n = L.stages
    return [e * (k + 1) / n for k in range(n)]


def local_axis(L, S):
    a = AXES[L.axis].copy()
    if S == 'R' and L.axis == 'x':
        a.x = -a.x
    return a


def probes(L, S):
    pts = L.probes()
    if S == 'R':
        pts = [Vector((-p.x, p.y, p.z)) for p in pts]
    return pts


def extend(L, S, W_bone, tree):
    """Pad extension for side S against a world-space panel BVH."""
    R = W_bone.to_3x3()
    a = (R @ local_axis(L, S)).normalized()
    best = None
    for p in probes(L, S):
        q = W_bone @ p
        hit = tree.ray_cast(q - a * 0.002, a, L.stroke + 0.2)
        if hit[0] is not None:
            d = hit[3] - 0.002
            best = d if best is None else min(best, d)
    if best is None:
        return 0.0
    return max(0.0, min(L.stroke, best - CONTACT))


def panel_tree(objs_world, parts):
    """World BVH of a panel assembly's parts from {object: world matrix}."""
    from . import sweep
    vs, ts, off = [], [], 0
    for o in parts:
        v, t = sweep.local_tris(o)
        if not len(v):
            continue
        M = objs_world[o]
        Rm = np.array(M.to_3x3())
        vs.append(v @ Rm.T + np.array(M.translation))
        ts.append(t + off)
        off += len(v)
    if not vs:
        return None
    return BVHTree.FromPolygons(np.concatenate(vs).tolist(), np.concatenate(ts).tolist(), epsilon=0.0)


def pose(sc, objs, W):
    """Adds lifter stage objects to objs (pre-lift world matrices); returns
    {(name, side): extension}."""
    import bpy
    ext = {}
    trees = {}
    for L, S, bone, panel, stage_objs in sc.lifters:
        a = sc.asm.get(panel)
        e = 0.0
        if a is not None:
            if panel not in trees:
                trees[panel] = panel_tree(objs, [bpy.data.objects[n] for n in a.parts])
            if trees[panel] is not None:
                e = extend(L, S, W[bone], trees[panel])
        ext[(L.name, S)] = e
        ax = local_axis(L, S)
        for o, off in zip(stage_objs, stage_offsets(L, e)):
            objs[o] = W[bone] @ Matrix.Translation(ax * off)
    return ext
