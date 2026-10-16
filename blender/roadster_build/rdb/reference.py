"""Reference registration and overlay checks.

Side: frame 6 s of ref_images/roadster/top-side-view.MP4 (4K), cropped to
2600 x 800 at (500, 820): a long-lens pure side view of the car's left (+X)
side. Calibration from the wheels: front hub (540, 535) px = (y -1.405, z
0.397), 541 px per metre, ground z = 0 at row 752. The car is 4.36 m nose to tail.

Top: ref_images/roadster/top.JPG (nadir drone view), 156.9 px per metre, nose
at column 670 = y -2.19, centreline row 679, nose pointing to image left.

Overlays render the model orthographically with the reference's framing and
blend the two (difference and 50 % mix), so a mismatch is a measurable offset.
"""
import os
import subprocess
import bpy
from mathutils import Vector

ROOT = '/Users/scott/Documents/Projects/Node/Transformers'
OUT = os.path.join(ROOT, 'blender', 'renders', 'roadster_ref')
SIDE = dict(file=os.path.join(OUT, 'side_ref.png'), w=2600, h=800, ppm=541.0,
            px=540.0, py=535.0, y=-1.405, z=0.397)
TOP = dict(file=os.path.join(ROOT, 'ref_images', 'roadster', 'top.JPG'), w=2048, h=1364, ppm=156.9,
           px=670.0, py=679.0, y=-2.19, x=0.0)


# Perspective photos: landmarks (pixel in the original image) <-> model point.
# The front photo's camera is fitted to them (pinhole, square pixels, centred).
FRONT = dict(file=os.path.join(ROOT, 'ref_images', 'roadster', 'front.avif'), w=2200, h=1040, marks=[
    ((818.1, 608.1), (-0.548, -2.19, 0.562)), ((1399.4, 608.1), (0.548, -2.19, 0.562)),     # light bar ends
    ((724.4, 438.1), (-0.785, -1.27, 0.899)), ((1480.6, 438.1), (0.785, -1.27, 0.899)),     # A-pillar feet
    ((886.9, 291.3), (-0.567, -0.342, 1.155)), ((1302.5, 288.1), (0.567, -0.342, 1.155)),   # windshield top
    ((890.0, 463.1), (-0.47, -1.50, 0.835)), ((1321.3, 463.1), (0.47, -1.50, 0.835)),       # cowl corners
])


# Rear photo (wing deployed): the camera looks forward (-y) from low behind the car.
BACK = dict(file=os.path.join(ROOT, 'ref_images', 'roadster', 'back.JPG'), w=2048, h=1365, marks=[
    ((537.6, 630.8), (0.78, 2.17, 0.871)), ((1510.4, 630.8), (-0.78, 2.17, 0.871)),          # red bar ends
    ((940.0, 698.4), (0.155, 2.18, 0.745)), ((1082.4, 778.2), (-0.155, 2.18, 0.625)),        # plate corners
    ((819.2, 824.3), (0.37, 2.19, 0.515)), ((1228.8, 824.3), (-0.37, 2.19, 0.515)),          # outer nozzles
    ((563.0, 1100.8), (0.80, 1.506, 0.0)), ((1484.8, 1100.8), (-0.80, 1.506, 0.0)),          # tyre contacts
])


def _rot(yaw, pitch, roll):
    import numpy as np
    cy, sy, cp, sp, cr, sr = np.cos(yaw), np.sin(yaw), np.cos(pitch), np.sin(pitch), np.cos(roll), np.sin(roll)
    # camera forward (looking direction), right, up in world
    fwd = np.array([sy * cp, cy * cp, sp])
    right = np.array([cy, -sy, 0.0])
    up = np.cross(right, fwd)
    r2 = right * cr + up * sr
    u2 = up * cr - right * sr
    return fwd, r2, u2


