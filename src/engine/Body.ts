import * as THREE from 'three'
import { axisOf, upVector } from './gravity'
import { elsewhere, onPlanet, planetRadius, POLE, type Site, walkOnPlanet } from './planet'
import type { Portal } from './Portal'
import { yawDelta } from './portalMath'
import { sweepSphereBox } from './sweep'

export const GRAVITY = 16
/* The fastest a fall gets, in metres per second. */
const TERMINAL_SPEED = 30
/* Share of the speed into a surface that comes back out of it. */
const BOUNCE = 0.45
/* Hits slower than this (per unit of scale) do not bounce at all. */
const DEAD_SPEED = 1
/* How quickly a ball rolling on the ground slows down, per second. */
const ROLL_DRAG = 2.5
/* A grounded ball slower than this (per unit of scale) comes to rest. */
const REST_SPEED = 0.15
/* Share of its speed over the ground that a ball in the air above the planet loses a second. */
const AIR = 0.01
const MAX_SUBSTEPS = 24

const before = new THREE.Vector3()
const closest = new THREE.Vector3()
const normal = new THREE.Vector3()
const localBefore = new THREE.Vector3()
const localAfter = new THREE.Vector3()
const across = new THREE.Vector3()
const relative = new THREE.Vector3()
const contactNormal = new THREE.Vector3()

/*
  A ball that falls, bounces, rolls and goes through portals.

  Like the player, it lives in map coordinates: collision is against the
  world's axis-aligned boxes, on the planet its horizontal motion follows a
  great circle, and crossing a portal applies that portal's transform to its
  position, velocity and size together.

  On the planet its velocity along the ground (x and z) is the speed of the
  point under it, and its height is worked out as on any small world: the
  ground curves away beneath a ball going sideways, so the faster it goes
  the less it falls. A ball going fast enough does not come down at all. It
  falls all the way round, which is an orbit. A little air slows it, so
  that in the end it lands.
*/
export class Body {
  /* Centre of the ball. */
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  /* A heading that is carried along with the ball, for whatever is drawn. */
  yaw = 0
  /*
    Which way is up for the ball; it falls the other way. A portal that
    turns things turns this too. On the planet it is always +y.
  */
  readonly up = new THREE.Vector3(0, 1, 0)
  /* The site whose map the ball is on. Only that site's boxes and doors touch it. */
  site: Site = POLE
  /* Size multiplier. Resizing portals change it. */
  scale = 1
  /* True once the ball has stopped; physics is skipped until it is woken. */
  resting = false
  /* Called after the ball has been carried through a portal. */
  onTraverse?: (portal: Portal) => void

  constructor(readonly baseRadius: number) {}

  get radius() {
    return this.baseRadius * this.scale
  }

  /* Carry the ball through a portal: place, motion, heading and size. */
  through(portal: Portal) {
    const ratio = portal.target.scale / portal.scale
    const speed = this.velocity.length() * ratio
    this.position.applyMatrix4(portal.transform)
    this.velocity.transformDirection(portal.transform).multiplyScalar(speed)
    this.yaw += yawDelta(portal.transform)
    this.scale *= ratio
    this.site = portal.target.site
    this.up.transformDirection(portal.transform)
    this.up.copy(onPlanet(this.position) ? upVector('y+') : upVector(axisOf(this.up)))
  }

