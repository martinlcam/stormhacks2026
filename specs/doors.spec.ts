import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { World } from '../src/world/World'

const material = new THREE.MeshBasicMaterial()

/* The furthest any part of a door's frame reaches in front of its portal plane. */
function furthestInFront(facing: 0 | 1 | 2 | 3, scale: number, backing: boolean) {
  const world = new World()
  const portal = world.addDoor({
    name: 'door',
    position: [3, 0, -7],
    facing,
    scale,
    frameMaterial: material,
    backing: backing ? material : undefined,
  })
  let front = -Infinity
  const corner = new THREE.Vector3()
  for (const box of world.colliders) {
    for (let i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      )
      front = Math.max(front, portal.toLocal(corner, corner).z)
    }
  }
  return front
}

describe('Feature: a doorway shows only what is beyond it', () => {
  describe('Scenario: looking through a door at its partner from the side', () => {
    for (const facing of [0, 1, 2, 3] as const) {
      it(`Given a door facing quarter turn ${facing}, when its frame is built, then no part of the frame is in front of the portal, so it cannot appear inside the partner doorway`, () => {
        expect(furthestInFront(facing, 1, false)).toBeLessThan(0)
        expect(furthestInFront(facing, 1, true)).toBeLessThan(0)
      })
    }

    it('Given a quarter-size door, when its frame is built, then it too stays behind the portal', () => {
      expect(furthestInFront(3, 0.25, true)).toBeLessThan(0)
    })
  })
})