def _project(params, pts, w, h):
    import numpy as np
    x, y, z, yaw, pitch, roll, f = params
    fwd, right, up = _rot(yaw, pitch, roll)
    d = pts - np.array([x, y, z])
    depth = d @ fwd
    return np.c_[w / 2 + f * (d @ right) / depth, h / 2 - f * (d @ up) / depth]


def fit_camera(R, start=None):
    """Gauss-Newton fit of a pinhole camera to the landmarks."""
    import numpy as np
    px = np.array([m[0] for m in R['marks']], dtype=float)
    pts = np.array([m[1] for m in R['marks']], dtype=float)
    p = np.array(start if start is not None else [0.0, -11.7, 1.3, 0.0, -0.08, 0.0, 4700.0])
    for _ in range(60):
        r = (_project(p, pts, R['w'], R['h']) - px).ravel()
        J = np.zeros((r.size, p.size))
        for i in range(p.size):
            dp = np.zeros_like(p)
            dp[i] = 1e-6 * max(1.0, abs(p[i]))
            J[:, i] = ((_project(p + dp, pts, R['w'], R['h']) - px).ravel() - r) / dp[i]
        step = np.linalg.lstsq(J, -r, rcond=None)[0]
        p = p + step
        if np.linalg.norm(step) < 1e-9:
            break
    res = (_project(p, pts, R['w'], R['h']) - px)
    return p, float(np.sqrt((res ** 2).sum(1)).max())


def render_persp(R, params, path):
    import numpy as np
    sc = bpy.context.scene
    keep = (sc.camera, sc.render.engine, sc.render.resolution_x, sc.render.resolution_y,
            sc.render.resolution_percentage, sc.render.filepath, sc.render.film_transparent)
    cam = _camera('ref.camera.persp')
    cam.data.type = 'PERSP'
    x, y, z, yaw, pitch, roll, f = params
    fwd, right, up = _rot(yaw, pitch, roll)
    from mathutils import Matrix as M3
    rot = M3((tuple(right), tuple(up), tuple(-fwd))).transposed()
    cam.matrix_world = M3.Translation((x, y, z)) @ rot.to_4x4()
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.sensor_width = 36.0
    cam.data.lens = f / R['w'] * 36.0
    sc.camera = cam
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = R['w'], R['h']
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    hidden = [o for o in bpy.data.collections['90_REVIEW_STAGE'].objects if not o.hide_render]
    for o in hidden:
        o.hide_render = True
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    (sc.camera, sc.render.engine, sc.render.resolution_x, sc.render.resolution_y,
     sc.render.resolution_percentage, sc.render.filepath, sc.render.film_transparent) = keep
    return path


def overlay_front(view='front'):
    os.makedirs(OUT, exist_ok=True)
    R = FRONT if view == 'front' else BACK
    ref = os.path.join(OUT, view + '_ref.png')
    if not os.path.exists(ref):
        subprocess.run(['/usr/bin/sips', '-s', 'format', 'png', R['file'], '--out', ref], check=True,
                       capture_output=True)
    start = None if view == 'front' else [0.0, 12.0, 0.6, 3.14159, 0.0, 0.0, 4000.0]
    params, err = fit_camera(R, start)
    model = render_persp(R, params, os.path.join(OUT, view + '_model.png'))
    out = {}
    for name, filt in (('mix', '[1:v]format=rgba,colorchannelmixer=aa=0.5[m];[0:v][m]overlay=0:0'),
                       ('edges', '[1:v]format=rgba,split[a][b];[a]alphaextract,edgedetect=low=0.1:high=0.3[sil];'
                                 '[b]format=gray,edgedetect=low=0.08:high=0.2[int];[sil][int]blend=all_mode=lighten,'
                                 'format=rgba,colorchannelmixer=rr=1:gg=0:bb=0:aa=1:ar=1[red];'
                                 '[red]colorkey=black:0.2:0.0[k];[0:v][k]overlay=0:0')):
        p = os.path.join(OUT, '%s_%s.png' % (view, name))
        subprocess.run(['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-y', '-i', ref, '-i', model, '-filter_complex',
                        filt, p], check=True)
        out[name] = p
    out['fit_px'] = err
    out['camera'] = [round(float(v), 4) for v in params]
    return out


