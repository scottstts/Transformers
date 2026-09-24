"""Robot art-direction pass on the approved, baked vehicle scene.

Run install() in the existing baked .blend. Vehicle meshes and frame-zero
transforms are preserved. New armour uses rigid deployment and visible struts;
all motion is baked on frames 0..240, with no frame handlers or visibility swaps.
"""
import math
import bpy
from mathutils import Matrix, Vector, Quaternion
from bpy_extras import anim_utils
from . import kit, rkit, bake, motion
from .kit import V
from .rkit import Part

STATE = bpy.app.driver_namespace.setdefault('ct_redesign', {})


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def capture():
    if 'base' in STATE:
        return
    scene = bpy.context.scene
    if scene.get('ct_redesign_installed'):
        raise RuntimeError('Open the original cybertruck-transformer-baked.blend before rebuilding; this scene already contains the redesign.')
    objs = [o for o in scene.objects if o.animation_data and o.animation_data.action]
    base = {o.name: [] for o in objs}
    for f in range(241):
        scene.frame_set(f)
        for o in objs:
            base[o.name].append(o.matrix_basis.copy())
    scene.frame_set(0)
    STATE['car'] = {o.name: o.matrix_world.copy() for o in bpy.data.collections['CAR'].objects}
    STATE['base'] = base


def retime():
    frames = list(range(241))
    timekeys = [(0, (0,)), (.18, (.25,)), (.40, (.45,)),
                (.65, (.63,)), (.82, (.78,)), (1, (1,))]
    for name, source in STATE['base'].items():
        o = bpy.data.objects.get(name)
        if not o:
            continue
        matrices = []
        for f in frames:
            t = f / 240
            old = motion._monotone(timekeys, t)[0] * 240
            k = min(239, int(old))
            m = source[k].lerp(source[k + 1], old - k)
            settle = smooth((t - .68) / .30)
            if name in ('bone.hip.L', 'bone.hip.R'):
                # Wider planted stance: whole leg follows the hip carriage.
                m.translation.x += (.19 if name.endswith('.L') else -.19) * settle
            if name in ('bone.upperarm.L', 'bone.upperarm.R'):
                sign = -1 if name.endswith('.L') else 1
                m = m @ Matrix.Rotation(math.radians(sign * 5) * settle, 4, 'Y')
            if name in ('P.roof.L', 'P.roof.R', 'P.rdoor.L', 'P.rdoor.R'):
                # Retract the cuff along its existing forearm carriage to
                # expose the articulated hand instead of burying its palm.
                m.translation.z += .23 * smooth((t - .66) / .27)
            if name == 'bone.head':
                # Short heavy neck; extra retraction packages the larger helmet.
                m.translation.z -= .15 - .07 * smooth((t - .81) / .17)
            matrices.append(m)
        bake._keys(o, frames, matrices)


def plate(part, poly, f0, f1, material='steel'):
    part.add(rkit.plate_f(poly, f0, f1, .008), material)


def panel(name, poly, depth=.065):
    p = Part('RD.' + name)
    plate(p, poly, -depth, 0, 'graphite')
    plate(p, [(x * .94, z * .94) for x, z in poly], 0, .018)
    return p


def surface_details(p, width, height):
    """Small recessed service grille and captive perimeter fasteners."""
    x = width * .26
    z = -height * .22
    plate(p, [(x-.045,z-.085),(x+.045,z-.085),
              (x+.045,z+.085),(x-.045,z+.085)], .019,.024,'graphite')
    for dz in (-.052,-.017,.018,.053):
        plate(p,[(x-.033,z+dz),(x+.033,z+dz),
                 (x+.033,z+dz+.009),(x-.033,z+dz+.009)],.025,.030,'darkSteel')
    for sx,sz in ((-1,-1),(-1,1),(1,1)):
        p.add(rkit.cylinder((sx*width*.29,.029,sz*height*.29),.012,.012,'f',6),'chrome')


