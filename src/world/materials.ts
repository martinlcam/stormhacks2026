import * as THREE from 'three'
import { planetUniforms } from '../engine/planet'

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
        {
          vec3 p = ground * uNear;
          vec3 x = texture2D(normalMap, p.zy).xyz * 2.0 - 1.0;
          vec3 y = texture2D(normalMap, p.xz).xyz * 2.0 - 1.0;
          vec3 z = texture2D(normalMap, p.xy).xyz * 2.0 - 1.0;
          vec3 bump = weight.x * vec3(0.0, x.y, x.x)
            + weight.y * vec3(y.x, 0.0, y.y)
            + weight.z * vec3(z.x, z.y, 0.0);
          // The ground is lit as if it were flat, so that no side of the
          // planet is in night.
          normal = normalize(mat3(viewMatrix) * normalize(vec3(0.0, 1.0, 0.0) + flatways(bump, groundUp) * normalScale.x));
        }`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        // The eye must be turned the same way, or the far side shines as if seen from below.
        THREE.ShaderChunk.lights_fragment_begin.replace(
          'normalize( vViewPosition )',
          'normalize(mat3(viewMatrix) * flatways(cameraPosition - vGround, groundUp))',
        ),
      )
  }
  material.customProgramCacheKey = () => 'ground'
  return material
}

export function matte(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
}

export function glow(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
  })
}

/*
  A gradient sky drawn around whichever camera is rendering. It ignores the
  camera's position, so it looks the same from every side of every portal.
*/
export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x05030a) },
      horizon: { value: new THREE.Color(0x3a1a52) },
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
