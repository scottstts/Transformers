"""The only module that imports bpy. Mesh upload, preview look and live review."""

import math
from pathlib import Path

import bpy
from mathutils import Vector

COLORS = {
    "ceramic": ("D6D0C4", 0, 0.42), "ceramicBand": ("B9B6AF", 0, 0.55),
    "alloyDark": ("1C1F23", 1, 0.32), "alloyLight": ("C8B08A", 1, 0.28),
    "glass": ("0E1418", 0, 0.05), "light": ("BFE9FF", 0, 0.35),
    "glassGreen": ("122125", 0, 0.09),
    "paving": ("C2BBAE", 0, 0.62), "deck": ("4A4E53", 0.9, 0.45),
    "sand": ("C8B28D", 0, 0.9), "debugFloor": ("A6BBA2", 0, 0.7),
    "debugCollider": ("E8794B", 0, 0.5), "debugGate": ("2BBAEB", 0, 0.5),
    "debugYard": ("E4B561", 0, 0.5), "debugSpawn": ("B3ED9C", 0, 0.5),
    "debugViolation": ("FF2340", 0, 0.5),
}


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb) + (1,)


def enum(owner, prop, preferred):
    allowed = [i.identifier for i in owner.bl_rna.properties[prop].enum_items]
    for identifier in preferred:
        if identifier in allowed:
            setattr(owner, prop, identifier)
            return identifier
    return getattr(owner, prop)


