import { afterEach, describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { configurePlanet, onPlanet } from '../src/engine/planet'
import { lightingScenes, readLightingScene, type LightingScene } from '../src/game/lightingScenes'
import { buildLightingLab, LIGHTING_SPAWN } from '../src/world/lightingLab'
import { World } from '../src/world/World'
import { expectAt, gem, simulate } from './support'

function build(scene: LightingScene) {
  const world = new World()
  const lab = buildLightingLab(world, scene)
  world.finalize()
  configurePlanet(world.planetSize)

  for (const portal of world.portals) portal.settle()

  lab.update({ lampEnabled: true, referenceEnabled: false })
  return { world, lab }
}

afterEach(() => configurePlanet(null))

describe('Lighting lab isolation', () => {
  it('leaves the full game selected unless a known lab URL is requested', () => {
    expect(readLightingScene('')).toBeUndefined()
    expect(readLightingScene('?scene=unknown')).toBeUndefined()

    for (const scene of lightingScenes) {
      expect(readLightingScene(`?scene=${scene.id}`)).toBe(scene)
    }
  })

  it('changes curvature without changing fixtures, lights or collision geometry', () => {
    const { world: flat } = build(lightingScenes[0])
    const { world: curved } = build(lightingScenes[1])
    expect(flat.planetSize).toBeNull()
    expect(curved.planetSize).toBeGreaterThan(0)
    expect(flat.portals).toHaveLength(0)
    expect(curved.portals).toHaveLength(0)
    expect(curved.colliders).toEqual(flat.colliders)

    // UUIDs differ; geometry and material inputs must not. This catches an
    // accidental prop/light change that would spoil the visual comparison.
    const fixtures = (world: World) =>
      world.scene.children.map((object) => ({
        type: object.type,
        // The light follows the curved placement of the lamp, while meshes
        // remain in map coordinates until their vertex shader runs.
        position: object instanceof THREE.PointLight ? null : object.position.toArray(),
        geometry:
          object instanceof THREE.Mesh
            ? Array.from(object.geometry.attributes.position.array)
            : null,
        color:
          object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial
            ? object.material.color.getHex()
            : object instanceof THREE.Light
              ? object.color.getHex()
              : null,
        intensity: object instanceof THREE.Light ? object.intensity : null,
      }))

    expect(fixtures(curved)).toEqual(fixtures(flat))
  })

  it('keeps the remote bay flat and lets a thrown object cross the portal in either variant', () => {
    for (const scene of [lightingScenes[2], lightingScenes[3]]) {
      const { world } = build(scene)
      expect(world.portals).toHaveLength(2)
      // A color background forces a buffer clear on every render, erasing
      // the portal stencil. The lab must use its sky mesh instead.
      expect(world.scene.background).toBeNull()
      const [entrance, exit] = world.portals
      expect(onPlanet(exit.mesh.position)).toBe(false)
      expect(onPlanet(entrance.mesh.position)).toBe(scene.curved)

      const item = gem(0, 1, -5)
      item.velocity.set(0, 0, -5)
      simulate(item, 0.5, world.colliders, world.portals)

      expect(item.position.x).toBeCloseTo(exit.mesh.position.x, 1)
      expect(item.position.z).toBeLessThan(exit.mesh.position.z)
      expect(item.scale).toBe(1)
      expect(item.up.toArray()).toEqual([0, 1, 0])
    }
  })

  it('starts every scene clear of solid geometry with a reachable lamp and non-emissive reference gems', () => {
    for (const scene of lightingScenes) {
      const { world, lab } = build(scene)
      const spawn = new THREE.Vector3(...LIGHTING_SPAWN)
      const eye = spawn.clone().add(new THREE.Vector3(0, 1.62, 0))
      expect(world.colliders.some((box) => box.containsPoint(eye))).toBe(false)
      expect(world.items.some((item) => item.home.distanceTo(eye) < 3)).toBe(true)
      expect(lab.lamp.home.distanceTo(eye)).toBeLessThan(3)

      for (const item of world.items) {
        if (item === lab.lamp) continue

        expect(item.mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial)
        const material = item.mesh.material as THREE.MeshStandardMaterial
        expect(material.emissive.getHex()).toBe(0)
      }
    }
  })

  it('places the light at the displayed lamp on the sphere and across a doorway', () => {
    const { lab } = build(lightingScenes[3])
    const radius = 96 / (2 * Math.PI)
    lab.lamp.mesh.position.set(24, 2, 0)
    lab.update({ lampEnabled: true, referenceEnabled: false })
    expectAt(lab.light.position, radius + 2, -radius, 0)

    // Holding through a portal moves the displayed mesh before the body.
    lab.lamp.mesh.position.set(600, 1.3, 2)
    lab.update({ lampEnabled: true, referenceEnabled: false })
    expectAt(lab.light.position, 600, 1.3, 2)
    expect(lab.lamp.body.position.x).toBe(0)
  })

  it('switches the actual light off independently of the reference lighting', () => {
    const { world, lab } = build(lightingScenes[0])
    const reference = world.scene.getObjectByName('lighting-lab-key')

    if (!(reference instanceof THREE.DirectionalLight)) throw new Error('Missing reference light')

    lab.update({ lampEnabled: false, referenceEnabled: true })
    expect(lab.light.intensity).toBe(0)
    expect(reference.intensity).toBeGreaterThan(0)

    lab.update({ lampEnabled: true, referenceEnabled: false })
    expect(lab.light.intensity).toBeGreaterThan(0)
    expect(reference.intensity).toBe(0)
  })

  it('offers a doorway test view with the lamp still on the near side and within reach', () => {
    for (const scene of [lightingScenes[2], lightingScenes[3]]) {
      const world = new World()
      const lab = buildLightingLab(world, scene, 'doorway')
      const eye = new THREE.Vector3(...lab.spawn).add(new THREE.Vector3(0, 1.62, 0))
      expect(world.portals[0].plane.distanceToPoint(lab.lamp.home)).toBeGreaterThan(0)
      expect(lab.lamp.home.distanceTo(eye)).toBeLessThan(3)
      expect(world.colliders.some((box) => box.containsPoint(eye))).toBe(false)
    }
  })
})
