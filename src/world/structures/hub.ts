import * as THREE from 'three'
import type { Structure } from '../World'
import { createSky, glow, gridTexture, matte, palette } from '../materials'

const SIZE = 120

/** The open plaza every other structure stands on. */
export const hub: Structure = {
  name: 'hub',
  build(world) {
    world.scene.fog = new THREE.Fog(palette.night, 40, 140)
    world.scene.add(createSky())
    world.scene.add(new THREE.HemisphereLight(0xcdb8ff, 0x1a1024, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(30, 60, 20)
    world.scene.add(sun)

    world.addBox({
      size: [SIZE, 1, SIZE],
      position: [0, -0.5, 0],
      material: new THREE.MeshStandardMaterial({
        map: gridTexture('#1a1a1a', '#3d2a52', SIZE / 2),
        roughness: 0.9,
      }),
    })

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
