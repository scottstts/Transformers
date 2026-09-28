"""The Tumbler: armour shell, running gear and wheels. Returns name -> object."""
from . import body, wheels, chassis


def build(coll):
    parts = {}
    parts.update(body.build(coll))
    parts.update(chassis.build(coll))
    parts.update(wheels.build(coll))
    return parts
