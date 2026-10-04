import { beforeEach, describe, expect, it } from 'bun:test'
import { useGame } from '../src/game/store'

describe('Feature: a new player is shown the controls until they have used them', () => {
  beforeEach(() => {
    useGame.setState(useGame.getInitialState(), true)
  })

  describe('Scenario: coming in', () => {
    it('Given a new game, then nothing has been learned and the mouse has never been captured', () => {
      const state = useGame.getState()
      expect(Object.values(state.learned).some(Boolean)).toBe(false)
      expect(state.everPlayed).toBe(false)
    })

    it('Given the mouse is captured and then let go, then the game remembers it was captured once', () => {
      useGame.getState().setPlaying(true)
      useGame.getState().setPlaying(false)
      expect(useGame.getState().everPlayed).toBe(true)
    })
  })

  describe('Scenario: using the controls', () => {
    it('Given the player walks, then only walking is ticked off', () => {
      useGame.getState().learn('move')
      expect(useGame.getState().learned).toEqual({
        move: true,
        look: false,
        jump: false,
        pickUp: false,
      })
    })

    it('Given the player has walked, looked round, jumped and picked something up, then all are ticked off', () => {
      for (const lesson of ['move', 'look', 'jump', 'pickUp'] as const)
        useGame.getState().learn(lesson)
      expect(Object.values(useGame.getState().learned).every(Boolean)).toBe(true)
    })
  })
})
