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

  Things that travel all the way round, the player's figure and whatever
  they carry or throw, would be squeezed flat on the far side. Those are
  marked rigid (`material.userData.rigid`): only the object's centre goes
  through the map, and the object keeps its own shape about that point.

  The player walks on the sphere itself: each step is a rotation about the
  sphere's centre, a great-circle arc, and their heading is carried along
  by the same rotation. Any straight walk therefore returns to its start
  after one circumference. Map coordinates are read back after each step so
  collision and portals keep working in the flat map.

  Rooms outside the disk are not part of the planet and stay flat.

  Sites. One map cannot cover the whole planet without squeezing whatever
  is far from its pole. So the planet has many maps. A `Site` is a place on
  the planet with a map of its own, centred on itself, and every structure
  is built on the map of its site, where it is close to the centre and
  true to shape. Each solid box, door, walker and thrown thing belongs to
  one site and is worked out on that site's map. A walker changes to the
  map of whichever site is nearest as they go. Drawing turns each site's
  map onto the sphere and then carries it to where the site is.
*/

const planet = {
  /* 1 / R. Zero means there is no planet and the whole world is flat. */
  k: 0,
  /* Radius of the map disk, πR. */
  reach: 0,
}

const everySite: Site[] = []
const UP = new THREE.Vector3(0, 1, 0)
const tip = new THREE.Quaternion()
const tipAxis = new THREE.Vector3()
const shift = new THREE.Matrix4()

export class Site {
  /* Carries space as drawn around the pole to where this site is. */
  readonly motion = new THREE.Matrix4()
  /* The turn in `motion`, and its inverse. */
  readonly rotation = new THREE.Quaternion()
  readonly inverse = new THREE.Quaternion()
  /* Which way is up at the middle of the site, in space. */
  readonly anchor = new THREE.Vector3(0, 1, 0)

  /*
    `x` and `z` say where the site is as a point on the pole's map: that far
    from the pole, in that direction. `heading` turns the site about its own
    middle, in radians.
  */
  constructor(
    readonly name: string,
    readonly x = 0,
    readonly z = 0,
    readonly heading = 0,
  ) {
    everySite.push(this)
    this.settle()
  }

  /* Work out where the site is on the planet as it is now configured. */
  settle() {
    const d = Math.hypot(this.x, this.z)
    this.rotation.setFromAxisAngle(UP, this.heading)
    if (planet.k > 0 && d > 1e-9) {
      // Tip "up" towards the direction away from the pole.
      tip.setFromAxisAngle(tipAxis.set(this.z / d, 0, -this.x / d), d * planet.k)
      this.rotation.premultiply(tip)
    }
    this.inverse.copy(this.rotation).invert()
    this.anchor.set(0, 1, 0).applyQuaternion(this.rotation)
    // A turn about the planet's centre, which is 1 / k below the pole.
    const radius = planet.k > 0 ? 1 / planet.k : 0
    this.motion
      .makeRotationFromQuaternion(this.rotation)
      .premultiply(shift.makeTranslation(0, -radius, 0))
      .multiply(shift.makeTranslation(0, radius, 0))
  }
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
  for (const site of everySite) site.settle()
}

/* The site at the pole, where the map and the planet agree with no turning. */
export const POLE = new Site('pole')

const owners = new WeakMap<object, Site>()

/* Say that a box, mesh or group belongs to a site. */
export function assign(thing: object, site: Site) {
  owners.set(thing, site)
}

/* The site a thing was given, if any. */
export function siteOf(thing: object): Site | undefined {
  return owners.get(thing)
}

/* True for something that belongs to a different site. Unowned things are everywhere. */
export function elsewhere(thing: object, site: Site): boolean {
  const owner = owners.get(thing)
  return owner !== undefined && owner !== site
}

/* True when this map point is on the planet, not in a detached room. */
export function onPlanet(point: THREE.Vector3): boolean {
  return planet.k > 0 && Math.hypot(point.x, point.z) <= planet.reach + 1
}

const PARS = /* glsl */ `
uniform float uPlanetK;
uniform float uPlanetReach;
uniform mat4 uSite;

vec3 ontoPlanet(vec3 p) {
  float d = length(p.xz);
  if (d < 1e-5) return p;
  float theta = d * uPlanetK;
  float r = 1.0 / uPlanetK + p.y;
  return vec3(p.x / d * r * sin(theta), r * cos(theta) - 1.0 / uPlanetK, p.z / d * r * sin(theta));
}

vec3 ontoPlanetRigid(vec3 p, vec3 c) {
  float d = length(c.xz);
  vec2 outward = d < 1e-5 ? vec2(1.0, 0.0) : c.xz / d;
  float theta = d * uPlanetK;
  float radius = 1.0 / uPlanetK;
  vec3 up = vec3(outward.x * sin(theta), cos(theta), outward.y * sin(theta));
  vec3 out_ = vec3(outward.x * cos(theta), -sin(theta), outward.y * cos(theta));
  vec3 around = vec3(-outward.y, 0.0, outward.x);
  vec3 o = p - c;
  return up * (radius + c.y + o.y) - vec3(0.0, radius, 0.0)
    + out_ * dot(o.xz, outward) + around * dot(o.xz, vec2(-outward.y, outward.x));
}
`

