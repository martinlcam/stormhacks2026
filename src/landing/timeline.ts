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
  /* #1: watercolour spreads over the title and leaves white paper. */
  dissolve: [0.03, 0.13],
  /* #2 and #3: the first drawing comes in, then its light glows (#6). #4: its caption wipes in. */
  deskIn: [0.11, 0.19],
  deskGlow: [0.16, 0.26],
  deskCaption: [0.18, 0.23],
  deskOut: [0.28, 0.33],
  /* #5: the second drawing comes in the same way. #6: its light glows. */
  lightIn: [0.31, 0.39],
  lightGlow: [0.35, 0.47],
  lightCaption: [0.38, 0.43],
  lightOut: [0.49, 0.54],
  /* The last caption wipes in. */
  lastCaption: [0.53, 0.58],
  /* #8: the caption moves to the middle, grows and goes, while blue watercolour rises up the page. */
  lift: [0.62, 0.72],
  wash: [0.6, 0.72],
  /* The drop appears at the top of the first drawing, then falls through every slide to the water. */
  dropIn: [0.11, 0.14],
  fall: [0.14, 0.79],
  /* #10: the splash, its rings, and then the button. */
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
  the page stands for, so that the rings spread about as fast as the splash
  was drawn.
*/
const RIPPLE_SECONDS_PER_P = 9

/*
  The splash at progress `p`. Like everything else it follows the scroll:
  the drop lands, its seven frames play and its rings spread only as far as
  the page is scrolled, and scrolling up takes them back. `frame` is which
  splash frame to show (0 to 6, or -1 before the drop lands) and `ripple` is
  how many seconds of the animation the rings have had (-1 before).
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