def material(slot):
    name = "CTD_" + slot
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    hex_color, metal, rough = COLORS[slot]
    color = linear(hex_color)
    mat.diffuse_color = color
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if slot == "glassGreen":
        shader.inputs["Emission Color"].default_value = linear("246944")
        shader.inputs["Emission Strength"].default_value = 0.06
    if slot == "light" or slot.startswith("debug"):
        shader.inputs["Emission Color"].default_value = color
        shader.inputs["Emission Strength"].default_value = 0.8 if slot == "light" else 0.3
        if slot == "light":
            emission_controls(nodes, links, shader)
        return mat
    geo = nodes.new("ShaderNodeNewGeometry")
    xyz = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], xyz.inputs[0])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.025 if slot == "sand" else 0.09
    noise.inputs["Detail"].default_value = 2
    links.new(geo.outputs["Position"], noise.inputs["Vector"])
    tint = nodes.new("ShaderNodeMixRGB")
    enum(tint, "blend_type", ["MIX"])
    tint.inputs[1].default_value = tuple(c * 0.94 for c in color[:3]) + (1,)
    tint.inputs[2].default_value = color
    links.new(noise.outputs["Fac"], tint.inputs[0])
    links.new(tint.outputs[0], shader.inputs["Base Color"])
    if slot in ("ceramic", "ceramicBand", "paving", "deck"):
        # Triplanar seam relief, using world position and geometric normals.
        normal_xyz = nodes.new("ShaderNodeSeparateXYZ")
        links.new(geo.outputs["Normal"], normal_xyz.inputs[0])
        seam = []
        for i, axis in enumerate(("X", "Y", "Z")):
            mul = nodes.new("ShaderNodeMath")
            enum(mul, "operation", ["MULTIPLY"])
            links.new(xyz.outputs[axis], mul.inputs[0])
            mul.inputs[1].default_value = 1 / (6 if slot in ("paving", "deck") else 1.5 if axis == "Z" else 3)
            fract = nodes.new("ShaderNodeMath")
            enum(fract, "operation", ["FRACT"])
            links.new(mul.outputs[0], fract.inputs[0])
            edge = nodes.new("ShaderNodeMath")
            enum(edge, "operation", ["LESS_THAN"])
            links.new(fract.outputs[0], edge.inputs[0])
            edge.inputs[1].default_value = 0.009 if slot in ("paving", "deck") else 0.013
            absolute = nodes.new("ShaderNodeMath")
            enum(absolute, "operation", ["ABSOLUTE"])
            links.new(normal_xyz.outputs[axis], absolute.inputs[0])
            tangent = nodes.new("ShaderNodeMath")
            enum(tangent, "operation", ["SUBTRACT"])
            tangent.inputs[0].default_value = 1
            links.new(absolute.outputs[0], tangent.inputs[1])
            weighted = nodes.new("ShaderNodeMath")
            enum(weighted, "operation", ["MULTIPLY"])
            links.new(edge.outputs[0], weighted.inputs[0])
            links.new(tangent.outputs[0], weighted.inputs[1])
            seam.append(weighted)
        add = nodes.new("ShaderNodeMath")
        enum(add, "operation", ["ADD"])
        links.new(seam[0].outputs[0], add.inputs[0])
        links.new(seam[1].outputs[0], add.inputs[1])
        add2 = nodes.new("ShaderNodeMath")
        enum(add2, "operation", ["ADD"])
        links.new(add.outputs[0], add2.inputs[0])
        links.new(seam[2].outputs[0], add2.inputs[1])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.25
        bump.inputs["Distance"].default_value = 0.015
        bump.invert = True
        links.new(add2.outputs[0], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    weathering(nodes, links, shader, geo, tint.outputs[0], color, slot, rough)
    return mat


def scalar(nodes, links, operation, a, b=0):
    node = nodes.new("ShaderNodeMath")
    enum(node, "operation", [operation])
    for i, value in enumerate((a, b)):
        if isinstance(value, (int, float)):
            node.inputs[i].default_value = value
        else:
            links.new(value, node.inputs[i])
    return node.outputs[0]


def blend(nodes, links, a, b, factor):
    node = nodes.new("ShaderNodeMixRGB")
    enum(node, "blend_type", ["MIX"])
    for i, value in ((1, a), (2, b)):
        if isinstance(value, tuple):
            node.inputs[i].default_value = value
        else:
            links.new(value, node.inputs[i])
    if isinstance(factor, (int, float)):
        node.inputs[0].default_value = factor
    else:
        links.new(factor, node.inputs[0])
    return node.outputs[0]


def emission_controls(nodes, links, shader):
    geo, xyz = nodes.new("ShaderNodeNewGeometry"), nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], xyz.inputs[0])
    high = scalar(nodes, links, "GREATER_THAN", xyz.outputs["Z"], 103.5)
    low = scalar(nodes, links, "LESS_THAN", xyz.outputs["Z"], 4)
    x = scalar(nodes, links, "LESS_THAN", scalar(nodes, links, "ABSOLUTE", xyz.outputs["X"]), 125)
    y = scalar(nodes, links, "LESS_THAN", scalar(nodes, links, "ABSOLUTE", xyz.outputs["Y"]), 125)
    conduit = scalar(nodes, links, "MULTIPLY", low, scalar(nodes, links, "MULTIPLY", x, y))
    accent = scalar(nodes, links, "ADD", scalar(nodes, links, "MULTIPLY", high, 2.2),
                    scalar(nodes, links, "MULTIPLY", conduit, 1.5))
    strength = nodes.new("ShaderNodeValue")
    strength.label, strength["ctd_uniform"] = "Emission strength", "emission_strength"
    strength.outputs[0].default_value = 0.8
    pulse = nodes.new("ShaderNodeValue")
    pulse.label, pulse["ctd_uniform"] = "Light pulse", "pulse"
    pulse.outputs[0].default_value = 1
    value = scalar(nodes, links, "MULTIPLY", scalar(nodes, links, "ADD", strength.outputs[0], accent), pulse.outputs[0])
    links.new(value, shader.inputs["Emission Strength"])


