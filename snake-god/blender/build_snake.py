"""Génère la tête du Snake (crâne sculpté) et l'exporte en .glb.

Usage (depuis le dossier snake-god) :
    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python blender/build_snake.py
    ... --python blender/build_snake.py -- --preview chemin/apercu.png

Le crâne remplace les sphères de SnakeModel.js : même repère et mêmes dimensions
(museau vers +z dans Three.js, dessus vers +y, centre du crâne à l'origine).
Les yeux, la mâchoire, la langue et les crocs restent dans le jeu : ils sont animés.
Les UV sont calculées par le jeu (projection cylindrique, comme le corps).
"""

import math
import os
import sys

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "client", "assets", "snake.glb")


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bump(dx, dz, rx, rz):
    return math.exp(-((dx / rx) ** 2 + (dz / rz) ** 2))


def skull_shape(sx, sy, sz):
    """Point de la sphère unité -> point du crâne, dans le repère Three.js (x, y, z)."""
    z = 0.07 + sz * 0.6
    # Largeur : tempes larges, joues gonflées, museau effilé (tête de vipère).
    w = 0.39 + 0.06 * bump(sz + 0.3, 0, 0.35, 1) - 0.2 * smoothstep(-0.05, 1.0, sz)
    # Lèvre supérieure : petit bourrelet le long du bas de la tête.
    w *= 1 + 0.07 * math.exp(-((sy + 0.2) / 0.16) ** 2)
    x = sx * w
    # Dessus plat qui descend vers le museau, dessous presque plat.
    if sy > 0:
        y = sy * 0.27 * (1 - 0.38 * smoothstep(-0.2, 1.0, sz))
    else:
        y = sy * 0.12
    y += 0.03
    if sy > 0.2:
        # Arcades sourcilières au-dessus des yeux, creux entre les deux.
        for side in (-1, 1):
            y += 0.085 * bump(x - side * 0.22, z - 0.2, 0.08, 0.15) * smoothstep(0.2, 0.6, sy)
        y -= 0.025 * bump(x, z - 0.15, 0.08, 0.3)
        # Narines : deux petites fossettes sur le museau.
        for side in (-1, 1):
            y -= 0.018 * bump(x - side * 0.075, z - 0.56, 0.03, 0.03)
    # Fossette sensorielle entre l'œil et la narine (comme les crotales).
    for side in (-1, 1):
        if side * x > 0:
            x -= side * 0.02 * bump(y - 0.05, z - 0.45, 0.05, 0.05)
    return x, y, z


def build_skull():
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=40, radius=1)
    obj = bpy.context.view_layer.objects.active
    obj.name = "SnakeSkull"
    for v in obj.data.vertices:
        # Repère de la sphère Blender : on lit le museau sur -Y (Three.js +z).
        sx, sy, sz = v.co.x, v.co.z, -v.co.y
        x, y, z = skull_shape(sx, sy, sz)
        v.co = (x, -z, y)
    for p in obj.data.polygons:
        p.use_smooth = True
    mat = bpy.data.materials.new("Skin")
    mat.use_nodes = True
    obj.data.materials.append(mat)
    return obj


def export(obj):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    print("Exporté :", OUT)


def preview(obj, path):
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    bsdf = next(n for n in obj.data.materials[0].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.05, 0.5, 0.45, 1)
    scene.render.resolution_x = scene.render.resolution_y = 600
    scene.render.filepath = path
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(40), 0, math.radians(30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.8
    cam.location = (1.6, -1.6, 1.1)
    cam.rotation_euler = (math.radians(62), 0, math.radians(45))
    scene.collection.objects.link(cam)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)
    print("Aperçu :", path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    skull = build_skull()
    export(skull)
    if "--preview" in argv:
        preview(skull, os.path.abspath(argv[argv.index("--preview") + 1]))


main()
