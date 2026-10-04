/*
  Switches for what we are still choosing between. Each has a default (its
  first option) and can be changed in the address, for example
  `?splash=scroll&draw=speedraw`, or from the panel that `?flags` opens.
  Once we choose, delete the other option's code and its entry here.
*/
export const FLAGS = {
  draw: {
    options: ['speedpaint', 'fade', 'speedraw'],
    about:
      "How each drawing comes in: the artist's watercolour timelapse played with the scroll, a fade, or its pencil lines drawn first",
  },
  glow: {
    options: ['on', 'off'],
    about: 'The light in the drawings glows on a layer of its own',
  },
  grain: {
    options: ['on', 'off'],
    about: 'The grain texture from the Figma file over the landing page',
  },
  water: {
    options: ['texture', 'plain'],
    about: 'The blue water: painted from the blue texture in the Figma file, or plain',
  },
  sound: {
    options: ['on', 'off'],
    about: 'Wind, rain, a chime for the light and a drip for the splash',
  },
  sky: {
    options: ['subtle', 'grainy'],
    about: "The grain in the game's sky",
  },
} as const

export type FlagName = keyof typeof FLAGS

export type FlagValue<N extends FlagName> = (typeof FLAGS)[N]['options'][number]

/* The flag's value in the address, or its default when it is missing or not one of its options. */
export function readFlag<N extends FlagName>(
  name: N,
  search = typeof location === 'undefined' ? '' : location.search,
): FlagValue<N> {
  const options: readonly string[] = FLAGS[name].options
  const value = new URLSearchParams(search).get(name)
  return (value !== null && options.includes(value) ? value : options[0]) as FlagValue<N>
}
