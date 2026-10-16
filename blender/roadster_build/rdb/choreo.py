"""Transformation choreography, timed in seconds to the flight (flight.py).

  0.0 - 0.8   on the ground: lift jets out, wing up, flaps open
  0.8 - 2.0   lift-off and boost; the car stays whole and level
  2.0 - 3.0   opening: gullwing doors up, windscreen slides under the hood,
              the cabin retracts into the floor tub, the roof folds into the
              tail, the tub swings clear below; the robot rises out of the
              floor through the open cabin
  2.8 - 5.2   the backflip about the assembly's centre, the apex (4.0) at its
              middle in a tuck; tail, tub, doors and wheels travel to their docks
  4.6 - 6.6   descent: opening out, legs reaching down, wing and flaps stowed
  6.6         touch-down; impact, the hero landing (7.3), the rise to the
              stand the live gait takes over from (9.0)

Everything is authored in the body frame (the car's frame at t = 0); bake.py
turns it through the flip and the game adds the altitude.

  skeleton  pose keys: the pelvis's body-frame placement plus every joint's local
            rotation (XYZ degrees) and telescoping slide; monotone cubic
            interpolation through the keys (no overshoot, no stops at keys)
  growth    in the car the robot is a MINI scale miniature; each chain grows
            about its joints (castings and bone offsets together)
  carriers  (t, host, pose) keys; a host is 'body', a skeleton bone or another
            carrier (its car frame riding with it); 'car' = where it sat in the
            car relative to that host at t = 0, 'hold' = keep the world pose at a
            hand-over, 'dock' = its dock on the robot (dock.py), ('carpose', M) =
            a car-space map applied to the car pose. Segments that turn more than
            15 deg swing about the motion's screw axis (a hinge), others glide.
"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from . import rig, dock, flight as FL

FRAMES = FL.FRAMES


def E(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


def smooth(t, a, b):
    from .kit import smooth as s
    return s(t, a, b)


# ---------------------------------------------------------------- growth

MINI = {'core': 0.32, 'arm': 0.26, 'leg': 0.24}    # each chain's scale while stowed
GROW = {'core': (2.60, 3.90), 'arm': (2.40, 3.70), 'leg': (3.15, 4.40)}   # seconds
PIVOT = {}       # chain growth pivots (bone-local); default the joint
NOSE_SLIDE = Vector((0, 0.025, 0.17))   # in the car the chest core rides this far up (and back) in the nose clip


def group(bone):
    if bone in ('head', 'neck'):
        return None
    if bone in ('pelvis', 'spine', 'chest') or bone.startswith('hip.'):
        return 'core'
    if bone.startswith(('thigh.', 'shin.', 'foot.', 'toe.')):
        return 'leg'
    return 'arm'


def growth(bone, t):
    g = group(bone)
    if g is None:
        return 1.0
    a, b = GROW[g]
    m = MINI[g]
    return m + (1 - m) * smooth(t, a, b)


def offset_scaled(bone, t):
    """A bone's offset from its parent at time t: scaled with the chain it belongs
    to (the neck with the chest), about its parent's growth pivot."""
    p = rig.PARENT[bone]
    off = rig.OFFSET[bone]
    if p is None:
        return off.copy()
    k = growth(bone if group(bone) else p, t)
    P = PIVOT.get(p, Vector())
    return P + (off - P) * k


def casting_matrix(bone, off, t):
    """A casting's nest matrix in its bone frame: scaled about the bone's pivot."""
    k = growth(bone, t)
    P = PIVOT.get(bone, Vector())
    return Matrix.Translation(P) @ Matrix.Diagonal((k, k, k, 1.0)) @ Matrix.Translation(off - P)


# ---------------------------------------------------------------- poses
# pose = {'root': ((x, y, z), (rx, ry, rz)), bone: (rx, ry, rz) | ((rx, ry, rz), (dx, dy, dz))}

