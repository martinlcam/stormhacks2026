import * as THREE from 'three'
import { readFlag } from '../../flags'
import type { Structure } from '../World'
import { canvasGround } from '../canvasFloor'
import { groundDisk } from '../groundDisk'
import { glow, palette, rockyGround, Sky } from '../materials'

/*
  Distance around the planet. Its radius is this / 2π, about 22 m, and the
  flat map of it is a disk of radius CIRCUMFERENCE / 2.
*/
const CIRCUMFERENCE = 140

/* The open plaza every other structure stands on. */
export const hub: Structure = {
  name: 'hub',
  build(world) {
    world.scene.fog = new THREE.Fog(palette.night, 40, 140)
    world.sky = new Sky()
    world.scene.add(world.sky.mesh)
    // Only enough light from the sky to make out shapes: the lamp the
    // player carries is what lights the world.
    world.scene.add(new THREE.HemisphereLight(0xcdb8ff, 0x1a1024, 0.12))
    const sun = new THREE.DirectionalLight(0xffffff, 0.1)
    sun.position.set(30, 60, 20)
    world.scene.add(sun)

    world.planetSize = CIRCUMFERENCE

    const reach = CIRCUMFERENCE / 2
    const floor = readFlag('floor') === 'canvas' ? canvasGround() : rockyGround()
    const ground = new THREE.Mesh(groundDisk(reach, 120, 128), floor)
    ground.frustumCulled = false
    world.scene.add(ground)
    // On the map the ground is a flat slab under the whole disk.
    world.addCollider([-reach - 12, -1, -reach - 12], [reach + 12, 0, reach + 12], true)

    // Gems to carry and throw, set out around the spawn point.
    world.addItem({ position: [1.5, 0.18, -0.5], material: glow(palette.cyan, 1.2) })
    world.addItem({ position: [-1.5, 0.18, -0.5], material: glow(palette.purple, 1.2) })
    world.addItem({ position: [-3, 0.18, -4], material: glow(palette.bone, 0.9) })

    // Landmarks: without fixed reference points you cannot tell that space
    // has been stitched together wrongly.
    const colours = [palette.purple, palette.cyan]
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const height = 4 + (i % 3) * 2
      const x = Math.round(Math.cos(angle) * 16)
      const z = Math.round(Math.sin(angle) * 16)
      world.addBox({
        size: [1.2, height, 1.2],
        position: [x, height / 2, z],
        overgrown: true,
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
