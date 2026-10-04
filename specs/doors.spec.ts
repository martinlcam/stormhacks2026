import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import type { Axis } from '../src/engine/gravity'
import { BACKING_GAP, PORTAL_THICKNESS } from '../src/engine/Portal'
import { World } from '../src/world/World'

const material = new THREE.MeshBasicMaterial()

/* The furthest any part of a door's frame reaches in front of its portal plane. */
function furthestInFront(facing: 0 | 1 | 2 | 3, scale: number, backing: boolean, up: Axis = 'y+') {
  const world = new World()
  const portal = world.addDoor({
    name: 'door',
    position: [3, 0, -7],
    facing,
    up,
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

  describe('Scenario: a door standing on a wall or the ceiling', () => {
    for (const up of ['x+', 'x-', 'y-', 'z+', 'z-'] as const) {
      it(`Given a door whose up is ${up}, when its frame is built, then the frame is still wholly behind the portal`, () => {
        for (const facing of [0, 1, 2, 3] as const) {
          expect(furthestInFront(facing, 1, true, up)).toBeLessThan(0)
        }
      })
    }
  })
})

describe('Feature: no flicker when stepping through a door', () => {
  describe('Scenario: the last few centimetres before crossing', () => {
    it('Given the camera is so close that it sees only the back of the portal surface, then that back is still in front of the wall behind the door', () => {
      expect(PORTAL_THICKNESS).toBeLessThan(BACKING_GAP)
    })

    for (const scale of [1, 0.25]) {
      it(`Given a door of scale ${scale} with a slab behind it, when it is built, then the slab starts further back than the portal surface is deep`, () => {
        const world = new World()
        const portal = world.addDoor({
          name: 'door',
          position: [3, 0, -7],
          facing: 1,
          scale,
          frameMaterial: material,
          backing: material,
        })
        world.link(portal, portal)
        world.finalize()

        expect(portal.ghostColliders.size).toBeGreaterThan(0)
        const corner = new THREE.Vector3()
        for (const box of portal.ghostColliders) {
          // Local z is in units of the door's own scale, as PORTAL_THICKNESS is.
          const front = Math.max(
            portal.toLocal(corner.copy(box.min), corner).z,
            portal.toLocal(corner.copy(box.max), corner).z,
          )
          expect(front).toBeLessThan(-PORTAL_THICKNESS)
        }
      })
    }
  })
})
