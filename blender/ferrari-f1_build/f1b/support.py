"""Support continuity: every car assembly that has left its vehicle position must
stay mechanically connected while it moves -- touching its host bone's
structure, its parent assembly (for '@' hosts), or a declared linkage (a slide
carriage, hinge arm ...). A panel that sails through the air with nothing
holding it fails, even if it never collides.

At a sample T an assembly is 'held' when the nearest distance between its
surface and its support set is within TOL. Assemblies whose displacement is
still the identity are in their vehicle position (held by the body shell)."""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from . import bake, mech, sweep

TOL = 0.03           # a gap a 1-2 m panel reads as attached across
SAMPLES_PER_ASM = 2500

# assembly -> extra support assemblies (visible linkages the part rides on)
LINKS = {'tailgate': ('tgarm',)}


def _bvh(posed):
    vs, ts, off = [], [], 0
    for p in posed:
        vs.append(p.v)
        ts.append(p.t + off)
        off += len(p.v)
    if not vs:
        return None
    v = np.concatenate(vs)
    t = np.concatenate(ts)
    return BVHTree.FromPolygons(v.tolist(), t.tolist(), epsilon=0.0)


def gaps_at(sc, T, names=None):
    """assembly -> nearest support distance (only for displaced assemblies)."""
    objs, W, N, lift = bake.object_worlds(sc, T)
    posed = {o: sweep.Posed(o, M) for o, M in objs.items() if len(o.data.polygons)}
    by_bone = {bone: [posed[o] for o in lst if o in posed] for bone, lst in sc.structure.items()}
    by_asm = {n: [posed[bpy_obj(on)] for on in a.parts if bpy_obj(on) in posed] for n, a in sc.asm.items()}
    out = {}
    rng = np.random.default_rng(7)
    for name, a in sc.asm.items():
        if names and name not in names:
            continue
        D = mech.displacement(a.steps, T)
        if _is_identity(D):
            continue
        if a.host.startswith('@'):
            sup = list(by_asm[a.host[1:]])
        else:
            sup = list(by_bone.get(a.host, []))
        for l in LINKS.get(_base(name), ()):
            sup += by_asm.get(l + name[len(_base(name)):], [])
        sup += [posed[objs_l[-1]] for L, S, bone, panel, objs_l in sc.lifters if panel == name and objs_l[-1] in posed]
        mine = by_asm[name]
        tree, own = _bvh(sup), _bvh(mine)
        if tree is None or own is None:
            continue
        # symmetric: a small pad pressing on the middle of a large flat panel face has no panel
        # vertex near it, but its own vertices sit on the panel surface
        best = min(_nearest(mine, tree, rng), _nearest(sup, own, rng, box=_box(mine)))
        out[name] = best
    return out


def _box(posed, pad=0.05):
    lo = np.min([p.lo for p in posed], 0) - pad
    hi = np.max([p.hi for p in posed], 0) + pad
    return lo, hi


def _nearest(src, tree, rng, box=None):
    best = 10.0
    for p in src:
        v = p.v
        if box is not None:
            m = np.all((v >= box[0]) & (v <= box[1]), axis=1)
            v = v[m]
        if not len(v):
            continue
        if len(v) > SAMPLES_PER_ASM:
            v = v[rng.choice(len(v), SAMPLES_PER_ASM, replace=False)]
        for q in v:
            hit = tree.find_nearest(Vector(q), best)
            if hit[0] is not None and hit[3] < best:
                best = hit[3]
        if best <= TOL * 0.3:
            break
    return best


def bpy_obj(name):
    import bpy
    return bpy.data.objects[name]


def _base(name):
    return name[:-2] if name[-2:] in ('.L', '.R') else name


def _is_identity(D, eps=1e-6):
    for i in range(4):
        for j in range(4):
            if abs(D[i][j] - (1.0 if i == j else 0.0)) > eps:
                return False
    return True


def audit(sc, samples=48, verbose=True):
    """Report of unsupported spans: assembly -> (first T, last T, worst gap, worst T)."""
    rep = {}
    for k in range(samples + 1):
        T = k / samples
        for name, g in gaps_at(sc, T).items():
            if g <= TOL:
                continue
            r = rep.get(name)
            if r is None:
                rep[name] = [T, T, g, T]
            else:
                r[1] = T
                if g > r[2]:
                    r[2], r[3] = g, T
    rows = sorted(rep.items(), key=lambda kv: kv[1][0])
    if verbose:
        print('support %d samples: %d unsupported assemblies' % (samples + 1, len(rows)))
        for n, (t0, t1, g, gt) in rows:
            print('   %-16s T %.3f..%.3f  gap %.3f @ %.3f' % (n, t0, t1, g, gt))
    return rows
