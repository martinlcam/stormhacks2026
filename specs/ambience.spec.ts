import { describe, expect, it } from 'bun:test'
import { MAX_DRONE_LEVEL, MAX_RAIN_LEVEL, useAmbience } from '../src/game/ambience'

describe('Feature: the background ambience stays behind the game', () => {
  it('starts softer than its available maximum', () => {
    const { drone, rain } = useAmbience.getState()

    expect(drone * MAX_DRONE_LEVEL).toBeCloseTo(0.065)
    expect(rain * MAX_RAIN_LEVEL).toBeCloseTo(0.14)
  })
})
