import * as THREE from 'three'
import type { World } from '../world/World'
import { PlayerController } from './PlayerController'
import { PortalRenderer } from './PortalRenderer'

export interface FrameStats {
  fps: number
  /** How many times the world was drawn this frame (1 + portal views). */
  passes: number
}

/** Owns the canvas, the frame loop, the player and the portal renderer. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 150)
  readonly player: PlayerController
  readonly portalRenderer: PortalRenderer
  /** Reported about twice a second. */
  onStats?: (stats: FrameStats) => void

  private readonly timer = new THREE.Timer()
  private readonly resizeObserver: ResizeObserver
  private frames = 0
  private statsTime = 0
  private running = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly world: World,
  ) {
    // Portals are drawn with the stencil buffer, which is off by default.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.portalRenderer = new PortalRenderer(this.renderer)
    this.portalRenderer.setPortals(world.portals)
    this.player = new PlayerController(canvas)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  start() {
    this.running = true
    this.renderer.setAnimationLoop(() => this.frame())
  }

  dispose() {
    this.running = false
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.player.dispose()
    this.renderer.dispose()
  }

  /** Advance and draw one frame. Public so tests and tools can step by hand. */
  frame(dt?: number) {
    this.timer.update()
    dt ??= Math.min(this.timer.getDelta(), 0.05)
    if (this.player.locked || !this.running) {
      this.player.update(dt, this.world.colliders, this.world.portals)
    }
    this.world.update(dt, this.timer.getElapsed())
    this.player.applyTo(this.camera)
    this.portalRenderer.render(this.world.scene, this.camera)

    this.frames++
    this.statsTime += dt
    if (this.statsTime >= 0.5) {
      this.onStats?.({
        fps: Math.round(this.frames / this.statsTime),
        passes: this.portalRenderer.passes,
      })
      this.frames = 0
      this.statsTime = 0
    }
  }

  private resize() {
    const { clientWidth, clientHeight } = this.canvas
    if (clientWidth === 0 || clientHeight === 0) return
    this.renderer.setSize(clientWidth, clientHeight, false)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
  }
}
