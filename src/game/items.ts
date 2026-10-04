import * as THREE from 'three'
import { GRAVITY } from '../engine/Body'
import type { Engine } from '../engine/Engine'
import {
  elsewhere,
  keepNearestSite,
  onPlanet,
  placedFrom,
  planetRadius,
  rechart,
  redirect,
  seenFrom,
  siteUniform,
  type Site,
} from '../engine/planet'
import type { Portal } from '../engine/Portal'
import { yawDelta } from '../engine/portalMath'
import { PortalItemView } from '../engine/PortalItemView'
import { sweepSphereBox } from '../engine/sweep'
import type { Item } from '../world/World'

/* How far the player can reach, per unit of their own scale. */
const REACH = 3
/* Where a held item floats: ahead of the eye, to the right of it and below it. */
const HOLD_AHEAD = 0.85
const HOLD_RIGHT = 0.34
const HOLD_BELOW = 0.3
/* Throw speed for the lightest tap and for a full charge, per unit of scale. */
const THROW_MIN = 3
const THROW_MAX = 21
/* Seconds of holding Q to reach a full charge. */
const CHARGE_TIME = 1.2
/*
  A throw is aimed from the hand at the point under the crosshair. That
  point is taken no nearer and no further than this, and at this distance
  when the crosshair is on nothing. All per unit of the player's scale.
*/
const TARGET_NEAR = 2
const TARGET_FAR = 30
const TARGET_OPEN = 12
/*
  A throw is tipped upwards to make up for the fall on the way to the
  target, but by no more than this share of its speed. Strong throws reach
  the crosshair; weak ones at far targets fall short.
*/
const MAX_LOB = 0.35
/* The aim ray may pass through this many portals. */
const MAX_HOPS = 3
/*
  Aiming is forgiving. An item can be picked up when the crosshair is within
  this angle of it (as a tangent: 0.14 is about 8 degrees), so the margin
  around an item grows with its distance and looks the same size on screen.
*/
const AIM_MARGIN = 0.14

/*
  The player's figure as items meet it: a cylinder as wide as the body and
  as tall as the top of the head, per unit of the player's scale. It is
  much shorter than the eye, which is why a held item, up by the eye, is
  clear of it.
*/
const FIGURE_RADIUS = 0.3
const FIGURE_HEIGHT = 1

/* How full the charge is, 0 to 1, after holding Q for this long. */
export function chargeLevel(heldSeconds: number): number {
  return Math.max(0, Math.min(1, heldSeconds / CHARGE_TIME))
}

/* How fast a throw leaves the hand for a charge level of 0 to 1. */
export function throwSpeed(level: number): number {
  return THROW_MIN + (THROW_MAX - THROW_MIN) * level
}

/*
  The velocity that sends something from the hand to a target point at
  `speed`, tipped up to allow for gravity pulling it down on the way.
*/
export function throwVelocity(
  hand: THREE.Vector3,
  target: THREE.Vector3,
  speed: number,
  gravity: number,
  out: THREE.Vector3,
  up: THREE.Vector3 = UP,
): THREE.Vector3 {
  out.subVectors(target, hand)
  const flight = out.length() / speed
  out.normalize().multiplyScalar(speed)
  return out.addScaledVector(up, Math.min(0.5 * gravity * flight, MAX_LOB * speed))
}

export interface ItemEvents {
  /* The hint to show under the crosshair, or null for none. */
  prompt(text: string | null): void
  /* How full the throw charge is, 0 to 1, or null when not charging. */
  charge(level: number | null): void
  /* A loose item went through a portal by itself. */
  thrownThrough(): void
  /* A loose item went all the way round the planet without stopping. */
  wentRound?(): void
  /* An item was picked up. */
  pickedUp?(): void
  /* The held item was let go; `level` is the throw's charge, or null if it was put down. */
  letGo?(level: number | null): void
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
const seen = new THREE.Vector3()
const charted = new THREE.Vector3()
const hand = new THREE.Vector3()
const mark = new THREE.Vector3()
const launch = new THREE.Vector3()
const sideways = new THREE.Vector3()
const spin = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const carryNormal = new THREE.Vector3()
const carryInverse = new THREE.Matrix4()
const beforePush = new THREE.Vector3()
const beforeOtherPush = new THREE.Vector3()

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

  Aiming and holding are worked out in a flat frame that is true around the
  player (see `seenFrom`), because that is what the player sees. The map
  the physics uses is stretched far from the pole, and aiming on it puts the
  ray somewhere other than the crosshair.

  The aim ray and the held item both follow portals: you can pick an item
  up through a doorway, and an item held out through a doorway is drawn on
  the far side, at the far side's size.
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
  private readonly crossings: PortalItemView[] = []
  /* Metres each loose item has gone over the planet since it was last still, held or through a door. */
  private readonly flown = new Map<Item, number>()

