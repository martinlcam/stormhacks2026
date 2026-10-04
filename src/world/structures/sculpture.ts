import * as THREE from 'three'
import type { Structure } from '../World'
import { glow, matte, palette } from '../materials'

/* Where the sculpture stands in the plaza, and how high its middle is. */
const X = 5
const Z = -3
const PLINTH = 0.9
const MIDDLE = 2.5
/* Half the edge of the hypercube, in metres, before it is projected. */
const SIZE = 0.42
/* How far the eye of the projection is from the middle, along the fourth axis. */
const EYE = 3

/* The 16 corners of a hypercube: every choice of -1 or 1 on four axes. */
const corners = Array.from({ length: 16 }, (_, i) => [
  i & 1 ? 1 : -1,
  i & 2 ? 1 : -1,
  i & 4 ? 1 : -1,
  i & 8 ? 1 : -1,
])

/* The 32 edges: pairs of corners that differ on one axis. `fourth` marks the ones along w. */
const edges: { a: number; b: number; fourth: boolean }[] = []
for (let a = 0; a < 16; a++) {
  for (let bit = 0; bit < 4; bit++) {
    const b = a | (1 << bit)
    if (b !== a) edges.push({ a, b, fourth: bit === 3 })
  }
}

const UP = new THREE.Vector3(0, 1, 0)
const along = new THREE.Vector3()

/*
  A hypercube, turning. It has four axes and the plaza has three, so what
  stands on the plinth is its shadow: each corner is drawn nearer to the
  middle the further away it is along the fourth axis, as far things look
  small. The hypercube turns in planes that include the fourth axis, which
  carries the near cube out through the far one. Nothing in it bends or
  stretches; only the shadow does.
*/
export function sculpture(onFind: () => void): Structure {
  return {
    name: 'sculpture',
    build(world) {
      world.addBox({
        size: [1.2, PLINTH, 1.2],
        position: [X, PLINTH / 2, Z],
        material: matte(palette.stone),
      })

      const group = new THREE.Group()
      group.position.set(X, MIDDLE, Z)
      const rod = new THREE.CylinderGeometry(0.016, 0.016, 1, 8)
      const ball = new THREE.SphereGeometry(0.05, 12, 8)
      const within = glow(palette.cyan, 1.4)
      // The edges that run along the fourth axis join the two cubes.
      const between = glow(palette.purple, 1.4)
      const joint = glow(palette.bone, 1)
      const rods = edges.map(({ fourth }) => new THREE.Mesh(rod, fourth ? between : within))
      const balls = corners.map(() => new THREE.Mesh(ball, joint))
      for (const mesh of [...rods, ...balls]) {
        // The stored bounds are not where a mesh on the planet is drawn.
        mesh.frustumCulled = false
        group.add(mesh)
      }
      world.scene.add(group)

      const shadow = corners.map(() => new THREE.Vector3())
      const nearness = corners.map(() => 1)
      world.onUpdate((_dt, time) => {
        const a = time * 0.45
        const b = time * 0.3
        corners.forEach(([x, y, z, w], i) => {
          // Turn in the x-w plane, then in the y-z plane.
          const xt = x * Math.cos(a) - w * Math.sin(a)
          const wt = x * Math.sin(a) + w * Math.cos(a)
          const yt = y * Math.cos(b) - z * Math.sin(b)
          const zt = y * Math.sin(b) + z * Math.cos(b)
          nearness[i] = EYE / (EYE - wt)
          shadow[i].set(xt, yt, zt).multiplyScalar(SIZE * nearness[i])
          balls[i].position.copy(shadow[i])
          balls[i].scale.setScalar(nearness[i])
        })
        edges.forEach(({ a: from, b: to }, i) => {
          const mesh = rods[i]
          along.subVectors(shadow[to], shadow[from])
          const length = along.length()
          mesh.position.copy(shadow[from]).addScaledVector(along, 0.5)
          mesh.quaternion.setFromUnitVectors(UP, along.divideScalar(length))
          // Nearer along the fourth axis is drawn thicker.
          const thick = (nearness[from] + nearness[to]) / 2
          mesh.scale.set(thick, length, thick)
        })
      })

      world.addTrigger([X - 2.5, -1, Z - 2.5], [X + 2.5, 4, Z + 2.5], onFind)
    },
  }
}
