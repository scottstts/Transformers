"""Full-size posterior castings rotate into the seat bases in car mode."""
from mathutils import Matrix
from . import kit as K, motion

SPECS={}


def carrier(name,bone,parts,span):
    key='robot.storage.'+name
    if key not in K.NODES:K.node(key)
    SPECS[key]={'bone':bone,'span':span,'stowed':K.rotation(z=180)}
    for obj in K.PARTS:
        if not parts(obj.name):continue
        obj.parent=K.NODES[key];obj.matrix_parent_inverse=Matrix.Identity(4)
        obj['storage_mechanism']='axial swivel into seat-base volume; constant full-size casting'


def build():
    SPECS.clear()
    carrier('pelvis.cover','pelvis',lambda name:name=='robot.pelvis.rear.differential.cover',(.13,.76))
    carrier('abdomen.dorsal','spine',lambda name:
            name=='robot.abdomen.segmented.dorsal.rails' or name.startswith('robot.abdomen.') and
            name.endswith(('longitudinal.oblique.ram','return.hose')),(.16,.77))
    for side in ('L','R'):
        prefix='robot.thigh.'+side+'.'
        carrier('thigh.dorsal.'+side,'thigh.'+side,lambda name,p=prefix,s=side:
                name.startswith(p) and (name.endswith(('rear.pierced.load.web','routed.hydraulic.line')) or
                                         '.longitudinal.ram.' in name) or
                name=='robot.armour.'+s+'.thigh.rear.gearcase',(.19,.79))
    return {'stowed_casting_carriers':len(SPECS)}


def worlds(t,core):
    return {name:core[spec['bone']]@K.transform((0,0,0),
             spec['stowed'].slerp(K.rotation(),motion.smooth(t,*spec['span'])))
            for name,spec in SPECS.items()}
