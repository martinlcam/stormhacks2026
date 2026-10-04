import * as THREE from 'three'
import { materialAt, planetMaterial, planetUniforms, POLE, type Site, siteOf } from './planet'
import type { Portal } from './Portal'
import type { PortalLighting } from './PortalLighting'

/*
  A plane that keeps everything, so the clipping-plane count never changes
  between passes (changing it would recompile every shader).
*/
const NO_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6)

/*
  Objects on this layer are left out of the player's own view and drawn only
  in views through portals: the parts of the player that surround the eye.
*/
export const PORTAL_ONLY_LAYER = 1

/*
  Draws a scene containing portals using the stencil buffer.

  For a camera at recursion level L (0 = the player's eye) the stencil value
  L marks "pixels this level owns". For each portal the camera can see:

    1. mark    draw the portal surface, stencil L → L+1, no colour or depth
    2. inside  draw the world again from a virtual camera (the real camera
               carried through the portal), restricted to stencil L+1; this
               step recurses for portals visible through the portal
    3. unmark  draw the surface again, stencil L+1 → L

  then, once every portal's interior is painted:

    4. seal    clear depth and write only the portal surfaces' depth, so the
               world behind a portal cannot paint over its interior while
               anything in front of it still can
    5. world   draw the scene where stencil = L

  Each virtual view is clipped at the destination portal's plane so the wall
  behind the exit never blocks the view.

  Portals on the planet are drawn where the vertex shader puts them, so all
  the tests and camera transforms here use each portal's place in space
  (`spacePlane`, `spaceCenter`, `view`), not its place on the flat map.
*/
export class PortalRenderer {
  /* Portals seen through portals seen through portals… */
  maxDepth = 4
  /*
    The most times the world may be drawn in one frame. A room full of doors
    that all see each other would otherwise multiply without limit; once
    the budget is spent, further doorways are painted a flat colour.
  */
  maxPasses = 24
  /* What a portal looks like once the recursion budget runs out. */
  readonly depthLimitColor = new THREE.Color(0x120a1c)
  /*
    Called before the world is drawn for each view, with how many doors
    the view looks through: 0 for the player's own.
  */
  beforePass?: (doors: number) => void
  /* Scene passes drawn last frame, for the debug HUD. */
  passes = 0
  /* Optional point-light transport; the normal game has no registered emitters yet. */
  portalLighting?: PortalLighting

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
  private readonly ups: THREE.Vector3[] = []
  private readonly visibleLists: Portal[][] = []
  private readonly flatLists: Portal[][] = []
  private readonly frustum = new THREE.Frustum()
  private readonly viewProjection = new THREE.Matrix4()
  private readonly eye = new THREE.Vector3()
  private readonly sphere = new THREE.Sphere()
  private readonly worldMaterials = new Set<THREE.Material>()
  /* Meshes whose materials have been pointed at their site. */
  private readonly sited = new WeakSet<THREE.Object3D>()
  private portals: readonly Portal[] = []

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    renderer.localClippingEnabled = true
    renderer.autoClear = false
    renderer.clippingPlanes = [this.clipPlane]
    this.limitMaterial.color.copy(this.depthLimitColor)
    for (const material of [this.maskMaterial, this.sealMaterial, this.limitMaterial]) {
      planetMaterial(material)
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

  /* `up` is which way is up for the camera, in space; the sky follows it. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, up: THREE.Vector3) {
    this.passes = 0
    this.portalLighting?.update()
    this.collectMaterials(scene)
    this.renderer.clear(true, true, true)
    this.renderLevel(scene, camera, 0, null, up, this.maxPasses)
  }

  private renderLevel(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    level: number,
    exit: Portal | null,
    up: THREE.Vector3,
    /* How many times this view and everything seen through it may draw the world. */
    allowance: number,
  ) {
    const clip = exit ? exit.spacePlane : NO_CLIP
    const visible = this.findVisible(camera, level, exit)
    // Doorways that are not looked through: out of depth or out of budget.
    const flat = (this.flatLists[level] ??= [])
    flat.length = 0

    // This view takes one pass. What is left is shared between the nearest
    // doorways, as many as it stretches to; the far ones go flat. `visible`
    // is farthest first and must be drawn in that order.
    const spare = allowance - 1
    const looked = level < this.maxDepth ? Math.min(visible.length, spare) : 0
    const firstLooked = visible.length - looked
    const share = looked > 0 ? Math.floor(spare / looked) : 0

    for (let i = 0; i < visible.length; i++) {
      const portal = visible[i]
      if (i < firstLooked) {
        flat.push(portal)
        continue
      }
      // The nearest doorway also gets whatever does not divide evenly.
      const childAllowance = share + (i === visible.length - 1 ? spare - share * looked : 0)
      {
        // 1. mark
        this.clipPlane.copy(clip)
        this.maskMaterial.stencilRef = level
        this.maskMaterial.stencilFunc = THREE.EqualStencilFunc
        this.maskMaterial.stencilZPass = THREE.IncrementStencilOp
        this.drawPortals([portal], this.maskMaterial, camera)

        // 2. inside
        const virtual = this.cameraFor(level, camera)
        virtual.matrixWorld.multiplyMatrices(portal.view, camera.matrixWorld)
        virtual.matrixWorld.decompose(virtual.position, virtual.quaternion, virtual.scale)
        virtual.updateMatrixWorld(true)
        const virtualUp = (this.ups[level] ??= new THREE.Vector3())
        virtualUp.copy(up).transformDirection(portal.view)
        this.renderLevel(scene, virtual, level + 1, portal.target, virtualUp, childAllowance)

        // 3. unmark
        this.clipPlane.copy(clip)
        this.maskMaterial.stencilRef = level + 1
        this.maskMaterial.stencilZPass = THREE.DecrementStencilOp
        this.drawPortals([portal], this.maskMaterial, camera)
      }
    }

    // 4. seal
    this.clipPlane.copy(clip)
    this.renderer.state.buffers.depth.setMask(true)
    this.renderer.clearDepth()
    this.drawPortals(visible, this.sealMaterial, camera)

    // 5. world
    for (const material of this.worldMaterials) material.stencilRef = level
    planetUniforms.uSkyUp.value.copy(up)
    this.portalLighting?.prepareCamera(camera)
    this.beforePass?.(level)
    this.renderer.render(scene, camera)
    this.passes++

    if (flat.length > 0) {
      this.limitMaterial.stencilRef = level
      this.drawPortals(flat, this.limitMaterial, camera)
    }
  }

