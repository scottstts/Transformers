"""Export the approved live .blend, including every baked redesign component.

Unlike export_game.py, this never rebuilds or reposes from procedural motion.
Run export_baked.export() in cybertruck-transformer-redesigned.blend.
"""
import copy
import json
import os
import bpy
import numpy as np
from mathutils import Matrix, Vector
from . import export as codec, rig


def export(out_dir=codec.OUT_DIR):
    scene = bpy.context.scene
    if not scene.get('ct_redesign_installed'):
        raise RuntimeError('Open the approved redesigned Blender file first')
    original_frame = scene.frame_current
    with open(os.path.join(out_dir, 'cybertruck.json')) as fh:
        previous = json.load(fh)
    scene.frame_set(240)
    meshes = [o for name in ('CAR','ROBOT','ROBOT_REDESIGN')
              for o in bpy.data.collections[name].objects if o.type == 'MESH']
    node_objects = set(bpy.data.collections['RIG'].objects)
    for o in meshes:
        if (o.animation_data and o.animation_data.action) or o.name.startswith('wheel'):
            node_objects.add(o)
        parent = o.parent
        while parent:
            node_objects.add(parent)
            parent = parent.parent

    def depth(o):
        return 0 if o.parent is None else 1 + depth(o.parent)
    ordered = sorted(node_objects, key=lambda o:(depth(o),o.name))
    index = {o:i for i,o in enumerate(ordered)}
    old_names = {n['name'] for n in previous['nodes']}
    records = []
    centers = {}
    groups = {o:[] for o in ordered}
    for o in ordered:
        if o.name.startswith('bone.'):
            name,kind = 'bone:'+o.name[5:],'bone'
        elif o.name.startswith('P.'):
            name,kind = 'asm:'+o.name[2:],'asm'
        elif o.name.startswith('wheel'):
            name,kind = 'wheel:'+o.name,'wheel'
            centers[o] = sum((Vector(v) for v in o.bound_box),Vector())/8
        else:
            name = ('lift:' if 'lift:'+o.name in old_names else 'part:')+o.name
            kind = 'lift' if name.startswith('lift:') else 'part'
        records.append(dict(name=name,parent=index.get(o.parent,-1),kind=kind,meshes=[]))
    for o in meshes:
        if o in index:
            M = Matrix.Translation(-centers[o]) if o in centers else Matrix.Identity(4)
            groups[o].append((o,M))
        else:
            # All unanimated child geometry remains on its existing mechanism.
            owner = o.parent
            groups[owner].append((o,owner.matrix_world.inverted() @ o.matrix_world))

    blob = codec.Blob()
    triangles = 0
    for owner, objects in groups.items():
        combined = {}
        for o,M in objects:
            for slot,(P,N,I) in codec._mesh_arrays(o,M).items():
                if slot in combined:
                    p,n,i = combined[slot]
                    P,N,I = np.concatenate((p,P)),np.concatenate((n,N)),np.concatenate((i,I+len(p)))
                combined[slot] = P,N,I
        for slot,(P,N,I) in sorted(combined.items()):
            lo,hi = P.min(0),P.max(0)
            q = np.round((P-lo)/np.maximum(hi-lo,1e-6)*65535-32768).astype(np.int16)
            wide = len(P)>=65536
            idx = I.astype(np.uint32 if wide else np.uint16)
            records[index[owner]]['meshes'].append(dict(material=slot,count=len(P),triangles=len(I),
                min=lo.tolist(),max=hi.tolist(),position=blob.add(q),normal=blob.add(codec._oct(N)),
                index=blob.add(idx.reshape(-1)),index32=wide))
            triangles += len(I)

    tracks = np.zeros((241,len(ordered),7),np.float32)
    scales = np.ones((241,len(ordered),3),np.float32)
    max_error = 0
    for frame in range(241):
        scene.frame_set(frame)
        worlds = {o:o.matrix_world @ Matrix.Translation(centers[o]) if o in centers else o.matrix_world.copy() for o in ordered}
        reconstructed = {}
        for i,o in enumerate(ordered):
            local = worlds[o.parent].inverted() @ worlds[o] if o.parent else worlds[o]
            t,q,s = local.decompose()
            if frame and np.dot(tracks[frame-1,i,3:],(q.x,q.y,q.z,q.w))<0:
                q.negate()
            tracks[frame,i] = (*t,q.x,q.y,q.z,q.w)
            scales[frame,i] = s
            m = Matrix.LocRotScale(t,q,s)
            reconstructed[o] = reconstructed[o.parent] @ m if o.parent else m
            max_error = max(max_error,max(abs(reconstructed[o][r][c]-worlds[o][r][c]) for r in range(4) for c in range(4)))
    assert max_error < .0001, ('Unrepresentable matrix',max_error)
    assert np.isfinite(tracks).all() and np.isfinite(scales).all()
    # Separate the final sole clearance from the root so the runtime can hand
    # off to its live skeleton without a vertical offset. Adding it as lift
    # preserves every exported world pose exactly, including car mode.
    pelvis_index = next(i for i,n in enumerate(records) if n['name']=='bone:pelvis')
    ground = float(tracks[-1,pelvis_index,2] - (previous['rig']['dims']['hipZ']-previous['rig']['dims']['crouch']))
    for i,record in enumerate(records):
        if record['parent']<0:
            tracks[:,i,2] -= ground
    track_offset = blob.add(tracks.reshape(-1))
    scale_offset = blob.add(scales.reshape(-1))
    lift_offset = blob.add(np.full(241,ground,np.float32))
    skel = rig.Skeleton()
    rig_data = copy.deepcopy(previous['rig'])
    rig_data['stand'] = {}
    for name in skel.names:
        o = bpy.data.objects['bone.'+name]
        t,q,_ = o.matrix_basis.decompose()
        slide = t-skel.offset[name]
        rig_data['stand'][name] = [q.x,q.y,q.z,q.w,*slide]
    rig_data['dims'].update(stanceX=.59,armAbduct=14,duration=8)

    # Derive actuation windows from the actual baked motion, rather than the
    # superseded procedural choreography. Suppress tiny/duplicate strut sounds.
    events=[]
    for i,record in enumerate(records):
        if record['kind']=='wheel' or '.rod' in record['name'] or '.barrel' in record['name']:
            continue
        changes=np.max(np.abs(np.diff(tracks[:,i,:],axis=0)),axis=1)
        active=np.flatnonzero(changes>0.0002)
        if len(active):
            name=record['name']
            events.append(dict(name=name,kind='joint' if record['kind']=='bone' else 'hydraulic',
                t0=float(active[0]/240),t1=float((active[-1]+1)/240),size=.2,amount=1,
                side=1 if name.endswith('.L') else -1 if name.endswith('.R') else 0))
    manifest=dict(version=1,frames=241,nodes=records,tracks=track_offset,scales=scale_offset,
                  lift=lift_offset,rig=rig_data,events=sorted(events,key=lambda e:e['t0']),triangles=triangles)
    data=blob.bytes()
    for node in records:
        assert node['parent']<records.index(node)
    with open(os.path.join(out_dir,'cybertruck.bin'),'wb') as fh:
        fh.write(data)
    with open(os.path.join(out_dir,'cybertruck.json'),'w') as fh:
        json.dump(manifest,fh,separators=(',',':'))
    scene.frame_set(original_frame)
    print('Baked export:',len(records),'nodes;',triangles,'triangles;',round(len(data)/1e6,2),'MB')
    print('241-frame hierarchy reconstruction max error:',max_error)
    return manifest