const PROJECT = /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 planetPosition = modelMatrix * mvPosition;
if (uPlanetK != 0.0 && length(modelMatrix[3].xz) <= uPlanetReach) {
  #ifdef PLANET_RIGID
    planetPosition.xyz = ontoPlanetRigid(planetPosition.xyz, modelMatrix[3].xyz);
  #else
    planetPosition.xyz = ontoPlanet(planetPosition.xyz);
  #endif
  planetPosition = uSite * vec4(planetPosition.xyz, 1.0);
}
mvPosition = viewMatrix * planetPosition;
gl_Position = projectionMatrix * mvPosition;
`

/* Make a built-in material draw plaza geometry on the planet. Call before first use. */
export function planetMaterial(
  material: THREE.Material,
  portalTransfer?: { value: THREE.Matrix4 },
) {
  if (material.userData.planet || (material as THREE.ShaderMaterial).isShaderMaterial) return
  material.userData.planet = true
  if (material.userData.rigid) (material.defines ??= {}).PLANET_RIGID = ''
  // A material may already change its own shader; keep that.
  const before = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  // `this` and not `material`: a copy of the material for another site shares this function.
  material.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
    before.call(this, shader, renderer)
    Object.assign(shader.uniforms, planetUniforms)
    shader.uniforms.uSite = siteUniform(this)
    if (portalTransfer) shader.uniforms.uPortalObjectTransfer = portalTransfer

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${PARS}${portalTransfer ? '\nuniform mat4 uPortalObjectTransfer;' : ''}`,
      )
      .replace(
        '#include <project_vertex>',
        portalTransfer
          ? PROJECT.replace(
              'mvPosition = viewMatrix * planetPosition;',
              'planetPosition = uPortalObjectTransfer * planetPosition;\nmvPosition = viewMatrix * planetPosition;',
            )
          : PROJECT,
      )

    if (portalTransfer) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <normal_vertex>',
        `transformedNormal = mat3(viewMatrix) * mat3(uPortalObjectTransfer)
          * inverseTransformDirection(transformedNormal, viewMatrix);
        #ifdef USE_TANGENT
          transformedTangent = mat3(viewMatrix) * mat3(uPortalObjectTransfer)
            * inverseTransformDirection(transformedTangent, viewMatrix);
        #endif
        #include <normal_vertex>`,
      )
    }
  }
  material.customProgramCacheKey = () => `planet/${key}${portalTransfer ? ':portal-object' : ''}`
}

const siteUniforms = new WeakMap<THREE.Material, { value: THREE.Matrix4 }>()

/*
  Which site a material draws at. Set `value` to a site's `motion` to draw
  whatever uses the material there; it starts at the pole.
*/
export function siteUniform(material: THREE.Material): { value: THREE.Matrix4 } {
  let uniform = siteUniforms.get(material)
  if (!uniform) {
    uniform = { value: POLE.motion }
    siteUniforms.set(material, uniform)
  }
  return uniform
}

const copies = new Map<Site, WeakMap<THREE.Material, THREE.Material>>()

/* The same material, drawing at a site. One copy is kept for each site. */
export function materialAt<M extends THREE.Material>(material: M, site: Site): M {
  if (site === POLE) return material
  let forSite = copies.get(site)
  if (!forSite) copies.set(site, (forSite = new WeakMap()))
  let copy = forSite.get(material) as M | undefined
  if (!copy) {
    planetMaterial(material)
    copy = material.clone() as M
    copy.onBeforeCompile = material.onBeforeCompile
    copy.customProgramCacheKey = material.customProgramCacheKey
    siteUniform(copy).value = site.motion
    forSite.set(material, copy)
  }
  return copy
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
  land(walker, up)
}