  constructor(
    private readonly engine: Pick<Engine, 'world' | 'player'>,
    private readonly events: ItemEvents,
    startingItem?: Item,
  ) {
    if (startingItem) this.pickUp(startingItem)

    for (const item of engine.world.items) {
      item.body.onTraverse = () => {
        this.flown.delete(item)
        events.thrownThrough()
      }
      item.mesh.userData.shadowCaster = true
      if (
        !item.mesh.userData.portalItemView &&
        item.mesh.material instanceof THREE.MeshStandardMaterial
      ) {
        this.crossings.push(
          new PortalItemView(
            item.mesh,
            item.mesh.material,
            item.body.baseRadius,
            engine.world.portals,
          ),
        )
      }
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
    for (const crossing of this.crossings) crossing.dispose()
  }

  /* E: pick up what the crosshair is on, or put down what is held. */
  use() {
    if (this.held) {
      this.cancelCharge()
      this.release(0)
      this.events.letGo?.(null)
    } else if (this.target) {
      this.pickUp(this.target)
    }
  }

  /*
    Count how far a loose item has gone over the planet. Nothing turns it, so
    once that is the whole way round, it is back where it was let go.
  */
  private lap(item: Item, dt: number) {
    const { body } = item
    const round = this.engine.world.planetSize
    if (!round || body.resting || !onPlanet(body.position)) {
      this.flown.delete(item)
      return
    }
    const before = this.flown.get(item) ?? 0
    const after = before + Math.hypot(body.velocity.x, body.velocity.z) * dt
    this.flown.set(item, after)
    if (before < round && after >= round) this.events.wentRound?.()
  }

  private pickUp(item: Item) {
    this.flown.delete(item)
    this.held = item
    item.body.resting = true
    item.body.velocity.set(0, 0, 0)
    this.events.pickedUp?.()
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
    if (this.held) {
      this.release(throwSpeed(level))
      this.events.letGo?.(level)
    }
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
        keepNearestSite(body, world.sites)
        this.lap(item, dt)
        // Roll: turn about the axis at right angles to the direction of travel.
        spin.crossVectors(body.up, body.velocity)
        const along = spin.length()
        if (along > 1e-4) {
          mesh.rotateOnWorldAxis(spin.divideScalar(along), (along / body.radius) * dt)
        }
      }
      // The figure is solid: thrown things bounce off it and it kicks what it walks into.
      if (body.site === player.site) {
        beforePush.copy(body.position)
        const pushed = body.hitCylinder(
          player.position,
          player.up,
          FIGURE_RADIUS * player.scale,
          FIGURE_HEIGHT * player.scale,
          player.velocity,
        )
        if (pushed) body.constrainPush(beforePush, world.colliders, world.portals)
      }
      if (body.position.y < -40) {
        body.position.copy(item.home)
        body.site = item.homeSite
        body.velocity.set(0, 0, 0)
        body.up.set(0, 1, 0)
        body.scale = 1
        body.resting = false
      }
    }

    // Loose items knock into each other.
    for (let i = 0; i < world.items.length; i++) {
      const a = world.items[i]
      if (a === this.held) continue
      for (let j = i + 1; j < world.items.length; j++) {
        const b = world.items[j]
        if (b === this.held || a.body.site !== b.body.site) continue
        if (a.body.up.dot(b.body.up) <= 0.9) continue
        beforePush.copy(a.body.position)
        beforeOtherPush.copy(b.body.position)

        if (a.body.hitBall(b.body)) {
          a.body.constrainPush(beforePush, world.colliders, world.portals)
          b.body.constrainPush(beforeOtherPush, world.colliders, world.portals)
        }
      }
    }

    // Draw positions after all contact corrections, not one frame behind them.
    for (const { body, mesh } of world.items) {
      mesh.position.copy(body.position)
      mesh.scale.setScalar(body.scale)
      siteUniform(mesh.material as THREE.Material).value = body.site.motion
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
    for (const crossing of this.crossings) crossing.update()
    this.target = this.held ? null : this.aim()
    this.setPrompt(this.held ? 'E  put down  ·  hold Q  throw' : this.target ? 'E  pick up' : null)
  }

