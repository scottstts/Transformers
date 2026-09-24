"""Orthographic reference plates and contour overlays.

Two kinds of reference, calibrated to the design frame (x = car left, f =
forward, z = up):
  * the blueprint (ref/blueprint.png: side, front, rear and top views) is the
    STRUCTURAL guide. It is an F2004, so its length axes are stretched to the
    SF-25 wheelbase / track while heights keep the drawing's true scale.
  * the top-view photo (refs/ref_images/ferrari-f1-2.jpeg) is the PRECISE plan of
    the SF-25 (shot from high above; wheelbase-calibrated at 510 px/m).

Each plate maps image pixels to design coordinates. `setup()` puts axis-aligned
image empties in the scene (they show only in the matching ortho view), and
`overlay()` renders the model orthographically in the plate's frame and draws
its silhouette in red over the reference, so contours are compared directly.
"""
import math
import os
import numpy as np
import bpy
from mathutils import Vector, Matrix, Euler
from .kit import V

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BLUEPRINT = os.path.join(ROOT, 'blender', 'ferrari-f1_build', 'ref', 'blueprint.png')
PLAN = os.path.join(ROOT, 'refs', 'ref_images', 'ferrari-f1-2.jpeg')
OUT = os.path.join(ROOT, 'blender', 'renders', 'ferrari-f1', 'overlay')

# measured landmarks (pixels, row 0 = image top)
BP_SIDE_HUBS = ((132.1, 103.8), (528.6, 109.0))   # front, rear hub centres
BP_TYRE_R = 41.5
BP_TRUE = 3.05 / 396.5                             # F2004 drawing scale (m / px)
SF_WB = 3.60


class Plate:
    """Affine map between an image crop and a design-frame plane.
    axes: the two design axes the image spans, e.g. ('f', 'z').
    to_design(c, r) -> (a, b); to_pixel(a, b) -> (c, r) (vectorised)."""

    def __init__(self, name, path, box, axes, to_design, to_pixel, view):
        self.name, self.path, self.box, self.axes = name, path, box, axes
        self.to_design, self.to_pixel, self.view = to_design, to_pixel, view


def _side():
    (c0, r0), (c1, r1) = BP_SIDE_HUBS
    th = math.atan2(r1 - r0, c1 - c0)                  # drawing tilt: level the hub line
    cm, rm = (c0 + c1) / 2, (r0 + r1) / 2
    L = math.hypot(c1 - c0, r1 - r0)
    sx, sz = SF_WB / L, BP_TRUE                          # stretch length to the SF-25 wheelbase
    hub_z = BP_TYRE_R * sz
    ct, st = math.cos(th), math.sin(th)

    def to_design(c, r):
        u, v = c - cm, r - rm
        u2, v2 = u * ct + v * st, -u * st + v * ct
        return -u2 * sx, hub_z - v2 * sz                 # nose is on the left of the drawing

    def to_pixel(f, z):
        u2, v2 = -f / sx, (hub_z - z) / sz
        u, v = u2 * ct - v2 * st, u2 * st + v2 * ct
        return u + cm, v + rm
    return Plate('side', BLUEPRINT, (6, 4, 612, 156), ('f', 'z'), to_design, to_pixel, 'side')


def _front(rear=False):
    if not rear:
        cc, ground, outer = 147.0, 329.5, 235.0
        box = (22, 186, 272, 338)
    else:
        cc, ground, outer = 457.5, 329.0, 237.0
        box = (332, 186, 584, 338)
    sx = (1.905 if not rear else 1.995) / outer         # tyre outer faces at the SF-25 track
    sz = BP_TRUE
    sgn = -1.0 if rear else 1.0                          # from behind the car's left is on the viewer's left

    def to_design(c, r):
        return sgn * (c - cc) * sx, (ground - r) * sz

    def to_pixel(x, z):
        return sgn * x / sx + cc, ground - z / sz
    return Plate('rear' if rear else 'front', BLUEPRINT, box, ('x', 'z'), to_design, to_pixel, 'rear' if rear else 'front')


def _top():
    cf, cr = 136.9, 136.9 + 396.5
    cm, rc = (cf + cr) / 2, 476.3
    sx, sy = SF_WB / 396.5, 1.905 / 230.0

    def to_design(c, r):
        return -(c - cm) * sx, (r - rc) * sy             # nose left; the car's left is image-down

    def to_pixel(f, x):
        return -f / sx + cm, x / sy + rc
    return Plate('top', BLUEPRINT, (6, 352, 616, 598), ('f', 'x'), to_design, to_pixel, 'top')


