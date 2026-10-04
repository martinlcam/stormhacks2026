import { Engine } from '../engine/Engine'
import { World } from '../world/World'
import { biggerInside } from '../world/structures/biggerInside'
import { gravityRoom } from '../world/structures/gravityRoom'
import { hub } from '../world/structures/hub'
import { loopCorridor } from '../world/structures/loopCorridor'
import { resizingDoors } from '../world/structures/resizingDoors'
import { Avatar } from './avatar'
import { ItemSystem } from './items'
import { useGame } from './store'

/*
  Build the sandbox, start the engine and wire both to the store.
  Returns a function that tears everything down again.
*/
export function bootstrap(canvas: HTMLCanvasElement): () => void {
  const game = useGame.getState()

  const world = new World()
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
  ]
  for (const structure of structures) structure.build(world)
  world.finalize()

  const engine = new Engine(canvas, world)
  engine.player.spawn.set(0, 0, 2)
  engine.player.respawn()
  engine.player.onLockChange = (locked) => game.setPlaying(locked)
  engine.onStats = ({ fps, passes, scale }) => game.setStats(fps, passes, scale)

  const items = new ItemSystem(engine, {
    prompt: (text) => game.setPrompt(text),
    charge: (level) => game.setCharge(level),
    thrownThrough: () => game.discover('thrown-through'),
  })
  const avatar = new Avatar(world.scene, engine.player)
  world.onUpdate((dt) => {
    items.update(dt)
    avatar.update(dt, items.holding)
  })
  engine.start()

  if (import.meta.env.DEV) {
    // Handy in the console: __engine.player.position.set(...)
    Object.assign(window, { __engine: engine, __items: items })
  }

  return () => {
    items.dispose()
    engine.dispose()
  }
}
