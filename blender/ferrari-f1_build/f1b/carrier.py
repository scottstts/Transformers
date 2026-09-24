"""Carriers: the visible hardware that holds a car assembly while it travels.

A carrier is a telescoping strut from an anchor on a robot bone (a clevis and
ball joint fixed to the bone) to an attach point on a car assembly (a ball
socket on the part). Every frame the strut spans the two points: its stages
slide over each other, so a hinge swing reads as a rigid arm and a slide reads
as a ram extending. Nothing a carrier holds is ever unsupported.

Anchors are bone-local design points (x, f, z) (the same frame as mechanism
pivots); attach points are vehicle-frame design points on the part in car mode.
Specs are authored for the L side (x >= 0) and mirrored when `sided`.
"""
import math
from mathutils import Matrix, Vector
from . import kit, rkit
from .kit import V
from .shape import lerp

ENGAGE = 0.05             # minimum overlap between telescoping stages


class Strut:
    def __init__(self, name, bone, anchor, target, attach, r=0.026, stages=None, length=None, ref=(1.0, 0.0, 0.0),
                 window=None, engage=0.05, snap=True):
        """window (t_in, t_out): the arm reaches out to the part over `engage` before t_in and
        retracts into its socket over `engage` after t_out (None: always engaged).
        snap: move the attach point onto the part's surface (nearest point, car mode)."""
        self.name, self.bone, self.target = name, bone, target
        self.anchor, self.attach = V(*anchor), V(*attach)
        self.r = r
        self.n, self.L = stages, length
        self.ref = V(*ref)
        self.window, self.engage, self.snap = window, engage, snap
        self.objs = []

    def reach(self, T):
        """0 = retracted in the socket, 1 = on the part."""
        if self.window is None:
            return 1.0
        a, b = self.window
        e = self.engage
        if T < a - e or T > b + e:
            return 0.0
        if T < a:
            u = (T - (a - e)) / e
        elif T > b:
            u = 1.0 - (T - b) / e
        else:
            return 1.0
        return u * u * (3 - 2 * u)

    def ends(self, W, N, T=None):
        A = W[self.bone] @ self.anchor
        B = N[self.target] @ self.attach
        k = 1.0 if T is None else self.reach(T)
        return A, A.lerp(B, k)

    def aim(self, W, N):
        """Strut direction: always toward the part (stable while retracted)."""
        d = N[self.target] @ self.attach - W[self.bone] @ self.anchor
        return d.normalized() if d.length > 1e-6 else Vector((0.0, 0.0, 1.0))

    def size(self, samples):
        """Stage count and length from the span range [(A, B)] over the transformation."""
        es = [(b - a).length for a, b in samples]
        lo, hi = min(es), max(es)
        if self.n and self.L:
            return
        for n in range(1, 5):
            L = max(lo, (hi + (n - 1) * ENGAGE) / n)
            if n == 4 or L <= lo + 0.02 or (hi - lo) < 0.02:
                break
        self.n = self.n or n
        self.L = self.L or max(0.06, (hi + (self.n - 1) * ENGAGE) / self.n)

    def radii(self):
        return [self.r * (1.0 - 0.24 * k) for k in range(self.n)]

    def build(self, coll):
        """Objects along local +z from their origin: base clevis, stages, end socket."""
        out = []
        b = kit.Builder()
        b.add_mesh(rkit.cylinder((0, 0, -0.5 * self.r), self.r * 1.9, self.r * 1.6, 'z', 20), 'graphite')
        b.add_mesh(rkit_sphere(self.r * 1.35), 'darkSteel')
        out.append(b.build('C.%s.base' % self.name, coll))
        for k, rr in enumerate(self.radii()):
            b = kit.Builder()
            b.add_mesh(rkit.cylinder((0, 0, self.L / 2), rr, self.L, 'z', 20), 'chrome' if k == self.n - 1 else 'darkSteel')
            if k < self.n - 1:
                b.add_mesh(rkit.cylinder((0, 0, self.L - 0.012), rr * 1.12, 0.024, 'z', 20), 'graphite')    # gland collar
            out.append(b.build('C.%s.s%d' % (self.name, k), coll))
        b = kit.Builder()
        b.add_mesh(rkit_sphere(self.r * 1.3), 'darkSteel')
        b.add_mesh(rkit.cylinder((0, 0, 0.5 * self.r), self.r * 1.7, self.r * 1.4, 'z', 20), 'graphite')
        out.append(b.build('C.%s.end' % self.name, coll))
        for o in out:
            kit.finish(o, 0.002, 2, 30)
        self.objs = out
        return out

    def pose(self, W, N, T=None):
        """{object: world matrix} spanning anchor -> attach."""
        A, B = self.ends(W, N, T)
        e = (B - A).length
        z = self.aim(W, N)
        x = W[self.bone].to_3x3() @ self.ref
        x = x - z * x.dot(z)
        if x.length < 1e-6:
            x = z.orthogonal()
        x.normalize()
        y = z.cross(x)
        R = Matrix((x, y, z)).transposed().to_4x4()
        out = {self.objs[0]: Matrix.Translation(A) @ R}
        for k in range(self.n):
            # Below one stage length the entire stack nests behind the base,
            # rather than spreading in opposite directions around the socket.
            delta = e-self.L
            nested = 0.5*(delta-math.sqrt(delta*delta+0.0001))
            s = nested + (delta-nested)*k/(self.n-1) if self.n>1 else min(0.0,delta)
            out[self.objs[1 + k]] = Matrix.Translation(A + z * s) @ R
        flip = Matrix.Rotation(math.pi, 4, 'X')
        out[self.objs[-1]] = Matrix.Translation(B) @ R @ flip
        return out


