import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { portalTransform, yawDelta } from './portalMath'

function frame(x: number, y: number, z: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z)
}

function expectVec(v: THREE.Vector3, x: number, y: number, z: number) {
  expect(v.x).toBeCloseTo(x, 6)
  expect(v.y).toBeCloseTo(y, 6)
  expect(v.z).toBeCloseTo(z, 6)
}

test('a point in front of the source lands mirrored behind the destination', () => {
  const src = frame(3, 0, -7, 0.4)
  const dst = frame(600, 2, 10, 2.1)
  const t = portalTransform(src, dst)

  const local = new THREE.Vector3(0.3, 1.6, 0.5)
  const world = local.clone().applyMatrix4(src)
  const landed = world.applyMatrix4(t).applyMatrix4(dst.clone().invert())
  expectVec(landed, -0.3, 1.6, -0.5)
})

test('walking in along -Z comes out along the destination +Z', () => {
  const src = frame(0, 0, 0, 0)
  const dst = frame(10, 0, 0, Math.PI / 2) // front faces world +X
  const t = portalTransform(src, dst)
  const heading = new THREE.Vector3(0, 0, -1).transformDirection(t)
  expectVec(heading, 1, 0, 0)
})

test('there and back again is the identity', () => {
  const a = frame(1, 2, 3, 0.7)
  const b = frame(-40, 0, 9, -1.3)
  const round = portalTransform(a, b).multiply(portalTransform(b, a))
  const p = new THREE.Vector3(5, -2, 8)
  expectVec(p.clone().applyMatrix4(round), 5, -2, 8)
})

test('yawDelta reports the turn a portal applies', () => {
  const src = frame(0, 0, 0, 0)
  const dst = frame(0, 0, -5, Math.PI) // back to back: straight through, no net turn
  expect(yawDelta(portalTransform(src, dst))).toBeCloseTo(0, 6)

  const side = frame(4, 0, 0, Math.PI / 2)
  // Heading -Z comes out heading +X, a quarter turn clockwise seen from above.
  expect(yawDelta(portalTransform(src, side))).toBeCloseTo(-Math.PI / 2, 6)
})

test('portals of different scale resize what passes through', () => {
  const src = frame(0, 0, 0, 0)
  const dst = frame(20, 0, 0, 0).scale(new THREE.Vector3(0.25, 0.25, 0.25))
  const t = portalTransform(src, dst)

  // Eye height 1.6 in front of the tall door lands 0.4 up behind the small one.
  const landed = new THREE.Vector3(0.4, 1.6, 0.8).applyMatrix4(t)
  expectVec(landed, 20 - 0.1, 0.4, -0.2)
  expect(t.getMaxScaleOnAxis()).toBeCloseTo(0.25, 6)
  // Heading is still a pure turn.
  expect(yawDelta(t)).toBeCloseTo(Math.PI, 6)
})

test('a doorway on the map is carried to the sphere and stands upright there', async () => {
  const { configurePlanet, onPlanet, planetMotion } = await import('./planet')
  configurePlanet(240)
  const radius = 240 / (2 * Math.PI)

  // A quarter of the way round: the foot is on the equator, "up" points out.
  const foot = new THREE.Vector3(60, 0, 0)
  const motion = planetMotion(foot, new THREE.Matrix4())
  expectVec(foot.clone().applyMatrix4(motion), radius, -radius, 0)
  expectVec(new THREE.Vector3(60, 2, 0).applyMatrix4(motion), radius + 2, -radius, 0)

  // Nothing moves at the pole, and rooms off the map disk are never moved.
  const pole = new THREE.Vector3()
  expectVec(new THREE.Vector3(0, 1, 0).applyMatrix4(planetMotion(pole, motion)), 0, 1, 0)
  const room = new THREE.Vector3(600, 0, 0)
  expect(onPlanet(room)).toBe(false)
  expectVec(room.clone().applyMatrix4(planetMotion(room, motion)), 600, 0, 0)
  configurePlanet(null)
})

test('walking straight in any direction returns to the start after one lap', async () => {
  const { configurePlanet, walkOnPlanet } = await import('./planet')
  configurePlanet(240)
  for (const [x, z, yaw] of [
    [0, 0, 0],
    [7, -3, 0.9],
    [-20, 35, 2.4],
    [50, 10, -1.1],
  ]) {
    const speed = 6
    const walker = {
      position: new THREE.Vector3(x, 0, z),
      velocity: new THREE.Vector3(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed),
      yaw,
    }
    const steps = 2400
    const dt = 240 / speed / steps
    for (let i = 0; i < steps; i++) walkOnPlanet(walker, dt)
    expect(walker.position.x).toBeCloseTo(x, 3)
    expect(walker.position.z).toBeCloseTo(z, 3)
    expect(Math.cos(walker.yaw - yaw)).toBeCloseTo(1, 6)
  }
  configurePlanet(null)
})

test('walking three sides of a triangle on the planet turns the walker', async () => {
  const { configurePlanet, walkOnPlanet } = await import('./planet')
  configurePlanet(240)
  // Pole → equator, a quarter turn along the equator, back to the pole:
  // a triangle with three right angles, without the walker ever turning.
  const walker = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(1, 0, 0),
    yaw: -Math.PI / 2,
  }
  const leg = (vx: number, vz: number) => {
    walker.velocity.set(vx, 0, vz)
    for (let i = 0; i < 600; i++) walkOnPlanet(walker, 0.1)
    return walker.velocity.clone()
  }
  leg(1, 0) // 60 m "east" to the equator
  expectVec(walker.position, 60, 0, 0)
  leg(0, 1) // 60 m along the equator
  expectVec(walker.position, 0, 0, 60)
  leg(0, -1) // 60 m back to the pole
  expect(walker.position.length()).toBeCloseTo(0, 3)
  // The walker never turned, yet now faces a quarter turn from where they began.
  expect(Math.abs(Math.sin(walker.yaw - -Math.PI / 2))).toBeCloseTo(1, 4)
  configurePlanet(null)
})
