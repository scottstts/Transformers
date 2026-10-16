"""Quantitative line matching against the registered orthographic references.

For a view ('side' from +X, 'top' from +Z), every model feature line is
projected into the reference image: sharp creases, material borders, panel
seams (open boundaries between carriers) and the silhouette. Only visible
samples count (a ray cast toward the camera). Each sample's distance to the
nearest reference edge pixel is read from a distance transform of the
reference's edge map. The result is a table of features (object + material
border) with their median and 90th-percentile error in millimetres, and an
image with every model line drawn over the reference, green where it lies on a
reference edge (< 3 px), yellow (< 8 px), red beyond.
"""
import os
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from . import reference as R

OUT = R.OUT


def load_gray(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]
    bpy.data.images.remove(img)
    return a.mean(2), a


def edges(L, lo=0.035):
    """Gradient-magnitude edge map with non-maximum suppression (thin edges)."""
    gx = np.zeros_like(L)
    gy = np.zeros_like(L)
    gx[:, 1:-1] = (L[:, 2:] - L[:, :-2]) / 2
    gy[1:-1, :] = (L[2:, :] - L[:-2, :]) / 2
    # light smoothing of the gradient
    k = np.array([1, 2, 1], dtype=np.float32) / 4
    for g in (gx, gy):
        g[:] = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, g)
        g[:] = np.apply_along_axis(lambda c: np.convolve(c, k, 'same'), 0, g)
    mag = np.hypot(gx, gy)
    ang = np.arctan2(gy, gx)
    q = (np.round(ang / (np.pi / 4)) % 4).astype(int)
    out = np.zeros_like(mag, dtype=bool)
    for d, (dy, dx) in enumerate(((0, 1), (1, 1), (1, 0), (1, -1))):
        m = q == d
        a = np.roll(np.roll(mag, dy, 0), dx, 1)
        b = np.roll(np.roll(mag, -dy, 0), -dx, 1)
        out |= m & (mag >= a) & (mag >= b) & (mag > lo)
    return out


def distance(mask):
    """Chamfer (3-4) distance transform to the nearest True pixel, in pixels."""
    h, w = mask.shape
    INF = 1e9
    d = np.where(mask, 0.0, INF)
    for y in range(h):
        row = d[y]
        if y > 0:
            prev = d[y - 1]
            row = np.minimum(row, prev + 1.0)
            row[1:] = np.minimum(row[1:], prev[:-1] + 1.4142)
            row[:-1] = np.minimum(row[:-1], prev[1:] + 1.4142)
        d[y] = row
        # horizontal sweeps (vectorised via cumulative min of (d - x) / (d + x))
        idx = np.arange(w, dtype=np.float64)
        d[y] = np.minimum.accumulate(d[y] - idx) + idx
        d[y] = (np.minimum.accumulate((d[y] + idx)[::-1]) - idx[::-1])[::-1]
    for y in range(h - 2, -1, -1):
        nxt = d[y + 1]
        row = np.minimum(d[y], nxt + 1.0)
        row[1:] = np.minimum(row[1:], nxt[:-1] + 1.4142)
        row[:-1] = np.minimum(row[:-1], nxt[1:] + 1.4142)
        idx = np.arange(w, dtype=np.float64)
        row = np.minimum.accumulate(row - idx) + idx
        row = (np.minimum.accumulate((row + idx)[::-1]) - idx[::-1])[::-1]
        d[y] = row
    return d


# Perspective photos with fitted cameras (reference.fit_camera). ppm: pixels per
# metre near the car, only used to report errors in millimetres.
PERSP = {
    'nv': dict(file=os.path.join(OUT, 'nv_ref.png'), w=2800, h=2074, ppm=420.0,
               camera=(3.79, -6.645, 0.997, -0.558, -0.031, -0.017, 3972.628)),
}


def view_setup(view):
    if view == 'side':
        S = R.SIDE

        def to_px(p):
            return S['px'] + (p.y - S['y']) * S['ppm'], S['py'] - (p.z - S['z']) * S['ppm']
        cam_dir = Vector((1, 0, 0))
        return S, to_px, cam_dir, S['file']
    if view in PERSP:
        P = PERSP[view]
        import numpy as np
        cam = Vector(P['camera'][:3])

        def to_px(p):
            u, v = R._project(P['camera'], np.array([[p.x, p.y, p.z]]), P['w'], P['h'])[0]
            return float(u), float(v)
        return dict(ppm=P['ppm']), to_px, cam, P['file']
    T = R.TOP

    def to_px(p):
        return T['px'] + (p.y - T['y']) * T['ppm'], T['py'] + (p.x - T['x']) * T['ppm']
    return T, to_px, Vector((0, 0, 1)), T['file']