def deploy(part, bone, rest, packed, start, end, angle=0, axis='Y', rods=True):
    coll = bpy.data.collections['ROBOT_REDESIGN']
    kind = part.name.split('.')[1]
    # These complete armour meshes are authored in the left-hand frame.
    # Reflect the other side's geometry and winding, including inset parts
    # and fasteners, rather than duplicating the same handed silhouette.
    if part.name.endswith('.R') and kind in ('pauldron','gauntlet','cuisses','greave'):
        for v in part.b.verts:
            v.x = -v.x
        part.b.faces = [list(reversed(face)) for face in part.b.faces]
    o = part.build(coll, .004, 2)
    o.parent = bpy.data.objects['bone.' + bone]
    o.matrix_parent_inverse = Matrix.Identity(4)
    o['mechanism'] = 'Rigid armour on paired telescoping clevis struts'
    # Front armour opens in a staggered wave; preserve both approved endpoints.
    front = None
    front_specs = {'gauntlet':(.40,.84,.33,72),
                   'cuisses':(.51,.92,.37,76),
                   'knee':(.62,.94,.16,68),
                   'greave':(.47,.88,.36,74),
                   'pelvicShield':(.65,.98,.13,65)}
    if kind in front_specs:
        start,end,pivot_z,tilt_degrees = front_specs[kind]
        lag = .045 if part.name.endswith('.R') else 0
        start,end = start+lag,end+lag
        front = (pivot_z,tilt_degrees)
    elif kind == 'abdominal':
        i = int(part.name.rsplit('.',1)[1])
        start,end = .48+i*.07,.82+i*.065
        front = (.08,72)
    mats = []
    for f in range(241):
        t = max(0, min(1, (f / 240 - start) / (end - start)))
        u = smooth(t)
        pos = V(*packed).lerp(V(*rest), u)
        opening = u
        if part.name.startswith('RD.pectoral.'):
            # Lift the folded leaves through the open collar, then swing
            # forward over the cover; never translate through its front skin.
            sign = 1 if rest[0] > 0 else -1
            path = [(0, packed), (.37, (sign*.96,-.13,1.91)),
                    (.66, (sign*.96,1.00,1.91)), (1, rest)]
            for (t0,a),(t1,b) in zip(path,path[1:]):
                if t <= t1:
                    pos = V(*a).lerp(V(*b),smooth((t-t0)/(t1-t0)))
                    break
            opening = smooth((t-.60)/.40)
        local = Matrix.Translation(pos) @ Matrix.Rotation(math.radians(angle) * (1-opening), 4, axis)
        if front:
            pivot = Vector((0,0,front[0]))
            swing = smooth(t/.43) if t < .43 else 1-smooth((t-.43)/.57)
            # Negative X opens the lower edge toward the front (-Y). Keep
            # the old packed rotation at t=0, and remove it progressively.
            extension = smooth((t-.10)/.90)
            pos = V(*packed).lerp(V(*rest),extension)
            local = (Matrix.Translation(pos) @ Matrix.Translation(pivot)
                     @ Matrix.Rotation(-math.radians(front[1])*swing,4,'X')
                     @ Matrix.Translation(-pivot)
                     @ Matrix.Rotation(math.radians(angle)*(1-u),4,axis))
        if part.name.startswith('RD.back.'):
            # A face-on slide through an opaque housing makes even densely
            # sampled motion look like a visibility pop. Peel from the lower
            # edge around a top clevis, then extend and close the hinge.
            # Both endpoints remain exactly the authored packed/rest poses.
            is_pack = 'coolingPack' in part.name
            is_spine = 'spineVertebra' in part.name
            pivot = Vector((0,0,.34 if is_pack else (.105 if is_spine else .28)))
            swing = smooth(t/.46) if t < .46 else 1-smooth((t-.46)/.54)
            tilt = math.radians(68 if is_pack else 76) * swing
            extension = smooth((t-.12)/.88)
            pos = V(*packed).lerp(V(*rest),extension)
            local = (Matrix.Translation(pos) @ Matrix.Translation(pivot)
                     @ Matrix.Rotation(tilt,4,'X') @ Matrix.Translation(-pivot))
        mats.append(local)
    bake._keys(o, list(range(241)), mats)
    if rods:
        # Paired load-bearing telescopes, anchored to this same bone. The rod
        # remains inside its barrel, including at the compact endpoint.
        for side in (-1, 1):
            anchor = V(packed[0] + side * .09, packed[1] - .07, packed[2])
            barrel = Part(part.name + '.barrel' + str(side))
            heavy = part.name.startswith('RD.pectoral.')
            barrel.add(rkit.cylinder((0, 0, .5), .055 if heavy else .033, 1, 'z', 12), 'graphite')
            rod = Part(part.name + '.rod' + str(side))
            rod.add(rkit.cylinder((0, 0, .5), .033 if heavy else .018, 1, 'z', 12), 'chrome')
            for sub, portion, offset in ((barrel, .60, 0), (rod, .55, .45)):
                ob = sub.build(coll, 0, 1)
                ob.parent = o.parent
                ob.rotation_mode = 'QUATERNION'
                previous = None
                for f, m in enumerate(mats):
                    tip = m @ V(side * .09, -.05, 0)
                    d = tip - anchor
                    ob.location = anchor + d * offset
                    rotation = d.to_track_quat('Z', 'Y')
                    if previous is not None and previous.dot(rotation) < 0:
                        rotation.negate()
                    ob.rotation_quaternion = rotation
                    previous = rotation.copy()
                    ob.scale = (1, 1, max(.015, d.length * portion))
                    for path in ('location', 'rotation_quaternion', 'scale'):
                        ob.keyframe_insert(path, frame=f)
                cb = anim_utils.action_ensure_channelbag_for_slot(ob.animation_data.action, ob.animation_data.action_slot)
                for fc in cb.fcurves:
                    for key in fc.keyframe_points:
                        key.interpolation = 'LINEAR'
    return o


