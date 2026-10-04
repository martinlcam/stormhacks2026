import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { PlayerController } from '../src/engine/PlayerController'
import { PORTAL_ONLY_LAYER } from '../src/engine/PortalRenderer'
import { Avatar } from '../src/game/avatar'
import { quietBrowser } from './support'

const scene = new THREE.Scene()
const player = new PlayerController(quietBrowser())
const avatar = new Avatar(scene, player)

/* Every point of the body's surface as [distance from the axis, height]. */
const surface = (() => {
  const position = avatar.body.geometry.getAttribute('position')
  const points: [number, number][] = []
  for (let i = 0; i < position.count; i++) {
    points.push([Math.hypot(position.getX(i), position.getZ(i)), position.getY(i)])
  }
  return points
})()
const widestAt = (height: number) =>
  Math.max(...surface.filter(([, y]) => Math.abs(y - height) < 1e-6).map(([r]) => r))
const rim = Math.max(...surface.map(([, y]) => y))
const slotFloor = Math.min(...surface.filter(([r, y]) => r < 1e-6 && y > 0.5).map(([, y]) => y))

describe("Feature: the player's body", () => {
  describe('Scenario: its shape', () => {
    it('Given the body, then it is flat on the bottom and stands on the ground', () => {
      expect(Math.min(...surface.map(([, y]) => y))).toBe(0)
      expect(widestAt(0)).toBeCloseTo(0.3, 6)
    })

    it('Then it gets narrower towards the top', () => {
      expect(widestAt(rim)).toBeLessThan(widestAt(0) / 2)
      expect(Math.max(...surface.map(([r]) => r))).toBeCloseTo(widestAt(0), 6)
    })

    it('Then the top is a hollow: its middle is lower than its rim', () => {
      expect(slotFloor).toBeLessThan(rim - 0.03)
    })

    it('Then a ball sits in the hollow: lower than the rim, clear of the bottom of the hollow, and narrower than the body at the ground', () => {
      const head = avatar.head
      const radius = (head.geometry as THREE.IcosahedronGeometry).parameters.radius

      expect(head.position.y - radius).toBeLessThan(rim)
      expect(head.position.y - radius).toBeGreaterThan(slotFloor)
      expect(head.position.y + radius).toBeGreaterThan(rim)
      expect(radius).toBeLessThan(widestAt(0))
    })

    it('Then it has no arms or legs: a body and a head, and nothing else', () => {
      const meshes: THREE.Object3D[] = []
      scene.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) meshes.push(object)
      })

      expect(meshes).toHaveLength(2)
      expect(meshes).toContain(avatar.body)
      expect(meshes).toContain(avatar.head)
    })
  })

  describe('Scenario: seeing yourself', () => {
    it('Given the eye is inside the head, then the head is left out of my own view and shown only through doorways', () => {
      const own = new THREE.PerspectiveCamera()
      const throughDoor = new THREE.PerspectiveCamera()
      throughDoor.layers.enable(PORTAL_ONLY_LAYER)

      expect(avatar.head.layers.test(own.layers)).toBe(false)
      expect(avatar.head.layers.test(throughDoor.layers)).toBe(true)
      expect(avatar.body.layers.test(own.layers)).toBe(true)
    })

    it('Given I stand on a wall, when the body follows me, then it stands on that wall too', () => {
      player.axis = 'x-'
      player.position.set(5, 3, 1)
      avatar.update(1 / 60)

      const top = avatar.head.getWorldPosition(new THREE.Vector3())
      expect(top.x).toBeLessThan(5 - 1.4)
      expect(top.y).toBeCloseTo(3, 6)
      player.axis = 'y+'
    })
  })
})
