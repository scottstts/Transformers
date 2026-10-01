"""District placement is entirely read from the serializable plan."""

from ..kit.massing import build


def emit(w, plan, groups=None):
    for m in plan["modules"]:
        group = "spire" if m["kind"] == "spire" else f"D{m['district']}"
        if groups is None or group in groups or "landmarks" in groups:
            build(w, m)
