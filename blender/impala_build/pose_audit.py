"""Exact posed ground bounds and fixed dimensions, independent of view lighting."""
import bpy
import numpy as np
from . import kit as K,motion


def vertices():
    out={}
    for obj in K.PARTS:
        if obj.type!='MESH':continue
        co=np.empty(len(obj.data.vertices)*3);obj.data.vertices.foreach_get('co',co)
        out[obj]=co.reshape(-1,3)
    return out


def ground(frames=(0,24,48,68,88,112,136,160,184,208,240)):
    scene=bpy.context.scene;old=scene.frame_current;points=vertices();rows=[]
    try:
        for frame in frames:
            scene.frame_set(frame);bpy.context.view_layer.update();lowest=[]
            for obj,co in points.items():
                m=np.array(obj.matrix_world)
                z=co@m[2,:3]+m[2,3]
                lowest.append((float(z.min()),obj.name))
            lowest.sort()
            rows.append({'frame':frame,'min_z':round(lowest[0][0],5),
                         'lowest_parts':[(round(z,5),name) for z,name in lowest[:5]],
                         'penetrating':[(round(z,4),name) for z,name in lowest if z<-.008]})
    finally:scene.frame_set(old)
    return rows


def fixed_dimensions():
    maximum=0;worst=None
    for frame in range(motion.FRAMES+1):
        w=motion.core_worlds(frame/motion.FRAMES)
        for name,matrix in w.items():
            error=max(abs(v-1) for v in matrix.to_scale())
            if error>maximum:maximum=error;worst=(frame,name)
    return {'max_scale_error':maximum,'worst':worst,
            'joint_lengths':[motion.joint_report(t) for t in (0,.25,.5,.75,1)]}
