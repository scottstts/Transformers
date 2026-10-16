"""Active aero poses (video: road mode -> high-downforce mode) and lift jets.

  wing        the deck lid pitches 19 degrees about its leading edge, then moves
              0.17 aft and 0.07 up: its trailing edge ends ~0.15 behind the tail at
              z 1.08 (the video's high-downforce side shot, 18 s)
  end plates  ride with the lid; their side skins hang as fins, swung 10 degrees
              about the lid edge so their bottoms flare outward (back.JPG)
  fender flap swings out 12 degrees about its front edge (the arch side)
  jets        the chrome stage slides 0.15 down out of its sleeve

`deployed(name, u)` returns a carrier's world matrix at deployment u (0..1);
`preview()` keys a short road -> high-downforce -> road loop on the timeline for
inspection. The transformation bake replaces it.
"""
import math
from mathutils import Matrix, Vector, Quaternion
from . import kit as K

WING_LIFT, WING_AFT, WING_PITCH = 0.07, 0.17, math.radians(19)   # video, high-downforce mode (18 s)
PLATE_SWING = math.radians(-10)       # end plates hang as fins, bottoms 10 deg outward
FLAP_SWING = math.radians(12)
JET_DROP = 0.15


def about(axis_point, axis, angle):
    p = Vector(axis_point)
    return Matrix.Translation(p) @ Matrix.Rotation(angle, 4, Vector(axis)) @ Matrix.Translation(-p)


def wing_motion(u):
    lid_le = Vector((0.0, 1.825, 0.903))     # pitch about the leading edge
    return Matrix.Translation((0, WING_AFT * u, WING_LIFT * u)) @ about(lid_le, (1, 0, 0), WING_PITCH * u)


def deployed(name, rest, u):
    """World matrix of carrier `name` (rest = its car-pose matrix) at deployment u."""
    if name == 'wing':
        return wing_motion(u) @ rest
    if name.startswith('plate.'):
        sx = 1 if name.endswith('L') else -1
        hinge = Vector((sx * 0.85, 2.0, 0.888))    # the lid's outer edge
        return wing_motion(u) @ about(hinge, (0, 1, 0), sx * PLATE_SWING * u) @ rest
    if name.startswith('wing.strut.'):
        from .car import STRUT_X, STRUT_TOP, STRUT_BASE
        sx = 1 if name.endswith('L') else -1
        top = Vector((sx * STRUT_X, *STRUT_TOP))
        base = Vector((sx * STRUT_X, *STRUT_BASE))
        moved = wing_motion(u) @ top
        q = (base - top).normalized().rotation_difference((base - moved).normalized())
        return Matrix.Translation(moved) @ q.to_matrix().to_4x4() @ Matrix.Translation(-top) @ rest
    if name.startswith('flap.'):
        sx = 1 if name.endswith('L') else -1
        hinge = Vector((sx * 0.90, -1.02, 0.5))
        return about(hinge, (0, 0, 1), sx * FLAP_SWING * u) @ rest
    if name.startswith('jet.') and name.endswith('.stage'):
        return Matrix.Translation((0, 0, -JET_DROP * u)) @ rest
    return rest


def preview(frames=(0, 30, 60, 90)):
    """Key road (f0) -> high-downforce (f30..60) -> road (f90)."""
    import bpy
    names = [n for n in K.NODES if n.startswith(('asm.wing', 'asm.plate.', 'asm.flap.', 'asm.jet.'))]
    rests = {n: K.NODES[n].matrix_basis.copy() for n in names}
    for f, u in zip(frames, (0.0, 1.0, 1.0, 0.0)):
        for n in names:
            o = K.NODES[n]
            o.matrix_basis = deployed(n[4:], rests[n], u)
            o.keyframe_insert('location', frame=f)
            o.keyframe_insert('rotation_quaternion', frame=f)
    for n in names:
        K.NODES[n].matrix_basis = rests[n]
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = frames[0], frames[-1]
    sc.frame_set(0)
    return len(names)
