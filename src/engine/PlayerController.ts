import * as THREE from 'three'
import { onPlanet, standOnPlanet, walkOnPlanet } from './planet'
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
/* Longest distance moved per collision step; keeps fast frames from tunnelling. */
const MAX_STEP = 0.1

const wish = new THREE.Vector3()
const before = new THREE.Vector3()
const localBefore = new THREE.Vector3()
const localAfter = new THREE.Vector3()

/*
  First-person walker: a vertical cylinder against axis-aligned boxes, with
  step-up for stairs, and seamless travel through portals.
*/
export class PlayerController {
  /* Feet position. */
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  /*
    Size relative to normal. Every length the player owns (body, stride,
    jump, gravity, eye height) is multiplied by it, so being small feels
    exactly like being normal-sized in a world that grew.
  */
  scale = 1
  onGround = false
  /* Where to put the player back if they fall out of the world. */
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
    this.scale = 1
  }

  update(dt: number, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'))
    const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'))
    const speed = (this.keys.has('ShiftLeft') ? RUN_SPEED : WALK_SPEED) * this.scale

    wish.set(strafe, 0, -forward)
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed)
    wish.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw)

    // Ease towards the wished velocity: snappy on the ground, floaty in air.
    const blend = 1 - Math.exp(-(this.onGround ? 14 : 3) * dt)
    this.velocity.x += (wish.x - this.velocity.x) * blend
    this.velocity.z += (wish.z - this.velocity.z) * blend
    this.velocity.y -= GRAVITY * this.scale * dt
    if (this.onGround && this.keys.has('Space')) this.velocity.y = JUMP_SPEED * this.scale

    const distance = this.velocity.length() * dt
    const steps = Math.max(1, Math.ceil(distance / (MAX_STEP * this.scale)))
    const stepDt = dt / steps
    for (let i = 0; i < steps; i++) this.step(stepDt, colliders, portals)

    if (this.position.y < -40) this.respawn()
  }

  /* Where the eye is, in map coordinates. */
  eye(target: THREE.Vector3) {
    return target.copy(this.position).setY(this.position.y + EYE_HEIGHT * this.scale)
  }

  /* The direction the player is looking, in map coordinates. */
  look(target: THREE.Vector3) {
    const level = Math.cos(this.pitch)
    return target.set(
      -Math.sin(this.yaw) * level,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * level,
    )
  }

  applyTo(camera: THREE.PerspectiveCamera) {
    const eye = EYE_HEIGHT * this.scale
    if (onPlanet(this.position)) {
      standOnPlanet(camera, this.position, eye, this.yaw, this.pitch)
    } else {
      camera.position.set(this.position.x, this.position.y + eye, this.position.z)
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    }
    // Scaling the camera measures the view in the player's own units, so the
    // near plane and fog shrink with them, and the view through a resizing
    // portal matches what they see once they have stepped through.
    camera.scale.setScalar(this.scale)
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
    if (onPlanet(this.position)) {
      walkOnPlanet(this, dt)
      this.position.y += this.velocity.y * dt
    } else {
      this.position.addScaledVector(this.velocity, dt)
    }

    const doorway = portals.find((portal) => this.fits(portal) && portal.inDoorway(before))
    this.collide(colliders, doorway)
    // Passing the point opposite the pole moves the walker to the far side
    // of the map in one step. That is not a path a portal could be on.
    const jumped = before.distanceTo(this.position) > this.velocity.length() * dt * 4 + 1
    if (!jumped) this.traverse(portals)
  }

  private collide(colliders: readonly THREE.Box3[], doorway: Portal | undefined) {
    const p = this.position
    const radius = RADIUS * this.scale
    const height = HEIGHT * this.scale
    const stepHeight = STEP_HEIGHT * this.scale
    let ground = -Infinity

    for (const box of colliders) {
      if (doorway?.ghostColliders.has(box)) continue

      // Closest point of the box's footprint to the player's axis.
      const cx = Math.max(box.min.x, Math.min(p.x, box.max.x))
      const cz = Math.max(box.min.z, Math.min(p.z, box.max.z))
      const dx = p.x - cx
      const dz = p.z - cz
      const distSq = dx * dx + dz * dz
      if (distSq >= radius * radius) continue

      // Low enough to stand on or step up: it's floor, not wall.
      if (box.max.y <= p.y + stepHeight) {
        // Only the middle of the footprint counts, so you can't hover on edges.
        if (distSq < radius * radius * 0.25) ground = Math.max(ground, box.max.y)
        continue
      }
      if (box.min.y >= p.y + height) continue

      if (distSq > 1e-10) {
        const dist = Math.sqrt(distSq)
        const push = (radius - dist) / dist
        p.x += dx * push
        p.z += dz * push
      } else {
        // Axis is inside the box: leave through the nearest face.
        const left = p.x - box.min.x
        const right = box.max.x - p.x
        const back = p.z - box.min.z
        const front = box.max.z - p.z
        const least = Math.min(left, right, back, front)
        if (least === left) p.x = box.min.x - radius
        else if (least === right) p.x = box.max.x + radius
        else if (least === back) p.z = box.min.z - radius
        else p.z = box.max.z + radius
      }
    }

    this.onGround = false
    if (this.velocity.y <= 0 && p.y <= ground) {
      p.y = ground
      this.velocity.y = 0
      this.onGround = true
    }
  }

  private fits(portal: Portal) {
    return portal.fits(RADIUS * 2 * this.scale, HEIGHT * this.scale)
  }

  /* Carry the player through any portal their path crossed this step. */
  private traverse(portals: readonly Portal[]) {
    for (const portal of portals) {
      portal.toLocal(before, localBefore)
      portal.toLocal(this.position, localAfter)
      if (localBefore.z <= 0 || localAfter.z > 0) continue

      // Where the path met the plane must be inside the opening.
      const t = localBefore.z / (localBefore.z - localAfter.z)
      localBefore.lerp(localAfter, t)
      if (!portal.withinOpening(localBefore) || !this.fits(portal)) continue

      this.position.applyMatrix4(portal.transform)
      // A resizing portal changes the player and their speed by the same ratio.
      const ratio = portal.target.scale / portal.scale
      const speed = this.velocity.length() * ratio
      this.scale *= ratio
      this.velocity.transformDirection(portal.transform).multiplyScalar(speed)
      this.yaw += yawDelta(portal.transform)
      portal.onTraverse?.()
      return
    }
  }
}
