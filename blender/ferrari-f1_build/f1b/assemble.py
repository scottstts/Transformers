"""Scene assembly: rig empties, robot structure, car assemblies on their hosts.

A car assembly is a group of car objects that move rigidly together. Its node's
local matrix (relative to its host) is
    M(T) = D(T) @ A0
where A0 = inverse(host world at the fold) for a bone host, or identity for an
assembly host, and D(T) is the mechanism displacement (identity at T = 0), so
every car part starts exactly in its vehicle position.
"""
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from . import kit, rig, fold, choreo, mech

CENTRE_BONES = ('pelvis', 'spine', 'chest', 'neck', 'head')


def program():
    """Expanded assemblies: name -> dict(host, parts, specs)."""
    out = {}
    singles = choreo.singles()
    for S, s in (('L', 1), ('R', -1)):
        for base, d in choreo.sided().items():
            host = d['host']
            if host.startswith('@'):
                host = host if host[1:] in singles else '@' + host[1:] + '.' + S
            else:
                host = host if host in CENTRE_BONES else host + '.' + S
            specs = d['steps'] if s > 0 else [mech.mirror_spec(sp) for sp in d['steps']]
            out[base + '.' + S] = dict(host=host, parts=[p + '.' + S for p in d['parts']], specs=specs)
    for name, d in choreo.singles().items():
        out[name] = dict(host=d['host'], parts=list(d['parts']), specs=list(d['steps']))
    return out


def xfz_bounds(D, pts):
    """Bounds of transformed points in (x, f, z) coordinates (f = -Y)."""
    q = [D @ p for p in pts]
    xs = [p.x for p in q]
    fs = [-p.y for p in q]
    zs = [p.z for p in q]
    return (min(xs), min(fs), min(zs)), (max(xs), max(fs), max(zs))


def ensure_empty(name, coll, size=0.08):
    o = bpy.data.objects.get(name)
    if o is None:
        o = bpy.data.objects.new(name, None)
        coll.objects.link(o)
        o.empty_display_type = 'PLAIN_AXES'
        o.empty_display_size = size
    return o


class Assembly:
    def __init__(self, name, host, parts, specs):
        self.name, self.host, self.parts, self.specs = name, host, parts, specs
        self.node = None
        self.A0 = Matrix.Identity(4)
        self.steps = []
        self.center0 = Vector()


