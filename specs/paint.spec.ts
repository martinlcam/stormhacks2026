import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { type Blot, blotBox, octDecode, octEncode, Trail } from '../src/engine/paint'

/* The plaza's planet: 140 m round. */
const RADIUS = 140 / (2 * Math.PI)

/* A random number generator that gives the same numbers every run. */
function seeded(seed = 1) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

/* Where someone stands `metres` from the pole, walking along +x, as a unit vector from the centre. */
function at(metres: number) {
  const angle = metres / RADIUS
  return new THREE.Vector3(Math.sin(angle), Math.cos(angle), 0)
}

/* How far from the pole, along +x, a unit vector is. */
function metresOut(point: THREE.Vector3) {
  return Math.atan2(point.x, point.y) * RADIUS
}

/* Walk from one distance to another in small steps, and gather every blot put down. */
function walk(trail: Trail, from: number, to: number, scale = 1) {
  const blots: Blot[] = []
  for (let metres = from; metres <= to + 1e-9; metres += 0.05 * scale) {
    blots.push(...trail.step(at(metres), RADIUS, scale, metres))
  }
  return blots
}

describe('Feature: watercolour is left behind the player on the canvas floor', () => {
  describe('Scenario: walking in a straight line', () => {
    it('Given a walk of ten metres, then a blot is put down about every stride', () => {
      const blots = walk(new Trail(seeded()), 0, 10)
      expect(blots.length).toBeGreaterThanOrEqual(10)
      expect(blots.length).toBeLessThanOrEqual(12)
    })

    it('Given a walk, then every blot starts behind where the player was when it was put down', () => {
      for (const blot of walk(new Trail(seeded()), 0, 10)) {
        // `born` is the distance walked, in this walk.
        expect(metresOut(blot.origin)).toBeLessThan(blot.born)
      }
    })

    it('Given a walk, then every blot runs forward, the way the player was going', () => {
      for (const blot of walk(new Trail(seeded()), 0, 10)) {
        const angle = metresOut(blot.origin) / RADIUS
        const forward = new THREE.Vector3(Math.cos(angle), -Math.sin(angle), 0)
        expect(blot.along.dot(forward)).toBeGreaterThan(0.99)
      }
    })

    it('Given a long walk, then the trail moves through more than one colour', () => {
      const colours = new Set(
        walk(new Trail(seeded()), 0, 60).map(({ density: [r, g, b] }) => {
          const sum = r + g + b
          return [r / sum, g / sum, b / sum].map((x) => x.toFixed(2)).join()
        }),
      )
      expect(colours.size).toBeGreaterThan(1)
    })
  })

  describe('Scenario: standing still', () => {
    it('Given the player does not move, then nothing is put down', () => {
      const trail = new Trail(seeded())
      const blots: Blot[] = []
      for (let time = 0; time < 5; time += 0.1) blots.push(...trail.step(at(3), RADIUS, 1, time))
      expect(blots).toEqual([])
    })
  })

  describe('Scenario: leaving the ground', () => {
    it('Given the player jumps over two metres, then nothing is put down where they were in the air', () => {
      const trail = new Trail(seeded())
      walk(trail, 0, 5)
      trail.step(null, RADIUS, 1, 5.5)
      const after = walk(trail, 7, 9)
      for (const blot of after) expect(metresOut(blot.origin)).toBeGreaterThan(6)
    })
  })

  describe('Scenario: going through a door or back to the start', () => {
    it('Given the player is suddenly ten metres away, then the jump leaves no trail', () => {
      const trail = new Trail(seeded())
      walk(trail, 0, 2)
      expect(trail.step(at(12), RADIUS, 1, 2.1)).toEqual([])
      for (const blot of walk(trail, 12.05, 15)) {
        expect(metresOut(blot.origin)).toBeGreaterThan(11)
      }
    })
  })

  describe('Scenario: a small player', () => {
    it('Given a player a quarter of the size, then their strides and blots are a quarter of the size', () => {
      const small = walk(new Trail(seeded()), 0, 2.5, 0.25)
      expect(small.length).toBeGreaterThanOrEqual(10)
      for (const blot of small) {
        expect(blot.length).toBeLessThanOrEqual(3.6 * 0.25)
        expect(blot.width).toBeLessThanOrEqual(1.6 * 0.25)
      }
    })
  })
})

describe('Feature: one texture holds the paint for the whole planet', () => {
  describe('Scenario: where places are kept', () => {
    it('Given the pole, then it is kept in the middle of the texture', () => {
      const uv = octEncode(new THREE.Vector3(0, 1, 0))
      expect(uv.x).toBeCloseTo(0.5)
      expect(uv.y).toBeCloseTo(0.5)
    })

    it('Given the point opposite the pole, then it is kept in a corner', () => {
      const uv = octEncode(new THREE.Vector3(0, -1, 0))
      expect([0, 1]).toContain(uv.x)
      expect([0, 1]).toContain(uv.y)
    })

    it('Given any place on the planet, then reading back where it is kept gives the same place', () => {
      const random = seeded(7)
      for (let i = 0; i < 500; i++) {
        const place = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize()
        const back = octDecode(octEncode(place))
        expect(back.distanceTo(place)).toBeLessThan(1e-9)
      }
    })
  })

  describe('Scenario: drawing a blot', () => {
    const blot = (origin: THREE.Vector3): Blot => {
      const along = new THREE.Vector3(0, 0, 1)
      along.addScaledVector(origin, -along.dot(origin)).normalize()
      return {
        origin,
        along,
        across: new THREE.Vector3().crossVectors(origin, along),
        length: 3,
        width: 1.5,
        density: [0.1, 0.1, 0.1],
        seed: 0,
        born: 0,
        spread: 1,
      }
    }

    it('Given a blot near the pole, then only a small part of the texture is drawn on', () => {
      const [left, bottom, right, top] = blotBox(blot(at(4)), RADIUS)
      expect(left).toBeGreaterThan(0)
      expect(bottom).toBeGreaterThan(0)
      expect(right).toBeLessThan(1)
      expect(top).toBeLessThan(1)
      expect(right - left).toBeLessThan(0.1)
      expect(top - bottom).toBeLessThan(0.1)
    })

    it('Given a blot at the point opposite the pole, where the texture folds, then all of it is drawn on', () => {
      expect(blotBox(blot(new THREE.Vector3(0.001, -1, 0.001).normalize()), RADIUS)).toEqual([
        0, 0, 1, 1,
      ])
    })
  })
})
