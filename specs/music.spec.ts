import { describe, expect, it } from 'bun:test'
import { MUSIC_TRACKS, trackBy, useMusic } from '../src/game/music'

describe('Feature: the ambient playlist continues for ever', () => {
  it('lists every supplied track once', () => {
    expect(MUSIC_TRACKS).toHaveLength(7)
    expect(new Set(MUSIC_TRACKS.map((track) => track.src)).size).toBe(MUSIC_TRACKS.length)
    expect(MUSIC_TRACKS.every((track) => track.artist === 'Grace Chiang')).toBe(true)
  })

  it('continues from the last track to the first', () => {
    expect(trackBy(MUSIC_TRACKS.length - 1, 1)).toBe(0)
  })

  it('goes back from the first track to the last', () => {
    expect(trackBy(0, -1)).toBe(MUSIC_TRACKS.length - 1)
  })

  it('starts a little above half volume, with headroom for the effects', () => {
    expect(useMusic.getState().volume).toBe(0.6)
  })
})
