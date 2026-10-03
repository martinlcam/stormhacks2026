import * as THREE from 'three'

/**
 * World curvature.
 *
 * The plaza is stored, simulated and collided as a flat square. It is only
 * drawn as a ball: the vertex shader wraps the flat ground around a sphere
 * that touches it at a chosen centre (the exponential map of the sphere).
 * For a point at horizontal distance d from the centre and height h,
 *
 *   θ = d / R
 *   horizontal distance → (R + h) · sin θ
 *   height              → (R + h) · cos θ − R
 *
 * Distances along any line through the centre are exact and vertical lines
 * stay straight, so nothing near the centre is distorted and the ground
 * under the player is always level. Sideways lengths shrink by sin θ / θ,
 * which only becomes visible near the horizon.
 *
 * The plaza also repeats: its side is one full circumference (2πR), and the
 * shader moves each object by whole plaza widths to the copy nearest the
 * centre. Walking straight therefore brings you back to where you began.
 *
 * Only objects inside the plaza are bent. Detached rooms stay flat.
 */

const planet = {
  /** Half the plaza's side. Zero means no curvature anywhere. */
  half: 0,
  /** 1 / R. */
  k: 0,
}

const uniforms = {
  uBendCentre: { value: new THREE.Vector3() },
  uBendK: { value: 0 },
  uPlazaHalf: { value: 0 },
}

/** Turn the square plaza of this side length into a planet. */
export function configurePlanet(size: number | null) {
  planet.half = size ? size / 2 : 0
  planet.k = size ? (2 * Math.PI) / size : 0
  uniforms.uPlazaHalf.value = planet.half
}

export function plazaHalf(): number {
  return planet.half
}

function insidePlaza(x: number, z: number): boolean {
  return planet.half > 0 && Math.abs(x) <= planet.half && Math.abs(z) <= planet.half
}

/** Curvature that applies when the world is drawn around this point. */
export function curvatureAt(point: THREE.Vector3): number {
  return insidePlaza(point.x, point.z) ? planet.k : 0
}

/** Choose the centre and curvature for the draw calls that follow. */
export function setBend(centre: THREE.Vector3, k: number) {
  uniforms.uBendCentre.value.copy(centre)
  uniforms.uBendK.value = k
}

const PARS = /* glsl */ `
uniform vec3 uBendCentre;
uniform float uBendK;
uniform float uPlazaHalf;

vec3 bendWorld(vec3 p, vec3 objectCentre) {
  if (uBendK == 0.0) return p;
  if (abs(objectCentre.x) > uPlazaHalf || abs(objectCentre.z) > uPlazaHalf) return p;

  // Use the copy of this object that is nearest the centre.
  float side = 2.0 * uPlazaHalf;
  p.xz += side * floor((uBendCentre.xz - objectCentre.xz) / side + 0.5);

  vec2 offset = p.xz - uBendCentre.xz;
  float d = length(offset);
  if (d < 1e-5) return p;
  float theta = d * uBendK;
  float r = 1.0 / uBendK + p.y;
  p.xz = uBendCentre.xz + (offset / d) * r * sin(theta);
  p.y = r * cos(theta) - 1.0 / uBendK;
  return p;
}
`

const PROJECT = /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 bentPosition = modelMatrix * mvPosition;
bentPosition.xyz = bendWorld(bentPosition.xyz, modelMatrix[3].xyz);
mvPosition = viewMatrix * bentPosition;
gl_Position = projectionMatrix * mvPosition;
`

/** Make a built-in material draw its geometry bent. Call before first use. */
export function bendMaterial(material: THREE.Material) {
  if (material.userData.bent || (material as THREE.ShaderMaterial).isShaderMaterial) return
  material.userData.bent = true
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace('#include <project_vertex>', PROJECT)
  }
  material.customProgramCacheKey = () => 'bend'
}

const axis = new THREE.Vector3()
const rotation = new THREE.Matrix4()
const translation = new THREE.Matrix4()

/**
 * The rigid motion that best describes what bending does to a small object
 * standing at `foot`: it is carried to its place on the sphere and tipped to
 * stand upright there. The portal renderer uses this to line a flat view up
 * with a doorway that is drawn bent.
 */
export function apparentMotion(
  foot: THREE.Vector3,
  centre: THREE.Vector3,
  k: number,
  out: THREE.Matrix4,
): THREE.Matrix4 {
  out.identity()
  if (k === 0 || !insidePlaza(foot.x, foot.z)) return out

  const side = 2 * planet.half
  const x = foot.x + side * Math.floor((centre.x - foot.x) / side + 0.5)
  const z = foot.z + side * Math.floor((centre.z - foot.z) / side + 0.5)
  const dx = x - centre.x
  const dz = z - centre.z
  const d = Math.hypot(dx, dz)
  if (d < 1e-5) return out.makeTranslation(x - foot.x, 0, z - foot.z)

  const ux = dx / d
  const uz = dz / d
  const theta = d * k
  const r = 1 / k + foot.y
  // Tip "up" towards the direction away from the centre.
  rotation.makeRotationAxis(axis.set(uz, 0, -ux), theta)
  out.makeTranslation(
    centre.x + ux * r * Math.sin(theta),
    r * Math.cos(theta) - 1 / k,
    centre.z + uz * r * Math.sin(theta),
  )
  out.multiply(rotation)
  out.multiply(translation.makeTranslation(-foot.x, -foot.y, -foot.z))
  return out
}

/** Bring a walker who has left one edge of the plaza back in at the other. */
export function wrapToPlaza(position: THREE.Vector3) {
  const { half } = planet
  // Detached rooms lie far outside the plaza and must not be wrapped.
  if (half === 0 || Math.abs(position.x) > half + 10 || Math.abs(position.z) > half + 10) return
  if (position.x > half) position.x -= 2 * half
  else if (position.x < -half) position.x += 2 * half
  if (position.z > half) position.z -= 2 * half
  else if (position.z < -half) position.z += 2 * half
}