def armour():
    for S, s in (('L', 1), ('R', -1)):
        # Two swept pectorals: steel lower fascia, inset dark upper glazing,
        # continuous cool-white running light and a strong tapered underside.
        poly = [(-.53, -.26), (-.38, -.43), (.39, -.32), (.57, .17), (.39, .46), (-.53, .42)]
        poly = [(s*x, z) for x,z in poly]
        p = panel('pectoral.'+S, poly, .09)
        glass = [(-.46,.10), (.46,.10), (.33,.37), (-.46,.34)]
        plate(p, [(s*x,z) for x,z in glass], .021, .037, 'glass')
        plate(p, [(s*x,z) for x,z in [(-.49,.055),(.49,.055),(.505,.09),(-.49,.09)]], .039, .045, 'visor')
        plate(p, [(s*x,z) for x,z in [(-.36,-.24),(.27,-.18),(.30,-.11),(-.39,-.17)]], .021, .027, 'darkSteel')
        for x,z in ((-.36,-.29),(.29,-.23),(.30,.36)):
            p.add(rkit.cylinder((s*x,.032,z), .017, .016, 'f', 6), 'chrome')
        # Recessed lower-fascia cooling slots; preserve the broad steel planes.
        for k in range(5):
            x=s*(-.29+k*.105)
            plate(p,[(x-.028,-.28),(x+.028,-.28),(x+.028,-.245),(x-.028,-.245)],.022,.029,'graphite')
        # Sloping upper deck echoes the vehicle's wedge rather than a flat
        # breastplate; the lower stainless fascia projects over the waist.
        for v in p.b.verts:
            v.y += .38 * v.z
        deploy(p, 'chest', (s*.55,.79,.82), (s*.34,-.10,.55), .64,.91, s*68)

        # Layered shoulder shield, deliberately proud of the wheel/quarter.
        p = panel('pauldron.'+S, [(-.32,-.30),(.22,-.38),(.37,.20),(.12,.34),(-.30,.25)])
        plate(p, [(-.24,.16),(.23,.13),(.19,.19),(-.24,.22)], .024,.034,'darkSteel')
        for x in (-.19,.17):
            p.add(rkit.cylinder((x,.032,-.20),.023,.02,'f',6),'chrome')
        surface_details(p,.55,.51)
        deploy(p, 'upperarm.'+S, (s*.38,1.00,-.07), (0,-.03,-.36), .43,.73, s*70)

        # Slim raised gauntlet keel leaves the existing roof armour readable.
        p = panel('gauntlet.'+S, [(-.19,-.37),(.18,-.30),(.23,.28),(.03,.41),(-.20,.23)])
        plate(p,[(-.11,-.20),(-.065,-.24),(.09,.20),(.045,.24)],.022,.027,'darkSteel')
        for z in (-.19,-.08,.03):
            plate(p,[(.10,z),(.17,z),(.17,z+.025),(.10,z+.025)],.022,.033,'graphite')
        for z in (-.24,.26):
            p.add(rkit.cylinder((-.13,.031,z),.014,.014,'f',6),'chrome')
        deploy(p, 'forearm.'+S, (0,.49,-.38), (0,-.02,-.57), .52,.80, s*28)

        # Angular thigh front: layered inset rather than an uninterrupted slab.
        p = panel('cuisses.'+S,[(-.28,-.45),(.24,-.34),(.30,.36),(-.17,.47),(-.31,.26)])
        plate(p,[(-.14,.26),(.15,.21),(.14,.26),(-.12,.31)],.022,.03,'darkSteel')
        surface_details(p,.56,.76)
        deploy(p,'thigh.'+S,(.10*s,.60,-.54),(0,-.03,-.54),.68,.90,s*18)

        p = panel('knee.'+S,[(-.23,-.12),(0,-.24),(.23,-.12),(.20,.14),(0,.22),(-.20,.14)])
        plate(p,[(-.12,-.02),(0,-.12),(.12,-.02),(0,.07)],.026,.05,'graphite')
        for x in (-.16,.16):
            p.add(rkit.cylinder((x,.036,.045),.015,.014,'f',6),'chrome')
        deploy(p,'shin.'+S,(0,.36,-.02),(0,-.05,-.10),.72,.95,0)

        # Front shin spine fills the empty upper greave while preserving a
        # visible joint and the broad wheel-bearing vehicle corner outside.
        p = panel('greave.'+S,[(-.19,-.48),(.15,-.43),(.25,.32),(.08,.46),(-.21,.29)])
        plate(p,[(-.115,-.27),(-.065,-.31),(.025,.27),(-.025,.30)],.025,.033,'visor')
        plate(p,[(.065,-.32),(.12,-.30),(.18,.18),(.12,.23)],.022,.036,'darkSteel')
        for z in (-.18,-.09,0,.09):
            plate(p,[(.07,z),(.16,z+.025),(.16,z+.044),(.07,z+.019)],.038,.046,'graphite')
        for x,z in ((-.13,-.34),(-.14,.25),(.16,.27)):
            p.add(rkit.cylinder((x,.034,z),.013,.012,'f',6),'chrome')
        deploy(p,'shin.'+S,(.04*s,.54,-.68),(0,-.04,-.68),.57,.85,s*15)

    # A stacked silver abdominal taper between chest and pelvis.
    for i, (bn,z,w) in enumerate((('chest',-.06,.66),('spine',.10,.51),('pelvis',.35,.39))):
        p = panel('abdominal.%d'%i,[(-w/2,.105),(w/2,.105),(w*.36,-.105),(-w*.36,-.105)],.035)
        plate(p,[(-w*.25,-.03),(w*.25,-.03),(w*.25,.015),(-w*.25,.015)],.022,.03,'graphite')
        deploy(p,bn,(0,.34,z),(0,-.10,z),.61+i*.04,.83+i*.04,0)
    p = panel('pelvicShield',[(-.25,.17),(.25,.17),(.17,-.16),(0,-.27),(-.17,-.16)],.06)
    deploy(p,'pelvis',(0,.31,-.05),(0,-.10,-.05),.75,.96,0)