/*
  Put a walker where `up` is on the sphere, moving along `travel` and facing
  along `heading`, by reading all three back as map coordinates.
*/
function land(walker: Walker, up: THREE.Vector3) {
  const { position, velocity } = walker
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

const between = new THREE.Quaternion()
const spot = new THREE.Vector3()

/*
  A point on one site's map → the same place on another site's map. Height
  is unchanged. Off the planet the point is returned as it is.
*/
export function rechart(
  point: THREE.Vector3,
  from: Site,
  to: Site,
  target: THREE.Vector3,
): THREE.Vector3 {
  if (from === to || !onPlanet(point)) return target.copy(point)
  spot.copy(frame.set(point.x, point.z).up)
  spot.applyQuaternion(between.copy(to.inverse).multiply(from.rotation))
  const theta = Math.acos(Math.max(-1, Math.min(1, spot.y)))
  const flat = Math.hypot(spot.x, spot.z)
  if (flat < 1e-9) return target.set(0, point.y, 0)
  return target.set(
    ((spot.x / flat) * theta) / planet.k,
    point.y,
    ((spot.z / flat) * theta) / planet.k,
  )
}

/* A walker that knows which site's map it is on. */
export interface Sited extends Walker {
  site: Site
}

/* Move a walker onto another site's map. Where they are in space does not change. */
export function resite(walker: Sited, to: Site) {
  const from = walker.site
  walker.site = to
  if (from === to || !onPlanet(walker.position)) return
  const { position, velocity } = walker
  frame.set(position.x, position.z)
  frame.lift(velocity.x, velocity.z, travel)
  frame.lift(-Math.sin(walker.yaw), -Math.cos(walker.yaw), heading)
  between.copy(to.inverse).multiply(from.rotation)
  spot.copy(frame.up).applyQuaternion(between)
  travel.applyQuaternion(between)
  heading.applyQuaternion(between)
  land(walker, spot)
}

/* A walker stays on a site's map until another site is nearer by this many metres. */
const SITE_MARGIN = 2

/* Keep a walker on the map of the site nearest to them. */
export function keepNearestSite(walker: Sited, sites: readonly Site[]) {
  if (!onPlanet(walker.position) || sites.length < 2) return
  spot.copy(frame.set(walker.position.x, walker.position.z).up)
  spot.applyQuaternion(walker.site.rotation)
  const away = (site: Site) =>
    Math.acos(Math.max(-1, Math.min(1, spot.dot(site.anchor)))) / planet.k
  let nearest = walker.site
  let least = away(walker.site) - SITE_MARGIN
  for (const site of sites) {
    const distance = away(site)
    if (distance < least) {
      least = distance
      nearest = site
    }
  }
  if (nearest !== walker.site) resite(walker, nearest)
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

const here = new Frame()
const there = new Frame()
const tangent = new THREE.Vector3()
const lifted = new THREE.Vector3()

/*
  Where a map point is as seen from an observer standing on the planet.

  The flat map is only true to the planet near the pole; far from it, map
  offsets are stretched sideways compared with what is drawn. This returns
  the point in a flat frame that is true around the observer instead: it
  keeps the observer's map position as its origin and the observer's sense
  of map directions, and puts the point at its real distance and direction
  across the ground. Height is unchanged.

  Anything a player aims at or reaches for must be placed this way, or the
  crosshair and the maths disagree. Off the planet the point is returned as
  it is.
*/
export function seenFrom(
  observer: THREE.Vector3,
  point: THREE.Vector3,
  target: THREE.Vector3,
): THREE.Vector3 {
  if (!onPlanet(observer) || !onPlanet(point)) return target.copy(point)
  here.set(observer.x, observer.z)
  there.set(point.x, point.z)
  // The great-circle arc from the observer to the point, laid out flat.
  const cos = Math.max(-1, Math.min(1, here.up.dot(there.up)))
  tangent.copy(there.up).addScaledVector(here.up, -cos)
  const length = tangent.length()
  if (length < 1e-9) return target.set(observer.x, point.y, observer.z)
  tangent.multiplyScalar(Math.acos(cos) / planet.k / length)
  here.lower(tangent, lifted)
  return target.set(observer.x + lifted.x, point.y, observer.z + lifted.z)
}

/* The inverse of `seenFrom`: a point in the observer's flat frame → the map. */
export function placedFrom(
  observer: THREE.Vector3,
  seen: THREE.Vector3,
  target: THREE.Vector3,
): THREE.Vector3 {
  if (!onPlanet(observer)) return target.copy(seen)
  here.set(observer.x, observer.z)
  here.lift(seen.x - observer.x, seen.z - observer.z, tangent)
  const distance = tangent.length()
  if (distance < 1e-9) return target.set(observer.x, seen.y, observer.z)
  const angle = distance * planet.k
  // Walk the arc from the observer's "up" towards the tangent direction.
  lifted.copy(here.up).multiplyScalar(Math.cos(angle))
  lifted.addScaledVector(tangent, Math.sin(angle) / distance)
  const theta = Math.acos(Math.max(-1, Math.min(1, lifted.y)))
  const flat = Math.hypot(lifted.x, lifted.z)
  if (flat < 1e-9) return target.set(0, seen.y, 0)
  return target.set(
    ((lifted.x / flat) * theta) / planet.k,
    seen.y,
    ((lifted.z / flat) * theta) / planet.k,
  )
}

/*
  Re-express a map direction that is true at one place as the map direction
  that means the same thing in space at another place close by. Only x and z
  change.
*/
export function redirect(from: THREE.Vector3, to: THREE.Vector3, vector: THREE.Vector3) {
  if (!onPlanet(from) || !onPlanet(to)) return vector
  here.set(from.x, from.z).lift(vector.x, vector.z, tangent)
  const y = vector.y
  there.set(to.x, to.z).lower(tangent, vector)
  vector.y = y
  return vector
}
