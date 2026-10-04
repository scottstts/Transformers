"""Car-mode concealment measured against opaque car geometry, including glass views."""
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from . import kit as K,stowage,linkage,motion


def opaque_tree():
    vertices=[];faces=[]
    deps=bpy.context.evaluated_depsgraph_get()
    for obj in K.PARTS:
        if not obj.name.startswith('car.') or obj.type!='MESH':continue
        evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh();base=len(vertices)
        opaque=[]
        for material in mesh.materials:
            shader=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if material and material.use_nodes else None
            opaque.append(shader is None or shader.inputs['Transmission Weight'].default_value<.5)
        vertices.extend(obj.matrix_world@v.co for v in mesh.vertices)
        faces.extend(tuple(base+i for i in p.vertices) for p in mesh.polygons
                     if not opaque or opaque[p.material_index])
        evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(vertices,faces)


def views():
    exterior=[Vector((x,y,z)) for x,y in ((4,-4),(-4,-4),(4,4),(-4,4),(4,0),(-4,0),(0,-5),(0,5))
              for z in (.12,.70,1.60)]
    exterior.extend(Vector((x,y,-1.5)) for x in (-1.2,0,1.2) for y in (-2,0,2))
    exterior.extend(Vector((x,y,4)) for x in (-2,0,2) for y in (-2,0,2))
    cabin=[Vector((x,y,z)) for x in (-.75,0,.75) for y in (-.55,.30,1.20) for z in (.75,1.10)]
    return {'exterior':exterior,'cabin':cabin}


def run(limit=160):
    scene=bpy.context.scene;old=scene.frame_current;scene.frame_set(0)
    try:
        car=opaque_tree();eyes=views();exposed={name:[] for name in eyes}
        outside=[];minimum=9;robot_parts=0
        for obj in K.PARTS:
            if obj.type!='MESH' or not obj.name.startswith('robot.'):continue
            robot_parts+=1
            points=[obj.matrix_world@v.co for v in obj.data.vertices]
            minimum=min(minimum,min(p.z for p in points))
            spec=stowage.SPECS.get(obj.parent.name[5:],{}) if obj.parent else {}
            if spec.get('compartment')=='cushion':
                lo,hi=stowage.CONCEALED_BOXES[spec['box_index']]
                if any(any(p[i]<lo[i]-.0001 or p[i]>hi[i]+.0001 for i in range(3)) for p in points):outside.append(obj.name)
            elif obj.name.startswith('robot.linkage.'):
                name=obj.name[len('robot.linkage.'):].rsplit('.stage.',1)[0].rsplit('.pin.',1)[0]
                lo,hi=stowage.CONCEALED_BOXES[linkage.LINKS[name]['box_index']]
                if any(any(p[i]<lo[i]-.0001 or p[i]>hi[i]+.0001 for i in range(3)) for p in points):outside.append(obj.name)
            sampled=points[::max(1,len(points)//limit)]
            for kind,origins in eyes.items():
                for eye in origins:
                    if any(car.ray_cast(eye,(p-eye).normalized(),max(0,(p-eye).length-.0001))[0] is None for p in sampled):
                        exposed[kind].append(obj.name);break
        scene.frame_set(motion.FRAMES)
        incomplete=[o.name for o in K.PARTS if o.name.startswith('robot.') and
                    (max(abs(s-1) for s in o.matrix_world.to_scale())>.00001 or o.hide_render or o.hide_get())]
        return {'robot_parts':robot_parts,'outside_concealed_volumes':outside,
                'unoccluded_samples':exposed,'robot_min_z_car':round(minimum,5),
                'incomplete_robot_parts':incomplete,'views':{name:len(v) for name,v in eyes.items()}}
    finally:scene.frame_set(old)