# Plane registrations of the perspective photos: at the plane y = plane, s px per
# metre, column col0 = x 0, row row0 = z z0; the camera stands D metres from the
# plane at height zc, its axis level (rear) or pitched to the anchor (front).
PLANES = {
    'back': dict(R=BACK, plane=2.17, s=603.0, col0=1024.0, row0=608.0, z0=0.903, D=13.7, zc=0.55, dirn=-1),
    'front': dict(R=FRONT, plane=-2.19, s=519.0, col0=1108.75, row0=608.1, z0=0.565, D=9.5, zc=1.20, dirn=1),
}


def overlay_back(crop=None, view='back'):
    """Perspective photo overlay with a plane registration (PLANES): the camera
    sits D metres off the plane at height zc, axis level, its principal point
    shifted so that the registered anchor rows and columns land exactly."""
    P = PLANES[view]
    R = P['R']
    os.makedirs(OUT, exist_ok=True)
    ref = os.path.join(OUT, view + '_ref.png')
    if not os.path.exists(ref):
        subprocess.run(['/usr/bin/sips', '-s', 'format', 'png', R['file'], '--out', ref], check=True, capture_output=True)
    sc = bpy.context.scene
    keep = (sc.camera, sc.render.engine, sc.render.resolution_x, sc.render.resolution_y,
            sc.render.resolution_percentage, sc.render.filepath, sc.render.film_transparent)
    cam = _camera('ref.camera.' + view)
    cam.data.type = 'PERSP'
    D, s, zc = P['D'], P['s'], P['zc']
    f = s * D
    xc = P.get('xc', 0.0)
    cam.location = (xc, P['plane'] - P['dirn'] * D, zc)
    cam.rotation_euler = (1.5707963, 0.0, 3.14159265 if P['dirn'] < 0 else 0.0)
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.sensor_width = 36.0
    cam.data.lens = f / R['w'] * 36.0
    row_axis = P['row0'] + (P['z0'] - zc) * s
    # the anchor column must stay at col0 after moving the camera sideways
    cam.data.shift_x = (R['w'] / 2 - P['col0']) / R['w'] - P['dirn'] * xc * s / R['w']
    cam.data.shift_y = (row_axis - R['h'] / 2) / R['w']
    cam.data.clip_end = 100
    sc.camera = cam
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = R['w'], R['h']
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    hidden = [o for o in bpy.data.collections['90_REVIEW_STAGE'].objects if not o.hide_render]
    for o in hidden:
        o.hide_render = True
    model = os.path.join(OUT, view + '_model.png')
    sc.render.filepath = model
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    (sc.camera, sc.render.engine, sc.render.resolution_x, sc.render.resolution_y,
     sc.render.resolution_percentage, sc.render.filepath, sc.render.film_transparent) = keep
    out = {}
    vf = ',crop=%d:%d:%d:%d' % crop if crop else ''
    for name, filt in (('mix', '[1:v]format=rgba,colorchannelmixer=aa=0.5[m];[0:v][m]overlay=0:0'),
                       ('edges', '[1:v]format=rgba,split[a][b];[a]alphaextract,edgedetect=low=0.1:high=0.3[sil];'
                                 '[b]format=gray,edgedetect=low=0.08:high=0.2[int];[sil][int]blend=all_mode=lighten,'
                                 'format=rgba,colorchannelmixer=rr=1:gg=0:bb=0:aa=1:ar=1[red];'
                                 '[red]colorkey=black:0.2:0.0[k];[0:v][k]overlay=0:0')):
        p = os.path.join(OUT, '%s_%s.png' % (view, name))
        subprocess.run(['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-y', '-i', ref, '-i', model, '-filter_complex',
                        filt + (('[o];[o]' + vf[1:]) if vf else ''), p], check=True)
        out[name] = p
    return out


