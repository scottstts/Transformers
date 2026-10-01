"""Headless export of the approved citadel for the game.

    /Applications/Blender.app/Contents/MacOS/Blender -b blender/citadel.blend \
        --python-exit-code 1 --python blender/citadel_build/export_game.py

Writes, into the asset mirror (assets/):
  citadel.glb        every build mesh, one glTF node per bucket × slot × class
  citadel.plan.json  the plan (section 9 of tasks/citadel.md)

The .blend is never saved. Node extras carry ctd_bucket, ctd_slot, ctd_lod and
ctd_triangles: three sanitises node names (dots are dropped), so the game reads
the extras, never the name. glTF +Y up maps Blender (x, -z, h) back to the fort
frame (x, h, z) exactly. Normals are the custom split normals. No UVs and no
materials: the game shades every slot with its own world-space TSL material.

Blender writes a raw float GLB to out/; tools/citadel-pack.mjs then compresses it
losslessly with EXT_meshopt_compression. Blender's own meshopt option quantises
positions (to 0.25 m on this extent), so it is not used. The exporter drops exact
duplicate triangles, so the GLB holds slightly fewer triangles than ctd_triangles.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys

import bpy

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent.parent / "assets"
sys.path.insert(0, str(ROOT))

from ctd.plan import make_plan

SLOTS = {"alloyDark", "alloyLight", "ceramic", "ceramicBand", "deck", "glass", "glassGreen", "light", "paving", "sand"}
LODS = {"mass", "artic", "detail"}


def require(condition, message):
    if not condition:
        raise ValueError("Citadel export: " + message)


def build_objects():
    objects = sorted((o for o in bpy.data.objects if o.type == "MESH" and o.get("ctd_group") == "build"),
                     key=lambda o: o.name)
    require(objects, "no build meshes in the scene")
    for obj in objects:
        bucket, slot, lod = obj.name.split(".")
        require(slot == obj["ctd_slot"] and lod == obj["ctd_lod"], f"{obj.name} name disagrees with its properties")
        require(slot in SLOTS and lod in LODS, f"{obj.name} has an unknown slot or class")
        require(not obj.modifiers and obj.matrix_world.is_identity, f"{obj.name} is not raw world-space geometry")
        triangles = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        require(triangles == obj["ctd_triangles"], f"{obj.name} triangle count changed")
        # In-memory only: the extras the game reads. The .blend is not saved.
        for key in list(obj.keys()):
            del obj[key]
        obj["ctd_bucket"], obj["ctd_slot"], obj["ctd_lod"], obj["ctd_triangles"] = bucket, slot, lod, triangles
    return objects


def export(objects, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), check_existing=False, export_format="GLB", use_selection=True,
        export_yup=True, export_apply=False, export_extras=True,
        export_normals=True, export_texcoords=False, export_tangents=False,
        export_materials="NONE", export_vertex_color="NONE", export_attributes=False,
        export_cameras=False, export_lights=False, export_animations=False, export_morph=False,
        export_skins=False, use_mesh_edges=False, use_mesh_vertices=False,
        export_meshopt_compression_enable=False,
        export_draco_mesh_compression_enable=False, export_use_gltfpack=False)


def main():
    objects = build_objects()
    raw, glb = ROOT / "out" / "citadel.raw.glb", OUT / "citadel.glb"
    raw.parent.mkdir(exist_ok=True)
    export(objects, raw)
    node = shutil.which("node")
    require(node, "node is not on PATH; run tools/citadel-pack.mjs by hand")
    subprocess.run([node, "tools/citadel-pack.mjs", str(raw), str(glb)], cwd=ROOT.parent.parent, check=True)
    plan = make_plan()
    (OUT / "citadel.plan.json").write_text(json.dumps(plan, separators=(",", ":")) + "\n")
    print("CTD_EXPORT", json.dumps({
        "glb": str(glb), "bytes": glb.stat().st_size, "meshes": len(objects),
        "triangles": sum(o["ctd_triangles"] for o in objects),
        "plan_bytes": (OUT / "citadel.plan.json").stat().st_size}), flush=True)


main()
