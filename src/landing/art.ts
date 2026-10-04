import type { CSSProperties } from 'react'
import { FRAME } from './timeline'

const dir = `${import.meta.env.BASE_URL}landing/`

/* Helvetica, as in the Figma file. */
export const FONT = 'Helvetica, "Helvetica Neue", Arial, sans-serif'

/* The greys of the title and of the captions. */
export const INK = '#434343'
export const CAPTION_INK = '#584747'

export const art = {
  /* Textures-2 1: the grain over every frame. */
  grain: `${dir}grain.jpg`,
  /* Textures-1 1: the blue texture that the water can be painted from. */
  water: `${dir}water.jpg`,
  /* The six falling frames of the raindrop, each cut out round the drop, pencil on nothing. */
  drops: [0, 1, 2, 3, 4, 5].map((i) => `${dir}drop-${i}.png`),
  /* The eleven splash frames, all cut to the same box, pencil on nothing. */
  splashes: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((i) => `${dir}splash-${i}.png`),
}

/* How strong the grain is in the Figma file: heavy on the title, light on the drawings. */
export const TITLE_GRAIN = 0.56
export const PAGE_GRAIN = 0.17

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Slide {
  image: string
  /* The same drawing with only its pencil lines, for `?draw=speedraw`. */
  lines: string
  /* The artist's timelapse of watercolouring it, cut to the drawing, for `?draw=speedpaint`. */
  paint: string
  /* Where the drawing sits in the frame. */
  rect: Rect
  /*
    The light in the drawing (the gem), cut out onto its own layer so that it
    can glow. `image` is the gem alone, `rect` is where it was cut from, and
    `reach` is how far the yellow wash round it goes. The drawing itself has
    the gem painted out.
  */
  gem: { image: string; rect: Rect; reach: number }
  caption: string
}

export const desk: Slide = {
  image: `${dir}desk.jpg`,
  lines: `${dir}desk-lines.jpg`,
  paint: `${dir}desk-paint.mp4`,
  rect: { x: 116, y: 83, w: 1800, h: 1200 },
  gem: { image: `${dir}desk-gem.png`, rect: { x: 1469, y: 165, w: 160, h: 220 }, reach: 150 },
  caption: 'in the rigid life of the world we lead, sometimes we see a light to a dream',
}

export const lightSlide: Slide = {
  image: `${dir}light.jpg`,
  lines: `${dir}light-lines.jpg`,
  paint: `${dir}light-paint.mp4`,
  rect: { x: -40, y: 0, w: 2166, h: 1444 },
  gem: { image: `${dir}light-gem.png`, rect: { x: 848, y: 520, w: 192.5, h: 264.7 }, reach: 165 },
  caption: 'a light that makes us question the box we push ourselves in.',
}

export const LAST_CAPTION = 'what if we could embrace what we imagine?'

/* The captions' top and type size in the frame. */
export const CAPTION = { top: 1283, size: 64 } as const

/* The box each falling drop was cut to, centred on the drop. */
export const DROP_SPRITE = { w: 96, h: 140 } as const
/* The box every splash frame was cut to. */
export const SPLASH_RECT: Rect = { x: 606, y: 789, w: 1370, h: 450 }
/* "click to enter": low in the water, under where the rings fade, and its type size. */
export const PROMPT = { x: 1080, y: 1290, size: 56 } as const
/* The top of the blue water once it has risen. */
export const WATER_LINE = 850

export function percent(value: number, of: number): string {
  return `${(value / of) * 100}%`
}

/* CSS that puts a rectangle of the frame in its place in the scaled frame. */
export function place(rect: Rect): CSSProperties {
  return {
    left: percent(rect.x, FRAME.w),
    top: percent(rect.y, FRAME.h),
    width: percent(rect.w, FRAME.w),
    height: percent(rect.h, FRAME.h),
  }
}
