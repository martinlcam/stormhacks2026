import * as THREE from 'three'
import type { Structure } from '../World'
import { glow, gridTexture, matte, palette } from '../materials'

/* Detached rooms live far from the hub so they are never seen directly. */
const HALL_X = 600

/*
  A booth two metres across whose door opens onto a hall far too large to fit
  inside it. Walk around the booth, then walk in.
*/
export function biggerInside(onEnter: () => void): Structure {
  return {
    name: 'bigger-inside',
    build(world) {
      // The booth: a solid block with a door on its front face.
      world.addBox({ size: [2, 2.8, 2], position: [0, 1.4, -8.1], material: matte(0x2b2140) })
      world.addBox({
        size: [2.2, 0.15, 2.2],
        position: [0, 2.875, -8.1],
        material: glow(palette.purple, 0.8),
        collide: false,
      })
      const outside = world.addDoor({
        name: 'booth',
        position: [0, 0, -7],
        facing: 0,
        overgrown: true,
      })

      // The hall: 14 × 20 × 7 metres, door in the middle of its +Z wall.
      const wall = matte(palette.stone)
      const floor = new THREE.MeshStandardMaterial({
        map: gridTexture('#241b30', '#6ecbf5', 10),
        roughness: 0.8,
      })
      world.addBox({ size: [14.6, 1, 20.6], position: [HALL_X, -0.5, 0], material: floor })
      world.addBox({ size: [14.6, 0.3, 20.6], position: [HALL_X, 7.15, 0], material: wall })
      world.addBox({ size: [14.6, 7, 0.3], position: [HALL_X, 3.5, 10.15], material: wall })
      world.addBox({ size: [14.6, 7, 0.3], position: [HALL_X, 3.5, -10.15], material: wall })
      world.addBox({ size: [0.3, 7, 20], position: [HALL_X - 7.15, 3.5, 0], material: wall })
      world.addBox({ size: [0.3, 7, 20], position: [HALL_X + 7.15, 3.5, 0], material: wall })

      for (const x of [-4.5, 4.5]) {
        for (const z of [-6, -1, 4]) {
          world.addBox({
            size: [0.8, 7, 0.8],
            position: [HALL_X + x, 3.5, z],
            material: matte(0x4a4058),
          })
          world.addBox({
            size: [0.9, 0.2, 0.9],
            position: [HALL_X + x, 5.5, z],
            material: glow(palette.cyan),
            collide: false,
          })
        }
      }
      world.addBox({ size: [2, 0.6, 2], position: [HALL_X, 0.3, -6], material: matte(0x4a4058) })
      const core = world.addBox({
        size: [1, 1, 1],
        position: [HALL_X, 2.2, -6],
        material: glow(palette.purple, 2),
        collide: false,
      })
      world.onUpdate((_dt, time) => {
        core.rotation.set(time * 0.4, time * 0.6, 0)
        core.position.y = 2.2 + Math.sin(time * 1.2) * 0.25
      })

      world.addItem({ position: [HALL_X + 2, 0.18, 6], material: glow(palette.cyan, 1.2) })

      const inside = world.addDoor({
        name: 'hall',
        position: [HALL_X, 0, 9.9],
        facing: 2,
        frameMaterial: glow(palette.purple),
      })
      world.link(outside, inside)
      outside.onTraverse = onEnter
    },
  }
}
