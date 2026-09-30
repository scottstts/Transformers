"""Reference-led continuous crown, pointed mask and swept temple blades.

Metallic forehead bands are surfaces of the cranial cage, never slabs laid
on a sphere. Front and side silhouettes are constrained independently.
"""
import math
from . import kit as K


def build():
    p=K.Part('helmet','head')
    # z / half width / foremost y / rearmost y; chin recedes under the brow.
    rows=[(-.105,.025,-.133,.049),(-.065,.071,-.176,.082),
        (.010,.128,-.201,.135),(.105,.182,-.225,.182),
        (.205,.215,-.247,.208),(.285,.230,-.248,.220),
        (.375,.225,-.219,.227),(.455,.202,-.174,.220),
        (.523,.160,-.116,.198),(.571,.109,-.051,.160),
        (.601,.054,.010,.112),(.611,.008,.057,.073)]
    n=48; verts=[]
    for z,w,front,back in rows:
        for j in range(n):
            a=math.tau*j/n; yc=(front+back)/2; d=(back-front)/2
            x=w*math.sin(a); y=yc-d*math.cos(a)
            if z<.205 and math.cos(a)>0: y+=.042*abs(math.sin(a))
            verts.append((x,y,z))
    byslot={}
    for k in range(len(rows)-1):
        z=(rows[k][0]+rows[k+1][0])/2
        for j in range(n):
            ang=min((j+.5)*360/n,360-(j+.5)*360/n)
            slot='obsidian'
            if z>.30 and 8<ang<32: slot='steel'
            if z>.30 and 32<ang<48: slot='structure'
            if .01<z<.27 and ang<65: slot='visor'
            byslot.setdefault(slot,[]).append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    byslot['obsidian'] += [tuple(reversed(range(n))),tuple(range((len(rows)-1)*n,len(rows)*n))]
    for slot,faces in byslot.items(): p.add((verts,faces),slot)
    for s in (-1,1):
        mir=s<0
        p.add(K.plate([(.028,-.253,.218),(.079,-.251,.240),(.167,-.197,.292),
            (.200,-.142,.307),(.159,-.203,.267),(.071,-.258,.217)],.009,.002),'glow',mir)
        p.add(K.plate([(.020,-.248,.237),(.085,-.248,.267),(.165,-.192,.317),
            (.219,-.085,.325),(.188,-.153,.293),(.080,-.254,.242)],.013,.004),'obsidian',mir)
        p.add(K.plate([(.164,-.194,.236),(.194,-.147,.221),(.178,-.132,.111),
            (.066,-.181,-.054),(.099,-.204,.043),(.158,-.193,.149)],.014,.004),'steel',mir)
        p.add(K.plate([(.100,-.214,.153),(.159,-.183,.187),(.129,-.181,.077),
            (.027,-.171,-.076),(.072,-.211,.049)],.009,.004),'obsidian',mir)
        # Angular swept housing, no exposed circular ear pieces.
        p.add(K.plate([(.189,-.069,.338),(.238,-.019,.332),(.251,.090,.289),
            (.214,.157,.152),(.172,.111,.065),(.185,-.013,.148)],.027,.008),'obsidian',mir)
        p.add(K.plate([(.220,-.022,.321),(.248,.054,.303),(.231,.107,.247),
            (.215,.071,.263)],.008,.002),'silver',mir)
        p.add(K.plate([(.207,-.023,.283),(.225,.004,.267),(.215,.032,.225),
            (.199,.006,.237)],.008,.002),'crimson',mir)
        p.add(K.spike([(.201,.026,.217,.038,.047),(.253,.052,.350,.032,.040),
            (.281,.075,.527,.020,.023),(.336,.124,.979,.0006,.0006)],8),'obsidian',mir)
        p.add(K.spike([(.243,.018,.360,.009,.010),(.273,.052,.530,.008,.009),
            (.335,.122,.969,.0005,.0005)],6),'steel',mir)
        p.add(K.spike([(.172,.172,.300,.039,.047),(.198,.211,.452,.022,.028),
            (.196,.296,.786,.0006,.0006)],8),'obsidian',mir)
        p.add(K.spike([(.181,.111,.174,.036,.037),(.240,.206,.261,.032,.029),
            (.324,.391,.408,.0006,.0006)],6),'silver',mir)
        p.add(K.plate([(.158,.165,.104),(.197,.178,.186),(.183,.229,.227),
            (.101,.206,.058)],.018,.004),'structure',mir)
    seam=[(.566,.011,-.061),(.523,.015,-.121),(.455,.016,-.179),
          (.375,.013,-.224),(.285,.005,-.253),(.254,.0008,-.255)]
    for i in range(len(seam)-1):
        z,w,y=seam[i]; zz,ww,yy=seam[i+1]
        p.add(K.plate([(-w,y,z),(w,y,z),(ww,yy,zz),(-ww,yy,zz)],.006,.001),'glow')
    return p
