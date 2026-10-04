import * as THREE from 'three'
import { type Axis, frameFor } from './gravity'
import { elsewhere, onPlanet, planetMotion, POLE, type Site } from './planet'
import { portalTransform } from './portalMath'

/*
  How far the portal surface extends behind its plane. The surface is a box
  rather than a quad so that when the camera's near plane pokes through the
  opening (the frame before a teleport) the box's inner walls still cover the
  screen and nothing flickers.

  It is bounded on both sides. It must be deeper than the furthest corner of
  the camera's near plane (see NEAR in Engine.ts), or that corner comes out
  of the back. And it must be shallower than BACKING_GAP: once the near
  plane has cut away the front of the box, its back is what hides the wall
  behind the door, so the back has to be in front of that wall. When it was
  deeper, the wall covered the whole screen for the last few centimetres
  before every crossing, which showed as a dark flicker.
*/
export const PORTAL_THICKNESS = 0.095

/*
  The least distance from a portal's plane back to anything solid behind it:
  the slab or wall the door is mounted on.
*/
export const BACKING_GAP = 0.1

export interface PortalOptions {
  name: string
  /* Bottom centre of the opening, world space. */
  position: THREE.Vector3
  /*
    Rotation about the door's own up; yaw 0 means the front faces +Z (for an
    upright door: world +Z).
  */
  yaw: number
  /* Which way is up for the door. Defaults to 'y+', an ordinary upright door. */
  up?: Axis
  /* Size of the opening before `scale` is applied. */
  width: number
  height: number
  /*
    Uniform size multiplier. Linking portals of different scale makes a
    doorway that resizes whatever passes through it.
  */
  scale?: number
  /* The site whose map `position` is on. Defaults to the pole. */
  site?: Site
}

const corner = new THREE.Vector3()
const scratch = new THREE.Matrix4()
const turn = new THREE.Quaternion()
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const local = new THREE.Vector3()

export class Portal {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly site: Site
  /* Stencil/depth surface. Never added to the world scene. */
  readonly mesh: THREE.Mesh
  /* World plane of the opening, normal pointing out of the front. */
  readonly plane = new THREE.Plane()
  /* Which way is up for the door, in world coordinates. */
  readonly up = new THREE.Vector3()
  readonly worldBounds = new THREE.Box3()
  readonly center = new THREE.Vector3()
  /*
    Where the opening really is in space. For a portal on the planet this is
    its place on the sphere; for a portal in a flat room it equals `plane`
    and `center`. Set by `settle`.
  */
  readonly spacePlane = new THREE.Plane()
  readonly spaceCenter = new THREE.Vector3()
  /* Rendered world → opening frame, including the site's placement. */
  readonly spaceInverse = new THREE.Matrix4()
  /* Carries a camera in space through this portal to the target's side. */
  readonly view = new THREE.Matrix4()
  private readonly motion = new THREE.Matrix4()
  /* Radius of a sphere around `center` that contains the whole opening. */
  readonly radius: number
  /* Carries the world through this portal to its target's side. */
  readonly transform = new THREE.Matrix4()
  readonly worldInverse = new THREE.Matrix4()
  /*
    Colliders sitting directly behind the opening (the wall the portal is
    mounted on). Ignored while the player stands in the doorway, otherwise
    their body would hit the wall before their centre reaches the plane.
  */
  readonly ghostColliders = new Set<THREE.Box3>()
  target!: Portal
  /* Called after the player has been carried through this portal. */
  onTraverse?: () => void

