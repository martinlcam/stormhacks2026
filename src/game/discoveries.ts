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
    body: 'The booth is two metres wide. The classroom inside it is nine, with sixteen desks and a row of windows.',
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
  'endless-stairwell': {
    id: 'endless-stairwell',
    title: 'Stairs that only go up',
    body: 'You climbed a full turn of the stairs, every step higher than the last, and came back to the door you started from.',
    maths:
      'The top of the tower is joined to its bottom, so up is a circle here, as east is on a globe. Penrose drew such stairs by cheating with perspective. Here no step cheats: it is the space that closes up, not the staircase.',
  },
  hypercube: {
    id: 'hypercube',
    title: 'The shadow of a hypercube',
    body: 'The sculpture is a cube inside a cube, and it keeps turning itself inside out.',
    maths:
      'It is a cube with four axes, and you are looking at its shadow in three. Nothing in it bends: it is only turning, in a plane that includes the fourth axis. Parts that are further away along that axis are drawn smaller, as far things are in a picture.',
  },
  'long-way-round': {
    id: 'long-way-round',
    title: 'The long way round is short',
    body: 'The wall of light had no gap, so you left the classroom, walked round the booth and came in by the blackboard.',
    maths:
      'How far apart two places are depends on the path. Through the classroom the two doors are eleven metres apart; round the booth they are three. Both doors are glued to the same small box.',
  },
  'seating-plan': {
    id: 'seating-plan',
    title: 'A seating plan',
    body: 'Four gems at four desks, one in every row and one in every column.',
    maths:
      'Choosing a desk in each row so that every column is used once is a permutation of the columns. The first row has four desks to choose from, the next three, then two, then one: 4 × 3 × 2 × 1 = 24 plans, and any of them would have done.',
  },
  'further-down': {
    id: 'further-down',
    title: 'Further down than there is',
    body: 'You fell more than a hundred metres in a tower nine metres tall.',
    maths:
      'How far you have gone and how far you are from where you began are two measurements. On a line they agree for anyone who never turns back. On a circle they part after half a lap: the distance fallen keeps growing, and the distance from the door is never more than half a turn.',
  },
  'falling-faster': {
    id: 'falling-faster',
    title: 'A fall with no bottom',
    body: 'The gem fell past the same door again and again, faster each time, and then you shut the gong under it.',
    maths:
      'In an ordinary tower a dropped thing can only gain the speed of one fall, and to drop it again somebody has to carry it back up. Here height is a circle, so every turn down the well is another nine metres of falling for nothing. Gravity cannot be a slope on a loop: a slope that comes back to where it began would have to be level.',
  },
  'three-downs': {
    id: 'three-downs',
    title: 'Three downs in one room',
    body: 'Three gems lie on three plates: one on the floor, one on a wall and one on the ceiling.',
    maths:
      'A door is a rotation, and it turns everything that goes through it, the direction of falling included. A gem thrown at the wall still falls towards the floor. A gem carried through the door falls towards the wall, and stays.',
  },
  'floors-without-stairs': {
    id: 'floors-without-stairs',
    title: 'Floors without stairs',
    body: 'Two laps east for the gem, then three laps west to the socket: +2 − 3 = −1.',
    maths:
      'The corridor is a spiral staircase pressed flat. Every lap looks the same and is a different floor, and the floors are the whole numbers: east adds one, west takes one away. Walking round a door is staying on your floor.',
  },
  'powers-of-four': {
    id: 'powers-of-four',
    title: 'Powers of four',
    body: 'One gem as it was found, one a quarter of that, and one a sixteenth.',
    maths:
      'The tall door divides by four each time, so after n times through a thing is (1/4)ⁿ of its size: 1, 1/4, 1/16. The door does not care who is carrying what, which is why a thrown gem shrinks alone.',
  },
} satisfies Record<string, Discovery>

export type DiscoveryId = keyof typeof discoveries
