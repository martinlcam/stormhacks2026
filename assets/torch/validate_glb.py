"""Structural check of public/models/torch/torch.glb (stdlib only).

    python3 assets/torch/validate_glb.py
"""

import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.join(HERE, '..', '..', 'public', 'models', 'torch', 'torch.glb')

REQUIRED_NODES = {'Torch', 'Torch_Body', 'Torch_Ember', 'Torch_Flame', 'Torch_FlameCore', 'Torch_Emitter'}
REQUIRED_MATERIALS = {'M_Torch_Body', 'M_Torch_Ember', 'M_Torch_Flame', 'M_Torch_FlameCore'}


def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF', 'not a GLB'
    assert version == 2, f'glTF version {version}'
    assert length == len(data), 'length header mismatch'
    json_len, json_type = struct.unpack_from('<I4s', data, 12)
    assert json_type == b'JSON'
    doc = json.loads(data[20:20 + json_len])
    bin_off = 20 + json_len
    bin_len, bin_type = struct.unpack_from('<I4s', data, bin_off)
    assert bin_type == b'BIN\x00'
    return doc, data[bin_off + 8:bin_off + 8 + bin_len], len(data)


def png_size(blob):
    assert blob[:8] == b'\x89PNG\r\n\x1a\n', 'embedded image is not PNG'
    return struct.unpack('>II', blob[16:24])


def main():
    doc, binary, size = load(GLB)
    errors = []
    nodes = doc['nodes']
    names = {n.get('name') for n in nodes}
    missing = REQUIRED_NODES - names
    if missing:
        errors.append(f'missing nodes {missing}')
    mats = {m['name'] for m in doc.get('materials', [])}
    if REQUIRED_MATERIALS - mats:
        errors.append(f'missing materials {REQUIRED_MATERIALS - mats}')

    print(f'GLB {os.path.relpath(GLB)}: {size / 1024 / 1024:.2f} MiB')
    print('extensions:', doc.get('extensionsUsed', []))

    lo = [1e9] * 3
    hi = [-1e9] * 3
    total = 0
    for node in nodes:
        line = f"node {node.get('name')}"
        if 'translation' in node:
            line += f" t={[round(v, 4) for v in node['translation']]}"
        if 'rotation' in node or 'scale' in node:
            line += f" r={node.get('rotation')} s={node.get('scale')}"
        if 'extras' in node:
            line += f" extras={node['extras']}"
        if 'mesh' in node:
            mesh = doc['meshes'][node['mesh']]
            tris = 0
            for prim in mesh['primitives']:
                idx = doc['accessors'][prim['indices']]
                tris += idx['count'] // 3
                pos = doc['accessors'][prim['attributes']['POSITION']]
                for i in range(3):
                    lo[i] = min(lo[i], pos['min'][i])
                    hi[i] = max(hi[i], pos['max'][i])
                for attr in ('NORMAL', 'TEXCOORD_0'):
                    if attr not in prim['attributes']:
                        errors.append(f"{node.get('name')} lacks {attr}")
                mat = doc['materials'][prim['material']]['name']
            total += tris
            line += f' mesh tris={tris} material={mat}'
        print(line)

    print(f'total triangles {total}')
    print('bounds min', [round(v, 4) for v in lo], 'max', [round(v, 4) for v in hi])
    length = hi[1] - lo[1]
    print(f'length along +Y {length:.3f} m')
    if not 0.7 <= length <= 0.9:
        errors.append(f'length {length:.3f} outside 0.7-0.9 m')
    if hi[1] < 0.4 or lo[1] > -0.25:
        errors.append('origin is not near the grip centre / +Y is not up')

    for m in doc['materials']:
        pbr = m.get('pbrMetallicRoughness', {})
        slots = [k for k in ('baseColorTexture', 'metallicRoughnessTexture') if k in pbr]
        slots += [k for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture') if k in m]
        print(f"material {m['name']}: alpha={m.get('alphaMode', 'OPAQUE')} doubleSided={m.get('doubleSided', False)} "
              f"emissive={m.get('emissiveFactor')} ext={list(m.get('extensions', {}))} textures={slots}")

    for i, img in enumerate(doc.get('images', [])):
        if 'bufferView' not in img:
            errors.append(f'image {i} is not embedded')
            continue
        bv = doc['bufferViews'][img['bufferView']]
        blob = binary[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        w, h = png_size(blob)
        print(f"image {img.get('name')}: {img['mimeType']} {w}x{h} {bv['byteLength'] / 1024:.0f} KiB")

    if errors:
        print('FAIL')
        for e in errors:
            print(' -', e)
        sys.exit(1)
    print('OK')


main()