  constructor(options: PortalOptions) {
    this.name = options.name
    this.width = options.width
    this.height = options.height
    this.scale = options.scale ?? 1
    this.site = options.site ?? POLE
    this.radius = (Math.hypot(options.width, options.height) / 2 + PORTAL_THICKNESS) * this.scale

    const geometry = new THREE.BoxGeometry(options.width, options.height, PORTAL_THICKNESS)
    geometry.translate(0, options.height / 2, -PORTAL_THICKNESS / 2)
    this.mesh = new THREE.Mesh(geometry)
    this.mesh.position.copy(options.position)
    this.mesh.quaternion
      .setFromRotationMatrix(frameFor(options.up ?? 'y+'))
      .multiply(turn.setFromAxisAngle(Y_AXIS, options.yaw))
    this.mesh.scale.setScalar(this.scale)
    // On the planet the mesh is drawn away from its stored bounds, and the
    // portal renderer already decides which portals are in view.
    this.mesh.frustumCulled = false
    this.mesh.updateMatrixWorld(true)

    this.worldInverse.copy(this.mesh.matrixWorld).invert()
    this.up.set(0, 1, 0).transformDirection(this.mesh.matrixWorld)
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.mesh.matrixWorld)
    this.plane.setFromNormalAndCoplanarPoint(normal, options.position)
    this.worldBounds.setFromObject(this.mesh)
    this.center.set(0, options.height / 2, 0).applyMatrix4(this.mesh.matrixWorld)
  }

  /*
    Work out where this portal and its target stand in space. Call for every
    portal once they are all linked and the planet is configured.
  */
  settle() {
    this.place(this.motion)
    this.spaceInverse.copy(this.motion).invert().premultiply(this.worldInverse)
    this.spacePlane.copy(this.plane).applyMatrix4(this.motion)
    this.spaceCenter.copy(this.center).applyMatrix4(this.motion)
    // Undo this door's motion, cross on the flat map, apply the far door's.
    const far = this.target.place(this.view)
    this.view.copy(far).multiply(this.transform).multiply(scratch.copy(this.motion).invert())
  }

  /* From where this door is on its site's map to where it stands in space. */
  private place(out: THREE.Matrix4): THREE.Matrix4 {
    planetMotion(this.mesh.position, out)
    if (onPlanet(this.mesh.position)) out.premultiply(this.site.motion)
    return out
  }

  link(target: Portal) {
    this.target = target
    portalTransform(this.mesh.matrixWorld, target.mesh.matrixWorld, this.transform)
  }

  /*
    World point → this portal's local frame (opening in XY, front is +Z).
    Local lengths are in units of the portal's own scale.
  */
  toLocal(world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(world).applyMatrix4(this.worldInverse)
  }

  /* True when a local-space point is inside the opening's footprint. */
  withinOpening(p: THREE.Vector3, margin = 0): boolean {
    return Math.abs(p.x) <= this.width / 2 - margin && p.y >= -0.6 && p.y <= this.height
  }

  /* Can a body this wide and tall (world units) pass through the opening? */
  fits(diameter: number, height: number): boolean {
    return diameter <= this.width * this.scale && height <= this.height * this.scale
  }

  /* True while a point stands in the doorway, just in front of the plane. */
  inDoorway(world: THREE.Vector3): boolean {
    this.toLocal(world, local)
    return local.z >= -0.05 && local.z < 1 && this.withinOpening(local)
  }

  /* Work out which colliders are the wall behind this opening. */
  computeGhostColliders(colliders: readonly THREE.Box3[]) {
    this.ghostColliders.clear()
    for (const box of colliders) {
      if (elsewhere(box, this.site)) continue
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (let i = 0; i < 8; i++) {
        corner.set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        )
        this.toLocal(corner, corner)
        minX = Math.min(minX, corner.x)
        maxX = Math.max(maxX, corner.x)
        minY = Math.min(minY, corner.y)
        maxY = Math.max(maxY, corner.y)
        minZ = Math.min(minZ, corner.z)
        maxZ = Math.max(maxZ, corner.z)
      }
      const behind = maxZ <= 0.01 && maxZ >= -1.5
      const half = this.width / 2 - 0.01
      const coversOpening = minX < half && maxX > -half && minY < this.height - 0.01 && maxY > 0.05
      if (behind && coversOpening) this.ghostColliders.add(box)
    }
  }
}
