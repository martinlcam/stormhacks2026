import { afterEach, describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { configurePlanet } from '../src/engine/planet'
import { PortalLighting } from '../src/engine/PortalLighting'
import { lightingScenes, readLightingView } from '../src/game/lightingScenes'
import { addLantern, lanternGeometry } from '../src/world/lantern'
import { buildLightingLab } from '../src/world/lightingLab'
import { World } from '../src/world/World'
import { door, linked } from './support'

afterEach(() => configurePlanet(null))

describe('Minecraft lantern', () => {
  it('keeps the imported face UVs and crossed handle instead of a textured cube', () => {
    const geometry = lanternGeometry()
    geometry.computeBoundingBox()
    expect(geometry.index!.count / 3).toBe(30)
    expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeCloseTo(11 * 0.055)
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getX(i)).toBeLessThanOrEqual(1)
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getY(i)).toBeLessThanOrEqual(1)
    }
  })

  it('animates the three pixel frames in both portal halves and retains light when carried across', () => {
    const world = new World()
    const portals = linked(door(0, 0, 0), door(600, 0, Math.PI))
    world.portals.push(...portals)
    portals.forEach((portal) => portal.settle())
    const texture = new THREE.Texture()
    const lantern = addLantern(world, [0, 1, 0], texture)
    lantern.update(true)
    expect(lantern.lamp.mesh.name).toBe('minecraft-lantern')
    expect(lantern.lampView.copy.visible).toBe(true)
    expect(lantern.lampView.material.map).toBe(texture)
    expect(lantern.lampView.copy.material.map).toBe(texture)
    expect(texture.magFilter).toBe(THREE.NearestFilter)
    expect(texture.offset.y).toBeCloseTo(2 / 3)
    lantern.update(true, 0.41)
    expect(texture.offset.y).toBeCloseTo(1 / 3)
    lantern.update(true, 0.4)
    expect(texture.offset.y).toBe(0)

    const before = lantern.lights.map((light) => light.position.clone())
    expect(lantern.lights.map((light) => light.intensity)).toEqual([20, 20])
    const transport = new PortalLighting(lantern.lights, portals)
    transport.update()
    expect(transport.samples.some((sample) => sample.radiance.r > 0)).toBe(true)
    lantern.lamp.mesh.position.applyMatrix4(portals[0].transform)
    lantern.update(true)
    expect(lantern.lights[0].position.distanceTo(before[1])).toBeLessThan(1e-8)
    expect(lantern.lights[1].position.distanceTo(before[0])).toBeLessThan(1e-8)

    lantern.update(false)
    expect(lantern.lights.every((light) => light.intensity === 0)).toBe(true)
    expect(lantern.lampView.copy.material.emissiveIntensity).toBe(0)
    lantern.dispose()
  })

  it('can illuminate the lab independently of the amber lamp', () => {
    const world = new World()
    const lab = buildLightingLab(world, lightingScenes[3], 'lantern')
    configurePlanet(world.planetSize)
    world.portals.forEach((portal) => portal.settle())
    lab.update({ lampEnabled: false, lanternEnabled: true, referenceEnabled: false })
    expect(lab.light.intensity).toBe(0)
    expect(lab.lantern.light.intensity).toBe(40)
    const transport = new PortalLighting(lab.lights, world.portals)
    transport.update()
    expect(transport.samples.some((sample) => sample.radiance.r > 0)).toBe(true)
    expect(readLightingView('?view=lantern')).toBe('lantern')
    lab.dispose()
    expect(world.scene.children.some((object) => object instanceof THREE.PointLight)).toBe(false)
  })
})