  private drawPortals(portals: readonly Portal[], material: THREE.Material, camera: THREE.Camera) {
    for (const portal of portals) {
      // The stencil settings change between draws; the copy for a site must keep up.
      const sited = materialAt(material, portal.site)
      if (sited !== material) {
        sited.stencilRef = material.stencilRef
        sited.stencilFunc = material.stencilFunc
        sited.stencilZPass = material.stencilZPass
      }
      portal.mesh.material = sited
      portal.mesh.visible = true
    }
    this.renderer.render(this.portalScene, camera)
    for (const portal of portals) portal.mesh.visible = false
  }

  /*
    Portals this camera faces and has in view, farthest first so nearer
    portals paint over farther ones where they overlap on screen.
  */
  private findVisible(camera: THREE.PerspectiveCamera, level: number, exit: Portal | null) {
    const list = (this.visibleLists[level] ??= [])
    list.length = 0
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.viewProjection)
    const eye = this.eye.setFromMatrixPosition(camera.matrixWorld)
    for (const portal of this.portals) {
      if (portal === exit) continue
      if (portal.spacePlane.distanceToPoint(eye) <= 0) continue
      this.sphere.center.copy(portal.spaceCenter)
      this.sphere.radius = portal.radius
      if (!this.frustum.intersectsSphere(this.sphere)) continue
      list.push(portal)
    }
    const at = eye.clone()
    list.sort((a, b) => b.spaceCenter.distanceToSquared(at) - a.spaceCenter.distanceToSquared(at))
    return list
  }

  /* The site of a mesh: its own, or that of the nearest group above it that has one. */
  private siteAbove(object: THREE.Object3D): Site {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      const site = siteOf(o)
      if (site) return site
    }
    return POLE
  }

  private cameraFor(level: number, source: THREE.PerspectiveCamera) {
    let camera = this.cameras[level]
    if (!camera) {
      camera = this.cameras[level] = new THREE.PerspectiveCamera()
      camera.layers.enable(PORTAL_ONLY_LAYER)
    }
    camera.projectionMatrix.copy(source.projectionMatrix)
    camera.projectionMatrixInverse.copy(source.projectionMatrixInverse)
    return camera
  }

  /*
    Every world material has to honour the stencil mask. Done per frame so
    structures can add meshes at any time without registering them.
  */
  private collectMaterials(scene: THREE.Scene) {
    this.worldMaterials.clear()
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.material) return
      if (!this.sited.has(mesh)) {
        // Draw the mesh where its site is. Meshes can arrive late, so look every frame.
        this.sited.add(mesh)
        const site = this.siteAbove(mesh)
        if (site !== POLE) {
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map((m) => materialAt(m, site))
            : materialAt(mesh.material, site)
        }
      }
      const material = mesh.material
      for (const m of Array.isArray(material) ? material : [material]) {
        if (!this.worldMaterials.has(m)) {
          planetMaterial(m)
          this.portalLighting?.apply(m)
          m.stencilWrite = true
          m.stencilFunc = THREE.EqualStencilFunc
          this.worldMaterials.add(m)
        }
      }
    })
  }
}
