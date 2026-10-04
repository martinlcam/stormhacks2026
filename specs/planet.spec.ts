import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import {
  configurePlanet,
  onPlanet,
  placedFrom,
  planetMotion,
  redirect,
  seenFrom,
  walkOnPlanet,
} from '../src/engine/planet'
import { expectAt } from './support'

const CIRCUMFERENCE = 240
const RADIUS = CIRCUMFERENCE / (2 * Math.PI)

function walker(x: number, z: number, yaw: number, speed = 6) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed),
    yaw,
  }
}

describe('Feature: the plaza is a planet', () => {
  beforeEach(() => configurePlanet(CIRCUMFERENCE))
  afterEach(() => configurePlanet(null))

  describe('Scenario: walking straight ahead all the way round', () => {
    const starts: [string, number, number, number][] = [
      ['the spawn point heading north', 0, 0, 0],
      ['beside the booth heading north-west', 7, -3, 0.9],
      ['far out heading south-west', -20, 35, 2.4],
      ['near the equator heading east', 50, 10, -1.1],
    ]
    for (const [where, x, z, yaw] of starts) {
      it(`Given I stand at ${where}, when I walk one circumference without turning, then I am back where I began, facing the same way`, () => {
        const me = walker(x, z, yaw)
        const steps = 2400
        const dt = CIRCUMFERENCE / 6 / steps

        for (let i = 0; i < steps; i++) walkOnPlanet(me, dt)

        expect(me.position.x).toBeCloseTo(x, 3)
        expect(me.position.z).toBeCloseTo(z, 3)
        expect(Math.cos(me.yaw - yaw)).toBeCloseTo(1, 6)
      })
    }
  })

  describe('Scenario: walking a triangle with three right angles', () => {
    it('Given I start at the pole, when I walk to the equator, a quarter of the way along it and back, never turning, then I arrive facing a quarter turn from where I started', () => {
      const me = walker(0, 0, -Math.PI / 2)
      const leg = (vx: number, vz: number) => {
        me.velocity.set(vx, 0, vz)
        for (let i = 0; i < 600; i++) walkOnPlanet(me, 0.1)
      }

      leg(1, 0)
      expectAt(me.position, 60, 0, 0)
      leg(0, 1)
      expectAt(me.position, 0, 0, 60)
      leg(0, -1)

      expect(me.position.length()).toBeCloseTo(0, 3)
      expect(Math.abs(Math.sin(me.yaw + Math.PI / 2))).toBeCloseTo(1, 4)
    })
  })

  describe('Scenario: where things on the map stand on the planet', () => {
    it('Given a door a quarter of the way round, when it is placed on the planet, then its foot is on the equator and it stands pointing outwards', () => {
      const foot = new THREE.Vector3(60, 0, 0)

      const placed = planetMotion(foot, new THREE.Matrix4())

      expectAt(foot.clone().applyMatrix4(placed), RADIUS, -RADIUS, 0)
      expectAt(new THREE.Vector3(60, 2, 0).applyMatrix4(placed), RADIUS + 2, -RADIUS, 0)
    })

    it('Given something at the pole, when it is placed on the planet, then it does not move', () => {
      const placed = planetMotion(new THREE.Vector3(), new THREE.Matrix4())

      expectAt(new THREE.Vector3(0, 1, 0).applyMatrix4(placed), 0, 1, 0)
    })

    it('Given a room far outside the plaza, when the planet is drawn, then the room stays flat', () => {
      const room = new THREE.Vector3(600, 0, 0)

      expect(onPlanet(room)).toBe(false)
      expectAt(room.clone().applyMatrix4(planetMotion(room, new THREE.Matrix4())), 600, 0, 0)
    })
  })

  describe('Scenario: reaching for something far from the spawn point', () => {
    // 90 m from the pole the map is stretched sideways by more than half.
    const me = new THREE.Vector3(90, 0, 0)

    it('Given I stand 90 m out, when something is placed 1.5 m to my side on the ground, then I see it 1.5 m to my side, although the map puts it much further', () => {
      const wanted = new THREE.Vector3(90, 0.2, 1.5)

      const onMap = placedFrom(me, wanted, new THREE.Vector3())
      const asSeen = seenFrom(me, onMap, new THREE.Vector3())

      expectAt(asSeen, 90, 0.2, 1.5, 4)
      expect(Math.abs(onMap.z)).toBeGreaterThan(2)
    })

    it('Given I stand 90 m out, when something is 1.5 m further out along the line from the pole, then the map and what I see agree', () => {
      const asSeen = seenFrom(me, new THREE.Vector3(91.5, 0, 0), new THREE.Vector3())

      expectAt(asSeen, 91.5, 0, 0, 4)
    })

    it('Given I stand at the spawn point, when something is 2 m away, then the map and what I see agree', () => {
      const asSeen = seenFrom(
        new THREE.Vector3(),
        new THREE.Vector3(1.2, 0.5, -1.6),
        new THREE.Vector3(),
      )

      expectAt(asSeen, 1.2, 0.5, -1.6, 2)
    })

    it('Given a room off the planet, when I look at something in it, then it is where the map says', () => {
      const room = new THREE.Vector3(600, 0, 0)

      expectAt(seenFrom(room, new THREE.Vector3(602, 1, 3), new THREE.Vector3()), 602, 1, 3)
    })
  })

  describe('Scenario: throwing something far from the spawn point', () => {
    it('Given I stand 90 m out, when I throw sideways at 10 m/s, then the gem leaves my hand at 10 m/s over the ground, in the direction I threw', () => {
      const me = new THREE.Vector3(90, 0, 0)
      const hand = placedFrom(me, new THREE.Vector3(90, 1.3, 0.8), new THREE.Vector3())
      const thrown = { position: hand.clone(), velocity: new THREE.Vector3(0, 0, 10), yaw: 0 }
      redirect(me, hand, thrown.velocity)

      const before = seenFrom(me, thrown.position, new THREE.Vector3())
      walkOnPlanet(thrown, 0.1)
      const after = seenFrom(me, thrown.position, new THREE.Vector3())

      expect(after.z - before.z).toBeCloseTo(1, 2)
      expect(after.x - before.x).toBeCloseTo(0, 1)
    })
  })
})