def _rot(v):
    if isinstance(v, tuple) and len(v) == 2 and isinstance(v[0], (tuple, list)):
        return v[0], v[1]
    return v, (0, 0, 0)


def chest_car():
    """The chest's car-mode frame: NOSE_SLIDE above its dock in the nose clip, so
    the curled miniature sits inside the clip's cavity; the clip slides down onto
    it as the robot unfolds."""
    return Matrix.Translation(NOSE_SLIDE) @ dock.D_nose().inverted() @ rig.rest('chest')


def car_pose():
    """Folded in the car, fitted so every casting's support points lie in the car's
    hidden volumes: the nose interior under the hood and cowl and the footwell
    under the dash. The chest stands in the nose clip with the miniature torso
    folded back under it, the legs curled up sideways and the arms folded, all in
    the footwell (open once the cabin has folded into the tub; nothing is stowed in
    the tub, so it swings clear without crossing anything); the head is bowed
    forward under the cowl. The root follows from the anchored chest."""
    p = {'spine': (-100, 0, 0), 'chest': (-100, 0, 0), 'neck': ((120, 0, 0), (0, 0, 0.04)), 'head': (-21, 0, 0)}
    for S, s in (('L', 1), ('R', -1)):
        p['upperarm.' + S] = (90, -s * 68, 0)
        p['forearm.' + S] = (-140, 0, 0)
        p['hand.' + S] = (60, 0, 0)
        p['thigh.' + S] = (-140, -s * 90, 0)
        p['shin.' + S] = (155, 0, 0)
    t = 0.0
    q_s, q_c = E(*_rot(p['spine'])[0]), E(*_rot(p['chest'])[0])
    L = Matrix.Translation(offset_scaled('spine', t)) @ q_s.to_matrix().to_4x4() @ \
        Matrix.Translation(offset_scaled('chest', t)) @ q_c.to_matrix().to_4x4()
    root = chest_car() @ L.inverted()
    loc = root.translation
    # the fold is a pure pitch: keep it one x angle (an Euler decomposition can come out
    # as the equivalent (x+180, 180, 180), and interpolating those spins the body against
    # the flip), wrapped so that unfolding turns the same way as the backflip
    R = root.to_3x3()
    ax = math.degrees(math.atan2(R[2][1], R[1][1]))
    while ax < ROOT_UNFOLD_FROM:
        ax += 360.0
    p['root'] = ((loc.x, loc.y, loc.z), (ax, 0.0, 0.0))
    return p


ROOT_UNFOLD_FROM = 40.0     # the next key's root pitch (rise_pose): the fold unwinds backward to it


def arms_up_pose():
    """The cabin folded away: the arms rise straight up out of the footwell, clear
    of the fenders, before they reach out over the sills for the doors."""
    p = car_pose()
    p['neck'] = ((70, 0, 0), (0, 0, 0.0))
    for S, s in (('L', 1), ('R', -1)):
        p['upperarm.' + S] = (-150, -s * 10, 0)
        p['forearm.' + S] = (-30, 0, 0)
        p['hand.' + S] = (0, 0, 0)
    return p


def doors_pose():
    """The cabin gone: still lying in the floor (the tub has not lifted yet), the
    arms rise out of the footwell through the door openings to take the doors,
    the head lifts out of the cowl."""
    p = car_pose()
    p['neck'] = ((40, 0, 0), (0, 0, 0.0))
    p['head'] = (-10, 0, 0)
    for S, s in (('L', 1), ('R', -1)):
        p['upperarm.' + S] = (ARM_REACH[0], -s * ARM_REACH[1], 0)
        p['forearm.' + S] = (ARM_REACH[2], 0, 0)
        p['hand.' + S] = (0, 0, 0)
    return p


ARM_REACH = (60, 100, -30)    # upper arm x, abduction, elbow at the door grab (fitted to the open doors)


