import * as THREE from 'three'
import { planetUniforms } from '../engine/planet'
import { readFlag } from '../flags'

export const palette = {
  purple: 0xc252e1,
  cyan: 0x6ecbf5,
  dark: 0x1a1a1a,
  night: 0x120a1c,
  stone: 0x3a3442,
  bone: 0xe8e2f0,
}

/* A tiling grid, so that movement and distance are readable on flat surfaces. */
export function gridTexture(background: string, line: string, repeat: number): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = background
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = line
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/*
  A tiling image from public/textures. `metres` is how much ground one copy
  of the image covers, on a surface whose UVs count one unit per two metres,
  as the ground's do.
*/
function groundTexture(file: string, metres: number, colour: boolean): THREE.Texture {
  const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${file}`)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.setScalar(2 / metres)
  texture.anisotropy = 8
  if (colour) texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/*
  The ground, from two Poly Haven images, both CC0:

    "Rocky Terrain 02" by Amal Kumar (polyhaven.com/a/rocky_terrain_02), an
    aerial view 90 m across, laid much smaller here. It gives the ground
    its colour and its patches of rock.

    "Forrest Ground 01" by Rob Tuytel (polyhaven.com/a/forrest_ground_01),
    a close view 2 m across. It gives the grass, twigs and grit underfoot,
    which the aerial view is far too coarse to show.

  Near the eye the close view shades the aerial one. Far away, where its
  small tiles would show as a pattern, it fades out.

  The images are not laid on the flat map, which pinches to a point on the
  far side of the planet. They are projected onto the sphere itself along
  the three axes and blended, so the ground looks the same all the way round.
*/
export function rockyGround(): THREE.MeshStandardMaterial {
  const metres = 24
  const closeMetres = 2.5
  const close = groundTexture('forrest_ground_01/diffuse.jpg', closeMetres, true)
  const material = new THREE.MeshStandardMaterial({
    map: groundTexture('rocky_terrain_02/diffuse.jpg', metres, true),
    normalMap: groundTexture('forrest_ground_01/normal.jpg', closeMetres, false),
    roughness: 0.95,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClose = { value: close }
    shader.uniforms.uFar = { value: 1 / metres }
    shader.uniforms.uNear = { value: 1 / closeMetres }
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
        uniform sampler2D uClose;
        uniform float uFar;
        uniform float uNear;
        uniform float uPlanetK;
        varying vec3 vGround;
        // Turn a direction at a place on the sphere, where up is \`up\`, to the
        // same direction on flat ground, where up is +y.
        vec3 flatways(vec3 v, vec3 up) {
          vec3 axis = cross(up, vec3(0.0, 1.0, 0.0));
          return v + cross(axis, v) + cross(axis, cross(axis, v)) / max(1.0 + up.y, 1e-3);
        }
        // One image seen along each axis, blended by which way the ground faces.
        vec4 alongAxes(sampler2D image, vec3 p, vec3 weight, float bias) {
          return texture2D(image, p.zy, bias) * weight.x
            + texture2D(image, p.xz, bias) * weight.y
            + texture2D(image, p.xy, bias) * weight.z;
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
        diffuseColor *= alongAxes(map, ground * uFar, weight, 0.0);
        {
          vec3 detail = alongAxes(uClose, ground * uNear, weight, 0.0).rgb;
          // The smallest copy of the image is its average colour.
          vec3 average = texture2D(uClose, vec2(0.0), 16.0).rgb;
          float near = 1.0 - smoothstep(10.0, 45.0, length(vViewPosition));
          diffuseColor.rgb *= mix(vec3(1.0), detail / average, near);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        vec3 groundPointNormal;
        {
          vec3 p = ground * uNear;
          vec3 x = texture2D(normalMap, p.zy).xyz * 2.0 - 1.0;
          vec3 y = texture2D(normalMap, p.xz).xyz * 2.0 - 1.0;
          vec3 z = texture2D(normalMap, p.xy).xyz * 2.0 - 1.0;
          vec3 bump = weight.x * vec3(0.0, x.y, x.x)
            + weight.y * vec3(y.x, 0.0, y.y)
            + weight.z * vec3(z.x, z.y, 0.0);
          // Nearby lamps need the actual orientation of the curved ground.
          groundPointNormal = normalize(mat3(viewMatrix) * normalize(groundUp + bump * normalScale.x));
          // The ground is lit as if it were flat, so that no side of the
          // planet is in night.
          normal = normalize(mat3(viewMatrix) * normalize(vec3(0.0, 1.0, 0.0) + flatways(bump, groundUp) * normalScale.x));
        }`,
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
  }
  material.customProgramCacheKey = () => 'ground:point-light-normal'
  return material
}

export function matte(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
}

/* How much of its stated brightness a glowing thing keeps: an ember, not a lamp. */
const GLOW = 0.3

export function glow(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity * GLOW,
    roughness: 0.4,
  })
}

