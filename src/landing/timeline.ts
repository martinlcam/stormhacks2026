/*
  The landing page is one long scroll. Nearly everything on it is a function
  of how far down the page the reader is (`p`, from 0 at the top to 1 at the
  bottom), so the story plays forwards when they scroll down and backwards
  when they scroll up. The numbers after `#` are the Figma comments that each
  beat answers.
*/

/* How tall the scroll track is, in window heights. */
export const TRACK_HEIGHTS = 12

/* Where each beat starts and ends, as progress from 0 to 1. */
export const beats = {
  /* The hint to scroll goes as soon as the reader does. */
  hint: [0, 0.025],
  /*
    The title. Its four lights start as small dots of colour and grow until
    they meet, join and cover the page; then the colour, the title and its
    heavy grain fade to the white paper of the drawings (#1).
  */
  spread: [0, 0.1],
  titleFade: [0.1, 0.135],
  /* #2 and #3: the first drawing comes in, then its light glows (#6). #4: its caption wipes in. */
  deskIn: [0.135, 0.21],
  deskGlow: [0.18, 0.28],
  deskCaption: [0.2, 0.25],
  deskOut: [0.29, 0.34],
  /* #5: the second drawing comes in the same way. #6: its light glows. */
  lightIn: [0.32, 0.4],
  lightGlow: [0.36, 0.48],
  lightCaption: [0.39, 0.44],
  lightOut: [0.5, 0.55],
  /* The last caption wipes in. */
  lastCaption: [0.54, 0.59],
  /* #8: the caption moves to the middle, grows and goes, while blue watercolour rises up the page. */
  lift: [0.62, 0.72],
  wash: [0.6, 0.72],
  /* The drop appears at the top of the first drawing, then falls through every slide to the water. */
  dropIn: [0.135, 0.16],
  fall: [0.15, 0.79],
  /* #10: the splash, and then the button. */
  splash: [0.79, 0.86],
  button: [0.85, 0.91],
} as const satisfies Record<string, readonly [number, number]>

/* 0 before `from`, 1 after `to`, and a smooth curve between. */
export function ramp(from: number, to: number, x: number): number {
  const t = linear(from, to, x)
  return t * t * (3 - 2 * t)
}

/* 0 before `from`, 1 after `to`, and a straight line between. */
export function linear(from: number, to: number, x: number): number {
  return Math.min(1, Math.max(0, (x - from) / (to - from)))
}

export function beat(name: keyof typeof beats, p: number): number {
  return ramp(beats[name][0], beats[name][1], p)
}

/*
  The title's lights at progress `p`: how large they are, as a multiple of
  their size in the Figma file, and how much of their colour shows. They
  start as small dots, are their designed size about halfway through the
  spread, and by its end are large enough to cover any window.
*/
export const BLOOM_START = 0.06
export const BLOOM_END = 3

export function bloomAt(p: number): { scale: number; alpha: number } {
  const t = linear(beats.spread[0], beats.spread[1], p)
  return {
    scale: BLOOM_START + (BLOOM_END - BLOOM_START) * t ** 1.6,
    alpha: 1 - beat('titleFade', p),
  }
}

/*
  Everything is placed in the pixels of the Figma frames, 2160 by 1440, and
  the frame is scaled to fit the window.
*/
export const FRAME = { w: 2160, h: 1440 } as const

/* The drop falls straight down this line, as it does in the animation. */
export const DROP_X = 1116
/* Its centre at the top of the first drawing, and where it touches the water. */
export const DROP_TOP = 256
export const IMPACT_Y = 919
/* The first six frames of the animation are the drop falling; the other seven are the splash. */
export const FALL_FRAMES = 6
export const SPLASH_FRAMES = 7

/*
  The drop at progress `p`: its height in the frame, which falling frame to
  draw it with, and how much of it shows. It speeds up a little as it goes,
  and by the end of the second drawing it has been through all six shapes.
*/
export function dropAt(p: number): { y: number; frame: number; alpha: number } {
  const t = linear(beats.fall[0], beats.fall[1], p)
  return {
    y: DROP_TOP + (IMPACT_Y - DROP_TOP) * t ** 1.25,
    frame: Math.min(FALL_FRAMES - 1, Math.floor(t * 9)),
    alpha: beat('dropIn', p),
  }
}

/*
  Seconds of the animation that the scroll from the splash to the bottom of
  the page stands for.
*/
const RIPPLE_SECONDS_PER_P = 9

/*
  The splash at progress `p`. Like everything else it follows the scroll:
  the drop lands and its seven frames play only as far as
  the page is scrolled, and scrolling up takes them back. `frame` is which
  splash frame to show (0 to 6, or -1 before the drop lands) and `ripple` is
  how many seconds of the animation have passed since it landed (-1 before).
*/
export function splashAt(p: number): { frame: number; ripple: number; button: number } {
  if (p < beats.splash[0]) return { frame: -1, ripple: -1, button: 0 }
  const into = linear(beats.splash[0], beats.splash[1], p)
  return {
    frame: Math.min(SPLASH_FRAMES - 1, Math.floor(into * SPLASH_FRAMES)),
    ripple: (p - beats.splash[0]) * RIPPLE_SECONDS_PER_P,
    button: beat('button', p),
  }
}
