import * as THREE from 'three'
import { PAINT_PARS, paintUniforms } from '../engine/paint'

/* The canvas: a warm off-white, like the landing page's paper. */
const CANVAS = '#e9e4d8'
/*
  The weave's threads, as an angle per metre, and how deep its ridges are,
  in metres. Coarser than real canvas, so that it can be seen standing up.
*/
const WEAVE = (2 * Math.PI) / 0.022
const RELIEF = 0.001
/* Fibres across the threads, and along them, per metre. */
const FIBRE_ACROSS = 140
const FIBRE_ALONG = 9

/*
  The plaza's ground as a stretched canvas, for the watercolour the player
  leaves behind them (see engine/paint.ts). It is all made in the shader: a
  fine weave close to, fibres a little further off, and a gentle unevenness
  over everything, laid on the sphere itself so that it never pinches.

  It is lit as `rockyGround` is, so that the planet has no night side and
  nearby lamps light it truly. See there for why.
*/
export function canvasGround(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: CANVAS, roughness: 1 })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, paintUniforms)
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
        varying vec3 vGround;
        ${PAINT_PARS}
        // Turn a direction at a place on the sphere, where up is \`up\`, to the
        // same direction on flat ground, where up is +y.
        vec3 flatways(vec3 v, vec3 up) {
          vec3 axis = cross(up, vec3(0.0, 1.0, 0.0));
          return v + cross(axis, v) + cross(axis, cross(axis, v)) / max(1.0 + up.y, 1e-3);
        }

        float canvasHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float canvasNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(
              mix(canvasHash(i), canvasHash(i + vec3(1.0, 0.0, 0.0)), f.x),
              mix(canvasHash(i + vec3(0.0, 1.0, 0.0)), canvasHash(i + vec3(1.0, 1.0, 0.0)), f.x),
              f.y
            ),
            mix(
              mix(canvasHash(i + vec3(0.0, 0.0, 1.0)), canvasHash(i + vec3(1.0, 0.0, 1.0)), f.x),
              mix(canvasHash(i + vec3(0.0, 1.0, 1.0)), canvasHash(i + vec3(1.0, 1.0, 1.0)), f.x),
              f.y
            ),
            f.z
          );
        }

        // The weave seen square-on in one plane: its height from -1 to 1, and its slope
        // each way, per metre.
        vec3 canvasWeave(vec2 p) {
          vec2 a = p * ${WEAVE.toFixed(3)};
          return vec3(
            sin(a.x) * sin(a.y),
            ${WEAVE.toFixed(3)} * cos(a.x) * sin(a.y),
            ${WEAVE.toFixed(3)} * sin(a.x) * cos(a.y)
          );
        }

        // Fibres: streaks a few centimetres long that run with the threads, from 0 to 1.
        float canvasFibres(vec2 p) {
          return 0.5 * (canvasNoise(vec3(p.x * ${FIBRE_ACROSS}.0, p.y * ${FIBRE_ALONG}.0, 0.0))
            + canvasNoise(vec3(p.x * ${FIBRE_ALONG}.0, p.y * ${FIBRE_ACROSS}.0, 5.0)));
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
        // Detail finer than a pixel only flickers, so the weave and the fibres fade
        // out as they get too small to see.
        float pixel = length(fwidth(ground));
        float weaveSeen = 1.0 - smoothstep(0.06, 0.18, pixel * ${(WEAVE / (2 * Math.PI)).toFixed(3)});
        float fibresSeen = 1.0 - smoothstep(0.3, 0.8, pixel * ${FIBRE_ACROSS}.0);
        // One view of the canvas along each axis, blended by which way the ground faces.
        vec3 weaveX = canvasWeave(ground.zy);
        vec3 weaveY = canvasWeave(ground.xz);
        vec3 weaveZ = canvasWeave(ground.xy);
        float canvasRelief = (weaveX.x * weight.x + weaveY.x * weight.y + weaveZ.x * weight.z) * weaveSeen;
        vec3 canvasSlope = (weight.x * vec3(0.0, weaveX.z, weaveX.y)
          + weight.y * vec3(weaveY.y, 0.0, weaveY.z)
          + weight.z * vec3(weaveZ.y, weaveZ.z, 0.0)) * weaveSeen * ${RELIEF.toFixed(5)};
        float fibres = canvasFibres(ground.zy) * weight.x
          + canvasFibres(ground.xz) * weight.y
          + canvasFibres(ground.xy) * weight.z;
        float mottle = canvasNoise(ground * 0.7) * 0.6 + canvasNoise(ground * 2.9) * 0.4;
        diffuseColor.rgb *= 1.0 + 0.08 * (mottle - 0.5);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        vec3 groundPointNormal;
        {
          // Nearby lamps need the actual orientation of the curved ground.
          groundPointNormal = normalize(mat3(viewMatrix) * normalize(groundUp - canvasSlope));
          // The ground is lit as if it were flat, so that no side of the
          // planet is in night.
          normal = normalize(mat3(viewMatrix) * normalize(vec3(0.0, 1.0, 0.0) - flatways(canvasSlope, groundUp)));
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
          gl_FragColor.rgb *= 1.0 + 0.08 * canvasRelief + 0.12 * (fibres - 0.5) * fibresSeen;

          // The paint is kept about two centimetres to a texel. Reading it from a little
          // to one side or the other, by noise, turns the texels' straight steps into the
          // ragged edge that paper gives a wash.
          vec3 nudge = vec3(
            canvasNoise(ground * 31.0),
            canvasNoise(ground * 31.0 + 17.0),
            canvasNoise(ground * 31.0 + 41.0)
          ) - 0.5;
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
