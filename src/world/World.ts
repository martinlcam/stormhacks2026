import * as THREE from 'three'
import { Body } from '../engine/Body'
import { type Axis, frameFor } from '../engine/gravity'
import { Portal } from '../engine/Portal'

type Vec3 = readonly [number, number, number]

/* Longest box edge, in metres, drawn without extra vertices. */
const SEGMENT = 2

export interface BoxOptions {
  size: Vec3
  /* Centre of the box. */
  position: Vec3
  material: THREE.Material
  /* Solid to the player. Defaults to true. */
  collide?: boolean
}

export interface DoorOptions {
  name: string
  /* Bottom centre of the opening. */
  position: Vec3
  /*
    Which way the front faces, in quarter turns about the door's up. For an
    upright door: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X.
  */
  facing: 0 | 1 | 2 | 3
  /*
    Which way is up for the door. Anything but the default 'y+' stands the
    door on a wall or the ceiling, and whoever comes out of it stands there too.
  */
  up?: Axis
  width?: number
  height?: number
  /* Shrinks or grows the whole door, frame included. Defaults to 1. */
  scale?: number
  frameMaterial: THREE.Material
  /* Build a slab behind the opening, for doors that stand in the open. */
  backing?: THREE.Material
}

export interface ItemOptions {
  /* Where the item starts, and returns to if it is lost. Centre of the item. */
  position: Vec3
  radius?: number
  material: THREE.Material
}

/* Something the player can pick up, carry and throw. */
export interface Item {
  body: Body
  mesh: THREE.Mesh
  home: THREE.Vector3
}

/* A self-contained piece of the sandbox. One file per impossible structure. */
export interface Structure {
  name: string
  build(world: World): void
}

export type Updater = (dt: number, time: number) => void

/*
  The sandbox as data: meshes to draw, boxes to collide with, portals linking
  places together. Structures only ever talk to this class, never the engine.
  Everything solid is an axis-aligned box.
*/
export class World {
  readonly scene = new THREE.Scene()
  readonly colliders: THREE.Box3[] = []
  readonly portals: Portal[] = []
  readonly items: Item[] = []
  /*
    Circumference of the planet that the plaza around the origin is drawn
    as, or null for a flat world.
  */
  planetSize: number | null = null
  private readonly updaters: Updater[] = []
  private readonly triggers: { box: THREE.Box3; inside: boolean; onEnter: () => void }[] = []

  addBox({ size, position, material, collide = true }: BoxOptions): THREE.Mesh {
    // Bending moves vertices, so long faces need enough of them to curve.
    // Vertical edges stay straight when bent and need no extra vertices.
    const segments = (length: number) => Math.max(1, Math.ceil(length / SEGMENT))
    const geometry = new THREE.BoxGeometry(...size, segments(size[0]), 1, segments(size[2]))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    // The stored bounds are not where a bent mesh is drawn.
    mesh.frustumCulled = false
    this.scene.add(mesh)
    if (collide) this.colliders.push(new THREE.Box3().setFromObject(mesh))
    return mesh
  }

  /* A gem the player can pick up. It collides and rolls as a ball. */
  addItem({ position, radius = 0.18, material }: ItemOptions): Item {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    const body = new Body(radius)
    body.position.set(...position)
    mesh.position.copy(body.position)
    const item = { body, mesh, home: body.position.clone() }
    this.items.push(item)
    return item
  }

  /* Something solid with nothing to draw. */
  addCollider(min: Vec3, max: Vec3) {
    this.colliders.push(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)))
  }

  /*
    A doorway with a portal in it: two jambs and a lintel around the opening.
    The portal goes nowhere until it is passed to `link`.
  */
  addDoor(options: DoorOptions): Portal {
    const { position, facing, width = 1.2, height = 2.2, scale = 1, frameMaterial } = options
    const up = options.up ?? 'y+'
    const yaw = (facing * Math.PI) / 2
    // Door-local → world. It is always a quarter-turn rotation, so a box
    // that is axis-aligned in the door's frame is axis-aligned in the world.
    const rotation = new THREE.Matrix4().makeRotationY(yaw).premultiply(frameFor(up))
    const corner = new THREE.Vector3()

    // Place an axis-aligned box given in the door's local frame.
    const local = (size: Vec3, at: Vec3, material: THREE.Material) => {
      corner.set(...size).applyMatrix4(rotation)
      const centre = new THREE.Vector3(...at).multiplyScalar(scale).applyMatrix4(rotation)
      return this.addBox({
        size: [Math.abs(corner.x) * scale, Math.abs(corner.y) * scale, Math.abs(corner.z) * scale],
        position: [position[0] + centre.x, position[1] + centre.y, position[2] + centre.z],
        material,
      })
    }

    const post = 0.15
    // The whole frame sits just behind the portal plane. Nothing may reach
    // the plane or stick out in front of it: the view through a portal keeps
    // everything in front of the far door's plane, so a lip there shows up
    // inside the doorway as a second frame peeling off the first.
    const depth = 0.15
    const z = -depth / 2 - 0.005
    local(
      [post, height + post, depth],
      [-(width + post) / 2, (height + post) / 2, z],
      frameMaterial,
    )
    local([post, height + post, depth], [(width + post) / 2, (height + post) / 2, z], frameMaterial)
    local([width, post, depth], [0, height + post / 2, z], frameMaterial)
    if (options.backing) {
      local([width + post * 2, height + post, 0.4], [0, (height + post) / 2, -0.3], options.backing)
    }

    const portal = new Portal({
      name: options.name,
      position: new THREE.Vector3(...position),
      yaw,
      up,
      width,
      height,
      scale,
    })
    this.portals.push(portal)
    return portal
  }

  /* Join two doors so that walking into one comes out of the other. */
  link(a: Portal, b: Portal) {
    a.link(b)
    b.link(a)
  }

  /* Run `onEnter` each time the player's feet move into the box. */
  addTrigger(min: Vec3, max: Vec3, onEnter: () => void) {
    const box = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))
    this.triggers.push({ box, inside: false, onEnter })
  }

  checkTriggers(player: THREE.Vector3) {
    for (const trigger of this.triggers) {
      const inside = trigger.box.containsPoint(player)
      if (inside && !trigger.inside) trigger.onEnter()
      trigger.inside = inside
    }
  }

  onUpdate(updater: Updater) {
    this.updaters.push(updater)
  }

  update(dt: number, time: number) {
    for (const updater of this.updaters) updater(dt, time)
  }

  /* Call once after every structure is built. */
  finalize() {
    for (const portal of this.portals) {
      if (!portal.target) throw new Error(`Portal "${portal.name}" was never linked`)
      portal.computeGhostColliders(this.colliders)
    }
  }
}
