import * as THREE from 'three'
import { Portal } from '../engine/Portal'

type Vec3 = readonly [number, number, number]

export interface BoxOptions {
  size: Vec3
  /** Centre of the box. */
  position: Vec3
  material: THREE.Material
  /** Solid to the player. Defaults to true. */
  collide?: boolean
}

export interface DoorOptions {
  name: string
  /** Bottom centre of the opening. */
  position: Vec3
  /** Which way the front faces, in quarter turns: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X. */
  facing: 0 | 1 | 2 | 3
  width?: number
  height?: number
  frameMaterial: THREE.Material
  /** Build a slab behind the opening, for doors that stand in the open. */
  backing?: THREE.Material
}

/** A self-contained piece of the sandbox. One file per impossible structure. */
export interface Structure {
  name: string
  build(world: World): void
}

export type Updater = (dt: number, time: number) => void

/**
 * The sandbox as data: meshes to draw, boxes to collide with, portals linking
 * places together. Structures only ever talk to this class, never the engine.
 * Everything solid is an axis-aligned box.
 */
export class World {
  readonly scene = new THREE.Scene()
  readonly colliders: THREE.Box3[] = []
  readonly portals: Portal[] = []
  private readonly updaters: Updater[] = []

  addBox({ size, position, material, collide = true }: BoxOptions): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...position)
    this.scene.add(mesh)
    if (collide) this.colliders.push(new THREE.Box3().setFromObject(mesh))
    return mesh
  }

  /**
   * A doorway with a portal in it: two jambs and a lintel around the opening.
   * The portal goes nowhere until it is passed to `link`.
   */
  addDoor(options: DoorOptions): Portal {
    const { position, facing, width = 1.2, height = 2.2, frameMaterial } = options
    const yaw = (facing * Math.PI) / 2
    const cos = Math.round(Math.cos(yaw))
    const sin = Math.round(Math.sin(yaw))
    const sideways = facing % 2 === 1

    // Place an axis-aligned box given in the door's local frame.
    const local = (size: Vec3, at: Vec3, material: THREE.Material) =>
      this.addBox({
        size: sideways ? [size[2], size[1], size[0]] : size,
        position: [
          position[0] + at[0] * cos + at[2] * sin,
          position[1] + at[1],
          position[2] - at[0] * sin + at[2] * cos,
        ],
        material,
      })

    const post = 0.15
    // The frame straddles the portal plane: mostly behind, a lip in front.
    const depth = 0.15
    const z = -0.025
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
      width,
      height,
    })
    this.portals.push(portal)
    return portal
  }

  /** Join two doors so that walking into one comes out of the other. */
  link(a: Portal, b: Portal) {
    a.link(b)
    b.link(a)
  }

  onUpdate(updater: Updater) {
    this.updaters.push(updater)
  }

  update(dt: number, time: number) {
    for (const updater of this.updaters) updater(dt, time)
  }

  /** Call once after every structure is built. */
  finalize() {
    for (const portal of this.portals) {
      if (!portal.target) throw new Error(`Portal "${portal.name}" was never linked`)
      portal.computeGhostColliders(this.colliders)
    }
  }
}
