import * as THREE from 'three'
import { apparentMotion, bendMaterial, curvatureAt, setBend } from './bend'
import type { Portal } from './Portal'

/** A plane that keeps everything, so the clipping-plane count never changes
 *  between passes (changing it would recompile every shader). */
const NO_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6)

/**
 * Draws a scene containing portals using the stencil buffer.
 *
 * For a camera at recursion level L (0 = the player's eye) the stencil value
 * L marks "pixels this level owns". For each portal the camera can see:
 *
 *   1. mark    draw the portal surface, stencil L → L+1, no colour or depth
 *   2. inside  draw the world again from a virtual camera (the real camera
 *              carried through the portal), restricted to stencil L+1; this
 *              step recurses for portals visible through the portal
 *   3. unmark  draw the surface again, stencil L+1 → L
 *
 * then, once every portal's interior is painted:
 *
 *   4. seal    clear depth and write only the portal surfaces' depth, so the
 *              world behind a portal cannot paint over its interior while
 *              anything in front of it still can
 *   5. world   draw the scene where stencil = L
 *
 * Each virtual view is clipped at the destination portal's plane so the wall
 * behind the exit never blocks the view.
 *
 * Curvature: every pass is drawn bent around a centre (see bend.ts). The
 * player's own view is centred on the player. A view through a portal is
 * centred on the far door, so the far side is undistorted where it meets the
 * doorway, and the virtual camera is moved by the inverse of the bend's
 * motion at the near door, so the two sides line up.
 */
export class PortalRenderer {
  /** Portals seen through portals seen through portals… */
  maxDepth = 4
  /** What a portal looks like once the recursion budget runs out. */
  readonly depthLimitColor = new THREE.Color(0x120a1c)
  /** Scene passes drawn last frame, for the debug HUD. */
  passes = 0

