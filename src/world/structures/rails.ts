import * as THREE from 'three'
import type { Structure } from '../World'
import { glow, matte } from '../materials'
import { addBeacon } from '../puzzle'
import { apart, bearing, onMap, Strips, walk } from '../sphere'

const STEEL = 0xcfd8e6
const TIMBER = 0x8a7258
/* The bearing on the map that the rails set off on. It goes out between the pillars. */
export const BEARING = 135
/* Metres between the rails where they are furthest apart. */
export const GAUGE = 2
/* How far from the start the rails begin, so that they do not run through it. */
const BEGIN = 6
/* Metres of rail between one point worked out and the next. */
const STEP = 0.5
/* Metres between sleepers. */
const SLEEPER = 1.2

/*
  A railway with no bends in it. The two rails begin side by side, the same
  distance apart at both ends of the first sleeper and pointing the same
  way: parallel, by any test that can be made on the spot. Neither rail
  turns. A quarter of the way round the planet they cross, and on the far
  side of it they cross again.

  It is found by following the rails to where they meet.
*/
export function rails(onMeet: () => void): Structure {
  return {
    name: 'rails',
    build(world) {
      if (!world.planetSize) throw new Error('The rails need a planet to run round')
      const size = world.planetSize
      const radius = size / (2 * Math.PI)
      const pole = new THREE.Vector3(0, 1, 0)
      const ahead = bearing(BEARING)
      const across = bearing(BEARING - 90)
      // Each rail leaves from half the gauge to one side of the start, heading the same way.
      const starts = [-1, 1].map((side) => walk(pole, across, (side * GAUGE) / 2, radius))
      // They end a little past where they cross the second time.
      const end = size * 0.75 + 4
      const along = (rail: number, metres: number) => walk(starts[rail], ahead, metres, radius)

      const steel = new Strips(radius)
      const timber = new Strips(radius)
      for (const rail of [0, 1]) {
        const path = []
        for (let metres = BEGIN; metres <= end; metres += STEP) path.push(along(rail, metres))
        steel.add(path, 0.09, 0.08)
      }
      for (let metres = BEGIN + 0.6; metres <= end; metres += SLEEPER) {
        const left = along(0, metres)
        const right = along(1, metres)
        // Where the rails have all but met there is no room for a sleeper.
        if (apart(left, right, radius) < 0.3) continue
        // A sleeper sticks out a little beyond each rail.
        const over = left.clone().sub(right).multiplyScalar(0.15)
        timber.add(
          [left.clone().add(over).normalize(), right.clone().sub(over).normalize()],
          0.22,
          0.04,
        )
      }
      // The buffer the rails begin at: a board across them.
      const buffer = [along(0, BEGIN), along(1, BEGIN)]
      timber.add(buffer, 0.3, 0.55)
      world.add(steel.mesh(glow(STEEL, 1.2)))
      // The sleepers lie flat and catch no light, so they are given a little of their own.
      world.add(timber.mesh(glow(TIMBER, 0.5)))
      for (const post of buffer) {
        const { x, z } = onMap(post, radius)
        world.addBox({ size: [0.2, 0.6, 0.2], position: [x, 0.3, z], material: matte(TIMBER) })
      }

      // A post where they cross, each time. Following the rails to the first is the discovery.
      const crossings = [ahead, ahead.clone().negate()].map((place) => onMap(place, radius))
      const posts = crossings.map(({ x, z }) => addBeacon(world, [x, 0, z], [STEEL], 2, false))
      let met = false
      crossings.forEach(({ x, z }, i) => {
        world.addTrigger([x - 3, -1, z - 3], [x + 3, 4, z + 3], () => {
          posts[i](true)
          if (met) return
          met = true
          onMeet()
        })
      })
    },
  }
}
