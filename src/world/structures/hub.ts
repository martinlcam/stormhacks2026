import * as THREE from 'three'
import type { Structure } from '../World'
import { createSky, glow, gridTexture, matte, palette } from '../materials'

/*
  Side of the plaza. It is drawn as a planet whose circumference is this
  length, so the radius is SIZE / 2π, about 38 m.
*/
const SIZE = 240
const TILE = 20

/* The open plaza every other structure stands on. */
export const hub: Structure = {
  name: 'hub',
  build(world) {
    world.scene.fog = new THREE.Fog(palette.night, 40, 140)
    world.scene.add(createSky())
    world.scene.add(new THREE.HemisphereLight(0xcdb8ff, 0x1a1024, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(30, 60, 20)
    world.scene.add(sun)

    world.planetSize = SIZE

    // The ground is drawn as tiles, because each object is moved as a whole
    // to its nearest copy when the plaza repeats. It collides as one slab
    // that reaches past the edges, so there is nothing to fall off.
    const ground = new THREE.MeshStandardMaterial({
      map: gridTexture('#1a1a1a', '#3d2a52', TILE / 2),
      roughness: 0.9,
    })
    for (let x = -SIZE / 2 + TILE / 2; x < SIZE / 2; x += TILE) {
      for (let z = -SIZE / 2 + TILE / 2; z < SIZE / 2; z += TILE) {
        world.addBox({
          size: [TILE, 1, TILE],
          position: [x, -0.5, z],
          material: ground,
          collide: false,
        })
      }
    }
    const reach = SIZE / 2 + 12
    world.addCollider([-reach, -1, -reach], [reach, 0, reach])

    // Landmarks: without fixed reference points you cannot tell that space
    // has been stitched together wrongly.
    const colours = [palette.purple, palette.cyan]
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const height = 4 + (i % 3) * 2
      const x = Math.round(Math.cos(angle) * 30)
      const z = Math.round(Math.sin(angle) * 30)
      world.addBox({
        size: [1.2, height, 1.2],
        position: [x, height / 2, z],
        material: matte(palette.stone),
      })
      world.addBox({
        size: [1.3, 0.25, 1.3],
        position: [x, height + 0.125, z],
        material: glow(colours[i % 2]),
        collide: false,
      })
    }
  },
}
