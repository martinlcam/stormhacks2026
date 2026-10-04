import * as THREE from 'three'
import type { Structure } from '../World'
import { createSky, glow, matte, palette, rockyGround } from '../materials'

/*
  Distance around the planet. Its radius is this / 2π, about 38 m, and the
  flat map of it is a disk of radius CIRCUMFERENCE / 2.
*/
const CIRCUMFERENCE = 240

/*
  The whole ground as one disk on the flat map. The planet shader closes it
  into a sphere: the centre is the pole and the rim is the point opposite.
*/
function groundDisk(radius: number, rings: number, sectors: number): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let ring = 0; ring <= rings; ring++) {
    const r = (ring / rings) * radius
    for (let sector = 0; sector <= sectors; sector++) {
      const angle = (sector / sectors) * Math.PI * 2
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r
      positions.push(x, 0, z)
      normals.push(0, 1, 0)
      // One grid square every two metres of map.
      uvs.push(x / 2, z / 2)
    }
  }
  const row = sectors + 1
  for (let ring = 0; ring < rings; ring++) {
    for (let sector = 0; sector < sectors; sector++) {
      const a = ring * row + sector
      const b = a + row
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

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

    world.planetSize = CIRCUMFERENCE

    const reach = CIRCUMFERENCE / 2
    const ground = new THREE.Mesh(groundDisk(reach, 120, 128), rockyGround())
    ground.frustumCulled = false
    world.scene.add(ground)
    // On the map the ground is a flat slab under the whole disk.
    world.addCollider([-reach - 12, -1, -reach - 12], [reach + 12, 0, reach + 12])

    // Gems to carry and throw, set out around the spawn point.
    world.addItem({ position: [1.5, 0.18, -0.5], material: glow(palette.cyan, 1.2) })
    world.addItem({ position: [-1.5, 0.18, -0.5], material: glow(palette.purple, 1.2) })
    world.addItem({ position: [-11, 0.18, -3], material: glow(palette.bone, 0.9) })

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
