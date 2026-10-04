import { describe, expect, it } from 'bun:test'
import { FLAGS, readFlag } from '../src/flags'
import { walk } from '../src/landing/speedraw'
import {
  BLOOM_END,
  BLOOM_START,
  DROP_TOP,
  DROP_X,
  FALL_FRAMES,
  GATHER,
  IMPACT_Y,
  SPLASH_FRAMES,
  ballAt,
  beats,
  bloomAt,
  dropAt,
  revealAt,
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

    it('Given the page scrolled down step by step, then the drop goes through its falling shapes in order, after the faint first one', () => {
      const seen: number[] = []
      for (const p of steps(beats.become[0], 1)) {
        const { frame } = dropAt(p)
        if (seen.at(-1) !== frame) seen.push(frame)
      }
      expect(seen).toEqual(Array.from({ length: FALL_FRAMES - 1 }, (_, i) => i + 1))
    })

    it('Given the top of the page, then no drop shows until the black ball has become it', () => {
      expect(dropAt(0).alpha).toBe(0)
      expect(dropAt(beats.become[1]).alpha).toBe(1)
    })
  })

  describe('Scenario: the title gathers into a ball that becomes the raindrop', () => {
    it('Given the top of the page, then the words are whole and there is no ball', () => {
      const ball = ballAt(0)
      expect(ball.gather).toBe(0)
      expect(ball.alpha).toBe(0)
    })

    it('Given the ball starts to rise, then it starts from where the words gathered', () => {
      const ball = ballAt(beats.rise[0])
      expect(ball.x).toBeCloseTo(GATHER.x)
      expect(ball.y).toBeCloseTo(GATHER.y)
    })

    it('Given the words have gathered, then the ball is all there', () => {
      expect(ballAt(beats.gather[1]).alpha).toBe(1)
    })

    it('Given the ball has risen, then it is exactly where the raindrop starts its fall', () => {
      const ball = ballAt(beats.rise[1])
      expect(ball.x).toBeCloseTo(DROP_X)
      expect(ball.y).toBeCloseTo(DROP_TOP)
      expect(dropAt(beats.rise[1]).y).toBeCloseTo(DROP_TOP)
    })

    it('Given the page scrolled step by step, then the ball moves without jumps and only upwards', () => {
      let last = ballAt(beats.rise[0])
      for (const p of steps(beats.rise[0], beats.rise[1])) {
        const ball = ballAt(p)
        expect(Math.hypot(ball.x - last.x, ball.y - last.y)).toBeLessThan(15)
        expect(ball.y).toBeLessThanOrEqual(last.y + 1e-9)
        last = ball
      }
    })

    it('Given the ball has become the raindrop, then the ball is gone and the drop is all there', () => {
      expect(ballAt(beats.become[1]).alpha).toBe(0)
      expect(dropAt(beats.become[1]).alpha).toBe(1)
    })
  })

  describe('Scenario: the timelapse paints each drawing', () => {
    it('Given the page scrolled through the first drawing, then the timelapse plays from start to end', () => {
      expect(revealAt('desk', 'speedpaint', beats.deskPaint[0]).paint).toBe(0)
      expect(revealAt('desk', 'speedpaint', beats.deskPaint[1]).paint).toBe(1)
    })

    it('Given the timelapse is still playing, then the gem does not glow yet', () => {
      const reveal = revealAt('light', 'speedpaint', beats.lightPaint[1])
      expect(reveal.settle).toBe(0)
      expect(reveal.glow).toBe(0)
    })

    it('Given the drawing has settled, then its gem glows', () => {
      expect(revealAt('desk', 'speedpaint', beats.deskGlow[1]).glow).toBe(1)
    })

    it('Given ?draw=fade, then there is no timelapse and the drawing is finished as it comes in', () => {
      const reveal = revealAt('desk', 'fade', beats.deskIn[0])
      expect(reveal).toMatchObject({ enter: 0, paint: 1, settle: 1 })
    })
  })

  describe('Scenario: the splash is tied to the scroll', () => {
    it('Given the drop has not landed, then there is no splash and nothing to click', () => {
      expect(splashAt(beats.splash[0] - 0.001)).toEqual({
        frame: -1,
        alpha: 0,
        ripple: -1,
        prompt: 0,
      })
    })

    it('Given the page scrolled through the splash, then every one of its frames plays in order', () => {
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

    it('Given the splash has ended, then its last line has faded all the way out', () => {
      const splash = splashAt(beats.splashFade[1])
      expect(splash.frame).toBe(SPLASH_FRAMES - 1)
      expect(splash.alpha).toBe(0)
    })

    it('Given the bottom of the page, then "click to enter" is all the way in', () => {
      expect(splashAt(1).prompt).toBe(1)
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
      expect(readFlag('draw', '?draw=sideways')).toBe(FLAGS.draw.options[0])
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
