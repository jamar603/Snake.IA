"""Génère la nourriture et les pièges de Snakora et les exporte en .glb.

Usage (depuis le dossier snake-god) :
    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python blender/build_props.py
    ... --python blender/build_props.py -- --preview chemin/apercu.png

Style : jouet « low poly » brillant, couleurs franches, proportions lisibles de loin.
Le fichier contient des pièces nommées que le jeu clone (client/render/catalog.js) :

  Nourriture (centrée sur l'origine, ~0,5 case de haut, flotte au-dessus de sa case)
    Apple, Pineapple, Meat, Cherries, Carrot, Mushroom, Grapes, GoldenApple

  Pièges (origine = centre de la case ; la face du cube est à z = -0,48)
    SpikeTrap   plaque à pointes ; enfant SpikeTrapSpikes (origine à la base des pointes,
                le jeu le fait descendre pour rentrer les pointes).
    JawTrap     piège à mâchoires ; enfants JawTrapJawA / JawTrapJawB, charnière sur l'axe x
                (rotation 0 = ouvert à plat, ±90° = fermé).
    SawTrap     fente et lame ; enfant SawTrapBlade (origine au moyeu, tourne autour de y).
  Les matériaux *Glow sont émissifs : le jeu les fait pulser quand un Snake approche.

Unités : 1 = une case de la grille. Blender (z en haut) -> glTF (y en haut).
"""

import math
import os
import random
import sys

import bmesh
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "client", "assets", "props.glb")
FACE = -0.48  # surface de la face du cube sous une case (voir WorldController : points de grille)

rng = random.Random(11)


# ---------- Outils (mêmes conventions que build_island.py) ----------
def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            block.remove(item)


MATERIALS = {}


def srgb(hex_color):
    """0xRRGGBB (sRGB) -> couleur linéaire attendue par Blender."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin((hex_color >> s) & 255) for s in (16, 8, 0))


def material(name, color, roughness=0.5, metallic=0.0, emission=None, strength=0.0):
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


def active():
    return bpy.context.view_layer.objects.active


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def apply_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def shade(obj, smooth=True):
    for poly in obj.data.polygons:
        poly.use_smooth = smooth


def bevel(obj, width, segments=2):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=mod.name)


def sphere(name, radius, loc, mat, scale=(1, 1, 1), subdiv=2, smooth=True):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=radius, subdivisions=subdiv, location=loc)
    obj = active()
    obj.name = name
    obj.scale = scale
    apply_transform(obj)
    shade(obj, smooth)
    assign(obj, mat)
    return obj


def uv_sphere(name, radius, loc, mat, scale=(1, 1, 1), segments=16, rings=10, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments, ring_count=rings, location=loc)
    obj = active()
    obj.name = name
    obj.scale = scale
    apply_transform(obj)
    shade(obj, smooth)
    assign(obj, mat)
    return obj


def cone(name, r1, r2, depth, loc, mat, verts=12, rot=(0, 0, 0), smooth=True):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, vertices=verts, location=loc, rotation=rot)
    obj = active()
    obj.name = name
    apply_transform(obj)
    shade(obj, smooth)
    assign(obj, mat)
    return obj


def box(name, size, loc, mat, bevel_width=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = active()
    obj.name = name
    obj.scale = size
    apply_transform(obj)
    if bevel_width:
        bevel(obj, bevel_width)
    shade(obj, True)
    assign(obj, mat)
    return obj


def torus(name, major, minor, loc, mat, rot=(0, 0, 0), seg=32, minor_seg=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=seg, minor_segments=minor_seg, location=loc, rotation=rot)
    obj = active()
    obj.name = name
    apply_transform(obj)
    shade(obj, True)
    assign(obj, mat)
    return obj


def join(objects, name, origin=(0, 0, 0)):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = active()
    obj.name = name
    obj.data.name = name
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    return obj


def keep_half(obj, axis=1):
    """Supprime la moitié négative d'un maillage (axe 0 = x, 1 = y, 2 = z)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co[axis] < -1e-4], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def parent(child, root):
    child.parent = root
    child.matrix_parent_inverse = root.matrix_world.inverted()


