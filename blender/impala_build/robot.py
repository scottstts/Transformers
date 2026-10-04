"""Shared Impala mechanical core. Actual car panels remain its outer armor."""
import bpy
import bmesh
from . import kit as K,rig,robot_geometry as M,head,robot_torso,robot_arms,robot_legs,robot_armour,storage


def hydrate():
    K.NODES={o.name[5:]:o for o in bpy.data.objects if o.get('impala_build') and o.name.startswith('bone.')}
    K.PARTS=[o for o in bpy.data.objects if o.get('impala_build') and o.type=='MESH' and o.name.startswith(('car.','robot.'))]
    K.materials();M.materials()


def remove(prefix):
    for obj in list(K.PARTS):
        if not obj.name.startswith(prefix):continue
        data=obj.data;K.PARTS.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
        if data and data.users==0:bpy.data.meshes.remove(data)


def build():
    hydrate();remove('robot.');rig.create();start=len(K.PARTS)
    head.build();robot_torso.build();robot_arms.build();robot_legs.build();robot_armour.build()
    from . import robot_refit
    robot_refit.limb_details();robot_refit.torso_internals();robot_refit.proportions();storage.build()
    K.finalize(K.PARTS[start:])
    return topology()


def rebuild_head():
    """Replace only the head, cervical mechanics and collar on existing carriers.

    Retain the baked rig and storage parenting; a head edit must not reset the
    whole robot's pose or leave the replacement outside the stowage animation.
    """
    from . import robot_refit
    hydrate()
    def scoped(o):
        return (o.name.startswith(('robot.head.','robot.neck.','robot.chest.collar.')) or
                o.name=='robot.chest.cast.cervical.cradle' or
                o.name.startswith('robot.chest.') and any(t in o.name for t in
                    ('.solid.gorget.guard','.gorget.rolled.rim','.collar.')))
    carriers={}
    for o in K.PARTS:
        if not scoped(o):continue
        source=o.get('storage_original_parent',o.parent.name[5:] if o.parent else '')
        carriers[source]=(o.parent,o.matrix_parent_inverse.copy(),o.matrix_basis.copy(),
                          o.get('storage_compartment'))
    for o in list(K.PARTS):
        if scoped(o):
            data=o.data;K.PARTS.remove(o);bpy.data.objects.remove(o,do_unlink=True)
            if data.users==0:bpy.data.meshes.remove(data)
    start=len(K.PARTS);head.build();robot_refit.collar()
    parts=K.PARTS[start:];K.finalize(parts)
    for o in parts:
        source=o.parent.name[5:]
        if source in carriers:
            parent,inverse,basis,compartment=carriers[source]
            o.parent=parent;o.matrix_parent_inverse=inverse;o.matrix_basis=basis
            if compartment:
                o['storage_original_parent']=source;o['storage_compartment']=compartment
    bpy.context.view_layer.update()
    return {'replaced_parts':len(parts),'head_topology':topology('robot.head.','robot.neck.')}


def topology(*prefixes):
    prefixes=prefixes or ('robot.',);issues=[];parts=triangles=0
    for obj in K.PARTS:
        if not obj.name.startswith(prefixes):continue
        parts+=1;triangles+=sum(len(p.vertices)-2 for p in obj.data.polygons)
        bm=bmesh.new();bm.from_mesh(obj.data)
        boundary=sum(not e.is_manifold for e in bm.edges)
        zero=sum(f.calc_area()<1e-12 for f in bm.faces)
        loose=sum(not v.link_faces for v in bm.verts);volume=bm.calc_volume(signed=True)
        if boundary or zero or loose or volume<=0:
            issues.append({'part':obj.name,'non_manifold':boundary,'degenerate':zero,'loose':loose,'volume':volume})
        bm.free()
    return {'parts':parts,'triangles':triangles,'issues':issues}
