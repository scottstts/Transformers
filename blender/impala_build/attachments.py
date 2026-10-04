"""Rigid panel anchor frames. Physical car dimensions are retained in robot mode."""
from mathutils import Matrix
from . import kit as K,contract as D,car,body

SPECS={}


def define(name,bone,source,target,rotation,start=.10,end=.78,keys=None):
    """keys: intermediate (pivot, rotation) waypoints in the bone frame."""
    SPECS[name]={'bone':bone,'source':source,'target':target,'rotation':rotation,'span':(start,end),'keys':keys}


# The car front (hood, grille, bumper) travels as one unit in the chest frame.
# It starts standing past the top of the lying robot's head and moves clear
# while the rear hood stamp folds under it; it then turns level over the head,
# drops face-down well in front of the face, rotates level below the chin and
# slides onto the chest. Neither stamp crosses the head.
HOOD_KEYS=[((0,.100,3.000),K.rotation(x=-90)),
           ((0,-1.250,2.000),K.rotation()),
           ((0,-1.150,.640),K.rotation(x=90)),
           ((0,-1.050,.410),K.rotation(x=9))]


def definitions():
    SPECS.clear()
    define('hood.front','chest',(0,D.NOSE,.850),(0,-.485,.410),K.rotation(x=9),.06,.84,HOOD_KEYS)
    hinge=(0,-1.795,D.hood_height(0,-1.795))
    define('hood.rear','chest',hinge,(0,.197,.804),K.rotation(x=-72),.18,.72)
    define('nose','chest',(0,D.fascia_y(0),.724),(0,-.470,.298),K.rotation(x=6),.06,.55)
    define('front_bumper','chest',(0,D.fascia_y(0)-.100,.545),(0,-.567,.103),K.rotation(x=6),.08,.58)
    # Chest-carried panels keep their car orientation in the chest frame (the
    # lying robot's back carries them flat); they fold on real hinges and
    # slide straight in, with no free rotation in transit.
    define('roof','chest',(0,.15,1.350),(0,.300,-.550),K.rotation(x=-90),.44,.85)
    define('windshield','chest',(0,-.620,1.110),(0,.230,.120),K.rotation(x=-90),.12,.76)
    define('rear_screen','chest',(0,1.044,1.260),(0,.850,.635),K.rotation(x=-70),.22,.81)
    define('trunk','chest',(0,2.100,1.0),(0,.250,-.050),K.rotation(x=-90),.24,.86)
    define('tail','chest',(0,D.TAIL,.650),(0,.840,.250),K.rotation(),.25,.82)
    define('rear_bumper','chest',(0,D.TAIL,.440),(0,.834,.040),K.rotation(),.25,.85)
    define('floor','chest',(0,.20,.340),(0,.460,.080),K.rotation(x=90),.28,.79)
    for zone,y,back,z in (('front',-1.30,.050,-.450),('middle',.10,.150,-.300),('rear',1.43,.250,-.450)):
        define('floor.'+zone,'chest',(0,y,.340),(0,back,z),K.rotation(x=-90),.42 if zone=='front' else .20,.88)
    # Fold both front pans, then slide them into separate depth layers inside
    # the back assembly. Their full width nests behind the folded trunk lid.
    for side,s in (('L',1),('R',-1)):
        define('floor.front.pan.'+side,'chest',(s*.428,-.400,.340),
               (0,.420 if side=='L' else .580,.380),K.rotation(x=-90),.42,.88)
    # The engine stays under the hood: it rides with the car front unit.
    define('engine','chest',(0,-1.595,.370),(0,.325,.245),K.rotation(x=90),.14,.78)
    # The propeller shaft folds in half at its centre joint and docks inside
    # the torso; nothing hangs below the pelvis.
    define('driveline','chest',(0,.455,.270),(0,.300,-.550),K.rotation(x=-90),.24,.87)
    define('dashboard','chest',(0,-.650,.885),(0,.190,.250),K.rotation(x=-90),.12,.67)
    # Keep the overlapping bench layout, with a 4 mm depth stagger so the
    # upholstery's flat end surfaces do not share the rear bench's planes.
    define('front_bench','chest',(0,-.050,.750),(0,.424,.250),K.rotation(x=-90),.17,.73)
    define('rear_bench','chest',(0,.900,.750),(0,.420,-.450),K.rotation(x=-90),.22,.79)
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