def ensure_side_ref():
    """Extract the registered side frame from the video (once)."""
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(SIDE['file']):
        subprocess.run(['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-y', '-ss', '6', '-i',
                        os.path.join(ROOT, 'ref_images', 'roadster', 'top-side-view.MP4'), '-frames:v', '1',
                        '-vf', 'crop=2600:800:500:820', SIDE['file']], check=True)


def _camera(name):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cd = bpy.data.cameras.new(name)
        cam = bpy.data.objects.new(name, cd)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    return cam


def render_view(view, path):
    """Workbench ortho render framed exactly like the reference image."""
    sc = bpy.context.scene
    keep = (sc.camera, sc.render.engine, sc.render.resolution_x, sc.render.resolution_y,
            sc.render.resolution_percentage, sc.render.filepath, sc.render.film_transparent)
    cam = _camera('ref.camera')
    if view == 'side':
        R = SIDE
        width_m = R['w'] / R['ppm']
        cy = R['y'] + (R['w'] / 2 - R['px']) / R['ppm']
        cz = R['z'] + (R['py'] - R['h'] / 2) / R['ppm']
        cam.location = (20.0, cy, cz)
        cam.rotation_euler = (1.5707963, 0.0, 1.5707963)
    else:
        R = TOP
        width_m = R['w'] / R['ppm']
        cy = R['y'] + (R['w'] / 2 - R['px']) / R['ppm']
        cx = R['x'] + (R['py'] - R['h'] / 2) / R['ppm']
        cam.location = (cx, cy, 20.0)
        cam.rotation_euler = (0.0, 0.0, 1.5707963)
    cam.data.ortho_scale = width_m
    cam.data.clip_end = 100
    sc.camera = cam
    try:
        sc.render.engine = 'BLENDER_WORKBENCH'
    except TypeError:
        pass
    sc.render.resolution_x, sc.render.resolution_y = R['w'], R['h']
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    hidden = [o for o in bpy.data.collections['90_REVIEW_STAGE'].objects if not o.hide_render]
    for o in hidden:
        o.hide_render = True
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    (sc.camera, sc.render.engine, sc.render.resolution_x, sc.render.resolution_y,
     sc.render.resolution_percentage, sc.render.filepath, sc.render.film_transparent) = keep
    return path


def overlay(view='side'):
    """Writes <view>_mix.png (50 % blend) and <view>_edges.png (model outline in
    red over the reference)."""
    ensure_side_ref()
    os.makedirs(OUT, exist_ok=True)
    model = render_view(view, os.path.join(OUT, view + '_model.png'))
    ref = SIDE['file'] if view == 'side' else TOP['file']
    mix = os.path.join(OUT, view + '_mix.png')
    edges = os.path.join(OUT, view + '_edges.png')
    ff = '/opt/homebrew/bin/ffmpeg'
    subprocess.run([ff, '-v', 'error', '-y', '-i', ref, '-i', model, '-filter_complex',
                    '[1:v]format=rgba,colorchannelmixer=aa=0.5[m];[0:v][m]overlay=0:0', mix], check=True)
    # model silhouette + internal edges in red over the reference
    subprocess.run([ff, '-v', 'error', '-y', '-i', ref, '-i', model, '-filter_complex',
                    '[1:v]format=rgba,split[a][b];[a]alphaextract,edgedetect=low=0.1:high=0.3[sil];'
                    '[b]format=gray,edgedetect=low=0.08:high=0.2[int];[sil][int]blend=all_mode=lighten,'
                    'format=rgba,colorchannelmixer=rr=1:gg=0:bb=0:aa=1:ar=1[red];'
                    '[red]colorkey=black:0.2:0.0[k];[0:v][k]overlay=0:0', edges], check=True)
    return {'mix': mix, 'edges': edges}
