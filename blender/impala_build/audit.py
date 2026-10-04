"""Part topology and the explicit clearance failures from the rejected build."""
import math
import bpy
import bmesh
from bpy_extras import anim_utils
from mathutils.bvhtree import BVHTree
from . import kit as K, contract as D


def geometry(obj,evaluated=True):
    deps=bpy.context.evaluated_depsgraph_get()
    owner=obj.evaluated_get(deps) if evaluated else obj
    mesh=owner.to_mesh()
    points=[obj.matrix_world@v.co for v in mesh.vertices]
    faces=[tuple(p.vertices) for p in mesh.polygons]
    owner.to_mesh_clear()
    return points,faces


def topology():
    report={'parts':0,'triangles':0,'issues':[],'model_min_z':100,'shell_min_z':100}
    for obj in K.PARTS:
        if not obj.name.startswith('car.'): continue
        if obj.type not in ('MESH','CURVE','FONT'): continue
        p,f=geometry(obj)
        report['parts']+=1
        report['triangles']+=sum(len(face)-2 for face in f)
        report['model_min_z']=min(report['model_min_z'],min(v.z for v in p))
        if obj.get('parametric_surface','').startswith('compound.'):
            report['shell_min_z']=min(report['shell_min_z'],min(v.z for v in p))
        bm=bmesh.new()
        bm.from_mesh(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh())
        boundary=sum(not e.is_manifold for e in bm.edges)
        degenerate=sum(face.calc_area()<1e-12 for face in bm.faces)
        loose=sum(not v.link_faces for v in bm.verts)
        volume=bm.calc_volume(signed=True)
        if boundary or degenerate or loose or volume<=0:
            report['issues'].append({'part':obj.name,'non_manifold_edges':boundary,'degenerate_faces':degenerate,'loose_vertices':loose,'signed_volume':volume})
        bm.free()
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    return report


def clearances():
    trees={}
    def tree(obj):
        if obj.name not in trees:
            p,f=geometry(obj)
            trees[obj.name]=BVHTree.FromPolygons(p,f,all_triangles=False,epsilon=0)
        return trees[obj.name]
    clashes=[]
    checked=0
    for end in ('front','rear'):
        for side in ('L','R'):
            wheel=[o for o in K.PARTS if o.name.startswith('car.wheel.'+end+'.'+side+'.') and o.type=='MESH']
            panels=[o for o in K.PARTS if o.type=='MESH' and o.name.startswith('car.') and
                    (o.name.startswith('car.'+end+'_fender.'+side) or
                     (end=='rear' and o.name.startswith('car.rear_door.'+side)))]
            for a in wheel:
                for b in panels:
                    checked+=1
                    hits=tree(a).overlap(tree(b))
                    if hits: clashes.append({'wheel':a.name,'shell':b.name,'triangle_pairs':len(hits)})
    lamp_clashes=[]
    lamps=[o for o in K.PARTS if 'sealed.fluted.lens' in o.name]
    bars=[o for o in K.PARTS if o.name.startswith(('car.grille.horizontal','car.grille.vertical'))]
    for a in lamps:
        for b in bars:
            if tree(a).overlap(tree(b)): lamp_clashes.append((a.name,b.name))
    corner_clashes=[]
    corners=[o for o in K.PARTS if o.name.startswith(('car.grille.corner.slat.',
              'car.grille.formed.corner.frame.','car.grille.outer.corner.recess.'))]
    nose_shell=[o for o in K.PARTS if o.type=='MESH' and
                (o.name.startswith('car.front_fender.') and '.arch.' not in o.name or
                 o.name.startswith('car.hood.'))]
    corner_pairs=0
    for a in corners:
        for b in nose_shell:
            corner_pairs+=1
            hits=tree(a).overlap(tree(b))
            if hits:corner_clashes.append({'grille':a.name,'shell':b.name,'triangle_pairs':len(hits)})
    wheel_profiles=[]
    for end in ('front','rear'):
        for side,s in (('L',1),('R',-1)):
            prefix='car.wheel.'+end+'.'+side+'.'
            p,_=geometry(bpy.data.objects[prefix+'pierced.dished.hubcap'])
            axle=D.FRONT_AXLE if end=='front' else D.REAR_AXLE
            bed=[s*v.x-D.WHEEL_X for v in p if .129<math.hypot(v.y-axle,v.z-D.WHEEL_Z)<.180]
            lip,_=geometry(bpy.data.objects[prefix+'rolled.rim.bead'])
            lip_front=max(s*v.x-D.WHEEL_X for v in lip)
            wheel_profiles.append({'wheel':end+'.'+side,'lip_axial_m':lip_front,
                                   'bed_axial_max_m':max(bed),'minimum_dish_depth_m':lip_front-max(bed)})
    obj=bpy.data.objects['car.rear.Chevrolet.traced_stencil']
    points,_=geometry(obj)
    proud=[p.y-D.tail_surface_y(p.x,p.z) for p in points]
    return {'wheel_shell_pairs':checked,'wheel_shell_intersections':clashes,'headlamp_grille_intersections':lamp_clashes,
            'corner_shell_pairs':corner_pairs,'corner_shell_intersections':corner_clashes,
            'wheel_dish_profiles':wheel_profiles,
            'corner_protrusion_from_adjacent_lamp_m':D.fascia_y(D.LAMP_X[-1])-D.grille_y(1.007),
            'front_opening_top_m':max(z for y,z in D.FRONT_ARCH_POINTS),
            'rear_opening_top_m':max(z for y,z in D.REAR_ARCH_POINTS),
            'tyre_top_m':D.WHEEL_Z+D.TYRE_RADIUS,
            'clearance_basis':'actual wheel/body surfaces; upper tyres sit behind the fenders',
            'rear_badge_min_proud_m':min(proud),'rear_badge_max_proud_m':max(proud),
            'has_scaling_animation':any(curve.data_path=='scale' for o in K.NODES.values()
                                      if o.animation_data and o.animation_data.action and o.animation_data.action_slot
                                      for curve in anim_utils.action_ensure_channelbag_for_slot(o.animation_data.action,o.animation_data.action_slot).fcurves)}


def run():
    bpy.context.view_layer.update()
    shoulders=[]
    for obj in K.PARTS:
        if not obj.get('parametric_surface','').startswith('compound.'):continue
        bm=bmesh.new();bm.from_mesh(obj.data)
        field=bm.faces.layers.int.get('impala.surface.field')
        seam=[e for e in bm.edges if field and len(e.link_faces)==2 and
              {f[field] for f in e.link_faces}=={1,2}]
        shoulders.append({'part':obj.name,'shared_shoulder_edges':len(seam),
                          'open_shoulder_edges':sum(not e.is_manifold for e in seam)})
        bm.free()
    return {'topology':topology(),'clearance':clearances(),'continuous_shoulders':shoulders}