  /* Keep the held item in front of the eye, short of walls, through doorways. */
  private carry() {
    const { world, player } = this.engine
    const { body, mesh } = this.held!
    hold.copy(eye).addScaledVector(look, HOLD_AHEAD * player.scale)
    hold.addScaledVector(player.right(sideways), HOLD_RIGHT * player.scale)
    hold.addScaledVector(player.up, -HOLD_BELOW * player.scale)
    // Collide in the same map coordinates as the solids and loose bodies.
    placedFrom(player.position, hold, hold)

    direction.subVectors(hold, eye)
    const length = direction.length()
    direction.divideScalar(length)

    this.heldThrough = null
    let doorwayAt = length
    for (const portal of world.portals) {
      if (portal.site !== player.site) continue
      const size = body.radius * 2
      const distance = rayPortal(eye, direction, length, portal)
      if (portal.fits(size, size) && distance < doorwayAt) {
        this.heldThrough = portal
        doorwayAt = distance
      }
    }

    this.stopHeldAtWalls(eye, hold, body.radius, player.site, this.heldThrough)
    if (eye.distanceTo(hold) < doorwayAt) this.heldThrough = null

    if (this.heldThrough) {
      const portal = this.heldThrough
      point.copy(eye).addScaledVector(direction, doorwayAt).applyMatrix4(portal.transform)
      seen.copy(hold).applyMatrix4(portal.transform)
      const radius = body.radius * (portal.target.scale / portal.scale)
      this.stopHeldAtWalls(point, seen, radius, portal.target.site, portal.target)
      hold.copy(seen).applyMatrix4(carryInverse.copy(portal.transform).invert())
    }

    // Throw aiming uses the local view frame; the held body stays on the map.
    seenFrom(player.position, hold, hand)
    body.position.copy(hold)
    body.site = player.site
    body.yaw = player.yaw
    body.up.copy(player.up)
    mesh.position.copy(hold)
    mesh.scale.setScalar(body.scale)
    mesh.rotation.set(0, player.yaw, 0)
    // Held out through a doorway, it is drawn at the far door's site.
    const drawnAt = this.heldThrough ? this.heldThrough.target.site : player.site
    siteUniform(mesh.material as THREE.Material).value = drawnAt.motion
    if (this.heldThrough) {
      const portal = this.heldThrough
      mesh.position.applyMatrix4(portal.transform)
      mesh.scale.multiplyScalar(portal.target.scale / portal.scale)
      mesh.rotation.y += yawDelta(portal.transform)
    }
  }

  /* Sweep the full sphere, including at an angle and beyond a doorway. */
  private stopHeldAtWalls(
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    site: Site,
    doorway: Portal | null,
  ) {
    let free = 1

    for (const box of this.engine.world.colliders) {
      if (elsewhere(box, site) || doorway?.ghostColliders.has(box)) continue
      free = Math.min(free, sweepSphereBox(from, to, radius, box, carryNormal))
    }

    if (free < 1) to.lerpVectors(from, to, Math.max(0, free - 1e-6))
  }

  /* Let go of the held item, moving away from the eye at `speed`. */
  private release(speed: number) {
    const { player } = this.engine
    const { body } = this.held!
    body.velocity.copy(player.velocity)
    if (speed > 0) {
      // Aim from the hand, which is off to one side, at whatever the
      // crosshair is on, so the throw goes where the player is looking.
      let distance = Infinity
      for (const box of this.engine.world.colliders) {
        if (elsewhere(box, player.site)) continue
        distance = Math.min(distance, rayBox(eye, look, box))
      }
      distance =
        distance === Infinity ? TARGET_OPEN : Math.max(TARGET_NEAR, Math.min(TARGET_FAR, distance))
      mark.copy(eye).addScaledVector(look, distance * player.scale)
      // Gravity on an item goes with its size; see Body. On the planet a fast
      // throw falls less, by its speed squared over the planet's radius.
      const fast = speed * player.scale
      const lift = onPlanet(player.position) ? (fast * fast) / (planetRadius() + hand.y) : 0
      const pull = Math.max(GRAVITY * body.scale - lift, 0.5)
      throwVelocity(hand, mark, fast, pull, launch, player.up)
      body.velocity.add(launch)
    }
    // The velocity was worked out where the player stands, not where the item is.
    redirect(player.position, body.position, body.velocity)
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
    // The site whose map the aim ray is on; a doorway can change it.
    let site = player.site
    // An item on this side of a doorway the crosshair is pointing into.
    let beside: Item | null = null

    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      // The item closest to the crosshair that nothing solid is in front of.
      let best = AIM_MARGIN
      let found: Item | null = null
      let foundAt = Infinity
      for (const item of world.items) {
        const { radius } = item.body
        // Where the item is as seen from here, which is what the crosshair is on.
        rechart(item.body.position, item.body.site, site, charted)
        const position = seenFrom(origin, charted, seen)
        const miss = aimMiss(origin, direction, position, radius, reach)
        if (miss > best) continue
        toItem.subVectors(position, origin)
        const distance = toItem.length()
        toItem.divideScalar(distance)
        let clear = true
        for (const box of world.colliders) {
          if (elsewhere(box, site)) continue
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
      for (const box of world.colliders) {
        if (!elsewhere(box, site)) wall = Math.min(wall, rayBox(origin, direction, box))
      }
      let door: Portal | null = null
      let doorAt = wall
      for (const portal of world.portals) {
        if (portal.site !== site) continue
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
      site = door.target.site
    }
    return beside
  }

  private setPrompt(text: string | null) {
    if (text === this.prompt) return
    this.prompt = text
    this.events.prompt(text)
  }
}
