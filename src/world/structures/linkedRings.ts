import * as THREE from 'three'
import type { Structure } from '../World'
import { glow, palette } from '../materials'

/* Where the rings are in the plaza, and how high. */
const X = 8
const Z = -6.5
const PLINTH = 0.9
const MIDDLE = 1.75
/* The size of each ring, in metres. */
const RING = 0.36
const TUBE = 0.045
/* Where the middle of the ring that moves is, linked and apart, along the plinth. */
const LINKED = 0.2
const APART = 1
/* Seconds of holding the handle that take the ring from linked to apart. */
const SECONDS = 4.5

/* Smooth from 0 to 1 as `t` goes from `from` to `to`. */
function ease(t: number, from: number, to: number) {
  const x = Math.max(0, Math.min(1, (t - from) / (to - from)))
  return x * x * (3 - 2 * x)
}

/*
  Where the moving ring is at share `t` of the way from linked to apart:
  how far along the plinth, and how far off along the fourth axis, out of 1.
  It leaves along the fourth axis first, crosses while it is away, and only
  then comes back, so it is never in the same place as the other ring.
*/
export function passage(t: number): { along: number; fourth: number } {
  return {
    along: LINKED + (APART - LINKED) * ease(t, 0.3, 0.7),
    fourth: ease(t, 0, 0.3) * (1 - ease(t, 0.7, 1)),
  }
}

/*
  Two linked rings, and a handle that takes them apart without a cut.
  Holding it moves one ring away along the fourth axis, where it is drawn
  faint and a little smaller, as the far side of the hypercube is. From
  there it slides straight across the other ring, which is not in its way
  because it is not in the same place, and comes back unlinked. Holding it
  again takes it back the same way.
*/
export function linkedRings(onPart: () => void): Structure {
  return {
    name: 'linked rings',
    build(world) {
      world.addBox({
        size: [1.6, PLINTH, 0.8],
        position: [X + 0.3, PLINTH / 2, Z],
        overgrown: true,
      })

      const shape = new THREE.TorusGeometry(RING, TUBE, 12, 48)
      const still = new THREE.Mesh(shape, glow(palette.purple, 1.4))
      still.position.set(X - LINKED, MIDDLE, Z)
      const material = glow(palette.cyan, 1.4)
      material.transparent = true
      const glowing = material.emissiveIntensity
      // The second ring lies flat, through the first.
      const moving = new THREE.Mesh(shape.clone().rotateX(Math.PI / 2), material)
      world.add(still)
      world.add(moving)

      let t = 0
      let direction = 1
      let held = false
      let parted = false
      const place = () => {
        const { along, fourth } = passage(t)
        moving.position.set(X + along, MIDDLE, Z)
        moving.scale.setScalar(1 - 0.12 * fourth)
        material.opacity = 1 - 0.65 * fourth
        material.emissiveIntensity = glowing * (1 - 0.6 * fourth)
      }
      place()

      world.addHandle(
        [X - 1.6, -1, Z - 2.2],
        [X + 2.2, 4, Z + 2.2],
        'move a ring along the fourth axis',
        (dt) => {
          held = true
          t = Math.max(0, Math.min(1, t + (direction * dt) / SECONDS))
          place()
          if (t === 1 && !parted) {
            parted = true
            onPart()
          }
        },
      )
      // Letting go at either end turns it round for the next time.
      world.onUpdate(() => {
        if (!held && t === 1) direction = -1
        if (!held && t === 0) direction = 1
        held = false
      })
    },
  }
}
