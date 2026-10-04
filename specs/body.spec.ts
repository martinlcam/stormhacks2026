import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { PlayerController } from '../src/engine/PlayerController'
import { PORTAL_ONLY_LAYER } from '../src/engine/PortalRenderer'
import { Avatar } from '../src/game/avatar'
import { quietBrowser } from './support'

const scene = new THREE.Scene()
const player = new PlayerController(quietBrowser())
const avatar = new Avatar(scene, player)

/* Let the figure catch up with wherever the player now is and is looking. */
const settle = () => {
  for (let i = 0; i < 5; i++) avatar.update(1)
}

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
      const radius = (avatar.head.geometry as THREE.SphereGeometry).parameters.radius

      expect(avatar.head.position.y + radius).toBeLessThan(1)
      expect(rim).toBeLessThan(0.7)
    })

    it('Then the top is a hollow: its middle is lower than its rim', () => {
      expect(slotFloor).toBeLessThan(rim - 0.03)
    })

    it('Then a ball sits in the hollow: lower than the rim, clear of the bottom of the hollow, and narrower than the body at the ground', () => {
      const head = avatar.head
      const radius = (head.geometry as THREE.SphereGeometry).parameters.radius

      expect(head.position.y - radius).toBeLessThan(rim)
      expect(head.position.y - radius).toBeGreaterThan(slotFloor)
      expect(head.position.y + radius).toBeGreaterThan(rim)
      expect(radius).toBeLessThan(widestAt(0))
    })

    it('Then it has no arms or legs: a body, a head and the plant on the head, and nothing else', () => {
      const meshes: THREE.Object3D[] = []
      scene.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) meshes.push(object)
      })

      expect(meshes).toHaveLength(5)
      for (const part of [avatar.body, avatar.head, avatar.stalk, ...avatar.leaves]) {
        expect(meshes).toContain(part)
      }
    })

    it('Then there is clear space between the head and the slot it sits in', () => {
      const radius = (avatar.head.geometry as THREE.SphereGeometry).parameters.radius

      expect(avatar.head.position.y - radius - slotFloor).toBeGreaterThan(0.05)
    })

    it('Then it is smooth: finely divided round the body and over the head', () => {
      const count = (mesh: THREE.Mesh) => mesh.geometry.getAttribute('position').count

      expect(count(avatar.body)).toBeGreaterThan(1000)
      expect(count(avatar.head)).toBeGreaterThan(1000)
      expect((avatar.body.material as THREE.MeshStandardMaterial).flatShading).toBe(false)
    })
  })

  describe('Scenario: the plant on its head', () => {
    /* The lowest and highest points of a part, and its middle, in the head's frame. */
    const extent = (mesh: THREE.Mesh) => {
      mesh.updateMatrix()
      const box = new THREE.Box3()
      const position = mesh.geometry.getAttribute('position')
      const point = new THREE.Vector3()
      for (let i = 0; i < position.count; i++) {
        box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix))
      }
      return { box, middle: box.getCenter(new THREE.Vector3()) }
    }
    const headTop = (avatar.head.geometry as THREE.SphereGeometry).parameters.radius

    it('Given the head, then a thin stalk grows straight up from the top of it', () => {
      const { box, middle } = extent(avatar.stalk)

      expect(box.min.y).toBeLessThanOrEqual(headTop)
      expect(box.max.y).toBeGreaterThan(headTop + 0.1)
      expect(Math.hypot(middle.x, middle.z)).toBeCloseTo(0, 6)
      expect(box.max.x - box.min.x).toBeLessThan(0.03)
    })

    it('Then it has two leaves, one on each side of the stalk, near its top', () => {
      expect(avatar.leaves).toHaveLength(2)
      const [left, right] = avatar.leaves.map(extent)
      const stalkTop = extent(avatar.stalk).box.max.y

      expect(left.middle.x).toBeLessThan(-0.03)
      expect(right.middle.x).toBeGreaterThan(0.03)
      expect(left.middle.x).toBeCloseTo(-right.middle.x, 6)
      for (const leaf of [left, right]) {
        expect(leaf.middle.z).toBeCloseTo(0, 6)
        expect(leaf.box.min.y).toBeGreaterThan(headTop + 0.1)
        expect(Math.abs(leaf.box.min.y - stalkTop)).toBeLessThan(0.05)
      }
    })

    it('Then the leaves are flat: far longer and wider than they are thick', () => {
      const geometry = avatar.leaves[0].geometry
      geometry.computeBoundingBox()
      const size = geometry.boundingBox!.getSize(new THREE.Vector3())

      expect(size.x).toBeGreaterThan(size.y * 5)
      expect(size.z).toBeGreaterThan(size.y * 3)
    })

    it('Given I look up, then the plant tips back with the head', () => {
      player.position.set(0, 0, 0)
      player.yaw = 0
      player.pitch = 0
      settle()
      scene.updateMatrixWorld(true)
      const level = avatar.stalk.getWorldPosition(new THREE.Vector3())

      player.pitch = 0.6
      settle()
      scene.updateMatrixWorld(true)
      const tipped = avatar.stalk.getWorldPosition(new THREE.Vector3())

      // Facing -Z and looking up, the top of the head goes back, towards +Z.
      expect(tipped.z).toBeGreaterThan(level.z + 0.1)
      player.pitch = 0
    })
  })

  describe('Scenario: seeing yourself', () => {
    it('Given the eye is inside the head, then the head is left out of my own view and shown only through doorways', () => {
      const own = new THREE.PerspectiveCamera()
      const throughDoor = new THREE.PerspectiveCamera()
      throughDoor.layers.enable(PORTAL_ONLY_LAYER)

      for (const part of [avatar.head, avatar.stalk, ...avatar.leaves]) {
        expect(part.layers.test(own.layers)).toBe(false)
        expect(part.layers.test(throughDoor.layers)).toBe(true)
      }
      expect(avatar.body.layers.test(own.layers)).toBe(true)
    })

    it('Given I stand on a wall, when the body follows me, then it stands on that wall too', () => {
      player.axis = 'x-'
      player.position.set(5, 3, 1)
      settle()

      const top = avatar.head.getWorldPosition(new THREE.Vector3())
      expect(top.x).toBeLessThan(5 - 0.6)
      expect(top.y).toBeCloseTo(3, 6)
      player.axis = 'y+'
    })
  })

  describe('Scenario: the head turns with my view and with nothing else', () => {
    /* Which way the front of the head points, in the world. */
    const facing = () => {
      settle()
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

    it('Given I flick my view to the left, then the head trails behind for a moment and then catches up', () => {
      stand()
      settle()
      player.yaw = 0.6

      avatar.update(1 / 60)
      scene.updateMatrixWorld(true)
      const during = new THREE.Vector3(0, 0, -1).transformDirection(avatar.head.matrixWorld)
      const after = facing()

      // Facing 0.6 rad left of -Z means x = -sin(0.6).
      expect(during.x).toBeGreaterThan(-Math.sin(0.6) + 0.2)
      expect(during.x).toBeLessThan(0)
      expect(after.x).toBeCloseTo(-Math.sin(0.6), 6)
    })

    it('Given I look up sharply, then the plant is still tipping back a moment later', () => {
      stand()
      settle()
      player.pitch = 0.8

      avatar.update(1 / 60)
      scene.updateMatrixWorld(true)
      const during = new THREE.Vector3(0, 0, -1).transformDirection(avatar.head.matrixWorld)

      expect(during.y).toBeGreaterThan(0.05)
      expect(during.y).toBeLessThan(Math.sin(0.8) - 0.2)
      expect(facing().y).toBeCloseTo(Math.sin(0.8), 6)
      player.pitch = 0
    })

    it('Given a door turns me half way round in an instant, then the head is turned with me and does not swing round after', () => {
      stand()
      settle()
      player.yaw = Math.PI

      avatar.update(1 / 60)
      scene.updateMatrixWorld(true)
      const front = new THREE.Vector3(0, 0, -1).transformDirection(avatar.head.matrixWorld)

      expect(front.z).toBeCloseTo(1, 6)
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
        for (let i = 0; i < 30; i++) avatar.update(1 / 60)
        expect(avatar.head.quaternion.angleTo(still)).toBeCloseTo(0, 9)
      }
    })
  })
})
