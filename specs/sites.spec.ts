import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { configurePlanet, keepNearestSite, POLE, rechart, resite, Site } from '../src/engine/planet'
import { PlayerController } from '../src/engine/PlayerController'
import { World } from '../src/world/World'
import { door, FRAME, linked, quietBrowser } from './support'

const CIRCUMFERENCE = 240
/* A third of the way round the planet from the pole. */
const far = new Site('far', 80, 0)

const walker = (x: number, z: number, site = POLE) => ({
  position: new THREE.Vector3(x, 0, z),
  velocity: new THREE.Vector3(),
  yaw: 0,
  site,
})

describe('Feature: structures stand anywhere on the planet', () => {
  beforeAll(() => configurePlanet(CIRCUMFERENCE))
  afterAll(() => configurePlanet(null))

  describe('Scenario: every site has a map of its own', () => {
    it("Given the place where a site is, then on the site's own map that place is the middle", () => {
      const there = rechart(new THREE.Vector3(80, 0, 0), POLE, far, new THREE.Vector3())

      expect(there.length()).toBeLessThan(1e-6)
    })

    it('Given a point moved to another map and back, then it is where it started', () => {
      const start = new THREE.Vector3(12, 1.5, -7)
      const away = rechart(start, POLE, far, new THREE.Vector3())
      const back = rechart(away, far, POLE, new THREE.Vector3())

      expect(back.distanceTo(start)).toBeLessThan(1e-6)
    })

    it('Given two points near a site, then its map keeps them the right distance apart', () => {
      // Five metres either side of the site, across the direction to the pole.
      const a = rechart(new THREE.Vector3(3, 0, 4), far, POLE, new THREE.Vector3())
      const b = rechart(new THREE.Vector3(3, 0, -4), far, POLE, new THREE.Vector3())

      // On the pole's map the same two points are squeezed apart or together.
      expect(Math.abs(a.distanceTo(b) - 8)).toBeGreaterThan(1)
    })
  })

  describe('Scenario: a walker uses the map of the nearest site', () => {
    it('Given a walker heading for a far site, when they arrive, then they are on its map at its middle', () => {
      const someone = walker(0, 0)
      for (let x = 0; x <= 80; x += 0.5) {
        someone.position.set(
          ...rechart(new THREE.Vector3(x, 0, 0), POLE, someone.site, new THREE.Vector3()).toArray(),
        )
        keepNearestSite(someone, [POLE, far])
      }

      expect(someone.site).toBe(far)
      expect(someone.position.length()).toBeLessThan(1e-6)
    })

    it("Given a walker near the pole, then they stay on the pole's map", () => {
      const someone = walker(10, 5)
      keepNearestSite(someone, [POLE, far])

      expect(someone.site).toBe(POLE)
    })

    it('Given a walker changing maps, then they keep facing the same way in space', () => {
      // Facing along the line from the pole through the site.
      const someone = walker(79, 0)
      someone.yaw = -Math.PI / 2
      someone.velocity.set(4, 0, 0)
      resite(someone, far)

      // The site's map is laid out the same way round as the pole's along that line.
      expect(someone.position.x).toBeCloseTo(-1, 5)
      expect(someone.velocity.x).toBeCloseTo(4, 5)
      expect(Math.sin(someone.yaw)).toBeCloseTo(-1, 5)
    })
  })

  describe('Scenario: changing maps is not seen', () => {
    it('Given a player between two sites, when their map changes, then their view does not move', () => {
      const player = new PlayerController(quietBrowser())
      player.position.set(41, 0, 6)
      player.yaw = 0.7
      player.pitch = -0.2
      const before = new THREE.PerspectiveCamera()
      player.applyTo(before)

      resite(player, far)
      const after = new THREE.PerspectiveCamera()
      player.applyTo(after)

      expect(player.site).toBe(far)
      expect(after.position.distanceTo(before.position)).toBeLessThan(1e-6)
      expect(after.quaternion.angleTo(before.quaternion)).toBeLessThan(1e-6)
    })
  })

  describe('Scenario: what is built at one site is not solid at another', () => {
    const world = new World()
    world.addCollider([-50, -1, -50], [50, 0, 50], true)
    world.build({
      name: 'wall at the far site',
      site: far,
      build: (w) => w.addCollider([-3, 0, -6], [3, 4, -5]),
    })

    const walkNorth = (site: Site) => {
      const player = new PlayerController(quietBrowser())
      player.site = site
      player.position.set(0, 0, 0)
      for (let i = 0; i < 180; i++) {
        player.velocity.set(0, 0, -4)
        player.update(FRAME, world.colliders, world.portals)
      }
      return player.position.z
    }

    it("Given a player on the far site's map, when they walk at its wall, then it stops them", () => {
      expect(walkNorth(far)).toBeGreaterThan(-5)
    })

    it("Given a player on the pole's map, when they walk the same way, then nothing is there", () => {
      expect(walkNorth(POLE)).toBeLessThan(-6)
    })

    it('Then the ground is solid on both maps', () => {
      const player = new PlayerController(quietBrowser())
      player.site = far
      player.position.set(8, 3, 8)
      for (let i = 0; i < 120; i++) player.update(FRAME, world.colliders, world.portals)

      expect(player.position.y).toBeCloseTo(0, 5)
    })
  })

  describe('Scenario: a door leads from one site to another', () => {
    it("Given a door at the pole joined to one at a far site, when the player walks through, then they are on the far site's map", () => {
      configurePlanet(null)
      const [near, distant] = linked(door(0, -3, 0), door(0, -3, 0))
      Object.assign(distant, { site: far })
      const player = new PlayerController(quietBrowser())
      player.position.set(0, 0, 0)
      for (let i = 0; i < 90 && player.site === POLE; i++) {
        player.velocity.set(0, 0, -4)
        player.update(FRAME, [], [near, distant])
      }
      configurePlanet(CIRCUMFERENCE)

      expect(player.site).toBe(far)
    })
  })
})