def doors_held():
    """The doors taken and swinging out: the torso and legs still in the floor
    until the tub has lifted clear of them."""
    p = doors_pose()
    for S, s in (('L', 1), ('R', -1)):
        p['upperarm.' + S] = (20, -s * 130, 0)
        p['forearm.' + S] = (-20, 0, 0)
    p['neck'] = ((20, 0, 0), (0, 0, 0.0))
    return p


def rise_pose():
    """The floor lifted off: the torso straightening over the pelvis, the knees
    drawn up out of the floor, the arms holding the doors out to the sides."""
    p = {'root': ((0, -0.95, 0.70), (40, 0, 0)), 'spine': (-6, 0, 0), 'chest': (-8, 0, 0), 'neck': (10, 0, 0),
         'head': (0, 0, 0)}
    for S, s in (('L', 1), ('R', -1)):
        p['upperarm.' + S] = (10, -s * 90, 0)
        p['forearm.' + S] = (-40, 0, 0)
        p['thigh.' + S] = (-110, -s * 10, 0)
        p['shin.' + S] = (130, 0, 0)
        p['foot.' + S] = (-20, 0, 0)
    return p


def tuck_pose():
    """The apex: knees drawn to the chest, forearms crossed in front, head down."""
    p = {'root': ((0, -0.30, 2.6), (8, 0, 0)), 'spine': (16, 0, 0), 'chest': (10, 0, 0), 'neck': (12, 0, 0)}
    for S, s in (('L', 1), ('R', -1)):
        p['thigh.' + S] = (-92, -s * 14, 0)
        p['shin.' + S] = (126, 0, 0)
        p['foot.' + S] = (-10, 0, 0)
        p['upperarm.' + S] = (-30, -s * 30, 0)
        p['forearm.' + S] = (-92, 0, 0)
    return p


def arch_pose():
    """Past the apex: back arched, knees swung out wide and shins back so the
    calves reach the flight pack's lower corners and take the rear wheels off it,
    arms out."""
    p = {'root': ((0, 0.0, 3.0), (-14, 0, 0)), 'spine': (-22, 0, 0), 'chest': (-8, 0, 0), 'neck': (-14, 0, 0)}
    for S, s in (('L', 1), ('R', -1)):
        p['thigh.' + S] = (1, -s * 52, 0)
        p['shin.' + S] = (108, 0, 0)
        p['foot.' + S] = (20, 0, 0)
        p['upperarm.' + S] = (-10, -s * 37, 0)
        p['forearm.' + S] = (-24, 0, 0)
    return p


def open_pose():
    """Opening out of the flip: back arched, arms out, legs extending."""
    p = {'root': ((0, -0.10, 3.4), (-6, 0, 0)), 'spine': (-8, 0, 0), 'chest': (-6, 0, 0), 'neck': (-10, 0, 0)}
    for S, s in (('L', 1), ('R', -1)):
        p['thigh.' + S] = (-30, -s * 10, 0)
        p['shin.' + S] = (44, 0, 0)
        p['foot.' + S] = (10, 0, 0)
        p['upperarm.' + S] = (-3, -s * 35, 0)
        p['forearm.' + S] = (-26, 0, 0)
    return p


def descent_pose():
    """Falling: legs reaching down, the left a little ahead, arms out to steady."""
    p = {'root': ((0.05, 0.0, 3.4), (6, 0, 4)), 'spine': (4, 0, 2), 'chest': (2, 0, 2), 'neck': (-12, 0, 0),
         'thigh.L': (-46, -16, 4), 'shin.L': (40, 0, 0), 'foot.L': (6, 8, 0),
         'thigh.R': (-10, 10, 0), 'shin.R': (36, 0, 0), 'foot.R': (16, 0, 0),
         'upperarm.R': (-24, 35, 0), 'forearm.R': (-24, 0, 0),
         'upperarm.L': (-4, -35, 0), 'forearm.L': (-34, 0, 0)}
    return p


