"""Reference-derived cervical cradle and load-bearing shoulder architecture."""
import math
from . import kit as K, geometry as G, robot_geometry as M


def neck():
    # Short duplex yaw bearing buried inside a flared four-point collar.
    M.bearing('neck.recessed.duplex.yaw.race','neck',(0,.014,.017),(0,0,1),.111,.065)
    M.bearing('neck.skull.pitch.trunnion','neck',(0,0,.087),(1,0,0),.052,.148)
    for s in (-1,1):
        p=[(.054,-.067),(.137,-.092),(.158,-.039),(.117,.085),(.080,.125),(.053,.082)]
        surf=lambda x,z:(s*x,-.045-.043*(1-(z/.15)**2),z)
        M.panel('neck.%s.flared.cervical.fork'%s,'neck',p,surf,.027,'robot_graphite',spacing=.009,
                cutouts=[G.rounded_polygon([(.088,-.032),(.114,-.039),(.100,.044),(.081,.072)],.007,8)])
        M.rim('neck.%s.fork.machined.bevel'%s,'neck',p,surf,'machined',.008,.006)
        M.actuator('neck.%s.short.pitch.piston'%s,'neck',(s*.124,.061,-.072),(s*.067,.038,.091),.024)
        M.tube('neck.%s.cervical.power.bundle'%s,'neck',[(s*.095,.073,-.080),(s*.108,.090,-.020),(s*.063,.068,.074)],.010)
    for i in range(3):
        z=-.047+i*.046;w=.060-i*.010
        p=[(-w,z),(-w*.70,z+.034),(0,z+.050),(w*.70,z+.034),(w,z),(0,z-.012)]
        M.panel('neck.throat.overlapping.chevron.'+str(i),'neck',p,
                lambda x,h:(x,-.104-.009*(1-abs(x)/.07),h),.009,'machined',spacing=.006)
    m=K.Mesh()
    G.turn(m,[(0,.027),(0,.053),(.024,.060),(.046,.046),(.060,.034),(.060,.025)],
           (0,0,1),(0,.011,0),'dark',80,True)
    M.emit(m,'head.underside.gimballed.socket','head')


def shoulders():
    for side,s in (('L',1),('R',-1)):
        bone='shoulder.'+side
        # Deep twin webs surround the slide and carry the arm trunnion. Their
        # tapered sections present the same broad shoulder roots as the sheet.
        outline=[(-.710,.060),(-.626,.181),(-.376,.197),(-.126,.259),(.102,.206),
                 (.161,.046),(.095,-.134),(-.190,-.163),(-.489,-.057)]
        opening=G.rounded_polygon([(-.533,.065),(-.351,.096),(-.202,.142),
                                   (-.150,.026),(-.271,-.060),(-.472,-.020)],.019,10)
        for face,y in (('front',-.107),('rear',.107)):
            surf=lambda x,z:(s*x,y+(.022 if y>0 else -.022)*math.sin((x+.71)*math.pi/.87),z)
            M.panel('shoulder.'+side+'.'+face+'.forged.load.bridge',bone,outline,surf,.033,
                    'dark',outward=(0,1 if y>0 else -1,0),spacing=.016,cutouts=[opening])
            M.rim('shoulder.'+side+'.'+face+'.machined.bridge.reveal',bone,outline,surf,
                  'machined',.015,.010,hint=(0,1 if y>0 else -1,0))
        M.actuator('shoulder.'+side+'.enclosed.clavicle.slide',bone,
                   (-s*.590,0,.043),(-s*.080,0,.090),.074)
        M.bearing('shoulder.'+side+'.inner.slide.gimbal',bone,(-s*.565,0,.057),(0,-1,0),.094,.260)
        M.bearing('shoulder.'+side+'.upperarm.pitch',bone,(0,0,0),(s,0,0),.216,.307)
        M.bearing('shoulder.'+side+'.yaw.drive',bone,(-s*.098,.043,.130),(0,0,1),.117,.114)
        for i in range(3):
            x=-.435+i*.095
            p=[(x,.165),(x+.066,.180),(x+.078,.218),(x+.014,.204)]
            M.panel('shoulder.'+side+'.upper.slide.lamella.'+str(i),bone,p,
                    lambda x,z:(s*x,-.060,z),.056,'paint',spacing=.016)
        # Split clavicular fairings descend into the hood's folded rear edge.
        p=[(.145,.775),(.245,.968),(.346,1.015),(.524,.914),(.691,.879),
           (.603,.756),(.363,.783),(.256,.730)]
        surface=lambda x,z:(s*x,-.018-.083*math.sin(math.pi*(x-.145)/.55),z)
        M.panel('chest.'+side+'.sculpted.clavicular.fairing','chest',p,surface,.026,'paint',spacing=.012)
        M.rim('chest.'+side+'.clavicular.chrome.reveal','chest',p,surface,'chrome',.013,.009)
        M.tube('shoulder.'+side+'.protected.hydraulic.loop',bone,
               [(-s*.540,.151,.027),(-s*.380,.182,.137),(-s*.143,.186,.193),(s*.060,.117,.117)],.022,'bronze')
        for x,z in ((-.600,.080),(-.170,.170),(.085,.081)):
            m=K.Mesh();G.hardware(m,(s*x,-.124,z),(s*x,-.148,z),.022,'bronze',6)
            M.emit(m,'shoulder.'+side+'.recessed.bridge.bolt.'+str(x),bone)


