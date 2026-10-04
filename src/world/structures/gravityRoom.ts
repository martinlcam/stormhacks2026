import * as THREE from 'three'
import type { Structure } from '../World'
import { glow, gridTexture, matte, palette } from '../materials'

/* Detached rooms live far from the plaza so they are never seen directly. */
const ROOM_X = -600
/* The room is a cube this many metres on a side, with its floor at y = 0. */
const SIZE = 10
const HALF = SIZE / 2
const WALL = 0.3

/*
  One cubic room in which three surfaces are floors.

  A door reached from the plaza opens onto the floor. A second door on the
  floor is joined to a door that stands on a wall, so whoever walks through
  comes out standing on that wall, with gravity pulling them towards it. A
  further pair leads from the wall to the ceiling. Nothing in the room
  moves: each door turns the person who goes through it.

  Gems obey the same rule. One carried or thrown through a door falls
  towards whichever surface is the floor on the far side.
*/
export function gravityRoom(onWall: () => void, onCeiling: () => void): Structure {
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

      world.addItem({ position: [x + 1, 0.18, 2], material: glow(palette.purple, 1.2) })
      world.addItem({ position: [x - 2.5, 0.18, 2.5], material: glow(palette.cyan, 1.2) })

      // Every door stands 10 cm off the surface behind it, which is its backing.
      const gap = 0.1

      // In from the plaza.
      const outside = world.addDoor({
        name: 'gravity-outside',
        position: [-5, 0, 9],
        facing: 2,
        overgrown: true,
        backing: matte(palette.stone),
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