# ---------- Palette ----------
def palette():
    return {
        "apple": material("AppleRed", 0xe8333a, roughness=0.32),
        "appleCheek": material("AppleCheek", 0xff6b4a, roughness=0.3),
        "stem": material("Stem", 0x6b3f22, roughness=0.8),
        "leaf": material("Leaf", 0x4fcf52, roughness=0.5),
        "leafDark": material("LeafDark", 0x2e9a45, roughness=0.55),
        "pineapple": material("Pineapple", 0xf5b52e, roughness=0.55),
        "pineappleDark": material("PineappleDark", 0xc97d1c, roughness=0.6),
        "meat": material("Meat", 0xc0563a, roughness=0.55),
        "meatCrust": material("MeatCrust", 0x8a3324, roughness=0.6),
        "bone": material("Bone", 0xf6ecd8, roughness=0.45),
        "cherry": material("Cherry", 0xd6123f, roughness=0.25),
        "carrot": material("Carrot", 0xff8a1f, roughness=0.5),
        "carrotLine": material("CarrotLine", 0xd96510, roughness=0.55),
        "capRed": material("MushroomCap", 0xff4a5e, roughness=0.4),
        "dots": material("MushroomDots", 0xfff4e6, roughness=0.5),
        "cream": material("MushroomStem", 0xf3e3c8, roughness=0.6),
        "grape": material("Grape", 0x8b4bdc, roughness=0.3),
        "grapeLight": material("GrapeLight", 0xa875ff, roughness=0.3),
        "gold": material("GoldenSkin", 0xffd23f, roughness=0.25, metallic=0.3, emission=0xffa31a, strength=1.2),
        "goldLeaf": material("GoldenLeaf", 0xfff0a0, roughness=0.25, metallic=0.3, emission=0xffd36b, strength=1.2),
        # Pièges : fer violacé (cohérent avec le cadre du cube), acier clair, lueur rouge = danger.
        "iron": material("TrapIron", 0x4a4266, roughness=0.45, metallic=0.3),
        "ironDark": material("TrapIronDark", 0x2a2440, roughness=0.6, metallic=0.2),
        "steel": material("TrapSteel", 0xdcd8ea, roughness=0.25, metallic=0.35),
        "brass": material("TrapBrass", 0xe0aa45, roughness=0.35, metallic=0.35),
        "glow": material("TrapGlow", 0xff3b4a, roughness=0.3, emission=0xff2038, strength=4.0),
    }


# ---------- Nourriture ----------
def build_apple(m, name="Apple", skin=None, leaf=None):
    skin = skin or m["apple"]
    body = uv_sphere("body", 0.2, (0, 0, 0), skin, (1, 1, 0.9), 20, 12)
    # Creux en haut et en bas : la silhouette d'une pomme, pas d'une bille.
    for v in body.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if abs(v.co.z) > 0.12 and r < 0.08:
            v.co.z -= math.copysign(0.05 * (1 - r / 0.08), v.co.z)
    stem = cone("stem", 0.018, 0.012, 0.12, (0.01, 0, 0.18), m["stem"], 6, (0, 0.25, 0))
    lf = uv_sphere("leaf", 0.08, (0.07, 0, 0.21), leaf or m["leaf"], (1, 0.45, 0.12), 10, 6)
    lf.rotation_euler = (0, -0.5, 0.3)
    apply_transform(lf)
    return join([body, stem, lf], name)


