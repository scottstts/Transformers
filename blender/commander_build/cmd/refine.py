"""Reference-specific silhouette and shell corrections for the review pass."""
import math
from . import kit as K


def collar():
    p=K.Part('gorget','chest')
    for s in (-1,1):
        p.add(K.plate([(s*.16,-.12,1.22),(s*.26,-.035,1.53),(s*.40,.08,1.43),
            (s*.43,-.17,1.21),(s*.25,-.29,1.09)],.035,.025),'obsidian')
        p.add(K.plate([(s*.27,-.042,1.48),(s*.37,.009,1.42),(s*.37,-.145,1.23),
            (s*.29,-.22,1.19)],.018,.006),'silver')
        p.add(K.plate([(s*.34,-.128,1.29),(s*.37,-.093,1.34),(s*.39,-.105,1.28),
            (s*.36,-.152,1.25)],.01,.002),'glow')
    return p


def boot(side):
    p=K.Part('wheel-cowl.'+side,'foot.'+side)
    # Curved longitudinal cowl wraps around each tyre, ending above the ground.
    for x in (-.235,.235):
        n=26
        v=[]
        for radius in (.513,.545):
            for j in range(n+1):
                a=math.radians(-55+270*j/n)
                width=.092*(.88+.12*math.sin(math.pi*j/n))
                for xx in (x-width,x+width):
                    v.append((xx,-radius*math.cos(a),-.30+radius*math.sin(a)))
        off=2*(n+1); f=[]
        for j in range(n):
            i=2*j
            f += [(i,i+2,i+3,i+1),(i+off+1,i+off+3,i+off+2,i+off),
                  (i,i+off,i+off+2,i+2),(i+1,i+3,i+off+3,i+off+1)]
        f += [(0,1,off+1,off),(2*n,2*n+off,2*n+off+1,2*n+1)]
        p.add((v,f),'ceramic')
        # Top saddle connects the cowl to the axle fork.
        p.add(K.rod((x,-.09,.13),(math.copysign(.105,x),0,-.03),.045),'steel')
        for a in (-28,32,92,152,193):
            a=math.radians(a)
            for s in (-1,1):
                p.add(K.cyl((x+s*.099,-.526*math.cos(a),-.30+.526*math.sin(a)),.019,.011,'X',6),'steel')
    # Distinct centre nose between the paired wheels.
    p.add(K.carapace([(-.61,.035,.34,-.075,0),(-.45,.079,.40,-.07,0),
        (-.17,.088,.35,-.065,0),(.08,.082,.22,-.035,0),(.17,.052,.14,-.01,0)],95,12,.025),'obsidian')
    p.add(K.plate([(-.018,-.428,-.24),(.018,-.428,-.24),(.015,-.463,-.46),
        (0,-.409,-.57),(-.015,-.463,-.46)],.012,.002),'glow')
    return p


def limb(side,kind):
    p=K.Part('formed-'+kind+'.'+side,kind+'.'+side)
    mir=side=='R'
    if kind=='thigh':
        p.add(K.carapace([(-1.10,.055,.17,-.02,0),(-.95,.17,.25,-.015,0),
            (-.70,.285,.305,-.005,0),(-.44,.31,.30,0,0),(-.25,.235,.25,0,0),
            (-.16,.14,.18,0,0)],105,16),'ceramic',mir)
        p.add(K.plate([(.14,-.239,-.20),(.25,-.174,-.35),(.20,-.266,-.63),
            (.12,-.273,-.78),(.115,-.297,-.42)],.02,.012),'silver',mir)
        p.add(K.plate([(-.08,-.277,-.29),(.012,-.30,-.34),(.049,-.313,-.45),
            (-.012,-.321,-.49),(-.08,-.30,-.40)],.018,.003),'obsidian',mir)
        p.add(K.plate([(-.054,-.296,-.32),(-.012,-.314,-.35),(.018,-.327,-.43),
            (-.013,-.335,-.445)],.007,.001),'glow',mir)
    elif kind=='forearm':
        p.add(K.carapace([(-.84,.095,.145,0,0),(-.71,.13,.19,0,0),(-.46,.215,.265,0,.015),
            (-.29,.235,.257,0,.02),(-.16,.115,.175,0,.01)],108,16),'ceramic',mir)
        p.add(K.plate([(.16,-.165,-.17),(.30,-.03,-.05),(.325,-.08,-.31),
            (.135,-.185,-.77)],.025,.012),'obsidian',mir)
        p.add(K.plate([(.198,-.16,-.25),(.265,-.12,-.19),(.253,-.145,-.37),
            (.17,-.20,-.62)],.012,.004),'glow',mir)
    elif kind=='shin':
        # Cleft knee opening and blade-like ankle point are separate shell lobes.
        for sign in (-1,1):
            outline=[(sign*.06,-.25,-.39),(sign*.18,-.23,-.20),(sign*.28,-.15,-.36),
                (sign*.25,-.24,-.65),(sign*.075,-.20,-1.12),(sign*.018,-.275,-.73)]
            p.add(K.plate(outline,.035,.027),'ceramic',mir)
        p.add(K.carapace([(-.92,.068,.16,.04,0),(-.73,.15,.22,.04,0),
            (-.43,.245,.255,.04,0),(-.28,.215,.215,.04,0)],108,16),'silver',mir)
    return p
