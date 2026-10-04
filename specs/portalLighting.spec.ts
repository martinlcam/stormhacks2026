import { afterEach, describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { configurePlanet } from '../src/engine/planet'
import { PortalLighting } from '../src/engine/PortalLighting'
import { door, expectAt, linked } from './support'

afterEach(() => configurePlanet(null))

function flatPair(exitScale = 1) {
  configurePlanet(null)
  const portals = linked(door(0, 0, 0), door(20, 0, Math.PI, exitScale))

  for (const portal of portals) portal.settle()

  const light = new THREE.PointLight(0xffffff, 40, 12, 2)
  light.position.set(0, 1, 2)
  const transport = new PortalLighting([light], portals)
  transport.update()
  return { light, transport, portals }
}

describe('Point light through a portal', () => {
  it('puts the virtual lamp behind the exit while preserving light color and falloff', () => {
    const { transport } = flatPair()
    const [sample, reverse] = transport.samples
    expectAt(sample.position, 20, 1, 2)
    expect(sample.radiance.r).toBe(40)
    expect(sample.range).toBe(12)
    expect(sample.decay).toBe(2)
    expect(reverse.radiance.r).toBe(0)

    // The shader clips rays in the exit's local frame. The virtual source
    // must be behind z = 0, with actual receivers on the positive side.
    expectAt(sample.position.clone().applyMatrix4(sample.worldToExit), 0, 1, -2)
    expectAt(new THREE.Vector3(20, 0, -2).applyMatrix4(sample.worldToExit), 0, 0, 2)
    expect(sample.opening.toArray()).toEqual([0.6, 2.2])
  })

  it('stops transmitting when the lamp is behind the entrance, out of reach, or switched off', () => {
    const { light, transport } = flatPair()

    for (const position of [
      [0, 1, -2],
      [0, 1, 13],
      [15, 1, 2],
      [0, 15, 2],
    ]) {
      light.position.fromArray(position)
      transport.update()
      expect(transport.samples[0].radiance.r).toBe(0)
    }

    light.position.set(0, 1, 2)
    light.intensity = 0
    transport.update()
    expect(transport.samples.every((sample) => sample.radiance.r === 0)).toBe(true)
  })

  it('lets an off-centre lamp shine through the opening', () => {
    const { light, transport } = flatPair()
    light.position.set(3, 1, 2)
    transport.update()
    expect(transport.samples[0].radiance.r).toBeGreaterThan(0)

    // Independent ray/plane intersection: light aimed at a point beyond
    // the opposite edge passes through the centre of the door.
    const sample = transport.samples[0]
    const localLamp = sample.position.clone().applyMatrix4(sample.worldToExit)
    const localReceiver = new THREE.Vector3(17, 1, -2).applyMatrix4(sample.worldToExit)
    const ray = new THREE.Ray(localLamp, localReceiver.sub(localLamp).normalize())
    const crossing = ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      new THREE.Vector3(),
    )
    expect(crossing).not.toBeNull()
    expectAt(crossing!, 0, 1, 0)
  })

  it('reverses transport when the lamp itself crosses to the other room', () => {
    const { light, transport } = flatPair()
    light.position.set(20, 1, -2)
    transport.update()
    expect(transport.samples[0].radiance.r).toBe(0)
    expect(transport.samples[1].radiance.r).toBeGreaterThan(0)
    expectAt(transport.samples[1].position, 0, 1, -2)
  })

  it('preserves relative brightness and reach across a resizing doorway', () => {
    const { transport } = flatPair(0.25)
    const [sample] = transport.samples
    expectAt(sample.position, 20, 0.25, 0.5)
    expect(sample.range).toBe(3)
    expect(sample.radiance.r).toBeCloseTo(40 * 0.25 ** 2)
    expectAt(sample.position.clone().applyMatrix4(sample.worldToExit), 0, 1, -2)
  })

  it('uses rendered positions in both directions between a spherical and a flat doorway', () => {
    configurePlanet(96)
    const radius = 96 / (2 * Math.PI)
    const portals = linked(door(24, 0, 0), door(600, 0, Math.PI))

    for (const portal of portals) portal.settle()

    // At the equator, +X is up. This lamp is one metre above the surface
    // and two metres in front of the opening, in actual rendered space.
    const light = new THREE.PointLight(0xffffff, 40, 12, 2)
    light.position.set(radius + 1, -radius, 2)
    const transport = new PortalLighting([light], portals)
    transport.update()
    expect(transport.samples[0].radiance.r).toBeGreaterThan(0)
    expectAt(transport.samples[0].position, 600, 1, 2)

    light.position.set(600, 1, -2)
    transport.update()
    const reverse = transport.samples[1]
    expect(reverse.radiance.r).toBeGreaterThan(0)
    expectAt(reverse.position, radius + 1, -radius, -2)
    expectAt(reverse.position.clone().applyMatrix4(reverse.worldToExit), 0, 1, -2)
  })
})