def reach_pose():
    """Just before touch-down: the left foot reaching out ahead, the right knee
    driving down, the right arm reaching for the ground, the left arm up and out."""
    p = {'root': ((0.10, -0.06, 3.0), (14, 0, 8)), 'spine': (8, -2, 4), 'chest': (6, -2, 4), 'neck': (-14, 0, -4),
         'thigh.L': (-96, -40, 10), 'shin.L': (88, 0, 0), 'foot.L': (4, 20, 0),
         'thigh.R': (-22, 14, 0), 'shin.R': (78, 0, 0), 'foot.R': (40, 0, 0),
         'upperarm.R': (-40, 34, 0), 'forearm.R': (-14, 0, 0), 'hand.R': (20, -8, 0),
         'upperarm.L': (24, -52, 0), 'forearm.L': (-36, 0, 0)}
    return p


def hero_pose():
    """Hero landing (transformer-hero-landing-pose.png): the left foot planted
    wide and forward, its knee out to the side clear of the chest, the right knee
    on the ground, the right hand braced on the ground, the left arm out and back,
    the torso pitched forward over the planted hand, head up."""
    p = {'root': ((0.10, -0.10, 1.40), (16, 0, 10)),
         'spine': (8, -4, 6), 'chest': (6, -4, 6), 'neck': (-10, 0, -8), 'head': (-12, 0, -8),
         'thigh.L': (-104, -60, 16), 'shin.L': (98, 0, 0), 'foot.L': (6, 30, 0),
         'thigh.R': (-38, 14, 0), 'shin.R': (122, 0, 0), 'foot.R': (66, 0, 0), 'toe.R': (-40, 0, 0),
         'upperarm.R': (-30, 30, 0), 'forearm.R': (-6, 0, 0), 'hand.R': (34, -10, 0),
         'upperarm.L': (48, -56, 0), 'forearm.L': (-46, 0, 0), 'hand.L': (0, -12, 0)}
    for f in rig.FINGERS:
        p['%s1.R' % f] = (0, -6, 0)
        p['%s2.R' % f] = (0, -4, 0)
        p['%s1.L' % f] = (0, 22, 0)
        p['%s2.L' % f] = (0, 34, 0)
        p['%s3.L' % f] = (0, 22, 0)
    return p


def impact_pose():
    """The impact: everything a little deeper than the held pose, the torso
    pitched further over the braced hand, the free arm flung higher."""
    p = hero_pose()
    p['root'] = ((0.10, -0.16, 1.28), (22, 0, 12))
    p['spine'] = (11, -4, 8)
    p['neck'] = (-16, 0, -8)
    p['thigh.L'] = (-108, -62, 16)
    p['shin.L'] = (104, 0, 0)
    p['upperarm.R'] = (-36, 26, 0)
    p['forearm.R'] = (-16, 0, 0)
    p['hand.R'] = (50, -10, 0)
    p['upperarm.L'] = (18, -50, 0)
    p['forearm.L'] = (-30, 0, 0)
    return p


def hero_hold_pose():
    """The held landing a beat later: head turned up to the front, the free arm
    drawn in, the chest lifted."""
    p = hero_pose()
    p['root'] = ((0.10, -0.08, 1.44), (13, 0, 9))
    p['spine'] = (6, -3, 5)
    p['neck'] = (-14, 0, -4)
    p['head'] = (-10, 0, -2)
    p['upperarm.L'] = (30, -39, 0)
    p['forearm.L'] = (-56, 0, 0)
    return p


def stand_pose():
    """The concept sheet's stand: feet apart, arms a little out, hands relaxed.
    The live gait takes over from it (the export's rig stand)."""
    p = {'root': ((0, rig.ROBOT_Y, rig.HIP_Z - 0.04), (0, 0, 0))}
    for S, s in (('L', 1), ('R', -1)):
        p['thigh.' + S] = (-2, -s * 7, 0)
        p['shin.' + S] = (3, 0, 0)
        p['foot.' + S] = (-1, s * 7, 0)
        p['upperarm.' + S] = (-4, -s * 9, 0)
        p['forearm.' + S] = (-12, 0, 0)
        for f in rig.FINGERS:
            p['%s1.%s' % (f, S)] = (0, s * 18, 0)
            p['%s2.%s' % (f, S)] = (0, s * 22, 0)
            p['%s3.%s' % (f, S)] = (0, s * 14, 0)
    return p


