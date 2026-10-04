import { describe, expect, it } from 'bun:test'
import { PlayerController } from '../src/engine/PlayerController'
import { stairwell } from '../src/world/structures/stairwell'
import { World } from '../src/world/World'
import { FRAME, gem, quietBrowser } from './support'

/* The tower, and a player standing on the landing by its door. */
function tower() {
  let turns = 0
  const world = new World()
  world.build(stairwell(() => turns++))
  world.finalize()
  const player = new PlayerController(quietBrowser())
  player.position.set(1197, 0, 3)
  const walk = (x: number, z: number, seconds: number) => {
    for (let i = 0; i < seconds / FRAME; i++) {
      player.velocity.x = x
      player.velocity.z = z
      player.update(FRAME, world.colliders, world.portals)
    }
  }
  return { world, player, walk, turns: () => turns }
}

/* Walk once round the tower, going up: along each wall in turn. */
function climbOneTurn(walk: (x: number, z: number, seconds: number) => void) {
  walk(4, 0, 2.2)
  walk(0, -4, 2.2)
  walk(-4, 0, 2.2)
  walk(0, 4, 2.2)
}

describe('Feature: the endless stairwell', () => {
  describe('Scenario: climbing', () => {
    it('Given I stand by the door, when I climb one flight, then I am one flight higher', () => {
      const { player, walk } = tower()

      walk(4, 0, 2.2)

      expect(player.position.x).toBeGreaterThan(1202)
      expect(player.position.y).toBeCloseTo(2.2, 1)
    })

    it('Given I climb a full turn of the stairs, then I am back by the door, no higher than I began', () => {
      const { player, walk, turns } = tower()

      climbOneTurn(walk)

      expect(turns()).toBe(1)
      expect(player.position.y).toBeCloseTo(0, 1)
      expect(player.position.x).toBeLessThan(1198)
      expect(player.position.z).toBeGreaterThan(2)
    })

    it('Given I keep climbing, then every turn brings me back to the same landing', () => {
      const { player, walk, turns } = tower()

      for (let i = 0; i < 3; i++) climbOneTurn(walk)

      expect(turns()).toBe(3)
      expect(player.position.y).toBeCloseTo(0, 1)
    })

    it('Then going round the tower is not counted as going through doors', () => {
      const { player, walk } = tower()

      climbOneTurn(walk)

      expect(player.doors).toBe(0)
    })
  })

  describe('Scenario: the well', () => {
    it('Given I step off into the well, when I fall for ten seconds, then I am still falling inside the tower', () => {
      const { player, walk, turns } = tower()
      player.position.set(1200, 0, 0)

      walk(0, 0, 10)

      expect(turns()).toBeGreaterThan(10)
      expect(player.position.y).toBeGreaterThan(-4)
      expect(player.position.y).toBeLessThan(6)
      // The fall has stopped getting faster.
      expect(player.velocity.y).toBeCloseTo(-30, 5)
    })

    it('Given a gem dropped down the well, then it too falls without end', () => {
      const { world } = tower()
      const body = gem(1200, 2, 0)

      for (let i = 0; i < 600; i++) body.step(FRAME, world.colliders, world.portals)

      expect(body.resting).toBe(false)
      expect(body.position.y).toBeGreaterThan(-4)
      expect(body.position.y).toBeLessThan(6)
    })
  })
})
