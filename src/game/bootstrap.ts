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
import { type DiscoveryId, discoveries } from './discoveries'
import type { LightingScene, LightingView } from './lightingScenes'
import { useLightingSettings } from './lightingSettings'
import { Sound } from './sound'
import { useGame } from './store'

/* The keys that walk. */
const WALK_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])
/* Pixels of mouse movement that count as having looked around: about half a turn. */
const LOOK_PIXELS = 1400

/* A running game, or one built ahead of time and waiting to be shown. */
export interface Game {
  /* Start drawing and simulating, if it was built paused. */
  play(): void
  /* Tear everything down again. */
  dispose(): void
}

/*
  Build the sandbox, start the engine and wire both to the store.
  With `paused`, it is built but not started: the landing page builds it
  behind itself, so that going into the game does not stall on it.
*/
export function bootstrap(
  canvas: HTMLCanvasElement,
  lightingScene?: LightingScene,
  lightingView: LightingView = 'default',
  { paused = false } = {},
): Game {
  const game = useGame.getState()

  const world = new World()
  const lightingLab = lightingScene
    ? buildLightingLab(world, lightingScene, lightingView)
    : undefined

  if (!lightingScene) {
    // A puzzle shows its goal while the player is at it, and is a discovery once solved.
    // Two puzzles can be within reach at once: each goal is a line of its own.
    const goals = new Map<DiscoveryId, string>()
    const puzzle = (id: DiscoveryId) => ({
      hint: (text: string | null) => {
        goals.delete(id)
        if (text !== null) goals.set(id, text)
        game.setGoal([...goals.values()].join('\n') || null)
      },
      solved: () => game.discover(id),
    })
    // Add a structure here and it is part of the sandbox.
    const structures = [
      hub,
      biggerInside(
        () => game.discover('bigger-inside'),
        puzzle('long-way-round'),
        puzzle('seating-plan'),
      ),
      loopCorridor(() => game.discover('loop-corridor'), puzzle('floors-without-stairs')),
      gravityRoom(
        () => game.discover('walls-are-floors'),
        () => game.discover('on-the-ceiling'),
        puzzle('three-downs'),
      ),
      resizingDoors(
        () => game.discover('resizing-door'),
        () => game.discover('small-world'),
        puzzle('powers-of-four'),
      ),
      sculpture(() => game.discover('hypercube')),
      stairwell(
        () => game.discover('endless-stairwell'),
        puzzle('falling-faster'),
        puzzle('further-down'),
      ),
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
      // P: a secret. Everything is found at once, which brings on the ending.
      if (event.code === 'KeyP' && !lightingScene) {
        for (const id of Object.keys(discoveries) as DiscoveryId[]) game.discover(id)
      }
      // The first time the player walks and jumps, the controls shown to new players tick them off.
      if (WALK_KEYS.has(event.code)) game.learn('move')
      if (event.code === 'Space') game.learn('jump')
    },
    { signal: keys.signal },
  )

  let looked = 0
  window.addEventListener(
    'mousemove',
    (event) => {
      if (!engine.player.locked) return
      looked += Math.abs(event.movementX) + Math.abs(event.movementY)
      if (looked > LOOK_PIXELS) game.learn('look')
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
      pickedUp: () => {
        sound.pickUp()
        // The lamp the player starts holding does not count, only what they pick up themselves.
        if (engine.player.locked) game.learn('pickUp')
      },
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

  if (paused) {
    // Compile the shaders without blocking, then draw one frame to send the textures to the
    // graphics card, so that the first frame shown later does not stall.
    void engine.renderer
      .compileAsync(world.scene, engine.camera)
      .then(() => engine.frame())
      .catch(() => {})
  } else {
    engine.start()
  }

  if (import.meta.env.DEV) {
    // Handy in the console: __engine.player.position.set(...), __game.getState().discover(...)
    Object.assign(window, { __engine: engine, __items: items, __sound: sound, __game: useGame })
  }

  return {
    play: () => engine.start(),
    dispose: () => {
      keys.abort()
      stopListening()
      sound.dispose()
      items.dispose()
      lightingLab?.dispose()
      worldLamp?.dispose()
      engine.dispose()
    },
  }
}
