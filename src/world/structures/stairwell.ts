import { PLANK_TILE, plankMaterial, WOOD_TILE, woodMaterial } from '../foliage'
import type { Structure } from '../World'
import { glow, palette } from '../materials'

/* The tower stands far from everything else; only its doors lead to it. */
const X = 1200
/* Half the width of the tower inside, and how wide the stairs are. */
const HALF = 4
const WIDTH = 2
const RISE = 0.2
const TREAD = 0.4
/* Steps in one flight. Four flights and four landings make one turn of the tower. */
const STEPS = (HALF * 2 - WIDTH * 2) / TREAD
const FLIGHT = (STEPS + 1) * RISE
const TURN = FLIGHT * 4
/* The height of the lower seam. The upper one is one turn above it. */
const SEAM = -3.3
/* How far past each seam the tower is really built. */
const BEYOND = 3
const SLAB = 0.2

/* The middle of each corner landing, going round as the stairs climb. */
const corners = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
].map(([x, z]) => [x * (HALF - WIDTH / 2), z * (HALF - WIDTH / 2)] as const)

/*
  A square tower with stairs round its walls and an open well down the
  middle. A seam cuts across it near the top and another near the bottom,
  one turn of the stairs apart, and the two are joined: whoever climbs
  through the upper seam comes up through the lower one, on the same step
  of the same flight, still climbing. So the stairs go up for ever, and
  every turn passes the same door. Looking up or down the well shows the
  tower repeating, and whatever is dropped down it falls without end.

  The tower is built a little way past each seam, so that there are steps
  under the feet of someone whose eye has already gone through.
*/
export function stairwell(onTurn: () => void): Structure {
  return {
    name: 'stairwell',
    build(world) {
      const timber = { material: woodMaterial(), tile: WOOD_TILE }
      const low = SEAM - BEYOND
      const high = SEAM + TURN + BEYOND

      // The stairs, for as many turns as reach from below one seam to above the other.
      for (let turn = -1; turn <= 1; turn++) {
        for (let flight = 0; flight < 4; flight++) {
          const [fromX, fromZ] = corners[flight]
          const [toX, toZ] = corners[(flight + 1) % 4]
          const alongX = Math.sign(toX - fromX)
          const alongZ = Math.sign(toZ - fromZ)
          const landing = turn * TURN + flight * FLIGHT
          const slab = (x: number, z: number, top: number, sizeX: number, sizeZ: number) => {
            if (top < low || top > high) return
            world.addBox({
              size: [sizeX, SLAB, sizeZ],
              position: [X + x, top - SLAB / 2, z],
              ...timber,
            })
          }
          slab(fromX, fromZ, landing, WIDTH, WIDTH)
          for (let step = 1; step <= STEPS; step++) {
            const run = WIDTH / 2 + (step - 0.5) * TREAD
            slab(
              fromX + alongX * run,
              fromZ + alongZ * run,
              landing + step * RISE,
              alongX ? TREAD : WIDTH,
              alongZ ? TREAD : WIDTH,
            )
          }
          // A lantern in the corner of each landing.
          if (landing > low && landing + 2 < high) {
            world.addBox({
              size: [0.18, 0.18, 0.18],
              position: [
                X + Math.sign(fromX) * (HALF - 0.2),
                landing + 1.9,
                Math.sign(fromZ) * (HALF - 0.2),
              ],
              material: glow(flight === 0 ? palette.cyan : palette.purple, 1.6),
              collide: false,
            })
          }
        }
      }

      // The four walls.
      const boards = { material: plankMaterial(), tile: PLANK_TILE, upright: true }
      const tall = high - low
      const middle = (high + low) / 2
      const out = HALF + 0.15
      const span = HALF * 2 + 0.6
      world.addBox({ size: [span, tall, 0.3], position: [X, middle, out], ...boards })
      world.addBox({ size: [span, tall, 0.3], position: [X, middle, -out], ...boards })
      world.addBox({ size: [0.3, tall, span], position: [X + out, middle, 0], ...boards })
      world.addBox({ size: [0.3, tall, span], position: [X - out, middle, 0], ...boards })

      // The seams lie flat across the whole tower. The upper one faces
      // down and the lower one up, and they are turned so that going
      // through is a plain move of one turn's height and nothing else.
      const across = { up: 'z+' as const, width: HALF * 2, height: HALF * 2, seamless: true }
      const upper = world.addPortal({
        name: 'stairwell-upper',
        position: [X, SEAM + TURN, -HALF],
        facing: 0,
        ...across,
      })
      const lower = world.addPortal({
        name: 'stairwell-lower',
        position: [X, SEAM, -HALF],
        facing: 2,
        ...across,
      })
      world.link(upper, lower)
      upper.onTraverse = onTurn
      lower.onTraverse = onTurn

      // The way in: a door in the plaza and one on the first landing.
      const outside = world.addDoor({
        name: 'stairwell-plaza',
        position: [-9, 0, 3],
        facing: 1,
        overgrown: true,
        backing: plankMaterial(),
      })
      const inside = world.addDoor({
        name: 'stairwell-landing',
        position: [X + corners[0][0], 0, HALF - 0.16],
        facing: 2,
        overgrown: true,
      })
      world.link(outside, inside)
    },
  }
}
