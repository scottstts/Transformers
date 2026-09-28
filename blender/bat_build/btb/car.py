"""The Tumbler: armour shell, running gear and wheels. Returns name -> object."""
from . import body, wheels, chassis, mats


def build(coll):
    mats.ensure_all()
    parts = {}
    parts.update(body.build(coll))
    parts.update(chassis.build(coll))
    parts.update(wheels.build(coll))
    return parts
