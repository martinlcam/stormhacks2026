export interface Discovery {
  id: string
  title: string
  /* What the player just experienced, in plain words. */
  body: string
  /* The mathematics behind it, one or two sentences. */
  maths: string
}

/* Every discovery in the sandbox. Structures unlock these by id. */
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
  'thrown-through': {
    id: 'thrown-through',
    title: 'What goes in comes out',
    body: 'The gem went in one door and came out of the other, still travelling the same way.',
    maths:
      'A doorway is a single rigid motion, and it is applied to where a thing is and to how it is moving alike. Seen from the door, nothing about the throw changed.',
  },
  'walls-are-floors': {
    id: 'walls-are-floors',
    title: 'Down is where you are standing',
    body: 'You walked through a door on the floor and came out standing on the wall.',
    maths:
      'The room did not move. The door applies a rotation as well as a shift, and it rotated you, your sense of down included. Every surface of a cube is a floor to someone turned the right way.',
  },
  'on-the-ceiling': {
    id: 'on-the-ceiling',
    title: 'Two quarter turns make a half turn',
    body: 'A second door took you from the wall to the ceiling. The floor you started on is now overhead.',
    maths:
      'Rotations compose: a quarter turn followed by a quarter turn about the same axis is a half turn. The doors are the generators and the places you can stand are the results.',
  },
  hypercube: {
    id: 'hypercube',
    title: 'The shadow of a hypercube',
    body: 'The sculpture is a cube inside a cube, and it keeps turning itself inside out.',
    maths:
      'It is a cube with four axes, and you are looking at its shadow in three. Nothing in it bends: it is only turning, in a plane that includes the fourth axis. Parts that are further away along that axis are drawn smaller, as far things are in a picture.',
  },
} satisfies Record<string, Discovery>

export type DiscoveryId = keyof typeof discoveries
