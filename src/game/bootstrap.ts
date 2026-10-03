import { Engine } from '../engine/Engine'
import { World } from '../world/World'
import { biggerInside } from '../world/structures/biggerInside'
import { hub } from '../world/structures/hub'
import { loopCorridor } from '../world/structures/loopCorridor'
import { useGame } from './store'

/**
 * Build the sandbox, start the engine and wire both to the store.
 * Returns a function that tears everything down again.
 */
export function bootstrap(canvas: HTMLCanvasElement): () => void {
  const game = useGame.getState()

  const world = new World()
  // Add a structure here and it is part of the sandbox.
  const structures = [
    hub,
    biggerInside(() => game.discover('bigger-inside')),
    loopCorridor(() => game.discover('loop-corridor')),
  ]
  for (const structure of structures) structure.build(world)
  world.finalize()

  const engine = new Engine(canvas, world)
  engine.player.spawn.set(0, 0, 2)
  engine.player.respawn()
  engine.player.onLockChange = (locked) => game.setPlaying(locked)
  engine.onStats = ({ fps, passes }) => game.setStats(fps, passes)
  engine.start()

  if (import.meta.env.DEV) {
    // Handy in the console: __engine.player.position.set(...)
    Object.assign(window, { __engine: engine })
  }

  return () => engine.dispose()
}
