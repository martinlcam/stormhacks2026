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