  step(dt: number, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    if (this.resting) return
    // Gravity scales with the ball, as it does for the player, so a ball
    // shrunk by a doorway moves the way a full-size ball does to full-size eyes.
    this.velocity.addScaledVector(this.up, -GRAVITY * this.scale * dt)
    // Where there is no bottom to reach, a fall must still stop getting faster.
    const falling = -this.velocity.dot(this.up) - TERMINAL_SPEED * this.scale
    if (falling > 0) this.velocity.addScaledVector(this.up, falling)
    if (onPlanet(this.position)) {
      // Going round a circle of radius r at speed v takes an inward pull of
      // v² / r. That much of gravity is spent keeping the ball going round
      // and does not bring it down. The ball is at R + height and going
      // (R + height) / R times as fast as the ground under it.
      const radius = planetRadius()
      const ground = this.velocity.x ** 2 + this.velocity.z ** 2
      this.velocity.y += ((ground * (radius + this.position.y)) / (radius * radius)) * dt
    }

    // Prefer steps no longer than half a radius; sweep longer steps if capped.
    const distance = this.velocity.length() * dt
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(distance / (this.radius * 0.5))))
    for (let i = 0; i < steps; i++) this.substep(dt / steps, colliders, portals)
  }

  private substep(dt: number, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    before.copy(this.position)
    if (onPlanet(this.position)) {
      walkOnPlanet(this, dt)
      const radius = planetRadius()
      const from = radius + this.position.y
      this.position.y += this.velocity.y * dt
      // A ball that rises goes round more slowly and one that sinks more
      // quickly, as a skater does who puts out or pulls in their arms.
      const swing = (from / (radius + this.position.y)) ** 2 * Math.exp(-AIR * dt)
      this.velocity.x *= swing
      this.velocity.z *= swing
    } else {
      this.position.addScaledVector(this.velocity, dt)
    }
    // Passing the point opposite the pole jumps across the map; see PlayerController.
    const jumped = before.distanceTo(this.position) > this.velocity.length() * dt * 4 + 1

    const size = this.radius * 2
    const doorway = portals.find(
      (portal) => portal.site === this.site && portal.fits(size, size) && portal.inDoorway(before),
    )
    // A tiny gem thrown by a larger player can exceed the substep budget.
    // Sweep the whole segment in that case so even thin glass still stops it.
    const sweptGround =
      !jumped &&
      before.distanceToSquared(this.position) > this.radius * this.radius * 0.25 &&
      this.sweep(colliders, doorway)

    const grounded = this.collide(colliders, doorway) || sweptGround
    if (!jumped) this.traverse(portals)

    if (grounded) {
      // Slow the motion along the ground, not the motion towards or away from it.
      const rising = this.velocity.dot(this.up)
      this.velocity
        .addScaledVector(this.up, -rising)
        .multiplyScalar(Math.exp(-ROLL_DRAG * dt))
        .addScaledVector(this.up, rising)
      if (this.velocity.length() < REST_SPEED * this.scale) {
        this.velocity.set(0, 0, 0)
        this.resting = true
      }
    }
  }

  /* Keep a kick or another gem's push from displacing this ball through a solid. */
  constrainPush(from: THREE.Vector3, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    if (from.distanceToSquared(this.position) < 1e-12 * this.scale * this.scale) return
    before.copy(from)
    const size = this.radius * 2
    const doorway = portals.find(
      (portal) => portal.site === this.site && portal.fits(size, size) && portal.inDoorway(before),
    )
    this.sweep(colliders, doorway)
    this.collide(colliders, doorway)
    this.traverse(portals)
    this.resting = false
  }

  /* Stop at the first contact along the segment starting at `before`. */
  private sweep(colliders: readonly THREE.Box3[], doorway: Portal | undefined): boolean {
    let contact = Infinity

    for (const box of colliders) {
      if (doorway?.ghostColliders.has(box) || elsewhere(box, this.site)) continue
      const t = sweepSphereBox(before, this.position, this.radius, box, normal)
      if (t >= contact) continue
      contact = t
      contactNormal.copy(normal)
    }

    if (contact > 1) return false
    this.position.lerpVectors(before, this.position, contact)
    this.position.addScaledVector(contactNormal, this.radius * 1e-6)
    const into = this.velocity.dot(contactNormal)
    const bounce = -into > DEAD_SPEED * this.scale ? BOUNCE : 0
    if (into < 0) this.velocity.addScaledVector(contactNormal, -(1 + bounce) * into)
    return contactNormal.dot(this.up) > 0.7
  }

  /*
    Collide with an upright solid cylinder that may be moving, such as the
    player's figure: `feet` is the middle of its base and `up` its axis. The
    ball is pushed out and bounces off, and a ball lying still is knocked
    away by a cylinder that walks into it. True if they touched.
  */
  hitCylinder(
    feet: THREE.Vector3,
    up: THREE.Vector3,
    radius: number,
    height: number,
    velocity: THREE.Vector3,
  ): boolean {
    // The point of the cylinder nearest the ball's centre.
    across.subVectors(this.position, feet)
    const rise = across.dot(up)
    across.addScaledVector(up, -rise)
    const out = across.length()
    const inside = out < radius && rise > 0 && rise < height
    if (inside) {
      // Centre is inside the cylinder: leave through its side.
      if (out > 1e-9) normal.copy(across).divideScalar(out)
      else normal.set(1, 0, 0).cross(up).normalize()
      this.position.addScaledVector(normal, radius - out + this.radius)
    } else {
      if (out > radius) across.multiplyScalar(radius / out)
      closest
        .copy(feet)
        .add(across)
        .addScaledVector(up, Math.max(0, Math.min(height, rise)))
      normal.subVectors(this.position, closest)
      const distance = normal.length()
      if (distance >= this.radius || distance < 1e-9) return false
      normal.divideScalar(distance)
      this.position.addScaledVector(normal, this.radius - distance)
    }

    // Only the speed at which the two are closing is turned round.
    relative.subVectors(this.velocity, velocity)
    const into = relative.dot(normal)
    if (into < 0) {
      const bounce = -into > DEAD_SPEED * this.scale ? BOUNCE : 0
      this.velocity.addScaledVector(normal, -(1 + bounce) * into)
      this.resting = false
    }
    return true
  }

  /*
    Collide with another ball. They are pushed apart by the same amount and
    exchange the speed at which they were closing. True if they touched.
  */
  hitBall(other: Body): boolean {
    normal.subVectors(this.position, other.position)
    const distance = normal.length()
    const reach = this.radius + other.radius
    if (distance >= reach || distance < 1e-9) return false
    normal.divideScalar(distance)
    const overlap = (reach - distance) / 2
    this.position.addScaledVector(normal, overlap)
    other.position.addScaledVector(normal, -overlap)

    relative.subVectors(this.velocity, other.velocity)
    const into = relative.dot(normal)
    if (into < 0) {
      const bounce = -into > DEAD_SPEED * this.scale ? BOUNCE : 0
      const push = (-(1 + bounce) * into) / 2
      this.velocity.addScaledVector(normal, push)
      other.velocity.addScaledVector(normal, -push)
      this.resting = false
      other.resting = false
    }
    return true
  }

  /* Push the ball out of every box it overlaps. True if it is on the ground. */
  private collide(colliders: readonly THREE.Box3[], doorway: Portal | undefined): boolean {
    const p = this.position
    const r = this.radius
    let grounded = false

    for (const box of colliders) {
      if (doorway?.ghostColliders.has(box) || elsewhere(box, this.site)) continue
      box.clampPoint(p, closest)
      normal.subVectors(p, closest)
      const distSq = normal.lengthSq()
      if (distSq >= r * r) continue

      if (distSq > 1e-12) {
        const dist = Math.sqrt(distSq)
        normal.divideScalar(dist)
        p.addScaledVector(normal, r - dist)
      } else {
        // Centre is inside the box: leave through the nearest face.
        const gaps = [
          p.x - box.min.x,
          box.max.x - p.x,
          p.y - box.min.y,
          box.max.y - p.y,
          p.z - box.min.z,
          box.max.z - p.z,
        ]
        const face = gaps.indexOf(Math.min(...gaps))
        normal.set(0, 0, 0).setComponent(face >> 1, face & 1 ? 1 : -1)
        p.addScaledVector(normal, gaps[face] + r)
      }

      const into = this.velocity.dot(normal)
      if (into < 0) {
        const bounce = -into > DEAD_SPEED * this.scale ? BOUNCE : 0
        this.velocity.addScaledVector(normal, -(1 + bounce) * into)
      }
      if (normal.dot(this.up) > 0.7) grounded = true
    }
    return grounded
  }

  /* Carry the ball through any portal its path crossed this step. */
  private traverse(portals: readonly Portal[]) {
    const size = this.radius * 2
    for (const portal of portals) {
      if (portal.site !== this.site) continue
      portal.toLocal(before, localBefore)
      portal.toLocal(this.position, localAfter)
      if (localBefore.z <= 0 || localAfter.z > 0) continue

      const t = localBefore.z / (localBefore.z - localAfter.z)
      localBefore.lerp(localAfter, t)
      if (!portal.withinOpening(localBefore) || !portal.fits(size, size)) continue

      this.through(portal)
      this.onTraverse?.(portal)
      return
    }
  }
}
