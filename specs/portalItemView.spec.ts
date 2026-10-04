import { afterEach, describe, expect, it } from 'bun:test'
import { configurePlanet } from '../src/engine/planet'
import { splitEmitter } from '../src/engine/PortalItemView'
import { PortalLighting } from '../src/engine/PortalLighting'
import { lightingScenes } from '../src/game/lightingScenes'
import { buildLightingLab } from '../src/world/lightingLab'
import { World } from '../src/world/World'

afterEach(() => configurePlanet(null))

function threshold(curved = false) {
  const world = new World()
  const lab = buildLightingLab(world, lightingScenes[curved ? 3 : 2], 'threshold')
  world.finalize()
  configurePlanet(world.planetSize)

  for (const portal of world.portals) portal.settle()

  lab.update({ lampEnabled: true, referenceEnabled: false })
  return { world, lab }
}

describe('A lamp straddling a portal', () => {
  it('keeps complementary halves visible in flat and curved spaces', () => {
    for (const curved of [false, true]) {
      const { world, lab } = threshold(curved)
      const [entrance, exit] = world.portals
      const { lampView } = lab
      expect(lampView.crossing).toBe(entrance)
      expect(lampView.copy.visible).toBe(true)
      expect(lampView.distance).toBeCloseTo(0, 8)
      const nearClip = lampView.material.clippingPlanes![0]
      const farClip = lampView.copy.material.clippingPlanes![0]

      // A fragment before the plane is retained only on this side; a
      // fragment after it survives only when rendered through the exit.
      for (const offset of [-0.1, 0, 0.1]) {
        const near = lampView.center.clone().addScaledVector(entrance.spacePlane.normal, offset)
        const far = near.clone().applyMatrix4(entrance.view)
        expect(nearClip.distanceToPoint(near)).toBeCloseTo(offset, 8)
        expect(farClip.distanceToPoint(far)).toBeCloseTo(-offset, 8)
      }

      expect(farClip.equals(exit.spacePlane)).toBe(true)
      expect(lampView.copy.geometry).toBe(lab.lamp.mesh.geometry)
    }
  })

  it('illuminates both rooms at the exact plane without losing or doubling power', () => {
    for (const curved of [false, true]) {
      const { world, lab } = threshold(curved)
      const [near, far] = lab.lights
      const [entrance, exit] = world.portals
      expect(near.intensity).toBeCloseTo(20, 8)
      expect(far.intensity).toBeCloseTo(20, 8)
      expect(entrance.spacePlane.distanceToPoint(near.position)).toBeGreaterThan(0)
      expect(exit.spacePlane.distanceToPoint(far.position)).toBeGreaterThan(0)

      const transport = new PortalLighting(lab.lights, world.portals)
      transport.update()
      expect(transport.samples[0].radiance.r).toBeGreaterThan(0)
      expect(transport.samples[3].radiance.r).toBeGreaterThan(0)

      lab.update({ lampEnabled: false, referenceEnabled: false })
      transport.update()
      expect(lab.lights.every((light) => light.intensity === 0)).toBe(true)
      expect(transport.samples.every((sample) => sample.radiance.r === 0)).toBe(true)
      expect(lab.lampView.copy.material.emissiveIntensity).toBe(0)
    }
  })

  it('preserves the two physical light positions when the held mesh switches rooms', () => {
    for (const curved of [false, true]) {
      const { world, lab } = threshold(curved)
      const before = lab.lights.map((light) => ({
        position: light.position.clone(),
        intensity: light.intensity,
      }))
      lab.lamp.mesh.position.applyMatrix4(world.portals[0].transform)
      lab.update({ lampEnabled: true, referenceEnabled: false })
      expect(lab.lampView.crossing).toBe(world.portals[1])

      // The main light becomes the far portion and the copy becomes the near
      // portion, with no change to the actual illumination at the threshold.
      expect(lab.lights[0].position.distanceTo(before[1].position)).toBeLessThan(1e-8)
      expect(lab.lights[1].position.distanceTo(before[0].position)).toBeLessThan(1e-8)
      expect(lab.lights[0].intensity).toBeCloseTo(before[1].intensity, 8)
      expect(lab.lights[1].intensity).toBeCloseTo(before[0].intensity, 8)
    }
  })

  it('stops splitting away from the opening and cleans up the extra mesh', () => {
    const { world, lab } = threshold()
    lab.lamp.mesh.position.set(3, 1.15, -6)
    lab.update({ lampEnabled: true, referenceEnabled: false })
    expect(lab.lampView.crossing).toBeUndefined()
    expect(lab.lampView.copy.visible).toBe(false)
    expect(lab.lights[0].intensity).toBe(40)
    expect(lab.lights[1].intensity).toBe(0)

    lab.dispose()
    expect(world.scene.children.includes(lab.lampView.copy)).toBe(false)
    expect(lab.lamp.mesh.material).not.toBe(lab.lampView.material)
  })

  it('moves emission smoothly through the plane and at the edges of the lamp', () => {
    const radius = 0.25
    let previous = 0

    for (let step = 0; step <= 100; step++) {
      const distance = -radius + (2 * radius * step) / 100
      const cap = splitEmitter(distance, radius)
      expect(cap.front).toBeGreaterThanOrEqual(previous)
      expect(cap.front - previous).toBeLessThan(0.016)
      expect(cap.front * cap.frontOffset + (1 - cap.front) * cap.backOffset).toBeCloseTo(0, 10)

      if (cap.front > 0) expect(distance + cap.frontOffset).toBeGreaterThan(0)
      if (cap.front < 1) expect(distance + cap.backOffset).toBeLessThan(0)

      previous = cap.front
    }

    expect(previous).toBe(1)
  })
})
