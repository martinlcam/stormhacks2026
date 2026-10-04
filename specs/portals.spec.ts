import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { portalTransform, yawDelta } from '../src/engine/portalMath'
import { expectAt } from './support'

function frame(x: number, y: number, z: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z)
}

describe('Feature: walking through a pair of linked doors', () => {
  describe('Scenario: stepping in one door and out of the other', () => {
    it('Given two linked doors, when a point enters the first, then it leaves the second mirrored left to right and front to back', () => {
      const first = frame(3, 0, -7, 0.4)
      const second = frame(600, 2, 10, 2.1)
      const through = portalTransform(first, second)

      const entering = new THREE.Vector3(0.3, 1.6, 0.5).applyMatrix4(first)
      const leaving = entering.applyMatrix4(through).applyMatrix4(second.clone().invert())

      expectAt(leaving, -0.3, 1.6, -0.5)
    })

    it('Given a door whose partner faces east, when I walk straight in, then I come out walking east', () => {
      const first = frame(0, 0, 0, 0)
      const partner = frame(10, 0, 0, Math.PI / 2)
      const through = portalTransform(first, partner)

      const heading = new THREE.Vector3(0, 0, -1).transformDirection(through)

      expectAt(heading, 1, 0, 0)
    })
  })

  describe('Scenario: going through and coming straight back', () => {
    it('Given two linked doors, when I go through one and back through the other, then I am exactly where I started', () => {
      const a = frame(1, 2, 3, 0.7)
      const b = frame(-40, 0, 9, -1.3)

      const thereAndBack = portalTransform(a, b).multiply(portalTransform(b, a))

      expectAt(new THREE.Vector3(5, -2, 8).applyMatrix4(thereAndBack), 5, -2, 8)
    })
  })

  describe('Scenario: the door turns you', () => {
    it('Given two doors standing back to back, when I walk through, then my heading does not change', () => {
      const first = frame(0, 0, 0, 0)
      const behind = frame(0, 0, -5, Math.PI)

      expect(yawDelta(portalTransform(first, behind))).toBeCloseTo(0, 6)
    })

    it('Given a partner door facing east, when I walk in heading north, then I am turned a quarter turn clockwise', () => {
      const first = frame(0, 0, 0, 0)
      const partner = frame(4, 0, 0, Math.PI / 2)

      expect(yawDelta(portalTransform(first, partner))).toBeCloseTo(-Math.PI / 2, 6)
    })
  })
})

describe('Feature: a door that changes your size', () => {
  describe('Scenario: walking from a full-size door into a quarter-size one', () => {
    const tall = frame(0, 0, 0, 0)
    const small = frame(20, 0, 0, 0).scale(new THREE.Vector3(0.25, 0.25, 0.25))
    const through = portalTransform(tall, small)

    it('Given my eye is 1.6 m up at the tall door, when I go through, then it is 0.4 m up at the small door', () => {
      const eye = new THREE.Vector3(0.4, 1.6, 0.8).applyMatrix4(through)

      expectAt(eye, 20 - 0.1, 0.4, -0.2)
    })

    it('Then everything about me is a quarter of the size, and I am only turned, not skewed', () => {
      expect(through.getMaxScaleOnAxis()).toBeCloseTo(0.25, 6)
      expect(Math.abs(yawDelta(through))).toBeCloseTo(Math.PI, 6)
    })
  })
})
