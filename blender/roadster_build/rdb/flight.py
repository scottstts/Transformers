"""The flight the transformation is timed to (seconds; T = t / DURATION).

The Blender scene carries no altitude. The game adds this module's altitude
A(t) through the asset's lift track, so that the assembly's centre (the
chest-pelvis midpoint, CENTRE) follows W(t):

  0.0 - LIFTOFF   on the ground: lift jets out, wing up
  LIFTOFF - BOOST thrust: constant acceleration up from rest
  BOOST - TOUCH   ballistic: one parabola under G_EFF, apex at APEX
  TOUCH - 9.0     on the ground: impact, hero landing, rise to the stand

A(t) = W(t) - c(t), c(t) being the baked centre's height (bake.py), so the
centre's world path is exactly W whatever the baked poses do. W is fitted to
the baked centre at lift-off and at touch-down, so A is 0 on the ground and
continuous at both ends. Played backward (robot to car) the same track is a
crouch, a jump, the flip at the apex and a thrust-braked landing.

The backflip turns about the centre at a rate that peaks at the apex (the tuck),
over FLIP_IN .. FLIP_OUT.
"""
import math

DURATION = 9.0
FPS = 30
FRAMES = int(DURATION * FPS)        # 270

LIFTOFF = 0.80
BOOST = 1.60
APEX = 4.00
TOUCH = 6.60
FLIP_IN, FLIP_OUT = 2.80, 5.20


def T(t):
    return t / DURATION


def secs(T_):
    return T_ * DURATION


def solve(c0, c1):
    """Boost acceleration a, gravity g and apex height Wa so that W starts at
    rest at c0 at LIFTOFF, peaks at APEX and lands at c1 at TOUCH."""
    tb, ta, tl = BOOST - LIFTOFF, APEX - BOOST, TOUCH - APEX
    # a*tb = g*ta ; c0 + a*tb^2/2 + g*ta^2/2 = Wa ; Wa = c1 + g*tl^2/2
    # -> c0 + g*ta*tb/2 + g*ta^2/2 = c1 + g*tl^2/2
    g = (c1 - c0) / (ta * tb / 2 + ta * ta / 2 - tl * tl / 2)
    a = g * ta / tb
    Wa = c1 + g * tl * tl / 2
    return a, g, Wa


def W(t, c0, c1):
    """World height of the assembly's centre."""
    a, g, Wa = solve(c0, c1)
    if t <= LIFTOFF:
        return c0
    if t <= BOOST:
        u = t - LIFTOFF
        return c0 + a * u * u / 2
    if t <= TOUCH:
        return Wa - g * (t - APEX) ** 2 / 2
    return c1


def flip_angle(t):
    """Backflip about x (radians, negative = nose up and over). The launch's
    slight nose-up is in the body pose; this is the whole-assembly turn, its rate
    a smooth bell centred on the apex."""
    if t <= FLIP_IN:
        return 0.0
    if t >= FLIP_OUT:
        return -math.tau
    u = (t - FLIP_IN) / (FLIP_OUT - FLIP_IN)
    # integral of a smooth bell: smootherstep keeps rate and acceleration zero at both ends
    s = u * u * u * (u * (u * 6 - 15) + 10)
    return -math.tau * s
