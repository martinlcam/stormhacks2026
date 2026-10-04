import { Site } from '../../engine/planet'
import { STONE_TILE, stoneMaterial } from '../foliage'
import type { Structure } from '../World'
import { glow, matte, palette } from '../materials'

/* How much smaller the small door is, and so how much it shrinks you. */
const RATIO = 0.25

/*
  A full-size door joined to one a quarter of its size. Going in the tall
  door brings you out of the small one at a quarter scale; going back in the
  small one restores you. Nearby stands a vault whose only way in is a gap
  too low for anyone full-sized.
*/
export function resizingDoors(onResize: () => void, onEnterVault: () => void): Structure {
  return {
    name: 'resizing-doors',
    // Most of the way round the planet from the start.
    site: new Site('resizing-doors', -33, -33),
    build(world) {
      const tall = world.addDoor({
        name: 'resize-tall',
        position: [3, 0, -5],
        facing: 3,
        overgrown: true,
        backing: matte(palette.stone),
      })
      const small = world.addDoor({
        name: 'resize-small',
        position: [3, 0, -1],
        facing: 3,
        scale: RATIO,
        overgrown: true,
        backing: matte(palette.stone),
      })
      world.link(tall, small)
      tall.onTraverse = onResize
      small.onTraverse = onResize

      // The vault: a sealed room three metres square, centred on (vx, vz).
      const vx = -2
      const vz = 5
      const gapWidth = 0.4
      const gapHeight = 0.5
      const height = 2.4
      world.addBox({
        size: [1.5, height, 0.2],
        position: [vx - 0.95, height / 2, vz - 1.6],
        overgrown: true,
      })
      world.addBox({
        size: [1.5, height, 0.2],
        position: [vx + 0.95, height / 2, vz - 1.6],
        overgrown: true,
      })
      world.addBox({
        size: [gapWidth, height - gapHeight, 0.2],
        position: [vx, gapHeight + (height - gapHeight) / 2, vz - 1.6],
        overgrown: true,
      })
      world.addBox({
        size: [3.4, height, 0.2],
        position: [vx, height / 2, vz + 1.6],
        overgrown: true,
      })
      world.addBox({
        size: [0.2, height, 3],
        position: [vx - 1.6, height / 2, vz],
        overgrown: true,
      })
      world.addBox({
        size: [0.2, height, 3],
        position: [vx + 1.6, height / 2, vz],
        overgrown: true,
      })
      world.addBox({
        size: [3.4, 0.2, 3.4],
        position: [vx, height + 0.1, vz],
        material: stoneMaterial(),
        tile: STONE_TILE,
      })

      // A lit rim, so the gap reads as a way in.
      const rim = glow(palette.cyan)
      world.addBox({
        size: [gapWidth + 0.08, 0.04, 0.22],
        position: [vx, gapHeight + 0.02, vz - 1.6],
        material: rim,
        collide: false,
      })
      for (const side of [-1, 1]) {
        world.addBox({
          size: [0.04, gapHeight, 0.22],
          position: [vx + side * (gapWidth / 2 + 0.02), gapHeight / 2, vz - 1.6],
          material: rim,
          collide: false,
        })
      }

      const core = world.addBox({
        size: [0.5, 0.5, 0.5],
        position: [vx, 0.9, vz + 0.4],
        material: glow(palette.purple, 2),
        collide: false,
      })
      world.onUpdate((_dt, time) => core.rotation.set(time * 0.5, time * 0.7, 0))
      world.addTrigger([vx - 1.5, -1, vz - 1.5], [vx + 1.5, height, vz + 1.5], onEnterVault)
    },
  }
}
