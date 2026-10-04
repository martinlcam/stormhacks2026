import { PLANK_TILE, plankMaterial, WOOD_TILE, woodMaterial } from '../foliage'
import type { Structure } from '../World'
import { glow, palette } from '../materials'
import { addColours, addRegion, type PuzzleEvents, ramp, shine } from '../puzzle'

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
/* The top of the gong, which shuts across the well below the plate's landing. */
const GONG = 1
/*
  How fast a gem must hit the gong to ring it, in metres per second. A fall
  of one whole turn makes 17, and the hardest throw straight down adds
  enough to reach 25, so nothing rings it that has not gone round.
*/
export const RINGING = 27
/* How fast a gem must hit the gong to be heard at all. */
const TAP = 2
/* How far the second puzzle asks the player to fall without landing, in metres. */
const FALL = 100
/* Seams passed less than this many seconds apart are one fall: no one walks a turn that fast. */
const FALLING = 1
/* The puzzle's colours: ice, pale to bright. */
const ICE = [0xe8f6ff, 0x6ee7ff]

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

  The puzzle: a gong that shuts across the well for as long as someone
  stands on the lit landing, and rings only if a gem hits it faster than any
  drop inside one turn of the stairs can make it. The well has no bottom, so
  a gem let go down it while the gong is open keeps gaining speed, turn
  after turn. Let it fall, then shut the gong under it.

  The second puzzle is for the player: fall a hundred metres without
  landing, in a tower nine metres tall. Step off into the well.

  `onGong` is told whenever a gem hits the gong, and how hard: its speed as
  a share of the speed that rings it, so 1 or more is a ring.
