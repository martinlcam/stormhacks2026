import { describe, expect, it } from 'bun:test'
import { seamless } from '../src/game/sound'

const RATE = 1000

describe('Feature: the rain plays round and round without a join', () => {
  // A recording that drifts steadily upwards, so its end is nothing like its beginning.
  const recording = Float32Array.from({ length: 10 * RATE }, (_, i) => i / (10 * RATE))
  const loop = seamless(recording, RATE, 2)

  describe('Scenario: joining the end of a recording to its beginning', () => {
    it('Given a recording, then the loop is shorter by the part that is faded over', () => {
      expect(loop.length).toBe(8 * RATE)
    })

    it('Then where the loop ends is where it begins: no jump when it comes round', () => {
      const step = Math.abs(recording[1] - recording[0])
      const join = Math.abs(loop[0] - loop[loop.length - 1])

      // The recording itself would jump by almost 1 from its end to its start.
      expect(join).toBeLessThan(step * 20)
    })

    it('Then the middle of the recording is left as it was', () => {
      expect(loop[5 * RATE]).toBe(recording[5 * RATE])
    })

    it('Given a silence at each end of the file, when it is trimmed, then the silence is not in the loop', () => {
      const padded = new Float32Array(10 * RATE).fill(0.5)
      padded.fill(0, 0, 200)
      padded.fill(0, padded.length - 200)

      const trimmed = seamless(padded, RATE, 2, 0.2)

      expect(trimmed.every((sample) => sample > 0.4)).toBe(true)
    })
  })
})
