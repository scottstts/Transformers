"""Physical subpanel hinges; the cut stampings exactly reassemble in car mode."""
import bpy
import bmesh
from mathutils import Matrix,Vector
from . import kit as K,body,motion

SPECS={}


def hinge(name,parent,point,angle,span=(.35,.85),slide=(0,0,0)):
    SPECS[name]={'parent':parent,'point':Vector(point),'angle':angle,
                 'span':span,'slide':Vector(slide)}
    if name not in K.NODES:K.node(name)


def cut_object(obj,axis,value,low_name,high_name):
    """Bisect a closed physical stamping and cap only its new section edges."""
    coordinates=[v.co[axis] for v in obj.data.vertices]
    if min(coordinates)>=value-1e-7:
        obj.parent=K.NODES[high_name];obj.matrix_parent_inverse=Matrix.Identity(4)
        return
    if max(coordinates)<=value+1e-7:
        obj.parent=K.NODES[low_name];obj.matrix_parent_inverse=Matrix.Identity(4)
        return
    normal=Vector((0,0,0));normal[axis]=1;point=normal*value
    original=obj.data;copies=[]
    for low,node in ((True,low_name),(False,high_name)):
        mesh=original.copy();bm=bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                              dist=1e-8,plane_co=point,plane_no=normal,
                              clear_outer=low,clear_inner=not low)
        edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co[axis]-value)<2e-6 for v in e.verts)]
        if edges:
            caps=bmesh.ops.holes_fill(bm,edges=edges,sides=0)['faces']
            field=bm.faces.layers.int.get('impala.surface.field')
            for face in caps:
                face.smooth=False
                if field:face[field]=0
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.0000002)
        loose=[v for v in bm.verts if not v.link_faces]
        if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
        bm.to_mesh(mesh);bm.free();mesh.update()
        replacement=bpy.data.objects.new(obj.name+('.folded' if node!=obj.parent.name[5:] else '.fixed'),mesh)
        for collection in obj.users_collection:collection.objects.link(replacement)
        for key,val in obj.items():replacement[key]=val
        replacement['stamp_normals_valid']=False
        replacement['subpanel_section_m']=value;replacement['subpanel_section_axis']=axis
        replacement['mechanism']='capped rigid stamping with shared closed section hinge'
        replacement.parent=K.NODES[node];replacement.matrix_parent_inverse=Matrix.Identity(4)
        copies.append(replacement)
    K.PARTS.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
    if original.users==0:bpy.data.meshes.remove(original)
    K.PARTS.extend(copies)


def carrier_cut(parent,name,axis,value,point,angle,low=True,span=(.35,.85)):
    hinge(name,parent,point,angle,span)
    for obj in list(K.PARTS):
        if obj.type=='MESH' and obj.parent==K.NODES[parent]:
            cut_object(obj,axis,value,name if low else parent,parent if low else name)


