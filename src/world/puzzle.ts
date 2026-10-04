import * as THREE from 'three'
import { type Axis, frameFor, upVector } from '../engine/gravity'
import { glow, matte } from './materials'
import type { Item, World } from './World'

type Vec3 = readonly [number, number, number]

/* What a puzzle tells the game. Structures only ever talk to this, never the store. */
export interface PuzzleEvents {
  /* The goal to show while the player is at the puzzle, or null once they leave. */
  hint(text: string | null): void
  solved(): void
}

/* The colour a share `t`, 0 to 1, of the way along a row of colours. */
export function ramp(stops: readonly number[], t: number): number {
  if (stops.length === 1) return stops[0]
  const at = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(at))
  return new THREE.Color(stops[i]).lerp(new THREE.Color(stops[i + 1]), at - i).getHex()
}

/* The same colour, darker: `share` of its brightness. */
export function shade(colour: number, share: number): number {
  return new THREE.Color(colour).multiplyScalar(share).getHex()
}

/*
  How strongly a glowing mesh glows. Read the material off the mesh each
  time: a mesh away from the pole is given its site's copy of the material.
*/
export function shine(mesh: THREE.Mesh, intensity: number) {
  ;(mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity
}

/* How brightly a socket's rim glows: waiting, ready to take a gem, and holding one. */
const WAITING = 0.25
const READY = 1
const FILLED = 2.6

export interface SocketOptions {
  /* The middle of the socket, on the surface it lies on. */
  position: Vec3
  /* Which way is up for a gem resting in it. Defaults to 'y+'. */
  up?: Axis
  /* How wide the socket is, in metres. */
  width?: number
  /* The size of gem it takes: 1 is a gem as found, 0.25 one shrunk by a door. */
  size?: number
  colour: number
  /* The gems it takes. */
  items: readonly Item[]
}

export interface Socket {
  /* The gem resting in the socket, if there is one of the right size, the right way up. */
  holds(): Item | null
  /* Light the rim: 'filled', 'ready' or 'waiting'. */
  show(state: 'filled' | 'ready' | 'waiting'): void
}

const offset = new THREE.Vector3()

/*
  A plate with a lit rim that a gem can be put down on. It is drawn only:
  the gem rests on whatever surface the plate lies on.
*/
export function addSocket(world: World, options: SocketOptions): Socket {
  const { position, up = 'y+', width = 0.9, size = 1, colour, items } = options
  const site = world.building
  const frame = frameFor(up)
  const upward = upVector(up).clone()
  const centre = new THREE.Vector3(...position)
  const corner = new THREE.Vector3()

  // Place an axis-aligned box given in the socket's own frame, where up is +y.
  const local = (box: Vec3, at: Vec3, material: THREE.Material) => {
    corner.set(...box).applyMatrix4(frame)
    const boxSize: Vec3 = [Math.abs(corner.x), Math.abs(corner.y), Math.abs(corner.z)]
    corner.set(...at).applyMatrix4(frame)
    return world.addBox({
      size: boxSize,
      position: [position[0] + corner.x, position[1] + corner.y, position[2] + corner.z],
      material,
      collide: false,
    })
  }

  const thick = Math.min(0.03, width * 0.04)
  const edge = width * 0.08
  const rim = glow(colour, WAITING)
  local([width, thick, width], [0, thick / 2, 0], matte(shade(colour, 0.12)))
  const reach = (width - edge) / 2
  const rims = [
    local([width, thick * 2, edge], [0, thick, reach], rim),
    local([width, thick * 2, edge], [0, thick, -reach], rim),
    local([edge, thick * 2, width], [reach, thick, 0], rim),
    local([edge, thick * 2, width], [-reach, thick, 0], rim),
  ]

  return {
    holds() {
      for (const item of items) {
        const { body } = item
        if (body.site !== site || body.up.dot(upward) < 0.9) continue
        if (Math.abs(body.scale / size - 1) > 0.1) continue
        offset.subVectors(body.position, centre)
        const rise = offset.dot(upward)
        const aside = Math.sqrt(Math.max(0, offset.lengthSq() - rise * rise))
        if (aside > width / 2 || rise < 0 || rise > body.radius * 2.5) continue
        // Still rolling through is not resting.
        if (body.velocity.length() > 0.5 * body.scale) continue
        return item
      }
      return null
    },
    show(state) {
      const level = state === 'filled' ? FILLED : state === 'ready' ? READY : WAITING
      for (const mesh of rims) shine(mesh, level)
    },
  }
}

/*
  A column of blocks coloured along `stops`, bottom to top. It is dim until
  the puzzle it stands by is solved. `position` is the middle of its foot.
  Returns the function that lights it.
*/
export function addBeacon(
  world: World,
  position: Vec3,
  stops: readonly number[],
  height = 2.4,
  solid = true,
): (lit: boolean) => void {
  const count = 8
  const step = height / count
  const blocks = Array.from({ length: count }, (_, i) =>
    world.addBox({
      size: [0.3, step - 0.05, 0.3],
      position: [position[0], position[1] + step * (i + 0.5), position[2]],
      material: glow(ramp(stops, i / (count - 1)), 0.12),
      collide: false,
    }),
  )
  if (solid) {
    world.addCollider(
      [position[0] - 0.15, position[1], position[2] - 0.15],
      [position[0] + 0.15, position[1] + height, position[2] + 0.15],
    )
  }
  return (lit) => {
    for (const block of blocks) shine(block, lit ? 2.2 : 0.12)
  }
}

/*
  Show a puzzle's goal for as long as the player is in any of the boxes.
  Returns a function to call when the words of the goal have changed.
*/
export function addRegion(
  world: World,
  boxes: readonly (readonly [Vec3, Vec3])[],
  events: PuzzleEvents,
  goal: () => string,
): () => void {
  // Counted, because the player can step from one box straight into the next.
  let inside = 0
  for (const [min, max] of boxes) {
    world.addTrigger(
      min,
      max,
      () => {
        inside++
        events.hint(goal())
      },
      () => {
        if (--inside === 0) events.hint(null)
      },
    )
  }
  return () => {
    if (inside > 0) events.hint(goal())
  }
}