def weathering(nodes, links, shader, geo, base, color, slot, rough):
    """Subtle causal wear fields in world space; no image textures or added lights."""
    xyz, nxyz = nodes.new("ShaderNodeSeparateXYZ"), nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], xyz.inputs[0])
    links.new(geo.outputs["Normal"], nxyz.inputs[0])
    s = lambda op, a, b=0: scalar(nodes, links, op, a, b)
    up = s("MAXIMUM", nxyz.outputs["Z"], 0)
    height = s("MAXIMUM", s("SUBTRACT", 1, s("DIVIDE", xyz.outputs["Z"], 100)), 0)
    dust = s("MULTIPLY", s("MULTIPLY", up, height), 0.055)
    tinted = blend(nodes, links, base, linear("C8B28D"), dust)
    if slot in ("ceramic", "ceramicBand"):
        # Runoff is concentrated immediately below the shared six-metre band grid.
        below = s("LESS_THAN", s("MODULO", s("SUBTRACT", 600, xyz.outputs["Z"]), 6), 0.65)
        vector = nodes.new("ShaderNodeCombineXYZ")
        for axis, scale in (("X", 1.6), ("Y", 1.6), ("Z", 0.08)):
            links.new(s("MULTIPLY", xyz.outputs[axis], scale), vector.inputs[axis])
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 1
        noise.inputs["Detail"].default_value = 2
        links.new(vector.outputs[0], noise.inputs["Vector"])
        streak = s("MULTIPLY", s("MULTIPLY", below, noise.outputs["Fac"]),
                   s("MULTIPLY", s("SUBTRACT", 1, up), 0.04))
        tinted = blend(nodes, links, tinted, tuple(v * 0.72 for v in color[:3]) + (1,), streak)
        # Windward ground faces are more matte; the bone tone remains intact.
        wind = s("MAXIMUM", s("ADD", s("MULTIPLY", nxyz.outputs["X"], 0.6),
                              s("MULTIPLY", nxyz.outputs["Y"], 0.8)), 0)
        foot = s("MULTIPLY", s("LESS_THAN", xyz.outputs["Z"], 3), wind)
        links.new(s("ADD", rough, s("MULTIPLY", foot, 0.14)), shader.inputs["Roughness"])
    links.new(tinted, shader.inputs["Base Color"])
    if slot == "glassGreen":
        green = s("MAXIMUM", s("SUBTRACT", 1, s("DIVIDE", s("SUBTRACT", xyz.outputs["Z"], 8), 10)), 0)
        links.new(s("MULTIPLY", green, 0.12), shader.inputs["Emission Strength"])
    if slot == "deck":
        diagonal = []
        for op in ("ADD", "SUBTRACT"):
            wave = s("MULTIPLY", s(op, xyz.outputs["X"], xyz.outputs["Y"]), 5)
            diagonal.append(s("LESS_THAN", s("PINGPONG", wave, 1), 0.07))
        pattern = s("MAXIMUM", *diagonal)
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.28
        bump.inputs["Distance"].default_value = 0.0012
        links.new(pattern, bump.inputs["Height"])
        if shader.inputs["Normal"].is_linked:
            links.new(shader.inputs["Normal"].links[0].from_socket, bump.inputs["Normal"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])


def collection(name, hidden=False):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    col.hide_viewport = hidden
    col.hide_render = hidden
    return col