  private readonly clipPlane = NO_CLIP.clone()
  private readonly portalScene = new THREE.Scene()
  private readonly maskMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    stencilWrite: true,
  })
  private readonly sealMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    side: THREE.DoubleSide,
  })
  private readonly limitMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    fog: false,
    stencilWrite: true,
    stencilFunc: THREE.EqualStencilFunc,
  })
  private readonly cameras: THREE.PerspectiveCamera[] = []
  private readonly visibleLists: Portal[][] = []
  private readonly frustum = new THREE.Frustum()
  private readonly viewProjection = new THREE.Matrix4()
  private readonly eye = new THREE.Vector3()
  private readonly point = new THREE.Vector3()
  private readonly sphere = new THREE.Sphere()
  private readonly scratch = new THREE.Matrix4()
  /** Per recursion level, per portal: how bending moves that doorway. */
  private readonly motions: THREE.Matrix4[][] = []
  private readonly worldMaterials = new Set<THREE.Material>()
  private portals: readonly Portal[] = []

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    renderer.autoClear = false
    renderer.clippingPlanes = [this.clipPlane]
    this.limitMaterial.color.copy(this.depthLimitColor)
    for (const material of [this.maskMaterial, this.sealMaterial, this.limitMaterial]) {
      bendMaterial(material)
    }
  }

  setPortals(portals: readonly Portal[]) {
    this.portalScene.clear()
    this.portals = portals
    for (const portal of portals) {
      portal.mesh.visible = false
      this.portalScene.add(portal.mesh)
    }
  }

  /** `centre` is the point the world is bent around: the player's feet. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, centre: THREE.Vector3) {
    this.passes = 0
    this.collectMaterials(scene)
    this.renderer.clear(true, true, true)
    this.renderLevel(scene, camera, 0, null, centre, curvatureAt(centre))
  }

  private renderLevel(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    level: number,
    exit: Portal | null,
    centre: THREE.Vector3,
    k: number,
  ) {
    const clip = exit ? exit.plane : NO_CLIP
    const visible = this.findVisible(camera, level, exit, centre, k)
    const motions = this.motions[level]

    if (level < this.maxDepth) {
      for (const portal of visible) {
        // 1. mark
        this.clipPlane.copy(clip)
        setBend(centre, k)
        this.maskMaterial.stencilRef = level
        this.maskMaterial.stencilFunc = THREE.EqualStencilFunc
        this.maskMaterial.stencilZPass = THREE.IncrementStencilOp
        this.drawPortals([portal], this.maskMaterial, camera)

        // 2. inside
        const virtual = this.cameraFor(level, camera)
        const unbend = this.scratch.copy(motions[this.portals.indexOf(portal)]).invert()
        virtual.matrixWorld.multiplyMatrices(portal.transform, unbend).multiply(camera.matrixWorld)
        virtual.matrixWorld.decompose(virtual.position, virtual.quaternion, virtual.scale)
        virtual.updateMatrixWorld(true)
        const far = portal.target.mesh.position
        this.renderLevel(scene, virtual, level + 1, portal.target, far, curvatureAt(far))

        // 3. unmark
        this.clipPlane.copy(clip)
        setBend(centre, k)
        this.maskMaterial.stencilRef = level + 1
        this.maskMaterial.stencilZPass = THREE.DecrementStencilOp
        this.drawPortals([portal], this.maskMaterial, camera)
      }
    }

    // 4. seal
    this.clipPlane.copy(clip)
    setBend(centre, k)
    this.renderer.state.buffers.depth.setMask(true)
    this.renderer.clearDepth()
    if (level < this.maxDepth) {
      this.drawPortals(visible, this.sealMaterial, camera)
    }

    // 5. world
    for (const material of this.worldMaterials) material.stencilRef = level
    this.renderer.render(scene, camera)
    this.passes++

    if (level >= this.maxDepth && visible.length > 0) {
      // Out of recursion budget: paint remaining portals a flat colour.
      this.limitMaterial.stencilRef = level
      this.drawPortals(visible, this.limitMaterial, camera)
    }
  }

  private drawPortals(portals: readonly Portal[], material: THREE.Material, camera: THREE.Camera) {
    for (const portal of portals) {
      portal.mesh.material = material
      portal.mesh.visible = true
    }
    this.renderer.render(this.portalScene, camera)
    for (const portal of portals) portal.mesh.visible = false
  }

  /** Portals this camera faces and has in view, farthest first so nearer
   *  portals paint over farther ones where they overlap on screen. */
  private findVisible(
    camera: THREE.PerspectiveCamera,
    level: number,
    exit: Portal | null,
    centre: THREE.Vector3,
    k: number,
  ) {
    const list = (this.visibleLists[level] ??= [])
    list.length = 0
    const motions = (this.motions[level] ??= [])
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.viewProjection)
    const eye = this.eye.setFromMatrixPosition(camera.matrixWorld)
    const distance = new Map<Portal, number>()
    for (let i = 0; i < this.portals.length; i++) {
      const portal = this.portals[i]
      // Test against the doorway where bending puts it, not where it is stored.
      const motion = apparentMotion(
        portal.mesh.position,
        centre,
        k,
        (motions[i] ??= new THREE.Matrix4()),
      )
      if (portal === exit) continue
      this.scratch.copy(motion).invert()
      if (portal.plane.distanceToPoint(this.point.copy(eye).applyMatrix4(this.scratch)) <= 0)
        continue
      this.sphere.center.copy(portal.center).applyMatrix4(motion)
      this.sphere.radius = portal.radius
      if (!this.frustum.intersectsSphere(this.sphere)) continue
      distance.set(portal, this.sphere.center.distanceToSquared(eye))
      list.push(portal)
    }
    list.sort((a, b) => distance.get(b)! - distance.get(a)!)
    return list
  }

  private cameraFor(level: number, source: THREE.PerspectiveCamera) {
    const camera = (this.cameras[level] ??= new THREE.PerspectiveCamera())
    camera.projectionMatrix.copy(source.projectionMatrix)
    camera.projectionMatrixInverse.copy(source.projectionMatrixInverse)
    return camera
  }

  /** Every world material has to honour the stencil mask. Done per frame so
   *  structures can add meshes at any time without registering them. */
  private collectMaterials(scene: THREE.Scene) {
    this.worldMaterials.clear()
    scene.traverse((object) => {
      const material = (object as THREE.Mesh).material
      if (!material) return
      for (const m of Array.isArray(material) ? material : [material]) {
        if (!this.worldMaterials.has(m)) {
          bendMaterial(m)
          m.stencilWrite = true
          m.stencilFunc = THREE.EqualStencilFunc
          this.worldMaterials.add(m)
        }
      }
    })
  }
}
