"""The head: a spherical core with a layered helmet (head frame, neck top at
the origin).

A gloss-black helmet shell wraps the sphere with a raised centre ridge. Its
brow comes down to a V over the face, its cheek guards reach low over the
ears and its nape covers the neck. Under the brow sits a pointed black mask
tapering to the chin, with silver cheek plates, a dark visor band and slanted
red eyes. A red crest line runs from between the eyes over the crown between
two silver panels. Two tall swept horns rise from the temples, two shorter
spikes flank the crest and a pair of fins sweep back from the nape.
"""
import math
from mathutils import Vector
from . import kit as K, rig

C, R = rig.HEAD_C, rig.HEAD_R
RH = R + .035                                # helmet outer radius


def _pw(table, x):
    x = abs(x)
    for (a, va), (b, vb) in zip(table, table[1:]):
        if a <= x <= b:
            return K.lerp(va, vb, (x - a) / (b - a))
    return table[-1][1]


RIM = [(0, -6), (28, 14), (46, 12), (66, -38), (110, -48), (150, -34), (180, -30)]


def _helmet_r(az, el):
    ridge = .022 * math.exp(-(az / 9.0) ** 2) * max(0.0, min(1.0, (el + 6) / 20))
    return RH + ridge


def _meridian(az, el0, el1, half, r0, r1, n=16):
    """Strip following the helmet's meridian at azimuth az (a crest line)."""
    rings = []
    a0 = math.radians(az)
    for k in range(n + 1):
        el = math.radians(K.lerp(el0, el1, k / n))
        base = _helmet_r(az, math.degrees(el))
        d = Vector((math.cos(el) * math.sin(a0), -math.cos(el) * math.cos(a0), math.sin(el)))
        side = Vector((math.cos(a0), math.sin(a0), 0))
        p0, p1 = C + d * (base + r0), C + d * (base + r1)
        rings.append([p0 - side * half, p0 + side * half, p1 + side * half * .6, p1 - side * half * .6])
    return K.ring_loft(rings)


def parts():
    p = K.Part('head', 'head', bevel=.006, angle=26)
    p.add(K.ball(C, R, 24, 12), 'structure')
    helmet = K.sphere_shell(C, _helmet_r, .03, lambda az: _pw(RIM, az), 48, 12)
    p.add(helmet, 'obsidian')
    hb = K.bvh_of(helmet)
    # pointed mask under the brow
    mask_st = [(.34, K.sec(.36, .3, .5, .5, -.1)), (.22, K.sec(.42, .32, .5, .5, -.11, keel=.02)),
               (.1, K.sec(.38, .3, .55, .5, -.12, keel=.04)), (0, K.sec(.27, .26, .6, .5, -.12, keel=.05)),
               (-.1, K.sec(.13, .18, .6, .5, -.1, keel=.04)), (-.17, K.sec(.03, .06, .5, .5, -.07))]
    mask = K.loft(mask_st, .01)
    p.add(mask, 'obsidian', False, True)
    mb = K.bvh_of(mask)
    face = K.tangent_frame((0, -.3, .19), (0, -1, 0))
    visor = K.conform_plate(mb, face, [(-.2, -.035), (0, -.07), (.2, -.035), (.21, .06), (-.21, .06)], .012, rings=1)
    p.add(visor, 'visor')
    vb = K.bvh_of(visor)
    for m in (False, True):
        p.add(K.conform_plate(vb, face, [(.03, -.03), (.175, .02), (.17, .05), (.045, .0)], .01, bevel=.003, rings=1), 'glow', m)
        cheek = K.tangent_frame((.14, -.22, .03), (.7, -1, 0))
        p.add(K.conform_plate(mb, cheek, [(-.07, .06), (.06, .07), (.04, -.05), (-.05, -.12)], .014, rings=1), 'silver', m)
    for k in range(3):
        z = .02 - k * .035
        w = .07 - k * .015
        p.add(K.conform_plate(mb, K.tangent_frame((0, -.3, z), (0, -1, 0)), [(-w, -.007), (w, -.007), (w, .007), (-w, .007)], .01, bevel=.003, rings=1), 'steel')
    # crest: black keel carrying the red line from the brow over the crown, silver side panels
    p.add(_meridian(0, -4, 70, .045, -.01, .02), 'obsidian')
    p.add(_meridian(0, -2, 64, .016, .012, .03, 18), 'glow')
    for m in (False, True):
        panel = K.sphere_patch(C, RH + .012, .02, 12, 34, lambda az: 26 - (az - 12) * .3, 70, 5, 8)
        p.add(panel, 'silver', m)
        # temple housings the horns grow from
        tf = K.tangent_frame(C + Vector((RH, .02, .07)), (1, .1, .15))
        temple = K.conform_plate(hb, tf, [(-.1, -.1), (.08, -.12), (.1, .08), (-.04, .13)], .035, rings=2)
        p.add(temple, 'obsidian', m)
        p.add(K.conform_plate(K.bvh_of(temple), tf, [(-.05, -.03), (.03, -.05), (.03, -.02), (-.05, 0)], .012, bevel=.004, rings=1), 'glow', m)
        # horns: tall pair from the temples, short pair beside the crest, nape fins
        p.add(K.spike([(.26, .02, .26, .05, .035), (.3, .04, .5, .042, .026, -8), (.35, .07, .74, .026, .016, -14), (.41, .1, .98, .002, .002, -18)], 6), 'obsidian', m)
        p.add(K.spike([(.285, .0, .34, .012, .03), (.32, .025, .54, .01, .022), (.37, .06, .78, .002, .002)], 5), 'silver', m)
        p.add(K.spike([(.1, -.06, .44, .032, .03), (.12, -.05, .58, .026, .022), (.155, -.02, .82, .002, .002)], 6), 'obsidian', m)
        p.add(K.spike([(.16, .19, .32, .035, .02), (.2, .33, .42, .024, .015), (.25, .5, .56, .002, .002)], 6), 'obsidian', m)
    return [p]
