import * as THREE from 'three'
import { PAINT_PARS, paintUniforms } from '../engine/paint'

/* The canvas: a warm off-white, like the landing page's paper. */
const CANVAS = '#e9e4d8'
/*
  The canvas is drawn once, into a square tile this many metres across that
  repeats, with this many threads of the weave each way: one every 2.2 cm,
  coarser than real canvas, so that it can be seen standing up.
*/
const TILE = 0.44
const THREADS = 20
const TEXELS = 1024
/* Cells of noise across the tile: for fibres across and along the threads, and for specks. */
const FIBRE_ACROSS = 60
const FIBRE_ALONG = 4
const SPECKS = 14
/* How many times larger the tile is laid again for the gentle unevenness over everything. */
const MOTTLE_WIDE = 32
const MOTTLE_NEAR = 8

/*
  The tile. Red is the weave's height, from 0 to 1, green its fibres, and
  blue and alpha two specks of noise. Its smaller copies are the averages
  of what is too small to see, so far off the canvas does not flicker.
*/
const tile = new THREE.WebGLRenderTarget(TEXELS, TEXELS, {
  depthBuffer: false,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
  magFilter: THREE.LinearFilter,
  wrapS: THREE.RepeatWrapping,
  wrapT: THREE.RepeatWrapping,
  anisotropy: 8,
})
const baked = new WeakSet<THREE.WebGLRenderer>()

const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const BAKE_FRAGMENT = /* glsl */ `
varying vec2 vUv;

float tileHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Value noise with \`cells\` cells each way across the tile, which repeats with it.
float tileNoise(vec2 uv, vec2 cells, float seed) {
  vec2 p = uv * cells;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = tileHash(mod(i, cells) + seed);
  float b = tileHash(mod(i + vec2(1.0, 0.0), cells) + seed);
  float c = tileHash(mod(i + vec2(0.0, 1.0), cells) + seed);
  float d = tileHash(mod(i + vec2(1.0, 1.0), cells) + seed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 a = vUv * ${(THREADS * 2 * Math.PI).toFixed(4)};
  float weave = sin(a.x) * sin(a.y) * 0.5 + 0.5;
  // Streaks a few centimetres long that run with the threads.
  float fibres = 0.5 * (tileNoise(vUv, vec2(${FIBRE_ACROSS}.0, ${FIBRE_ALONG}.0), 0.0)
    + tileNoise(vUv, vec2(${FIBRE_ALONG}.0, ${FIBRE_ACROSS}.0), 7.0));
  float speck = tileNoise(vUv, vec2(${SPECKS}.0), 13.0);
  float other = tileNoise(vUv, vec2(${SPECKS}.0), 29.0);
  gl_FragColor = vec4(weave, fibres, speck, other);
}
`

/*
  Draw the canvas tile for this renderer. Call once, before the canvas floor
  is first drawn. It is one quick draw, so it costs nothing at the start.
*/
export function bakeCanvas(renderer: THREE.WebGLRenderer) {
  if (baked.has(renderer)) return
  baked.add(renderer)
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader: BAKE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new THREE.Mesh(geometry, material)
  quad.frustumCulled = false
  const scene = new THREE.Scene().add(quad)

  const target = renderer.getRenderTarget()
  const scissor = renderer.getScissorTest()
  renderer.setScissorTest(false)
  renderer.setRenderTarget(tile)
  renderer.render(scene, new THREE.Camera())
  renderer.setRenderTarget(target)
  renderer.setScissorTest(scissor)
  geometry.dispose()
  material.dispose()
}

