import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import * as THREE from 'three'
import {
  configurePlanet,
  materialAt,
  planetMaterial,
  POLE,
  Site,
  siteUniform,
} from '../src/engine/planet'
import { Portal } from '../src/engine/Portal'
import { PortalLighting } from '../src/engine/PortalLighting'
import { addLamp, addWorldLamp } from '../src/world/lamp'
import { rockyGround } from '../src/world/materials'
import { World } from '../src/world/World'
import { expectAt, linked } from './support'

afterEach(() => configurePlanet(null))

function placedDoor(
  site: Site,
  position: [number, number, number],
  scale = 1,
  up: 'y+' | 'x-' = 'y+',
) {
  return new Portal({
    name: 'test door',
    site,
    position: new THREE.Vector3(...position),
    yaw: 0,
    width: 2,
    height: 3,
    scale,
    up,
  })
}

function shaderFor(material: THREE.Material) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  }
  // These shader hooks do not use a renderer; compilation itself is browser-tested.
  Reflect.apply(material.onBeforeCompile, material, [shader, undefined])
  return shader
}

describe('The full-world lamp', () => {
  it('starts within reach beside the starting path and remains active without lab settings', () => {
    const world = new World()
    const emitter = addWorldLamp(world)
    emitter.update()
    const eye = new THREE.Vector3(0, 1.62, 2)
    expect(emitter.lamp.home.distanceTo(eye)).toBeLessThan(3)
    expect(world.colliders.some((box) => box.containsPoint(eye))).toBe(false)
    expect(world.items).toContain(emitter.lamp)
    expect(world.scene.children).toContain(emitter.light)
    expect(emitter.light.intensity).toBe(40)

    emitter.dispose()
    expect(world.scene.children).not.toContain(emitter.light)
    expect(world.scene.children).not.toContain(emitter.lights[1])
  })

  it('follows the displayed mesh into another site before the held body crosses', () => {
    configurePlanet(140)
    const far = new Site('lamp remote site', 35, 0)
    const emitter = addLamp(new World(), [0, 1, 0])
    expect(emitter.lamp.body.site).toBe(POLE)
    siteUniform(emitter.lamp.mesh.material as THREE.Material).value = far.motion
    emitter.update()
    const radius = 140 / (2 * Math.PI)
    expectAt(emitter.light.position, radius + 1, -radius, 0)
    expect(siteUniform(emitter.lampView.copy.material).value).toBe(far.motion)
  })

  it('transports light from an off-pole site using the same frames as the portal camera', () => {
    configurePlanet(140)
    const far = new Site('lamp entrance site', -33, -33)
    const other = new Site('lamp exit site', 33, 33)
    const [entrance, exit] = linked(placedDoor(far, [0, 0, 0]), placedDoor(other, [0, 0, 0]))
    for (const portal of [entrance, exit]) portal.settle()

    const world = new World()
    world.portals.push(entrance, exit)
    const emitter = addLamp(world, [0, 1, 0.1])
    siteUniform(emitter.lampView.material).value = far.motion
    emitter.update()
    expect(emitter.lampView.crossing).toBe(entrance)
    expect(emitter.lampView.copy.visible).toBe(true)
    expect(entrance.spacePlane.distanceToPoint(emitter.light.position)).toBeGreaterThan(0)
    expect(exit.spacePlane.distanceToPoint(emitter.lights[1].position)).toBeGreaterThan(0)

    const transport = new PortalLighting(emitter.lights, world.portals)
    transport.update()
    expect(transport.samples[0].radiance.r).toBeGreaterThan(0)
    expect(transport.samples[3].radiance.r).toBeGreaterThan(0)
    const expected = emitter.light.position.clone().applyMatrix4(entrance.view)
    expect(transport.samples[0].position.distanceTo(expected)).toBeLessThan(1e-8)
    expect(transport.samples[0].position.clone().applyMatrix4(exit.spaceInverse).z).toBeLessThan(0)
  })

  it('keeps range and illumination continuous as a lamp passes through a resizing door', () => {
    const world = new World()
    const portals = linked(placedDoor(POLE, [0, 0, 0]), placedDoor(POLE, [600, 0, 0], 0.25))
    world.portals.push(...portals)
    for (const portal of portals) portal.settle()

    const emitter = addLamp(world, [0, 1, 0])
    emitter.update()
    const before = emitter.lights.map((light) => ({
      position: light.position.clone(),
      intensity: light.intensity,
      range: light.distance,
    }))
    emitter.lamp.mesh.position.applyMatrix4(portals[0].transform)
    emitter.lamp.mesh.scale.setScalar(0.25)
    emitter.update()
    for (const index of [0, 1]) {
      const previous = before[1 - index]
      expect(emitter.lights[index].position.distanceTo(previous.position)).toBeLessThan(1e-8)
      expect(emitter.lights[index].intensity).toBeCloseTo(previous.intensity, 8)
      expect(emitter.lights[index].distance).toBeCloseTo(previous.range, 8)
    }

    // Fully clear of the small door, its light still has the shrunk range.
    emitter.lamp.mesh.position.z = 1
    emitter.update()
    expect(emitter.light.distance).toBe(3)
    expect(emitter.light.intensity).toBe(2.5)
  })

  it('splits and illuminates through a doorway mounted on a wall', () => {
    const world = new World()
    const [entrance, exit] = linked(
      placedDoor(POLE, [600, 0, 0]),
      placedDoor(POLE, [620, 4, 0], 1, 'x-'),
    )
    world.portals.push(entrance, exit)
    for (const portal of world.portals) portal.settle()

    const emitter = addLamp(world, [600, 1, 0])
    emitter.update()
    const far = emitter.lights[1].position.clone()
    expect(exit.spacePlane.distanceToPoint(far)).toBeGreaterThan(0)
    emitter.lamp.mesh.position.applyMatrix4(entrance.transform)
    emitter.update()
    expect(emitter.lampView.crossing).toBe(exit)
    expect(emitter.light.position.distanceTo(far)).toBeLessThan(1e-8)
  })

  it('composes portal lighting with the textured ground shader and cloned site materials', () => {
    const texture = spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(
      new THREE.Texture(),
    )
    try {
      const world = new World()
      const portals = linked(placedDoor(POLE, [0, 0, 0]), placedDoor(POLE, [600, 0, 0]))
      for (const portal of portals) portal.settle()

      const emitter = addWorldLamp(world)
      const transport = new PortalLighting(emitter.lights, portals)
      const ground = rockyGround()
      planetMaterial(ground)
      transport.apply(ground)
      const shader = shaderFor(ground)
      expect(shader.uniforms.uClose).toBeDefined()
      expect(shader.uniforms.uPortalLights).toBeDefined()
      expect(shader.fragmentShader).toContain('groundPointNormal, normalize(vViewPosition)')
      expect(shader.fragmentShader).toContain('DYNAMIC_LIGHT_NORMAL, normalize(vViewPosition)')

      // A late material clone must keep its own site uniform and receive
      // only one copy of the portal contribution, even if the base is patched.
      const far = new Site('late lamp material', 35, 0)
      const copy = materialAt(ground, far)
      transport.apply(copy)
      const cloned = shaderFor(copy)
      expect(cloned.uniforms.uSite.value).toBe(far.motion)
      expect(cloned.fragmentShader.match(/struct PortalPointLight/g)).toHaveLength(1)

      // Cached model materials also survive world restarts/hot reloads.
      // Replace the previous transport's uniforms instead of wrapping twice.
      const restarted = new PortalLighting(emitter.lights, portals)
      restarted.apply(copy)
      const refreshed = shaderFor(copy)
      expect(refreshed.fragmentShader.match(/struct PortalPointLight/g)).toHaveLength(1)
      expect(refreshed.uniforms.uPortalLights.value).toBe(restarted.samples)
      expect(refreshed.uniforms.uSite.value).toBe(far.motion)
    } finally {
      texture.mockRestore()
    }
  })
})
