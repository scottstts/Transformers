"""Inspect the complete stamped shoulder on both sides, including folded sections."""
import bpy
import bmesh
from mathutils import Vector
from . import kit as K, contract as D, stage, review

VIEWS={
    'front':((2.52,-4.14,2.24),(.960,-1.080,.957),75),
    'doors':((2.69,-.840,1.85),(.986,.144,1.011),72),
    'quarter':((2.84,3.68,2.06),(.985,1.840,1.015),74),
}


def report():
    """Shared field boundaries are actual skin edges, not overlapping cover strips."""
    results=[]
    for obj in K.PARTS:
        if not obj.get('parametric_surface','').startswith('compound.'):continue
        bm=bmesh.new();bm.from_mesh(obj.data)
        field=bm.faces.layers.int.get('impala.surface.field')
        side=Vector((obj['surface_side'],0,0))
        edges=[e for e in bm.edges if field and len(e.link_faces)==2 and
               {f[field] for f in e.link_faces}=={1,2} and
               all(f.normal.dot(side if f[field]==1 else Vector((0,0,1)))>0
                   for f in e.link_faces)]
        vertices=set(v for e in edges for v in e.verts)
        residuals=[]
        for v in vertices:
            p=v.co;y=float(p.y)
            for _ in range(12):y=float(p.y)-(D.body_y(p.x,y,p.z)-y)
            residuals.append(abs(float(p.z)-D.CREST(y)))
        results.append({'part':obj.name,'shared_edges':len(edges),
                        'open_edges':sum(not e.is_manifold for e in edges),
                        'max_authored_edge_error_m':max(residuals,default=0),
                        'has_custom_normals':obj.data.has_custom_normals})
        bm.free()
    return results


def render(view,suffix='continuous',side='L'):
    scene=bpy.context.scene;scene.frame_set(0)
    eye,target,lens=VIEWS[view]
    if side=='R':
        eye=(-eye[0],eye[1],eye[2]);target=(-target[0],target[1],target[2])
    name='review.full_ridge.'+view+'.'+side
    camera=bpy.data.objects.get(name)
    if camera is None:
        camera=bpy.data.objects.new(name,bpy.data.cameras.new(name))
        bpy.data.collections['90_REVIEW_STAGE'].objects.link(camera)
        camera['impala_build']=True
    stage.look(camera,Vector(eye),Vector(target));camera.data.lens=lens
    camera.data.sensor_width=36;camera.data.clip_start=.025;camera.data.clip_end=100
    K.enum_set(camera.data,'sensor_fit','HORIZONTAL')
    scene.camera=camera;scene.render.resolution_x=1500;scene.render.resolution_y=850
    scene.render.resolution_percentage=100;scene.cycles.samples=48
    K.enum_set(scene.render.image_settings,'file_format','PNG')
    scene.render.filepath=review.DIRECTORY+'ridge_'+view+'_'+side+'_'+suffix+'.png'
    old=scene.compositing_node_group;scene.compositing_node_group=None
    try:bpy.ops.render.render(write_still=True)
    finally:scene.compositing_node_group=old
    return scene.render.filepath
