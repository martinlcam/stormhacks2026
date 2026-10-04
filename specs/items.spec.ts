import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { FACING, FRAME, door, floor, gem, linked, simulate } from './support'

describe('Feature: gems fall, bounce and roll', () => {
  describe('Scenario: dropping a gem', () => {
    it('Given a gem three metres above the floor, when I let go, then it lands and comes to rest on the floor', () => {
      const body = gem(0, 3, 0)

      simulate(body, 5, [floor])

      expect(body.resting).toBe(true)
      expect(body.position.y).toBeCloseTo(0.2, 2)
    })
  })

  describe('Scenario: throwing a gem hard at a thin wall', () => {
    it('Given a wall 20 cm thick, when a gem hits it at 30 m/s, then the gem stays on my side of the wall', () => {
      const wall = new THREE.Box3(new THREE.Vector3(4, 0, -5), new THREE.Vector3(4.2, 4, 5))
      const body = gem(0, 1, 0)
      body.velocity.set(30, 0, 0)

      simulate(body, 3, [floor, wall])

      expect(body.position.x).toBeLessThan(4 - 0.19)
    })
  })
})

describe('Feature: throwing a gem through a door', () => {
  describe('Scenario: two doors that face each other', () => {
    it('Given two linked doors facing each other, when I throw a gem into the west one, then it flies out of the east one still heading west', () => {
      const [west, east] = linked(door(-4, 0, FACING.east), door(4, 0, FACING.west))
      const body = gem(0, 1, 0)
      body.velocity.set(-10, 0, 0)
      let crossings = 0
      body.onTraverse = () => crossings++

      simulate(body, 0.5, [floor], [west, east])

      expect(crossings).toBe(1)
      expect(body.position.x).toBeGreaterThan(0)
      expect(body.position.x).toBeLessThan(4)
      expect(body.velocity.x).toBeLessThan(0)
      expect(body.scale).toBe(1)
    })
  })

  describe('Scenario: a door that changes size', () => {
    it('Given a tall door linked to a quarter-size door, when I throw a gem into the tall one, then it comes out a quarter of the size and a quarter of the speed', () => {
      const [tall, small] = linked(door(-4, 0, FACING.east), door(4, 0, FACING.west, 0.25))
      const body = gem(-3, 1, 0)
      body.velocity.set(-8, 0, 0)

      for (let i = 0; i < 20 && body.scale === 1; i++) body.step(FRAME, [], [tall, small])

      expect(body.scale).toBeCloseTo(0.25, 6)
      expect(body.radius).toBeCloseTo(0.05, 6)
      expect(Math.abs(body.velocity.x)).toBeLessThan(2.5)
      expect(body.position.y).toBeLessThan(0.3)
    })

    it('Given a gem too large for the small door, when I roll it at that door, then it bounces off and stays full size', () => {
      const [tall, small] = linked(door(-4, 0, FACING.east), door(4, 0, FACING.west, 0.25))
      const slab = new THREE.Box3(new THREE.Vector3(4.02, 0, -1), new THREE.Vector3(4.5, 1, 1))
      small.computeGhostColliders([slab])
      const body = gem(3, 0.25, 0)
      body.velocity.set(6, 0, 0)

      simulate(body, 1, [floor, slab], [tall, small])

      expect(body.scale).toBe(1)
      expect(body.position.x).toBeLessThan(4.02)
    })
  })
})
