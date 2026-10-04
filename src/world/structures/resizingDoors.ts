import { PLANK_TILE, plankMaterial } from '../foliage'
import type { Structure } from '../World'
import { glow, matte, palette } from '../materials'
import { addBeacon, addColours, addRegion, addSocket, type PuzzleEvents, ramp } from '../puzzle'

/* How much smaller the small door is, and so how much it shrinks you. */
const RATIO = 0.25
/* The puzzle's colours, from full size down: lime, teal, blue, violet. */
const SIZES = [0xb6f25c, 0x2ed3b7, 0x4f8dff, 0x9b6bff]

/*
  A full-size door joined to one a quarter of its size. Going in the tall
  door brings you out of the small one at a quarter scale; going back in the
  small one restores you. Nearby stands a vault whose only way in is a gap
  too low for anyone full-sized.

  The puzzle: three gems, all full size, and three sockets that each take a
  gem of one size only: as found, a quarter, and a sixteenth. The tall door
  only ever divides by four, so the smallest gem has to go through it twice.
*/
export function resizingDoors(
  onResize: () => void,
  onEnterVault: () => void,
  puzzle: PuzzleEvents,
): Structure {
  return {
    name: 'resizing-doors',
    build(world) {
      const tall = world.addDoor({
        name: 'resize-tall',
        position: [-6, 0, -8],
        facing: 1,
        overgrown: true,
        backing: matte(palette.stone),
      })
      const small = world.addDoor({
        name: 'resize-small',
        position: [-6, 0, -5],
        facing: 1,
        scale: RATIO,
        overgrown: true,
        backing: matte(palette.stone),
      })
      world.link(tall, small)
      tall.onTraverse = onResize
      small.onTraverse = onResize

      // The vault: a sealed room three metres square, centred on (vx, vz).
      const vx = -10.5
      const vz = -1.5
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
        material: plankMaterial(),
        tile: PLANK_TILE,
      })
      world.addRoof([vx, vz], height + 0.2, 3.4, 3.4)

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

      const colours = addColours()
      const gems = [
        [-3.6, 0.18, -6.2],
        [-4.2, 0.18, -6.8],
        [-3, 0.18, -6.8],
      ].map(([gx, gy, gz], i) =>
        world.addItem({ position: [gx, gy, gz], material: colours.keep(glow(SIZES[i], 1.2)) }),
      )

      // Full size in the open, a quarter in the vault, a sixteenth by the small door.
      const mouse: [number, number, number] = [-5.3, 0, -3.8]
      const sockets = [
        addSocket(world, { position: [-4.5, 0, -3], colour: SIZES[0], items: gems, colours }),
        addSocket(world, {
          position: [vx - 0.8, 0, vz + 0.7],
          width: 0.4,
          size: RATIO,
          colour: ramp(SIZES, 0.5),
          items: gems,
          colours,
        }),
        addSocket(world, {
          position: mouse,
          width: 0.2,
          size: RATIO * RATIO,
          colour: SIZES[3],
          items: gems,
          colours,
        }),
      ]
      // The mouse-hole: an arch over the smallest socket, so it can be found.
      const arch = colours.keep(glow(SIZES[3], 1.4))
      for (const side of [-1, 1]) {
        world.addBox({
          size: [0.03, 0.3, 0.03],
          position: [mouse[0], 0.15, mouse[2] + side * 0.14],
          material: arch,
          collide: false,
        })
      }
      world.addBox({
        size: [0.03, 0.03, 0.31],
        position: [mouse[0], 0.315, mouse[2]],
        material: arch,
        collide: false,
      })
      const beacon = addBeacon(world, [-6.25, 0, -6.3], SIZES)

      let solved = false
      const refresh = addRegion(
        world,
        [
          [
            [-12.5, -1, -10],
            [-2.5, 6, 0.5],
          ],
        ],
        puzzle,
        () =>
          solved
            ? 'Solved: powers of four'
            : 'Fill each socket with a gem of its own size: ×1, ×1/4 and ×1/16.',
      )
      world.onUpdate(() => {
        let filled = 0
        for (const socket of sockets) {
          const holds = socket.holds() !== null
          socket.show(holds ? 'filled' : 'ready')
          if (holds) filled++
        }
        if (filled < sockets.length || solved) return
        solved = true
        colours.restore()
        beacon(true)
        puzzle.solved()
        refresh()
      })
    },
  }
}
