import * as THREE from 'three'

/*
  The plaza as a real sphere.

  Everything on the plaza is authored, collided and linked in flat map
  coordinates (x, z, height). The map is the azimuthal equidistant chart of a
  sphere of radius R whose pole is the map origin: a map point at distance d
  from the origin, in direction r̂, stands on the sphere at angle θ = d / R
  from the pole. In 3D, with the pole at the world origin and the sphere's
  centre at (0, −R, 0),

    position = centre + (R + height) · (r̂ sin θ + ŷ cos θ)

  The vertex shader applies this to every plaza object, so what is drawn is a
  solid planet. The map is a disk of radius πR; its whole rim is the single
  point opposite the pole.

  The map is exact along lines through the origin and squeezes sideways
  lengths by sin θ / θ. Structures stand near the origin, where that factor
  is close to 1.

  The player walks on the sphere itself: each step is a rotation about the
  sphere's centre, a great-circle arc, and their heading is carried along
  by the same rotation. Any straight walk therefore returns to its start
  after one circumference. Map coordinates are read back after each step so
  collision and portals keep working in the flat map.

  Rooms outside the disk are not part of the planet and stay flat.
*/

const planet = {
  /* 1 / R. Zero means there is no planet and the whole world is flat. */
  k: 0,
  /* Radius of the map disk, πR. */
  reach: 0,
}

export const planetUniforms = {
  uPlanetK: { value: 0 },
  uPlanetReach: { value: 0 },
  /* Which way is up for the camera drawing the current pass (for the sky). */
  uSkyUp: { value: new THREE.Vector3(0, 1, 0) },
}

/* Make the plaza a planet with this circumference, or flat with null. */
export function configurePlanet(circumference: number | null) {
  planet.k = circumference ? (2 * Math.PI) / circumference : 0
  planet.reach = circumference ? circumference / 2 : 0
  planetUniforms.uPlanetK.value = planet.k
  // A little slack, so objects centred on the rim still count.
  planetUniforms.uPlanetReach.value = planet.reach + 1
}

/* True when this map point is on the planet, not in a detached room. */
export function onPlanet(point: THREE.Vector3): boolean {
  return planet.k > 0 && Math.hypot(point.x, point.z) <= planet.reach + 1
}

const PARS = /* glsl */ `
uniform float uPlanetK;
uniform float uPlanetReach;

vec3 ontoPlanet(vec3 p, vec3 objectCentre) {
  if (uPlanetK == 0.0 || length(objectCentre.xz) > uPlanetReach) return p;
  float d = length(p.xz);
  if (d < 1e-5) return p;
  float theta = d * uPlanetK;
  float r = 1.0 / uPlanetK + p.y;
  return vec3(p.x / d * r * sin(theta), r * cos(theta) - 1.0 / uPlanetK, p.z / d * r * sin(theta));
}
`

