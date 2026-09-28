"""Rear cooling outlets, exhaust and crash structure, authored as fitted shells.

The underfloor owns the diffuser. This module contains only the central
power-unit hardware and beam wings above it; everything rides the tail.
"""
import math
from . import kit, aero, rkit
from .shape import loft_rings, squircle, smooth01, resample


def hardware(coll):
    b=kit.Builder()
    # Tapered, rounded crash spine, merging into a faired rain-light housing.
    # This follows the space between the cooling outlets and diffuser roof.
    rows=[]
    for f,w,h,z in ((-1.76,.126,.063,.358),(-1.90,.120,.062,.360),
                     (-2.02,.100,.057,.359),(-2.16,.068,.063,.357),
                     (-2.275,.057,.073,.351),(-2.302,.053,.069,.351)):
        rows.append([(x,f,z+zz) for x,zz in squircle(w,h,3.6,40)])
    b.add_mesh(loft_rings(rows,True,True),'carbon')
    # The body surface itself supplies the rolled cooling-exit lip and
    # carbon inner skin. A recessed dark plenum closes the cavity well
    # forward of the opening, leaving real depth around the exhaust.
    from .bodycage import STATIONS
    half=next(pts for f,pts in STATIONS if f==-1.780)
    outline=half+[(-x,z) for x,z in reversed(half[1:-1])]
    mouth=resample(outline,64)
    rows=[[(x*.93,f,.43+(z-.43)*.93) for x,z in mouth] for f in (-1.795,-1.770)]
    b.add_mesh(loft_rings(rows,True,True),'interior')
    # A thin rolled titanium lip and a separate dark bore. The pipe has no
    # bright end cap; the black back wall is recessed inside the body.
    rows=[]
    for f,r in ((-1.80,.048),(-1.96,.053),(-2.17,.055),(-2.208,.0545),
                (-2.212,.0525),(-2.208,.0505)):
        rows.append([(r*math.cos(a),f,.463+r*math.sin(a)) for a in (math.tau*k/64 for k in range(64))])
    b.add_mesh(loft_rings(rows,False,False),'titanium')
    bore=[]
    for f,r in ((-2.208,.0505),(-2.10,.050),(-1.94,.047),(-1.78,.043)):
        bore.append([(r*math.cos(a),f,.463+r*math.sin(a)) for a in (math.tau*k/64 for k in range(64))])
    b.add_mesh(loft_rings(bore,False,True),'interior')
    # Smooth structural necks run up from the spine into the existing
    # swan-neck hinge locations; broad roots blend into the fairing.
    for side in (-1,1):
        rows=[]
        for z,x,f,w,h in ((.366,.085,-2.095,.042,.090),
                          (.408,.101,-2.106,.027,.063),
                          (.485,.112,-2.119,.017,.041),
                          (.559,.112,-2.120,.015,.037)):
            rows.append([(side*(x+xx),f+ff,z) for xx,ff in squircle(w,h,3,24)])
        b.add_mesh(loft_rings(rows,True,True),'carbon')
    # Sculpted beam wings: centre relief for the exhaust, rising outer
    # shoulders and a longer lower plane immediately above the diffuser.
    for z,fore,chord,inc in ((.405,-2.075,.182,-.22),(.315,-2.104,.205,-.27)):
        mesh=aero._el(.044,.548,32,
                     lambda t:fore+.055*smooth01(t),
                     lambda t:z+.037*smooth01(t),
                     lambda t:chord-.020*t,
                     lambda t:inc-.08*t,
                     lambda t:.068,lambda t:-.046,tips=(False,False))
        b.add_mesh(mesh,'carbon')
        b.add_mesh(kit.mirror_x(mesh),'carbon')
    # Lens recessed into the end of the crash spine, with a proper bezel.
    loop=kit.fillet_poly([(-.045,.291),(.045,.291),(.045,.411),(-.045,.411)],.012,6)
    rows=[[(x,f,z) for x,z in loop] for f in (-2.296,-2.310)]
    b.add_mesh(loft_rings(rows,True,True),'interior')
    for x in range(4):
        for z in range(6):
            cx=(x-1.5)*.019
            cz=.305+z*.018
            b.add_mesh(rkit.plate_f([(cx-.006,cz-.006),(cx+.006,cz-.006),
                                     (cx+.006,cz+.006),(cx-.006,cz+.006)],
                                    -2.312,-2.309,.002,3),'lightRed')
    return b.build('rearStructure',coll)
