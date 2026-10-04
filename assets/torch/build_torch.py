"""Beyond Euclid torch: model, bake painted textures, export GLB.

Run from the repo root:
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python assets/torch/build_torch.py

Blender is Z-up while authoring; the glTF exporter converts to +Y up.
Origin sits at the centre of the wrapped grip, the flame points along +Z (+Y in glTF).
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
TEX_DIR = os.path.join(HERE, 'textures')
SRC_TEX_DIR = os.path.join(TEX_DIR, 'bake_src')
GLB_PATH = os.path.join(REPO, 'public', 'models', 'torch', 'torch.glb')
BLEND_PATH = os.path.join(HERE, 'torch.blend')

BODY_TEX = 1024
EMBER_TEX = 512
EMITTER_Z = 0.33
BAKE_SAMPLES = 48

SEED = 7


# ---------------------------------------------------------------------------
# Colour helpers


def srgb(hexstr, alpha=1.0):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


# ---------------------------------------------------------------------------
# Geometry helpers (everything is written straight into bmesh with a material index)


def shaft_radius(z):
    """Hand-carved grip profile; slightly bulbous at the butt, flared under the collar."""
    keys = [
        (-0.275, 0.0180), (-0.24, 0.0200), (-0.19, 0.0210), (-0.12, 0.0192),
        (0.0, 0.0182), (0.10, 0.0188), (0.14, 0.0203), (0.17, 0.0222), (0.20, 0.0222),
    ]
    z = min(max(z, keys[0][0]), keys[-1][0])
    for i in range(len(keys) - 1):
        z0, r0 = keys[i]
        z1, r1 = keys[i + 1]
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            t = t * t * (3 - 2 * t)
            r = r0 + (r1 - r0) * t
            break
    for groove in (-0.215, 0.128):
        r -= 0.0016 * math.exp(-((z - groove) / 0.0026) ** 2)
    return r


def shaft_bend(z):
    """Old timber is never quite straight."""
    return Vector((0.0016 * math.sin(z * 8.0 + 0.4), 0.0011 * math.sin(z * 5.0 - 1.1), 0.0))


def lathe(bm, mat, profile, segments, point_fn=None, phase=0.0):
    """Revolve (z, r) pairs around Z. r == 0 makes a pole. Returns faces created."""
    uv = bm.loops.layers.uv.verify()
    rings = []
    n = len(profile)
    for i, (z, r) in enumerate(profile):
        t = i / (n - 1)
        if r <= 1e-7:
            p = point_fn(0.0, z, 0.0, t) if point_fn else Vector((0, 0, z))
            rings.append([bm.verts.new(p)])
            continue
        ring = []
        for j in range(segments):
            th = phase + 2 * math.pi * j / segments
            p = point_fn(th, z, r, t) if point_fn else Vector((r * math.cos(th), r * math.sin(th), z))
            ring.append(bm.verts.new(p))
        rings.append(ring)

    faces = []
    for i in range(n - 1):
        a, b = rings[i], rings[i + 1]
        va, vb = i / (n - 1), (i + 1) / (n - 1)
        for j in range(segments):
            j1 = (j + 1) % segments
            ua, ub = j / segments, (j + 1) / segments
            if len(a) == 1 and len(b) == 1:
                break
            if len(a) == 1:
                verts = (a[0], b[j1], b[j])
                uvs = ((ua + 0.5 / segments, va), (ub, vb), (ua, vb))
            elif len(b) == 1:
                verts = (a[j], a[j1], b[0])
                uvs = ((ua, va), (ub, va), (ua + 0.5 / segments, vb))
            else:
                verts = (a[j], a[j1], b[j1], b[j])
                uvs = ((ua, va), (ub, va), (ub, vb), (ua, vb))
            f = bm.faces.new(verts)
            f.material_index = mat
            for loop, co in zip(f.loops, uvs):
                loop[uv].uv = co
            faces.append(f)
    return faces


def frames(points, up_fn=None):
    """Parallel-transport frames along a polyline (or aligned to up_fn when given)."""
    n = len(points)
    tangents = []
    for i in range(n):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, n - 1)]
        tangents.append((b - a).normalized())
    out = []
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    normal = (ref - ref.dot(tangents[0]) * tangents[0]).normalized()
    for i, t in enumerate(tangents):
        if up_fn:
            u = up_fn(i, points[i])
            normal = (u - u.dot(t) * t).normalized()
        elif i > 0:
            normal = (normal - normal.dot(t) * t).normalized()
        out.append((t, normal, t.cross(normal)))
    return out


def sweep(bm, mat, points, radius_fn, sides, closed=False, up_fn=None, ellipse=(1.0, 1.0), cap=True):
    """Tube along a polyline. radius_fn(i, t) -> radius."""
    n = len(points)
    fr = frames(points, up_fn)
    rings = []
    for i, p in enumerate(points):
        t, nrm, bin_ = fr[i]
        r = radius_fn(i, i / max(n - 1, 1))
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            ring.append(bm.verts.new(p + (nrm * math.cos(a) * ellipse[0] + bin_ * math.sin(a) * ellipse[1]) * r))
        rings.append(ring)

    count = n if closed else n - 1
    for i in range(count):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            k1 = (k + 1) % sides
            f = bm.faces.new((a[k], a[k1], b[k1], b[k]))
            f.material_index = mat

    if cap and not closed:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            c = bm.verts.new(sum((v.co for v in ring), Vector()) / sides)
            for k in range(sides):
                k1 = (k + 1) % sides
                verts = (c, ring[k1], ring[k]) if rev else (c, ring[k], ring[k1])
                f = bm.faces.new(verts)
                f.material_index = mat


def ring(bm, mat, z, radius, tube, segments=28, sides=6, wobble=0.0):
    pts = []
    for j in range(segments):
        th = 2 * math.pi * j / segments
        r = radius + wobble * math.sin(th * 3 + z * 50)
        pts.append(Vector((r * math.cos(th), r * math.sin(th), z)) + shaft_bend(z))
    sweep(bm, mat, pts, lambda i, t: tube, sides, closed=True)


def gem(bm, mat, center, outward, size, depth, subdiv=2):
    """Flattened icosphere cabochon facing `outward`."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=1.0)
    z = outward.normalized()
    x = z.cross(Vector((0, 0, 1)))
    if x.length < 1e-4:
        x = Vector((1, 0, 0))
    x.normalize()
    y = z.cross(x)
    basis = Matrix((x, y, z)).transposed().to_4x4()
    m = Matrix.Translation(center) @ basis @ Matrix.Diagonal((size, size, depth, 1.0))
    bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
    merge_into(bm, tmp, mat)
    tmp.free()


