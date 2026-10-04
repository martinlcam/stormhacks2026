import * as THREE from 'three'
import type { Engine } from '../engine/Engine'
import type { Portal } from '../engine/Portal'
import { yawDelta } from '../engine/portalMath'
import type { Item } from '../world/World'

/* How far the player can reach, per unit of their own scale. */
const REACH = 3
/* Where a held item floats: ahead of the eye, to the right of it and below it. */
const HOLD_AHEAD = 0.85
const HOLD_RIGHT = 0.34
const HOLD_BELOW = 0.3
/* Never pull a held item closer to the eye than this. */
const HOLD_MIN = 0.25
/* Throw speed for the lightest tap and for a full charge, per unit of scale. */
const THROW_MIN = 3
const THROW_MAX = 18
/* Seconds of holding Q to reach a full charge. */
const CHARGE_TIME = 1.2
/* A throw leaves slightly above the line of sight. */
const THROW_LIFT = 0.12
/* The aim ray may pass through this many portals. */
const MAX_HOPS = 3
/*
  Aiming is forgiving. An item can be picked up when the crosshair is within
  this angle of it (as a tangent: 0.14 is about 8 degrees), so the margin
  around an item grows with its distance and looks the same size on screen.
*/
const AIM_MARGIN = 0.14

/* How full the charge is, 0 to 1, after holding Q for this long. */
export function chargeLevel(heldSeconds: number): number {
  return Math.max(0, Math.min(1, heldSeconds / CHARGE_TIME))
}

/* How fast a throw leaves the hand for a charge level of 0 to 1. */
export function throwSpeed(level: number): number {
  return THROW_MIN + (THROW_MAX - THROW_MIN) * level
}

export interface ItemEvents {
  /* The hint to show under the crosshair, or null for none. */
  prompt(text: string | null): void
  /* How full the throw charge is, 0 to 1, or null when not charging. */
  charge(level: number | null): void
  /* A loose item went through a portal by itself. */
  thrownThrough(): void
}

const eye = new THREE.Vector3()
const look = new THREE.Vector3()
const hold = new THREE.Vector3()
const origin = new THREE.Vector3()
const direction = new THREE.Vector3()
const point = new THREE.Vector3()
const local = new THREE.Vector3()
const localEnd = new THREE.Vector3()
const offset = new THREE.Vector3()
const toItem = new THREE.Vector3()
const spin = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/* Distance along a ray to where it enters a box, or Infinity. */
function rayBox(from: THREE.Vector3, dir: THREE.Vector3, box: THREE.Box3): number {
  let near = 0
  let far = Infinity
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(dir[axis]) < 1e-9) {
      if (from[axis] < box.min[axis] || from[axis] > box.max[axis]) return Infinity
      continue
    }
    const a = (box.min[axis] - from[axis]) / dir[axis]
    const b = (box.max[axis] - from[axis]) / dir[axis]
    near = Math.max(near, Math.min(a, b))
    far = Math.min(far, Math.max(a, b))
    if (near > far) return Infinity
  }
  return near
}

/*
  How far off the crosshair an item is, as the tangent of the angle between
  the aim ray and the nearest part of the item. Zero means the crosshair is
  on it. Infinity means it is behind the eye, out of reach, or outside the
  aim margin.
*/
export function aimMiss(
  from: THREE.Vector3,
  dir: THREE.Vector3,
  centre: THREE.Vector3,
  radius: number,
  reach: number,
): number {
  offset.subVectors(centre, from)
  const along = offset.dot(dir)
  if (along <= 0 || along - radius > reach) return Infinity
  const aside = Math.sqrt(Math.max(0, offset.lengthSq() - along * along))
  const miss = Math.max(0, aside - radius) / along
  return miss <= AIM_MARGIN ? miss : Infinity
}