/*
  The plaza's ground as a stretched canvas, for the watercolour the player
  leaves behind them (see engine/paint.ts): a weave close to, fibres a
  little further off, and a gentle unevenness over everything. It reads the
  tile that `bakeCanvas` draws, laid on the sphere itself along the three
  axes and blended, so that it never pinches.

  It is lit as `rockyGround` is, so that the planet has no night side and
  nearby lamps light it truly. See there for why.
*/
export function canvasGround(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: CANVAS, roughness: 1 })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, paintUniforms)
    shader.uniforms.uCanvas = { value: tile.texture }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      // `planetPosition` is where the planet shader puts the vertex in space.
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvGround = planetPosition.xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        #define DYNAMIC_LIGHT_NORMAL groundPointNormal
        uniform float uPlanetK;
        uniform sampler2D uCanvas;
        varying vec3 vGround;
        ${PAINT_PARS}
        // Turn a direction at a place on the sphere, where up is \`up\`, to the
        // same direction on flat ground, where up is +y.
        vec3 flatways(vec3 v, vec3 up) {
          vec3 axis = cross(up, vec3(0.0, 1.0, 0.0));
          return v + cross(axis, v) + cross(axis, cross(axis, v)) / max(1.0 + up.y, 1e-3);
        }

        // The canvas tile seen along each axis, blended by which way the ground faces.
        vec4 canvasAt(vec3 p, vec3 weight) {
          return texture2D(uCanvas, p.zy) * weight.x
            + texture2D(uCanvas, p.xz) * weight.y
            + texture2D(uCanvas, p.xy) * weight.z;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        // From the planet's centre.
        vec3 ground = vGround + vec3(0.0, 1.0 / uPlanetK, 0.0);
        vec3 groundUp = normalize(ground);
        vec3 weight = pow(abs(groundUp), vec3(4.0));
        weight /= weight.x + weight.y + weight.z;
        vec4 canvasFine = canvasAt(ground * ${(1 / TILE).toFixed(5)}, weight);
        float canvasRelief = canvasFine.r * 2.0 - 1.0;
        float mottle = canvasAt(ground * ${(1 / (TILE * MOTTLE_WIDE)).toFixed(5)}, weight).b * 0.6
          + canvasAt(ground * ${(1 / (TILE * MOTTLE_NEAR)).toFixed(5)}, weight).a * 0.4;
        diffuseColor.rgb *= 1.0 + 0.08 * (mottle - 0.5);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        // Nearby lamps need the actual orientation of the curved ground.
        vec3 groundPointNormal = normalize(mat3(viewMatrix) * groundUp);
        // The ground is lit as if it were flat, so that no side of the planet is in night.
        normal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        // The eye must be turned the same way, or the far side shines as if seen from below.
        THREE.ShaderChunk.lights_fragment_begin
          .replace(
            'normalize( vViewPosition )',
            'normalize(mat3(viewMatrix) * flatways(cameraPosition - vGround, groundUp))',
          )
          // The first direct-light call is the point-light loop. Keep the
          // existing all-day directional/ambient shading for the rest.
          .replace(
            'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
            'RE_Direct( directLight, geometryPosition, groundPointNormal, normalize(vViewPosition), groundPointNormal, material, reflectedLight );',
          ),
      )
      // The paint goes on after the film has made the world grey, so it keeps its colour.
      // It is the last thing done, after the dither too.
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `#include <dithering_fragment>
        {
          // The lamp was made for dark ground and would burn white canvas out, so the
          // brightest light rolls off instead of stopping dead at white.
          vec3 lit = gl_FragColor.rgb;
          gl_FragColor.rgb = min(lit, 0.7) + 0.3 * (1.0 - exp(-max(lit - 0.7, 0.0) / 0.3));
          // The weave and the fibres go on after that, so that they show as plainly
          // in the lamp's light as out of it.
          gl_FragColor.rgb *= 1.0 + 0.08 * canvasRelief + 0.12 * (canvasFine.g - 0.5);

          // The paint is kept about two centimetres to a texel. Reading it from a little
          // to one side or the other, by the tile's specks, turns the texels' straight
          // steps into the ragged edge that paper gives a wash.
          vec3 nudge = canvasFine.bag - 0.5;
          vec3 density = texture2D(uPaint, paintUv(groundUp + nudge * 0.0035)).rgb;
          // Pigment settles in the dips of the weave.
          density *= 1.0 - 0.3 * canvasRelief;
          vec3 through = exp(-density);
          #ifdef USE_FOG
            through = mix(through, vec3(1.0), fogFactor);
          #endif
          gl_FragColor.rgb *= through;
        }`,
      )
  }
  material.customProgramCacheKey = () => 'ground:canvas'
  return material
}
