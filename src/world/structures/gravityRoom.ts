import * as THREE from 'three'
import type { Structure } from '../World'
import { glow, gridTexture, matte, palette } from '../materials'
import { addBeacon, addColours, addRegion, addSocket, type PuzzleEvents, ramp } from '../puzzle'

/* Detached rooms live far from the plaza so they are never seen directly. */
const ROOM_X = -600
/* The room is a cube this many metres on a side, with its floor at y = 0. */
const SIZE = 10
const HALF = SIZE / 2
const WALL = 0.3
/* The puzzle's colours: gold to coral. */
const WARM = [0xffc857, 0xff6f61]

/*
  One cubic room in which three surfaces are floors.

  A door reached from the plaza opens onto the floor. A second door on the
  floor is joined to a door that stands on a wall, so whoever walks through
  comes out standing on that wall, with gravity pulling them towards it. A
  further pair leads from the wall to the ceiling. Nothing in the room
  moves: each door turns the person who goes through it.

  Gems obey the same rule. One carried or thrown through a door falls
  towards whichever surface is the floor on the far side.

  The puzzle: a plate on each of the three floors, and three gems. A gem
  must rest on every plate at once. Thrown up at the wall or the ceiling
  from the floor, a gem falls back, because its down is still the floor's.
  Only a door turns it.
*/
export function gravityRoom(
  onWall: () => void,
  onCeiling: () => void,
  puzzle: PuzzleEvents,
): Structure {
  return {
    name: 'gravity-room',
    build(world) {
      const x = ROOM_X
      const surface = (line: string) =>
        new THREE.MeshStandardMaterial({
          map: gridTexture('#1e1826', line, SIZE / 2),
          roughness: 0.85,
        })
      const floor = surface('#c252e1')
      const wall = surface('#6ecbf5')
      const ceiling = surface('#e8e2f0')
      const plain = matte(palette.stone)
      const span = SIZE + WALL * 2

      // The six sides. Three are walked on and carry a coloured grid.
      world.addBox({ size: [span, WALL, span], position: [x, -WALL / 2, 0], material: floor })
      world.addBox({
        size: [span, WALL, span],
        position: [x, SIZE + WALL / 2, 0],
        material: ceiling,
      })
      world.addBox({
        size: [WALL, SIZE, span],
        position: [x + HALF + WALL / 2, HALF, 0],
        material: wall,
      })
      world.addBox({
        size: [WALL, SIZE, span],
        position: [x - HALF - WALL / 2, HALF, 0],
        material: plain,
      })
      world.addBox({
        size: [SIZE, SIZE, WALL],
        position: [x, HALF, HALF + WALL / 2],
        material: plain,
      })
      world.addBox({
        size: [SIZE, SIZE, WALL],
        position: [x, HALF, -HALF - WALL / 2],
        material: plain,
      })

      // Something to walk around on each floor, so each one reads as a place.
      world.addBox({
        size: [1.4, 0.9, 1.4],
        position: [x - 1.5, 0.45, -1],
        material: matte(0x4a2a5c),
      })
      world.addBox({
        size: [0.5, 0.5, 0.5],
        position: [x - 1.5, 1.15, -1],
        material: glow(palette.purple),
        collide: false,
      })
      world.addBox({
        size: [0.9, 1.4, 1.4],
        position: [x + HALF - 0.45, 6, 0.5],
        material: matte(0x2a4a5c),
      })
      world.addBox({
        size: [0.5, 0.5, 0.5],
        position: [x + HALF - 1.15, 6, 0.5],
        material: glow(palette.cyan),
        collide: false,
      })
      world.addBox({
        size: [1.4, 0.9, 1.4],
        position: [x + 1.5, SIZE - 0.45, 1.5],
        material: matte(0x5a5560),
      })
      world.addBox({
        size: [0.5, 0.5, 0.5],
        position: [x + 1.5, SIZE - 1.15, 1.5],
        material: glow(palette.bone, 1),
        collide: false,
      })

      const colours = addColours()
      const gems = [
        [x + 1, 0.18, 2],
        [x - 2.5, 0.18, 2.5],
        [x - 1, 0.18, 3.2],
      ].map(([gx, gy, gz], i) =>
        world.addItem({
          position: [gx, gy, gz],
          material: colours.keep(glow(ramp(WARM, i / 2), 1.2)),
        }),
      )

      // One plate on each floor: the floor, the +X wall and the ceiling.
      const plates = [
        addSocket(world, {
          position: [x - 3.5, 0, -3.5],
          colour: ramp(WARM, 0),
          items: gems,
          colours,
        }),
        addSocket(world, {
          position: [x + HALF, 3.5, 2.5],
          up: 'x-',
          colour: ramp(WARM, 0.5),
          items: gems,
          colours,
        }),
        addSocket(world, {
          position: [x + 2.5, SIZE, -2.5],
          up: 'y-',
          colour: ramp(WARM, 1),
          items: gems,
          colours,
        }),
      ]
      // Hangs in the middle of the room, where it is seen from every floor.
      const beacon = addBeacon(world, [x, HALF - 0.9, 0], WARM, 1.8, false)

      let solved = false
      const refresh = addRegion(
        world,
        [
          [
            [x - HALF - 0.5, -1, -HALF - 0.5],
            [x + HALF + 0.5, SIZE + 1, HALF + 0.5],
          ],
        ],
        puzzle,
        () =>
          solved
            ? 'Solved: three downs'
            : 'Rest a gem on all three plates at once: floor, wall and ceiling.',
      )
      world.onUpdate(() => {
        let filled = 0
        for (const plate of plates) {
          const holds = plate.holds() !== null
          plate.show(holds ? 'filled' : 'ready')
          if (holds) filled++
        }
        if (filled < plates.length || solved) return
        solved = true
        colours.restore()
        beacon(true)
        puzzle.solved()
        refresh()
      })

      // Every door stands 10 cm off the surface behind it, which is its backing.
      const gap = 0.1

      // In from the plaza: the front door of a small house, with lit windows
      // in its side walls, a roof and a chimney.
      const [doorX, doorZ] = [-5, 9]
      const outside = world.addDoor({
        name: 'gravity-outside',
        position: [doorX, 0, doorZ],
        facing: 2,
        overgrown: true,
      })
      const wide = 3.2
      const deep = 2.8
      const tall = 2.7
      // Its front wall is just behind the door's frame.
      const middle = doorZ + 0.16 + deep / 2
      world.addBox({
        size: [wide, tall, deep],
        position: [doorX, tall / 2, middle],
        overgrown: true,
      })
      world.addRoof([doorX, middle], tall, wide, deep)
      world.addBox({
        size: [0.45, 1.1, 0.45],
        position: [doorX + 0.9, tall + 0.55, middle + 0.6],
        material: matte(palette.stone),
      })
      // A window in each side wall and one beside the door: a lit pane with a sill under it.
      const pane = glow(ramp(WARM, 0), 1.1)
      const sill = matte(palette.stone)
      for (const side of [-1, 1]) {
        const wallX = doorX + side * (wide / 2 + 0.02)
        world.addBox({
          size: [0.04, 0.8, 0.9],
          position: [wallX, 1.5, middle],
          material: pane,
          collide: false,
        })
        world.addBox({
          size: [0.12, 0.08, 1.1],
          position: [wallX, 1.06, middle],
          material: sill,
          collide: false,
        })
      }
      const front = doorZ + 0.14
      world.addBox({
        size: [0.6, 0.7, 0.04],
        position: [doorX + 1.15, 1.55, front],
        material: pane,
        collide: false,
      })
      world.addBox({
        size: [0.8, 0.08, 0.12],
        position: [doorX + 1.15, 1.16, front],
        material: sill,
        collide: false,
      })
      const entrance = world.addDoor({
        name: 'gravity-entrance',
        position: [x, 0, HALF - gap],
        facing: 2,
        frameMaterial: glow(palette.bone, 1.2),
      })
      world.link(outside, entrance)

      // Floor → wall. The far door stands on the +X wall with its back to
      // the ceiling, so you come out walking down the wall.
      const floorDoor = world.addDoor({
        name: 'gravity-floor',
        position: [x + HALF - gap, 0, -2],
        facing: 3,
        frameMaterial: glow(palette.purple),
      })
      const wallDoor = world.addDoor({
        name: 'gravity-wall',
        position: [x + HALF, SIZE - gap, 2],
        up: 'x-',
        facing: 3,
        frameMaterial: glow(palette.purple),
      })
      world.link(floorDoor, wallDoor)
      floorDoor.onTraverse = onWall

      // Wall → ceiling. One door stands on the +X wall against the -Z wall,
      // the other on the ceiling against the -X wall.
      const wallDoor2 = world.addDoor({
        name: 'gravity-wall-2',
        position: [x + HALF, HALF, -HALF + gap],
        up: 'x-',
        facing: 0,
        frameMaterial: glow(palette.cyan),
      })
      const ceilingDoor = world.addDoor({
        name: 'gravity-ceiling',
        position: [x - HALF + gap, SIZE, 0],
        up: 'y-',
        facing: 1,
        frameMaterial: glow(palette.cyan),
      })
      world.link(wallDoor2, ceilingDoor)
      wallDoor2.onTraverse = onCeiling
    },
  }
}