*/
export function stairwell(
  onTurn: () => void,
  puzzle: PuzzleEvents,
  fall: PuzzleEvents,
  onGong?: (strength: number) => void,
): Structure {
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
      // Whoever goes down through the lower seam quickly enough, again and again, is falling.
      let now = 0
      let passed = -Infinity
      let turns = 0
      let fallen = false
      lower.onTraverse = () => {
        onTurn()
        turns = now - passed < FALLING ? turns + 1 : 1
        passed = now
        if (!fallen && turns * TURN >= FALL) {
          fallen = true
          fall.solved()
        }
        tell()
      }
      const tower = [
        [
          [X - HALF - 0.5, low - 1, -HALF - 0.5],
          [X + HALF + 0.5, high + 1, HALF + 0.5],
        ],
      ] as const
      const tell = addRegion(world, tower, fall, () =>
        fallen
          ? 'Solved: further down than there is'
          : turns > 1
            ? `Fallen ${Math.round(turns * TURN)} m of ${FALL}`
            : `Fall ${FALL} metres without landing. The tower is ${Math.round(TURN)} metres tall.`,
      )
      world.onUpdate((_dt, time) => {
        now = time
        // Landed, or caught: the next fall starts from nothing.
        if (turns === 0 || now - passed < FALLING) return
        turns = 0
        tell()
      })

      // The way in: a door in the plaza and one on the first landing. The
      // door in the plaza is the front door of a narrow house, two storeys
      // and a roof, far too small for what is inside.
      const [doorX, doorZ] = [-9, 3]
      const outside = world.addDoor({
        name: 'stairwell-plaza',
        position: [doorX, 0, doorZ],
        facing: 1,
        overgrown: true,
      })
      const houseWide = 2.4
      const houseTall = 4.6
      // Its front wall is just behind the door's frame.
      const houseX = doorX - 0.16 - houseWide / 2
      world.addBox({
        size: [houseWide, houseTall, houseWide],
        position: [houseX, houseTall / 2, doorZ],
        overgrown: true,
      })
      world.addRoof([houseX, doorZ], houseTall, houseWide, houseWide)
      // Lit windows: one over the door, and one on each floor of both side walls.
      const pane = glow(ICE[0], 1)
      world.addBox({
        size: [0.04, 0.8, 0.7],
        position: [doorX - 0.14, 3.4, doorZ],
        material: pane,
        collide: false,
      })
      for (const side of [-1, 1]) {
        for (const y of [1.5, 3.4]) {
          world.addBox({
            size: [0.7, 0.8, 0.04],
            position: [houseX, y, doorZ + side * (houseWide / 2 + 0.02)],
            material: pane,
            collide: false,
          })
        }
      }
      const inside = world.addDoor({
        name: 'stairwell-landing',
        position: [X + corners[0][0], 0, HALF - 0.16],
        facing: 2,
        overgrown: true,
      })
      world.link(outside, inside)

      // The gong. An open gong is not drawn and is moved out of the world.
      const colours = addColours()
      const well = HALF - WIDTH
      const AWAY = 200
      const plate = world.addCollider(
        [X - well, GONG - SLAB + AWAY, -well],
        [X + well, GONG + AWAY, well],
      )
      const gong = world.addBox({
        size: [well * 2, SLAB, well * 2],
        position: [X, GONG - SLAB / 2, 0],
        material: colours.keep(glow(ramp(ICE, 0.5), 0.35)),
        collide: false,
      })
      gong.visible = false
      // A rim round the well where the gong shuts, so its place is seen while it is open.
      const rims = [-1, 1].flatMap((side) => [
        world.addBox({
          size: [well * 2, 0.05, 0.05],
          position: [X, GONG, side * well],
          material: colours.keep(glow(ICE[1], 0.5)),
          collide: false,
        }),
        world.addBox({
          size: [0.05, 0.05, well * 2],
          position: [X + side * well, GONG, 0],
          material: colours.keep(glow(ICE[1], 0.5)),
          collide: false,
        }),
      ])
      const inWell = (at: { x: number; z: number }) =>
        Math.abs(at.x - X) < well && Math.abs(at.z) < well
      let shut = false
      const setShut = (to: boolean) => {
        if (to === shut) return
        shut = to
        plate.min.y += to ? -AWAY : AWAY
        plate.max.y += to ? -AWAY : AWAY
        gong.visible = to
        if (to) return
        // Whatever lay on the gong has nothing under it now.
        for (const { body } of world.items) {
          if (inWell(body.position)) body.resting = false
        }
      }

      // The landing one flight above the door is the plate that shuts it.
      const [plateX, plateZ] = corners[1]
      const lit = world.addBox({
        size: [1.2, 0.04, 1.2],
        position: [X + plateX, FLIGHT + 0.02, plateZ],
        material: colours.keep(glow(ICE[1], 0.6)),
        collide: false,
      })
      world.addTrigger(
        [X + plateX - WIDTH / 2, FLIGHT - 0.2, plateZ - WIDTH / 2],
        [X + plateX + WIDTH / 2, FLIGHT + 2, plateZ + WIDTH / 2],
        () => setShut(true),
        () => setShut(false),
      )

      world.addItem({
        position: [X + corners[0][0] - 0.5, 0.18, corners[0][1] - 0.5],
        material: colours.keep(glow(ramp(ICE, 0.5), 1.3)),
      })

      let solved = false
      const refresh = addRegion(world, tower, puzzle, () =>
        solved
          ? 'Solved: a fall with no bottom'
          : 'Ring the gong. Standing on the lit landing shuts it across the well, and only a gem that has fallen further than the tower is tall hits hard enough.',
      )
      // How fast each gem was falling a moment ago: once it has hit, it is too late to ask.
      const falling = new Map<object, number>()
      world.onUpdate(() => {
        for (const { body } of world.items) {
          const before = falling.get(body) ?? 0
          falling.set(body, -body.velocity.y)
          if (!shut || before < TAP) continue
          // It was falling and now is not: it hit something. Was that the gong?
          const stopped = -body.velocity.y < before / 2
          const rise = body.position.y - GONG
          if (!stopped || !inWell(body.position) || rise < 0 || rise > 1) continue
          onGong?.(before / RINGING)
          if (solved || before < RINGING) continue
          solved = true
          colours.restore()
          puzzle.solved()
          refresh()
        }
        shine(gong, solved ? 2.4 : 0.35)
        for (const rim of rims) shine(rim, solved ? 2.4 : 0.5)
        shine(lit, shut ? 2 : 0.6)
      })
    },
  }
}
