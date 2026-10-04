import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { ivy } from '../src/world/foliage'

const door = { name: 'booth', width: 1.2, height: 2.2, post: 0.15 }

/* Every corner of every leaf, in the door's frame: x across, y up, z out of the front. */
function leaves(doorway = door): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  ivy(doorway).traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry.getAttribute('color')) return
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, i))
    }
  })
  return points
}

const count = (points: THREE.Vector3[], where: (p: THREE.Vector3) => boolean) =>
  points.filter(where).length / 3 / 6

describe('Feature: an old doorway is overgrown', () => {
  const all = leaves()
  const half = door.width / 2

  describe('Scenario: where the ivy grows', () => {
    it('Given an overgrown door, then ivy climbs both posts', () => {
      const onPost = (side: number) => (p: THREE.Vector3) =>
        p.x * side > half - 0.05 && p.y > 0.5 && p.y < door.height - 0.3

      expect(count(all, onPost(-1))).toBeGreaterThan(20)
      expect(count(all, onPost(1))).toBeGreaterThan(20)
    })

    it('Then it covers the top', () => {
      expect(count(all, (p) => p.y > door.height - 0.05 && Math.abs(p.x) < half)).toBeGreaterThan(
        15,
      )
    })

    it('Then it is thick at the foot of each post', () => {
      const atFoot = (side: number) => (p: THREE.Vector3) => p.x * side > half - 0.1 && p.y < 0.45

      expect(count(all, atFoot(-1))).toBeGreaterThan(30)
      expect(count(all, atFoot(1))).toBeGreaterThan(30)
    })

    it('Then strands hang down into the opening from the top', () => {
      const hanging = (p: THREE.Vector3) =>
        Math.abs(p.x) < half - 0.05 && p.y < door.height - 0.1 && p.y > door.height - 0.9

      expect(count(all, hanging)).toBeGreaterThan(8)
    })

    it('Then the way through is left clear: nothing hangs lower than head height in the middle', () => {
      const inTheWay = (p: THREE.Vector3) => Math.abs(p.x) < half * 0.6 && p.y > 0.6 && p.y < 1.7

      expect(count(all, inTheWay)).toBe(0)
    })

    it('Then it all grows on the front of the frame, not behind the door', () => {
      expect(Math.min(...all.map((p) => p.z))).toBeGreaterThan(-0.1)
    })
  })

  describe('Scenario: every door grows its own way', () => {
    it('Given the same door built twice, then its ivy is the same both times', () => {
      const again = leaves()

      expect(again).toHaveLength(all.length)
      expect(again[100].distanceTo(all[100])).toBe(0)
    })

    it('Given two different doors, then their ivy differs', () => {
      const other = leaves({ ...door, name: 'loop-west' })

      expect(other[100].distanceTo(all[100])).toBeGreaterThan(0)
    })
  })
})