/*
  Distance along a ray to where it goes through a portal's opening from the
  front, or Infinity.
*/
function rayPortal(from: THREE.Vector3, dir: THREE.Vector3, reach: number, portal: Portal): number {
  portal.toLocal(from, local)
  portal.toLocal(point.copy(from).addScaledVector(dir, reach), localEnd)
  if (local.z <= 0 || localEnd.z > 0) return Infinity
  const t = local.z / (local.z - localEnd.z)
  if (!portal.withinOpening(local.lerp(localEnd, t))) return Infinity
  return t * reach
}

/*
  Picking up, holding, dropping and throwing.

  Everything is worked out in map coordinates, the same space the player and
  the physics use. The aim ray and the held item both follow portals: you
  can pick an item up through a doorway, and an item held out through a
  doorway is drawn on the far side, at the far side's size.
*/
export class ItemSystem {
  private held: Item | null = null
  /* The doorway the held item is currently poking through, if any. */
  private heldThrough: Portal | null = null
  private target: Item | null = null
  private prompt: string | null = null
  /* Seconds Q has been held, or null when no throw is being charged. */
  private charging: number | null = null
  /* The player's scale last frame, to notice when a doorway resizes them. */
  private playerScale = 1
  private readonly abort = new AbortController()

  constructor(
    private readonly engine: Engine,
    private readonly events: ItemEvents,
  ) {
    for (const item of engine.world.items) {
      item.body.onTraverse = () => events.thrownThrough()
    }
    const signal = this.abort.signal
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.code === 'KeyE' && !event.repeat && engine.player.locked) this.use()
      },
      { signal },
    )
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.code === 'KeyQ' && !event.repeat && engine.player.locked) this.startCharge()
      },
      { signal },
    )
    window.addEventListener(
      'keyup',
      (event) => {
        if (event.code === 'KeyQ') this.throw()
      },
      { signal },
    )
  }

  dispose() {
    this.abort.abort()
  }

  /* E: pick up what the crosshair is on, or put down what is held. */
  use() {
    if (this.held) {
      this.cancelCharge()
      this.release(0)
    } else if (this.target) {
      this.held = this.target
      this.held.body.resting = true
      this.held.body.velocity.set(0, 0, 0)
    }
  }

  /* Q pressed: start winding up a throw. */
  startCharge() {
    if (this.held && this.charging === null) this.charging = 0
  }

  /* Q let go: throw, as hard as the wind-up was long. */
  throw() {
    if (this.charging === null) return
    const level = chargeLevel(this.charging)
    this.cancelCharge()
    if (this.held) this.release(throwSpeed(level))
  }

  private cancelCharge() {
    if (this.charging === null) return
    this.charging = null
    this.events.charge(null)
  }

  update(dt: number) {
    const { world, player } = this.engine
    player.eye(eye)
    player.look(look)

    // Whatever the player carries through a resizing door is resized with them.
    if (this.held && player.scale !== this.playerScale) {
      this.held.body.scale *= player.scale / this.playerScale
    }
    this.playerScale = player.scale

    for (const item of world.items) {
      if (item === this.held) continue
      const { body, mesh } = item
      if (!body.resting) {
        body.step(dt, world.colliders, world.portals)
        // Roll: turn about the axis at right angles to the direction of travel.
        const speed = Math.hypot(body.velocity.x, body.velocity.z)
        if (speed > 1e-4) {
          spin.crossVectors(UP, body.velocity).normalize()
          mesh.rotateOnWorldAxis(spin, (speed / body.radius) * dt)
        }
      }
      if (body.position.y < -40) {
        body.position.copy(item.home)
        body.velocity.set(0, 0, 0)
        body.scale = 1
        body.resting = false
      }
      mesh.position.copy(body.position)
      mesh.scale.setScalar(body.scale)
    }

    if (this.charging !== null) {
      // Losing the mouse or the item ends the wind-up without a throw.
      if (!this.held || !player.locked) {
        this.cancelCharge()
      } else {
        this.charging += dt
        this.events.charge(chargeLevel(this.charging))
      }
    }
    if (this.held) this.carry()
    this.target = this.held ? null : this.aim()
    this.setPrompt(this.held ? 'E  put down  ·  hold Q  throw' : this.target ? 'E  pick up' : null)
  }

  /* Keep the held item in front of the eye, short of walls, through doorways. */
  private carry() {
    const { world, player } = this.engine
    const { body, mesh } = this.held!
    hold.copy(eye).addScaledVector(look, HOLD_AHEAD * player.scale)
    hold.x += Math.cos(player.yaw) * HOLD_RIGHT * player.scale
    hold.z -= Math.sin(player.yaw) * HOLD_RIGHT * player.scale
    hold.y -= HOLD_BELOW * player.scale

    direction.subVectors(hold, eye)
    const length = direction.length()
    direction.divideScalar(length)

    this.heldThrough = null
    for (const portal of world.portals) {
      const size = body.radius * 2
      if (portal.fits(size, size) && rayPortal(eye, direction, length, portal) < Infinity) {
        this.heldThrough = portal
        break
      }
    }
    if (!this.heldThrough) {
      // Stop short of anything solid, leaving room for the item itself.
      let free = length
      for (const box of world.colliders) {
        free = Math.min(free, rayBox(eye, direction, box) - body.radius)
      }
      hold.copy(eye).addScaledVector(direction, Math.max(HOLD_MIN * player.scale, free))
    }

    body.position.copy(hold)
    body.yaw = player.yaw
    mesh.position.copy(hold)
    mesh.scale.setScalar(body.scale)
    mesh.rotation.set(0, player.yaw, 0)
    if (this.heldThrough) {
      const portal = this.heldThrough
      mesh.position.applyMatrix4(portal.transform)
      mesh.scale.multiplyScalar(portal.target.scale / portal.scale)
      mesh.rotation.y += yawDelta(portal.transform)
    }
  }

  /* Let go of the held item, moving away from the eye at `speed`. */
  private release(speed: number) {
    const { player } = this.engine
    const { body } = this.held!
    body.velocity.copy(player.velocity)
    if (speed > 0) {
      body.velocity.addScaledVector(look, speed * player.scale)
      body.velocity.y += THROW_LIFT * speed * player.scale
    }
    // If it was held out through a doorway, it is let go on the far side.
    if (this.heldThrough) body.through(this.heldThrough)
    body.resting = false
    this.held = null
    this.heldThrough = null
  }

  /* The item the crosshair is on and within reach, following portals. */
  private aim(): Item | null {
    const { world, player } = this.engine
    origin.copy(eye)
    direction.copy(look)
    let reach = REACH * player.scale
    // An item on this side of a doorway the crosshair is pointing into.
    let beside: Item | null = null

    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      // The item closest to the crosshair that nothing solid is in front of.
      let best = AIM_MARGIN
      let found: Item | null = null
      let foundAt = Infinity
      for (const item of world.items) {
        const { position, radius } = item.body
        const miss = aimMiss(origin, direction, position, radius, reach)
        if (miss > best) continue
        toItem.subVectors(position, origin)
        const distance = toItem.length()
        toItem.divideScalar(distance)
        let clear = true
        for (const box of world.colliders) {
          if (rayBox(origin, toItem, box) < distance - radius) {
            clear = false
            break
          }
        }
        if (!clear) continue
        best = miss
        found = item
        foundAt = distance
      }

      let wall = reach
      for (const box of world.colliders) wall = Math.min(wall, rayBox(origin, direction, box))
      let door: Portal | null = null
      let doorAt = wall
      for (const portal of world.portals) {
        const t = rayPortal(origin, direction, reach, portal)
        if (t < doorAt) {
          doorAt = t
          door = portal
        }
      }

      // An item nearer than the doorway wins. Otherwise look through the
      // doorway first, and come back to this one if nothing is there.
      if (found && (!door || foundAt <= doorAt)) return found
      if (!door) return beside
      beside ??= found
      origin.addScaledVector(direction, doorAt).applyMatrix4(door.transform)
      direction.transformDirection(door.transform)
      reach = (reach - doorAt) * (door.target.scale / door.scale)
    }
    return beside
  }

  private setPrompt(text: string | null) {
    if (text === this.prompt) return
    this.prompt = text
    this.events.prompt(text)
  }
}