def collar():
    # A deep cast mounting cradle sits on the chest, rather than a thin
    # outline suspended in front of the neck. The central bearing stays free.
    m=K.Mesh()
    # The flared skirt runs down onto the hood, cowl and backbone below it.
    profile=[(.640,.123),(.640,.262),(.668,.268),(.735,.254),(.785,.241),(.805,.243),
             (.845,.223),(.929,.164),(.964,.142),(.969,.123),(.947,.109),(.815,.110)]
    G.turn(m,profile,(0,0,1),(0,.155,0),'robot_graphite',96,True)
    for p in m.v:p.x*=1.18
    M.emit(m,'chest.cast.cervical.cradle','chest')
    for s in (-1,1):
        p=[(.032,.824),(.110,.783),(.298,.800),(.239,.946),(.126,.993),(.061,.938)]
        def surface(x,z):return s*x,-.126+.125*max(0,min(1,(z-.80)/.20)),z
        M.panel('chest.%s.solid.gorget.guard'%s,'chest',p,surface,.046,'paint',spacing=.012)
        M.rim('chest.%s.gorget.rolled.rim'%s,'chest',p,surface,'machined',.009,.007)
        M.actuator('chest.%s.collar.tension.strut'%s,'chest',
                   (s*.275,.085,.804),(s*.125,.190,.953),.035)
        m=K.Mesh()
        for x,z in ((.157,.842),(.212,.886)):
            y=surface(x,z)[1]
            G.hardware(m,(s*x,y-.002,z),(s*x,y-.013,z),.012,'bronze',6)
        M.emit(m,'chest.%s.collar.fixings'%s,'chest')


def limb_details():
    for side,s in (('L',1),('R',-1)):
        # Cast knee and elbow clevis cheeks connect to the bearing stacks,
        # with pierced webs and stepped flanges instead of featureless tubes.
        for joint,bone,z,radius in (('elbow','upperarm.'+side,-1.080,.145),
                                     ('knee','thigh.'+side,-1.250,.170)):
            for sign in (-1,1):
                outline=[(-.078,z+.292),(.087,z+.269),(.131,z+.104),(.102,z-.047),
                         (-.081,z-.077),(-.139,z+.062)]
                hole=G.rounded_polygon([(-.044,z+.208),(.042,z+.196),(.064,z+.112),
                                        (.032,z+.082),(-.053,z+.116)],.015,10)
                x=sign*(radius+.055)
                surf=lambda y,h:(x+.009*sign*math.sin((h-z)*8),y,h)
                M.panel(joint+'.'+side+'.fork.cheek.'+str(sign),bone,outline,surf,.033,
                        'dark',outward=(sign,0,0),spacing=.012,cutouts=[hole])
                M.rim(joint+'.'+side+'.fork.bevel.'+str(sign),bone,outline,surf,
                      'machined',.012,.007,hint=(sign,0,0))
        # Flared flanks leave the inset transmission and its pipework visible.
        for region,bone,z0,z1,x in (('thigh','thigh.'+side,-.250,-.950,.222),
                                    ('biceps','upperarm.'+side,-.250,-.830,.168)):
            outline=[(-.147,z0),(-.072,z0+.055),(.113,z0-.048),(.127,z1+.137),
                     (.057,z1),(-.099,z1+.058)]
            def surface(y,z):
                t=(z-z0)/(z1-z0)
                return s*(x+.050*math.sin(math.pi*t)),y,z
            aperture=G.rounded_polygon([(-.059,z0-.119),(.049,z0-.132),(.052,z1+.207),
                                         (-.032,z1+.161)],.022,10)
            M.panel(region+'.'+side+'.flared.cast.flank',bone,outline,surface,.028,'paint',
                    outward=(s,0,0),spacing=.011,cutouts=[aperture])
            M.rim(region+'.'+side+'.flank.rolled.edge',bone,outline,surface,
                  'chrome',.011,.008,hint=(s,0,0))
            M.bearing(region+'.'+side+'.recessed.power.rotor',bone,
                      (s*(x-.010),.005,z0-.255),(s,0,0),.078,.075)
            M.actuator(region+'.'+side+'.lateral.hinge.drive',bone,
                       (s*(x-.051),.085,z0+.012),(s*(x-.028),.077,z1+.045),.034)
        # The forearm carries a curved instrument recess with a recessed red
        # lens and a metal guard, matching the concept's car-tail-light motif.
        bone='forearm.'+side
        outline=G.rounded_polygon([(-.097,-.319),(-.025,-.292),(-.028,-.703),(-.080,-.734)],.014,10)
        surf=lambda x,z:(x,-.253+.009*(z+.5)**2,z)
        M.panel('forearm.'+side+'.recessed.signal.cast.frame',bone,outline,surf,.018,'dark',spacing=.009,
                cutouts=[G.rounded_polygon([(-.081,-.345),(-.042,-.329),(-.045,-.680),(-.071,-.697)],.009,9)])
        M.rim('forearm.'+side+'.signal.chrome.guard',bone,outline,
              lambda x,z:(x,surf(x,z)[1]-.003,z),'machined',.006,.006)
        m=K.Mesh()
        p=G.rounded_polygon([(-.079,-.346),(-.044,-.333),(-.047,-.677),(-.069,-.692)],.007,9)
        m.prism([(x,-.246,z) for x,z in p],(0,.012,0),'red_lens')
        M.emit(m,'forearm.'+side+'.recessed.red.signal',bone,.001)
        for i in range(5):
            z=-.378-i*.055;m=K.Mesh()
            G.hardware(m,(-.076,-.258,z),(-.044,-.258,z+.011),.0025,'machined',12)
            M.emit(m,'forearm.'+side+'.signal.protective.rib.'+str(i),bone)