const PROJECT = /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 planetPosition = modelMatrix * mvPosition;
planetPosition.xyz = ontoPlanet(planetPosition.xyz, modelMatrix[3].xyz);
mvPosition = viewMatrix * planetPosition;
gl_Position = projectionMatrix * mvPosition;
`

/* Make a built-in material draw plaza geometry on the planet. Call before first use. */
export function planetMaterial(material: THREE.Material) {
  if (material.userData.planet || (material as THREE.ShaderMaterial).isShaderMaterial) return
  material.userData.planet = true
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, planetUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace('#include <project_vertex>', PROJECT)
  }
  material.customProgramCacheKey = () => 'planet'
}

/*
  The tangent frame of the sphere at a map point: `up` away from the centre,
  `out` along the ground away from the pole, `around` along the ground at
  right angles to it. Map directions (r̂, t̂) correspond to (out, around).
*/
class Frame {
  rx = 1
  rz = 0
  readonly up = new THREE.Vector3()
  readonly out = new THREE.Vector3()
  readonly around = new THREE.Vector3()

  /* r̂ is kept from the last call when the point is at the pole. */
  set(x: number, z: number) {
    const d = Math.hypot(x, z)
    if (d > 1e-9) {
      this.rx = x / d
      this.rz = z / d
    }
    const theta = d * planet.k
    const sin = Math.sin(theta)
    const cos = Math.cos(theta)
    this.up.set(this.rx * sin, cos, this.rz * sin)
    this.out.set(this.rx * cos, -sin, this.rz * cos)
    this.around.set(-this.rz, 0, this.rx)
    return this
  }

  /* Map direction (x, z) → direction in space. */
  lift(x: number, z: number, target: THREE.Vector3) {
    const alongOut = x * this.rx + z * this.rz
    const alongAround = -x * this.rz + z * this.rx
    return target.copy(this.out).multiplyScalar(alongOut).addScaledVector(this.around, alongAround)
  }

  /* Direction in space → map direction, written to target.x and target.z. */
  lower(v: THREE.Vector3, target: THREE.Vector3) {
    const alongOut = v.dot(this.out)
    const alongAround = v.dot(this.around)
    target.x = alongOut * this.rx - alongAround * this.rz
    target.z = alongOut * this.rz + alongAround * this.rx
    return target
  }
}

const frame = new Frame()
const travel = new THREE.Vector3()
const heading = new THREE.Vector3()
const axis = new THREE.Vector3()
const lowered = new THREE.Vector3()

export interface Walker {
  /* Map coordinates; y is height above the ground. */
  position: THREE.Vector3
  /* Map velocity; only x and z are used here. */
  velocity: THREE.Vector3
  yaw: number
}

/*
  Move a walker along the great circle their horizontal velocity points
  along, for `dt` seconds. Position, velocity and heading are all carried by
  the same rotation, so the walker keeps going "straight".
*/
export function walkOnPlanet(walker: Walker, dt: number) {
  const { position, velocity } = walker
  frame.set(position.x, position.z)
  frame.lift(velocity.x, velocity.z, travel)
  const speed = travel.length()
  if (speed * dt < 1e-9) return
  frame.lift(-Math.sin(walker.yaw), -Math.cos(walker.yaw), heading)

  const up = frame.up
  axis.crossVectors(up, travel).normalize()
  const angle = speed * dt * planet.k
  up.applyAxisAngle(axis, angle)
  travel.applyAxisAngle(axis, angle)
  heading.applyAxisAngle(axis, angle)

  // Read the new place back off the sphere as map coordinates.
  const theta = Math.acos(Math.max(-1, Math.min(1, up.y)))
  const flat = Math.hypot(up.x, up.z)
  const rx = flat > 1e-9 ? up.x / flat : frame.rx
  const rz = flat > 1e-9 ? up.z / flat : frame.rz
  position.x = (rx * theta) / planet.k
  position.z = (rz * theta) / planet.k

  frame.set(position.x, position.z)
  frame.lower(travel, lowered)
  velocity.x = lowered.x
  velocity.z = lowered.z
  frame.lower(heading, lowered)
  walker.yaw = Math.atan2(-lowered.x, -lowered.z)
}

const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const basis = new THREE.Matrix4()
const pitchTurn = new THREE.Quaternion()
const X_AXIS = new THREE.Vector3(1, 0, 0)

/* Stand a camera on the planet at a map position, looking along a map heading. */
export function standOnPlanet(
  camera: THREE.Camera,
  position: THREE.Vector3,
  eyeHeight: number,
  yaw: number,
  pitch: number,
) {
  frame.set(position.x, position.z)
  frame.lift(-Math.sin(yaw), -Math.cos(yaw), forward)
  right.crossVectors(forward, frame.up)
  basis.makeBasis(right, frame.up, forward.negate())
  camera.quaternion.setFromRotationMatrix(basis)
  camera.quaternion.multiply(pitchTurn.setFromAxisAngle(X_AXIS, pitch))

  const radius = 1 / planet.k
  camera.position.copy(frame.up).multiplyScalar(radius + position.y + eyeHeight)
  camera.position.y -= radius
}

/* Which way is up, in space, for someone standing at this map point. */
export function upAt(position: THREE.Vector3, target: THREE.Vector3) {
  if (!onPlanet(position)) return target.set(0, 1, 0)
  return target.copy(frame.set(position.x, position.z).up)
}

const rotation = new THREE.Matrix4()
const translation = new THREE.Matrix4()

/*
  The rigid motion that carries a small object from where it is authored on
  the map to where it stands on the planet. The portal renderer uses this to
  place the camera for a view through a doorway that is drawn on the sphere.
*/
export function planetMotion(foot: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4 {
  out.identity()
  if (!onPlanet(foot)) return out
  const d = Math.hypot(foot.x, foot.z)
  if (d < 1e-5) return out

  const ux = foot.x / d
  const uz = foot.z / d
  const theta = d * planet.k
  const r = 1 / planet.k + foot.y
  // Tip "up" towards the direction away from the pole.
  rotation.makeRotationAxis(axis.set(uz, 0, -ux), theta)
  out.makeTranslation(
    ux * r * Math.sin(theta),
    r * Math.cos(theta) - 1 / planet.k,
    uz * r * Math.sin(theta),
  )
  out.multiply(rotation)
  out.multiply(translation.makeTranslation(-foot.x, -foot.y, -foot.z))
  return out
}
