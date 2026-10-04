import * as THREE from 'three'
import { Body } from '../engine/Body'
import { type Axis, frameFor } from '../engine/gravity'
import { assign, POLE, type Site } from '../engine/planet'
import { Portal } from '../engine/Portal'
import {
  overgrowth,
  PLANK_TILE,
  plankMaterial,
  wallGrowth,
  WOOD_TILE,
  woodMaterial,
} from './foliage'
import type { Sky } from './materials'

type Vec3 = readonly [number, number, number]

/*
  Lay a box's texture out by size: one copy every `metres`, with the image's
  vertical running along the longer side of each face, so the grain of a
  beam follows the beam.

  BoxGeometry lists its faces as +x, -x, +y, -y, +z, -z, and each face's UVs
  run 0 to 1 across (u) and up (v).
*/
function tileBox(geometry: THREE.BoxGeometry, size: Vec3, metres: number, grain = true) {
  const [width, height, depth] = size
  const { widthSegments, heightSegments, depthSegments } = geometry.parameters
  const faces: [number, number, number][] = [
    [depth, height, (depthSegments + 1) * (heightSegments + 1)],
    [depth, height, (depthSegments + 1) * (heightSegments + 1)],
    [width, depth, (widthSegments + 1) * (depthSegments + 1)],
    [width, depth, (widthSegments + 1) * (depthSegments + 1)],
    [width, height, (widthSegments + 1) * (heightSegments + 1)],
    [width, height, (widthSegments + 1) * (heightSegments + 1)],
  ]
  const uv = geometry.getAttribute('uv')
  let index = 0
  for (const [across, up, count] of faces) {
    for (let i = 0; i < count; i++, index++) {
      const u = (uv.getX(index) * across) / metres
      const v = (uv.getY(index) * up) / metres
      if (grain && across > up) uv.setXY(index, v, u)
      else uv.setXY(index, u, v)
    }
  }
}

/* Longest box edge, in metres, drawn without extra vertices. */
const SEGMENT = 2

export interface BoxOptions {
  size: Vec3
  /* Centre of the box. */
  position: Vec3
  /* Not needed for an overgrown box, which is planks. */
  material?: THREE.Material
  /* Solid to the player. Defaults to true. */
  collide?: boolean
  /*
    Repeat the material's texture every this many metres, with its grain
    along the box's length, instead of stretching one copy over each face.
  */
  tile?: number
  /* With `tile`: keep the image upright on every side, as for masonry, whatever the box's shape. */
  upright?: boolean
  /*
    An old plank wall with ivy climbing it and plants at its foot. Takes the
    place of `material`. For upright boxes that stand on the ground.
  */
  overgrown?: boolean
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
  /* What the frame is made of. Not needed for an overgrown door, which is timber. */
  frameMaterial?: THREE.Material
  /* An old timber frame with ivy over it and ferns at its foot. */
  overgrown?: boolean
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
  homeSite: Site
}

/* A self-contained piece of the sandbox. One file per impossible structure. */
export interface Structure {
  name: string
  /*
    Where on the planet the structure stands. Its coordinates are then on
    that site's own map, measured from the site's middle. Keep what is built
    within about 12 m of the middle, and sites at least 40 m apart. Defaults
    to the pole.
  */
  site?: Site
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
  /* The sky, if the world has one. Every door leads to a different one. */
  sky?: Sky
  /* Every site something is built on. */
  readonly sites: Site[] = [POLE]
  /* The site of the structure being built. */
  private site = POLE
  /*
    Circumference of the planet that the plaza around the origin is drawn
    as, or null for a flat world.
  */
  planetSize: number | null = null
  private readonly updaters: Updater[] = []
  private readonly triggers: {
    box: THREE.Box3
    site: Site
    inside: boolean
    onEnter: () => void
    onLeave?: () => void
  }[] = []

  /* Build a structure at its site. */
  build(structure: Structure) {
    this.site = structure.site ?? POLE
    if (!this.sites.includes(this.site)) this.sites.push(this.site)
    structure.build(this)
    this.site = POLE
  }