def mechanical_components():
    """Secondary load paths with volume, joints, housings and exposed rods."""
    def ram(p, a, b, radius=.045):
        a,b = V(*a),V(*b)
        d=b-a
        M=Matrix.Translation(a) @ d.to_track_quat('Z','Y').to_matrix().to_4x4()
        for lo,hi,r,mat in ((0,.63,radius,'graphite'),(.57,.94,radius*.52,'chrome'),
                            (.02,.09,radius*1.24,'darkSteel'),(.55,.64,radius*1.2,'steel')):
            mesh=rkit.cylinder((0,0,(lo+hi)*d.length/2),r,(hi-lo)*d.length,'z',16)
            p.add(kit.transform(mesh,M),mat)
        for v in (a,b):
            p.add(rkit.drum((v.x,-v.y,v.z),radius*1.3,.075,'x',16),'darkSteel')

    for S,s in (('L',1),('R',-1)):
        # Three separate overlapping ribs flank the abdominal taper. Twin
        # diagonal hydraulic rams and a rear manifold fill the open waist.
        p=Part('RD.ribManifold.'+S)
        p.add(rkit.frame([(-.23,.18,.18,.035,-.04),(.24,.22,.22,.04,-.04)],cap=.01),'graphite')
        for z in (-.15,.015,.18):
            plate(p,[(s*-.08,z-.05),(s*.24,z-.08),(s*.29,z+.025),(s*.02,z+.08)],.06,.13,'darkSteel')
            plate(p,[(s*.03,z+.04),(s*.25,z-.005),(s*.25,z+.025),(s*.03,z+.065)],.135,.157,'steel')
        ram(p,(-.055,.18,-.23),(.11,.18,.25),.040)
        ram(p,(.065,.23,-.21),(-.10,.23,.24),.030)
        p.add(rkit.hose([(-.065,-.08,-.19),(-.14,-.13,0),(-.10,-.08,.23)],.021,8),'rubber')
        deploy(p,'chest',(s*.48,.14,-.12),(s*.22,-.08,.18),.62,.91,s*15)

        # Exposed shoulder gearbox under each shield: rotor, bearing carrier,
        # forked clevis and a diagonal actuator running into the upper arm.
        p=Part('RD.shoulderGearbox.'+S)
        p.add(rkit.frame([(-.26,.22,.19,.035,0),(.16,.29,.25,.04,0)],cap=.008),'graphite')
        p.add(rkit.drum((0,.14,.07),.17,.10,'f',32),'darkSteel')
        p.add(rkit.cylinder((0,.203,.07),.12,.025,'f',24),'graphite')
        p.add(rkit.cylinder((0,.225,.07),.064,.035,'f',12),'chrome')
        p.many(rkit.bolt_ring((0,.244,.07),'f',.097,8,.009,.008),'steel')
        for x in (-.135,.135):
            plate(p,[(x-.025,-.27),(x+.025,-.27),(x+.025,-.05),(x-.025,-.05)],.01,.14,'steel')
        ram(p,(-s*.085,.08,-.28),(s*.09,.10,-.60),.047)
        deploy(p,'upperarm.'+S,(-s*.10,.33,-.28),(0,-.04,-.31),.44,.71,0)

        # A distinct inboard forearm power unit with twin piston rods and a
        # wrist bearing, visible beside rather than pasted onto the armour.
        p=Part('RD.forearmPowerUnit.'+S)
        p.add(rkit.frame([(-.22,.16,.22,.035,0),(.20,.22,.25,.045,0)],cap=.012),'graphite')
        for x in (-.063,.063):
            ram(p,(x,.16,.24),(x,.16,-.35),.035)
        p.add(rkit.drum((0,.025,-.29),.11,.22,'x',24),'darkSteel')
        p.add(rkit.plate_x([(-.11,-.17),(.12,-.17),(.12,.13),(-.11,.22)],-.14,-.11,.005),'steel')
        p.add(rkit.hose([(.10,-.08,.19),(.16,-.13,.06),(.14,-.12,-.16)],.021,8),'rubber')
        deploy(p,'forearm.'+S,(-s*.32,.12,-.55),(0,-.045,-.55),.55,.84,s*12)

        # Ankle cassette: nested strut, clevis cheeks, a lower pivot and a
        # short bridging guard. This breaks up the empty lower-leg cavity.
        p=Part('RD.ankleCassette.'+S)
        ram(p,(0,.02,.22),(0,.14,-.17),.055)
        for x in (-.105,.105):
            p.add(rkit.plate_x([(-.08,-.20),(.15,-.20),(.18,-.10),(.08,.24),(-.07,.24)],x-.018,x+.018,.006),'steel')
        p.add(rkit.drum((0,.12,-.14),.082,.25,'x',24),'darkSteel')
        plate(p,[(-.105,.22),(.105,.22),(.105,.29),(-.105,.29)],-.03,.10,'graphite')
        deploy(p,'shin.'+S,(-s*.25,.19,-1.08),(0,-.035,-1.07),.68,.94,0)


