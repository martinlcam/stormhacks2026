import * as THREE from 'three'
import { type Axis, frameFor, inverseFrameFor, reorient, upVector } from './gravity'
import { elsewhere, onPlanet, POLE, type Site, standOnPlanet, upAt, walkOnPlanet } from './planet'
import type { Portal } from './Portal'

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
const eyeBefore = new THREE.Vector3()
const eyeAfter = new THREE.Vector3()
const sample = new THREE.Vector3()
const expected = new THREE.Quaternion()
const gaze = new THREE.Vector3()
const cameraUp = new THREE.Vector3()
const NO_TILT = new THREE.Quaternion()
/* How quickly the view settles after a door leaves the player off balance, per second. */
const SETTLE_RATE = 7
/* How many steps the body is checked in, from feet to eye, against a doorway. */
const BODY_SAMPLES = 3
const frameTurn = new THREE.Quaternion()
const lookTurn = new THREE.Quaternion()
const lookEuler = new THREE.Euler()

/*
  First-person walker: a cylinder against axis-aligned boxes, with step-up
  for stairs, and seamless travel through portals.

  The walker's up is one of the six world axes (see gravity.ts). Position
  and velocity are kept in world coordinates; yaw and pitch are relative to
  the frame for the current up. Walking, gravity and collision are worked
  out inside that frame, where up is always +y.
*/
export class PlayerController {
  /* Feet position. */
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  /* Which way is up. A portal that turns the player changes it. */
  axis: Axis = 'y+'
  /* The site whose map the player is on. Only that site's boxes and doors touch them. */
  site: Site = POLE
  /*
    Size relative to normal. Every length the player owns (body, stride,
    jump, gravity, eye height) is multiplied by it, so being small feels
    exactly like being normal-sized in a world that grew.
  */
  scale = 1
  onGround = false
  /* How many doors the player has gone through. */
  doors = 0
  /* Where to put the player back if they fall out of the world. */
  readonly spawn = new THREE.Vector3()
  spawnYaw = 0
  onLockChange?: (locked: boolean) => void

  /*
    A door can bring the player out somewhere they cannot stay as they are:
    on the plaza there is only one up, and the eye may arrive lower than a
    standing body allows. The body is put right at once, and the difference
    is kept here and eased away, so the view rolls upright and rises instead
    of snapping. `tilt` is a rotation of the view; `sink` is how far the view
    is held below the eye, in metres.
  */
  private readonly tilt = new THREE.Quaternion()
  private sink = 0