def _plan():
    s = 510.0                                            # px / m from the axle lines (2487, 650)
    cm, rc = 1568.5, 1001.0

    def to_design(c, r):
        return (c - cm) / s, (rc - r) / s                # nose right; the car's left is image-up

    def to_pixel(f, x):
        return f * s + cm, rc - x * s
    return Plate('plan', PLAN, (250, 380, 3150, 1620), ('f', 'x'), to_design, to_pixel, 'top')


def plates():
    return [_side(), _front(), _front(True), _top(), _plan()]


# ------------------------------------------------------------------ scene empties
PLANE_OFFSET = {'side': ('x', -2.6), 'front': ('f', -4.2), 'rear': ('f', 4.2), 'top': ('z', -0.02)}


def _image(path):
    key = 'ref:' + os.path.basename(path)
    im = bpy.data.images.get(key)
    if im is None:
        im = bpy.data.images.load(path, check_existing=False)
        im.name = key
    return im


def setup(coll_name='REF'):
    """Axis-aligned image empties (viewport only) for every plate."""
    coll = bpy.data.collections.get(coll_name)
    if coll is None:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    for o in list(coll.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    out = []
    for p in plates():
        im = _image(p.path)
        W, H = im.size
        c0, r0, c1, r1 = p.box
        # design coords of the crop's corners -> an affine placement of the full image
        a00 = np.array(p.to_design(0.0, 0.0))
        a10 = np.array(p.to_design(float(W), 0.0))
        a01 = np.array(p.to_design(0.0, float(H)))
        ax, ay = p.axes
        def vec(a):
            d = {'x': 0.0, 'f': 0.0, 'z': 0.0}
            d[ax], d[ay] = a[0], a[1]
            return d
        P00, P10, P01 = (vec(a) for a in (a00, a10, a01))
        off_ax, off = PLANE_OFFSET[p.view if p.name != 'plan' else 'top']
        for d in (P00, P10, P01):
            d[off_ax] = off if p.name != 'plan' else -0.03
        o = bpy.data.objects.new('ref.' + p.name, None)
        o.empty_display_type = 'IMAGE'
        o.data = im
        o.empty_display_size = 1.0
        o.empty_image_offset = (0.0, 0.0)
        o.show_empty_image_only_axis_aligned = True
        o.show_empty_image_perspective = False
        o.empty_image_side = 'DOUBLE_SIDED'
        o.color[3] = 0.55
        o.use_empty_image_alpha = True
        # image empty: local x spans the image width (size), y the height scaled by aspect; origin = image centre
        p00, p10, p01 = V(P00['x'], P00['f'], P00['z']), V(P10['x'], P10['f'], P10['z']), V(P01['x'], P01['f'], P01['z'])
        ex, ey = p10 - p00, p00 - p01                  # image right, image up
        centre = p00 + ex * 0.5 - ey * 0.5
        size = max(W, H)
        sxl, syl = ex.length / (W / size), ey.length / (H / size)
        xa, ya = ex.normalized(), ey.normalized()
        za = xa.cross(ya)
        M = Matrix((xa, ya, za)).transposed().to_4x4()
        M.translation = centre
        o.matrix_world = M @ Matrix.Diagonal((sxl, syl, 1.0, 1.0))
        coll.objects.link(o)
        out.append(o)
    return out


# ------------------------------------------------------------------ overlays
VIEW_DIR = {'side': (Vector((1, 0, 0)), Vector((0, 0, 1))), 'front': (Vector((0, -1, 0)), Vector((0, 0, 1))),
            'rear': (Vector((0, 1, 0)), Vector((0, 0, 1))), 'top': (Vector((0, 0, 1)), Vector((0, 1, 0)))}


def overlay(plate_name, tag, collections=('CAR',), k=3, hide=()):
    """Render the model orthographically in the plate's frame; write the reference
    with the model's silhouette (red) and a translucent fill (cyan) over it."""
    p = next(q for q in plates() if q.name == plate_name)
    im = _image(p.path)
    W, H = im.size
    ref = np.array(im.pixels[:]).reshape(H, W, 4)[::-1, :, :3]
    c0, r0, c1, r1 = p.box
    cw, rh = (c1 - c0) * k, (r1 - r0) * k
    if p.name == 'plan':
        cw, rh = (c1 - c0) // 2, (r1 - r0) // 2
    # design extent of the crop (axis aligned in the design plane)
    cs = np.array([c0, c1, c1, c0], float)
    rs = np.array([r0, r0, r1, r1], float)
    A, B = p.to_design(cs, rs)
    a0, a1, b0, b1 = float(np.min(A)), float(np.max(A)), float(np.min(B)), float(np.max(B))
    # camera: orthographic, looking along the view direction, framing [a0, a1] x [b0, b1]
    sc = bpy.context.scene
    cam = bpy.data.objects.get('ref.cam')
    if cam is None:
        cam = bpy.data.objects.new('ref.cam', bpy.data.cameras.new('ref.cam'))
        sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    ax, ay = p.axes
    span_a, span_b = a1 - a0, b1 - b0
    res_x = cw
    res_y = max(8, int(round(cw * span_b / span_a)))
    cam.data.ortho_scale = span_a
    mid = {'x': 0.0, 'f': 0.0, 'z': 0.0}
    mid[ax], mid[ay] = (a0 + a1) / 2, (b0 + b1) / 2
    view = p.view
    d, up = VIEW_DIR[view]
    far = 20.0
    target = V(mid['x'], mid['f'], mid['z'])
    eye = target + d * far
    cam.location = eye
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y' if view != 'top' else 'Y').to_euler()
    if view == 'top':
        # image right must be +f (plan) or -f (blueprint top); the decode below maps pixels explicitly
        cam.rotation_euler = Euler((0, 0, math.radians(90)))
    cam.data.clip_start, cam.data.clip_end = 0.1, 60.0
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = res_x, res_y
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    hidden = []
    for c in bpy.data.collections:
        if c.name in ('STAGE', 'REF') or (c.name not in collections and c.name in ('ROBOT', 'RIG', 'CAR')):
            if not c.hide_render:
                c.hide_render = True
                hidden.append(c)
    for n in hide:
        o = bpy.data.objects.get(n)
        if o and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(OUT, '_mask.png')
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    for h in hidden:
        h.hide_render = False
    sc.render.film_transparent = False
    rim = bpy.data.images.load(tmp, check_existing=False)
    R = np.array(rim.pixels[:]).reshape(res_y, res_x, 4)[::-1]
    bpy.data.images.remove(rim)
    # camera pixel -> design coords
    jj, ii = np.meshgrid(np.arange(res_x), np.arange(res_y))
    u = (jj + 0.5) / res_x
    v = (ii + 0.5) / res_y
    # ortho frame: horizontal = span_a, vertical = span_a * res_y / res_x
    hs = span_a * res_y / res_x
    right, upv = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)), cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    wx = target.x + (u - 0.5) * span_a * right.x - (v - 0.5) * hs * upv.x
    wy = target.y + (u - 0.5) * span_a * right.y - (v - 0.5) * hs * upv.y
    wz = target.z + (u - 0.5) * span_a * right.z - (v - 0.5) * hs * upv.z
    des = {'x': wx, 'f': -wy, 'z': wz}
    pc, pr = p.to_pixel(des[ax], des[ay])
    pc = np.clip(pc.astype(int), 0, W - 1)
    pr = np.clip(pr.astype(int), 0, H - 1)
    base = ref[pr, pc]
    alpha = R[..., 3]
    m = alpha > 0.5
    edge = np.zeros_like(m)
    edge[1:-1, 1:-1] = m[1:-1, 1:-1] & ~(m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:])
    thick = edge.copy()
    thick[1:, :] |= edge[:-1, :]
    thick[:, 1:] |= edge[:, :-1]
    img = base.copy()
    img[m] = img[m] * 0.72 + np.array([0.0, 0.55, 0.65]) * 0.28
    img[thick] = [1.0, 0.05, 0.05]
    out = bpy.data.images.new('ovl', res_x, res_y, alpha=False)
    rgba = np.concatenate([img, np.ones((res_y, res_x, 1))], 2)
    out.pixels[:] = rgba[::-1].ravel()
    path = os.path.join(OUT, '%s_%s.png' % (tag, plate_name))
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    return path


