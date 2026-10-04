import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { GRAVITY } from '../src/engine/Body'
import { aimMiss, chargeLevel, throwSpeed, throwVelocity } from '../src/game/items'
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

describe('Feature: charging a throw', () => {
  describe('Scenario: tapping Q', () => {
    it('Given I hold a gem, when I tap Q for a tenth of a second, then the throw is light', () => {
      const speed = throwSpeed(chargeLevel(0.1))

      expect(speed).toBeGreaterThan(throwSpeed(0))
      expect(speed).toBeLessThan(throwSpeed(0.25))
    })
  })

  describe('Scenario: holding Q', () => {
    it('Given I hold a gem, when I hold Q for longer, then the throw is stronger', () => {
      const short = throwSpeed(chargeLevel(0.3))
      const long = throwSpeed(chargeLevel(0.9))

      expect(long).toBeGreaterThan(short)
    })

    it('Given the charge is already full, when I keep holding Q, then the throw gets no stronger', () => {
      expect(chargeLevel(1.2)).toBe(1)
      expect(throwSpeed(chargeLevel(10))).toBe(throwSpeed(1))
    })
  })

  describe('Scenario: a full throw against a light one', () => {
    it('Given two gems thrown level from the same spot, when one has a full charge and one a light tap, then the full one lands further away', () => {
      const land = (speed: number) => {
        const body = gem(0, 1.4, 0)
        body.velocity.set(speed, 0, 0)
        simulate(body, 8, [floor])
        return body.position.x
      }

      expect(land(throwSpeed(1))).toBeGreaterThan(land(throwSpeed(0)) * 2)
    })
  })
})

describe('Feature: picking up is forgiving', () => {
  const eye = new THREE.Vector3(0, 1.6, 0)
  const ahead = new THREE.Vector3(0, 0, -1)
  const radius = 0.18
  const reach = 3
  const gemAt = (x: number, z: number) => new THREE.Vector3(x, 1.6, z)

  describe('Scenario: the crosshair is near the gem but not on it', () => {
    it('Given a gem 2 m ahead, when the crosshair is 20 cm clear of its edge, then I can still pick it up', () => {
      expect(aimMiss(eye, ahead, gemAt(radius + 0.2, -2), radius, reach)).toBeLessThan(Infinity)
    })

    it('Given a gem 2 m ahead, when the crosshair is right on it, then it counts as a perfect aim', () => {
      expect(aimMiss(eye, ahead, gemAt(0.1, -2), radius, reach)).toBe(0)
    })

    it('Given two gems in the margin, when one is closer to the crosshair, then that one is the better aim', () => {
      const near = aimMiss(eye, ahead, gemAt(radius + 0.05, -2), radius, reach)
      const far = aimMiss(eye, ahead, gemAt(-(radius + 0.2), -2), radius, reach)

      expect(near).toBeLessThan(far)
    })
  })

  describe('Scenario: the crosshair is nowhere near the gem', () => {
    it('Given a gem 2 m ahead, when the crosshair is a metre to the side of it, then there is nothing to pick up', () => {
      expect(aimMiss(eye, ahead, gemAt(1.2, -2), radius, reach)).toBe(Infinity)
    })

    it('Given a gem behind me, when I look ahead, then there is nothing to pick up', () => {
      expect(aimMiss(eye, ahead, gemAt(0, 2), radius, reach)).toBe(Infinity)
    })

    it('Given a gem 5 m ahead, when I aim straight at it, then it is out of reach', () => {
      expect(aimMiss(eye, ahead, gemAt(0, -5), radius, reach)).toBe(Infinity)
    })
  })
})

