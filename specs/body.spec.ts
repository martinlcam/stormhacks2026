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
const slotFloor = Math.min(...surface.filter(([r, y]) => r < 1e-6 && y > 0.1).map(([, y]) => y))

describe("Feature: the player's body", () => {
  describe('Scenario: its shape', () => {
    it('Given the body, then it is flat on the bottom and stands on the ground', () => {
      expect(Math.min(...surface.map(([, y]) => y))).toBe(0)
      expect(widestAt(0)).toBeCloseTo(0.3, 6)
    })

    it('Then it gets narrower towards the top, but the top is still wide', () => {
      expect(widestAt(rim)).toBeLessThan(widestAt(0))
      expect(widestAt(rim)).toBeGreaterThan(widestAt(0) * 0.7)
      expect(Math.max(...surface.map(([r]) => r))).toBeCloseTo(widestAt(0), 6)
    })

    it('Then it is short: with its head, about half as tall as the space the player takes up', () => {
      const radius = (avatar.head.geometry as THREE.IcosahedronGeometry).parameters.radius

      expect(avatar.head.position.y + radius).toBeLessThan(1)
      expect(rim).toBeLessThan(0.7)
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
      avatar.update()

      const top = avatar.head.getWorldPosition(new THREE.Vector3())
      expect(top.x).toBeLessThan(5 - 0.6)
      expect(top.y).toBeCloseTo(3, 6)
      player.axis = 'y+'
    })
  })

  describe('Scenario: the head turns with my view and with nothing else', () => {
    /* Which way the front of the head points, in the world. */
    const facing = () => {
      avatar.update()
      scene.updateMatrixWorld(true)
      return new THREE.Vector3(0, 0, -1).transformDirection(avatar.head.matrixWorld)
    }
    const stand = () => {
      player.position.set(0, 0, 0)
      player.velocity.set(0, 0, 0)
      player.yaw = 0
      player.pitch = 0
    }

    it('Given I look up, then the head tips up by the same angle', () => {
      stand()
      player.pitch = 0.5

      expect(facing().y).toBeCloseTo(Math.sin(0.5), 6)
    })

    it('Given I turn to my left, then the head turns to the left with me', () => {
      stand()
      player.yaw = Math.PI / 2

      const front = facing()
      expect(front.x).toBeCloseTo(-1, 6)
      expect(front.z).toBeCloseTo(0, 6)
    })

    it('Given I walk and run without moving my view, then the head does not roll at all', () => {
      stand()
      const still = avatar.head.quaternion.clone()

      for (const [vx, vz] of [
        [4.5, 0],
        [0, -8],
        [-3, 3],
      ]) {
        player.velocity.set(vx, 0, vz)
        player.position.x += vx
        for (let i = 0; i < 30; i++) avatar.update()
        expect(avatar.head.quaternion.angleTo(still)).toBeCloseTo(0, 9)
      }
    })
  })
})