  private solid(box: THREE.Box3) {
    assign(box, this.site)
    this.colliders.push(box)
  }

  /* The site of the structure being built. */
  get building(): Site {
    return this.site
  }

  /* Draw something that is not a box, at the site of the structure being built. */
  add(object: THREE.Object3D) {
    object.traverse((part) => {
      // The stored bounds are not where a mesh on the planet is drawn.
      part.frustumCulled = false
    })
    assign(object, this.site)
    this.scene.add(object)
  }

  addBox({
    size,
    position,
    collide = true,
    tile,
    upright,
    overgrown,
    ...rest
  }: BoxOptions): THREE.Mesh {
    const material = overgrown ? plankMaterial() : rest.material
    if (!material) throw new Error('A box needs a material')
    // Bending moves vertices, so long faces need enough of them to curve.
    // Vertical edges stay straight when bent and need no extra vertices.
    const segments = (length: number) => Math.max(1, Math.ceil(length / SEGMENT))
    const geometry = new THREE.BoxGeometry(...size, segments(size[0]), 1, segments(size[2]))
    if (overgrown) tileBox(geometry, size, PLANK_TILE, false)
    else if (tile) tileBox(geometry, size, tile, !upright)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    // The stored bounds are not where a bent mesh is drawn.
    mesh.frustumCulled = false
    assign(mesh, this.site)
    this.scene.add(mesh)
    if (collide) this.solid(new THREE.Box3().setFromObject(mesh))
    if (overgrown) {
      // Named by where it is, so that each wall grows its own way.
      const growth = wallGrowth(`${this.site.name}/${position.join(',')}`, size)
      growth.position.set(position[0], position[1] - size[1] / 2, position[2])
      assign(growth, this.site)
      this.scene.add(growth)
    }
    return mesh
  }

