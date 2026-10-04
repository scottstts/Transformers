"""Rigid robot joint frames. +X left, -Y forward, +Z up, in metres."""
import bpy
from mathutils import Matrix,Vector,Quaternion
from . import kit as K

ROBOT_Y=-1.620
HIP_Z=3.030
THIGH=1.250
SHIN=1.360
UPPER=1.080
FORE=1.020
HEAD_Z=5.150
FINGERS=('index','middle','ring','pinky')
PHAL=(.105,.075,.055)
DEFS=[]


def definitions():
    rows=[('pelvis',None,(0,ROBOT_Y,HIP_Z)),('spine','pelvis',(0,-.05,.350)),
          ('chest','spine',(0,-.08,.670)),('neck','chest',(0,.155,.880)),
          ('head','neck',(0,0,.075))]
    for side,s in (('L',1),('R',-1)):
        rows += [('hip.'+side,'pelvis',(s*.470,0,0)),('thigh.'+side,'hip.'+side,(0,0,0)),
                 ('shin.'+side,'thigh.'+side,(0,0,-THIGH)),('foot.'+side,'shin.'+side,(0,0,-SHIN)),
                 ('toe.'+side,'foot.'+side,(0,-.220,-.290)),
                 ('clav.'+side,'chest',(s*.390,0,.820)),
                 ('shoulder.'+side,'clav.'+side,(s*.780,0,0)),
                 ('upperarm.'+side,'shoulder.'+side,(0,0,0)),
                 ('forearm.'+side,'upperarm.'+side,(0,0,-UPPER)),
                 ('hand.'+side,'forearm.'+side,(0,0,-FORE))]
        for i,name in enumerate(FINGERS):
            rows.append((name+'1.'+side,'hand.'+side,(-s*(i-1.5)*.085,0,-.265)))
            rows.append((name+'2.'+side,name+'1.'+side,(0,0,-PHAL[0])))
            rows.append((name+'3.'+side,name+'2.'+side,(0,0,-PHAL[1])))
        rows += [('thumb1.'+side,'hand.'+side,(-s*.169,.020,-.112)),
                 ('thumb2.'+side,'thumb1.'+side,(0,0,-.090)),
                 ('thumb3.'+side,'thumb2.'+side,(0,0,-.065))]
    return rows


def worlds(pose=None):
    pose=pose or {};out={}
    for name,parent,offset in definitions():
        rotation,slide=pose.get(name,(Quaternion(),Vector()))
        local=Matrix.Translation(Vector(offset)+slide)@rotation.to_matrix().to_4x4()
        out[name]=(out[parent]@local) if parent else local
    return out


def create():
    global DEFS
    DEFS=definitions();rest=worlds()
    for name,parent,offset in DEFS:
        key='robot.'+name
        if key not in K.NODES:K.node(key)
        obj=K.NODES[key]
        obj.parent=K.NODES['robot.'+parent] if parent else None
        obj.matrix_parent_inverse=Matrix.Identity(4)
        obj.matrix_basis=(rest[parent].inverted()@rest[name]) if parent else rest[name]
        obj['rig_role']='articulated robot joint; rigid unit scale'
    return rest


def apply(worlds):
    for name,parent,offset in definitions():
        obj=K.NODES['robot.'+name]
        obj.matrix_basis=worlds[parent].inverted()@worlds[name] if parent else worlds[name]
        obj.scale=(1,1,1)
    bpy.context.view_layer.update()