def upload(writer, group="build", replace=True):
    if replace:
        for obj in list(bpy.data.objects):
            if obj.get("ctd_group") == group or group == "build" and obj.get("ctd_group") == "support_preview":
                bpy.data.objects.remove(obj, do_unlink=True)
    mats = {}
    names = []
    for (bucket, slot, lod), buf in sorted(writer.buffers.items()):
        if not len(buf["faces"]):
            continue
        vertices = [(x, -z, y) for x, y, z in buf["vertices"]]
        mesh = bpy.data.meshes.new(f"CTDmesh_{bucket}.{slot}.{lod}")
        mesh.from_pydata(vertices, [], buf["faces"])
        mesh.update()
        for p in mesh.polygons:
            p.use_smooth = True
        if hasattr(mesh, "normals_split_custom_set"):
            mesh.normals_split_custom_set([(x, -z, y) for x, y, z in buf["normals"]])
        mesh.materials.append(mats.setdefault(slot, material(slot)))
        obj = bpy.data.objects.new(f"{bucket}.{slot}.{lod}", mesh)
        obj["ctd_group"], obj["ctd_phase"], obj["ctd_triangles"] = group, "Fabrication", len(buf["faces"])
        obj["ctd_slot"], obj["ctd_lod"] = slot, lod
        name = f"CTD_{bucket}_{lod}" if group == "build" else f"CTD_{group}_{bucket}"
        collection(name, group == "debug").objects.link(obj)
        if group == "debug":
            obj.show_in_front = True
        names.append(obj.name)
    # Discard only unused generated meshes, leaving all non-citadel data intact.
    for mesh in list(bpy.data.meshes):
        if mesh.name.startswith("CTDmesh_") and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    return names


def bootstrap():
    scene = bpy.context.scene
    initialized = bpy.data.objects.get("CTD_preview_sun") is not None
    enum(scene.unit_settings, "system", ["METRIC"])
    scene.unit_settings.scale_length = 1
    if bpy.data.objects.get("CTD_preview_sun") is None:
        data = bpy.data.lights.new("CTD_preview_sun", "SUN")
        data.energy = 3
        data.angle = math.radians(3)
        obj = bpy.data.objects.new("CTD_preview_sun", data)
        collection("CTD_preview").objects.link(obj)
        obj.rotation_euler = Vector((-0.55, 0.72, -0.42)).to_track_quat("-Z", "Y").to_euler()
        obj["purpose"] = "Single boot-time preview sun from brief section 3.1"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("CTD_world")
    scene.world.use_nodes = True
    background = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs["Color"].default_value = linear("D9D3C4")
    background.inputs["Strength"].default_value = 0.6
    if bpy.data.objects.get("CTD_review_camera") is None:
        data = bpy.data.cameras.new("CTD_review_camera")
        obj = bpy.data.objects.new("CTD_review_camera", data)
        collection("CTD_preview").objects.link(obj)
        scene.camera = obj
    else:
        scene.camera = bpy.data.objects["CTD_review_camera"]
    scene.camera.hide_set(True)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.resolution_percentage = 100
    scene["CTD_phase"] = "Fabrication — authored ceramic shells and alloy structure"
    scene["CTD_boundary"] = "BLENDER ONLY. No game inspection, export or port without explicit approval."
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.clip_end = 6000
            space.clip_start = 0.15
            space.overlay.show_floor = False
            space.overlay.show_axis_x = False
            space.overlay.show_axis_y = False
            space.overlay.show_extras = False
            space.overlay.show_cursor = False
            if not initialized:
                enum(space.shading, "type", ["SOLID"])
            enum(space.shading, "color_type", ["MATERIAL"])
            enum(space.shading, "light", ["STUDIO"])
            space.shading.show_shadows = True
            space.shading.show_cavity = True
            enum(space.shading, "cavity_type", ["BOTH", "WORLD"])
            space.shading.cavity_ridge_factor = 0.65
            space.shading.cavity_valley_factor = 0.5
            space.shading.curvature_ridge_factor = 0.55
            space.shading.curvature_valley_factor = 0.5
            enum(space.shading, "background_type", ["VIEWPORT"])
            space.shading.background_color = (0.32, 0.35, 0.39)
    return scene


