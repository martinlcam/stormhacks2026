import * as THREE from 'three'
import type { World } from '../world/World'
import { configurePlanet, keepNearestSite, onPlanet, upAt } from './planet'
import { PlayerController } from './PlayerController'
import { PortalRenderer } from './PortalRenderer'

export interface FrameStats {
  fps: number
  /* How many times the world was drawn this frame (1 + portal views). */
  passes: number
  /* The player's size relative to normal: 0.25 is a quarter height. */
  scale: number
}

/*
  Distance to the camera's near plane, for a player of scale 1. Its furthest
  corner, at a 75° field of view, is about 1.9 times this away on a 16:9
  screen and 3 times on a 32:9 one, and that must stay inside
  PORTAL_THICKNESS.
*/
const NEAR = 0.03

/* Owns the canvas, the frame loop, the player and the portal renderer. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly camera = new THREE.PerspectiveCamera(75, 1, NEAR, 150)
  readonly player: PlayerController
  readonly portalRenderer: PortalRenderer
  /* Reported about twice a second. */
  onStats?: (stats: FrameStats) => void

  private readonly timer = new THREE.Timer()
  private readonly up = new THREE.Vector3()
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
    // The view through a door shows the sky that is under it on the far side.
    this.portalRenderer.beforePass = (doors) =>
      world.sky?.show(this.player.doors + doors, world.scene.fog)
    configurePlanet(world.planetSize)
    for (const portal of world.portals) portal.settle()
    this.player = new PlayerController(canvas)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  start() {
    this.running = true
    this.renderer.setAnimationLoop(() => this.frame())
  }

  /* Stop drawing until `start` is called again, for a game built ahead of being shown. */
  pause() {
    this.renderer.setAnimationLoop(null)
  }

  dispose() {
    this.running = false
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.player.dispose()
    this.renderer.dispose()
  }

  /* Advance and draw one frame. Public so tests and tools can step by hand. */
  frame(dt?: number) {
    this.timer.update()
    dt ??= Math.min(this.timer.getDelta(), 0.05)
    if (this.player.locked || !this.running) {
      this.player.update(dt, this.world.colliders, this.world.portals)
      keepNearestSite(this.player, this.world.sites)
    }
    this.world.checkTriggers(this.player.position, this.player.site)
    this.world.update(dt, this.timer.getElapsed())
    this.player.applyTo(this.camera)
    // On the planet up depends on where you stand; elsewhere on which
    // surface the player is walking on.
    const up = onPlanet(this.player.position)
      ? upAt(this.player.position, this.up).applyQuaternion(this.player.site.rotation)
      : this.player.up
    this.portalRenderer.render(this.world.scene, this.camera, up)

    this.frames++
    this.statsTime += dt
    if (this.statsTime >= 0.5) {
      this.onStats?.({
        fps: Math.round(this.frames / this.statsTime),
        passes: this.portalRenderer.passes,
        scale: this.player.scale,
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
