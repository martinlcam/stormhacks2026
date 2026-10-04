import { describe, expect, it } from 'bun:test'
import {
  claim,
  filmUniforms,
  RAINBOW,
  resetFilm,
  restoreColours,
  stepFilm,
} from '../src/engine/film'

const colours = filmUniforms.uFilmColours.value
const names = RAINBOW.map(([name]) => name)
const back = () => names.filter((_, i) => colours[i] === 1)

describe('Feature: the world is grey until puzzles put its colours back', () => {
  describe('Scenario: a new game', () => {
    it('Given no puzzle is solved, then no colour is back', () => {
      resetFilm()
      expect(back()).toEqual([])
    })
  })

  describe('Scenario: solving puzzles', () => {
    it('Given the first puzzle is solved, when the colour has had time to bloom, then red alone is back', () => {
      resetFilm()
      restoreColours(1)
      stepFilm(10, 10)
      expect(back()).toEqual(['red'])
    })

    it('Given a puzzle was just solved, then its colour is only part of the way back', () => {
      resetFilm()
      restoreColours(1)
      stepFilm(0.5, 0.5)
      expect(colours[0]).toBeGreaterThan(0)
      expect(colours[0]).toBeLessThan(1)
    })

    it('Given three puzzles are solved, then red, orange and yellow are back', () => {
      resetFilm()
      restoreColours(3)
      stepFilm(10, 10)
      expect(back()).toEqual(['red', 'orange', 'yellow'])
    })

    it('Given every puzzle is solved, then the whole rainbow is back', () => {
      resetFilm()
      restoreColours(7)
      stepFilm(10, 10)
      expect(back()).toEqual([...names])
    })
  })

  describe('Scenario: every hue belongs to the rainbow', () => {
    it('Given any hue, then the colours claim all of it between them, and no more', () => {
      for (let hue = 0; hue < 360; hue++) {
        const claimed = RAINBOW.reduce((sum, _, i) => sum + claim(i, hue), 0)
        expect(claimed).toBeCloseTo(1, 5)
      }
    })

    it('Given the purple and the cyan of the palette, then purple and blue claim them', () => {
      expect(claim(names.indexOf('purple'), 287)).toBe(1)
      expect(claim(names.indexOf('blue'), 199)).toBe(1)
    })
  })

  describe('Scenario: the lighting lab', () => {
    it('Given a scene that keeps its colours, then they are all there at once, with no grain', () => {
      resetFilm(RAINBOW.length, false)
      expect(back()).toEqual([...names])
      expect(filmUniforms.uFilmGrain.value).toBe(0)
    })
  })
})
