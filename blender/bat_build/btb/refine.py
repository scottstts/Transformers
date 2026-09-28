"""Concept armor overlays, attached to the existing mechanical skeleton.

Large planes establish the silhouette; small fasteners belong at real seams.
The chest overlay retracts into the core when folded, using the existing
stow mechanism. Limb detailing is part of the original armor objects.
"""
from . import kit, rkit
from .rkit import Part
from .robot_head import ridge, plate, mirrored


def chest():
    p = Part('R.chest.breastplate')
    for s in (-1,1):
        def shield(points, peak, slot='armor', depth=.045):
            p.add(ridge(mirrored(points,s),(s*peak[0],peak[1],peak[2]),depth),slot)
        # Wide collar wings converge on a projecting central sternum.
        shield([(.025,.80,.71),(.21,.62,1.19),(.83,.37,1.16),
                (1.02,.33,1.05),(.78,.62,.84),(.30,.79,.62)],(.49,.80,.98),'graphite')
        shield([(.045,.818,.73),(.48,.818,.95),(.86,.56,1.087),
                (.75,.655,.932),(.26,.846,.67)],(.48,.84,.86),'armor')
        shield([(.27,.84,.866),(.75,.632,1.043),(.87,.534,1.095),
                (.76,.642,1.016),(.28,.852,.841)],(.51,.764,.953),'bronze',.012)
        # Two separated rib blades leave dark seams beneath the pectorals.
        for k in range(2):
            z=.60-k*.22
            shield([(.045,.77,z),(.67-k*.06,.62,z+.15),(.75-k*.06,.43,z+.12),
                    (.46-k*.08,.62,z-.09),(.12,.78,z-.17)],
                   (.34,.82,z+.005),'armor' if k==0 else 'graphite')
        for k in range(3):
            z=.42-k*.12
            p.add(rkit.hose([(s*.60,.47,z+.05),(s*.49,.63,z),(s*.39,.65,z-.07)],.017,8,2),'darkSteel')
        for x,f,z in ((.84,.44,1.115),(.72,.58,.74)):
            p.add(rkit.cylinder((s*x,f,z),.015,.013,'f',6),'darkSteel')
    p.add(ridge([(-.17,.795,.76),(0,.68,1.23),(.17,.795,.76),
                 (.115,.815,.36),(0,.83,.20),(-.115,.815,.36)],
                (0,.91,.65),.06),'armor')
    p.add(ridge([(-.07,.919,.67),(0,.929,.77),(.07,.919,.67),(0,.926,.49)],
                (0,.94,.65),.009),'blackChrome')
    return p


def limb_detail(part, kind):
    """Blade-shaped overlays interrupt the old constant-width armor tubes."""
    if kind=='upperarm':
        part.add(ridge([(-.17,.22,-.20),(.16,.21,-.23),(.21,.19,-.39),
                        (.02,.28,-.65),(-.16,.24,-.50)],(.01,.34,-.37),.025),'graphite')
    return part


def foot_detail(part):
    # Separate armored metatarsal rails carry the eye along the pointed foot.
    for s in (-1,1):
        part.add(ridge([(s*.055,.21,-.11),(s*.235,.18,-.15),
                        (s*.25,.49,-.25),(s*.09,.56,-.24)],
                       (s*.14,.35,-.085),.025),'graphite')
    return part
