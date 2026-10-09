"""Génère l'île flottante sous le cube de Snakora et l'exporte en .glb.

Usage (depuis le dossier snake-god) :
    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python blender/build_island.py
    ... --python blender/build_island.py -- --preview chemin/apercu.png
    ... --python blender/build_island.py -- --no-bake   (export rapide, sans occlusion précalculée)

Style : diorama « jouet » (bords arrondis, couleurs franches, lanternes chaudes).
Le fichier contient des pièces nommées que le jeu assemble lui-même :
  Island     socle (herbe, terre, roche) pour le plus grand cube, sommet à z = 0 ;
             le jeu l'étire en largeur quand l'arène grandit.
  Tile       dalle de pierre de 1 case, posée sous chaque cellule du cube.
  TreeTeal, TreePink, Pine, Bush, Rock, Crate, Lantern
             décors posés autour du cube, base à z = 0.
  FrameBeam  arête du cube, longueur 1 (étirée par le jeu) ; FrameGlow est recoloré par phase.
  FrameCorner coin du cube.
  Islet      îlot flottant au loin, sommet à z = 0.
  Trap       piège du dieu (1 case, centré) ; TrapGlow est la rune rouge.

Unités : 1 = une case de la grille. Blender (z en haut) -> glTF (y en haut).
"""

import math
import os
import random
import sys

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "client", "assets", "island.glb")

GRID = 13  # WORLD.maxSize dans shared/config.js
MARGIN = 2.4  # bande d'herbe autour du cube, où poussent les décors
HALF = GRID / 2 + MARGIN

rng = random.Random(7)


# ---------- Outils ----------
def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            block.remove(item)


MATERIALS = {}


def material(name, color, roughness=0.6, metallic=0.0, emission=None, strength=0.0):
    if name in MATERIALS:
        return MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*srgb(color), 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*srgb(emission), 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    MATERIALS[name] = mat
    return mat


