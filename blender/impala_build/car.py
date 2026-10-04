"""One articulated reference model; every component has a rigid carrier from birth."""
from . import kit as K, body, front, rear, wheels, cabin, interior, underbody

ASSEMBLIES={}


def build(reuse_nodes=False):
    ASSEMBLIES.clear()
    names=['hood.front','hood.rear','nose','front_bumper','trunk','tail','rear_bumper',
           'roof','windshield','rear_screen','floor','floor.front','floor.middle','floor.rear',
           'engine','driveline','dashboard','front_bench','rear_bench']
    for side in ('L','R'):
        names.extend(part+'.'+side for part in ('front_fender','front_door','rear_door','rear_fender'))
        names.extend('wheel.'+end+'.'+side for end in ('front','rear'))
        names.extend('axle.'+end+'.'+side for end in ('front','rear'))
        names.extend('window.'+end+'.'+side for end in ('front','rear'))
    for name in names:
        if not reuse_nodes or name not in K.NODES:K.node(name)
        source=(0,0,-.410) if name.startswith('window.') else (0,0,0)
        ASSEMBLIES[name]={'source':source,'construction':'rigid, full physical dimensions'}
        if name.startswith('window.'):K.NODES[name].matrix_basis=K.transform(source)
    start=len(K.PARTS)
    body.build()
    front.build()
    wheels.build()
    cabin.build()
    interior.build()
    rear.build()
    underbody.build()
    K.finalize(K.PARTS[start:])
    body.finish_normals()
    return ASSEMBLIES
