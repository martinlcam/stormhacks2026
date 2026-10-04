import * as THREE from 'three'
import { onPlanet, walkOnPlanet } from './planet'
import type { Portal } from './Portal'
import { yawDelta } from './portalMath'

export const GRAVITY = 16
/* Share of the speed into a surface that comes back out of it. */
const BOUNCE = 0.45
/* Hits slower than this (per unit of scale) do not bounce at all. */
const DEAD_SPEED = 1
/* How quickly a ball rolling on the ground slows down, per second. */
const ROLL_DRAG = 2.5
/* A grounded ball slower than this (per unit of scale) comes to rest. */
const REST_SPEED = 0.15
const MAX_SUBSTEPS = 24

const before = new THREE.Vector3()
const closest = new THREE.Vector3()
const normal = new THREE.Vector3()
const localBefore = new THREE.Vector3()
const localAfter = new THREE.Vector3()

/*
  A ball that falls, bounces, rolls and goes through portals.

  Like the player, it lives in map coordinates: collision is against the
  world's axis-aligned boxes, on the planet its horizontal motion follows a
  great circle, and crossing a portal applies that portal's transform to its
  position, velocity and size together.
*/
export class Body {
  /* Centre of the ball. */
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  /* A heading that is carried along with the ball, for whatever is drawn. */
  yaw = 0
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
  }

  step(dt: number, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    if (this.resting) return
    // Gravity scales with the ball, as it does for the player, so a ball
    // shrunk by a doorway moves the way a full-size ball does to full-size eyes.
    this.velocity.y -= GRAVITY * this.scale * dt

    // Never move more than half a radius at once, or thin walls are skipped.
    const distance = this.velocity.length() * dt
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(distance / (this.radius * 0.5))))
    for (let i = 0; i < steps; i++) this.substep(dt / steps, colliders, portals)
  }

  private substep(dt: number, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    before.copy(this.position)
    if (onPlanet(this.position)) {
      walkOnPlanet(this, dt)
      this.position.y += this.velocity.y * dt
    } else {
      this.position.addScaledVector(this.velocity, dt)
    }
    // Passing the point opposite the pole jumps across the map; see PlayerController.
    const jumped = before.distanceTo(this.position) > this.velocity.length() * dt * 4 + 1

    const size = this.radius * 2
    const doorway = portals.find((portal) => portal.fits(size, size) && portal.inDoorway(before))
    const grounded = this.collide(colliders, doorway)
    if (!jumped) this.traverse(portals)

    if (grounded) {
      const drag = Math.exp(-ROLL_DRAG * dt)
      this.velocity.x *= drag
      this.velocity.z *= drag
      if (this.velocity.length() < REST_SPEED * this.scale) {
        this.velocity.set(0, 0, 0)
        this.resting = true
      }
    }
  }

  /* Push the ball out of every box it overlaps. True if it is on the ground. */
  private collide(colliders: readonly THREE.Box3[], doorway: Portal | undefined): boolean {
    const p = this.position
    const r = this.radius
    let grounded = false

    for (const box of colliders) {
      if (doorway?.ghostColliders.has(box)) continue
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
      if (normal.y > 0.7) grounded = true
    }
    return grounded
  }

  /* Carry the ball through any portal its path crossed this step. */
  private traverse(portals: readonly Portal[]) {
    const size = this.radius * 2
    for (const portal of portals) {
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