def srgb(hex_color):
    """0xRRGGBB (sRGB) -> couleur linéaire attendue par Blender."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin((hex_color >> s) & 255) for s in (16, 8, 0))


def active():
    return bpy.context.view_layer.objects.active


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def apply_scale(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def bevel(obj, width, segments=3):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=mod.name)


def shade(obj, smooth=True):
    for poly in obj.data.polygons:
        poly.use_smooth = smooth


def cube(name, size, loc, mat, bevel_width=0.0, segments=3, smooth=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = active()
    obj.name = name
    obj.scale = size
    apply_scale(obj)
    if bevel_width:
        bevel(obj, bevel_width, segments)
    shade(obj, smooth)
    assign(obj, mat)
    return obj


def sphere(name, radius, loc, mat, scale=(1, 1, 1), subdiv=2, smooth=True):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=radius, subdivisions=subdiv, location=loc)
    obj = active()
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    shade(obj, smooth)
    assign(obj, mat)
    return obj


def cylinder(name, r1, r2, depth, loc, mat, verts=12, smooth=True):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, vertices=verts, location=loc)
    obj = active()
    obj.name = name
    shade(obj, smooth)
    assign(obj, mat)
    return obj


def jitter(obj, amount, seed):
    r = random.Random(seed)
    for v in obj.data.vertices:
        v.co.x += (r.random() - 0.5) * amount
        v.co.y += (r.random() - 0.5) * amount
        v.co.z += (r.random() - 0.5) * amount


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = active()
    obj.name = name
    obj.data.name = name
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return obj


# ---------- Palette (nuit violette du jeu, accents chauds) ----------
def palette():
    return {
        "grass": material("Grass", 0x2a6e4c, roughness=0.85),
        "grassDark": material("GrassDark", 0x1b5238, roughness=0.9),
        "dirt": material("Dirt", 0x6b4430, roughness=0.95),
        "dirtDark": material("DirtDark", 0x4a2c22, roughness=0.95),
        "rock": material("Rock", 0x4b4466, roughness=0.9),
        "rockDark": material("RockDark", 0x2c2740, roughness=0.95),
        "stone": material("Stone", 0x8f88a6, roughness=0.75),
        "wood": material("Wood", 0xb06a35, roughness=0.8),
        "woodDark": material("WoodDark", 0x6e3d1f, roughness=0.85),
        "trunk": material("Trunk", 0x5a3424, roughness=0.9),
        "teal": material("LeafTeal", 0x22c3c8, roughness=0.55, emission=0x0e6f8a, strength=0.35),
        "pink": material("LeafPink", 0xff5f8f, roughness=0.55, emission=0x8a1d45, strength=0.35),
        "pine": material("LeafPine", 0x2f9a55, roughness=0.7),
        "flower": material("Flower", 0xfff3d6, roughness=0.5, emission=0xffe9b0, strength=0.6),
        "metal": material("LanternMetal", 0x2b3a6b, roughness=0.4, metallic=0.6),
        "glow": material("LanternGlow", 0xffd27a, roughness=0.3, emission=0xffb347, strength=6.0),
        # Cadre du cube : pierre sombre, liserés dorés, veines lumineuses (recolorées par le jeu).
        "frameStone": material("FrameStone", 0x3a3352, roughness=0.6, metallic=0.1),
        "gold": material("FrameGold", 0xd9a441, roughness=0.3, metallic=0.9),
        "frameGlow": material("FrameGlow", 0xffffff, roughness=0.3, emission=0xffffff, strength=2.0),
        # Piège : même pierre et même or que le cadre, pointes de fer, rune rouge.
        "iron": material("TrapIron", 0x4a4f63, roughness=0.35, metallic=0.85),
        "trapGlow": material("TrapGlow", 0xff3b4a, roughness=0.3, emission=0xff2038, strength=4.0),
    }


# ---------- Pièces ----------
def build_island(m):
    parts = []
    # Herbe : couche du dessus, déborde un peu de la terre comme un gâteau.
    parts.append(cube("grass", (HALF * 2, HALF * 2, 0.45), (0, 0, -0.225), m["grass"], 0.18, 4))
    # Terre puis roche : le socle s'affine vers le bas (île flottante).
    parts.append(cube("dirt", (HALF * 2 - 0.25, HALF * 2 - 0.25, 1.3), (0, 0, -1.05), m["dirt"], 0.22, 3))
    parts.append(cube("dirt2", (HALF * 2 - 0.9, HALF * 2 - 0.9, 1.1), (0, 0, -2.2), m["dirtDark"], 0.3, 3))
    bpy.ops.mesh.primitive_cone_add(radius1=0.8, radius2=HALF * 0.95, depth=4.2, vertices=8, location=(0, 0, -4.8))
    root = active()
    root.name = "roots"
    root.rotation_euler = (0, 0, math.pi / 8)
    apply_scale(root)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=2)
    bpy.ops.object.mode_set(mode="OBJECT")
    jitter(root, 0.9, 3)
    shade(root, False)
    assign(root, m["rock"])
    parts.append(root)
    # Rochers incrustés dans la terre, sur les quatre faces.
    for i in range(22):
        side = i % 4
        t = rng.uniform(-HALF + 1, HALF - 1)
        d = HALF - 0.1
        x, y = [(t, -d), (d, t), (t, d), (-d, t)][side]
        z = rng.uniform(-2.4, -0.8)
        s = rng.uniform(0.25, 0.5)
        r = sphere(f"stone{i}", s, (x, y, z), m["rockDark"], (1.2, 1, 0.8), 1, False)
        jitter(r, s * 0.4, i)
        parts.append(r)
    # Touffes d'herbe qui tombent sur les bords.
    for i in range(36):
        side = i % 4
        t = rng.uniform(-HALF + 0.4, HALF - 0.4)
        d = HALF + 0.02
        x, y = [(t, -d), (d, t), (t, d), (-d, t)][side]
        drip = sphere(f"drip{i}", rng.uniform(0.18, 0.32), (x, y, -0.45), m["grassDark"], (1.4, 1.4, 1.1), 1)
        parts.append(drip)
    return join(parts, "Island")


def build_tile(m):
    # Dalle 1 x 1, sommet à z = 0.06 : affleure au-dessus de l'herbe.
    tile = cube("Tile", (0.94, 0.94, 0.2), (0, 0, -0.04), m["stone"], 0.06, 3)
    bpy.context.scene.cursor.location = (0, 0, 0)
    return tile


def canopy(m, mat, center, radius, seed):
    r = random.Random(seed)
    blobs = [sphere("c", radius, center, mat, (1, 1, 0.9))]
    for k in range(6):
        a = k / 6 * math.tau + r.random() * 0.4
        off = radius * 0.62
        loc = (center[0] + math.cos(a) * off, center[1] + math.sin(a) * off, center[2] + r.uniform(-0.15, 0.25) * radius)
        blobs.append(sphere("c", radius * r.uniform(0.5, 0.65), loc, mat))
    blobs.append(sphere("c", radius * 0.6, (center[0], center[1], center[2] + radius * 0.7), mat))
    return blobs


def build_round_tree(m, leaf, name, seed):
    trunk = cylinder("trunk", 0.12, 0.07, 1.1, (0, 0, 0.55), m["trunk"], 8)
    branch = cylinder("branch", 0.05, 0.03, 0.45, (0.16, 0, 0.75), m["trunk"], 6)
    branch.rotation_euler = (0, math.radians(50), 0)
    apply_scale(branch)
    parts = [trunk, branch] + canopy(m, leaf, (0, 0, 1.45), 0.55, seed)
    return join(parts, name)


def build_pine(m):
    parts = [cylinder("trunk", 0.1, 0.08, 0.5, (0, 0, 0.25), m["trunk"], 8)]
    for i, (r, z) in enumerate(((0.6, 0.75), (0.48, 1.15), (0.34, 1.52))):
        tier = cylinder(f"tier{i}", r, 0.0, 0.7, (0, 0, z), m["pine"], 8, smooth=False)
        tier.rotation_euler = (0, 0, i * 0.4)
        apply_scale(tier)
        parts.append(tier)
    return join(parts, "Pine")


def build_bush(m):
    parts = []
    for i in range(4):
        a = i / 4 * math.tau
        parts.append(sphere("b", 0.26, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.2), m["grassDark"], (1, 1, 0.85)))
    parts.append(sphere("b", 0.3, (0, 0, 0.32), m["grass"]))
    for i in range(5):
        a = rng.random() * math.tau
        parts.append(sphere("f", 0.05, (math.cos(a) * 0.3, math.sin(a) * 0.3, rng.uniform(0.3, 0.5)), m["flower"], subdiv=1))
    return join(parts, "Bush")


def build_rock(m):
    rock = sphere("Rock", 0.4, (0, 0, 0.18), m["rock"], (1.2, 1, 0.65), 1, False)
    jitter(rock, 0.18, 11)
    return rock


def build_crate(m):
    s = 0.7
    parts = [cube("box", (s, s, s), (0, 0, s / 2), m["wood"], 0.04, 2)]
    # Cadre en planches foncées sur les arêtes verticales et une diagonale.
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cube("post", (0.1, 0.1, s + 0.02), (sx * (s / 2 - 0.03), sy * (s / 2 - 0.03), s / 2), m["woodDark"], 0.02, 2))
    for sy in (-1, 1):
        brace = cube("brace", (0.09, 0.04, s * 1.25), (0, sy * (s / 2 + 0.01), s / 2), m["woodDark"], 0.015, 2)
        brace.rotation_euler = (0, math.radians(45), 0)
        apply_scale(brace)
        parts.append(brace)
    return join(parts, "Crate")


def build_lantern(m):
    parts = [
        cylinder("base", 0.16, 0.12, 0.12, (0, 0, 0.06), m["metal"], 10),
        cylinder("post", 0.05, 0.04, 1.5, (0, 0, 0.8), m["metal"], 8),
        cube("cage", (0.3, 0.3, 0.06), (0, 0, 1.56), m["metal"], 0.02, 2),
        cube("lamp", (0.22, 0.22, 0.3), (0, 0, 1.74), m["glow"], 0.04, 2),
        cylinder("roof", 0.24, 0.05, 0.2, (0, 0, 1.98), m["metal"], 4, smooth=False),
    ]
    parts[-1].rotation_euler = (0, 0, math.pi / 4)
    apply_scale(parts[-1])
    return join(parts, "Lantern")


def build_frame_beam(m):
    # Arête du cube : longueur 1 selon z (le jeu l'étire), veine lumineuse sur chaque face.
    parts = [cube("core", (0.16, 0.16, 1.0), (0, 0, 0), m["frameStone"], 0.03, 2)]
    for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        size = (0.012 if sx else 0.04, 0.012 if sy else 0.04, 0.9)
        parts.append(cube("vein", size, (sx * 0.082, sy * 0.082, 0), m["frameGlow"]))
    return join(parts, "FrameBeam")


def build_frame_corner(m):
    parts = [cube("block", (0.36, 0.36, 0.36), (0, 0, 0), m["frameStone"], 0.07, 3)]
    for z in (-0.11, 0.11):
        parts.append(cube("band", (0.385, 0.385, 0.05), (0, 0, z), m["gold"], 0.015, 2))
    # Un clou lumineux au centre de chaque face.
    for axis in range(3):
        for s in (-1, 1):
            loc = [0, 0, 0]
            loc[axis] = s * 0.18
            parts.append(sphere("stud", 0.06, tuple(loc), m["frameGlow"], subdiv=2))
    return join(parts, "FrameCorner")


def build_trap(m):
    # Mine runique flottante (1 case) : noyau de pierre cerclé d'or, six pointes de fer
    # (le jeu les fait sortir quand un Snake approche) et une rune rouge au centre.
    core = sphere("core", 0.2, (0, 0, 0), m["frameStone"], (1, 1, 1), 1, False)
    parts = [core]
    ring = cylinder("ring", 0.25, 0.25, 0.06, (0, 0, 0), m["gold"], 24)
    parts.append(ring)
    for axis in range(3):
        for s in (-1, 1):
            loc = [0.0, 0.0, 0.0]
            loc[axis] = s * 0.25
            spike = cylinder("spike", 0.055, 0.0, 0.2, tuple(loc), m["iron"], 6, smooth=False)
            rot = [(0, s * math.pi / 2, 0), (-s * math.pi / 2, 0, 0), (0, 0, 0) if s > 0 else (math.pi, 0, 0)][axis]
            spike.rotation_euler = rot
            apply_scale(spike)
            parts.append(spike)
    for z in (-1, 1):
        rune = sphere("rune", 0.07, (0, 0, z * 0.17), m["trapGlow"], (1, 1, 0.5), 2)
        parts.append(rune)
    for x in (-1, 1):
        rune = sphere("rune", 0.06, (x * 0.17, 0, 0), m["trapGlow"], (0.5, 1, 1), 2)
        parts.append(rune)
    return join(parts, "Trap")


def build_islet(m):
    # Petit îlot flottant au loin (le jeu y plante un arbre). Sommet à z = 0.
    bpy.ops.mesh.primitive_cone_add(radius1=0.15, radius2=1.0, depth=1.8, vertices=7, location=(0, 0, -1.1))
    rock = active()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=2)
    bpy.ops.object.mode_set(mode="OBJECT")
    jitter(rock, 0.3, 5)
    shade(rock, False)
    assign(rock, m["rock"])
    cap = cylinder("cap", 1.08, 1.0, 0.3, (0, 0, -0.15), m["grass"], 16)
    dirt = cylinder("dirt", 1.02, 0.95, 0.25, (0, 0, -0.4), m["dirt"], 16)
    return join([rock, dirt, cap], "Islet")


# ---------- Lumière précalculée ----------
# Le jeu assemble l'île lui-même (dalles, décors placés par le code, socle étiré) :
# une lightmap de scène entière serait fausse dès la première partie. On précalcule
# donc l'occlusion de chaque pièce seule (creux du feuillage, dessous des branches,
# coins de la caisse, rochers incrustés) dans ses couleurs de sommets. Three.js les
# multiplie à la couleur du matériau : ombres douces gratuites à l'exécution.
AO_DISTANCE = {"Island": 1.4, "Islet": 0.8}  # portée de l'occlusion, en cases (0.5 sinon)
# Caisse : les coins de la boîte sont enfouis dans les montants, l'occlusion par sommet
# la noircirait entière. Elle reste sans précalcul.
AO_SKIP = {"Crate"}
AO_STRENGTH = 0.85
AO_SHADOW = (0.32, 0.26, 0.5)  # les creux virent au violet de la nuit plutôt qu'au gris


def bake_ao(pieces):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.render.bake.target = "VERTEX_COLORS"
    scene.world = scene.world or bpy.data.worlds.new("Bake")
    for name, obj in pieces.items():
        if name in AO_SKIP:
            continue
        for other in pieces.values():
            other.hide_render = other is not obj
        mesh = obj.data
        attr = mesh.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
        mesh.color_attributes.active_color = attr
        mesh.attributes.default_color_name = attr.name
        scene.world.light_settings.distance = AO_DISTANCE.get(name, 0.5)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        for data in attr.data:
            ao = data.color[0] ** 0.8
            k = 1 - AO_STRENGTH * (1 - ao)
            data.color = (*(s + (1 - s) * k for s in AO_SHADOW), 1.0)
        print("Occlusion précalculée :", name)
    for obj in pieces.values():
        obj.hide_render = False


# ---------- Export et aperçu ----------
def export(objects):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_vertex_color="ACTIVE",  # occlusion précalculée -> COLOR_0
    )
    print("Exporté :", OUT)


def preview(pieces, path):
    """Rendu de contrôle : même placement que le jeu (Environment.js), arène 11."""
    tile = pieces["Tile"]
    o = (GRID - 1) / 2
    for x in range(GRID):
        for y in range(GRID):
            t = tile.copy()
            t.location = (x - o, y - o, 0)
            bpy.context.collection.objects.link(t)
    props = ["TreeTeal", "TreePink", "Pine", "Bush", "Rock", "Crate", "Lantern"]
    edge = GRID / 2 + 1.1
    for i in range(28):
        side = i % 4
        t = -edge + (i // 4 + 0.5) * (2 * edge / 7)
        x, y = [(t, -edge), (edge, t), (-t, edge), (-edge, -t)][side]
        p = pieces[props[(i * 3) % len(props)]].copy()
        p.location = (x, y, 0)
        p.rotation_euler = (0, 0, rng.random() * math.tau)
        bpy.context.collection.objects.link(p)

    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 900
    scene.render.resolution_y = 700
    scene.render.filepath = path
    world = bpy.data.worlds.new("Night") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*srgb(0x1a1440), 1)
    bg.inputs["Strength"].default_value = 0.6
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    bpy.context.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 30
    cam.location = (26, -26, 22)
    cam.rotation_euler = (math.radians(58), 0, math.radians(45))
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)
    print("Aperçu :", path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    clear_scene()
    bpy.context.scene.cursor.location = (0, 0, 0)
    m = palette()
    pieces = {
        "Island": build_island(m),
        "Tile": build_tile(m),
        "TreeTeal": build_round_tree(m, m["teal"], "TreeTeal", 1),
        "TreePink": build_round_tree(m, m["pink"], "TreePink", 2),
        "Pine": build_pine(m),
        "Bush": build_bush(m),
        "Rock": build_rock(m),
        "Crate": build_crate(m),
        "Lantern": build_lantern(m),
        "FrameBeam": build_frame_beam(m),
        "FrameCorner": build_frame_corner(m),
        "Islet": build_islet(m),
        "Trap": build_trap(m),
    }
    for obj in pieces.values():
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        obj.location = (0, 0, 0)
    if "--no-bake" not in argv:
        bake_ao(pieces)
    export(list(pieces.values()))
    if "--preview" in argv:
        preview(pieces, os.path.abspath(argv[argv.index("--preview") + 1]))


main()
