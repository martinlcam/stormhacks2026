import * as THREE from 'three'
import type { Portal } from './Portal'
import { yawDelta } from './portalMath'

const RADIUS = 0.3
const HEIGHT = 1.8
const EYE_HEIGHT = 1.62
const STEP_HEIGHT = 0.4
const WALK_SPEED = 4.5
const RUN_SPEED = 8
const JUMP_SPEED = 5.2
const GRAVITY = 16
const MOUSE_SENSITIVITY = 0.0022
const MAX_PITCH = Math.PI / 2 - 0.01
/** Longest distance moved per collision step; keeps fast frames from tunnelling. */
const MAX_STEP = 0.1

const wish = new THREE.Vector3()
const before = new THREE.Vector3()
const localBefore = new THREE.Vector3()
const localAfter = new THREE.Vector3()

/**
 * First-person walker: a vertical cylinder against axis-aligned boxes, with
 * step-up for stairs, and seamless travel through portals.
 */
export class PlayerController {
  /** Feet position. */
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  onGround = false
  /** Where to put the player back if they fall out of the world. */
  readonly spawn = new THREE.Vector3()
  spawnYaw = 0
  onLockChange?: (locked: boolean) => void

  private readonly keys = new Set<string>()
  private readonly abort = new AbortController()

  constructor(private readonly dom: HTMLElement) {
    const signal = this.abort.signal
    window.addEventListener('keydown', (e) => this.keys.add(e.code), { signal })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), { signal })
    window.addEventListener('blur', () => this.keys.clear(), { signal })
    document.addEventListener('mousemove', (e) => this.onMouseMove(e), { signal })
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (!this.locked) this.keys.clear()
        this.onLockChange?.(this.locked)
      },
      { signal },
    )
  }

  get locked() {
    return document.pointerLockElement === this.dom
  }

  lock() {
    void this.dom.requestPointerLock()
  }

  dispose() {
    this.abort.abort()
  }

  respawn() {
    this.position.copy(this.spawn)
    this.velocity.set(0, 0, 0)
    this.yaw = this.spawnYaw
    this.pitch = 0
  }

  update(dt: number, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'))
    const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'))
    const speed = this.keys.has('ShiftLeft') ? RUN_SPEED : WALK_SPEED

    wish.set(strafe, 0, -forward)
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed)
    wish.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw)

    // Ease towards the wished velocity: snappy on the ground, floaty in air.
    const blend = 1 - Math.exp(-(this.onGround ? 14 : 3) * dt)
    this.velocity.x += (wish.x - this.velocity.x) * blend
    this.velocity.z += (wish.z - this.velocity.z) * blend
    this.velocity.y -= GRAVITY * dt
    if (this.onGround && this.keys.has('Space')) this.velocity.y = JUMP_SPEED

    const distance = this.velocity.length() * dt
    const steps = Math.max(1, Math.ceil(distance / MAX_STEP))
    const stepDt = dt / steps
    for (let i = 0; i < steps; i++) this.step(stepDt, colliders, portals)

    if (this.position.y < -40) this.respawn()
  }

  applyTo(camera: THREE.PerspectiveCamera) {
    camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z)
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    camera.updateMatrixWorld(true)
  }

  private onMouseMove(event: MouseEvent) {
    if (!this.locked) return
    this.yaw -= event.movementX * MOUSE_SENSITIVITY
    this.pitch -= event.movementY * MOUSE_SENSITIVITY
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch))
  }

  private step(dt: number, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    before.copy(this.position)
    this.position.addScaledVector(this.velocity, dt)

    const doorway = portals.find((portal) => portal.inDoorway(before))
    this.collide(colliders, doorway)
    this.traverse(portals)
  }

  private collide(colliders: readonly THREE.Box3[], doorway: Portal | undefined) {
    const p = this.position
    let ground = -Infinity

    for (const box of colliders) {
      if (doorway?.ghostColliders.has(box)) continue

      // Closest point of the box's footprint to the player's axis.
      const cx = Math.max(box.min.x, Math.min(p.x, box.max.x))
      const cz = Math.max(box.min.z, Math.min(p.z, box.max.z))
      const dx = p.x - cx
      const dz = p.z - cz
      const distSq = dx * dx + dz * dz
      if (distSq >= RADIUS * RADIUS) continue

      // Low enough to stand on or step up: it's floor, not wall.
      if (box.max.y <= p.y + STEP_HEIGHT) {
        // Only the middle of the footprint counts, so you can't hover on edges.
        if (distSq < RADIUS * RADIUS * 0.25) ground = Math.max(ground, box.max.y)
        continue
      }
      if (box.min.y >= p.y + HEIGHT) continue

      if (distSq > 1e-10) {
        const dist = Math.sqrt(distSq)
        const push = (RADIUS - dist) / dist
        p.x += dx * push
        p.z += dz * push
      } else {
        // Axis is inside the box: leave through the nearest face.
        const left = p.x - box.min.x
        const right = box.max.x - p.x
        const back = p.z - box.min.z
        const front = box.max.z - p.z
        const least = Math.min(left, right, back, front)
        if (least === left) p.x = box.min.x - RADIUS
        else if (least === right) p.x = box.max.x + RADIUS
        else if (least === back) p.z = box.min.z - RADIUS
        else p.z = box.max.z + RADIUS
      }
    }

    this.onGround = false
    if (this.velocity.y <= 0 && p.y <= ground) {
      p.y = ground
      this.velocity.y = 0
      this.onGround = true
    }
  }

  /** Carry the player through any portal their path crossed this step. */
  private traverse(portals: readonly Portal[]) {
    for (const portal of portals) {
      portal.toLocal(before, localBefore)
      portal.toLocal(this.position, localAfter)
      if (localBefore.z <= 0 || localAfter.z > 0) continue

      // Where the path met the plane must be inside the opening.
      const t = localBefore.z / (localBefore.z - localAfter.z)
      localBefore.lerp(localAfter, t)
      if (!portal.withinOpening(localBefore)) continue

      this.position.applyMatrix4(portal.transform)
      const speed = this.velocity.length()
      this.velocity.transformDirection(portal.transform).multiplyScalar(speed)
      this.yaw += yawDelta(portal.transform)
      portal.onTraverse?.()
      return
    }
  }
}
