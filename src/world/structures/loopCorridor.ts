import type { Structure } from '../World'
import { glow, matte, palette } from '../materials'
import { addColours, addRegion, addSocket, type PuzzleEvents, ramp, shade, shine } from '../puzzle'

/* The puzzle's colours, from two laps west to two laps east: rose, amber, mint. */
const LAPS = [0xff5d8f, 0xffb347, 0x7dffb8]
/* The furthest lap the dial has a lamp for, either way. */
const FURTHEST = 2
/* The lap the cage opens on, and the lap the socket takes the gem on. */
const CAGE_LAP = 2
const SOCKET_LAP = -1

const lapColour = (lap: number) => ramp(LAPS, (lap + FURTHEST) / (FURTHEST * 2))
const signed = (lap: number) => (lap > 0 ? `+${lap}` : lap < 0 ? `−${-lap}` : '0')

/*
  Two doors eight metres apart, facing each other, joined to one another.
  The strip between them has no ends: walk through one door and you come out
  of the other, so straight ahead leads back to where you started. Looking
  through either door you see the same strip repeating into the distance.

  The puzzle: every lap looks the same and is not the same place. Going
  through the east door is one lap up and through the west door one lap
  down, as floors are in a stairwell; walking round a door changes nothing.
  A gem is caged except on lap +2, and its socket takes it only on lap -1.
  A row of lamps shows which lap the player is on.
*/
export function loopCorridor(onEnter: () => void, puzzle: PuzzleEvents): Structure {
  return {
    name: 'loop-corridor',
    build(world) {
      // Behind the start and to its left as the player first faces.
      const z = 7
      const stone = matte(palette.stone)
      const west = world.addDoor({
        name: 'loop-west',
        position: [2, 0, z],
        facing: 1,
        overgrown: true,
        backing: matte(palette.stone),
      })
      const east = world.addDoor({
        name: 'loop-east',
        position: [10, 0, z],
        facing: 3,
        overgrown: true,
        backing: matte(palette.stone),
      })
      world.link(west, east)

      // Walking east goes in at the east door; walking west, in at the west one.
      let lap = 0
      west.onTraverse = () => {
        lap--
        onEnter()
        refresh()
      }
      east.onTraverse = () => {
        lap++
        onEnter()
        refresh()
      }

      // A carpet and one off-centre marker, so each lap is recognisable.
      for (let i = 0; i < 8; i++) {
        world.addBox({
          size: [1, 0.02, 1.6],
          position: [2.5 + i, 0.01, z],
          material: matte(shade(ramp(LAPS, i / 7), 0.3)),
          collide: false,
        })
      }

      // The lap dial: a lamp for each lap from two west to two east, west to east.
      const colours = addColours()
      world.addBox({ size: [2.7, 0.6, 0.3], position: [6.6, 0.3, z - 1.5], material: stone })
      const lamps = Array.from({ length: FURTHEST * 2 + 1 }, (_, i) =>
        world.addBox({
          size: [0.3, 0.3, 0.3],
          position: [6.6 + (i - FURTHEST) * 0.55, 0.78, z - 1.5],
          material: colours.keep(glow(lapColour(i - FURTHEST), 0.12)),
          collide: false,
        }),
      )

      // The cage, in the colour of the lap it opens on.
      const cx = 3.6
      const cz = z - 1.5
      const half = 0.35
      const top = 1.3
      world.addBox({ size: [0.5, 0.4, 0.5], position: [cx, 0.2, cz], material: stone })
      const key = world.addItem({
        position: [cx, 0.58, cz],
        material: colours.keep(glow(lapColour(CAGE_LAP), 1.3)),
      })
      const outer = half + 0.05
      const walls = [
        world.addCollider([cx - outer, 0, cz - outer], [cx - half, top, cz + outer]),
        world.addCollider([cx + half, 0, cz - outer], [cx + outer, top, cz + outer]),
        world.addCollider([cx - outer, 0, cz - outer], [cx + outer, top, cz - half]),
        world.addCollider([cx - outer, 0, cz + half], [cx + outer, top, cz + outer]),
        world.addCollider([cx - outer, top, cz - outer], [cx + outer, top + 0.05, cz + outer]),
      ]
      const bar = colours.keep(glow(lapColour(CAGE_LAP), 0.9))
      const bars = [
        world.addBox({
          size: [outer * 2, 0.05, outer * 2],
          position: [cx, top + 0.025, cz],
          material: bar,
          collide: false,
        }),
      ]
      // Five bars a side; the corner ones are shared.
      for (let i = 0; i < 5; i++) {
        const along = (i / 4 - 0.5) * half * 2
        for (const [bx, bz] of [
          [cx + along, cz - half],
          [cx + along, cz + half],
          [cx - half, cz + along],
          [cx + half, cz + along],
        ]) {
          bars.push(
            world.addBox({
              size: [0.03, top, 0.03],
              position: [bx, top / 2, bz],
              material: bar,
              collide: false,
            }),
          )
        }
      }
      // An open cage is not drawn and its walls are moved out of the world.
      const AWAY = 200
      let open = false
      const setOpen = (now: boolean) => {
        if (now === open) return
        open = now
        for (const wall of walls) {
          wall.min.y += now ? -AWAY : AWAY
          wall.max.y += now ? -AWAY : AWAY
        }
        for (const mesh of bars) mesh.visible = !now
      }

      const socket = addSocket(world, {
        position: [7.8, 0, z + 1.5],
        colour: lapColour(SOCKET_LAP),
        items: [key],
        colours,
      })

      let solved = false
      const refresh = addRegion(
        world,
        [
          [
            [0, -1, z - 3],
            [12, 6, z + 3],
          ],
        ],
        puzzle,
        () =>
          solved
            ? `Solved: floors without stairs  ·  lap ${signed(lap)}`
            : `Lap ${signed(lap)}  ·  the cage opens on lap ${signed(CAGE_LAP)}, the socket takes the gem on lap ${signed(SOCKET_LAP)}`,
      )
      world.onUpdate((_dt, time) => {
        setOpen(lap === CAGE_LAP)
        lamps.forEach((lamp, i) => {
          const at = i - FURTHEST
          // Past the last lamp, the end one blinks.
          const beyond = Math.abs(lap) > FURTHEST && at === Math.sign(lap) * FURTHEST
          const lit = at === lap || (beyond && Math.sin(time * 8) > 0)
          shine(lamp, lit ? 2.4 : solved ? 0.8 : 0.12)
        })
        const filled = lap === SOCKET_LAP && socket.holds() !== null
        socket.show(solved || filled ? 'filled' : lap === SOCKET_LAP ? 'ready' : 'waiting')
        if (!filled || solved) return
        solved = true
        colours.restore()
        puzzle.solved()
        refresh()
      })
      world.addBox({
        size: [0.4, 1, 0.4],
        position: [5, 0.5, z + 1.2],
        material: glow(palette.purple),
      })
    },
  }
}
