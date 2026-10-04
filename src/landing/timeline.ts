/*
  The landing page is one long scroll. Everything on it is a function of how
  far down the page the reader is, so the story plays forwards when they
  scroll down and backwards when they scroll up.
*/

/* How tall the scroll track is, in viewport heights. */
export const TRACK_HEIGHTS = 10

/* What the painters need to draw one frame. */
export interface Frame {
  /* Size of the stage in CSS pixels. */
  w: number
  h: number
  /* How far through the story, 0 to 1. */
  p: number
  /* How far the page has been scrolled, in viewport heights. */
  scroll: number
}

/* Where each beat of the story starts and ends, as progress from 0 to 1. */
export const beats = {
  /* The terrace and the girl rise into the frame. */
  rise: [0.06, 0.26],
  /* The sky turns from dusk to storm. */
  storm: [0.26, 0.44],
  /* The rain goes from the first drops to a shower, and later stops. */
  rain: [0.28, 0.5],
  rainStops: [0.72, 0.78],
  /* The puddle grows at her feet. */
  puddle: [0.44, 0.62],
  /* The straight lines of the rain start to drift apart. */
  bend: [0.5, 0.72],
  /* The picture turns to wet paper, then dark blue pigment spreads over it. */
  wet: [0.5, 0.64],
  wash: [0.6, 0.76],
  /* Under the water. */
  under: [0.74, 0.84],
  sink: [0.74, 0.9],
  /* The fade to white, and then the launch page. */
  white: [0.88, 0.94],
  launch: [0.94, 0.985],
} as const satisfies Record<string, readonly [number, number]>

/* 0 before `from`, 1 after `to`, and a smooth curve between. */
export function ramp(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

export function beat(name: keyof typeof beats, p: number): number {
  return ramp(beats[name][0], beats[name][1], p)
}