def build_pineapple(m):
    # Damier d'écailles : une face sur deux plus sombre, décalée à chaque rang (losanges).
    body = uv_sphere("body", 0.16, (0, 0, -0.04), m["pineapple"], (1, 1, 1.3), 12, 9, smooth=False)
    body.data.materials.append(m["pineappleDark"])
    seg = 12
    for poly in body.data.polygons:
        ring, col = divmod(poly.index, seg)
        poly.material_index = (ring + col) % 2
    crown = []
    for i in range(7):
        a = i / 7 * math.tau
        tilt = 0.35 if i % 2 else 0.6
        c = cone("crown", 0.035, 0.0, 0.2, (math.cos(a) * 0.04, math.sin(a) * 0.04, 0.24), m["leaf"] if i % 2 else m["leafDark"], 4, smooth=False)
        c.rotation_euler = (math.sin(a) * -tilt, math.cos(a) * tilt, 0)
        apply_transform(c)
        crown.append(c)
    top = cone("crownTop", 0.03, 0.0, 0.26, (0, 0, 0.28), m["leafDark"], 4, smooth=False)
    return join([body, *crown, top], "Pineapple")


def build_meat(m):
    # Pilon de dessin animé, posé en diagonale.
    meat = uv_sphere("meat", 0.15, (-0.05, 0, 0.03), m["meat"], (1.15, 0.95, 0.95), 16, 10)
    crust = uv_sphere("crust", 0.152, (-0.05, 0, 0.05), m["meatCrust"], (1.1, 0.9, 0.7), 16, 10)
    keep_half(crust, axis=2)
    bone = cone("bone", 0.035, 0.035, 0.22, (0.14, 0, -0.08), m["bone"], 10, (0, math.radians(125), 0))
    k1 = uv_sphere("knob", 0.045, (0.21, 0.035, -0.14), m["bone"], (1, 1, 1), 10, 6)
    k2 = uv_sphere("knob", 0.045, (0.21, -0.035, -0.14), m["bone"], (1, 1, 1), 10, 6)
    obj = join([meat, crust, bone, k1, k2], "Meat")
    obj.rotation_euler = (0, math.radians(-15), 0)
    apply_transform(obj)
    return obj


def build_cherries(m):
    parts = []
    for s in (-1, 1):
        parts.append(uv_sphere("cherry", 0.1, (s * 0.085, 0, -0.1), m["cherry"], (1, 1, 0.92), 16, 10))
        st = cone("stem", 0.012, 0.01, 0.26, (s * 0.045, 0, 0.04), m["stem"], 6, (0, s * -0.38, 0))
        parts.append(st)
    parts.append(uv_sphere("leaf", 0.08, (0.06, 0, 0.18), m["leaf"], (1, 0.45, 0.12), 10, 6))
    parts.append(uv_sphere("knot", 0.02, (0, 0, 0.16), m["stem"], (1, 1, 1), 6, 4))
    return join(parts, "Cherries")


def build_carrot(m):
    body = cone("body", 0.1, 0.012, 0.36, (0, 0, -0.04), m["carrot"], 12, (math.pi, 0, 0))
    lines = []
    for i, z in enumerate((0.04, -0.04, -0.12)):
        lines.append(torus("line", max(0.02, 0.085 - i * 0.022), 0.006, (0, 0, z), m["carrotLine"], (0, 0, 0), 16, 4))
    leaves = []
    for i in range(3):
        a = i / 3 * math.tau
        c = cone("top", 0.03, 0.0, 0.18, (math.cos(a) * 0.02, math.sin(a) * 0.02, 0.22), m["leaf"], 5, smooth=False)
        c.rotation_euler = (math.sin(a) * -0.35, math.cos(a) * 0.35, 0)
        apply_transform(c)
        leaves.append(c)
    obj = join([body, *lines, *leaves], "Carrot")
    obj.rotation_euler = (0, math.radians(20), 0)
    apply_transform(obj)
    return obj