def merge_into(bm, src, mat):
    vmap = {}
    for v in src.verts:
        vmap[v] = bm.verts.new(v.co)
    for f in src.faces:
        nf = bm.faces.new([vmap[v] for v in f.verts])
        nf.material_index = mat


def leaf(bm, mat, base, direction, side, normal, length, width):
    """Small ivy-ish leaf, built as two closely spaced opposite-facing sheets."""
    d = direction.normalized()
    s = side.normalized()
    nrm = normal.normalized()
    rows, cols = 7, 5
    for sheet in (0, 1):
        offset = nrm * (0.00025 if sheet == 0 else -0.00025)
        grid = []
        for i in range(rows):
            u = i / (rows - 1)
            w = width * (math.sin(math.pi * min(u * 1.08, 1.0)) ** 0.75) * (1.0 + 0.35 * math.sin(math.pi * u) * (1 - u))
            row = []
            for j in range(cols):
                v = j / (cols - 1) * 2 - 1
                cup = 0.0018 * v * v
                droop = -0.004 * u * u
                p = base + d * (u * length) + s * (v * w) + nrm * (cup + droop) + offset
                row.append(bm.verts.new(p))
            grid.append(row)
        for i in range(rows - 1):
            for j in range(cols - 1):
                quad = (grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])
                if sheet == 1:
                    quad = tuple(reversed(quad))
                f = bm.faces.new(quad)
                f.material_index = mat


# ---------------------------------------------------------------------------
# Body parts


WOOD, WRAP, THREAD, BRONZE, STONE, GEM_CYAN, GEM_VIOLET, LEAF = range(8)


def build_shaft(bm):
    segs = 16

    def point(th, z, r, t):
        # Whittled: blend a circle toward an octagon so the knife facets catch light.
        sector = math.pi / 4
        local = (th % sector) - sector / 2
        octagon = math.cos(sector / 2) / math.cos(local)
        rr = r * (0.62 + 0.38 * octagon) / (0.62 + 0.38 * 1.04)
        knot = 0.0011 * math.exp(-(((z + 0.165) / 0.012) ** 2 + ((th - 2.2) / 0.35) ** 2))
        grain = 0.00035 * noise.noise(Vector((math.cos(th) * 3, math.sin(th) * 3, z * 40)))
        rr += knot + grain
        return Vector((rr * math.cos(th), rr * math.sin(th), z)) + shaft_bend(z)

    zs = []
    z = -0.270
    while z < 0.20:
        zs.append(z)
        near_detail = abs(z + 0.215) < 0.012 or abs(z - 0.128) < 0.012 or z > 0.14 or z < -0.2
        z += 0.0022 if near_detail else 0.0075
    zs.append(0.20)
    profile = [(zs[0] - 0.002, 0.0)] + [(z, shaft_radius(z)) for z in zs] + [(0.202, 0.0)]
    lathe(bm, WOOD, profile, segs, point, phase=math.pi / 8)


def build_wrap(bm):
    """Violet leather strap spiralling over the hand zone."""
    z0, z1 = -0.104, 0.104
    pitch = 0.0108
    turns = (z1 - z0) / pitch
    steps = int(turns * 14)
    pts = []
    radials = []
    for i in range(steps + 1):
        t = i / steps
        th = 2 * math.pi * turns * t + 0.6
        z = z0 + (z1 - z0) * t
        r = shaft_radius(z) + 0.0012
        radial = Vector((math.cos(th), math.sin(th), 0))
        pts.append(radial * r + Vector((0, 0, z)) + shaft_bend(z))
        radials.append(radial)
    sweep(bm, WRAP, pts, lambda i, t: 1.0, 6, up_fn=lambda i, p: radials[i], ellipse=(0.0013, 0.0062))

    for zc in (-0.108, -0.112, -0.116, 0.108, 0.112, 0.116):
        ring(bm, THREAD, zc, shaft_radius(zc) + 0.0013, 0.0019, segments=26, sides=6)


