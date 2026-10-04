import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { configurePlanet, onPlanet, planetMotion, walkOnPlanet } from '../src/engine/planet'
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
})
