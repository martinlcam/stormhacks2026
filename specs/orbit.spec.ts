import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { Body } from '../src/engine/Body'
import { configurePlanet } from '../src/engine/planet'
import { throwSpeed } from '../src/game/items'
import { FRAME } from './support'

/* The planet the game is played on, and the slab that is its ground on the map. */
const ROUND = 140
const ground = new THREE.Box3(new THREE.Vector3(-82, -1, -82), new THREE.Vector3(82, 0, 82))
/* How high the hand is that lets the gem go. */
const HAND = 1.4

beforeEach(() => configurePlanet(ROUND))
afterEach(() => configurePlanet(null))

/* Throw a gem level from the hand and follow it until it first touches the ground. */
function thrown(speed: number) {
  const gem = new Body(0.18)
  gem.position.set(0, HAND, 2)
  gem.velocity.set(speed * Math.SQRT1_2, 0, -speed * Math.SQRT1_2)
  let flown = 0
  let highest = HAND
  /* How near it came to where it was let go, once it had gone a good way off. */
  let nearest = Infinity
  for (let t = 0; t < 60 && gem.position.y > gem.radius + 0.01; t += FRAME) {
    gem.step(FRAME, [ground], [])
    flown += Math.hypot(gem.velocity.x, gem.velocity.z) * FRAME
    highest = Math.max(highest, gem.position.y)
    if (flown > ROUND / 2)
      nearest = Math.min(nearest, Math.hypot(gem.position.x, gem.position.z - 2))
  }
  return { flown, highest, nearest }
}

describe('Feature: throwing a gem round the world', () => {
  describe('Scenario: a light throw', () => {
    it('Given I throw a gem gently, then it comes down a few metres away, as on flat ground', () => {
      expect(thrown(throwSpeed(0.25)).flown).toBeLessThan(8)
    })
  })

  describe('Scenario: harder and harder throws', () => {
    it('Given I throw harder, then the gem goes further, and further again than the extra speed alone would take it', () => {
      const gentle = thrown(8).flown
      const hard = thrown(16).flown
      // On flat ground twice the speed is twice the distance.
      expect(hard).toBeGreaterThan(gentle * 3)
    })
  })

  describe('Scenario: a throw as hard as I can', () => {
    it('Given I throw a gem level with all my strength, then it goes the whole way round the planet before it touches the ground', () => {
      expect(thrown(throwSpeed(1)).flown).toBeGreaterThan(ROUND)
    })

    it('Then it comes back to where I let it go: within reach, from behind', () => {
      expect(thrown(throwSpeed(1)).nearest).toBeLessThan(3)
    })

    it('Then it never goes far above my head on the way', () => {
      expect(thrown(throwSpeed(1)).highest).toBeLessThan(8)
    })

    it('Then it does come down in the end: the air slows it', () => {
      expect(thrown(throwSpeed(1)).flown).toBeLessThan(ROUND * 3)
    })
  })
})