def build_pommel(bm):
    profile = [
        (-0.320, 0.0), (-0.3185, 0.0085), (-0.311, 0.0195), (-0.300, 0.0272),
        (-0.289, 0.0292), (-0.279, 0.0262), (-0.272, 0.0212), (-0.267, 0.0186), (-0.265, 0.0),
    ]

    def point(th, z, r, t):
        return Vector((r * math.cos(th), r * math.sin(th), z)) + shaft_bend(z)

    lathe(bm, STONE, profile, 8, point, phase=math.pi / 8)
    ring(bm, BRONZE, -0.2655, 0.0192, 0.0026, segments=24, sides=6)
    gem(bm, GEM_VIOLET, Vector((0, 0, -0.3195)) + shaft_bend(-0.32), Vector((0, 0, -1)), 0.0075, 0.0038)


def build_collar_and_cradle(bm):
    bz = 0.20
    bend = shaft_bend(bz)

    def point(th, z, r, t):
        return Vector((r * math.cos(th), r * math.sin(th), z)) + bend

    collar = [
        (0.160, 0.0), (0.1605, 0.0212), (0.1635, 0.0272), (0.1690, 0.0288), (0.1735, 0.0262),
        (0.1760, 0.0258), (0.2040, 0.0258), (0.2070, 0.0290), (0.2120, 0.0302), (0.2160, 0.0282),
        (0.2200, 0.0278), (0.2300, 0.0335), (0.2420, 0.0395), (0.2520, 0.0428), (0.2590, 0.0452),
        (0.2630, 0.0450), (0.2640, 0.0425), (0.2600, 0.0380), (0.2530, 0.0300), (0.2470, 0.0150),
        (0.2455, 0.0),
    ]
    lathe(bm, BRONZE, collar, 28, point)

    # Cyan inlays on the collar band; the first one faces the first-person camera (glTF +Z).
    for ang in (-90, 30, 150):
        a = math.radians(ang)
        out = Vector((math.cos(a), math.sin(a), 0))
        gem(bm, GEM_CYAN, out * 0.0262 + Vector((0, 0, 0.190)) + bend, out, 0.0058, 0.0030)

    # Four swirling prongs: each one twists a little as it rises, the cage reads as gently impossible.
    for k in range(4):
        th0 = math.radians(45 + 90 * k)
        pts = []
        n = 26
        for i in range(n):
            t = i / (n - 1)
            th = th0 + 0.75 * t
            r = 0.0440 + 0.0205 * math.sin(math.pi * t * 0.9) - 0.0125 * t * t
            z = 0.2545 + 0.150 * t
            if t > 0.85:
                curl = (t - 0.85) / 0.15
                r -= 0.006 * curl * curl
                z -= 0.004 * curl * curl
            pts.append(Vector((r * math.cos(th), r * math.sin(th), z)) + bend)
        sweep(bm, BRONZE, pts, lambda i, t: 0.0052 - 0.0021 * t, 8)
        tip = pts[-1]
        gem(bm, BRONZE, tip + (tip - pts[-2]).normalized() * 0.002, (tip - pts[-2]), 0.0042, 0.0042, subdiv=1)

    # A thin halo binding the prongs together.
    t = 0.70
    r_halo = 0.0440 + 0.0205 * math.sin(math.pi * t * 0.9) - 0.0125 * t * t
    pts = []
    for j in range(36):
        th = 2 * math.pi * j / 36
        pts.append(Vector((r_halo * math.cos(th), r_halo * math.sin(th), 0.2545 + 0.150 * t)) + bend)
    sweep(bm, BRONZE, pts, lambda i, tt: 0.0021, 6, closed=True)


def build_ivy(bm):
    """A single sprout of ivy has crept up from the pommel, like the portal frames."""
    pts = []
    radials = []
    n = 40
    for i in range(n):
        t = i / (n - 1)
        th = math.radians(200) + t * 2 * math.pi * 1.15
        z = -0.262 + 0.115 * t
        r = shaft_radius(z) + 0.0009 + 0.0003 * math.sin(t * 20)
        radial = Vector((math.cos(th), math.sin(th), 0))
        pts.append(radial * r + Vector((0, 0, z)) + shaft_bend(z))
        radials.append(radial)
    sweep(bm, LEAF, pts, lambda i, t: 0.00125 - 0.0006 * t, 5)

    for idx, length, width in ((13, 0.016, 0.0068), (25, 0.013, 0.0058), (36, 0.0105, 0.0047)):
        p = pts[idx]
        radial = radials[idx]
        tangent = (pts[idx + 1] - pts[idx - 1]).normalized()
        side = tangent.cross(radial)
        direction = (tangent * 0.55 + side * 0.65 * (1 if idx % 2 else -1) + radial * 0.15).normalized()
        leaf_side = direction.cross(radial)
        leaf(bm, LEAF, p + radial * 0.0006, direction, leaf_side, radial, length, width)


def build_body():
    bm = bmesh.new()
    build_shaft(bm)
    build_wrap(bm)
    build_pommel(bm)
    build_collar_and_cradle(bm)
    build_ivy(bm)
    bm.normal_update()
    me = bpy.data.meshes.new('Torch_Body')
    bm.to_mesh(me)
    bm.free()
    return me


def build_ember():
    bm = bmesh.new()
    center = Vector((0, 0, 0.262)) + shaft_bend(0.20)
    lumps = [(center, 0.029, 0.78, 3), (center + Vector((0.026, -0.010, 0.002)), 0.011, 0.8, 2),
             (center + Vector((-0.020, -0.020, 0.0)), 0.010, 0.8, 2), (center + Vector((-0.012, 0.026, 0.001)), 0.0095, 0.8, 2),
             (center + Vector((0.016, 0.022, -0.001)), 0.008, 0.8, 1)]
    for li, (c, r, squash, sub) in enumerate(lumps):
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=sub, radius=r)
        for v in tmp.verts:
            d = v.co.normalized()
            n = noise.noise(d * 2.2 + Vector((li * 3.1, 0, 0)))
            n2 = noise.noise(d * 6.0 + Vector((0, li * 1.7, 0)))
            v.co = d * r * (1 + 0.22 * n + 0.07 * n2)
            v.co.z *= squash
            v.co += c
        merge_into(bm, tmp, 0)
        tmp.free()
    me = bpy.data.meshes.new('Torch_Ember')
    bm.to_mesh(me)
    bm.free()
    return me


