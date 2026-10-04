/*
  The landing page is one long scroll. Nearly everything on it is a function
  of how far down the page the reader is (`p`, from 0 at the top to 1 at the
  bottom), so the story plays forwards when they scroll down and backwards
  when they scroll up. The numbers after `#` are the Figma comments that each
  beat answers.
*/

/* How tall the scroll track is, in window heights. */
export const TRACK_HEIGHTS = 14

/* Where each beat starts and ends, as progress from 0 to 1. */
export const beats = {
  /* The hint to scroll goes as soon as the reader does. */
  hint: [0, 0.02],
  /*
    The title. Its four lights start as small blots and spread like
    watercolour until they cover the page, then the colour fades to the
    white paper of the drawings (#1).
  */
  spread: [0, 0.085],
  titleFade: [0.085, 0.115],
  /*
    Meanwhile the title's words gather into a small black ball, the ball
    rises to where the raindrop starts, and becomes the raindrop.
  */
  gather: [0.08, 0.105],
  rise: [0.1, 0.125],
  become: [0.12, 0.132],
  /*
    The first drawing: its pencil lines come in (#2), the artist's timelapse
    paints it (#3), it settles into the finished drawing, and its light
    glows (#6). #4: its caption wipes in.
  */
  deskIn: [0.128, 0.15],
  deskPaint: [0.15, 0.24],
  deskSettle: [0.24, 0.255],
  deskGlow: [0.245, 0.3],
  deskCaption: [0.205, 0.25],
  deskOut: [0.31, 0.35],
  /* #5: the second drawing comes in the same way. */
  lightIn: [0.34, 0.365],
  lightPaint: [0.365, 0.44],
  lightSettle: [0.44, 0.455],
  lightGlow: [0.445, 0.5],
  lightCaption: [0.41, 0.455],
  lightOut: [0.51, 0.55],
  /* The last caption wipes in. */
  lastCaption: [0.55, 0.6],
  /* #8: the caption moves to the middle, grows and goes, while blue watercolour rises up the page. */
  lift: [0.63, 0.72],
  wash: [0.61, 0.72],
  /* The raindrop falls through every slide to the water. */
  fall: [0.132, 0.79],
  /* #10: the splash, and then, as its rings fade, the invitation to go on. */
  splash: [0.79, 0.9],
  prompt: [0.89, 0.95],
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
export const SPLASH_FRAMES = 11

/*
  The drop at progress `p`: its height in the frame, which falling frame to
  draw it with, and how much of it shows. It starts as the black ball that
  the title gathered into, so it skips the faint first frame, in which the
  drop is still forming. It speeds up a little as it goes, and by the end of
  the second drawing it has been through the other five shapes.
*/
export function dropAt(p: number): { y: number; frame: number; alpha: number } {
  const t = linear(beats.fall[0], beats.fall[1], p)
  return {
    y: DROP_TOP + (IMPACT_Y - DROP_TOP) * t ** 1.25,
    frame: Math.min(FALL_FRAMES - 1, 1 + Math.floor(t * 8)),
    alpha: beat('become', p),
  }
}

/* Where the title's words gather: the middle of the word and its line, in the frame. */
export const GATHER = { x: 1080, y: 690 } as const
/* The ball's size as the words become it, and as it reaches the drop. */
const BALL_RADIUS = 26
const DROP_RADIUS = 12

/*
  The title's words and the black ball at progress `p`. `gather` is how far
  the words have drawn together (0 to 1); the ball is at (x, y) in the frame
  with radius `r`, showing `alpha` of itself, and `become` is how far it has
  turned into the raindrop. The ball rises along a gentle curve, slowly at
  first and last.
*/
export function ballAt(p: number): {
  gather: number
  x: number
  y: number
  r: number
  alpha: number
  become: number
} {
  const gather = beat('gather', p)
  const rise = beat('rise', p)
  const become = beat('become', p)
  // A curve from where the words gather, bowing out a little to the right, to the top of the drop's fall.
  const bow = { x: GATHER.x + 150, y: (GATHER.y + DROP_TOP) / 2 }
  const u = 1 - rise
  return {
    gather,
    x: u * u * GATHER.x + 2 * u * rise * bow.x + rise * rise * DROP_X,
    y: u * u * GATHER.y + 2 * u * rise * bow.y + rise * rise * DROP_TOP,
    r: BALL_RADIUS + (DROP_RADIUS - BALL_RADIUS) * rise,
    alpha: ramp(0.75, 1, linear(beats.gather[0], beats.gather[1], p)) * (1 - become),
    become,
  }
}

/* The ways a drawing can come in: the `draw` flag. */
export type DrawMode = 'speedpaint' | 'fade' | 'speedraw'

const SLIDE_BEATS = {
  desk: {
    in: 'deskIn',
    paint: 'deskPaint',
    settle: 'deskSettle',
    glow: 'deskGlow',
    out: 'deskOut',
  },
  light: {
    in: 'lightIn',
    paint: 'lightPaint',
    settle: 'lightSettle',
    glow: 'lightGlow',
    out: 'lightOut',
  },
} as const

/*
  How far a drawing has come in at progress `p`. `enter` is how far it has
  come in at all; with the timelapse, `paint` is how far through it is and
  `settle` how far it has turned into the finished drawing. `glow` is its
  gem's glow, which waits until it has settled, and `leave` how far it has
  gone.
*/
export function revealAt(
  slide: keyof typeof SLIDE_BEATS,
  mode: DrawMode,
  p: number,
): { enter: number; paint: number; settle: number; glow: number; leave: number } {
  const named = SLIDE_BEATS[slide]
  const come = beats[named.in]
  const painting = beats[named.paint]
  const leave = beat(named.out, p)
  if (mode === 'speedpaint') {
    const settle = beat(named.settle, p)
    return {
      enter: beat(named.in, p),
      paint: linear(painting[0], painting[1], p),
      settle,
      glow: beat(named.glow, p) * settle,
      leave,
    }
  }

  // Without the timelapse, the lines are drawn or the drawing fades in over the same stretch.
  const until = mode === 'speedraw' ? painting[1] : painting[0] + 0.04
  return { enter: ramp(come[0], until, p), paint: 1, settle: 1, glow: beat(named.glow, p), leave }
}

/*
  Seconds of the animation that the scroll from the splash to the bottom of
  the page stands for.
*/
const RIPPLE_SECONDS_PER_P = 9

/*
  The splash at progress `p`. Like everything else it follows the scroll:
  the drop lands and its frames play only as far as the page is scrolled,
  and scrolling up takes them back. `frame` is which splash frame to show
  (or -1 before the drop lands), `ripple` how many seconds of the animation
  have passed since it landed (-1 before), and `prompt` how far "click to
  enter" has come up.
*/
export function splashAt(p: number): { frame: number; ripple: number; prompt: number } {
  if (p < beats.splash[0]) return { frame: -1, ripple: -1, prompt: 0 }
  const into = linear(beats.splash[0], beats.splash[1], p)
  return {
    frame: Math.min(SPLASH_FRAMES - 1, Math.floor(into * SPLASH_FRAMES)),
    ripple: (p - beats.splash[0]) * RIPPLE_SECONDS_PER_P,
    prompt: beat('prompt', p),
  }
}
