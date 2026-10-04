"""Open truss torso, nested abdominal plates, pelvic yoke and articulated shoulders."""
import math
from . import kit as K,geometry as G,robot_geometry as M


def chest():
    # Most of the chest's finished front is the actual car nose. The supporting
    # load cage stays open so rods, pivots and the head well remain readable.
    for s in (-1,1):
        path=[(s*.53,.105,.795),(s*.57,.164,.598),(s*.53,.170,.328),
              (s*.38,.145,.103),(s*.195,.067,-.145)]
        m=K.Mesh();G.sweep(m,G.catmull(path,12),
                         [(-.040,-.035),(.035,-.035),(.045,-.022),(.045,.021),(.031,.034),(-.040,.034)],
                         'dark',(0,-1,0))
        M.emit(m,'chest.%s.curved.load.spar'%s,'chest')
        p=[(.230,-.143),(.425,.006),(.600,.280),(.607,.583),(.485,.712),(.375,.620),(.370,.314),(.190,.042)]
        holes=[[(x,z) for x,z in ((.410,.322),(.491,.403),(.486,.554),(.421,.499))]]
        M.panel('chest.%s.apertured.diagonal.web'%s,'chest',p,
                lambda x,z:(s*x,-.037+.13*z,z),.023,'machined',spacing=.020,cutouts=holes)
        M.actuator('chest.%s.scapular.lift.ram'%s,'chest',(s*.27,.22,.230),(s*.85,.18,.724),.060)
        M.actuator('chest.%s.clavicle.tie.rod'%s,'chest',(s*.30,-.01,.665),(s*.84,-.04,.806),.036)
        M.tube('chest.%s.routed.power.bus'%s,'chest',[(s*.22,.266,-.116),(s*.365,.276,.21),
                (s*.409,.265,.46),(s*.344,.204,.713)],.021,'bronze')
    m=K.Mesh()
    profile=[(-.205,0),(-.205,.133),(-.190,.186),(-.05,.178),(.047,.141),(.063,.064),(.063,0)]
    G.turn(m,profile,(0,-1,0),(0,.108,.305),'dark',96)
    for z in G.lin(.195,.459,7):
        G.sweep(m,[(-.147,.283,z),(0,.310,z+.018),(.147,.283,z)],
                [(-.008,-.013),(.014,-.013),(.018,.013),(-.008,.013)],'machined',(0,1,0))
    M.emit(m,'chest.central.cast.power.manifold','chest')
    M.bearing('chest.back.spine.drive','chest',(0,.342,.175),(0,1,0),.145,.092)
    from . import robot_refit
    robot_refit.collar()


def abdomen():
    for i,(z,width) in enumerate(((.060,.465),(.214,.540),(.374,.620))):
        p=[(-width/2,z+.095),(-width*.30,z+.121),(0,z+.073),(width*.30,z+.121),
           (width/2,z+.095),(width*.33,z-.074),(0,z-.105),(-width*.33,z-.074)]
        # Shingled: each upper plate stands one plate thickness proud of the
        # one below, so the overlaps never share a surface.
        surf=lambda x,h,i=i:(x,-.186-.048*(1-(x/.36)**2)-.029*(h/.6)-.020*i,h)
        M.panel('abdomen.segment.%s.formed.V.plate'%i,'spine',p,surf,.018,'robot_graphite',spacing=.012)
        M.rim('abdomen.segment.%s.machined.lower.reveal'%i,'spine',p,
              lambda x,h:(x,surf(x,h)[1]-.004,h),'machined',.009,.006)
    for s in (-1,1):
        M.actuator('abdomen.%s.longitudinal.oblique.ram'%s,'spine',(s*.155,.126,-.126),(s*.357,.071,.522),.044)
        M.tube('abdomen.%s.return.hose'%s,'spine',[(s*.228,.171,-.133),(s*.281,.201,.132),
                (s*.292,.188,.381),(s*.236,.171,.545)],.015,'dark')
    M.bearing('abdomen.waist.yaw.rotor','spine',(0,0,-.038),(0,0,1),.235,.145)
    m=K.Mesh()
    for x in (-.082,0,.082):
        G.sweep(m,G.catmull([(x,.201,-.128),(x,.231,.137),(x,.231,.425),(x,.183,.596)],12),
                [(-.022,-.013),(.022,-.013),(.022,.013),(-.022,.013)],'machined',(0,1,0))
    M.emit(m,'abdomen.segmented.dorsal.rails','spine')