def build_mushroom(m):
    stem = cone("stem", 0.07, 0.055, 0.2, (0, 0, -0.1), m["cream"], 14)
    cap = uv_sphere("cap", 0.18, (0, 0, 0.0), m["capRed"], (1, 1, 0.75), 20, 12)
    keep_half(cap, axis=2)
    under = cone("under", 0.18, 0.06, 0.03, (0, 0, -0.005), m["cream"], 20)
    dots = []
    for i in range(6):
        a = i / 6 * math.tau + 0.3
        el = 0.5 if i % 2 else 0.9
        p = (math.cos(a) * math.cos(el) * 0.18, math.sin(a) * math.cos(el) * 0.18, math.sin(el) * 0.135)
        d = uv_sphere("dot", 0.03, p, m["dots"], (1, 1, 0.4), 8, 5)
        d.rotation_euler = (0, el - math.pi / 2, a)
        dots.append(d)
    dots.append(uv_sphere("dot", 0.035, (0, 0, 0.133), m["dots"], (1, 1, 0.35), 8, 5))
    return join([stem, cap, under, *dots], "Mushroom", origin=(0, 0, 0))


def build_grapes(m):
    parts = []
    rows = [(4, 0.08, 0.1), (3, 0.065, 0.0), (2, 0.045, -0.1), (1, 0.0, -0.18)]
    for k, (n, r, z) in enumerate(rows):
        for i in range(n):
            a = i / max(1, n) * math.tau + k * 0.5
            mat = m["grapeLight"] if (i + k) % 3 == 0 else m["grape"]
            parts.append(uv_sphere("grape", 0.065, (math.cos(a) * r, math.sin(a) * r, z), mat, (1, 1, 1), 12, 8))
    parts.append(cone("stem", 0.014, 0.01, 0.12, (0, 0, 0.2), m["stem"], 6))
    lf = uv_sphere("leaf", 0.1, (0.07, 0, 0.21), m["leaf"], (1, 0.6, 0.1), 10, 6)
    lf.rotation_euler = (0, -0.4, 0)
    apply_transform(lf)
    parts.append(lf)
    return join(parts, "Grapes")


# ---------- Pièges ----------
def build_spike_trap(m):
    base_z = FACE + 0.05
    plate = box("plate", (0.78, 0.78, 0.1), (0, 0, base_z), m["iron"], 0.025)
    rim = box("rim", (0.66, 0.66, 0.012), (0, 0, base_z + 0.051), m["glow"], 0.004)
    inner = box("inner", (0.6, 0.6, 0.016), (0, 0, base_z + 0.054), m["ironDark"], 0.004)
    bolts = [uv_sphere("bolt", 0.03, (sx * 0.33, sy * 0.33, base_z + 0.05), m["brass"], (1, 1, 0.5), 8, 5) for sx in (-1, 1) for sy in (-1, 1)]
    root = join([plate, rim, inner, *bolts], "SpikeTrap")
    spikes = []
    top = base_z + 0.05
    for x in (-1, 0, 1):
        for y in (-1, 0, 1):
            h = 0.3 if (x, y) == (0, 0) else 0.24
            spikes.append(cone("spike", 0.055, 0.0, h, (x * 0.19, y * 0.19, top + h / 2), m["steel"], 6, smooth=False))
    s = join(spikes, "SpikeTrapSpikes", origin=(0, 0, top))
    parent(s, root)
    return [root, s]