def grid(plate_name, tag, a_range, b_range, px_per_m=500, step=0.1):
    """Resample a plate into a design-frame image window with a metric grid
    (thin every `step`, bold every 0.5 m; the zero lines are yellow), for reading
    contour coordinates straight off the reference."""
    p = next(q for q in plates() if q.name == plate_name)
    im = _image(p.path)
    W, H = im.size
    ref = np.array(im.pixels[:]).reshape(H, W, 4)[::-1, :, :3]
    a0, a1 = a_range
    b0, b1 = b_range
    nx, ny = int((a1 - a0) * px_per_m), int((b1 - b0) * px_per_m)
    jj, ii = np.meshgrid(np.arange(nx), np.arange(ny))
    A = a0 + (jj + 0.5) / px_per_m
    B = b1 - (ii + 0.5) / px_per_m
    pc, pr = p.to_pixel(A, B)
    ok = (pc >= 0) & (pc < W) & (pr >= 0) & (pr < H)
    img = np.ones((ny, nx, 3))
    img[ok] = ref[np.clip(pr[ok].astype(int), 0, H - 1), np.clip(pc[ok].astype(int), 0, W - 1)]
    def lines(vals, lo, n, axis):
        for k in range(int(np.ceil(lo / step)), int(np.floor((lo + n / px_per_m) / step)) + 1):
            v = k * step
            idx = int(round((v - lo) * px_per_m)) if axis == 0 else int(round((b1 - v) * px_per_m))
            if not (0 <= idx < (nx if axis == 0 else ny)):
                continue
            bold = abs(v / 0.5 - round(v / 0.5)) < 1e-6
            col = [1, 1, 0] if abs(v) < 1e-9 else ([1, 0.1, 0.1] if bold else [0, 0.8, 1])
            if axis == 0:
                img[:, idx] = img[:, idx] * 0.35 + np.array(col) * 0.65
            else:
                img[idx, :] = img[idx, :] * 0.35 + np.array(col) * 0.65
    lines(None, a0, nx, 0)
    lines(None, b0, ny, 1)
    out = bpy.data.images.new('grid', nx, ny, alpha=False)
    out.pixels[:] = np.concatenate([img, np.ones((ny, nx, 1))], 2)[::-1].ravel()
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'grid_%s_%s.png' % (tag, plate_name))
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    return path


