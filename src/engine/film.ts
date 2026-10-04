/*
  The look of the world. It is black and white, as old film is, until the
  player solves puzzles: each one puts a colour of the rainbow back, red
  first. The things a puzzle is made of are never quite grey: they keep
  half of their colour, and have all of it once their puzzle is solved. The
  dark parts of the picture carry film grain, and so, faintly, does anything
  the player can pick up.

  It is done at the end of every material's own shader and not in a pass
  over the finished picture, so that the portal renderer's stencil, scissor
  and antialiasing are left as they are.
*/

/*
  The colours in the order they come back, each with the hue, in degrees,
  where it begins. It runs to where the next begins, and purple round to red.
*/
export const RAINBOW = [
  ['red', 330],
  ['orange', 18],
  ['yellow', 45],
  ['green', 75],
  ['blue', 170],
  ['indigo', 245],
  ['purple', 270],
] as const

/* How many degrees the edge between two colours is spread over, each way. */
const SOFT = 6
/* Seconds a colour takes to come back. */
const BLOOM = 2.5
/* How much of its colour a puzzle's thing keeps while the puzzle is unsolved, out of 1. */
const KEPT = 0.5
/* How often the grain changes, as frames of film do. */
const FRAMES_A_SECOND = 24
/* How strong the grain is in the dark, and on an item, out of 1. */
const SHADOW_GRAIN = 0.09
const ITEM_GRAIN = 0.035

/* The middle of each colour's share of the hues, and half its width. */
export const BANDS = RAINBOW.map(([, from], i) => {
  const to = RAINBOW[(i + 1) % RAINBOW.length][1]
  const width = (to - from + 360) % 360
  return { centre: (from + width / 2) % 360, half: width / 2 }
})

/* Shared by every material. */
export const filmUniforms = {
  /* How far each colour has come back, 0 to 1, in the order of RAINBOW. */
  uFilmColours: { value: RAINBOW.map(() => 0) },
  /* 1 for the grain as designed, 0 for none. */
  uFilmGrain: { value: 1 },
  /* Which frame of film this is. */
  uFilmFrame: { value: 0 },
  /* How many pixels of the canvas one speck of grain covers. */
  uFilmSpeck: { value: 1 },
  /* The least of its colour a material keeps. A puzzle's things have their own (see `keepColour`). */
  uFilmKeep: { value: 0 },
}

/* Each set of things that keep some colour: how much, and whether it is to be all of it. */
const kept: { uniform: { value: number }; whole: boolean }[] = []

/*
  A new set of things that keep half their colour, as the things of one
  puzzle. Returns its number: a material with that as `userData.keep` is one
  of the set. A number, so that it lasts through the copying of a material.
*/
export function keepColour(): number {
  kept.push({ uniform: { value: KEPT }, whole: false })
  return kept.length - 1
}

/* The share of its colour that a set keeps, for a shader. */
export function keepUniform(set: number): { value: number } {
  return kept[set].uniform
}

/* Give a set all of its colour. It fades in. */
export function restoreKept(set: number) {
  kept[set].whole = true
}

/* How many colours are back, or on their way. */
let restored = 0

/* Have this many colours back, the first of the rainbow first. They fade in. */
export function restoreColours(count: number) {
  restored = Math.max(0, Math.min(RAINBOW.length, count))
}

/*
  Start again with this many colours, at once and with no fade. `grain`
  turns the grain off, for scenes that are compared pixel by pixel.
*/
export function resetFilm(count = 0, grain = true) {
  restoreColours(count)
  const colours = filmUniforms.uFilmColours.value
  for (let i = 0; i < colours.length; i++) colours[i] = i < restored ? 1 : 0
  filmUniforms.uFilmGrain.value = grain ? 1 : 0
}

/* Move the film on by `dt` seconds. `elapsed` is the time since the start. */
export function stepFilm(dt: number, elapsed: number) {
  const colours = filmUniforms.uFilmColours.value
  const step = dt / BLOOM
  for (let i = 0; i < colours.length; i++) {
    const target = i < restored ? 1 : 0
    colours[i] += Math.max(-step, Math.min(step, target - colours[i]))
  }
  for (const { uniform, whole } of kept) {
    if (whole) uniform.value = Math.min(1, uniform.value + step * (1 - KEPT))
  }
  filmUniforms.uFilmFrame.value = Math.floor(elapsed * FRAMES_A_SECOND)
}

/* How much of a hue, in degrees, a colour of the rainbow claims: 1 inside its share, 0 outside. */
export function claim(colour: number, hue: number): number {
  const { centre, half } = BANDS[colour]
  const away = Math.abs(((((hue - centre + 180) % 360) + 360) % 360) - 180)
  const t = Math.max(0, Math.min(1, (away - (half - SOFT)) / (SOFT * 2)))
  return 1 - t * t * (3 - 2 * t)
}

/* For the top of a fragment shader. */
export const FILM_PARS = /* glsl */ `
uniform float uFilmColours[${RAINBOW.length}];
uniform float uFilmGrain;
uniform float uFilmFrame;
uniform float uFilmSpeck;
uniform float uFilmKeep;

float filmHue(vec3 c) {
  float high = max(c.r, max(c.g, c.b));
  float spread = high - min(c.r, min(c.g, c.b));
  if (spread < 1e-5) return 0.0;
  float h = high == c.r ? (c.g - c.b) / spread
    : high == c.g ? 2.0 + (c.b - c.r) / spread
    : 4.0 + (c.r - c.g) / spread;
  return fract(h / 6.0) * 360.0;
}

float filmClaim(float hue, float centre, float half_) {
  float away = abs(mod(hue - centre + 180.0, 360.0) - 180.0);
  return 1.0 - smoothstep(half_ - ${SOFT.toFixed(1)}, half_ + ${SOFT.toFixed(1)}, away);
}

// Grey, but for the colours that are back and the share that is kept.
vec3 filmColour(vec3 c) {
  float hue = filmHue(c);
  float keep = 0.0;
${BANDS.map(
  ({ centre, half }, i) =>
    `  keep += uFilmColours[${i}] * filmClaim(hue, ${centre.toFixed(1)}, ${half.toFixed(1)});`,
).join('\n')}
  float grey = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(grey), c, clamp(max(keep, uFilmKeep), 0.0, 1.0));
}

// Grain that is strongest in the dark and never weaker than \`least\`.
vec3 filmGrain(vec3 c, float least) {
  vec3 p = fract(vec3(floor(gl_FragCoord.xy / uFilmSpeck), uFilmFrame).xyz * 0.1031);
  p += dot(p, p.yzx + 33.33);
  float speck = fract((p.x + p.y) * p.z) - 0.5;
  float dark = 1.0 - smoothstep(0.03, 0.4, dot(c, vec3(0.299, 0.587, 0.114)));
  return c + speck * uFilmGrain * max(least, ${SHADOW_GRAIN} * dark);
}
`

/*
  For the end of a fragment shader, once gl_FragColor is the colour that
  goes to the screen. A material with FILM_ITEM defined is an item's.
*/
export const FILM_GRADE = /* glsl */ `
gl_FragColor.rgb = filmColour(gl_FragColor.rgb);
#ifdef FILM_ITEM
  gl_FragColor.rgb = filmGrain(gl_FragColor.rgb, ${ITEM_GRAIN});
#else
  gl_FragColor.rgb = filmGrain(gl_FragColor.rgb, 0.0);
#endif
`
