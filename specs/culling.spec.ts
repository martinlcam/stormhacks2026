import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { configurePlanet, drawnBounds, POLE, Site } from '../src/engine/planet'

const CIRCUMFERENCE = 240
const RADIUS = CIRCUMFERENCE / (2 * Math.PI)

/* Where the vertex shader draws a map point, worked out from the planet's description. */
function drawn(point: THREE.Vector3, site: Site) {
  const d = Math.hypot(point.x, point.z)
  const theta = d / RADIUS
  const out = d > 1e-9 ? new THREE.Vector3(point.x / d, 0, point.z / d) : new THREE.Vector3()
  return out
    .multiplyScalar(Math.sin(theta))
    .add(new THREE.Vector3(0, Math.cos(theta), 0))
    .multiplyScalar(RADIUS + point.y)
    .add(new THREE.Vector3(0, -RADIUS, 0))
    .applyMatrix4(site.motion)
}

/* A repeatable stream of numbers from 0 to 1. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

/* Points spread through a sphere, its surface included. */
function pointsIn(sphere: THREE.Sphere, count: number) {
  const random = seeded(7)
  const points: THREE.Vector3[] = []
  for (let i = 0; i < count; i++) {
    const direction = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize()
    const reach = i % 4 === 0 ? 1 : random()
    points.push(direction.multiplyScalar(sphere.radius * reach).add(sphere.center))
  }

  return points
}

describe('Feature: a view leaves out only what it cannot see', () => {
  beforeEach(() => configurePlanet(CIRCUMFERENCE))
  afterEach(() => configurePlanet(null))

  describe('Scenario: the bounds of a mesh follow it onto the planet', () => {
    const far = new Site('culling-far', 40, -25, 0.7)
    const cases: [string, THREE.Vector3, number, Site][] = [
      ['a small box at the pole', new THREE.Vector3(0.5, 1, -0.3), 0.8, POLE],
      ['a tall wall beside the hub', new THREE.Vector3(6, 3, 7), 5, POLE],
      ['a long fence far out', new THREE.Vector3(25, 1, 18), 12, POLE],
      ['a doorway at a far site', new THREE.Vector3(1, 1.2, -2), 2, far],
      ['the ground round a far site', new THREE.Vector3(0, -0.2, 0), 30, far],
    ]
    for (const [what, center, radius, site] of cases) {
      it(`Given ${what}, then every point of it is drawn inside its bounds`, () => {
        const sphere = new THREE.Sphere(center.clone(), radius)
        const bounds = drawnBounds(sphere.clone(), center, site.motion)

        for (const point of pointsIn(sphere, 2000)) {
          expect(drawn(point, site).distanceTo(bounds.center)).toBeLessThanOrEqual(
            bounds.radius + 1e-9,
          )
        }
      })
    }
  })

  describe('Scenario: rooms off the planet are not bent', () => {
    it('Given a mesh in a room outside the map, then its bounds are where it is', () => {
      const center = new THREE.Vector3(500, 2, 0)
      const bounds = drawnBounds(new THREE.Sphere(center.clone(), 3), center, POLE.motion)

      expect(bounds.center.distanceTo(center)).toBe(0)
      expect(bounds.radius).toBe(3)
    })
  })
})
