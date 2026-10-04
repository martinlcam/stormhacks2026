import { Engine } from '../engine/Engine'
import { PortalLighting } from '../engine/PortalLighting'
import { World } from '../world/World'
import { buildLightingLab } from '../world/lightingLab'
import { addWorldLamp } from '../world/lamp'
import { biggerInside } from '../world/structures/biggerInside'
import { gravityRoom } from '../world/structures/gravityRoom'
import { hub } from '../world/structures/hub'
import { loopCorridor } from '../world/structures/loopCorridor'
import { resizingDoors } from '../world/structures/resizingDoors'
import { sculpture } from '../world/structures/sculpture'
import { stairwell } from '../world/structures/stairwell'
import { Avatar } from './avatar'
import { ItemSystem } from './items'
import type { LightingScene, LightingView } from './lightingScenes'
import { useLightingSettings } from './lightingSettings'
import { Sound } from './sound'
import { useGame } from './store'

/*
  Build the sandbox, start the engine and wire both to the store.
  Returns a function that tears everything down again.
*/
export function bootstrap(
  canvas: HTMLCanvasElement,
  lightingScene?: LightingScene,
  lightingView: LightingView = 'default',
): () => void {
  const game = useGame.getState()

  const world = new World()
  const lightingLab = lightingScene
    ? buildLightingLab(world, lightingScene, lightingView)
    : undefined

  if (!lightingScene) {
    // Add a structure here and it is part of the sandbox.
    const structures = [
      hub,
      biggerInside(() => game.discover('bigger-inside')),
      loopCorridor(() => game.discover('loop-corridor')),
      gravityRoom(
        () => game.discover('walls-are-floors'),
        () => game.discover('on-the-ceiling'),
      ),
      resizingDoors(
        () => game.discover('resizing-door'),
        () => game.discover('small-world'),
      ),
      sculpture(() => game.discover('hypercube')),
      stairwell(() => game.discover('endless-stairwell')),
    ]

    for (const structure of structures) world.build(structure)
  }

  const worldLamp = lightingLab ? undefined : addWorldLamp(world)
  world.finalize()

  const engine = new Engine(canvas, world)
  const spawn = lightingLab ? lightingLab.spawn : ([0, 0, 2] as const)
  engine.player.spawn.fromArray(spawn)
  engine.player.respawn()
  const sound = new Sound()
  engine.player.onLockChange = (locked) => {
    game.setPlaying(locked)
    // The click that captures the mouse is what lets the browser play sound.
    if (locked) sound.start()
  }
  const stopListening = useGame.subscribe((now, before) => {
    if (now.found.length > before.found.length) sound.chime()
  })
  const keys = new AbortController()
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat || !engine.player.locked) return
      // R: back to the start. M: sound off or on.
      if (event.code === 'KeyR') engine.player.respawn()
      if (event.code === 'KeyM') sound.toggle()
    },
    { signal: keys.signal },
  )
  engine.onStats = ({ fps, passes, scale }) => game.setStats(fps, passes, scale)

  const lights = lightingLab?.lights ?? worldLamp!.lights
  engine.portalRenderer.portalLighting = new PortalLighting(lights, world.portals)

  const items = new ItemSystem(
    engine,
    {
      prompt: (text) => game.setPrompt(text),
      charge: (level) => game.setCharge(level),
      thrownThrough: () => {
        if (!lightingScene) game.discover('thrown-through')
      },
      pickedUp: () => sound.pickUp(),
      letGo: (level) => (level === null ? sound.putDown() : sound.throw(level)),
    },
    worldLamp?.lamp,
  )
  const avatar = new Avatar(world.scene, engine.player)
  world.onUpdate((dt) => {
    items.update(dt)
    sound.update(dt, engine.player)
    avatar.update()
    lightingLab?.update(useLightingSettings.getState())
    worldLamp?.update()
  })

  engine.start()

  if (import.meta.env.DEV) {
    // Handy in the console: __engine.player.position.set(...)
    Object.assign(window, { __engine: engine, __items: items, __sound: sound })
  }

  return () => {
    keys.abort()
    stopListening()
    sound.dispose()
    items.dispose()
    lightingLab?.dispose()
    worldLamp?.dispose()
    engine.dispose()
  }
}