def feature_lines(view_dir, angle=25.0, cam=None):
    """World-space line segments: (a, b, label) for every visible feature."""
    def vd(p):
        return (cam - p).normalized() if cam is not None else view_dir
    deps = bpy.context.evaluated_depsgraph_get()
    segs = []
    meshes = []
    for o in bpy.data.collections['01_CAR'].objects:
        if o.type != 'MESH' or o.hide_get() or '.text.' in o.name:
            continue
        # features from the authored mesh: the bevel modifier splits a crease
        # into small facets no single edge of which reads as a crease
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        bm.normal_update()
        meshes.append(bm)
        mats = [m.name.split('.', 1)[-1] if m else '?' for m in o.data.materials]
        for e in bm.edges:
            if len(e.link_faces) != 2:
                label = 'open'
            else:
                f0, f1 = e.link_faces
                n0, n1 = f0.normal, f1.normal
                if f0.material_index != f1.material_index:
                    a, b = sorted((mats[f0.material_index], mats[f1.material_index]))
                    label = 'border:%s/%s' % (a, b)
                elif n0.angle(n1, 0) > math.radians(angle):
                    label = 'crease'
                elif ((n0.dot(vd(e.verts[0].co)) > 0) != (n1.dot(vd(e.verts[0].co)) > 0)):
                    label = 'silhouette'
                else:
                    continue
            segs.append((e.verts[0].co.copy(), e.verts[1].co.copy(), o.name + ' ' + label))
    # one BVH over everything for visibility
    verts, polys = [], []
    for bm in meshes:
        off = len(verts)
        verts += [v.co.copy() for v in bm.verts]
        polys += [[off + v.index for v in f.verts] for f in bm.faces]
        bm.free()
    bvh = BVHTree.FromPolygons(verts, polys, epsilon=1e-6)
    return segs, bvh


def run(view='side', step_px=2.0, crop=None, name=None):
    os.makedirs(OUT, exist_ok=True)
    if view == 'side':
        R.ensure_side_ref()
    S, to_px, cam_dir, ref_file = view_setup(view)
    L, rgb = load_gray(ref_file)
    E = edges(L)
    D = distance(E)
    persp = view in PERSP
    segs, bvh = feature_lines(cam_dir, cam=cam_dir if persp else None)
    h, w = L.shape
    stats = {}
    pts = []
    for a, b, label in segs:
        pa, pb = to_px(a), to_px(b)
        n = max(1, int(math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / step_px))
        for i in range(n + 1):
            t = i / n
            p = a.lerp(b, t)
            px, py = pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t
            if not (0 <= px < w and 0 <= py < h):
                continue
            ray = (cam_dir - p).normalized() if persp else cam_dir
            dist = (cam_dir - p).length - 0.01 if persp else 50.0
            hit = bvh.ray_cast(p + ray * 0.002, ray, dist)
            if hit[0] is not None:
                continue                      # hidden behind something
            err = float(D[int(py), int(px)])
            stats.setdefault(label, []).append(err)
            pts.append((px, py, err))
    # render the diagnostic overlay
    img = (rgb * 0.75).copy()
    for px, py, err in pts:
        c = (0.1, 1.0, 0.2) if err < 3 else (1.0, 0.9, 0.1) if err < 8 else (1.0, 0.1, 0.1)
        y0, x0 = int(py), int(px)
        img[max(0, y0 - 1):y0 + 1, max(0, x0 - 1):x0 + 1] = c
    out = os.path.join(OUT, (name or view) + '_lines.png')
    im = bpy.data.images.new('linecheck', w, h, alpha=False)
    flat = np.concatenate([img[::-1], np.ones((h, w, 1), dtype=np.float32)], axis=2).ravel()
    im.pixels.foreach_set(flat)
    im.filepath_raw = out
    im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)
    mm = 1000.0 / S['ppm']
    table = sorted(((k, len(v), float(np.median(v)) * mm, float(np.percentile(v, 90)) * mm) for k, v in stats.items()),
                   key=lambda r: -r[3])
    return out, table


def tiles(view='side', box=(100, 60, 2500, 780), tile=200, zoom=4):
    """Zoomed reference | overlay tiles of the last run (tools/ref-tiles.mjs logic)."""
    import subprocess
    ref = R.SIDE['file'] if view == 'side' else PERSP[view]['file'] if view in PERSP else R.TOP['file']
    ovl = os.path.join(OUT, view + '_lines.png')
    tdir = os.path.join(OUT, 'tiles' if view == 'side' else 'tiles_' + view)
    os.makedirs(tdir, exist_ok=True)
    x0, y0, x1, y1 = box
    for y in range(y0, y1, tile):
        for x in range(x0, x1, tile):
            crop = 'crop=%d:%d:%d:%d,scale=%d:%d:flags=neighbor' % (tile, tile, x, y, tile * zoom, tile * zoom)
            subprocess.run(['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-y', '-i', ref, '-i', ovl, '-filter_complex',
                            '[0:v]%s[a];[1:v]%s[b];[a][b]hstack' % (crop, crop),
                            os.path.join(tdir, 't_%04d_%04d.png' % (x, y))], check=True)
    return tdir