/* A plain, stencil-aware sky for repeatable lighting comparisons. */
export function createSky(top = 0x05030a, horizon = 0x3a1a52): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      uSkyUp: planetUniforms.uSkyUp,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        // z = w pins the sky to the far plane. It must still be depth tested,
        // or it would paint over the portal views sealed in front of it.
        gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 uSkyUp;
      varying vec3 vDirection;
      void main() {
        // Height above the horizon of whoever is looking, wherever on the
        // planet they stand.
        float h = dot(normalize(vDirection), uSkyUp);
        vec3 color = mix(horizon, top, smoothstep(-0.05, 0.6, h));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), material)
  sky.renderOrder = -1000
  sky.frustumCulled = false
  return sky
}

/* How much of its colour a sky keeps. It is night under every one of them. */
const SKY_DIM = 0.15

/*
  How strong the fine grain in the sky is: as it was, or (`?sky=grainy`)
  enough to read as the paper grain of the landing page.
*/
const SKY_GRAIN = readFlag('sky') === 'grainy' ? 0.07 : 0.025

/*
  The skies, each as three colours: overhead, part of the way down, and at
  the horizon. The first two are the dusk and the storm from the landing
  page; the rest are made in the same manner.
*/
const SKIES = [
  [0x1a1233, 0x623e84, 0xf2a7a0],
  [0x0e1120, 0x26304e, 0x546488],
  [0x1b0f1f, 0x7a2f4f, 0xf6b26b],
  [0x071a2b, 0x1f5f7a, 0x9fe0c9],
  [0x1c2242, 0x7d6aa8, 0xf7d9b0],
  [0x05030a, 0x2a1340, 0x8a4aa0],
].map((sky) => sky.map((colour) => new THREE.Color(colour).multiplyScalar(SKY_DIM)))

/*
  A sky drawn around whichever camera is rendering: a gradient from the
  horizon up, broken by soft noise so that it reads as painted, not ruled.
  It ignores the camera's position.

  There are several skies, and every door leads to the next one. The view
  through a door already shows the sky on its far side, so nothing changes
  at the moment of going through: the sky you saw in the doorway is the sky
  you are now under.
*/
export class Sky {
  readonly mesh: THREE.Mesh
  private readonly uniforms = {
    top: { value: new THREE.Color() },
    middle: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    /* Moves the noise, so that no two skies have the same clouds. */
    seed: { value: 0 },
    grain: { value: SKY_GRAIN },
    uSkyUp: planetUniforms.uSkyUp,
  }

  constructor() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          // z = w pins the sky to the far plane. It must still be depth tested,
          // or it would paint over the portal views sealed in front of it.
          gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 middle;
        uniform vec3 horizon;
        uniform float seed;
        uniform float grain;
        uniform vec3 uSkyUp;
        varying vec3 vDirection;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        // Smooth noise from 0 to 1.
        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }
        // Several sizes of noise laid over each other, large and soft first.
        float clouds(vec3 p) {
          float sum = 0.0;
          float size = 0.5;
          for (int i = 0; i < 4; i++) {
            sum += noise(p) * size;
            p = p * 2.03 + 7.1;
            size *= 0.5;
          }
          return sum / 0.9375;
        }

        void main() {
          vec3 direction = normalize(vDirection);
          // Height above the horizon of whoever is looking, wherever on the
          // planet they stand.
          float h = dot(direction, uSkyUp);
          // The noise pushes the bands of colour up and down, most near the horizon.
          float drift = clouds(direction * 2.2 + seed) - 0.5;
          h += drift * 0.35 * (1.0 - smoothstep(0.3, 0.9, abs(h)));
          vec3 colour = mix(horizon, middle, smoothstep(-0.08, 0.3, h));
          colour = mix(colour, top, smoothstep(0.2, 0.85, h));
          // Lighter and darker patches, as in a wash of paint.
          colour *= 0.9 + 0.2 * clouds(direction * 5.0 - seed);
          // Fine grain, which also hides the steps in a smooth gradient.
          colour += (hash(vec3(gl_FragCoord.xy, seed)) - 0.5) * grain;
          gl_FragColor = vec4(colour, 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), material)
    this.mesh.renderOrder = -1000
    this.mesh.frustumCulled = false
    this.show(0)
  }

  /*
    Show the sky that is this many doors on from the first. `fog`, if given,
    takes the colour of the horizon, so far things fade into the sky.
  */
  show(doors: number, fog?: THREE.Fog | THREE.FogExp2 | null) {
    const index = ((doors % SKIES.length) + SKIES.length) % SKIES.length
    const [top, middle, horizon] = SKIES[index]
    this.uniforms.top.value.copy(top)
    this.uniforms.middle.value.copy(middle)
    this.uniforms.horizon.value.copy(horizon)
    this.uniforms.seed.value = index * 13.7
    fog?.color.copy(horizon)
  }
}