# ------------------------------------------------------------------ camera-matched photo overlay
# The top-view photo is a pinhole projection from ~4.2 m above the car (the rear
# wing, 1050 mm wide by regulation at z 0.95, reads 18 % wider than the axle-height
# scale). A camera at the matched pose renders the model straight into the photo's
# pixel grid, so height-dependent parallax is reproduced rather than baked in.
PLAN_CAM = dict(H=4.2, z_cal=0.36, s_cal=510.0, f0=0.249, x0=0.0922, W=3392, Hpx=1908)


def plan_project(f, x, z):
    c = PLAN_CAM
    F = c['s_cal'] * (c['H'] - c['z_cal'])
    k = F / (c['H'] - z)
    return c['W'] / 2 + (f - c['f0']) * k, c['Hpx'] / 2 - (x - c['x0']) * k


def overlay_plan(tag, collections=('CAR',), scale=0.5, crop=(250, 380, 3150, 1620), hide=()):
    c = PLAN_CAM
    sc = bpy.context.scene
    cam = bpy.data.objects.get('ref.plancam')
    if cam is None:
        cam = bpy.data.objects.new('ref.plancam', bpy.data.cameras.new('ref.plancam'))
        sc.collection.objects.link(cam)
    F = c['s_cal'] * (c['H'] - c['z_cal'])
    cam.data.type = 'PERSP'
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.sensor_width = 36.0
    cam.data.lens = F / c['W'] * 36.0
    cam.data.clip_start, cam.data.clip_end = 0.05, 30.0
    cam.location = V(c['x0'], c['f0'], c['H'])
    cam.rotation_euler = Euler((0.0, 0.0, math.radians(-90)))      # image right = +f, image up = +x (car left)
    sc.camera = cam
    W, H = int(c['W'] * scale), int(c['Hpx'] * scale)
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    hidden = []
    for col in bpy.data.collections:
        if col.name in ('STAGE', 'REF') or (col.name not in collections and col.name in ('ROBOT', 'RIG', 'CAR', 'BODY')):
            if not col.hide_render:
                col.hide_render = True
                hidden.append(col)
    for n in hide:
        o = bpy.data.objects.get(n)
        if o and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(OUT, '_mask.png')
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    for h in hidden:
        h.hide_render = False
    sc.render.film_transparent = False
    rim = bpy.data.images.load(tmp, check_existing=False)
    R = np.array(rim.pixels[:]).reshape(H, W, 4)[::-1]
    bpy.data.images.remove(rim)
    im = _image(PLAN)
    ref = np.array(im.pixels[:]).reshape(c['Hpx'], c['W'], 4)[::-1, :, :3]
    jj, ii = np.meshgrid(np.arange(W), np.arange(H))
    base = ref[np.clip((ii / scale).astype(int), 0, c['Hpx'] - 1), np.clip((jj / scale).astype(int), 0, c['W'] - 1)]
    m = R[..., 3] > 0.5
    edge = np.zeros_like(m)
    edge[1:-1, 1:-1] = m[1:-1, 1:-1] & ~(m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:])
    img = base.copy()
    img[m] = img[m] * 0.75 + np.array([0.0, 0.6, 0.7]) * 0.25
    img[edge] = [1.0, 1.0, 0.1]
    x0, y0, x1, y1 = (int(v * scale) for v in crop)
    img = img[y0:y1, x0:x1]
    h2, w2 = img.shape[:2]
    out = bpy.data.images.new('ovl', w2, h2, alpha=False)
    out.pixels[:] = np.concatenate([img, np.ones((h2, w2, 1))], 2)[::-1].ravel()
    path = os.path.join(OUT, '%s_planphoto.png' % tag)
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    return path
