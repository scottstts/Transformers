"""Proportion blockout: one beveled volume per bone (bone-local coordinates)."""
from . import kit
from .kit import V

VOL = {
    'pelvis': ((0, 0, -0.06), (0.92, 0.62, 0.46)),
    'spine': ((0, 0, 0.21), (0.78, 0.52, 0.40)),
    'chest': ((0, 0, 0.55), (1.16, 0.90, 1.10)),
    'neck': ((0, 0, 0.10), (0.22, 0.22, 0.24)),
    'head': ((0, 0.02, 0.28), (0.52, 0.56, 0.58)),
}
for _S, _s in (('L', 1), ('R', -1)):
    VOL['clav.' + _S] = ((_s * 0.10, 0, 0), (0.20, 0.30, 0.24))
    VOL['boom.' + _S] = ((_s * 0.30, 0, 0), (0.50, 0.16, 0.14))
    VOL['yoke.' + _S] = ((_s * 0.50, 0, 0), (0.80, 0.24, 0.20))
    VOL['upperarm.' + _S] = ((0, 0, -0.52), (0.32, 0.36, 1.02))
    VOL['forearm.' + _S] = ((0, 0, -0.52), (0.36, 0.42, 0.92))
    VOL['hand.' + _S] = ((0, 0, -0.18), (0.14, 0.30, 0.36))
    VOL['hip.' + _S] = ((0, 0, 0), (0.30, 0.34, 0.34))
    VOL['thigh.' + _S] = ((0, 0, -0.70), (0.42, 0.56, 1.10))
    VOL['shin.' + _S] = ((0, 0, -0.69), (0.44, 0.55, 1.34))
    VOL['foot.' + _S] = ((0, 0.06, -0.21), (0.48, 0.72, 0.38))


def build(coll, skip=()):
    out = {}
    for bone, (c, size) in VOL.items():
        if bone in skip:
            continue
        b = kit.Builder()
        b.add_mesh(kit.box(size, V(*c)), 'graphite')
        o = b.build('blk.' + bone, coll)
        kit.finish(o, 0.02, 2, 30)
        out[bone] = [o]
    return out
