"""Génère les modèles 3D du jeu avec Blender et les exporte en .glb.

Usage :
    blender --background --python blender/build_models.py

Chaque modèle fait 1 unité de large (= 1 case de la grille) et est centré
sur l'origine, posé sur le sol (z = 0 dans Blender, y = 0 dans Three.js).
"""

import math
import os

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "models")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            block.remove(item)


def material(name, color, roughness=0.5, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def smooth(obj, bevel_width=0.0, segments=3):
    bpy.context.view_layer.objects.active = obj
    if bevel_width:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel_width
        mod.segments = segments
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth()


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.active_object
    result.name = name
    return result


def export(obj, filename):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT_DIR, filename),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


def build_body():
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.4))
    body = bpy.context.active_object
    body.scale = (0.86, 0.86, 0.8)
    bpy.ops.object.transform_apply(scale=True)
    smooth(body, bevel_width=0.22, segments=4)
    assign(body, material("SnakeBody", (0.05, 0.75, 0.3), roughness=0.35))
    body.name = "Body"
    return body


def build_head():
    # Le museau pointe vers +X (Blender) = +X (Three.js)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.04, 0, 0.45))
    head = bpy.context.active_object
    head.scale = (1.0, 0.92, 0.9)
    bpy.ops.object.transform_apply(scale=True)
    smooth(head, bevel_width=0.28, segments=5)
    assign(head, material("SnakeHead", (0.15, 0.95, 0.45), roughness=0.3))

    white = material("EyeWhite", (1, 1, 1), roughness=0.2)
    black = material("Pupil", (0.01, 0.01, 0.01), roughness=0.1)
    parts = [head]
    for side in (1, -1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(0.28, 0.24 * side, 0.82))
        eye = bpy.context.active_object
        smooth(eye)
        assign(eye, white)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(0.4, 0.26 * side, 0.86))
        pupil = bpy.context.active_object
        smooth(pupil)
        assign(pupil, black)
        parts += [eye, pupil]

    # Langue
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.62, 0, 0.3))
    tongue = bpy.context.active_object
    tongue.scale = (0.28, 0.06, 0.03)
    bpy.ops.object.transform_apply(scale=True)
    assign(tongue, material("Tongue", (0.9, 0.1, 0.25), roughness=0.4))
    parts.append(tongue)

    return join(parts, "Head")


def build_apple():
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.36, location=(0, 0, 0.38), segments=32, ring_count=16)
    apple = bpy.context.active_object
    apple.scale = (1, 1, 0.9)
    bpy.ops.object.transform_apply(scale=True)
    smooth(apple)
    assign(apple, material("Apple", (0.9, 0.05, 0.12), roughness=0.25,
                          emission=(0.9, 0.05, 0.1), strength=0.4))

    bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.2, location=(0, 0, 0.76))
    stem = bpy.context.active_object
    stem.rotation_euler = (0, math.radians(12), 0)
    assign(stem, material("Stem", (0.3, 0.18, 0.05), roughness=0.8))

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=(0.12, 0, 0.78))
    leaf = bpy.context.active_object
    leaf.scale = (1.2, 0.5, 0.15)
    leaf.rotation_euler = (0, math.radians(-25), 0)
    smooth(leaf)
    assign(leaf, material("Leaf", (0.1, 0.7, 0.15), roughness=0.5))

    return join([apple, stem, leaf], "Apple")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for build, filename in ((build_head, "head.glb"), (build_body, "body.glb"), (build_apple, "apple.glb")):
        clear_scene()
        export(build(), filename)
        print("Exporté :", filename)


main()