def pose_keys():
    """(seconds, pose) keys, in time order."""
    car = car_pose()
    return [(0.0, car), (2.4, car), (2.8, arms_up_pose()), (3.1, doors_pose()), (3.35, doors_held()), (3.75, rise_pose()), (4.05, tuck_pose()),
            (4.5, arch_pose()),
            (5.1, open_pose()),
            (5.8, descent_pose()), (6.6, reach_pose()), (6.85, impact_pose()), (7.3, hero_pose()),
            (7.8, hero_hold_pose()), (FL.DURATION, stand_pose())]


def pchip(ts, ys, t):
    """Monotone cubic (Fritsch-Carlson) through (ts, ys) at t; held outside."""
    n = len(ts)
    if t <= ts[0]:
        return ys[0]
    if t >= ts[-1]:
        return ys[-1]
    i = max(k for k in range(n - 1) if ts[k] <= t)
    h = [ts[k + 1] - ts[k] for k in range(n - 1)]
    d = [(ys[k + 1] - ys[k]) / h[k] for k in range(n - 1)]
    m = [0.0] * n
    for k in range(1, n - 1):
        if d[k - 1] * d[k] > 0:
            w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
            m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])
    u = (t - ts[i]) / h[i]
    h00, h10 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u
    h01, h11 = -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
    return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1]


class Track:
    """Channels sampled from the pose keys (time in seconds)."""

    def __init__(self, keys):
        self.ts = [t for t, p in keys]
        names = set()
        for t, p in keys:
            names.update(p)
        self.ch = {}
        for n in names:
            if n == 'root':
                pos = [Vector(p['root'][0]) for t, p in keys]
                eul = [Vector(p['root'][1]) for t, p in keys]
                self.ch['root'] = (pos, eul)
            else:
                rots, slides = [], []
                for t, p in keys:
                    r, s = _rot(p.get(n, (0, 0, 0)))
                    rots.append(Vector(r))
                    slides.append(Vector(s))
                self.ch[n] = (rots, slides)

    def sample(self, t):
        pose = {}
        root = None
        for n, (a, b) in self.ch.items():
            va = Vector([pchip(self.ts, [v[i] for v in a], t) for i in range(3)])
            vb = Vector([pchip(self.ts, [v[i] for v in b], t) for i in range(3)])
            if n == 'root':
                root = Matrix.Translation(va) @ E(*vb).to_matrix().to_4x4()
            else:
                pose[n] = (E(*va), vb)
        return pose, root


SHRUG = (20.0, 0.6, 36.0)    # abduction where the shrug starts, clavicle deg per arm deg, cap


def shrug(pose):
    """Raise each clavicle as its arm lifts out to the side, so the pauldron rides
    up over the chest's fender flank instead of swinging into it."""
    for S, s in (('L', 1), ('R', -1)):
        q = pose.get('upperarm.' + S, (Quaternion(), Vector()))[0]
        d = q @ Vector((0, 0, -1))
        ab = math.degrees(math.atan2(s * d.x, -d.z))     # arm out from hanging, in the frontal plane
        a = min(SHRUG[2], max(0.0, (ab - SHRUG[0]) * SHRUG[1]))
        if a > 0:
            qc, sl = pose.get('clav.' + S, (Quaternion(), Vector()))
            pose['clav.' + S] = (qc @ E(0, -s * a, 0), sl)


def bones(track, t):
    """Body-frame joint worlds at time t (growth applied to the bone offsets)."""
    pose, root = track.sample(t)
    shrug(pose)
    for n in rig.NAMES:
        off = offset_scaled(n, t)
        if (off - rig.OFFSET[n]).length > 1e-9:
            q, sl = pose.get(n, (Quaternion(), Vector()))
            pose[n] = (q, sl + off - rig.OFFSET[n])
    return rig.worlds(pose, root)