def build_jaw_trap(m):
    base_z = FACE + 0.03
    ring = cone("ring", 0.34, 0.32, 0.05, (0, 0, base_z), m["iron"], 28)
    plate = cone("plate", 0.13, 0.12, 0.03, (0, 0, base_z + 0.035), m["glow"], 20)
    hinge = cone("hinge", 0.03, 0.03, 0.66, (0, 0, base_z + 0.04), m["brass"], 10, (0, math.pi / 2, 0))
    springs = [torus("spring", 0.05, 0.014, (sx * 0.27, 0, base_z + 0.04), m["steel"], (0, math.pi / 2, 0), 12, 6) for sx in (-1, 1)]
    root = join([ring, plate, hinge, *springs], "JawTrap")
    hz = base_z + 0.04
    jaws = []
    for name, side in (("JawTrapJawA", 1), ("JawTrapJawB", -1)):
        # Demi-arceau du côté `side` (y > 0 ou y < 0) ; charnière sur l'axe x.
        arc = torus("arc", 0.27, 0.022, (0, 0, hz), m["iron"], (0, 0, 0), 40, 6)
        bm = bmesh.new()
        bm.from_mesh(arc.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y * side < -1e-4], context="VERTS")
        bm.to_mesh(arc.data)
        bm.free()
        teeth = []
        for i in range(7):
            a = (i + 0.5) / 7 * math.pi
            teeth.append(cone("tooth", 0.03, 0.0, 0.09, (math.cos(a) * 0.27, math.sin(a) * 0.27 * side, hz + 0.045), m["steel"], 4, smooth=False))
        jaw = join([arc, *teeth], name, origin=(0, 0, hz))
        parent(jaw, root)
        jaws.append(jaw)
    return [root, *jaws]


def build_saw_trap(m):
    base_z = FACE + 0.06
    slot = box("slot", (0.74, 0.22, 0.12), (0, 0, base_z), m["iron"], 0.03)
    slit = box("slit", (0.62, 0.05, 0.02), (0, 0, base_z + 0.055), m["glow"], 0.005)
    rails = [box("rail", (0.7, 0.03, 0.02), (0, s * 0.08, base_z + 0.06), m["brass"], 0.006) for s in (-1, 1)]
    root = join([slot, slit, *rails], "SawTrap")
    hub_z = base_z + 0.18  # lame presque entière au-dessus de la fente
    disc = cone("disc", 0.22, 0.22, 0.025, (0, 0, hub_z), m["steel"], 24, (math.pi / 2, 0, 0))
    teeth = []
    for i in range(12):
        a = i / 12 * math.tau
        t = cone("tooth", 0.04, 0.0, 0.08, (math.cos(a) * 0.24, 0, hub_z + math.sin(a) * 0.24), m["steel"], 3, smooth=False)
        t.rotation_euler = (0, math.pi / 2 - a + 0.35, 0)
        apply_transform(t)
        teeth.append(t)
    hub = cone("hub", 0.06, 0.06, 0.05, (0, 0, hub_z), m["glow"], 12, (math.pi / 2, 0, 0))
    blade = join([disc, *teeth, hub], "SawTrapBlade", origin=(0, 0, hub_z))
    parent(blade, root)
    return [root, blade]


# ---------- Export et aperçu ----------
def export(objects):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    print("Exporté :", OUT)


def preview(roots, path):
    """Planche de contrôle : toutes les pièces alignées."""
    for i, obj in enumerate(roots):
        obj.location = ((i % 6) * 0.9 - 2.25, -(i // 6) * 1.0, 0.5)
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 520
    scene.render.filepath = path
    world = bpy.data.worlds.new("Night")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*srgb(0x2a2140), 1)
    bg.inputs["Strength"].default_value = 0.9
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(30))
    bpy.context.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 6.2
    cam.location = (0, -6.4, 3.1)
    cam.rotation_euler = (math.radians(65.4), 0, 0)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)
    print("Aperçu :", path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    clear_scene()
    bpy.context.scene.cursor.location = (0, 0, 0)
    m = palette()
    food = [
        build_apple(m),
        build_pineapple(m),
        build_meat(m),
        build_cherries(m),
        build_carrot(m),
        build_mushroom(m),
        build_grapes(m),
        build_apple(m, "GoldenApple", m["gold"], m["goldLeaf"]),
    ]
    traps = [build_spike_trap(m), build_jaw_trap(m), build_saw_trap(m)]
    roots = food + [t[0] for t in traps]
    every = food + [o for t in traps for o in t]
    for obj in roots:
        obj.location = (0, 0, 0)
    export(every)
    if "--preview" in argv:
        preview(roots, os.path.abspath(argv[argv.index("--preview") + 1]))


main()
