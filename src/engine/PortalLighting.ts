import * as THREE from 'three'
import type { Portal } from './Portal'

/* All positions here are in rendered space, after the planet deformation. */
export interface PortalLightSample {
  position: THREE.Vector3
  radiance: THREE.Color
  range: number
  decay: number
  worldToExit: THREE.Matrix4
  opening: THREE.Vector2
}

/* Loaded models and their material clones can survive a world restart or hot reload. Keep
   the original hook so a new lighting instance replaces the old uniforms. */
const LIGHTING_HOOK = Symbol.for('beyond-euclid.portal-lighting')

type LightingCompile = THREE.Material['onBeforeCompile'] & {
  [LIGHTING_HOOK]?: {
    owner: PortalLighting
    before: THREE.Material['onBeforeCompile']
    key: string
  }
}

const PARS = /* glsl */ `
#ifndef DYNAMIC_LIGHT_NORMAL
  #define DYNAMIC_LIGHT_NORMAL geometryNormal
#endif

struct PortalPointLight {
  vec3 position;
  vec3 radiance;
  float range;
  float decay;
  mat4 worldToExit;
  vec2 opening;
};

uniform mat4 uPortalCameraWorld;
uniform PortalPointLight uPortalLights[PORTAL_LIGHT_COUNT];

// The virtual lamp is behind the exit. Only rays that cross its opening
// may illuminate the room in front of it: a rectangular cone of light.
float portalAperture(PortalPointLight lamp, vec3 receiver) {
  vec3 origin = (lamp.worldToExit * vec4(lamp.position, 1.0)).xyz;
  vec3 target = (lamp.worldToExit * vec4(receiver, 1.0)).xyz;
  if (origin.z >= 0.0 || target.z <= 0.0) return 0.0;

  float t = -origin.z / (target.z - origin.z);
  vec2 crossing = mix(origin.xy, target.xy, t);
  if (abs(crossing.x) > lamp.opening.x || crossing.y < 0.0 || crossing.y > lamp.opening.y) {
    return 0.0;
  }

  return 1.0;
}
`

const DIRECT = /* glsl */ `
#if defined(RE_Direct)
  vec3 portalReceiver = (uPortalCameraWorld * vec4(geometryPosition, 1.0)).xyz;

  for (int portalIndex = 0; portalIndex < PORTAL_LIGHT_COUNT; portalIndex++) {
    PortalPointLight lamp = uPortalLights[portalIndex];
    if (max(max(lamp.radiance.r, lamp.radiance.g), lamp.radiance.b) <= 0.0) continue;
    if (portalAperture(lamp, portalReceiver) == 0.0) continue;

    vec3 toLamp = (viewMatrix * vec4(lamp.position, 1.0)).xyz - geometryPosition;
    float lightDistance = distance(lamp.position, portalReceiver);
    IncidentLight portalIncident;
    portalIncident.direction = normalize(toLamp);
    portalIncident.color = lamp.radiance * getDistanceAttenuation(lightDistance, lamp.range, lamp.decay);
    portalIncident.visible = true;

    RE_Direct(portalIncident, geometryPosition, DYNAMIC_LIGHT_NORMAL, normalize(vViewPosition),
      geometryClearcoatNormal, material, reflectedLight);
  }
#endif
`

/*
  Transport selected point lights through one doorway. This adds direct
  illumination through the aperture, not shadow maps or volumetric fog.
  Each source/door has a fixed uniform slot; switching a lamp or walking
  past a doorway changes uniforms without recompiling material programs.
*/
export class PortalLighting {
  readonly samples: PortalLightSample[]

  private readonly cameraWorld = { value: new THREE.Matrix4() }
  private readonly lightUniform: { value: PortalLightSample[] }
  private readonly sourcePosition = new THREE.Vector3()
  private readonly localPosition = new THREE.Vector3()
  private readonly paths: { light: THREE.PointLight; entrance: Portal; sample: PortalLightSample }[]

  constructor(lights: readonly THREE.PointLight[], portals: readonly Portal[]) {
    this.paths = lights.flatMap((light) =>
      portals.map((entrance) => ({
        light,
        entrance,
        sample: {
          position: new THREE.Vector3(),
          radiance: new THREE.Color(0),
          range: 0,
          decay: light.decay,
          worldToExit: new THREE.Matrix4(),
          opening: new THREE.Vector2(entrance.target.width / 2, entrance.target.height),
        },
      })),
    )
    this.samples = this.paths.map((path) => path.sample)
    this.lightUniform = { value: this.samples }
  }

  /* Called once per frame after the lamp moves, independently of the viewer. */
  update() {
    for (const { light, entrance, sample } of this.paths) {
      sample.radiance.setRGB(0, 0, 0)
      light.getWorldPosition(this.sourcePosition)

      // Match the same rigid portal frames used for the virtual cameras.
      this.localPosition.copy(this.sourcePosition).applyMatrix4(entrance.spaceInverse)

      if (!light.visible || light.intensity <= 0 || this.localPosition.z <= 0) continue

      // An omnidirectional lamp can be off to the side of the doorway.
      // Reject it only when even the nearest point of the opening is out of range.
      const dx = Math.max(0, Math.abs(this.localPosition.x) - entrance.width / 2)
      const dy = Math.max(0, -this.localPosition.y, this.localPosition.y - entrance.height)
      const nearest = Math.hypot(dx, dy, this.localPosition.z) * entrance.scale

      if (light.distance > 0 && nearest >= light.distance) continue

      const scale = entrance.target.scale / entrance.scale
      sample.position.copy(this.sourcePosition).applyMatrix4(entrance.view)
      sample.radiance.copy(light.color).multiplyScalar(light.intensity * scale ** light.decay)
      sample.range = light.distance * scale
      sample.decay = light.decay
      sample.worldToExit.copy(entrance.target.spaceInverse)
    }
  }

  /* Every recursive view needs its own inverse view transform for lighting. */
  prepareCamera(camera: THREE.Camera) {
    this.cameraWorld.value.copy(camera.matrixWorld)
  }

  /* Compose with the existing planet shader hook, after it has been installed. */
  apply(material: THREE.Material) {
    if (this.samples.length === 0 || !(material instanceof THREE.MeshStandardMaterial)) return
    const installed = (material.onBeforeCompile as LightingCompile)[LIGHTING_HOOK]
    if (installed?.owner === this) return

    const previousCompile = installed?.before ?? material.onBeforeCompile
    const previousKey = installed?.key ?? material.customProgramCacheKey()
    const lightUniform = this.lightUniform
    const cameraWorld = this.cameraWorld
    const sampleCount = this.samples.length

    material.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
      previousCompile.call(this, shader, renderer)

      if (
        !shader.fragmentShader.includes('#include <lights_pars_begin>') ||
        !shader.fragmentShader.includes('#include <lights_fragment_end>')
      ) {
        throw new Error('Portal lighting requires the standard direct-light shader chunks')
      }

      shader.uniforms.uPortalLights = lightUniform
      shader.uniforms.uPortalCameraWorld = cameraWorld
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <lights_pars_begin>',
          `#include <lights_pars_begin>\n#define PORTAL_LIGHT_COUNT ${sampleCount}\n${PARS}`,
        )
        .replace('#include <lights_fragment_end>', `${DIRECT}\n#include <lights_fragment_end>`)
    }

    Object.assign(material.onBeforeCompile, {
      [LIGHTING_HOOK]: { owner: this, before: previousCompile, key: previousKey },
    })
    material.customProgramCacheKey = () => `${previousKey}:portal-light-v2:${sampleCount}`
    material.needsUpdate = true
  }
}
