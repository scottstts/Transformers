"""Proportion blockout: one beveled volume per bone (bone-local coordinates)."""
from . import kit
from .kit import V

VOL = {
    'pelvis': ((0, -0.02, -0.03), (0.44, 0.30, 0.26)),
    'spine': ((0, -0.03, 0.13), (0.38, 0.26, 0.26)),
    'chest': ((0, -0.02, 0.30), (0.68, 0.40, 0.60)),
    'neck': ((0, 0, 0.08), (0.12, 0.12, 0.16)),
    'head': ((0, 0.02, 0.20), (0.32, 0.36, 0.40)),
}
for _S, _s in (('L', 1), ('R', -1)):
    VOL['clav.' + _S] = ((_s * 0.20, 0, 0), (0.30, 0.18, 0.18))
    VOL['upperarm.' + _S] = ((0, 0, -0.36), (0.19, 0.21, 0.70))
    VOL['forearm.' + _S] = ((0, 0, -0.32), (0.20, 0.22, 0.62))
    VOL['hand.' + _S] = ((0, 0, -0.10), (0.10, 0.17, 0.20))
    VOL['hip.' + _S] = ((0, 0, 0), (0.16, 0.18, 0.18))
    VOL['thigh.' + _S] = ((0, 0, -0.42), (0.25, 0.28, 0.82))
    VOL['shin.' + _S] = ((0, 0, -0.40), (0.23, 0.26, 0.78))
    VOL['foot.' + _S] = ((0, 0.02, -0.15), (0.21, 0.30, 0.18))
    VOL['toe.' + _S] = ((0, 0.07, -0.03), (0.20, 0.16, 0.10))


def build(coll, skip=()):
    out = {}
    for bone, (c, size) in VOL.items():
        if bone in skip:
            continue
        b = kit.Builder()
        b.add_mesh(kit.box(size, V(*c)), 'graphite')
        o = b.build('blk.' + bone, coll)
        kit.finish(o, 0.015, 2, 30)
        out[bone] = [o]
    return out
