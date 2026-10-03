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
} satisfies Record<string, Discovery>

export type DiscoveryId = keyof typeof discoveries