def pelvis():
    for s,side in ((1,'L'),(-1,'R')):
        p=[(.045,.264),(.258,.335),(.449,.209),(.513,.054),(.443,-.183),(.221,-.363),(.095,-.241)]
        holes=[[(x,z) for x,z in ((.193,.130),(.257,.179),(.356,.115),(.285,.039),(.207,.038))]]
        surf=lambda x,z:(s*x,-.145-.075*(1-(x/.56)**2),z)
        M.panel('pelvis.%s.cast.girdle.web'%s,'pelvis',p,surf,.038,'dark',spacing=.015,cutouts=holes)
        M.rim('pelvis.%s.outer.machined.lip'%s,'pelvis',p,
              lambda x,z:(s*x,surf(x,z)[1]-.007,z),'machined',.017,.010)
        p=[(.245,.236),(.438,.273),(.554,.125),(.550,-.181),(.324,-.368),(.269,-.179)]
        M.panel('pelvis.%s.separate.hip.skirt'%s,'pelvis',p,
                lambda x,z:(s*x,-.253-.014*z,z),.015,'robot_graphite',spacing=.014)
        M.bearing('hip.%s.differential.pivot'%s,'hip.'+side,(0,0,0),(s,0,0),.164,.174)
        m=K.Mesh()
        for x,z in ((.290,.254),(.442,.202),(.319,-.303)):
            xx,yy,zz=surf(x,z);G.hardware(m,(xx,yy-.008,zz),(xx,yy-.020,zz),.012,'bronze',6)
        M.emit(m,'pelvis.%s.recessed.web.fasteners'%s,'pelvis')
    p=[(-.092,.234),(0,.273),(.092,.234),(.119,-.163),(0,-.345),(-.119,-.163)]
    M.panel('pelvis.central.keel.armour','pelvis',p,lambda x,z:(x,-.277-.055*(1-abs(x)/.13),z),
            .025,'robot_graphite',spacing=.012)
    M.rim('pelvis.central.keel.border','pelvis',p,lambda x,z:(x,-.284-.055*(1-abs(x)/.13),z),'machined',.010,.008)
    # Seated against the waist rotor's lower face.
    M.bearing('pelvis.rear.differential.cover','pelvis',(0,.211,.060),(0,1,0),.170,.102)


def shoulders():
    for side,s in (('L',1),('R',-1)):
        bone='clav.'+side;m=K.Mesh()
        p=[(0,-.085,.030),(s*.235,-.085,.030),(s*.321,-.055,.108),
           (s*.308,-.051,.219),(s*.175,-.045,.241),(0,-.070,.181)]
        m.prism(p,(0,.157,0),'dark')
        M.emit(m,'shoulder.'+side+'.cast.clavicle.bridge',bone,.003)
        M.actuator('shoulder.'+side+'.telescopic.slide.housing',bone,(s*.010,-.061,.080),(s*.323,-.064,.078),.052)
        m=K.Mesh()
        G.hardware(m,(-s*.540,-.063,.079),(-s*.027,-.063,.079),.019,'chrome',40)
        M.emit(m,'shoulder.'+side+'.retracting.clavicle.shaft','shoulder.'+side)
        M.bearing('shoulder.'+side+'.gimbal.yaw','shoulder.'+side,(-s*.031,.010,.099),(0,0,1),.124,.125)
        M.bearing('shoulder.'+side+'.upperarm.pitch','shoulder.'+side,(0,0,0),(s,0,0),.186,.258)
        p=[(-.086,.071),(.086,.071),(.135,.167),(.076,.307),(-.073,.320),(-.132,.166)]
        M.panel('shoulder.'+side+'.dorsal.hinge.yoke','shoulder.'+side,p,
                lambda y,z:(s*.105,y+.123,z),.026,'machined',outward=(s,0,0),spacing=.014)


def build():
    from . import robot_refit
    chest();abdomen();pelvis();robot_refit.shoulders()
