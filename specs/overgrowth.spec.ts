import { describe, expect, it } from 'bun:test'
import { type Drape, ivyDrapes } from '../src/world/foliage'

const door = { name: 'booth', width: 1.2, height: 2.2, post: 0.15 }

const left = (drape: Drape) => drape.x - drape.width / 2
const right = (drape: Drape) => drape.x + drape.width / 2
const bottom = (drape: Drape) => drape.y - drape.drop

describe('Feature: an old doorway is overgrown', () => {
  const all = ivyDrapes(door)
  const half = door.width / 2
  const top = door.height + door.post

  describe('Scenario: where the ivy hangs', () => {
    it('Given an overgrown door, then ivy covers both posts from top to bottom', () => {
      for (const side of [-1, 1]) {
        const onPost = all.filter((drape) => drape.x * side > half)

        // No height on the post is left bare.
        for (let y = 0.3; y < door.height; y += 0.1) {
          expect(onPost.some((drape) => bottom(drape) <= y && drape.y >= y)).toBe(true)
        }
      }
    })

    it('Then it covers the top from end to end', () => {
      const along = all.filter((drape) => drape.y >= top && Math.abs(drape.x) < half + door.post)

      for (let x = -half; x <= half; x += 0.1) {
        expect(along.some((drape) => left(drape) <= x && right(drape) >= x)).toBe(true)
      }
    })

    it('Then it reaches the ground at the foot of each post', () => {
      for (const side of [-1, 1]) {
        const lowest = Math.min(...all.filter((d) => d.x * side > half).map(bottom))

        expect(lowest).toBeLessThan(0.25)
        expect(lowest).toBeGreaterThanOrEqual(-1e-9)
      }
    })

    it('Then it hangs down into the opening from the top', () => {
      const hanging = all.filter(
        (drape) => Math.abs(drape.x) < half && bottom(drape) < door.height - 0.1,
      )

      expect(hanging.length).toBeGreaterThan(2)
    })

    it('Then the way through is left clear: nothing hangs lower than head height in the middle', () => {
      const inTheWay = all.filter(
        (drape) =>
          left(drape) < half * 0.6 &&
          right(drape) > -half * 0.6 &&
          bottom(drape) < 1.7 &&
          drape.y > 0.6,
      )

      expect(inTheWay).toHaveLength(0)
    })

    it('Then it all hangs on the front of the frame, not behind the door', () => {
      expect(Math.min(...all.map((drape) => drape.z))).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Scenario: every door grows its own way', () => {
    it('Given the same door built twice, then its ivy is the same both times', () => {
      expect(ivyDrapes(door)).toEqual(all)
    })

    it('Given two different doors, then their ivy differs', () => {
      expect(ivyDrapes({ ...door, name: 'loop-west' })).not.toEqual(all)
    })
  })
})