  private readonly keys = new Set<string>()
  /* The world's boxes as seen from inside each frame other than y-up. */
  private readonly framed = new Map<Axis, { source: readonly THREE.Box3[]; boxes: THREE.Box3[] }>()
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
    this.axis = 'y+'
    this.site = POLE
    this.scale = 1
    this.sink = 0
    this.tilt.identity()
  }

  update(dt: number, colliders: readonly THREE.Box3[], portals: readonly Portal[]) {
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'))
    const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'))
    const speed = (this.keys.has('ShiftLeft') ? RUN_SPEED : WALK_SPEED) * this.scale

    wish.set(strafe, 0, -forward)
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed)
    wish.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw)

    // Steer, fall and jump in the player's own frame, where up is +y.
    this.velocity.applyMatrix4(inverseFrameFor(this.axis))
    // Ease towards the wished velocity: snappy on the ground, floaty in air.
    const blend = 1 - Math.exp(-(this.onGround ? 14 : 3) * dt)
    this.velocity.x += (wish.x - this.velocity.x) * blend
    this.velocity.z += (wish.z - this.velocity.z) * blend
    this.velocity.y -= GRAVITY * this.scale * dt
    if (this.onGround && this.keys.has('Space')) this.velocity.y = JUMP_SPEED * this.scale
    this.velocity.applyMatrix4(frameFor(this.axis))

    const distance = this.velocity.length() * dt
    const steps = Math.max(1, Math.ceil(distance / (MAX_STEP * this.scale)))
    const stepDt = dt / steps
    for (let i = 0; i < steps; i++) this.step(stepDt, colliders, portals)

    const settle = Math.exp(-SETTLE_RATE * dt)
    this.sink *= settle
    this.tilt.slerp(NO_TILT, 1 - settle)

    if (this.position.y < -40) this.respawn()
  }

  /* Which way is up for the player, in world coordinates. Do not modify. */
  get up(): THREE.Vector3 {
    return upVector(this.axis)
  }

  /* Where the eye is, in world (on the planet: map) coordinates. */
  eye(target: THREE.Vector3) {
    return target.copy(this.position).addScaledVector(this.up, EYE_HEIGHT * this.scale)
  }

  /* The direction the player is looking, in world (on the planet: map) coordinates. */
  look(target: THREE.Vector3) {
    const level = Math.cos(this.pitch)
    return target
      .set(-Math.sin(this.yaw) * level, Math.sin(this.pitch), -Math.cos(this.yaw) * level)
      .applyMatrix4(frameFor(this.axis))
  }

  /* The direction to the player's right, level with the ground they stand on. */
  right(target: THREE.Vector3) {
    return target.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).applyMatrix4(frameFor(this.axis))
  }

  applyTo(camera: THREE.PerspectiveCamera) {
    const eye = EYE_HEIGHT * this.scale
    if (onPlanet(this.position)) {
      standOnPlanet(camera, this.position, eye, this.yaw, this.pitch)
      upAt(this.position, cameraUp)
      // That is where the player is on their site's map; now to where the site is.
      camera.position.applyMatrix4(this.site.motion)
      camera.quaternion.premultiply(this.site.rotation)
      cameraUp.applyQuaternion(this.site.rotation)
    } else {
      camera.position.copy(this.position).addScaledVector(this.up, eye)
      this.orientation(this.axis, this.yaw, this.pitch, camera.quaternion)
      cameraUp.copy(this.up)
    }
    // Whatever has not settled yet since the last door.
    camera.position.addScaledVector(cameraUp, -this.sink)
    camera.quaternion.multiply(this.tilt)
    // Scaling the camera measures the view in the player's own units, so the
    // near plane and fog shrink with them, and the view through a resizing
    // portal matches what they see once they have stepped through.
    camera.scale.setScalar(this.scale)
    camera.updateMatrixWorld(true)
  }

  /* The view's orientation for a given up, yaw and pitch, off the planet. */
  private orientation(axis: Axis, yaw: number, pitch: number, target: THREE.Quaternion) {
    frameTurn.setFromRotationMatrix(frameFor(axis))
    lookTurn.setFromEuler(lookEuler.set(pitch, yaw, 0, 'YXZ'))
    return target.copy(frameTurn).multiply(lookTurn)
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

    const doorway = portals.find(
      (portal) => portal.site === this.site && this.inDoorway(portal, before),
    )
    this.collideInFrame(colliders, doorway)
    // Passing the point opposite the pole moves the walker to the far side
    // of the map in one step. That is not a path a portal could be on.
    const jumped = before.distanceTo(this.position) > this.velocity.length() * dt * 4 + 1
    if (!jumped) this.traverse(portals)
  }

  /* Collide in the player's own frame, where the boxes are still axis-aligned. */
  private collideInFrame(colliders: readonly THREE.Box3[], doorway: Portal | undefined) {
    if (this.axis === 'y+') {
      this.collide(colliders, colliders, doorway)
      return
    }
    let framed = this.framed.get(this.axis)
    if (!framed || framed.source !== colliders || framed.boxes.length !== colliders.length) {
      const inverse = inverseFrameFor(this.axis)
      framed = {
        source: colliders,
        boxes: colliders.map((box) => box.clone().applyMatrix4(inverse)),
      }
      this.framed.set(this.axis, framed)
    }
    this.position.applyMatrix4(inverseFrameFor(this.axis))
    this.velocity.applyMatrix4(inverseFrameFor(this.axis))
    this.collide(framed.boxes, colliders, doorway)
    this.position.applyMatrix4(frameFor(this.axis))
    this.velocity.applyMatrix4(frameFor(this.axis))
  }

  /*
    `boxes` are the colliders in the player's frame, and `position` and
    `velocity` must be in that frame too. `originals` are the same boxes in
    world coordinates, in the same order, which is how a doorway names the
    wall behind it.
  */
  private collide(
    boxes: readonly THREE.Box3[],
    originals: readonly THREE.Box3[],
    doorway: Portal | undefined,
  ) {
    const p = this.position
    const radius = RADIUS * this.scale
    const height = HEIGHT * this.scale
    const stepHeight = STEP_HEIGHT * this.scale
    let ground = -Infinity

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (doorway?.ghostColliders.has(originals[i]) || elsewhere(originals[i], this.site)) continue

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

  /*
    The plaza has only one up. A player who arrives there standing any other
    way is stood upright at once, looking in the same direction, and the
    roll that this takes out of their view is handed to `tilt` to ease away.
  */
  private standUpright(arrived: Axis) {
    this.orientation(arrived, this.yaw, this.pitch, expected)
    gaze.set(0, 0, -1).applyQuaternion(expected)
    this.axis = 'y+'
    this.pitch = Math.asin(Math.max(-1, Math.min(1, gaze.y)))
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch))
    // Looking straight up or down leaves no heading to keep; take the top of the view.
    if (Math.hypot(gaze.x, gaze.z) < 1e-3) gaze.set(0, 1, 0).applyQuaternion(expected)
    this.yaw = Math.atan2(-gaze.x, -gaze.z)
    // upright · tilt = what the view was, so the first frame is unchanged.
    this.orientation('y+', this.yaw, this.pitch, this.tilt).invert().multiply(expected)
  }

  /* A door can be gone through by anyone who fits, whichever way up they are. */
  private canEnter(portal: Portal) {
    return portal.fits(RADIUS * 2 * this.scale, HEIGHT * this.scale)
  }

  /*
    True while any part of the body is in a doorway. The body is sampled from
    feet to eye, because it may be going through feet first: a door lying in
    the floor is a hole, and the wall behind it must stop being solid for as
    long as the body is passing.
  */
  private inDoorway(portal: Portal, feet: THREE.Vector3) {
    if (!this.canEnter(portal)) return false
    const eye = EYE_HEIGHT * this.scale
    for (let i = 0; i <= BODY_SAMPLES; i++) {
      sample.copy(feet).addScaledVector(this.up, (eye * i) / BODY_SAMPLES)
      if (portal.inDoorway(sample)) return true
    }
    return false
  }

  /*
    Carry the player through any portal their eye crossed this step.

    The eye, not the feet, decides. For an upright door there is no
    difference, since both cross together. For a door lying in the floor
    the feet go in first, and moving the player then would put the camera on
    the far side while it is still looking at the near one. Waiting for the
    eye keeps the view continuous whichever way the body goes in.
  */
  private traverse(portals: readonly Portal[]) {
    const eye = EYE_HEIGHT * this.scale
    eyeBefore.copy(before).addScaledVector(this.up, eye)
    eyeAfter.copy(this.position).addScaledVector(this.up, eye)
    for (const portal of portals) {
      if (portal.site !== this.site) continue
      portal.toLocal(eyeBefore, localBefore)
      portal.toLocal(eyeAfter, localAfter)
      if (localBefore.z <= 0 || localAfter.z > 0) continue

      // Where the path met the plane must be inside the opening.
      const t = localBefore.z / (localBefore.z - localAfter.z)
      localBefore.lerp(localAfter, t)
      if (!portal.withinOpening(localBefore) || !this.canEnter(portal)) continue

      eyeAfter.applyMatrix4(portal.transform)
      // A resizing portal changes the player and their speed by the same ratio.
      const ratio = portal.target.scale / portal.scale
      const speed = this.velocity.length() * ratio
      this.scale *= ratio
      this.velocity.transformDirection(portal.transform).multiplyScalar(speed)
      // The door may turn the player onto a wall or the ceiling.
      this.site = portal.target.site
      this.doors++
      const turned = reorient(this.axis, this.yaw, portal.transform)
      this.axis = turned.axis
      this.yaw = turned.yaw
      if (turned.axis !== 'y+' && onPlanet(eyeAfter)) this.standUpright(turned.axis)
      // Hang the body from the eye, along the new up.
      this.position.copy(eyeAfter).addScaledVector(this.up, -EYE_HEIGHT * this.scale)
      // The eye may have come through lower than a standing body allows,
      // which would put the feet under the far door's floor. Stand on that
      // floor and let the view rise to its place.
      if (portal.target.up.dot(this.up) > 0.9) {
        const below = -portal.target.toLocal(this.position, sample).y * portal.target.scale
        if (below > 0) {
          this.position.addScaledVector(this.up, below)
          this.sink += below
        }
      }
      portal.onTraverse?.()
      return
    }
  }
}
