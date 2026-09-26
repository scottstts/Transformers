"""Robot endpoint panel tailoring, while keeping the authored truck intact.

Named, editable shape keys capture telescoped panel envelopes. These are a
modeling allowance, not a claim that the final transformation is engineered.
The truck Basis is never changed. Values follow the same time warp as the
rig bake, so scrubbing and reopening the saved blend work without handlers.
"""
import bpy
from mathutils import Vector
from . import motion, bake
from .shape import smooth01, clamp01

KEY = 'Robot panel nesting'


def tailored(base,p,side=1,on=''):
    """Final panel envelope in its carrying bone's frame."""
    x,f,z=p.x,-p.y,p.z
    if base == 'clip':
        x *= 0.70+0.30*clamp01((z+0.70)/2.20)
        f = 0.16+0.45*f
        z = 0.49+0.52*z
        if on.startswith('mirror'):
            x *= 0.78
            f -= 0.32
    elif base in ('pylon','pylonF'):
        x = side*1.05+(x-side*0.92)*0.79
        f = -0.35+(f-0.15)*0.55
        z = 0.38+(z-0.72)*0.78-0.22*(abs(x)-1.0)
        if base=='pylonF':
            f-=0.14
            z-=0.06
    elif base == 'door':
        x = side*0.40+(x-side*0.46)*0.80
        f *= 0.58
        z = -0.66+(z+0.62)*0.54
    elif base in ('thighPlate','thighBack'):
        f *= 0.69
        z = -0.80+(z+0.92)*0.64
        if base == 'thighBack': x *= 0.85
    elif base.startswith('van'):
        x *= 0.78
        f = -0.78+(f+0.78)*0.53
        z = 0.40+(z-0.40)*0.74
    return Vector((x,-f,z))


def attachment(W,N,target,attach,T):
    """Carry the support hardware along with its panel's changing envelope.

    Convert the attachment through the END pose before deformation, exactly
    as the shape key does, then return it through the CURRENT assembly pose.
    """
    point=N[target]@attach
    if T is None or T<=0.30: return point
    sc=bpy.app.driver_namespace.get('semi_state',{}).get('scene')
    if sc is None or target not in getattr(sc,'robot_fit_frames',{}): return point
    M,side,base=sc.robot_fit_frames[target]
    shifted=M.inverted()@tailored(base,M@attach,side)
    return N[target]@attach.lerp(shifted,amount(T))


def build(sc):
    W = motion.world(1.0, sc.skel)[0]
    N = bake.node_worlds(sc, 1.0, W)
    sc.robot_keys = []
    sc.robot_fit_frames = {}
    for name, assembly in sc.asm.items():
        base = name.split('.')[0]
        side = -1 if name.endswith('.R') else 1
        host = 'chest' if base.startswith('van') else assembly.host
        if host.startswith('@'):
            host = sc.asm[host[1:]].host
        if base not in ('clip','pylon','pylonF','door','thighPlate','thighBack',
                        'van0','van1','van2','van3','van4','vanBogie'):
            continue
        sc.robot_fit_frames[name]=(W[host].inverted()@N[name],side,base)
        for on in assembly.parts:
            o = bpy.data.objects[on]
            M = W[host].inverted() @ N[name] @ o.matrix_basis
            inv = M.inverted()
            if o.data.shape_keys is None:
                o.shape_key_add(name='Basis')
            basis = o.data.shape_keys.key_blocks[0]
            key = o.data.shape_keys.key_blocks.get(KEY) or o.shape_key_add(name=KEY)
            # Wheels relocate with the nested bogie, but remain rigid: the
            # trailer's nonuniform compression must never squash the tires.
            wheel_shift = None
            if on.startswith('wheelV.'):
                center = sum((M @ v.co for v in basis.data), Vector()) / len(basis.data)
                wheel_shift = tailored(base,center,side,on) - center
            for v, dst in zip(basis.data, key.data):
                p = M @ v.co
                dst.co = inv @ (p + wheel_shift if wheel_shift is not None else tailored(base,p,side,on))
            o['robot_design'] = ('Rigid wheel relocation; original proportions preserved' if wheel_shift is not None
                                 else 'Nested cab panel; Basis preserves truck geometry')
            sc.robot_keys.append(key)
    return len(sc.robot_keys)


def amount(T):
    return smooth01((T-0.30)/0.48)


def apply(sc,T):
    for key in getattr(sc,'robot_keys',[]):
        key.value=amount(T)


def keyframes(sc,frames):
    for key in getattr(sc,'robot_keys',[]):
        for frame in frames:
            key.value=amount(sc.warp[frame])
            key.keyframe_insert(data_path='value',frame=frame,group='Robot panel nesting')
