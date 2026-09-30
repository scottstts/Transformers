"""Recessed service panels, red channels, pins and exposed joint hardware."""
import math
from . import kit as K


def parts():
    out=[]
    p=K.Part('cuirass-detail','chest')
    for s in (-1,1):
        mir=s<0
        p.add(K.plate([(.28,-.534,.61),(.73,-.445,.78),(.70,-.45,.70),(.29,-.54,.55)],.016,.002),'obsidian',mir)
        for j in range(5):
            x=.33+j*.074; z=.57+j*.028
            p.add(K.plate([(x,-.548+(x-.33)*.20,z),(x+.027,-.542+(x-.33)*.20,z+.011),(x+.027,-.542+(x-.33)*.20,z+.045),(x,-.548+(x-.33)*.20,z+.034)],.016,.001),'steel',mir)
        p.add(K.plate([(.39,-.377,.31),(.61,-.365,.46),(.59,-.366,.41),(.37,-.38,.26)],.015,.002),'glow',mir)
        for x,y,z in [(.29,-.48,.81),(.70,-.385,1.08),(.78,-.43,.86)]:
            p.add(K.cyl((s*x,y-.02,z),.024,.014,'Y',6),'steel')
        p.add(K.plate([(.43,.435,.51),(.65,.390,.71),(.67,.39,.66),(.45,.43,.46)],-.015,-.005),'glow',mir)
    p.add(K.plate([(-.023,.537,1.13),(.023,.537,1.13),(.027,.551,.36),(0,.52,.24),(-.027,.551,.36)],-.025,-.005),'glow')
    for z in (.37,.55,.74,.93,1.10):
        p.add(K.cyl((0,.55,z),.057,.08,'Y',8),'steel')
    out.append(p)
    for side in ('L','R'):
        mir=side=='R'; s=-1 if mir else 1
        for bone in ('upperarm','forearm','thigh','shin'):
            p=K.Part(bone+'-detail.'+side,bone+'.'+side)
            def add(m,slot): p.add(m,slot,mir)
            if bone=='upperarm':
                add(K.plate([(.06,-.40,.20),(.32,-.40,.17),(.28,-.425,.10),(.08,-.41,.13)],.016,.001),'obsidian')
                add(K.plate([(.26,-.28,-.20),(.46,-.19,-.08),(.43,-.22,-.16),(.27,-.30,-.24)],.012,.002),'glow')
                add(K.panel([(-.035,-.37),(.04,-.37),(.025,-.62),(-.03,-.61)],-.287,.013,.002),'crimson')
                for z in (-.38,-.46,-.54):
                    add(K.rod((-.12,.17,z),(.12,.17,z-.02),.025),'steel')
                for x,y,z in [(.18,-.452,-.23),(-.08,-.355,.08),(.41,-.32,.10)]:
                    add(K.cyl((x,y,z),.022,.014,'Y',6),'steel')
                for x in (-.22,.22):
                    add(K.ring((x,0,0),.205,.15,.024),'obsidian')
            elif bone=='forearm':
                add(K.rod((-.13,.08,-.27),(-.095,.06,-.69),.038),'steel')
                add(K.ring((.24,0,0),.10,.065,.018),'crimson')
            elif bone=='thigh':
                add(K.plate([(-.18,-.288,-.73),(-.1,-.322,-.80),(-.08,-.32,-1.01),(-.20,-.28,-.85)],.02,.01),'silver')
                for x,y,z in [(.20,-.242,-.59),(-.14,-.279,-.41),(.10,-.199,-.96)]:
                    add(K.cyl((x,y,z),.022,.017,'Y',6),'steel')
                add(K.rod((.24,.13,-.24),(.15,.12,-.99),.047),'steel')
            else:
                add(K.panel([(-.032,.12),(.032,.12),(.03,-.15),(0,-.26),(-.03,-.15)],-.356,.017,.003),'glow')
                add(K.plate([(.03,-.337,-.54),(.10,-.326,-.60),(.016,-.297,-.99),(-.036,-.308,-.87)],.019,.005),'obsidian')
                add(K.plate([(-.10,-.30,-.45),(-.15,-.291,-.50),(-.11,-.30,-.67),(-.065,-.326,-.63)],.022,.005),'silver')
                for x,y,z in [(-.19,-.24,-.35),(.18,-.265,-.45),(-.05,-.30,-.87)]:
                    add(K.cyl((x,y,z),.022,.014,'Y',6),'steel')
                add(K.ring((.244,0,0),.16,.11,.025),'obsidian')
                add(K.ring((.258,0,0),.094,.073,.022),'crimson')
            out.append(p)
        p=K.Part('hip-markings.'+side,'pelvis')
        p.add(K.plate([(s*.33,-.285,.28),(s*.38,-.27,.32),(s*.42,-.235,.16),(s*.37,-.27,.11)],.013,.007),'glow')
        out.append(p)
        p=K.Part('wheel-hardware.'+side,'wheel.'+side)
        for x in (-.235,.235):
            for k in range(12):
                a=math.tau*k/12
                for dx in (-.121,.121):
                    p.add(K.cyl((x+dx,.245*math.sin(a),.245*math.cos(a)),.013,.014,'X',6),'steel')
            # Discrete tread blocks; their corners stay inside the .48 m tyre radius.
            for k in range(32):
                a=math.tau*k/32
                b=a+.038
                v=[]
                for xx in (x-.068,x+.068):
                    for rr,ang in [(.471,a),(.479,a),(.479,b),(.471,b)]:
                        v.append((xx,rr*math.sin(ang),rr*math.cos(ang)))
                p.add((v,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]),'rubber')
        out.append(p)
    return out
