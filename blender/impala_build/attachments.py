"""Rigid panel anchor frames. Physical car dimensions are retained in robot mode."""
from mathutils import Matrix
from . import kit as K,contract as D,car,body

SPECS={}


def define(name,bone,source,target,rotation,start=.10,end=.78):
    SPECS[name]={'bone':bone,'source':source,'target':target,'rotation':rotation,'span':(start,end)}


def definitions():
    SPECS.clear()
    define('hood.front','chest',(0,D.NOSE,.850),(0,-.485,.410),K.rotation(x=9),.05,.66)
    hinge=(0,-1.795,D.hood_height(0,-1.795))
    define('hood.rear','chest',hinge,(0,.197,.804),K.rotation(x=-72),.18,.72)
    define('nose','chest',(0,D.fascia_y(0),.724),(0,-.470,.298),K.rotation(x=6),.06,.55)
    define('front_bumper','chest',(0,D.fascia_y(0)-.100,.545),(0,-.567,.103),K.rotation(x=6),.08,.58)
    define('roof','chest',(0,.15,1.350),(.440,.330,-.250),K.rotation(x=-90),.20,.85)
    define('windshield','chest',(0,-.620,1.110),(0,.230,.380),K.rotation(x=-90),.12,.76)
    define('rear_screen','chest',(0,1.044,1.260),(0,.850,.635),K.rotation(x=-70),.22,.81)
    define('trunk','chest',(0,2.100,1.0),(0,.250,-.050),K.rotation(x=-90),.24,.86)
    define('tail','chest',(0,D.TAIL,.650),(0,.840,.250),K.rotation(),.25,.82)
    define('rear_bumper','chest',(0,D.TAIL,.440),(0,.834,.040),K.rotation(),.25,.85)
    define('floor','chest',(0,.20,.340),(0,.460,.080),K.rotation(x=90),.28,.79)
    for zone,y,z,back,angle in (('front',-1.30,-.20,.270,-90),('middle',.10,-.10,.350,-90),('rear',1.43,-.20,.430,-90)):
        define('floor.'+zone,'chest',(0,y,.340),(.428,back,z),K.rotation(x=angle),.20,.88)
    define('engine','chest',(0,-1.595,.370),(0,.325,.245),K.rotation(x=90),.18,.73)
    define('driveline','chest',(0,.455,.270),(0,.375,-.310),K.rotation(x=90),.24,.87)
    define('dashboard','chest',(0,-.650,.885),(0,.190,.530),K.rotation(x=-90),.12,.67)
    define('front_bench','chest',(0,-.050,.750),(0,.490,-.350),K.rotation(x=90),.17,.73)
    define('rear_bench','chest',(0,.900,.750),(0,.590,-.365),K.rotation(x=90),.22,.79)
    for side,s in (('L',1),('R',-1)):
        for part in ('front_fender','wheel.front'):
            define(part+'.'+side,'shin.'+side,(s*1.0,D.FRONT_AXLE,.750),
                   (s*.350,-.300,-.730),K.rotation(z=-s*6)@K.rotation(x=90),.04,.68)
        for part in ('rear_fender','wheel.rear'):
            define(part+'.'+side,'shoulder.'+side,(s*1.0,D.REAR_AXLE,.350),
                   (s*.180,.175,-.130),K.rotation(x=-90),.03,.70)
        define('front_door.'+side,'shoulder.'+side,(s*.990,-.254,.780),
               (s*.190,-.285,-.210),K.rotation(y=-s*18)@K.rotation(z=-s*60)@K.rotation(x=-90),.02,.78)
        define('rear_door.'+side,'forearm.'+side,(s*.990,.733,.780),
               (s*.210,-.070,-.550),K.rotation(z=-s*73)@K.rotation(x=-90),.08,.78)
        for end,door in (('front','front_door.'+side),('rear','rear_door.'+side)):
            spec=SPECS[door]
            target=list(spec['target'])
            if end=='front':target[2]+=.005
            else:
                from mathutils import Vector
                target=Vector(target)+spec['rotation']@Vector((0,0,-.410))
            define('window.'+end+'.'+side,spec['bone'],spec['source'],target,spec['rotation'],.17,.77)
        define('axle.front.'+side,'shin.'+side,(s*.765,D.FRONT_AXLE,D.WHEEL_Z),
               (s*.045,.468,-.790),K.rotation(y=s*90),.32,.73)
        define('axle.rear.'+side,'shoulder.'+side,(s*.75,D.REAR_AXLE,D.WHEEL_Z),
               (s*.080,.365,-.035),K.rotation(y=-s*90),.12,.76)
    missing=set(car.ASSEMBLIES)-set(SPECS)
    if missing:raise RuntimeError('Unmapped car carriers: '+str(sorted(missing)))
    return SPECS


def final_relative(spec):
    return K.transform(spec['target'],spec['rotation'])@Matrix.Translation(tuple(-x for x in spec['source']))