  /* A gem the player can pick up. It collides and rolls as a ball. */
  addItem({ position, radius = 0.18, material }: ItemOptions): Item {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), material)
    // An item can be carried right round the planet; it keeps its shape there.
    material.userData.rigid = true
    // And carries a little film grain wherever it is.
    material.userData.item = true
    mesh.frustumCulled = false
    this.scene.add(mesh)
    const body = new Body(radius)
    body.position.set(...position)
    body.site = this.site
    mesh.position.copy(body.position)
    const item = { body, mesh, home: body.position.clone(), homeSite: this.site }
    this.items.push(item)
    return item
  }

  /*
    Something solid with nothing to draw. `everywhere` makes it solid on
    every site's map, as the ground is.
  */
  addCollider(min: Vec3, max: Vec3, everywhere = false): THREE.Box3 {
    const box = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))
    if (everywhere) this.colliders.push(box)
    else this.solid(box)
    return box
  }

  /*
    A doorway with a portal in it: two jambs and a lintel around the opening.
    The portal goes nowhere until it is passed to `link`.
  */
  addDoor(options: DoorOptions): Portal {
    const { position, facing, width = 1.2, height = 2.2, scale = 1, overgrown = false } = options
    const frameMaterial = overgrown ? woodMaterial() : options.frameMaterial
    if (!frameMaterial) throw new Error(`Door "${options.name}" needs a frameMaterial`)
    const up = options.up ?? 'y+'
    const yaw = (facing * Math.PI) / 2
    // Door-local → world. It is always a quarter-turn rotation, so a box
    // that is axis-aligned in the door's frame is axis-aligned in the world.
    const rotation = new THREE.Matrix4().makeRotationY(yaw).premultiply(frameFor(up))
    const corner = new THREE.Vector3()

    // Place an axis-aligned box given in the door's local frame.
    const local = (size: Vec3, at: Vec3, material: THREE.Material, tile?: number) => {
      corner.set(...size).applyMatrix4(rotation)
      const centre = new THREE.Vector3(...at).multiplyScalar(scale).applyMatrix4(rotation)
      return this.addBox({
        size: [Math.abs(corner.x) * scale, Math.abs(corner.y) * scale, Math.abs(corner.z) * scale],
        position: [position[0] + centre.x, position[1] + centre.y, position[2] + centre.z],
        material,
        tile,
      })
    }

    const post = 0.15
    // The whole frame sits just behind the portal plane. Nothing may reach
    // the plane or stick out in front of it: the view through a portal keeps
    // everything in front of the far door's plane, so a lip there shows up
    // inside the doorway as a second frame peeling off the first.
    const depth = 0.15
    const z = -depth / 2 - 0.005
    const tile = overgrown ? WOOD_TILE * scale : undefined
    const side = (width + post) / 2
    local([post, height + post, depth], [-side, (height + post) / 2, z], frameMaterial, tile)
    local([post, height + post, depth], [side, (height + post) / 2, z], frameMaterial, tile)
    local([width, post, depth], [0, height + post / 2, z], frameMaterial, tile)
    if (options.backing) {
      const slab = local(
        [width + post * 2, height + post, 0.4],
        [0, (height + post) / 2, -0.3],
        options.backing,
      )
      // An old door that stands on the ground is set in old boards, with ivy round the back.
      if (overgrown && up === 'y+') {
        this.scene.remove(slab)
        const { width: w, height: h, depth: d } = (slab.geometry as THREE.BoxGeometry).parameters
        this.addBox({
          size: [w, h, d],
          position: slab.position.toArray(),
          overgrown: true,
          collide: false,
        })
      }
    }

    const portal = new Portal({
      name: options.name,
      position: new THREE.Vector3(...position),
      yaw,
      up,
      width,
      height,
      scale,
      site: this.site,
    })
    if (overgrown) {
      const growth = overgrowth({ name: options.name, width, height, post })
      growth.position.set(...position)
      growth.quaternion.setFromRotationMatrix(rotation)
      growth.scale.setScalar(scale)
      assign(growth, this.site)
      this.scene.add(growth)
    }
    this.portals.push(portal)
    return portal
  }

  /*
    A timber roof over walls whose tops are at `top`: three slabs, each
    smaller than the one under it, the lowest overhanging the walls.
  */
  addRoof(centre: readonly [number, number], top: number, width: number, depth: number) {
    const thick = 0.16
    for (const [layer, share] of [1.25, 0.85, 0.45].entries()) {
      this.addBox({
        size: [width * share, thick, depth * share],
        position: [centre[0], top + thick * (layer + 0.5), centre[1]],
        material: woodMaterial(),
        tile: WOOD_TILE,
      })
    }
  }

  /*
    A bare opening with no frame round it, such as a seam across a shaft.
    `position`, `facing` and `up` are as for a door.
  */
  addPortal(options: {
    name: string
    position: Vec3
    facing: 0 | 1 | 2 | 3
    up?: Axis
    width: number
    height: number
    seamless?: boolean
  }): Portal {
    const portal = new Portal({
      ...options,
      position: new THREE.Vector3(...options.position),
      yaw: (options.facing * Math.PI) / 2,
      site: this.site,
    })
    this.portals.push(portal)
    return portal
  }

  /* Join two doors so that walking into one comes out of the other. */
  link(a: Portal, b: Portal) {
    a.link(b)
    b.link(a)
  }

  /*
    Run `onEnter` each time the player's feet move into the box, and
    `onLeave` each time they move out of it.
  */
  addTrigger(min: Vec3, max: Vec3, onEnter: () => void, onLeave?: () => void) {
    const box = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))
    this.triggers.push({ box, site: this.site, inside: false, onEnter, onLeave })
  }

  checkTriggers(player: THREE.Vector3, site: Site = POLE) {
    for (const trigger of this.triggers) {
      const inside = trigger.site === site && trigger.box.containsPoint(player)
      if (inside && !trigger.inside) trigger.onEnter()
      if (!inside && trigger.inside) trigger.onLeave?.()
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
