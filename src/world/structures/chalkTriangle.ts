import * as THREE from 'three'
import type { Structure } from '../World'
import { glow } from '../materials'
import { addBeacon, shine } from '../puzzle'
import { bearing, onMap, straight, Strips } from '../sphere'

const CHALK = 0xf2efe6
/*
  Which way the first two sides leave the start, as bearings on the map.
  They are a right angle apart, and both go out between the pillars.
*/
export const BEARINGS = [15, 105] as const
/* How long the arms of the mark in each corner are, in metres. */
const SQUARE = 0.8

/*
  A triangle drawn on the ground in chalk, a quarter of the way round the
  planet on every side. Its sides are straight and each of its corners is a
  right angle, which makes 270° where flat ground allows 180°.

  It is found by walking it: out along one side, along the far side, and
  back down the third to the start.
*/
export function chalkTriangle(onClose: () => void): Structure {
  return {
    name: 'chalk triangle',
    build(world) {
      if (!world.planetSize) throw new Error('The chalk triangle needs a planet to be drawn on')
      const radius = world.planetSize / (2 * Math.PI)
      const corners = [new THREE.Vector3(0, 1, 0), bearing(BEARINGS[0]), bearing(BEARINGS[1])]

      const chalk = new Strips(radius)
      corners.forEach((corner, i) => {
        const next = corners[(i + 1) % 3]
        const last = corners[(i + 2) % 3]
        chalk.add(straight(corner, next, 96), 0.14, 0.03)
        // The mark of a right angle: a small square in the corner. At a
        // corner the two sides leave towards the other two corners.
        const arm = SQUARE / radius
        const square = [
          corner.clone().addScaledVector(next, arm),
          corner.clone().addScaledVector(next, arm).addScaledVector(last, arm),
          corner.clone().addScaledVector(last, arm),
        ].map((place) => place.normalize())
        chalk.add(square, 0.06, 0.03)
      })
      const lines = chalk.mesh(glow(CHALK, 1.3))
      world.add(lines)

      // A post at each corner, lit once the walker has been there. The one at the
      // start is lit last, when they are back.
      const places = corners.map((corner) => onMap(corner, radius))
      const posts = places.map(({ x, z }) => addBeacon(world, [x, 0, z], [CHALK], 1.2, false))

      // The far side has no post in the middle, so it is watched there too:
      // whoever comes back by the way they went has not walked a triangle.
      const middle = onMap(corners[1].clone().add(corners[2]).normalize(), radius)
      const walked = { out: false, across: false, back: false }
      let closed = false
      const at = ({ x, z }: THREE.Vector3, onEnter: () => void) => {
        world.addTrigger([x - 2.5, -1, z - 2.5], [x + 2.5, 4, z + 2.5], onEnter)
      }
      at(places[1], () => {
        walked.out = true
        posts[1](true)
      })
      at(middle, () => {
        walked.across = true
      })
      at(places[2], () => {
        walked.back = true
        posts[2](true)
      })
      at(places[0], () => {
        if (closed || !walked.out || !walked.across || !walked.back) return
        closed = true
        posts[0](true)
        shine(lines, 2.4)
        onClose()
      })
    },
  }
}
