import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { PlayerController } from '../src/engine/PlayerController'
import { RINGING, stairwell } from '../src/world/structures/stairwell'
import { World } from '../src/world/World'
import { FRAME, gem, quietBrowser } from './support'

/* The tower, and a player standing on the landing by its door. */
function tower() {
  let turns = 0
  let rung = 0
  let fell = 0
  const hits: number[] = []
  const world = new World()
  world.build(
    stairwell(
      () => turns++,
      { hint() {}, solved: () => rung++ },
      { hint() {}, solved: () => fell++ },
      (strength) => hits.push(strength),
    ),
  )
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
  return { world, player, walk, turns: () => turns, rung: () => rung, fell: () => fell, hits }
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

  describe('Scenario: the gong across the well', () => {
    /* The gem that lies by the door, let go over the well, and a way to let time pass. */
    function drop(from: number) {
      const built = tower()
      const { body } = built.world.items[0]
      body.position.set(1200, from, 0)
      body.resting = false
      const wait = (seconds: number) => {
        for (let i = 0; i < seconds / FRAME; i++) {
          built.world.update(FRAME, 0)
          body.step(FRAME, built.world.colliders, built.world.portals)
        }
      }
      /* Step onto the lit landing, or off it. */
      const stand = (on: boolean) => {
        built.world.checkTriggers(on ? new THREE.Vector3(1203, 2.2, 3) : built.player.position)
      }
      return { ...built, body, wait, stand }
    }

    it('Given nobody is on the lit landing, then the well is open', () => {
      const { body, wait } = drop(3)

      wait(5)

      expect(body.resting).toBe(false)
      expect(-body.velocity.y).toBeGreaterThan(RINGING)
    })

    it('Given I stand on the lit landing, when a gem is dropped from the top of the tower, then the gong catches it and does not ring', () => {
      const { body, wait, stand, rung } = drop(5.3)
      stand(true)

      wait(5)

      expect(body.resting).toBe(true)
      expect(body.position.y).toBeCloseTo(1 + body.radius, 1)
      expect(rung()).toBe(0)
    })

    it('Given I stand on the lit landing, when a gem is dropped from the top of the tower, then the gong is heard to knock, short of full strength, and more softly as the gem bounces', () => {
      const { wait, stand, hits } = drop(5.3)
      stand(true)

      wait(5)

      expect(hits.length).toBeGreaterThan(0)
      expect(hits[0]).toBeLessThan(1)
      for (let i = 1; i < hits.length; i++) expect(hits[i]).toBeLessThan(hits[i - 1])
    })

    it('Given a gem has fallen round the tower until it can fall no faster, when I step onto the lit landing, then the gong is heard at full strength', () => {
      const { wait, stand, hits } = drop(3)
      wait(4)

      stand(true)
      wait(1)

      expect(hits[0]).toBeGreaterThanOrEqual(1)
    })

    it('Given a gem has fallen round the tower until it can fall no faster, when I step onto the lit landing, then the gong rings', () => {
      const { body, wait, stand, rung } = drop(3)
      wait(4)
      expect(-body.velocity.y).toBeGreaterThan(RINGING)

      stand(true)
      wait(1)

      expect(rung()).toBe(1)
    })

    it('Given a gem lies on the shut gong, when I step off the lit landing, then the gem falls', () => {
      const { body, wait, stand } = drop(2)
      stand(true)
      wait(4)
      expect(body.resting).toBe(true)

      stand(false)
      wait(1)

      expect(body.resting).toBe(false)
      expect(-body.velocity.y).toBeGreaterThan(5)
    })
  })

  describe('Scenario: falling a hundred metres', () => {
    /* Let time pass for the world and the player together. */
    function clock(built: ReturnType<typeof tower>) {
      let time = 0
      return (seconds: number, x = 0, z = 0) => {
        for (let i = 0; i < seconds / FRAME; i++) {
          built.world.update(FRAME, (time += FRAME))
          built.walk(x, z, FRAME)
        }
      }
    }

    it('Given I step off into the well, when I have fallen for six seconds, then I have fallen a hundred metres', () => {
      const built = tower()
      built.player.position.set(1200, 0, 0)

      clock(built)(6)

      expect(built.fell()).toBe(1)
    })

    it('Given I step off into the well, when I have fallen for two seconds, then I have not fallen far enough', () => {
      const built = tower()
      built.player.position.set(1200, 0, 0)

      clock(built)(2)

      expect(built.turns()).toBeGreaterThan(1)
      expect(built.fell()).toBe(0)
    })

    it('Given I climb the stairs for a long time, then I have not fallen at all', () => {
      const built = tower()
      const pass = clock(built)

      for (let i = 0; i < 14; i++) {
        pass(2.2, 4, 0)
        pass(2.2, 0, -4)
        pass(2.2, -4, 0)
        pass(2.2, 0, 4)
      }

      expect(built.turns()).toBe(14)
      expect(built.fell()).toBe(0)
    })
  })
})
