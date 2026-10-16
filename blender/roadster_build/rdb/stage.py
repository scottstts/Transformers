"""Inspection stage: ground, studio lights, timeline settings."""
import math
import bpy
from . import kit as K


def build():
    coll = '90_REVIEW_STAGE'
    for o in list(bpy.data.collections[coll].objects):
        bpy.data.objects.remove(o, do_unlink=True)
    m = K.Mesh()
    m.add([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [(0, 1, 2, 3)], 'plate')
    g = m.build('stage.ground', coll, bevel=0)
    K.PARTS.remove(g)
    g.data.materials.clear()
    mat = bpy.data.materials.get('roadster.stage') or bpy.data.materials.new('roadster.stage')
    mat.use_nodes = True
    p = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (0.18, 0.18, 0.19, 1)
    p.inputs['Roughness'].default_value = 0.6
    g.data.materials.append(mat)
    for name, loc, energy, size in (('key', (6, -7, 9), 1200, 8), ('fill', (-8, -2, 5), 500, 10), ('rim', (0, 9, 7), 900, 8)):
        ld = bpy.data.lights.new('stage.' + name, 'AREA')
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new('stage.' + name, ld)
        bpy.data.collections[coll].objects.link(lo)
        lo.location = loc
        d = -lo.location.normalized()
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        lo[K.TAG] = True
    sc = bpy.context.scene
    # EEVEE: raytraced reflections/refraction (glass, lenses) and fine shadows so
    # panel shading reads without blotches
    ee = sc.eevee
    for attr, val in (('use_raytracing', True), ('shadow_resolution_scale', 1.0), ('shadow_ray_count', 2),
                      ('shadow_step_count', 12), ('use_shadow_jitter_viewport', True), ('taa_render_samples', 64)):
        if hasattr(ee, attr):
            setattr(ee, attr, val)
    if hasattr(ee, 'ray_tracing_options'):
        ee.ray_tracing_options.resolution_scale = '1'
    vs = sc.view_settings
    try:
        vs.view_transform = 'AgX'
        vs.look = 'AgX - Base Contrast'
    except TypeError:
        pass
    vs.exposure = -0.6
    if hasattr(ee, 'ray_tracing_options'):
        rto = ee.ray_tracing_options
        for attr, val in (('use_denoise', True), ('denoise_spatial', True), ('denoise_temporal', True),
                          ('denoise_bilateral', True), ('screen_trace_quality', 1.0)):
            if hasattr(rto, attr):
                setattr(rto, attr, val)
    if hasattr(ee, 'fast_gi_method'):
        ee.use_fast_gi = False
    sc.render.fps = 30
    sc.frame_start = 0
    sc.frame_end = 240
    w = sc.world or bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.05, 0.05, 0.055, 1)
    bg.inputs['Strength'].default_value = 1.0