describe('Feature: a throw goes where the crosshair is', () => {
  // The gem is held to the right of and below the eye, not on the line of sight.
  const eye = new THREE.Vector3(0, 1.62, 0)
  const hand = new THREE.Vector3(0.34, 1.32, -0.85)

  /* How close a gem thrown from the hand comes to a point, in metres. */
  const closestApproach = (target: THREE.Vector3, speed: number) => {
    const body = gem(hand.x, hand.y, hand.z, 0.18)
    throwVelocity(hand, target, speed, GRAVITY, body.velocity)
    let closest = Infinity
    for (let i = 0; i < 240; i++) {
      body.step(FRAME / 4, [], [])
      closest = Math.min(closest, body.position.distanceTo(target))
    }
    return closest
  }

  describe('Scenario: a full-strength throw at something 10 m ahead', () => {
    it('Given the crosshair is on a point 10 m straight ahead, when I throw at full charge, then the gem passes through that point and not to the right of it', () => {
      const target = eye.clone().add(new THREE.Vector3(0, 0, -10))

      expect(closestApproach(target, throwSpeed(1))).toBeLessThan(0.15)
    })

    it('Given the crosshair is on a point up and to the left, when I throw at full charge, then the gem still passes through it', () => {
      const target = eye.clone().add(new THREE.Vector3(-4, 3, -8))

      expect(closestApproach(target, throwSpeed(1))).toBeLessThan(0.15)
    })
  })

  describe('Scenario: where the throw starts', () => {
    it('Given the gem is held to my right, when I throw, then it starts moving left towards the line of sight', () => {
      const target = eye.clone().add(new THREE.Vector3(0, 0, -10))

      const velocity = throwVelocity(hand, target, throwSpeed(1), GRAVITY, new THREE.Vector3())

      expect(velocity.x).toBeLessThan(0)
      expect(velocity.z).toBeLessThan(0)
    })
  })

  describe('Scenario: a light toss at something far away', () => {
    it('Given the crosshair is on a point 25 m away, when I only tap Q, then the gem is lobbed gently and falls short', () => {
      const target = eye.clone().add(new THREE.Vector3(0, 0, -25))
      const speed = throwSpeed(0)

      const velocity = throwVelocity(hand, target, speed, GRAVITY, new THREE.Vector3())

      expect(velocity.y).toBeLessThan(speed * 0.5)
      expect(closestApproach(target, speed)).toBeGreaterThan(5)
    })
  })
})

describe("Feature: the player's figure is solid to gems", () => {
  const feet = new THREE.Vector3(0, 0, 0)
  const up = new THREE.Vector3(0, 1, 0)
  const still = new THREE.Vector3()
  /* One frame of a gem against a figure 0.3 m wide and 1 m tall. */
  const meet = (body: ReturnType<typeof gem>, walking = still) =>
    body.hitCylinder(feet, up, 0.3, 1, walking)

  describe('Scenario: a gem thrown at the figure', () => {
    it('Given a gem flying at my body, when it reaches me, then it bounces back and does not pass through', () => {
      const body = gem(3, 0.5, 0)
      body.velocity.set(-8, 0, 0)

      for (let i = 0; i < 60; i++) {
        body.step(FRAME, [floor], [])
        meet(body)
      }

      expect(body.position.x).toBeGreaterThan(0.3)
    })

    it('Given a gem flying over my head, then it carries on untouched', () => {
      const body = gem(0.5, 1.6, 0)
      body.velocity.set(-8, 0, 0)

      expect(meet(body)).toBe(false)
      expect(body.velocity.x).toBe(-8)
    })
  })

  describe('Scenario: walking into a gem', () => {
    it('Given a gem lying still, when I walk into it, then it is knocked away ahead of me', () => {
      const body = gem(0.4, 0.2, 0)
      body.resting = true

      meet(body, new THREE.Vector3(4, 0, 0))

      expect(body.resting).toBe(false)
      expect(body.velocity.x).toBeGreaterThanOrEqual(4)
      expect(body.position.x).toBeCloseTo(0.5, 5)
    })

    it('Given a gem lying still against me, when I stand still, then it stays at rest', () => {
      const body = gem(0.45, 0.2, 0)
      body.resting = true

      meet(body)

      expect(body.resting).toBe(true)
    })
  })
})