class Scene:
    def __init__(self, root_coll):
        self.skel = rig.Skeleton()
        self.coll_rig = kit.collection('RIG', root_coll)
        self.bones = rig.sync_empties(self.skel, self.coll_rig)
        self.fold_world = fold.world(self.skel)
        self.asm = {}

    def attach_car(self):
        prog = program()
        # parents before children
        def depth(n):
            h = prog[n]['host']
            return 0 if not h.startswith('@') else 1 + depth(h[1:])
        order = sorted(prog, key=depth)
        for name in order:
            d = prog[name]
            a = Assembly(name, d['host'], d['parts'], d['specs'])
            a.node = ensure_empty('P.' + name, self.coll_rig, 0.15)
            if a.host.startswith('@'):
                a.node.parent = self.asm[a.host[1:]].node
                a.A0 = Matrix.Identity(4)
            else:
                a.node.parent = self.bones[a.host]
                a.A0 = self.fold_world[a.host].inverted()
            a.node.matrix_parent_inverse = Matrix.Identity(4)
            lo = Vector((1e9, 1e9, 1e9))
            hi = -lo
            pts = []
            a.parts = [on for on in a.parts if bpy.data.objects.get(on) is not None]    # e.g. an empty floor band
            for on in a.parts:
                o = bpy.data.objects[on]
                if o.get('bone_local'):
                    o.matrix_basis = self.fold_world[o['bone_local']].copy()     # robot-side mechanism part
                basis = o.matrix_basis.copy()
                o.parent = a.node
                o.matrix_parent_inverse = Matrix.Identity(4)
                o.matrix_basis = basis
                M = a.A0 @ basis
                for v in o.data.vertices:
                    p = M @ v.co
                    pts.append(p)
                    lo = Vector(map(min, lo, p))
                    hi = Vector(map(max, hi, p))
            a.center0 = (lo + hi) / 2
            a.points = pts
            tris = self._assembly_tris(a)
            a.steps = mech.build_steps(a.specs, lambda D, c=a.center0: D @ c, lambda D, P=pts: xfz_bounds(D, P),
                                       lambda D, d, c, against, a=a, T=tris: self._seat(a, T, D, d, c, against))
            self.asm[name] = a

    def _assembly_tris(self, a):
        verts, faces = [], []
        for on in a.parts:
            o = bpy.data.objects[on]
            M = a.A0 @ o.matrix_basis
            base = len(verts)
            verts += [M @ v.co for v in o.data.vertices]
            for p in o.data.polygons:
                vs = list(p.vertices)
                for k in range(1, len(vs) - 1):
                    faces.append((base + vs[0], base + vs[k], base + vs[k + 1]))
        return verts, faces

    def _target_bvh(self, host, against):
        """Structure of the target bones expressed in the host bone's rest frame."""
        bones = against or [host]
        W = self.skel.fk({})
        Hi = W[host].inverted()
        verts, faces = [], []
        for bn in bones:
            for o in self.structure.get(bn, []) + self.rest_linkage.get(bn, []):
                M = Hi @ W[bn]
                base = len(verts)
                verts += [M @ v.co for v in o.data.vertices]
                for p in o.data.polygons:
                    vs = list(p.vertices)
                    for k in range(1, len(vs) - 1):
                        faces.append((base + vs[0], base + vs[k], base + vs[k + 1]))
        return BVHTree.FromPolygons(verts, faces), verts, faces

    def _seat(self, a, tris, D, d, clearance, against):
        """Distance to slide along d until the assembly touches the target."""
        if a.host.startswith('@'):
            raise ValueError('seat needs a bone host: ' + a.name)
        tb, tv, tf = self._target_bvh(a.host, against)
        # approach from a retreat position so an assembly that starts inside its host still seats
        R = 1.5
        av = [D @ v - d * R for v in tris[0]]
        ab = BVHTree.FromPolygons(av, tris[1])
        best = 10.0
        for p in av[::max(1, len(av) // 3000)]:
            hit = tb.ray_cast(p, d, best + 1.0)
            if hit[0] is not None:
                best = min(best, hit[3])
        for p in tv[::max(1, len(tv) // 3000)]:
            hit = ab.ray_cast(p, -d, best + 1.0)
            if hit[0] is not None:
                best = min(best, hit[3])
        if best >= 10.0:
            raise ValueError('seat found no target for ' + a.name)
        return best - clearance - R

    def attach_linkage(self, lifters):
        """Lifters: [(lifter, side, bone, panel, stage objects)] authored bone-local at rest.
        Their rest pads are seat targets like the structure."""
        self.lifters = lifters
        self.rest_linkage = {}
        for L, S, bone, panel, objs in lifters:
            for o in objs:
                o.parent = self.bones[bone]
                o.matrix_parent_inverse = Matrix.Identity(4)
                o.matrix_basis = Matrix.Identity(4)
            self.rest_linkage.setdefault(bone, []).append(objs[-1])

    def attach_structure(self, parts):
        """parts: bone -> [objects authored in bone-local coordinates]."""
        from . import stow
        self.structure = parts
        self.stow = stow.build(parts)
        for bone, objs in parts.items():
            for o in objs:
                o.parent = self.bones[bone]
                o.matrix_parent_inverse = Matrix.Identity(4)

    def stand_world(self):
        from . import stand
        return self.skel.fk(stand.pose())

    def set_pose(self, W, T):
        """W: bone -> world matrix; T: mechanism time."""
        for n in self.skel.names:
            p = self.skel.parent[n]
            self.bones[n].matrix_basis = (W[p].inverted() @ W[n]) if p else W[n]
        for a in self.asm.values():
            a.node.matrix_basis = mech.displacement(a.steps, T) @ a.A0