def flame_tongue(bm, z0, z1, max_r, wobble, lean, segments, rings, base, phase=0.0):
    """One teardrop tongue revolved around Z; `lean` is the XY drift reached at the tip."""

    def profile_r(t):
        # Fat low belly, long tapering tip.
        return max_r * ((t / 0.3) ** 0.5 if t < 0.3 else 1.0) * (1 - max(t - 0.3, 0) / 0.7) ** 1.35

    profile = [(z0, 0.0)]
    for i in range(1, rings):
        t = i / rings
        profile.append((z0 + (z1 - z0) * t, profile_r(t)))
    profile.append((z1, 0.0))

    def point(th, z, r, t):
        tw = th + 2.6 * t + phase
        rr = r * (1 + wobble * t * math.sin(3 * tw + 1.0) + wobble * 0.45 * math.sin(5 * th - 9 * t + phase))
        drift = lean * (t ** 1.8)
        return Vector((rr * math.cos(th) + drift.x, rr * math.sin(th) + drift.y, z)) + base

    lathe(bm, 0, profile, segments, point)


def build_flame(name, z0, z1, max_r, wobble, lean, segments=24, rings=22, side_tongues=()):
    """Main tongue plus optional (angle_deg, start_frac, height_frac, radius_frac, outward) side tongues."""
    base = shaft_bend(0.20)
    bm = bmesh.new()
    flame_tongue(bm, z0, z1, max_r, wobble, Vector((lean, lean * 0.3, 0)), segments, rings, base)
    for k, (ang, start, height, rad, outward) in enumerate(side_tongues):
        a = math.radians(ang)
        d = Vector((math.cos(a), math.sin(a), 0))
        offset = d * max_r * 0.55
        tz0 = z0 + (z1 - z0) * start
        tz1 = z0 + (z1 - z0) * height
        flame_tongue(bm, tz0, tz1, max_r * rad, wobble * 0.6, d * outward, segments // 2 + 4, rings // 2 + 4,
                     base + offset, phase=1.7 * (k + 1))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


# ---------------------------------------------------------------------------
# Shader helpers


