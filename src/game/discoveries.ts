export interface Discovery {
  id: string
  title: string
  /** What the player just experienced, in plain words. */
  body: string
  /** The mathematics behind it, one or two sentences. */
  maths: string
}

/** Every discovery in the sandbox. Structures unlock these by id. */
export const discoveries = {
  'bigger-inside': {
    id: 'bigger-inside',
    title: 'Bigger on the inside',
    body: 'The booth is two metres wide. The hall inside it is fourteen.',
    maths:
      'Both rooms are perfectly ordinary. Only the way they are glued together is strange: the doorway identifies two patches of space that are nowhere near each other.',
  },
  'loop-corridor': {
    id: 'loop-corridor',
    title: 'A corridor with no ends',
    body: 'You walked in a straight line and arrived where you started.',
    maths:
      'Gluing the two ends of a strip together makes a cylinder. Space here is flat but finite in one direction, so every straight path along it is a closed loop.',
  },
  'resizing-door': {
    id: 'resizing-door',
    title: 'A door that changes your size',
    body: 'You walked through a tall door and came out of a small one, a quarter of the height you were.',
    maths:
      'Nothing about you changed: every angle and proportion is the same. Flat space is the only geometry where this is possible. On a sphere or in hyperbolic space a shape cannot be resized without bending it, so size there is absolute.',
  },
  'small-world': {
    id: 'small-world',
    title: 'Small enough to fit',
    body: 'The vault has no door, only a gap you could not have used at full size.',
    maths:
      'Being scaled by a quarter is indistinguishable from the world being scaled by four. Lengths only ever mean something relative to a ruler, and here the ruler is you.',
  },
} satisfies Record<string, Discovery>

export type DiscoveryId = keyof typeof discoveries
