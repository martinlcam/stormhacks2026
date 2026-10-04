import { describe, expect, it } from 'bun:test'
import { rainDrops } from '../src/game/sound'

const RATE = 8000

/* A repeatable stream of numbers from 0 to 1. */
function seeded() {
  let state = 12345
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

const loudness = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length)

describe('Feature: the rain sounds like rain', () => {
  const rain = rainDrops(RATE, 4, seeded())

  describe('Scenario: rain is made of drops', () => {
    it('Given the sound of rain, then it is spiky: its loudest moments stand far above its usual level', () => {
      const peak = rain.reduce((most, s) => Math.max(most, Math.abs(s)), 0)

      // For steady hiss this is under 2. Separate drops make it several times that.
      expect(peak / loudness(rain)).toBeGreaterThan(5)
    })

    it('Then it is uneven from moment to moment, as drops come and go', () => {
      // How loud each fiftieth of a second is.
      const window = RATE / 50
      const levels: number[] = []
      for (let i = 0; i + window <= rain.length; i += window) {
        levels.push(loudness(rain.subarray(i, i + window)))
      }
      const mean = levels.reduce((a, b) => a + b, 0) / levels.length
      const spread = Math.sqrt(levels.reduce((a, l) => a + (l - mean) ** 2, 0) / levels.length)

      // For steady hiss this is about 0.05.
      expect(spread / mean).toBeGreaterThan(0.3)
    })

    it('Then there is never a silence: some drop is always falling', () => {
      const window = RATE / 10
      for (let i = 0; i + window <= rain.length; i += window) {
        expect(loudness(rain.subarray(i, i + window))).toBeGreaterThan(0.002)
      }
    })

    it('Then it never gets loud enough to distort', () => {
      expect(rain.every((s) => Math.abs(s) < 1)).toBe(true)
    })
  })
})