# ---------------------------------------------------------------- ground and launch

def droop(t):
    """Wheels hanging on their suspension once airborne (m, relative to the body)."""
    return -0.035 * smooth(t, 0.80, 1.15)


def launch_pitch(t):
    """Nose-up under the boost, level again before the opening (radians, negative = nose up)."""
    return math.radians(-4.0) * smooth(t, 0.85, 1.40) * (1 - smooth(t, 1.60, 2.30))


def aero_u(t):
    """Flight mode: lift jets out, wing up, flaps open for the launch; stowed as
    the robot opens out of the flip."""
    return smooth(t, 0.05, 0.60) * (1 - smooth(t, 4.80, 5.60))


# ---------------------------------------------------------------- carriers

NOSE_GROUP = ('hood', 'flap.L', 'flap.R', 'jet.FL', 'jet.FR', 'jet.FL.stage', 'jet.FR.stage')
TAIL_GROUP = ('wing', 'wing.strut.L', 'wing.strut.R', 'plate.L', 'plate.R', 'pod.L', 'pod.R',
              'jet.RL', 'jet.RR', 'jet.RL.stage', 'jet.RR.stage')
FOLLOW = {n: 'nose' for n in NOSE_GROUP}
FOLLOW.update({n: 'tail' for n in TAIL_GROUP})
FOLLOW.update({'hub.F.L': 'wheelF.L', 'hub.F.R': 'wheelF.R', 'hub.R.L': 'wheelR.L', 'hub.R.R': 'wheelR.R'})
AERO = ('wing', 'plate.', 'wing.strut.', 'flap.', 'jet.')     # carriers with their own flight-mode motion
BRACED = ('door.L', 'door.R', 'wheelF.L', 'wheelF.R', 'wheelR.L', 'wheelR.R')   # carried in on linkage.py braces
WHEELS = ('wheelF.L', 'wheelF.R', 'wheelR.L', 'wheelR.R', 'hub.F.L', 'hub.F.R', 'hub.R.L', 'hub.R.R')


DOOR_LIFT = 45


def door_open(s):
    """Gullwing: the door swings up DOOR_LIFT deg about its roof hinge (x 0.16, z 1.20)."""
    p = Vector((s * 0.16, 0, 1.20))
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(-DOOR_LIFT * s), 4, 'Y') @ Matrix.Translation(-p)


def hinge(pivot, axis, deg):
    """Car-space rotation about a hinge line through pivot."""
    p = Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis)) @ Matrix.Translation(-p)


def tail_half():
    """Half the tail's turn over the tub's rear edge (car space): a waypoint that
    fixes the turn's direction (down and under, away from the robot)."""
    h = dock.TAIL_HINGE
    return Matrix.Translation(h) @ Matrix.Rotation(math.radians(-90), 4, 'X') @ Matrix.Translation(-h)


NOSE_DROP = 0.60


def clip_drop():
    """The nose clip run down its rails clear of the chest core (car space)."""
    return Matrix.Translation((0, 0, -NOSE_DROP))


def tub_swing():
    """The floor tub's swing up about its front edge (car space): 78 deg, which with
    the nose clip's 12 deg pitch stands it upright on the back."""
    h = dock.TUB_HINGE
    return Matrix.Translation(h) @ Matrix.Rotation(math.radians(78), 4, 'X') @ Matrix.Translation(-h)


DOOR_GRAB, WHEEL_F_GRAB, WHEEL_R_GRAB = 3.10, 3.25, 4.50
WHEEL_F_OUT = 0.32
WHEEL_APPROACH = 0.35    # wheels slide onto their arches' hubs along the axle, from outboard


