import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { BEARINGS } from '../src/world/structures/chalkTriangle'
import { BEARING, GAUGE } from '../src/world/structures/rails'
import { apart, bearing, headingAfter, onMap, onSphere, walk } from '../src/world/sphere'

/* The planet the game is played on: 140 m round. */
const ROUND = 140
const RADIUS = ROUND / (2 * Math.PI)
const QUARTER = ROUND / 4
const pole = new THREE.Vector3(0, 1, 0)

/* Turn left by a right angle, for a walker standing at `place` and facing `heading`. */
function turnLeft(place: THREE.Vector3, heading: THREE.Vector3) {
  return new THREE.Vector3().crossVectors(heading, place).normalize()
}

describe('Feature: places on the planet and points on the map are the same thing', () => {
  it('Given a point on the map, when it is put on the planet and read back, then it is the same point', () => {
    for (const [x, z] of [
      [3, 4],
      [-20, 11],
      [0, -60],
    ]) {
      const back = onMap(onSphere(x, z, RADIUS), RADIUS)
      expect(back.x).toBeCloseTo(x, 6)
      expect(back.z).toBeCloseTo(z, 6)
    }
  })

  it('Given two places, then they are as far apart on the ground as the map says along a line through the pole', () => {
    expect(apart(pole, onSphere(0, 30, RADIUS), RADIUS)).toBeCloseTo(30, 6)
  })
})

describe('Feature: a triangle with three right angles', () => {
  describe('Scenario: walking the chalk triangle', () => {
    it('Given I walk a quarter of the way round three times, turning left by a right angle twice, then I am back where I began', () => {
      let place = pole.clone()
      let heading = bearing(BEARINGS[1])
      for (let side = 0; side < 3; side++) {
        const next = walk(place, heading, QUARTER, RADIUS)
        const facing = headingAfter(place, heading, QUARTER, RADIUS)
        place = next
        heading = side < 2 ? turnLeft(place, facing) : facing
      }
      expect(apart(place, pole, RADIUS)).toBeCloseTo(0, 6)
    })

    it('Given I arrive back, then a third right angle would point me down the first side again: 270° in all', () => {
      let place = pole.clone()
      let heading = bearing(BEARINGS[1])
      for (let side = 0; side < 3; side++) {
        const next = walk(place, heading, QUARTER, RADIUS)
        heading = turnLeft(next, headingAfter(place, heading, QUARTER, RADIUS))
        place = next
      }
      expect(heading.angleTo(bearing(BEARINGS[1]))).toBeCloseTo(0, 6)
    })

    it('Given the corners that are drawn, then each side is a quarter of the way round', () => {
      const corners = [pole, bearing(BEARINGS[0]), bearing(BEARINGS[1])]
      for (let i = 0; i < 3; i++) {
        expect(apart(corners[i], corners[(i + 1) % 3], RADIUS)).toBeCloseTo(QUARTER, 6)
      }
    })
  })
})

describe('Feature: parallel lines that meet', () => {
  const ahead = bearing(BEARING)
  const across = bearing(BEARING - 90)
  const starts = [-1, 1].map((side) => walk(pole, across, (side * GAUGE) / 2, RADIUS))
  const gap = (metres: number) =>
    apart(walk(starts[0], ahead, metres, RADIUS), walk(starts[1], ahead, metres, RADIUS), RADIUS)

  describe('Scenario: two rails that set off side by side', () => {
    it('Given the rails where they begin, then they are the gauge apart', () => {
      expect(gap(0)).toBeCloseTo(GAUGE, 6)
    })

    it('Given the rails where they begin, then they point the same way: each is square to the line between them', () => {
      const between = starts[1].clone().sub(starts[0])
      expect(between.dot(ahead)).toBeCloseTo(0, 9)
    })

    it('Given neither rail turns, when they are followed, then they draw together', () => {
      expect(gap(10)).toBeLessThan(gap(0))
      expect(gap(25)).toBeLessThan(gap(10))
    })

    it('Then they cross a quarter of the way round, and again on the far side of the planet', () => {
      expect(gap(QUARTER)).toBeCloseTo(0, 6)
      expect(gap(QUARTER * 3)).toBeCloseTo(0, 6)
    })

    it('Then half way round they are the gauge apart again', () => {
      expect(gap(QUARTER * 2)).toBeCloseTo(GAUGE, 6)
    })
  })
})
