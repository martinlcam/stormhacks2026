"""Render offline previews of the exported torch GLB (validates the shipped file, not the source scene).

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python assets/torch/render_preview.py
"""

import math
import os

import bpy
from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
GLB_PATH = os.path.join(REPO, 'public', 'models', 'torch', 'torch.glb')

SHOTS = [
    # name, camera location, look-at, lens, resolution
    ('preview.png', (0.62, -1.18, 0.38), (0.0, 0.0, 0.10), 50, (1024, 1280)),
    ('preview_detail.png', (0.20, -0.42, 0.40), (0.0, 0.0, 0.27), 50, (1024, 1024)),
    ('preview_grip.png', (-0.30, -0.40, -0.08), (0.0, 0.0, -0.10), 50, (1024, 1024)),
]


def srgb(hexstr):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def sky_world():
    world = bpy.data.worlds.new('VioletSky')
    nt = world.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
    horizon = nt.nodes.new('ShaderNodeMapRange')
    horizon.inputs['From Min'].default_value = -1.0
    nt.links.new(sep.outputs['Z'], horizon.inputs['Value'])
    nt.links.new(horizon.outputs['Result'], ramp.inputs['Fac'])
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = srgb('#0e0a1c')
    els[1].position = 0.52
    els[1].color = srgb('#7d5aa8')
    for pos, col in ((0.42, '#2a1a44'), (0.62, '#3a2560'), (1.0, '#12091f')):
        e = els.new(pos)
        e.color = srgb(col)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.7
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return world


def add_light(name, kind, loc, energy, colour, size=0.5, target=None):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = colour[:3]
    if kind == 'AREA':
        data.size = size
    else:
        data.shadow_soft_size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    if target is not None:
        aim(obj, target)
    return obj


def aim(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get("TORCH_SAMPLES", "160"))
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.world = sky_world()

    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    root = bpy.data.objects['Torch']
    root.rotation_euler = Euler((math.radians(-8), math.radians(14), math.radians(-20)))
    bpy.context.view_layer.update()

    emitter = bpy.data.objects['Torch_Emitter'].matrix_world.translation.copy()
    add_light('FlameLight', 'POINT', emitter, 9.0, srgb('#ffb45e'), size=0.03)
    add_light('Key', 'AREA', (-0.9, -1.0, 0.9), 28, srgb('#fff1e0'), size=0.9, target=(0, 0, 0.05))
    add_light('Rim', 'AREA', (0.6, 1.1, 0.7), 70, srgb('#c252e1'), size=0.8, target=(0, 0, 0.1))
    add_light('Fill', 'AREA', (1.0, -0.4, -0.5), 12, srgb('#6ecbf5'), size=0.8, target=(0, 0, -0.05))

    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    for name, loc, look, lens, res in SHOTS:
        cam.location = loc
        aim(cam, look)
        cam_data.lens = lens
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.filepath = os.path.join(HERE, name)
        bpy.ops.render.render(write_still=True)
        print('RENDERED', name)


main()