def rkit_sphere(r, seg=16, rings=10):
    verts = [V(0, 0, -r)]
    for i in range(1, rings):
        t = math.pi * i / rings - math.pi / 2
        verts += [Vector((r * math.cos(t) * math.cos(2 * math.pi * j / seg), r * math.cos(t) * math.sin(2 * math.pi * j / seg), r * math.sin(t)))
                  for j in range(seg)]
    verts.append(V(0, 0, r))
    faces = []
    for j in range(seg):
        faces.append([0, 1 + (j + 1) % seg, 1 + j])
    for i in range(rings - 2):
        for j in range(seg):
            a, b = 1 + i * seg + j, 1 + i * seg + (j + 1) % seg
            faces.append([a, b, b + seg, a + seg])
    top = len(verts) - 1
    base = 1 + (rings - 2) * seg
    for j in range(seg):
        faces.append([base + j, base + (j + 1) % seg, top])
    return verts, faces


def mirrored(s):
    m = Strut(s.name[:-2] + '.R' if s.name.endswith('.L') else s.name + '.R', s.bone.replace('.L', '.R'),
              (-s.anchor.x, -s.anchor.y, s.anchor.z), s.target.replace('.L', '.R'), (-s.attach.x, -s.attach.y, s.attach.z),
              s.r, s.n, s.L, (-s.ref.x, -s.ref.y, s.ref.z), s.window, s.engage, False)
    return m


def expand(specs):
    """[(Strut, sided)] -> [Strut] with R copies (anchor / attach are stored Blender-space)."""
    out = []
    for s, sided in specs:
        out.append(s)
        if sided:
            out.append(mirrored(s))
    return out


def snap_all(sc, struts):
    """Attach points onto the nearest surface of their target assembly (vehicle coordinates);
    mirrored struts take their L twin's snapped point."""
    import bpy
    from mathutils.bvhtree import BVHTree
    trees = {}
    for s in struts:
        if not s.snap:
            continue
        if s.target not in trees:
            vs, fs = [], []
            for on in sc.asm[s.target].parts:
                o = bpy.data.objects[on]
                b = len(vs)
                vs += [o.matrix_basis @ v.co for v in o.data.vertices]
                fs += [[b + i for i in p.vertices] for p in o.data.polygons]
            trees[s.target] = BVHTree.FromPolygons(vs, fs)
        hit = trees[s.target].find_nearest(s.attach)
        if hit[0] is not None:
            s.attach = hit[0].copy()
            if s.name.startswith('airArm.'):
                # Seat the end socket under the airbox skin, not on top of it.
                center = sum((Vector(v) for v in vs),Vector())/len(vs)
                inward = hit[1].copy()
                if inward.dot(center-s.attach)<0:
                    inward.negate()
                s.attach += inward*0.034
    by = {s.name: s for s in struts}
    for s in struts:
        if s.name.endswith('.R') and s.name[:-2] + '.L' in by:
            L = by[s.name[:-2] + '.L'].attach
            s.attach = Vector((-L.x, L.y, L.z))


def size_all(sc, struts, samples=81):
    from . import motion, bake
    snap_all(sc, struts)
    pairs = {s: [] for s in struts}
    for i in range(samples):
        T = i / (samples - 1)
        W, _ = motion.world(T, sc.skel)
        N = bake.node_worlds(sc, T, W)
        for s in struts:
            pairs[s].append(s.ends(W, N, T))
    for s in struts:
        s.size(pairs[s])


def pose(sc, objs, W, N, T=None):
    for s in getattr(sc, 'carriers', []):
        objs.update(s.pose(W, N, T))