VIEWS = {
    "overview": ((660, 570, 850), (0, 24, 35), 1150, 43),
    "top": ((0, 1800, 40), (0, 0, 40), 1400, 50),
    "approach": ((0, 6, 680), (0, 55, 0), 650, 34),
    "axis": ((0, 6, 415), (0, 66, -45), 420, 32),
    "crown": ((0, 30, 35), (0, 15, 450), 350, 28),
    "hero": ((230, 170, 345), (0, 52, 105), 390, 43),
    "bridge": ((122, 105, 195), (0, 25, 105), 185, 42),
    "rear": ((-640, 440, -750), (0, 30, -20), 1050, 43),
    "spire_close": ((85, 87, 90), (0, 75, -35), 160, 45),
    "barbican": ((120, 65, 625), (0, 28, 460), 210, 45),
    "hangars": ((-275, 56, 310), (-375, 12, 290), 150, 45),
    "condensers": ((-287, 58, -62), (-400, 17, -140), 190, 42),
    "foundry": ((322, 65, 210), (417, 15, 254), 140, 45),
    "hydroponics": ((370, 72, 150), (260, 16, 30), 190, 43),
    "barracks": ((-190, 50, 40), (-282, 18, 20), 130, 40),
}


def view(name="overview", eye=None, target=None, distance=None, lens=None, orthographic=False):
    if eye is None:
        eye, target, distance, lens = VIEWS[name]
        orthographic = name == "top"
    convert = lambda p: Vector((p[0], -p[2], p[1]))
    location, focus = convert(eye), convert(target)
    rotation = (focus - location).to_track_quat("-Z", "Y")
    camera = bpy.context.scene.camera
    camera.location = location
    camera.rotation_euler = rotation.to_euler()
    camera.data.lens = lens or 40
    enum(camera.data, "type", ["ORTHO"] if orthographic else ["PERSP"])
    camera.data.ortho_scale = distance or 1400
    camera.data.clip_end = 6000
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.lens = lens or 40
            space.region_3d.view_rotation = rotation
            space.region_3d.view_location = focus
            space.region_3d.view_distance = (focus - location).length
            enum(space.region_3d, "view_perspective", ["ORTHO"] if orthographic else ["PERSP"])
            area.tag_redraw()


def save(path):
    # File save is the only bpy operator used. Mesh construction uses data APIs exclusively.
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(path).resolve()))


def scene_triangles():
    """Triangles of every visible mesh as Blender stores them, in the fort frame (x, height, z)."""
    import numpy as np
    triangles, owners, names = [], [], []
    for obj in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if obj.type != "MESH" or obj.hide_render or obj.hide_get():
            continue
        if any(c.hide_render or c.hide_viewport for c in obj.users_collection):
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        coords = np.empty(len(mesh.vertices) * 3, np.float32)
        mesh.vertices.foreach_get("co", coords)
        coords = coords.reshape(-1, 3).astype(np.float64)
        matrix = np.array(obj.matrix_world, dtype=float)
        coords = coords @ matrix[:3, :3].T + matrix[:3, 3]
        coords = coords[:, [0, 2, 1]] * (1, 1, -1)
        indices = np.empty(len(mesh.loop_triangles) * 3, np.int32)
        mesh.loop_triangles.foreach_get("vertices", indices)
        triangles.append(coords[indices.reshape(-1, 3)])
        owners.append(np.full(len(mesh.loop_triangles), len(names), np.int32))
        names.append(obj.name)
    return np.concatenate(triangles), np.concatenate(owners), names


def write_audit_snapshot(path):
    import numpy as np
    triangles, owners, names = scene_triangles()
    np.savez(path, triangles=triangles, objects=owners, names=np.array(names))
    print("CTD_AUDIT snapshot", len(names), len(triangles), flush=True)


def render_review(directory, names, samples=24):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
    except TypeError as error:
        raise RuntimeError(f"Cycles preview unavailable: {error}")
    preferences = bpy.context.preferences.addons["cycles"].preferences
    if enum(preferences, "compute_device_type", ["METAL"]) == "METAL":
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == "METAL"
        enum(scene.cycles, "device", ["GPU"])
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = 1440, 1000
    scene.render.resolution_percentage = 100
    enum(scene.render.image_settings, "file_format", ["PNG"])
    for name in names:
        view(name)
        scene.render.filepath = str(directory / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print("CTD_RENDER", name, scene.render.filepath, flush=True)