def build():
    SPECS.clear()
    for side,s in (('L',1),('R',-1)):
        carrier_cut('front_door.'+side,'fold.door.lower.'+side,2,.730,
                    (s*.990,-.254,.730),(0,s*55,0),span=(.27,.81))
        carrier_cut('rear_door.'+side,'fold.gauntlet.lower.'+side,2,.735,
                    (s*.990,.733,.735),(0,s*77,0),span=(.30,.85))
        carrier_cut('front_fender.'+side,'fold.fender.nose.'+side,1,-1.970,
                    (s*.992,-1.970,.690),(-178,0,0),span=(.38,.84))
        carrier_cut('rear_fender.'+side,'fold.quarter.tail.'+side,1,1.990,
                    (s*.993,1.990,.810),(178,0,0),low=False,span=(.24,.78))
        # Upholstery stays bonded to its corresponding door stamping. Moving
        # the upper card onto the lower hinge detached it from its own panel.
        # The A-pillars travel with the windshield instead of protruding from
        # the folded roof. The sail portion of each drip rail follows the sail.
        for obj in K.PARTS:
            if obj.name in ('car.hardtop.A.pillar.'+side,'car.A.pillar.window.trim.'+side):
                obj.parent=K.NODES['windshield'];obj.matrix_parent_inverse=Matrix.Identity(4)
        obj=bpy.data.objects.get('car.hardtop.drip.molding.'+side)
        if obj and obj in K.PARTS:cut_object(obj,1,.593,'roof','rear_screen')
        mirror='fold.mirror.'+side
        hinge(mirror,'front_door.'+side,(s*.956,-.418,1.026),(0,s*102,0),(.20,.69))
        for obj in K.PARTS:
            if obj.name in ('car.front_door.mirror.housing.'+side,'car.front_door.mirror.face.'+side):
                obj.parent=K.NODES[mirror];obj.matrix_parent_inverse=Matrix.Identity(4)
    # Fold transverse cabin furniture and chassis skins around a central
    # knuckle. Their actual widths nest inside the backpack, rather than
    # presenting full-width seat backs or floor slabs as robot armor.
    for part,y in (('front_bench',-.050),('rear_bench',.900)):
        left='fold.'+part+'.L';right='fold.'+part+'.R'
        # The mirrored halves nest in one volume; a small axial offset keeps
        # their coincident faces apart.
        hinge(left,part,(0,y,.750),(0,0,90),(.31,.87),(0,0,.002))
        hinge(right,part,(0,y,.750),(0,0,-90),(.31,.87),(0,0,-.002))
        for obj in list(K.PARTS):
            if obj.type=='MESH' and obj.parent==K.NODES[part]:cut_object(obj,0,0,right,left)
    for zone,y in (('front',-1.300),('middle',.100),('rear',1.430)):
        part='floor.'+zone;left='fold.'+part+'.L';right='fold.'+part+'.R'
        # Mirror-image book fold on a centre line just under the pan.
        hinge(left,part,(0,y,.290),(0,90,0),(.30,.80))
        hinge(right,part,(0,y,.290),(0,-90,0),(.30,.80))
        for obj in list(K.PARTS):
            if obj.type=='MESH' and obj.parent==K.NODES[part]:cut_object(obj,0,0,right,left)
        for node in (left,right):
            carrier_cut(node,node+'.end',1,y,(0,y,.340),(178,0,0),low=False,span=(.24,.74))
    # The tailpipes run past the folded floor ends and would stand above the
    # shoulders. Their tails flip back down onto the pipe, pivoting on its top
    # surface so the two runs stay in contact through the whole turn.
    for side in ('L','R'):
        end='fold.floor.rear.%s.end'%side;tail='fold.exhaust.tail.'+side
        hinge(tail,end,(0,2.150,.382),(178,0,0),(.30,.80))
        for obj in list(K.PARTS):
            if obj.type=='MESH' and obj.name.startswith('car.exhaust.') and obj.parent in (K.NODES[end],K.NODES[tail]):
                cut_object(obj,1,2.150,end,tail)
    # Both roof halves close like a book on the centre line, mirror images of
    # each other; neither half flips over the other.
    carrier_cut('driveline','fold.driveline.aft',1,.425,(0,.425,.322),(178,0,0),low=False,span=(.20,.42))
    hinge('fold.roof.L','roof',(0,.150,1.350),(0,90,0),(.35,.80))
    hinge('fold.roof.R','roof',(0,.150,1.350),(0,-90,0),(.35,.80))
    for obj in list(K.PARTS):
        if obj.type=='MESH' and obj.parent==K.NODES['roof']:cut_object(obj,0,0,'fold.roof.R','fold.roof.L')
    for node in ('fold.roof.L','fold.roof.R'):
        carrier_cut(node,node+'.aft',1,.15,(0,.15,1.350),(178,0,0),low=False,span=(.25,.74))
    carrier_cut('trunk','fold.trunk.aft',1,2.1,(0,2.1,1.0),(178,0,0),low=False,span=(.35,.51))
    # The tank and its cradle are bolted to the tail panel and ride the rear
    # module rigidly; the module sets down on the tank's skid.
    hinge('fold.fuel_tank','tail',(0,2.040,.305),(0,0,0),(.30,.50))
    for obj in K.PARTS:
        if obj.name.startswith('car.fuel.tank.'):
            obj.parent=K.NODES['fold.fuel_tank'];obj.matrix_parent_inverse=Matrix.Identity(4)
    # Three fixed-length aerial sections telescope into the fender well.
    aerial=bpy.data.objects.get('car.passenger.fender.telescopic.antenna')
    x=-.896
    hinge('fold.aerial.middle','front_fender.R',(x,-.752,1.021),(0,0,0),(.06,.30),(0,0,-.290))
    hinge('fold.aerial.tip','front_fender.R',(x,-.752,1.021),(0,0,0),(.05,.29),(0,0,-.590))
    if aerial and aerial in K.PARTS:
        cut_object(aerial,2,1.321,'front_fender.R','fold.aerial.middle')
        for obj in list(K.PARTS):
            if obj.name.startswith('car.passenger.fender.telescopic.antenna') and obj.parent==K.NODES['fold.aerial.middle']:
                cut_object(obj,2,1.641,'fold.aerial.middle','fold.aerial.tip')
    body.finish_normals()
    return {'hinged_subpanels':len(SPECS),'car_parts':sum(o.name.startswith('car.') for o in K.PARTS)}


def worlds(t,core,panels):
    out={}
    for name,spec in SPECS.items():
        u=motion.smooth(t,*spec['span']);point=spec['point']
        q=K.rotation(*[u*angle for angle in spec['angle']])
        relative=Matrix.Translation(point+spec['slide']*u)@q.to_matrix().to_4x4()@Matrix.Translation(-point)
        parent=out[spec['parent']] if spec['parent'] in out else panels[spec['parent']]
        out[name]=parent@relative
    return out