def torso_internals():
    """Converging rib spars and a recessed transmission under the car chest."""
    for s in (-1,1):
        for i in range(3):
            z=.18+i*.145
            path=[(s*.23,-.080,z-.10),(s*.38,-.16,z-.005),(s*(.50+i*.045),-.08,z+.070)]
            m=K.Mesh()
            G.sweep(m,G.filleted_path(path,.038,12),
                    [(-.027,-.031),(.024,-.031),(.039,-.014),(.039,.014),(.024,.031),(-.027,.031)],'dark',(0,-1,0))
            M.emit(m,'abdomen.%s.canted.cast.rib.%s'%(s,i),'spine')
            M.bearing('abdomen.%s.rib.trunnion.%s'%(s,i),'spine',path[-1],(0,-1,0),.043,.077)
        M.actuator('abdomen.%s.diagonal.compression.link'%s,'spine',
                   (s*.17,-.105,-.06),(s*.48,-.104,.54),.048)
        for i in range(3):
            x=.27+i*.038
            M.tube('abdomen.%s.braided.flank.bundle.%s'%(s,i),'spine',
                   [(s*x,.016,-.11),(s*(x+.080),-.025,.10),(s*(x+.083),-.011,.31),(s*(x+.135),.002,.51)],.011,'bronze' if i==1 else 'dark')
        p=[(.275,.45),(.505,.53),(.590,.37),(.466,.17),(.315,.12)]
        surf=lambda x,z:(s*x,.08-.30*z,z)
        M.panel('abdomen.%s.floating.flank.cowl'%s,'spine',p,surf,.025,'paint',spacing=.015,
                cutouts=[G.rounded_polygon([(.347,.35),(.434,.39),(.455,.32),(.353,.27)],.010,8)])
        M.rim('abdomen.%s.flank.cowl.bevel'%s,'spine',p,surf,'machined',.008,.006)


def proportions():
    """Authored limb section dimensions; joints and length stay fixed."""
    for obj in K.PARTS:
        if not obj.name.startswith('robot.') or not obj.parent:continue
        bone=obj.parent.name[5:]
        if bone.startswith('thigh.'):sx,sy=1.24,1.23
        elif bone.startswith('shin.'):sx,sy=1.20,1.19
        elif bone.startswith('upperarm.'):sx,sy=1.17,1.18
        elif bone.startswith('forearm.'):sx,sy=1.12,1.12
        else:continue
        for v in obj.data.vertices:v.co.x*=sx;v.co.y*=sy
        obj.data.update()
