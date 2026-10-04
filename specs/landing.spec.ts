import { describe, expect, it } from 'bun:test'
import { FLAGS, readFlag } from '../src/flags'
import { walk } from '../src/landing/speedraw'
import {
  BLOOM_END,
  BLOOM_START,
  FALL_FRAMES,
  IMPACT_Y,
  SPLASH_FRAMES,
  beats,
  bloomAt,
  dropAt,
  splashAt,
} from '../src/landing/timeline'

/* `count` evenly spaced points of progress between `from` and `to`. */
function steps(from: number, to: number, count = 200): number[] {
  return Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count)
}

describe('Feature: the landing story follows the scroll', () => {
  describe('Scenario: the title lights grow, join and fade', () => {
    it('Given the top of the page, then the lights are small dots of full colour', () => {
      expect(bloomAt(0)).toEqual({ scale: BLOOM_START, alpha: 1 })
    })

    it('Given the page scrolled down step by step, then the lights only ever grow', () => {
      let last = 0
      for (const p of steps(0, beats.spread[1])) {
        const { scale } = bloomAt(p)
        expect(scale).toBeGreaterThanOrEqual(last)
        last = scale
      }
      expect(last).toBe(BLOOM_END)
    })

    it('Given the lights have covered the page, then their colour fades to white before the first drawing', () => {
      expect(beats.spread[1]).toBeLessThanOrEqual(beats.titleFade[0])
      expect(bloomAt(beats.titleFade[1]).alpha).toBe(0)
      expect(beats.titleFade[1]).toBeLessThanOrEqual(beats.deskIn[0])
    })
  })

  describe('Scenario: the beats of the story', () => {
    it('Given every beat, then each starts before it ends and lies within the page', () => {
      for (const [name, [from, to]] of Object.entries(beats)) {
        expect(from, name).toBeGreaterThanOrEqual(0)
        expect(to, name).toBeLessThanOrEqual(1)
        expect(from, name).toBeLessThan(to)
      }
    })

    it('Given the drop, when the water has risen, then the drop has not yet landed', () => {
      expect(beats.wash[1]).toBeLessThan(beats.fall[1])
      expect(beats.fall[1]).toBe(beats.splash[0])
    })
  })

  describe('Scenario: scrolling down through the fall', () => {
    it('Given the page scrolled down step by step, then the drop only ever goes down and lands at the water', () => {
      let last = -Infinity
      for (const p of steps(0, beats.fall[1])) {
        const { y } = dropAt(p)
        expect(y).toBeGreaterThanOrEqual(last)
        last = y
      }
      expect(dropAt(beats.fall[1]).y).toBeCloseTo(IMPACT_Y)
    })

    it('Given the page scrolled down step by step, then the drop goes through all six falling shapes in order', () => {
      const seen: number[] = []
      for (const p of steps(0, 1)) {
        const { frame } = dropAt(p)
        if (seen.at(-1) !== frame) seen.push(frame)
      }
      expect(seen).toEqual(Array.from({ length: FALL_FRAMES }, (_, i) => i))
    })

    it('Given the top of the page, then no drop shows until the first drawing comes in', () => {
      expect(dropAt(0).alpha).toBe(0)
      expect(dropAt(beats.dropIn[1]).alpha).toBe(1)
    })
  })

  describe('Scenario: the splash is tied to the scroll', () => {
    it('Given the drop has not landed, then there is no splash, no rings and no button', () => {
      expect(splashAt(beats.splash[0] - 0.001)).toEqual({ frame: -1, ripple: -1, button: 0 })
    })

    it('Given the page scrolled through the splash, then its seven frames play in order and the rings spread', () => {
      const seen: number[] = []
      let ripple = -Infinity
      for (const p of steps(beats.splash[0], 1)) {
        const splash = splashAt(p)
        if (seen.at(-1) !== splash.frame) seen.push(splash.frame)
        expect(splash.ripple).toBeGreaterThanOrEqual(ripple)
        ripple = splash.ripple
      }
      expect(seen).toEqual(Array.from({ length: SPLASH_FRAMES }, (_, i) => i))
    })

    it('Given the bottom of the page, then the button is all the way in', () => {
      expect(splashAt(1).button).toBe(1)
    })

    it('Given the same place on the page, then the splash is the same whichever way it was reached', () => {
      const p = (beats.splash[0] + beats.splash[1]) / 2
      expect(splashAt(p)).toEqual(splashAt(p))
    })
  })
})

describe('Feature: flags for what we are still choosing between', () => {
  describe('Scenario: no flags in the address', () => {
    it('Given an address without flags, then every flag has its first option', () => {
      for (const name of Object.keys(FLAGS) as (keyof typeof FLAGS)[]) {
        expect(readFlag(name, '')).toBe(FLAGS[name].options[0])
      }
    })
  })

  describe('Scenario: choosing an option in the address', () => {
    it('Given ?draw=speedraw, then the drawings are speed-drawn', () => {
      expect(readFlag('draw', '?draw=speedraw')).toBe('speedraw')
    })

    it('Given an option the flag does not have, then the flag keeps its default', () => {
      expect(readFlag('draw', '?draw=sideways')).toBe('fade')
    })
  })
})

describe('Feature: a drawing is speed-drawn along its lines', () => {
  /* A grid of white RGBA cells with the given cells inked black. */
  function grid(cols: number, rows: number, inked: number[]): Uint8Array {
    const pixels = new Uint8Array(cols * rows * 4).fill(255)
    for (const cell of inked) pixels.fill(0, cell * 4, cell * 4 + 3)
    return pixels
  }

  describe('Scenario: one straight line', () => {
    it('Given a line across the grid, then it is drawn from one end to the other, cell by cell', () => {
      const line = [12, 13, 14, 15, 16]
      expect(Array.from(walk(grid(10, 3, line), 10, 3))).toEqual(line)
    })
  })

  describe('Scenario: two separate lines', () => {
    it('Given two lines, then the first is finished before the hand jumps to the second', () => {
      const top = [1, 2, 3]
      const bottom = [41, 42, 43]
      const order = Array.from(walk(grid(10, 5, [...top, ...bottom]), 10, 5))
      expect(order.slice(0, 3)).toEqual(top)
      expect(order.slice(3).sort((a, b) => a - b)).toEqual(bottom)
    })

    it('Given any drawing, then every inked cell is drawn exactly once', () => {
      const inked = [0, 5, 9, 22, 23, 37, 48]
      const order = Array.from(walk(grid(10, 5, inked), 10, 5))
      expect(order.sort((a, b) => a - b)).toEqual(inked)
    })
  })
})
