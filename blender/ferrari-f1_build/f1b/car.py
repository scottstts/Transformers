"""The complete car: body panels, floor pieces, cockpit hardware, wings, wheels
and suspension, each a named object (the transformer assemblies group them).

Left parts are authored and mirrored for the right side. The floor is cut by
the same band regions as the body skin, so every floor piece travels with the
limb that lies above it in the car.
"""
from mathutils import Matrix
from . import kit, body, aero, chassis, wheels, dims as D
from .body import top_prism, mirror_xf, regions, centre_regions, cut_region

SIDES = (('L', 1), ('R', -1))
WING = (0.0, 1, 30)          # airfoil lofts carry their own blunt trailing edges: weighted normals only
FW_SPLIT = 0.50              # front-wing fold line (x): outer piece = foot, inner piece = sole


def _obj(name, items, coll, mirror=False, finish=(0.002, 2, 30)):
    b = kit.Builder()
    for it in items:
        if len(it) == 3:
            v, f, sl = it
            if mirror:
                v, f = kit.mirror_x((v, f))
            b.add_slotted(v, f, sl)
        else:
            m, s = it
            b.add_mesh(kit.mirror_x(m) if mirror else m, s)
    o = b.build(name, coll)
    if finish:
        kit.finish(o, *finish)
    return o


def floor_pieces(coll):
    details = aero.floor_details()
    fl = _obj('floor.solid', [(aero.floor_surface(), 'carbonMatte')] + details +
              [(kit.mirror_x(m),s) for m,s in details], coll, finish=None)
    parts = {}

    def keep(o):
        if len(o.data.polygons):
            parts[o.name] = o
        else:
            kit.bpy.data.objects.remove(o, do_unlink=True)

    for base, (poly, zr) in regions().items():
        if zr is not None and zr[0] > 0.3:
            continue            # the floor lies wholly in the lower band
        for S, s in SIDES:
            p = poly if s > 0 else mirror_xf(poly)
            keep(cut_region(fl, 'floor%s.%s' % (base[0].upper() + base[1:], S), [top_prism(p, -1.0, 2.0)], coll))
    for name in ('belly', 'nape', 'tail'):
        poly, z0, z1 = centre_regions()[name]
        keep(cut_region(fl, 'floor' + name[0].upper() + name[1:], [top_prism(poly, -1.0, 2.0)], coll))
    data = fl.data
    kit.bpy.data.objects.remove(fl, do_unlink=True)
    kit.bpy.data.meshes.remove(data)
    for o in parts.values():
        kit.finish(o, 0.0025, 2, 30)
    return parts


def build(coll):
    parts = dict(body.build(coll))
    parts.update(floor_pieces(coll))

    parts['intake'] = _obj('intake', chassis.intake_duct(), coll)
    parts['tcam'] = _obj('tcam', chassis.tcam(), coll)
    parts['halo'] = _obj('halo', chassis.halo(), coll)
    parts['liner'] = _obj('liner', chassis.cockpit_details(), coll)
    parts['cockpitControls'] = _obj('cockpitControls', chassis.cockpit_controls(), coll)
    for S, s in SIDES:
        mir = s < 0
        parts['rimF.' + S] = _obj('rimF.' + S, [(chassis.rim_pad(1, 'front'), 'interior')], coll, mir)
        parts['rimR.' + S] = _obj('rimR.' + S, [(chassis.rim_pad(1, 'rear'), 'interior')], coll, mir)
        parts['mirror.' + S] = _obj('mirror.' + S, chassis.mirror(1), coll, mir)
        parts['duct.' + S] = _obj('duct.' + S, chassis.inlet_duct(1), coll, mir)
        ep, fp = aero.front_endplate()
        # the wing half splits at mid-span: the foot is the outer piece (endplate upright), the inner
        # piece folds under it as the sole; the nose pylon stays with the nose (shin)
        whole = _obj('fwing.' + S, aero.front_wing_elements() + aero.front_flap_hardware() + [(ep, 'carbon'), (fp, 'carbon')], coll, mir, None)
        for name, (x0, x1) in (('fwingIn', (0.0, FW_SPLIT)), ('fwingOut', (FW_SPLIT, 2.0))):
            poly = [(x0, 2.0), (x1, 2.0), (x1, 3.4), (x0, 3.4)]
            o = cut_region(whole, '%s.%s' % (name, S), [top_prism(poly if s > 0 else mirror_xf(poly), -1.0, 2.0)], coll)
            kit.finish(o, *WING)
            parts[o.name] = o
        kit.bpy.data.objects.remove(whole, do_unlink=True)
        parts['pylon.' + S] = _obj('pylon.' + S, [(aero.nose_pylon(), 'carbon')], coll, mir, WING)
        rear = aero.rear_wing_elements() + [(aero.rear_endplate(), 'carbon'), (aero.swan_neck(), 'carbon')]
        # Both rear halves share the same hinge. The centre actuator is built
        # once, carried by the left half, and stays attached in both modes.
        if not mir:
            rear += aero.rear_actuator()
        parts['rwing.' + S] = _obj('rwing.' + S, rear, coll, mir, WING)
        for axle, front in (('F', True), ('R', False)):
            for g, items in wheels.suspension(front).items():
                name = 'susp%s%s.%s' % (axle, g.capitalize(), S)
                parts[name] = _obj(name, items, coll, mir)
        for axle, front, f, X, R in (('F', True, D.FA, D.FR_X, D.FR_R), ('R', False, D.RA, D.RR_X, D.RR_R)):
            for name, b in (('wheel%s.%s' % (axle, S), wheels.wheel_builder(front)), ('corner%s.%s' % (axle, S), wheels.corner_builder(front))):
                if mir:
                    b.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
                    b.faces = [list(reversed(fc)) for fc in b.faces]
                o = b.build(name, coll)
                o.data.set_sharp_from_angle(angle=0.6)
                o.location = kit.V(s * X, f, R)
                parts[name] = o
    return parts
