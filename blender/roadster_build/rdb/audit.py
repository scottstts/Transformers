"""Numeric checks on the baked timeline (run after bake.bake()).

  concealed(frame)   robot castings and braces in car mode: a casting is seen if
                     a ray from any of its support points escapes the car's opaque
                     panels in any of 26 view directions (glass does not hide)
  clashes(frames)    pairs of moving groups whose surfaces cross, by frame
  strokes()          every brace's span against its fitted stroke
"""
import math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from . import bake

GLASS = ('car.screen', 'car.roof', 'car.rearglass', 'car.door.L.glass', 'car.door.R.glass')


def _bvh(objs):
    vs, fs = [], []
    for o in objs:
        M = o.matrix_world
        me = o.data
        off = len(vs)
        vs += [M @ v.co for v in me.vertices]
        fs += [[off + i for i in p.vertices] for p in me.polygons]
    return BVHTree.FromPolygons(vs, fs, epsilon=0.0)


def _dirs():
    out = []
    for x in (-1, 0, 1):
        for y in (-1, 0, 1):
            for z in (-1, 0, 1):
                if (x, y, z) != (0, 0, 0):
                    out.append(Vector((x, y, z)).normalized())
    return out


def concealed(frame=0):
    sc = bpy.context.scene
    sc.frame_set(frame)
    opaque = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('car.') and
              not o.name.startswith(GLASS) and o.visible_get()]
    tree = _bvh(opaque)
    dirs = _dirs()
    seen = {}
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith(('robot.',)) or not o.visible_get():
            continue
        M = o.matrix_world
        for c in bake.support(o):
            p = M @ c
            for d in dirs:
                if d.z < -0.5:
                    continue              # from below the car only the ground looks
                hit = tree.ray_cast(p + d * 1e-4, d, 20.0)
                if hit[0] is None:
                    seen.setdefault(o.name, []).append((tuple(round(v, 2) for v in p), tuple(round(v, 1) for v in d)))
                    break
    return {k: (len(v), v[0]) for k, v in seen.items()}


GROUPS = {
    'nose': ('car.nose', 'car.hood', 'car.flap', 'car.screen'),
    'tail': ('car.tail', 'car.rearglass', 'car.wing', 'car.plate', 'car.pod', 'car.roof'),
    'tub': ('car.tub', 'car.cabin'),
    'doorL': ('car.door.L',), 'doorR': ('car.door.R',),
    'wheelFL': ('car.wheelF.L', 'car.caliper.F.L'), 'wheelFR': ('car.wheelF.R', 'car.caliper.F.R'),
    'wheelRL': ('car.wheelR.L', 'car.caliper.R.L'), 'wheelRR': ('car.wheelR.R', 'car.caliper.R.R'),
    'head': ('robot.head', 'robot.neck'),
    'torso': ('robot.chest', 'robot.spine', 'robot.pelvis', 'robot.hip'),
    'armL': ('robot.clav.L', 'robot.upperarm.L', 'robot.forearm.L', 'robot.hand.L'),
    'armR': ('robot.clav.R', 'robot.upperarm.R', 'robot.forearm.R', 'robot.hand.R'),
    'legL': ('robot.thigh.L', 'robot.shin.L', 'robot.foot.L', 'robot.toe.L'),
    'legR': ('robot.thigh.R', 'robot.shin.R', 'robot.foot.R', 'robot.toe.R'),
}
# pairs that are joined by design (docked, hinged, or one carrying the other)
JOINED = {('nose', 'torso'), ('tub', 'torso'), ('tail', 'tub'), ('doorL', 'armL'), ('doorR', 'armR'),
          ('wheelFL', 'armL'), ('wheelFR', 'armR'), ('wheelRL', 'legL'), ('wheelRR', 'legR'), ('head', 'torso'),
          ('armL', 'torso'), ('armR', 'torso'), ('legL', 'torso'), ('legR', 'torso'), ('nose', 'wheelFL'),
          ('nose', 'wheelFR'), ('tail', 'wheelRL'), ('tail', 'wheelRR'), ('tail', 'torso')}


def clashes(frames, groups=None):
    """{frame: [(group a, group b, crossing triangle pairs)]}, skipping JOINED pairs."""
    sc = bpy.context.scene
    out = {}
    names = list(groups or GROUPS)
    for f in frames:
        sc.frame_set(f)
        trees = {}
        for g in names:
            objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(GROUPS[g])]
            if objs:
                trees[g] = _bvh(objs)
        rows = []
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                if a not in trees or b not in trees or (a, b) in JOINED or (b, a) in JOINED:
                    continue
                n = len(trees[a].overlap(trees[b]))
                if n:
                    rows.append((a, b, n))
        if rows:
            out[f] = rows
    return out


def posed(S, t):
    """World matrices (unlifted, unflipped body frame) of every mesh at time t, from
    the choreography directly (no bake): for tuning poses."""
    from . import choreo as C, linkage
    W = S.bones(t)
    cw = S.carriers(t, W)
    out = {}
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.parent is None:
            continue
        pn = o.parent.name
        if pn.startswith('bone.part.'):
            node = o.parent
            out[o] = W[node['nest_bone']] @ C.casting_matrix(node['nest_bone'], Vector(node['nest_offset']), t) @ \
                o.matrix_basis
        else:
            key = pn[9:] if pn.startswith('bone.asm.') else pn[5:]
            if key in cw:
                out[o] = cw[key] @ o.matrix_parent_inverse @ o.matrix_basis
    return out


def overlap(mats, prefixes_a, prefixes_b):
    """Crossing triangle pairs between two object sets under the given matrices."""
    def tree(prefixes):
        vs, fs = [], []
        for o, M in mats.items():
            if o.name.startswith(prefixes):
                off = len(vs)
                vs += [M @ v.co for v in o.data.vertices]
                fs += [[off + i for i in p.vertices] for p in o.data.polygons]
        return BVHTree.FromPolygons(vs, fs) if fs else None
    a, b = tree(tuple(prefixes_a)), tree(tuple(prefixes_b))
    return len(a.overlap(b)) if a and b else 0


def car_mode_exposed(frame=0, jitter=0.006):
    """Robot vertices visible from outside the car at `frame`: a vertex counts only if
    a ray from it escapes every car panel in some view direction and still escapes
    with the ray moved `jitter` sideways four ways (so hairline shut lines do not
    count). Returns {object: (count, first exposed point)}."""
    sc = bpy.context.scene
    sc.frame_set(frame)
    tree = _bvh([o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('car.') and o.visible_get()])
    dirs = [Vector(d).normalized() for d in ((0, 0, 1), (1, 0, 1), (-1, 0, 1), (0, -1, 1), (0, 1, 1), (1, 0, 0),
                                             (-1, 0, 0), (0, -1, 0), (0, 1, 0), (1, 1, 1), (-1, 1, 1), (1, -1, 1),
                                             (-1, -1, 1))]

    def escapes(p, d):
        u = d.orthogonal().normalized()
        w = d.cross(u)
        for o in (Vector(), u * jitter, -u * jitter, w * jitter, -w * jitter):
            if tree.ray_cast(p + o + d * 1e-4, d, 20.0)[0] is not None:
                return False
        return True

    out = {}
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith('robot.') or not o.visible_get():
            continue
        M = o.matrix_world
        for v in o.data.vertices:
            p = M @ v.co
            if any(escapes(p, d) for d in dirs):
                n, first = out.get(o.name, (0, tuple(round(c, 3) for c in p)))
                out[o.name] = (n + 1, first)
    return out
