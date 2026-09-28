"""Scene assembly: rig empties, robot structure, car assemblies on their hosts.

A car assembly is a group of car objects that move rigidly together. Its node's
local matrix (relative to its host) is
    M(T) = D(T) @ A0
where A0 = inverse(host world at the fold) for a bone host, or identity for an
assembly host ('@name') or the world ('world'), and D(T) is the mechanism
displacement (identity at T = 0), so every car part starts exactly in its
vehicle position.

A world-hosted assembly moves on its own mechanisms while it is not carried by
the robot; `follow = (bone, t0, t1)` then hands it to a bone: over [t0, t1] its
world pose blends onto the bone's (at the offset it has from that bone in the
stand), after t1 the bone carries it.
"""
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from . import kit, rig, choreo, mech

CENTRE_BONES = ('pelvis', 'spine', 'chest', 'neck', 'head')


def program():
    """Expanded assemblies: name -> dict(host, parts, specs, follow)."""
    out = {}
    singles = choreo.singles()
    for S, s in (('L', 1), ('R', -1)):
        for base, d in choreo.sided().items():
            host = d['host']
            if host.startswith('@'):
                host = host if host[1:] in singles else '@' + host[1:] + '.' + S
            elif host != 'world':
                host = host if host in CENTRE_BONES else host + '.' + S
            specs = d['steps'] if s > 0 else [mech.mirror_spec(sp) for sp in d['steps']]
            fo = d.get('follow')
            if fo is not None:
                fo = (fo[0] if fo[0] in CENTRE_BONES else fo[0] + '.' + S,) + tuple(fo[1:])
            out[base + '.' + S] = dict(host=host, parts=[p + '.' + S for p in d['parts']], specs=specs, follow=fo)
    for name, d in singles.items():
        out[name] = dict(host=d['host'], parts=list(d['parts']), specs=list(d['steps']), follow=d.get('follow'))
    return out


def xfz_bounds(D, pts):
    """Bounds of transformed points in (x, f, z) coordinates (f = -Y)."""
    q = [D @ p for p in pts]
    xs = [p.x for p in q]
    fs = [-p.y for p in q]
    zs = [p.z for p in q]
    return (min(xs), min(fs), min(zs)), (max(xs), max(fs), max(zs))


def ensure_empty(name, coll, size=0.15):
    o = bpy.data.objects.get(name)
    if o is None:
        o = bpy.data.objects.new(name, None)
        coll.objects.link(o)
        o.empty_display_type = 'PLAIN_AXES'
        o.empty_display_size = size
    return o


class Assembly:
    def __init__(self, name, host, parts, specs, follow=None):
        self.name, self.host, self.parts, self.specs, self.follow = name, host, parts, specs, follow
        self.node = None
        self.A0 = Matrix.Identity(4)
        self.steps = []
        self.center0 = Vector()
        self.K = None                     # follow offset: bone -> assembly at the stand


class Scene:
    def __init__(self, root_coll):
        from . import motion
        self.skel = rig.Skeleton()
        self.coll_rig = kit.collection('RIG', root_coll)
        self.bones = rig.sync_empties(self.skel, self.coll_rig)
        self.fold_world = motion.world(0.0, self.skel)[0]
        self.asm = {}
        self.structure = {}
        self.stow = {}
        self.carriers = []

    def depth(self, name):
        h = self.asm[name].host if name in self.asm else self._prog[name]['host']
        return 0 if not h.startswith('@') else 1 + self.depth(h[1:])

    def attach_car(self):
        prog = program()
        self._prog = prog
        order = sorted(prog, key=self.depth)
        for name in order:
            d = prog[name]
            a = Assembly(name, d['host'], d['parts'], d['specs'], d['follow'])
            a.node = ensure_empty('P.' + name, self.coll_rig)
            if a.host.startswith('@'):
                a.node.parent = self.asm[a.host[1:]].node
            elif a.host == 'world':
                a.node.parent = None
            else:
                a.node.parent = self.bones[a.host]
                a.A0 = self.fold_world[a.host].inverted()
            a.node.matrix_parent_inverse = Matrix.Identity(4)
            lo = Vector((1e9, 1e9, 1e9))
            hi = -lo
            pts = []
            missing = [on for on in a.parts if bpy.data.objects.get(on) is None]
            if missing:
                raise ValueError('%s: no such car parts %s' % (name, missing))
            for on in a.parts:
                o = bpy.data.objects[on]
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
            anchors = {on: a.A0 @ bpy.data.objects[on].matrix_basis.to_translation() for on in a.parts}
            R0 = a.A0.to_3x3()
            specs = [('move',) + tuple(sp[1:3]) + (R0 @ sp[3],) + tuple(sp[4:]) if sp[0] == 'wmove' else sp for sp in a.specs]
            a.steps = mech.build_steps(specs, lambda D, c=a.center0: D @ c, lambda D, P=pts: xfz_bounds(D, P),
                                       None, lambda D, spec, a=a, an=anchors: mech.dock_target(spec, a.center0, a.A0, D, an))
            self.asm[name] = a
        # follow offsets: where the robot carries each handed-over assembly in the stand
        from . import motion, bake
        W1 = motion.world(1.0, self.skel)[0]
        N1 = bake.node_worlds(self, 1.0, W1, follow=False)
        for a in self.asm.values():
            if a.follow:
                a.K = W1[a.follow[0]].inverted() @ N1[a.name]

    def attach_structure(self, parts):
        """parts: bone -> [objects authored in bone-local coordinates]."""
        from . import stow
        self.structure = parts
        self.stow = stow.build(parts, self.skel)
        for bone, objs in parts.items():
            for o in objs:
                o.parent = self.bones[bone]
                o.matrix_parent_inverse = Matrix.Identity(4)
