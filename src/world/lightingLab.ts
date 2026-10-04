import * as THREE from 'three'
import type { LightingScene, LightingView } from '../game/lightingScenes'
import type { LightingSettings } from '../game/lightingSettings'
import { groundDisk } from './groundDisk'
import { addLamp } from './lamp'
import { createSky, matte } from './materials'
import type { World } from './World'

const CIRCUMFERENCE = 96
const REACH = CIRCUMFERENCE / 2
const REMOTE_X = 600

export const LIGHTING_SPAWN = [0, 0, 3] as const

/*
  Keep the geometry, materials and lighting identical across comparisons.
  The lamp is the only emissive fixture. No fog, textures, foliage or
  animated props to hide its contribution to the surrounding surfaces.
*/
export function buildLightingLab(
  world: World,
  scene: LightingScene,
  view: LightingView = 'default',
) {
  world.planetSize = scene.curved ? CIRCUMFERENCE : null
  // A scene background color clears the stencil between portal passes.
  // Use the game's stencil-aware sky, with a neutral constant color.
  world.scene.add(createSky(0x151b25, 0x151b25))
  const fill = new THREE.HemisphereLight(0xffffff, 0x343943, 0.1)
  world.scene.add(fill)

  const sun = new THREE.DirectionalLight(0xffffff, 0)
  sun.name = 'lighting-lab-key'
  sun.position.set(10, 14, 8)
  world.scene.add(sun)

  // Use exactly the same tessellated disk in flat and curved modes.
  const ground = new THREE.Mesh(groundDisk(REACH, 96, 128), matte(0x80858d))
  ground.name = 'lighting-lab-ground'
  ground.frustumCulled = false
  world.scene.add(ground)
  world.addCollider([-REACH - 2, -1, -REACH - 2], [REACH + 2, 0, REACH + 2])

  addFixtures(world, 0, 0)

  // Identical markers make surface orientation changes apparent away from
  // the pole. Their spacing also gives a repeatable route around the planet.
  for (const z of [-12, -20, -28, -36]) {
    world.addBox({ size: [1, 2, 1], position: [5, 1, z], material: matte(0xe5c07b) })
    world.addBox({
      size: [1, 0.04, 2],
      position: [2, 0.02, z],
      material: matte(0xdde3eb),
      collide: false,
    })
  }

  if (scene.portals) addPortalBay(world)

  // The doorway view is a repeatable reproduction of shining a held lamp
  // through a portal, without requiring pointer lock or manual positioning.
  const doorwayView = scene.portals && view === 'doorway'
  const thresholdView = scene.portals && view === 'threshold'
  const lampX = doorwayView ? 0.7 : 0
  const lampZ = thresholdView ? -6 : doorwayView ? -4.5 : 1

  if (!thresholdView) {
    world.addBox({
      size: [0.8, 0.9, 0.8],
      position: [lampX, 0.45, lampZ],
      material: matte(0x636e7c),
    })
  }

  const emitter = addLamp(world, [lampX, 1.15, lampZ], 'lighting-lab-lamp')
  // Suspend the diagnostic lamp at the threshold until the player picks it up.
  if (thresholdView) emitter.lamp.body.resting = true

  return {
    ...emitter,
    spawn: thresholdView
      ? ([0, 0, -3.5] as const)
      : doorwayView
        ? ([0, 0, -2.5] as const)
        : LIGHTING_SPAWN,

    /* Run after item movement, once the engine has configured the planet. */
    update({ lampEnabled, referenceEnabled }: LightingSettings) {
      emitter.update(lampEnabled)
      sun.intensity = referenceEnabled ? 2.5 : 0
      fill.intensity = referenceEnabled ? 0.35 : 0.1
    },
  }
}

/* Reused locally and beyond the portal, with a clear walking lane at x = 0. */
function addFixtures(world: World, x: number, z: number) {
  world.addBox({ size: [12, 4, 0.3], position: [x, 2, z - 8], material: matte(0x9da6b4) })
  world.addBox({ size: [1.5, 2, 1.5], position: [x - 3, 1, z - 3], material: matte(0xd7dce3) })
  world.addBox({ size: [0.4, 4, 0.4], position: [x - 1.5, 2, z - 5], material: matte(0xd7dce3) })

  // A smooth sphere beside hard edges makes normal and shading errors easy
  // to distinguish. A box collider keeps the lab on the existing physics path.
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), matte(0xa7bfd8))
  sphere.position.set(x + 3, 0.9, z - 3)
  sphere.frustumCulled = false
  world.scene.add(sphere)
  world.addCollider([x + 2.1, 0, z - 3.9], [x + 3.9, 1.8, z - 2.1])

  world.addItem({ position: [x - 0.8, 0.25, z + 1.5], radius: 0.25, material: matte(0x65c7df) })
  world.addItem({ position: [x + 0.8, 0.25, z + 1.5], radius: 0.25, material: matte(0xe5ad78) })
}

function addPortalBay(world: World) {
  world.addBox({ size: [16, 1, 20], position: [REMOTE_X, -0.5, -2], material: matte(0x80858d) })
  addFixtures(world, REMOTE_X, -2)

  const entrance = world.addDoor({
    name: 'lighting-lab-entrance',
    position: [0, 0, -6],
    facing: 0,
    width: 2,
    height: 3,
    frameMaterial: matte(0x65c7df),
    backing: matte(0x495665),
  })
  const exit = world.addDoor({
    name: 'lighting-lab-exit',
    position: [REMOTE_X, 0, 4],
    facing: 2,
    width: 2,
    height: 3,
    frameMaterial: matte(0xe5ad78),
    backing: matte(0x495665),
  })

  world.link(entrance, exit)
}
