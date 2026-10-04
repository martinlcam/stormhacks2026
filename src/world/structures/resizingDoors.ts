import { Site } from '../../engine/planet'
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
    site: new Site('resizing-doors', -70, -70),
    build(world) {
      const tall = world.addDoor({
        name: 'resize-tall',
        position: [14, 0, -2],
        facing: 3,
        overgrown: true,
        backing: matte(palette.stone),
      })
      const small = world.addDoor({
        name: 'resize-small',
        position: [14, 0, 2],
        facing: 3,
        scale: RATIO,
        overgrown: true,
        backing: matte(palette.stone),
      })
      world.link(tall, small)
      tall.onTraverse = onResize
      small.onTraverse = onResize

      // The vault: a sealed room spanning x 7.5–10.5, z 7.5–10.5.
      const wall = matte(0x2b2140)
      const gapWidth = 0.4
      const gapHeight = 0.5
      const height = 2.4
      world.addBox({ size: [1.5, height, 0.2], position: [8.05, height / 2, 7.4], material: wall })
      world.addBox({ size: [1.5, height, 0.2], position: [9.95, height / 2, 7.4], material: wall })
      world.addBox({
        size: [gapWidth, height - gapHeight, 0.2],
        position: [9, gapHeight + (height - gapHeight) / 2, 7.4],
        material: wall,
      })
      world.addBox({ size: [3.4, height, 0.2], position: [9, height / 2, 10.6], material: wall })
      world.addBox({ size: [0.2, height, 3], position: [7.4, height / 2, 9], material: wall })
      world.addBox({ size: [0.2, height, 3], position: [10.6, height / 2, 9], material: wall })
      world.addBox({ size: [3.4, 0.2, 3.4], position: [9, height + 0.1, 9], material: wall })

      // A lit rim, so the gap reads as a way in.
      const rim = glow(palette.cyan)
      world.addBox({
        size: [gapWidth + 0.08, 0.04, 0.22],
        position: [9, gapHeight + 0.02, 7.4],
        material: rim,
        collide: false,
      })
      for (const side of [-1, 1]) {
        world.addBox({
          size: [0.04, gapHeight, 0.22],
          position: [9 + side * (gapWidth / 2 + 0.02), gapHeight / 2, 7.4],
          material: rim,
          collide: false,
        })
      }

      const core = world.addBox({
        size: [0.5, 0.5, 0.5],
        position: [9, 0.9, 9.4],
        material: glow(palette.purple, 2),
        collide: false,
      })
      world.onUpdate((_dt, time) => core.rotation.set(time * 0.5, time * 0.7, 0))
      world.addTrigger([7.5, -1, 7.5], [10.5, height, 10.5], onEnterVault)
    },
  }
}