def programs():
    """carrier -> [(seconds, host, rel)]."""
    P = {
        # the nose clip slides down its rails (the chest core, head and arms rise clear of
        # it as the limbs unfold), then back up onto the chest as the robot completes
        'nose': [(0.0, 'chest', 'car'), (2.40, 'chest', 'car'), (2.95, 'chest', ('carpose', clip_drop())),
                 (3.38, 'chest', ('carpose', clip_drop())), (3.88, 'chest', 'dock')],
        # the windscreen slides back and down onto the folded cabin in the floor tub
        'screen': [(0.0, 'tub', 'car'), (2.25, 'tub', 'car'), (2.65, 'tub', 'dock')],
        # the floor swings up about its front edge, then slides down the back's rails
        'tub': [(0.0, 'chest', 'car'), (3.10, 'chest', 'car'), (3.85, 'chest', ('hinge', dock.TUB_HINGE, (1, 0, 0), 78)),
                (4.30, 'chest', 'dock')],
        'cabin': [(0.0, 'tub', 'car')],
        # the tail turns over the tub's rear edge as the tub rises: rear end down, glass out
        'tail': [(0.0, 'tub', 'car'), (3.10, 'tub', 'car'), (4.20, 'tub', ('hinge', dock.TAIL_HINGE, (1, 0, 0), -180))],
        # the roof folds down about its rear edge into the tail's open front
        # (after the doors, hung on its edges, have been taken by the arms)
        'roof': [(0.0, 'tail', 'car'), (3.15, 'tail', 'car'), (3.75, 'tail', ('hinge', dock.ROOF_HINGE, (1, 0, 0), 90))],
    }
    for S, s in (('L', 1), ('R', -1)):
        P['door.' + S] = [(0.0, 'roof', 'car'), (2.00, 'roof', 'car'), (2.50, 'roof', ('hinge', (s * 0.16, 0, 1.20), (0, 1, 0), -DOOR_LIFT * s)),
                          (DOOR_GRAB, 'forearm.' + S, 'hold'), (4.20, 'forearm.' + S, 'dock')]
        P['door.%s.glass' % S] = [(0.0, 'door.' + S, 'car'), (3.10, 'door.' + S, 'car'), (3.90, 'door.' + S, 'dock')]
        # the front wheel first runs straight out of its arch on its hub (after the clip
        # has dropped), then the shoulder's brace takes it
        P['wheelF.' + S] = [(0.0, 'nose', 'car'), (2.95, 'nose', 'car'),
                            (WHEEL_F_GRAB, 'nose', ('carpose', Matrix.Translation((s * WHEEL_F_OUT, 0, 0)))),
                            (WHEEL_F_GRAB, 'upperarm.' + S, 'hold'),
                            (WHEEL_F_GRAB + 0.55, 'upperarm.' + S, ('approach', (s * WHEEL_APPROACH, 0, 0))),
                            (WHEEL_F_GRAB + 0.9, 'upperarm.' + S, 'dock')]
        P['wheelR.' + S] = [(0.0, 'tail', 'car'), (WHEEL_R_GRAB, 'shin.' + S, 'hold'),
                            (WHEEL_R_GRAB + 0.45, 'shin.' + S, ('approach', (s * WHEEL_APPROACH, 0, 0))),
                            (WHEEL_R_GRAB + 0.75, 'shin.' + S, 'dock')]
    return P


ORDER = ('nose', 'tub', 'screen', 'cabin', 'tail', 'roof', 'door.L', 'door.R', 'door.L.glass', 'door.R.glass',
         'wheelF.L', 'wheelF.R', 'wheelR.L', 'wheelR.R')


def cabin_stow(t):
    """The cabin (seats, dash, yoke) folds down into the floor tub: it sinks while
    its height and length close (a car-space map, in the tub's frame)."""
    u = smooth(t, 1.95, 2.45)
    c = Vector((0, -0.24, 0.24))            # the tub's floor centre
    k = (1 - 0.30 * u, 1 - 0.55 * u, 1 - 0.85 * u)
    return Matrix.Translation(c + Vector((0, 0, -0.06 * u))) @ Matrix.Diagonal((k[0], k[1], k[2], 1.0)) @ \
        Matrix.Translation(-c)
