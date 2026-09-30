"""Open split gorget and exposed cervical mechanism from the reference."""
from . import kit as K
from .head import panel


def closed_ring(z):
    """Weld the coincident ends of the kit's revolved annular profile."""
    verts, faces = K.ring((0,.043,z),.101,.071,.019,'Z',24)
    unique, lookup, remap = [], {}, []
    for v in verts:
        key = tuple(round(c,8) for c in v)
        if key not in lookup:
            lookup[key] = len(unique)
            unique.append(v)
        remap.append(lookup[key])
    return unique, [[remap[i] for i in face] for face in faces]


def collar():
    p = K.Part('collar','chest',bevel=.003,angle=36)
    for mirrored in (False,True):
        p.add(panel([(.105,-.280,1.135),(.281,-.289,1.215),
                     (.433,-.145,1.270),(.350,.102,1.595),
                     (.269,.158,1.570),(.197,.040,1.337)],.028,
                    (.320,-.060,1.346)), 'silver',mirrored)
        p.add(panel([(.131,-.291,1.158),(.275,-.300,1.237),
                     (.404,-.151,1.291),(.337,.086,1.576),
                     (.281,.120,1.548),(.218,.011,1.334)],.021,
                    (.320,-.078,1.350)), 'obsidian',mirrored)
        p.add(panel([(.272,-.303,1.205),(.472,-.222,1.212),
                     (.435,-.083,1.378),(.396,-.087,1.367),
                     (.374,-.181,1.285)],.022,(.418,-.206,1.274)),
              'ceramic',mirrored)
        p.add(panel([(.313,-.270,1.248),(.371,-.222,1.283),
                     (.371,-.208,1.316),(.315,-.254,1.288)],.007),
              'optic',mirrored)
        p.add(K.hex_bolt((.413,-.197,1.274),(.4,-1,.2),.012,.005),
              'steel',mirrored)
        p.add(panel([(.155,.190,1.184),(.300,.210,1.219),
                     (.332,.177,1.483),(.270,.124,1.554),
                     (.199,.147,1.365)],.025,(.272,.236,1.341),
                    inward=(0,-1,0)), 'obsidian',mirrored)
    p.add(panel([(-.187,-.254,1.212),(0,-.321,1.094),
                 (.187,-.254,1.212),(.110,-.207,1.230),
                 (0,-.271,1.155),(-.110,-.207,1.230)],.018), 'structure')
    return p


def neck():
    p = K.Part('neck','neck',bevel=.002,angle=38)
    p.add(K.cyl((0,.045,.098),.077,.31,'Z',20), 'structure')
    for z in (-.015,.031,.077,.123,.169,.215):
        p.add(closed_ring(z), 'obsidian')
    for mirrored in (False,True):
        p.add(K.rod((.126,.080,-.035),(.094,.063,.256),.021,10),
              'steel',mirrored)
        p.add(K.rod((.098,-.051,-.030),(.071,-.035,.179),.018,10),
              'structure',mirrored)
        p.add(panel([(.018,-.114,-.080),(.118,-.067,.052),
                     (.080,-.076,.161),(.038,-.105,.128)],.014,
                    (.067,-.128,.049)), 'obsidian',mirrored)
    p.add(panel([(-.036,.146,.224),(.036,.146,.224),
                 (.044,.157,-.014),(0,.155,-.067),(-.044,.157,-.014)],
                .013,inward=(0,-1,0)), 'structure')
    return p
