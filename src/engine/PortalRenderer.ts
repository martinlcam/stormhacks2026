import * as THREE from 'three'
import {
  drawnBounds,
  materialAt,
  planetMaterial,
  planetUniforms,
  POLE,
  type Site,
  siteOf,
  siteUniform,
} from './planet'
import type { Portal } from './Portal'
import type { PortalLighting } from './PortalLighting'

/*
  A plane that keeps everything, so the clipping-plane count never changes
  between passes (changing it would recompile every shader).
*/
const NO_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6)

/* A rectangle on the screen, from -1 to 1 each way. */
interface Rect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const WHOLE_SCREEN: Rect = { minX: -1, minY: -1, maxX: 1, maxY: 1 }
/* Added round a doorway's rectangle, since a doorway on the planet is drawn slightly bent. */
const RECT_MARGIN = 0.02
const clipCorner = new THREE.Vector4()

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
  /* Direct illumination from the world's registered movable emitters. */
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
  /* Where on the screen each visible portal is, for each level. */
  private readonly rects: Map<Portal, Rect>[] = []
  private readonly flatLists: Portal[][] = []
  private readonly frustum = new THREE.Frustum()
  private readonly viewProjection = new THREE.Matrix4()
  private readonly eye = new THREE.Vector3()
  private readonly sphere = new THREE.Sphere()
  private readonly worldMaterials = new Set<THREE.Material>()
  /* Meshes whose materials have been pointed at their site. */
  private readonly sited = new WeakSet<THREE.Object3D>()
  /*
    Meshes that each view leaves out when they are not in it, and where each
    is drawn this frame. Three's own culling is off for the world, since it
    uses bounds from before the planet bends them.
  */
  private readonly cullable: THREE.Mesh[] = []
  private readonly bounds: THREE.Sphere[] = []
  private readonly origin = new THREE.Vector3()
  private readonly viewFrustum = new THREE.Frustum()
  private readonly windowMatrix = new THREE.Matrix4()
  private readonly size = new THREE.Vector2()
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
    // Nothing moves between passes, so place everything once rather than once a pass.
    scene.updateMatrixWorld()
    const autoUpdate = scene.matrixWorldAutoUpdate
    scene.matrixWorldAutoUpdate = false
    this.measure(scene)
    this.renderer.setScissorTest(false)
    this.renderer.clear(true, true, true)

    try {
      this.renderLevel(scene, camera, 0, null, up, this.maxPasses, 0, WHOLE_SCREEN)
    } finally {
      scene.matrixWorldAutoUpdate = autoUpdate
      this.renderer.setScissorTest(false)
      for (const mesh of this.cullable) mesh.visible = true
    }
  }

  private renderLevel(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    level: number,
    exit: Portal | null,
    up: THREE.Vector3,
    /* How many times this view and everything seen through it may draw the world. */
    allowance: number,
    /* How many doors this view looks through. Seams are not doors. */
    doors: number,
    /* The part of the screen this view is seen in: the doorway it is looked at through. */
    window: Rect,
  ) {
    const clip = exit ? exit.spacePlane : NO_CLIP
    const visible = this.findVisible(camera, level, exit, window)
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
        this.scissor(window)
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
        this.renderLevel(
          scene,
          virtual,
          level + 1,
          portal.target,
          virtualUp,
          childAllowance,
          doors + (portal.seamless ? 0 : 1),
          this.rects[level].get(portal)!,
        )

        // 3. unmark
        this.scissor(window)
        this.clipPlane.copy(clip)
        this.maskMaterial.stencilRef = level + 1
        this.maskMaterial.stencilZPass = THREE.DecrementStencilOp
        this.drawPortals([portal], this.maskMaterial, camera)
      }
    }

    // 4. seal
    this.scissor(window)
    this.clipPlane.copy(clip)
    this.renderer.state.buffers.depth.setMask(true)
    this.renderer.clearDepth()
    this.drawPortals(visible, this.sealMaterial, camera)

    // 5. world
    for (const material of this.worldMaterials) material.stencilRef = level
    planetUniforms.uSkyUp.value.copy(up)
    this.portalLighting?.prepareCamera(camera)
    this.beforePass?.(doors)
    this.cull(camera, window, clip)
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

  /* Draw only inside this part of the screen. */
  private scissor(rect: Rect) {
    if (rect === WHOLE_SCREEN) {
      this.renderer.setScissorTest(false)
      return
    }

    const { x: width, y: height } = this.renderer.getSize(this.size)
    const left = Math.floor(((rect.minX + 1) / 2) * width)
    const bottom = Math.floor(((rect.minY + 1) / 2) * height)
    const right = Math.ceil(((rect.maxX + 1) / 2) * width)
    const top = Math.ceil(((rect.maxY + 1) / 2) * height)
    this.renderer.setScissor(left, bottom, right - left, top - bottom)
    this.renderer.setScissorTest(true)
  }

  /*
    Find the meshes that can be left out of a view, and where each is drawn.
    Always drawn are meshes with others attached, rigid things, which keep
    their shape as they go round the planet, and anything with its own shader.
  */
  private measure(scene: THREE.Scene) {
    this.cullable.length = 0
    scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || mesh.children.length > 0) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        if ((material as THREE.ShaderMaterial).isShaderMaterial || material.userData.rigid) return
      }

      const geometry = mesh.geometry
      if (!geometry.boundingSphere) geometry.computeBoundingSphere()
      const i = this.cullable.length
      const sphere = (this.bounds[i] ??= new THREE.Sphere())
      sphere.copy(geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld)
      this.origin.setFromMatrixPosition(mesh.matrixWorld)
      drawnBounds(sphere, this.origin, siteUniform(materials[0]).value)
      this.cullable.push(mesh)
    })
  }

  /*
    Show only the meshes this view can see: those in front of the camera,
    inside the doorway it looks through and on the near side of its exit.
  */
  private cull(camera: THREE.PerspectiveCamera, window: Rect, clip: THREE.Plane) {
    // Stretch the doorway's rectangle to the whole screen, so the frustum ends at its edges.
    const scaleX = 2 / (window.maxX - window.minX)
    const scaleY = 2 / (window.maxY - window.minY)
    const middleX = (window.minX + window.maxX) / 2
    const middleY = (window.minY + window.maxY) / 2
    this.windowMatrix
      .makeScale(scaleX, scaleY, 1)
      .setPosition(-scaleX * middleX, -scaleY * middleY, 0)
    this.viewProjection
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .premultiply(this.windowMatrix)
    this.viewFrustum.setFromProjectionMatrix(this.viewProjection)

    for (let i = 0; i < this.cullable.length; i++) {
      const sphere = this.bounds[i]
      this.cullable[i].visible =
        clip.distanceToPoint(sphere.center) >= -sphere.radius &&
        this.viewFrustum.intersectsSphere(sphere)
    }
  }

  /*
    Portals this camera faces and has in view, farthest first so nearer
    portals paint over farther ones where they overlap on screen.
  */
  private findVisible(
    camera: THREE.PerspectiveCamera,
    level: number,
    exit: Portal | null,
    window: Rect,
  ) {
    const list = (this.visibleLists[level] ??= [])
    list.length = 0
    const rects = (this.rects[level] ??= new Map())
    rects.clear()
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.viewProjection)
    const eye = this.eye.setFromMatrixPosition(camera.matrixWorld)
    for (const portal of this.portals) {
      if (portal === exit) continue
      if (portal.spacePlane.distanceToPoint(eye) <= 0) continue
      this.sphere.center.copy(portal.spaceCenter)
      this.sphere.radius = portal.radius
      if (!this.frustum.intersectsSphere(this.sphere)) continue
      // A view through a doorway shows only what is behind that doorway on
      // the screen. A portal elsewhere in the camera's view is not in it.
      const rect = this.onScreen(portal, window)
      if (!rect) continue
      rects.set(portal, rect)
      list.push(portal)
    }
    const at = eye.clone()
    list.sort((a, b) => b.spaceCenter.distanceToSquared(at) - a.spaceCenter.distanceToSquared(at))
    return list
  }

  /*
    The part of `window` that a portal's opening covers on the screen, or
    null if it covers none of it. Uses `viewProjection`, set by `findVisible`.
  */
  private onScreen(portal: Portal, window: Rect): Rect | null {
    const rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    for (const corner of portal.spaceCorners) {
      clipCorner.set(corner.x, corner.y, corner.z, 1).applyMatrix4(this.viewProjection)
      // A corner beside or behind the eye has no place on the screen; the
      // opening may then cover any of it.
      if (clipCorner.w < 1e-3) return window
      rect.minX = Math.min(rect.minX, clipCorner.x / clipCorner.w)
      rect.maxX = Math.max(rect.maxX, clipCorner.x / clipCorner.w)
      rect.minY = Math.min(rect.minY, clipCorner.y / clipCorner.w)
      rect.maxY = Math.max(rect.maxY, clipCorner.y / clipCorner.w)
    }
    rect.minX = Math.max(window.minX, rect.minX - RECT_MARGIN)
    rect.maxX = Math.min(window.maxX, rect.maxX + RECT_MARGIN)
    rect.minY = Math.max(window.minY, rect.minY - RECT_MARGIN)
    rect.maxY = Math.min(window.maxY, rect.maxY + RECT_MARGIN)
    return rect.minX < rect.maxX && rect.minY < rect.maxY ? rect : null
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
