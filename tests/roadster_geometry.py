"""Run inside Blender after rdb_build.car_stage(); no scene mutation."""
import math
import bpy
import bmesh
from mathutils import Vector
from rdb import body as B, side


def run():
    reports = {}
    names = ('nose', 'hood', 'door.L', 'door.R', 'tail', 'wing', 'rearglass',
             'door.L.glass', 'door.R.glass', 'tail.panel', 'tail.plate',
             'wheelF.L', 'wheelF.R', 'wheelR.L', 'wheelR.R')
    for name in names:
        obj = bpy.data.objects['car.' + name]
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        nonmanifold = sum(not e.is_manifold for e in bm.edges)
        degenerate = sum(f.calc_area() < 1e-12 for f in bm.faces)
        loose = sum(not v.link_faces for v in bm.verts)
        reports[name] = (nonmanifold, degenerate, loose)
        bm.free()
        assert not (nonmanifold or degenerate or loose), (name, reports[name])

    # A 2 micrometre change in station must never produce a millimetre step.
    continuity = 0.0
    for y in [-1.50, B.QUARTER_Y[0], B.QUARTER_Y[1], B.SIDE_TIP, 1.55, 1.84]:
        a, b = B.sta(y - 1e-6), B.sta(y + 1e-6)
        continuity = max(continuity, max(abs(a[k] - b[k]) for k in a))
        if B.CANOPY_Y0 < y < B.CANOPY_Y1:
            a, _ = B.canopy_ring(y - 1e-6)
            b, _ = B.canopy_ring(y + 1e-6)
            continuity = max(continuity, max((p - q).length for p, q in zip(a, b)))
    assert continuity < .00002, continuity

    # Registered lower quarter-window edge, excluding the blended first anchor.
    errors = []
    for (px, py), y in zip(B.QUARTER_PX[1:], B.QUARTER_Y[1:]):
        ring, _ = B.canopy_ring(y)
        row = 535 - (ring[0].z - .397) * 541
        errors.append(abs(row - py))
    assert max(errors) < .1, errors

    # The entire centre of the rear glass must remain visible from above.
    dg = bpy.context.evaluated_depsgraph_get()
    for y in (1.10, 1.30, 1.55, 1.70, 1.80, 1.83):
        for x in (-.12, 0, .12):
            hit, p, normal, face, obj, matrix = bpy.context.scene.ray_cast(
                dg, Vector((x, y, 2)), Vector((0, 0, -1)))
            assert hit and obj.name == 'car.rearglass', (x, y, obj.name if obj else None)

    for name in ('wheelF.L', 'wheelF.R', 'wheelR.L', 'wheelR.R'):
        obj = bpy.data.objects['car.' + name]
        assert all('bronze' not in m.name for m in obj.data.materials)

    marker = bpy.data.objects['car.tail.markers']
    proud = max(abs((marker.matrix_world @ v.co).x)
                - side.surface_x((marker.matrix_world @ v.co).y,
                                 (marker.matrix_world @ v.co).z)
                for v in marker.data.vertices)
    assert proud <= -.0005, proud
    return {'topology': reports, 'maximum_join_step_mm': continuity * 1000,
            'quarter_boundary_max_px': max(errors), 'rear_glass_visibility_rays': 18,
            'rear_marker_max_offset_mm': proud * 1000}


print(run())
