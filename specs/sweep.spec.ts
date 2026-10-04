import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { sweepSphereBox } from '../src/engine/sweep'

describe('Feature: fast sphere contacts keep rounded edges', () => {
  const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))

  it('stops at the face, a radius before the centre reaches it', () => {
    const normal = new THREE.Vector3()
    const t = sweepSphereBox(
      new THREE.Vector3(-1, 0.5, 0.5),
      new THREE.Vector3(1, 0.5, 0.5),
      0.2,
      box,
      normal,
    )
    expect(t).toBeCloseTo(0.4, 8)
    expect(normal.toArray()).toEqual([-1, 0, 0])
  })

  it('allows a sphere to pass the empty space outside a rounded corner', () => {
    const t = sweepSphereBox(
      new THREE.Vector3(-0.18, -1, -0.18),
      new THREE.Vector3(-0.18, 2, -0.18),
      0.2,
      box,
      new THREE.Vector3(),
    )
    expect(t).toBe(Infinity)
  })

  it('finds an edge contact with a diagonal normal', () => {
    const normal = new THREE.Vector3()
    const t = sweepSphereBox(
      new THREE.Vector3(-1, 0.5, -1),
      new THREE.Vector3(1, 0.5, 1),
      0.2,
      box,
      normal,
    )
    expect(t).toBeCloseTo((1 - 0.2 / Math.sqrt(2)) / 2, 8)
    expect(normal.x).toBeCloseTo(-Math.SQRT1_2, 8)
    expect(normal.z).toBeCloseTo(-Math.SQRT1_2, 8)
  })

  it('does not catch a sphere already touching and moving away', () => {
    const t = sweepSphereBox(
      new THREE.Vector3(-0.2, 0.5, 0.5),
      new THREE.Vector3(-1, 0.5, 0.5),
      0.2,
      box,
      new THREE.Vector3(),
    )
    expect(t).toBe(Infinity)
  })
})