class Graph:
    def __init__(self, mat):
        self.mat = mat
        self.nt = mat.node_tree
        self.x = 0

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        node.location = (self.x, 0)
        self.x += 200
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.nt.links.new(a, b)

    def feed(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.link(value, socket)
        else:
            socket.default_value = value

    def noise(self, vector, scale, detail=4.0, rough=0.55, distortion=0.0):
        nd = self.n('ShaderNodeTexNoise')
        if vector is not None:
            self.link(vector, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        nd.inputs['Distortion'].default_value = distortion
        return nd.outputs['Fac']

    def voronoi(self, vector, scale, feature='F1', output='Distance'):
        nd = self.n('ShaderNodeTexVoronoi', feature=feature)
        if vector is not None:
            self.link(vector, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale
        return nd.outputs[output]

    def ramp(self, fac, stops):
        nd = self.n('ShaderNodeValToRGB')
        els = nd.color_ramp.elements
        while len(els) > 1:
            els.remove(els[-1])
        els[0].position = stops[0][0]
        els[0].color = stops[0][1]
        for pos, col in stops[1:]:
            e = els.new(pos)
            e.color = col
        self.feed(nd.inputs['Fac'], fac)
        return nd.outputs['Color']

    def mix(self, fac, a, b, blend='MIX'):
        nd = self.n('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        nd.clamp_result = True
        fac_in = [s for s in nd.inputs if s.name == 'Factor' and s.type == 'VALUE'][0]
        a_in = [s for s in nd.inputs if s.name == 'A' and s.type == 'RGBA'][0]
        b_in = [s for s in nd.inputs if s.name == 'B' and s.type == 'RGBA'][0]
        self.feed(fac_in, fac)
        self.feed(a_in, a)
        self.feed(b_in, b)
        return [s for s in nd.outputs if s.name == 'Result' and s.type == 'RGBA'][0]

    def math(self, op, a, b=0.0, clamp=False):
        nd = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.feed(nd.inputs[0], a)
        self.feed(nd.inputs[1], b)
        return nd.outputs[0]

    def remap(self, value, fmin, fmax, tmin=0.0, tmax=1.0):
        nd = self.n('ShaderNodeMapRange', clamp=True)
        self.feed(nd.inputs['Value'], value)
        nd.inputs['From Min'].default_value = fmin
        nd.inputs['From Max'].default_value = fmax
        nd.inputs['To Min'].default_value = tmin
        nd.inputs['To Max'].default_value = tmax
        return nd.outputs['Result']

    def ao(self, distance):
        nd = self.n('ShaderNodeAmbientOcclusion', samples=16, only_local=True)
        nd.inputs['Distance'].default_value = distance
        return nd.outputs['AO']

    def pointiness(self):
        return self.n('ShaderNodeNewGeometry').outputs['Pointiness']

    def coords(self, kind='Object'):
        return self.n('ShaderNodeTexCoord').outputs[kind]

    def stretch(self, vector, scale):
        nd = self.n('ShaderNodeMapping')
        self.link(vector, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale
        return nd.outputs['Vector']

    def bump(self, height, strength, distance):
        nd = self.n('ShaderNodeBump')
        nd.inputs['Strength'].default_value = strength
        nd.inputs['Distance'].default_value = distance
        self.feed(nd.inputs['Height'], height)
        return nd.outputs['Normal']


def new_material(name):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    mat.node_tree.nodes.clear()
    return mat


BLACK = (0, 0, 0, 1)


def src_wood(g):
    obj = g.coords()
    grain = g.noise(g.stretch(obj, (1, 1, 0.045)), 170, detail=9, rough=0.62, distortion=1.4)
    rings_ = g.noise(g.stretch(obj, (1, 1, 0.012)), 420, detail=3, rough=0.5)
    blotch = g.noise(obj, 20, detail=4)
    fine = g.noise(obj, 1400, detail=2)
    base = g.ramp(grain, [(0.28, srgb('#241a16')), (0.47, srgb('#4a382d')), (0.62, srgb('#6a5442')), (0.80, srgb('#8a725b'))])
    lines = g.noise(g.stretch(obj, (1, 1, 0.03)), 260, detail=3, rough=0.5, distortion=0.6)
    line_mask = g.remap(g.math('ABSOLUTE', g.math('SUBTRACT', lines, 0.5)), 0.0, 0.035, 0.75, 0.0)
    base = g.mix(line_mask, base, srgb('#1c1311'))
    base = g.mix(g.remap(rings_, 0.55, 0.75, 0, 0.35), base, srgb('#3a2a22'))
    silver = g.remap(blotch, 0.45, 0.7, 0.05, 0.4)
    base = g.mix(silver, base, srgb('#7a7280'))
    edge = g.remap(g.pointiness(), 0.505, 0.56, 0, 0.75)
    base = g.mix(edge, base, srgb('#c2ac90'))
    cav = g.remap(g.ao(0.008), 0.15, 1.0, 0.35, 1.0)
    color = g.mix(1.0, base, cav, 'MULTIPLY')
    rough = g.math('SUBTRACT', g.remap(grain, 0.3, 0.8, 0.86, 0.66), g.math('MULTIPLY', edge, 0.2))
    height = g.math('SUBTRACT', g.math('ADD', g.math('MULTIPLY', grain, 0.7), g.math('MULTIPLY', fine, 0.2)), g.math('MULTIPLY', line_mask, 0.35))
    return dict(color=color, rough=rough, metal=0.0, emit=BLACK, normal=g.bump(height, 0.7, 0.009))


def src_wrap(g):
    obj = g.coords()
    mottled = g.noise(obj, 160, detail=5)
    pores = g.noise(obj, 1600, detail=2)
    base = g.ramp(mottled, [(0.3, srgb('#26123a')), (0.55, srgb('#3d2058')), (0.78, srgb('#5a3480'))])
    edge = g.remap(g.pointiness(), 0.5, 0.58, 0, 0.6)
    base = g.mix(edge, base, srgb('#8a64aa'))
    cav = g.remap(g.ao(0.004), 0.1, 1.0, 0.3, 1.0)
    color = g.mix(1.0, base, cav, 'MULTIPLY')
    rough = g.remap(mottled, 0.3, 0.8, 0.82, 0.62)
    return dict(color=color, rough=rough, metal=0.0, emit=BLACK, normal=g.bump(pores, 0.45, 0.0025))


def src_thread(g):
    obj = g.coords()
    twist = g.noise(g.stretch(obj, (1, 1, 6)), 600, detail=2)
    base = g.ramp(twist, [(0.35, srgb('#3f97b2')), (0.65, srgb('#86d8ec'))])
    cav = g.remap(g.ao(0.003), 0.1, 1.0, 0.45, 1.0)
    color = g.mix(1.0, base, cav, 'MULTIPLY')
    return dict(color=color, rough=0.85, metal=0.0, emit=BLACK, normal=g.bump(twist, 0.5, 0.002))


def src_bronze(g):
    obj = g.coords()
    tone = g.noise(obj, 70, detail=6)
    speck = g.noise(obj, 900, detail=3)
    blotch = g.noise(obj, 26, detail=5, distortion=0.4)
    ao = g.ao(0.012)
    edge = g.remap(g.pointiness(), 0.5, 0.57, 0, 1)
    metal_col = g.ramp(tone, [(0.3, srgb('#5e4126')), (0.55, srgb('#94703f')), (0.75, srgb('#c19a5a'))])
    metal_col = g.mix(edge, metal_col, srgb('#e0c184'))
    mask = g.math('ADD', g.remap(ao, 0.25, 0.95, 0.75, 0.0), g.remap(blotch, 0.4, 0.68, -0.25, 0.55))
    mask = g.math('SUBTRACT', mask, g.math('MULTIPLY', edge, 0.8), clamp=True)
    mask = g.remap(mask, 0.32, 0.5)
    patina = g.ramp(speck, [(0.3, srgb('#3f7f78')), (0.6, srgb('#62ab9c')), (0.8, srgb('#93d1c0'))])
    base = g.mix(mask, metal_col, patina)
    cav = g.remap(ao, 0.1, 1.0, 0.4, 1.0)
    color = g.mix(1.0, base, cav, 'MULTIPLY')
    metal = g.math('SUBTRACT', 1.0, mask, clamp=True)
    rough = g.math('ADD', g.remap(tone, 0.3, 0.8, 0.32, 0.55), g.math('MULTIPLY', mask, 0.35), clamp=True)
    height = g.math('ADD', g.math('MULTIPLY', speck, 0.35), g.math('MULTIPLY', mask, 0.65))
    return dict(color=color, rough=rough, metal=metal, emit=BLACK, normal=g.bump(height, 0.55, 0.005))


def src_stone(g):
    obj = g.coords()
    mott = g.noise(obj, 55, detail=6)
    speck = g.noise(obj, 1200, detail=2)
    cracks = g.voronoi(g.stretch(obj, (1, 1, 1)), 70, feature='DISTANCE_TO_EDGE')
    crack_mask = g.remap(cracks, 0.0, 0.045, 1.0, 0.0)
    base = g.ramp(mott, [(0.3, srgb('#c7bcc9')), (0.55, srgb('#e3dcea')), (0.75, srgb('#f1ece6'))])
    base = g.mix(g.remap(speck, 0.6, 0.75, 0, 0.5), base, srgb('#a99db0'))
    base = g.mix(g.math('MULTIPLY', crack_mask, 0.7), base, srgb('#7d7088'))
    cav = g.remap(g.ao(0.01), 0.1, 1.0, 0.45, 1.0)
    color = g.mix(1.0, base, cav, 'MULTIPLY')
    height = g.math('SUBTRACT', g.math('MULTIPLY', mott, 0.6), g.math('MULTIPLY', crack_mask, 0.5))
    return dict(color=color, rough=g.remap(mott, 0.3, 0.8, 0.85, 0.7), metal=0.0, emit=BLACK, normal=g.bump(height, 0.6, 0.007))


def src_gem(colour, glow):
    def build(g):
        obj = g.coords()
        swirl = g.noise(obj, 300, detail=3)
        base = g.ramp(swirl, [(0.3, srgb(colour)), (0.75, srgb(glow))])
        emit = g.mix(1.0, base, (0.45, 0.45, 0.45, 1.0), 'MULTIPLY')
        return dict(color=base, rough=0.12, metal=0.0, emit=emit, normal=None)

    return build


def src_leaf(g):
    obj = g.coords()
    mott = g.noise(obj, 250, detail=4)
    base = g.ramp(mott, [(0.3, srgb('#3f6b35')), (0.55, srgb('#5f9248')), (0.75, srgb('#8fbf5a'))])
    edge = g.remap(g.pointiness(), 0.5, 0.6, 0, 0.6)
    base = g.mix(edge, base, srgb('#c3dc8a'))
    cav = g.remap(g.ao(0.004), 0.1, 1.0, 0.55, 1.0)
    color = g.mix(1.0, base, cav, 'MULTIPLY')
    return dict(color=color, rough=0.55, metal=0.0, emit=BLACK, normal=g.bump(mott, 0.35, 0.002))


def src_ember(g):
    obj = g.coords()
    cells = g.voronoi(obj, 110, feature='DISTANCE_TO_EDGE')
    warp = g.noise(obj, 160, detail=4)
    crack = g.math('MULTIPLY', g.remap(cells, 0.0, 0.07, 1.0, 0.0), g.remap(warp, 0.35, 0.6, 0.35, 1.0))
    heat = g.remap(g.ao(0.02), 0.3, 1.0, 1.0, 0.25)
    glow_mask = g.math('ADD', crack, g.math('MULTIPLY', heat, 0.35), clamp=True)
    char = g.ramp(warp, [(0.3, srgb('#140d10')), (0.7, srgb('#3b2627'))])
    glow = g.ramp(glow_mask, [(0.0, srgb('#2a0d05')), (0.35, srgb('#c2410f')), (0.7, srgb('#ff9a3c')), (1.0, srgb('#ffe2a6'))])
    color = g.mix(g.math('MULTIPLY', glow_mask, 0.85), char, glow)
    emit = g.mix(1.0, glow, g.remap(glow_mask, 0.05, 0.6, 0.0, 1.0), 'MULTIPLY')
    return dict(color=color, rough=0.9, metal=0.0, emit=emit, normal=g.bump(g.math('SUBTRACT', 1.0, crack), 0.7, 0.006))


# ---------------------------------------------------------------------------
# Baking


def make_image(name, size, non_color=False, alpha=False):
    img = bpy.data.images.new(name, size, size, alpha=alpha)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def bake_rig(mat, sockets_fn):
    """Build the procedural graph plus emission/principled outputs used for baking."""
    g = Graph(mat)
    sockets = sockets_fn(g)
    out = g.n('ShaderNodeOutputMaterial')
    emit = g.n('ShaderNodeEmission')
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    target = g.n('ShaderNodeTexImage')
    mat.use_fake_user = True
    return dict(graph=g, sockets=sockets, out=out, emit=emit, bsdf=bsdf, target=target)


def set_pass(rig, key, image):
    g = rig['graph']
    out, emit, bsdf, target = rig['out'], rig['emit'], rig['bsdf'], rig['target']
    for link in list(out.inputs['Surface'].links) + list(emit.inputs['Color'].links) + list(bsdf.inputs['Normal'].links):
        g.nt.links.remove(link)
    if key == 'normal':
        if rig['sockets']['normal'] is not None:
            g.link(rig['sockets']['normal'], bsdf.inputs['Normal'])
        g.link(bsdf.outputs['BSDF'], out.inputs['Surface'])
    else:
        val = rig['sockets'][key]
        if isinstance(val, bpy.types.NodeSocket):
            g.link(val, emit.inputs['Color'])
        else:
            emit.inputs['Color'].default_value = val if isinstance(val, tuple) else (val, val, val, 1)
        emit.inputs['Strength'].default_value = 1.0
        g.link(emit.outputs['Emission'], out.inputs['Surface'])
    target.image = image
    for nd in g.nt.nodes:
        nd.select = False
    target.select = True
    g.nt.nodes.active = target


def bake(obj, rigs, passes, size, prefix):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    images = {}
    for key in passes:
        non_color = key in ('rough', 'metal', 'normal', 'ao')
        img = make_image(f'{prefix}_{key}', size, non_color=non_color)
        for rig in rigs:
            set_pass(rig, 'color' if key == 'ao' else key, img)
        if key == 'normal':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=10, use_clear=True)
        elif key == 'ao':
            bpy.ops.object.bake(type='AO', margin=10, use_clear=True)
        else:
            bpy.ops.object.bake(type='EMIT', margin=10, use_clear=True)
        images[key] = img
        print(f'baked {prefix} {key}')
    return images


def save_png(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


def pixels(img):
    arr = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(img.size[1], img.size[0], 4)


def image_from_array(name, arr, non_color=False, alpha=True):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=alpha)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    return img


# ---------------------------------------------------------------------------
# Hand-painted flame gradients (numpy, written as sRGB)


def flame_texture(name, stops, alpha_fn, w=256, h=512, streak=0.18):
    v = (np.arange(h) + 0.5) / h
    u = (np.arange(w) + 0.5) / w
    uu, vv = np.meshgrid(u, v)
    pos = np.array([s[0] for s in stops])
    cols = np.array([[int(s[1][i:i + 2], 16) / 255 for i in (1, 3, 5)] for s in stops])
    rgb = np.stack([np.interp(vv, pos, cols[:, c]) for c in range(3)], axis=-1)
    rng = np.random.default_rng(SEED)
    phases = rng.uniform(0, 2 * np.pi, 4)
    flick = (np.sin(uu * 2 * np.pi * 3 + vv * 9 + phases[0]) * 0.5
             + np.sin(uu * 2 * np.pi * 5 - vv * 15 + phases[1]) * 0.3
             + np.sin(uu * 2 * np.pi * 8 + vv * 23 + phases[2]) * 0.2)
    rgb = np.clip(rgb * (1 + streak * flick[..., None] * vv[..., None]), 0, 1)
    a = np.clip(alpha_fn(vv) * (1 + 0.25 * flick * vv), 0, 1)
    return image_from_array(name, np.concatenate([rgb, a[..., None]], axis=-1))


# ---------------------------------------------------------------------------
# Final glTF-friendly materials


def gltf_output_group():
    name = 'glTF Material Output'
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    ng = bpy.data.node_groups.new(name, 'ShaderNodeTree')
    ng.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    ng.nodes.new('NodeGroupInput')
    return ng


def final_material(name, color, orm=None, normal=None, emissive=None, emissive_strength=1.0,
                   rough=0.5, metal=0.0, alpha_from_color=False, cull=True):
    mat = new_material(name)
    g = Graph(mat)
    out = g.n('ShaderNodeOutputMaterial')
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    g.link(bsdf.outputs['BSDF'], out.inputs['Surface'])
    tex = g.n('ShaderNodeTexImage', image=color)
    g.link(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha_from_color:
        g.link(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.surface_render_method = 'BLENDED'
    if orm is not None:
        t = g.n('ShaderNodeTexImage', image=orm)
        sep = g.n('ShaderNodeSeparateColor')
        g.link(t.outputs['Color'], sep.inputs['Color'])
        g.link(sep.outputs['Green'], bsdf.inputs['Roughness'])
        g.link(sep.outputs['Blue'], bsdf.inputs['Metallic'])
        grp = g.n('ShaderNodeGroup')
        grp.node_tree = gltf_output_group()
        g.link(sep.outputs['Red'], grp.inputs['Occlusion'])
    else:
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
    if normal is not None:
        t = g.n('ShaderNodeTexImage', image=normal)
        nm = g.n('ShaderNodeNormalMap')
        g.link(t.outputs['Color'], nm.inputs['Color'])
        g.link(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emissive is not None:
        t = tex if emissive is color else g.n('ShaderNodeTexImage', image=emissive)
        g.link(t.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emissive_strength
    mat.use_backface_culling = cull
    return mat


# ---------------------------------------------------------------------------
# Scene assembly


def link_object(name, data, parent=None):
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def smart_uv(obj, margin):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=margin, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def smooth(me, angle):
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(angle))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = BAKE_SAMPLES
    scene.render.bake.margin_type = 'EXTEND'
    world = bpy.data.worlds.new('BakeWorld')
    scene.world = world
    world.light_settings.distance = 0.02

    root = link_object('Torch', None)

    body_me = build_body()
    smooth(body_me, 38)
    body = link_object('Torch_Body', body_me, root)

    builders = [
        ('SRC_Wood', src_wood), ('SRC_Wrap', src_wrap), ('SRC_Thread', src_thread),
        ('SRC_Bronze', src_bronze), ('SRC_Stone', src_stone),
        ('SRC_GemCyan', src_gem('#4fb7e6', '#b5f0ff')), ('SRC_GemViolet', src_gem('#9c3fc0', '#e7a3ff')),
        ('SRC_Leaf', src_leaf),
    ]
    rigs = []
    for name, fn in builders:
        mat = new_material(name)
        body_me.materials.append(mat)
        rigs.append(bake_rig(mat, fn))
    smart_uv(body, 0.004)
    body_imgs = bake(body, rigs, ['color', 'rough', 'metal', 'emit', 'normal', 'ao'], BODY_TEX, 'Torch_Body')

    ember_me = build_ember()
    smooth(ember_me, 60)
    ember = link_object('Torch_Ember', ember_me, root)
    ember_mat = new_material('SRC_Ember')
    ember_me.materials.append(ember_mat)
    ember_rig = bake_rig(ember_mat, src_ember)
    smart_uv(ember, 0.01)
    ember_imgs = bake(ember, [ember_rig], ['color', 'emit', 'normal'], EMBER_TEX, 'Torch_Ember')

    # Pack ORM: R = baked AO, G = roughness, B = metalness.
    ao = pixels(body_imgs['ao'])[..., 0]
    ao = 0.35 + 0.65 * ao
    orm = np.stack([ao, pixels(body_imgs['rough'])[..., 0], pixels(body_imgs['metal'])[..., 0], np.ones_like(ao)], axis=-1)
    orm_img = image_from_array('Torch_Body_ORM', orm, non_color=True, alpha=False)

    out = {
        'Torch_Body_BaseColor.png': body_imgs['color'],
        'Torch_Body_ORM.png': orm_img,
        'Torch_Body_Normal.png': body_imgs['normal'],
        'Torch_Body_Emissive.png': body_imgs['emit'],
        'Torch_Ember_BaseColor.png': ember_imgs['color'],
        'Torch_Ember_Emissive.png': ember_imgs['emit'],
        'Torch_Ember_Normal.png': ember_imgs['normal'],
    }
    for fname, img in out.items():
        save_png(img, os.path.join(TEX_DIR, fname))
    for key in ('rough', 'metal', 'ao'):
        save_png(body_imgs[key], os.path.join(SRC_TEX_DIR, f'Torch_Body_{key}.png'))

    flame_img = flame_texture(
        'Torch_Flame',
        [(0.0, '#5cc6f5'), (0.06, '#a9e2ff'), (0.14, '#ffe9b0'), (0.30, '#ffc04a'),
         (0.55, '#ff9a26'), (0.78, '#f06a2a'), (0.92, '#c8483c'), (1.0, '#9a3cc8')],
        lambda v: np.clip(0.92 - 1.0 * v ** 1.3, 0, 1) * np.clip(v / 0.04, 0, 1),
    )
    core_img = flame_texture(
        'Torch_FlameCore',
        [(0.0, '#fff6dc'), (0.35, '#ffe2a0'), (0.75, '#ffbe5c'), (1.0, '#ff9a3c')],
        lambda v: np.ones_like(v), streak=0.08,
    )
    save_png(flame_img, os.path.join(TEX_DIR, 'Torch_Flame.png'))
    save_png(core_img, os.path.join(TEX_DIR, 'Torch_FlameCore.png'))

    flame_me = build_flame('Torch_Flame', 0.255, 0.53, 0.026, 0.18, 0.008, segments=28, rings=26,
                           side_tongues=((-70, 0.10, 0.70, 0.62, 0.030), (60, 0.14, 0.60, 0.55, 0.027),
                                         (175, 0.16, 0.52, 0.52, 0.024)))
    core_me = build_flame('Torch_FlameCore', 0.262, 0.405, 0.0155, 0.06, 0.005, segments=16, rings=14)
    smooth(flame_me, 80)
    smooth(core_me, 80)
    flame = link_object('Torch_Flame', flame_me, root)
    core = link_object('Torch_FlameCore', core_me, root)

    emitter = link_object('Torch_Emitter', None, root)
    emitter.location = Vector((0, 0, EMITTER_Z)) + shaft_bend(0.20)
    emitter.empty_display_type = 'SPHERE'
    emitter.empty_display_size = 0.02
    emitter['role'] = 'light-emitter'
    emitter['color'] = '#ffb45e'

    # Swap the procedural bake sources for the glTF-friendly textured materials.
    body_mat = final_material('M_Torch_Body', body_imgs['color'], orm=orm_img, normal=body_imgs['normal'],
                              emissive=body_imgs['emit'], emissive_strength=1.0)
    body_me.materials.clear()
    body_me.materials.append(body_mat)
    body_me.polygons.foreach_set('material_index', [0] * len(body_me.polygons))

    ember_final = final_material('M_Torch_Ember', ember_imgs['color'], normal=ember_imgs['normal'],
                                 emissive=ember_imgs['emit'], emissive_strength=4.0, rough=0.9)
    ember_me.materials.clear()
    ember_me.materials.append(ember_final)

    flame_mat = final_material('M_Torch_Flame', flame_img, emissive=flame_img, emissive_strength=1.2,
                               rough=1.0, alpha_from_color=True)
    flame_me.materials.append(flame_mat)
    core_mat = final_material('M_Torch_FlameCore', core_img, emissive=core_img, emissive_strength=2.0, rough=1.0)
    core_me.materials.append(core_mat)

    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_image_format='AUTO',
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )

    for img in bpy.data.images:
        if img.filepath_raw:
            img.filepath = bpy.path.relpath(img.filepath_raw, start=HERE)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, relative_remap=True)

    tris = sum(len(p.vertices) - 2 for o in (body, ember, flame, core) for p in o.data.polygons)
    print('TRIANGLES', tris)
    for o in (body, ember, flame, core):
        print(o.name, sum(len(p.vertices) - 2 for p in o.data.polygons))
    print('EXPORTED', GLB_PATH)


main()
