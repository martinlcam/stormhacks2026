import type { Structure } from '../World'
import { glow, matte, palette } from '../materials'

/*
  Two doors eight metres apart, facing each other, joined to one another.
  The strip between them has no ends: walk through one door and you come out
  of the other, so straight ahead leads back to where you started. Looking
  through either door you see the same strip repeating into the distance.
*/
export function loopCorridor(onEnter: () => void): Structure {
  return {
    name: 'loop-corridor',
    build(world) {
      // Behind the start and to its left as the player first faces.
      const z = 7
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
      west.onTraverse = onEnter
      east.onTraverse = onEnter

      // A carpet and one off-centre marker, so each lap is recognisable.
      world.addBox({
        size: [8, 0.02, 1.6],
        position: [6, 0.01, z],
        material: matte(0x2a3f55),
        collide: false,
      })
      world.addBox({
        size: [0.4, 1, 0.4],
        position: [5, 0.5, z + 1.2],
        material: glow(palette.purple),
      })
    },
  }
}
