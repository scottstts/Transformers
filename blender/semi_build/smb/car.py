"""The truck: cab panels, wheels, running gear and the pup van. Returns name -> object."""
from . import cab, wheels, chassis, trailer


def build(coll):
    parts = {}
    parts.update(cab.build(coll))
    parts.update(wheels.build(coll))
    parts.update(chassis.build(coll))
    parts.update(trailer.build(coll))
    return parts