def head_and_neck():
    """Complete replacement, shaped around a recessed face and side turbines."""
    for name in ('R.head.helmet', 'R.head.face', 'R.neck.column'):
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    coll = bpy.data.collections['ROBOT_REDESIGN']

    def attach(p, bone):
        o = p.build(coll, .003, 2)
        o.parent = bpy.data.objects['bone.'+bone]
        o.matrix_parent_inverse = Matrix.Identity(4)
        return o

    p = Part('RD.neck.armouredGimbal')
    p.add(rkit.frame([(-.025,.43,.38,.08,-.025),(.035,.39,.34,.075,-.025),
                      (.10,.29,.28,.07,-.025),(.17,.25,.24,.06,-.025)],cap=.008),'graphite')
    for z,rad in ((.025,.19),(.07,.165),(.115,.14)):
        p.add(rkit.cylinder((0,-.025,z),rad,.032,'z',24),'darkSteel')
    for s in (-1,1):
        p.add(rkit.cylinder((s*.155,0,.075),.063,.048,'x',20),'chrome')
        p.add(rkit.plate_x([(-.13,-.02),(.11,-.02),(.095,.095),(-.07,.155),(-.13,.105)],
                          *sorted((s*.18,s*.215)),.006),'steel')
    attach(p,'neck')

    p = Part('RD.head.helmetChassis')
    # Rear cranial shell tapers into a central crown, leaving a deep open face.
    core = rkit.frame([(.02,.35,.28,.065,-.05),(.18,.54,.41,.09,-.03),
                       (.43,.57,.43,.10,-.03),(.60,.43,.34,.085,-.04),
                       (.70,.20,.24,.055,-.035)],cap=.008)
    cut = rkit.plate_f([(-.22,.07),(.22,.07),(.245,.43),(.18,.53),(-.18,.53),(-.245,.43)],.035,.40,0)
    p.add(core,'graphite',cuts=[cut])
    # Crown rails and a raised centre crest, distinctly faceted in silhouette.
    for s in (-1,1):
        p.add(rkit.plate_x([(-.16,.42),(-.12,.60),(-.025,.71),(.08,.60),(.17,.49),(.09,.45)],
                          *sorted((s*.11,s*.19)),.004),'steel')
    p.add(rkit.plate_x([(-.14,.51),(-.09,.67),(0,.745),(.105,.63),(.18,.53),(.08,.50)],-.055,.055,.004),'darkSteel')
    attach(p,'head')

    p = Part('RD.head.templesAndTurbines')
    rotors = Part('RD.head.earRotors')
    for s in (-1,1):
        # Ear rotor: recessed concentric mechanical rings, bolted outer hub.
        rotors.add(rkit.drum((s*.287,-.065,.34),.139,.09,'x',32),'darkSteel')
        rotors.add(rkit.cylinder((s*.340,-.065,.34),.102,.018,'x',24),'graphite')
        rotors.add(rkit.cylinder((s*.354,-.065,.34),.055,.027,'x',12),'chrome')
        rotors.many(rkit.bolt_ring((s*.367,-.065,.34),(s,0,0),.081,8,.009,.006),'steel')
        # Swept rear ear fins, broad roots rather than freestanding antennae.
        p.add(rkit.plate_x([(-.18,.25),(-.22,.50),(-.12,.76),(-.035,.63),(.005,.46),(-.06,.25)],
                          *sorted((s*.225,s*.273)),.005),'steel')
        # Segmented cheek armour follows the face taper down to the jaw.
        poly=[(s*.16,.055),(s*.26,.18),(s*.275,.36),(s*.21,.43),(s*.165,.29),(s*.11,.13)]
        plate(p,poly,.08,.18,'steel')
        plate(p,[(s*.20,.18),(s*.238,.24),(s*.24,.32),(s*.205,.28)],.185,.198,'graphite')
    attach(p,'head')
    attach(rotors,'head')

    p = Part('RD.head.recessedFace')
    plate(p,[(-.175,.10),(0,.035),(.175,.10),(.21,.40),(.145,.505),(-.145,.505),(-.21,.40)],.075,.12,'graphite')
    # Heavy downward brow and two separate narrow luminous eyes.
    for s in (-1,1):
        plate(p,[(s*.018,.405),(s*.20,.455),(s*.21,.494),(s*.07,.485),(s*.008,.44)],.145,.22,'steel')
        plate(p,[(s*.030,.390),(s*.181,.424),(s*.170,.382),(s*.040,.354)],.132,.147,'visor')
        plate(p,[(s*.050,.315),(s*.16,.342),(s*.144,.175),(s*.045,.088)],.126,.178,'steel')
        plate(p,[(s*.084,.238),(s*.126,.279),(s*.116,.192),(s*.075,.148)],.180,.187,'darkSteel')
    # Projecting central nose keel and a narrow vented respirator.
    plate(p,[(-.033,.395),(0,.44),(.033,.395),(.055,.275),(0,.24),(-.055,.275)],.15,.235,'darkSteel')
    plate(p,[(-.045,.24),(.045,.24),(.035,.12),(0,.085),(-.035,.12)],.14,.195,'steel')
    for z in (.145,.172,.199):
        plate(p,[(-.025,z),(.025,z),(.025,z+.012),(-.025,z+.012)],.198,.205,'graphite')
    ob = attach(p,'head')
    # Robot-only light material; the vehicle's lamps are untouched.
    blue = bpy.data.materials.get('RD.ionBlue')
    if blue is None:
        blue = bpy.data.materials['ct.visor'].copy()
        blue.name = 'RD.ionBlue'
        bsdf = next(n for n in blue.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = (.015,.32,.8,1)
        bsdf.inputs['Emission Color'].default_value = (.025,.4,1,1)
        bsdf.inputs['Emission Strength'].default_value = 7
    for slot in ob.material_slots:
        if slot.material.name == 'ct.visor':
            slot.material = blue
    # A cranial volume, not a face-shaped slab: extend the occipital shell
    # behind the ear axis while retaining the face and its recessed details.
    # Continuous piecewise deformation keeps temple/ear assemblies attached.
    for o in coll.objects:
        if not o.name.startswith('RD.head.') or o.name == 'RD.head.earRotors':
            continue
        for v in o.data.vertices:
            if v.co.y > -.06:
                v.co.y = -.06 + (v.co.y + .06) * 1.55
        o.data.update()


def back_components():
    """Rear service architecture: paired power packs and an articulated spine."""
    def rear(p):
        # Build with the same outward-facing convention as the front hardware,
        # then turn the complete component toward the robot's back.
        p.b.transform(Matrix.Rotation(math.pi,4,'Z'))
        return p

    for S,s in (('L',1),('R',-1)):
        p=Part('RD.back.coolingPack.'+S)
        p.add(rkit.frame([(-.40,.34,.22,.06,0),(-.29,.43,.28,.06,0),
                          (.30,.43,.28,.06,0),(.42,.30,.22,.05,0)],cap=.015),'graphite')
        # A folded stainless cage surrounds a recessed exchanger, with real
        # louver blades spanning a dark cavity instead of painted black lines.
        for x in (-.19,.19):
            plate(p,[(x-.027,-.34),(x+.027,-.34),(x+.027,.34),(x-.027,.34)],.12,.19,'steel')
        for z in (-.36,.34):
            plate(p,[(-.19,z-.04),(.19,z-.04),(.19,z+.04),(-.19,z+.04)],.105,.19,'steel')
        for z in (-.23,-.13,-.03,.07,.17,.27):
            p.add(rkit.plate_x([(.11,z-.025),(.205,z+.014),(.205,z+.032),(.11,z-.007)],-.15,.15,.003),'darkSteel')
        # Distinct cylindrical coolant reservoir and exposed bent pipework.
        p.add(rkit.cylinder((s*.25,-.005,-.035),.065,.54,'z',20),'darkSteel')
        for z in (-.26,.20):
            p.add(rkit.cylinder((s*.25,-.005,z),.078,.05,'z',20),'steel')
        p.add(rkit.hose([(s*.25,0,.25),(s*.25,.05,.44),(s*.08,.04,.46),(s*.06,0,.35)],.024,10),'chrome')
        p.add(rkit.hose([(s*.25,0,-.29),(s*.20,.025,-.43),(0,.015,-.44)],.024,10),'rubber')
        lag = 0 if S == 'L' else .055
        deploy(rear(p),'chest',(s*.38,-.68,.56),(s*.22,-.03,.53),.30+lag,.82+lag,0)

        # Rear thigh plates expose a central channel and retain joint gaps.
        p=Part('RD.back.hamstringGuard.'+S)
        for x in (-.12,.12):
            plate(p,[(x-.06,-.33),(x+.06,-.30),(x+.08,.29),(x-.05,.36)],.045,.10,'steel')
        p.add(rkit.cylinder((0,.035,0),.044,.61,'z',16),'chrome')
        for z in (-.26,.24):
            plate(p,[(-.16,z-.035),(.16,z-.035),(.16,z+.035),(-.16,z+.035)],.005,.12,'graphite')
        deploy(rear(p),'thigh.'+S,(0,-.31,-.65),(0,-.035,-.65),.45+lag,.86+lag,0)

        # Open calf cassette with three overlapping guard segments, leaving
        # the knee and ankle bearing exposed at each end.
        p=Part('RD.back.calfCassette.'+S)
        for x in (-.115,.115):
            p.add(rkit.cylinder((x,.025,0),.025,.79,'z',16),'chrome')
        for z in (-.25,0,.25):
            plate(p,[(-.18,z+.11),(.18,z+.11),(.145,z-.095),(0,z-.14),(-.145,z-.095)],.04,.105,'steel')
            plate(p,[(-.09,z+.03),(.09,z+.03),(.075,z-.015),(-.075,z-.015)],.11,.13,'graphite')
        deploy(rear(p),'shin.'+S,(0,-.28,-.69),(0,-.015,-.69),.55+lag,.94+lag,0)

    # Independent spine segments follow their actual torso bones, so the
    # silver vertebrae articulate through the rise instead of forming a slab.
    for i,(bone,z) in enumerate((('chest',.13),('spine',.12),('pelvis',.28))):
        p=Part('RD.back.spineVertebra.%d'%i)
        p.add(rkit.drum((0,.04,0),.105,.28,'x',24),'darkSteel')
        plate(p,[(-.14,.13),(.14,.13),(.18,.025),(.105,-.12),(-.105,-.12),(-.18,.025)],.07,.15,'steel')
        plate(p,[(-.08,.06),(.08,.06),(.08,-.045),(-.08,-.045)],.155,.18,'graphite')
        p.add(rkit.cylinder((0,.198,.008),.034,.025,'f',12),'chrome')
        deploy(rear(p),bone,(0,-.55,z),(0,-.13,z),.39+i*.075,.77+i*.085,0)


def install():
    capture()
    coll = kit.collection('ROBOT_REDESIGN', bpy.data.collections['CYBERTRUCK'])
    kit.clear_collection(coll)
    retime()
    armour()
    mechanical_components()
    head_and_neck()
    back_components()
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start, scene.frame_end = 0, 240
    for m in list(scene.timeline_markers):
        if m.name.startswith('RD '):
            scene.timeline_markers.remove(m)
    for f,name in ((0,'TRUCK'),(43,'UNLOCK'),(96,'RISE'),(156,'SHOULDERS'),(204,'ARMOUR'),(240,'ROBOT')):
        scene.timeline_markers.new('RD '+name, frame=f)
    scene.frame_set(0)
    delta = max(max(abs(o.matrix_world[i][j]-STATE['car'][o.name][i][j]) for i in range(4) for j in range(4)) for o in bpy.data.collections['CAR'].objects)
    print('Vehicle endpoint matrix error:',delta)
    scene.frame_set(240)
    scene['ct_redesign_installed'] = True
    print('Redesign baked: 241 frames;', len(coll.objects), 'new armour/mechanism objects')
