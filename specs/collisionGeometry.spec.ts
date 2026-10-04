import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import * as THREE from 'three'
import { Body } from '../src/engine/Body'
import { axisOf } from '../src/engine/gravity'
import { configurePlanet, planetMotion } from '../src/engine/planet'
import { PlayerController } from '../src/engine/PlayerController'
import { lightingScenes } from '../src/game/lightingScenes'
import { buildLightingLab } from '../src/world/lightingLab'
import * as materials from '../src/world/materials'
import { biggerInside } from '../src/world/structures/biggerInside'
import { gravityRoom } from '../src/world/structures/gravityRoom'
import { hub } from '../src/world/structures/hub'
import { loopCorridor } from '../src/world/structures/loopCorridor'
import { resizingDoors } from '../src/world/structures/resizingDoors'
import { sculpture } from '../src/world/structures/sculpture'
import { stairwell } from '../src/world/structures/stairwell'
import { World } from '../src/world/World'
import { FRAME, quietBrowser } from './support'

const noop = () => {}
const puzzle = { hint: noop, solved: noop }

/* Use the authored geometry; only browser-only textures are replaced. */
function fixtures() {
  quietBrowser()
  const ground = spyOn(materials, 'rockyGround').mockReturnValue(new THREE.MeshStandardMaterial())
  const grid = spyOn(materials, 'gridTexture').mockReturnValue(new THREE.Texture())

  try {
    const structures = [
      hub,
      biggerInside(noop, puzzle, puzzle),
      loopCorridor(noop, puzzle),
      resizingDoors(noop, noop, puzzle),
      gravityRoom(noop, noop, puzzle),
      sculpture(noop),
      stairwell(noop, puzzle, puzzle),
    ]
    const worlds = structures.map((structure) => {
      const world = new World()
      world.build(structure)
      world.finalize()
      return { name: structure.name, world }
    })

    for (const scene of lightingScenes) {
      const world = new World()
      buildLightingLab(world, scene)
      world.finalize()
      worlds.push({ name: scene.id, world })
    }

    return worlds
  } finally {
    ground.mockRestore()
    grid.mockRestore()
  }
}

afterEach(() => configurePlanet(null))

/* Probe the real dimensions in isolation, off the curved map and clear of other solids. */
function isolated(box: THREE.Box3) {
  const centre = box.getCenter(new THREE.Vector3())
  return box.clone().translate(new THREE.Vector3(600, 0, 0).sub(centre))
}

function overlaps(feet: THREE.Vector3, box: THREE.Box3, allowStep = false) {
  if (box.max.y <= feet.y + (allowStep ? 0.4 : 1e-6) || box.min.y >= feet.y + 1.8 - 1e-6)
    return false
  const dx = feet.x - Math.max(box.min.x, Math.min(feet.x, box.max.x))
  const dz = feet.z - Math.max(box.min.z, Math.min(feet.z, box.max.z))
  return dx * dx + dz * dz < (0.3 - 1e-6) ** 2
}

for (const { name, world } of fixtures()) {
  describe(`Collision geometry: ${name} (${world.colliders.length} boxes)`, () => {
    it('has finite, positive bounds for every solid', () => {
      for (const box of world.colliders) {
        for (let axis = 0; axis < 3; axis++) {
          expect(Number.isFinite(box.min.getComponent(axis))).toBe(true)
          expect(Number.isFinite(box.max.getComponent(axis))).toBe(true)
          expect(box.max.getComponent(axis)).toBeGreaterThan(box.min.getComponent(axis))
        }
      }
    })

    it('stops a player approaching every face, at three sizes and two frame rates', () => {
      configurePlanet(null)
      const player = new PlayerController(quietBrowser())

      try {
        for (const authored of world.colliders) {
          const box = isolated(authored)

          for (const scale of [1, 0.25, 1 / 16]) {
            for (const dt of [FRAME, 0.05]) {
              for (let axis = 0; axis < 3; axis++) {
                for (const sign of [-1, 1]) {
                  const face = (sign > 0 ? box.max : box.min).getComponent(axis)
                  const radius = 0.3 * scale
                  const height = 1.8 * scale
                  player.respawn()
                  player.scale = scale
                  player.onGround = false
                  box.getCenter(player.position)
                  player.position.y -= height / 2
                  player.position.setComponent(
                    axis,
                    face + sign * (0.02 * scale + (axis === 1 ? (sign < 0 ? height : 0) : radius)),
                  )
                  player.velocity.setComponent(axis, -sign * (axis === 1 ? 20 : 8) * scale)
                  player.update(dt, [box], [])

                  const extent = axis === 1 ? (sign < 0 ? height : 0) : radius
                  expect(
                    sign * (player.position.getComponent(axis) - face) - extent,
                  ).toBeGreaterThanOrEqual(-1e-6)
                }
              }
            }
          }
        }
      } finally {
        player.dispose()
      }
    })

    it('stops a fast gem approaching every face, at three sizes and two frame rates', () => {
      configurePlanet(null)

      for (const authored of world.colliders) {
        const box = isolated(authored)

        for (const scale of [1, 0.25, 1 / 16]) {
          for (const dt of [FRAME, 0.05]) {
            for (let axis = 0; axis < 3; axis++) {
              for (const sign of [-1, 1]) {
                const face = (sign > 0 ? box.max : box.min).getComponent(axis)
                const body = new Body(0.18)
                body.scale = scale
                box.getCenter(body.position)
                body.position.setComponent(axis, face + sign * (body.radius + 0.02 * scale))
                body.velocity.setComponent(axis, -sign * 30 * scale)
                body.step(dt, [box], [])

                expect(sign * (body.position.getComponent(axis) - face)).toBeGreaterThanOrEqual(
                  -1e-6,
                )
                const closest = box.clampPoint(body.position, new THREE.Vector3())
                expect(body.position.distanceTo(closest)).toBeGreaterThanOrEqual(body.radius - 1e-6)
              }
            }
          }
        }
      }
    })

    it('keeps jumps from exposed tops clear of the assembled solids, with doorways closed', () => {
      configurePlanet(world.planetSize)
      const player = new PlayerController(quietBrowser())
      let checked = 0

      try {
        for (const [index, box] of world.colliders.entries()) {
          // An open puzzle barrier is parked far above or below the playable space.
          if (box.max.y < -30 || box.max.y > 40) continue

          for (const [x, z] of [
            [0.5, 0.5],
            [0.25, 0.25],
            [0.25, 0.75],
            [0.75, 0.25],
            [0.75, 0.75],
          ]) {
            const start = new THREE.Vector3(
              THREE.MathUtils.lerp(box.min.x, box.max.x, x),
              box.max.y,
              THREE.MathUtils.lerp(box.min.z, box.max.z, z),
            )
            if (world.colliders.some((other) => overlaps(start, other))) continue

            for (const [vx, vz] of [
              [8, 0],
              [-8, 0],
              [0, 8],
              [0, -8],
            ]) {
              player.respawn()
              player.position.copy(start)
              player.velocity.set(vx, 5.2, vz)
              player.onGround = false
              checked++

              for (let frame = 0; frame < 10; frame++) {
                const before = player.position.clone()
                player.update(0.05, world.colliders, [])
                const stuck = world.colliders.findIndex((other) =>
                  overlaps(player.position, other, true),
                )
                const motion = new THREE.Matrix4()
                const oldPoint = before.clone().applyMatrix4(planetMotion(before, motion))
                const newPoint = player.position
                  .clone()
                  .applyMatrix4(planetMotion(player.position, motion))
                if (stuck >= 0 || newPoint.distanceTo(oldPoint) > 1.2) {
                  throw new Error(
                    JSON.stringify({
                      structure: name,
                      startBox: index,
                      start: start.toArray(),
                      vx,
                      vz,
                      frame,
                      before: before.toArray(),
                      after: player.position.toArray(),
                      overlapBox: stuck,
                    }),
                  )
                }
              }
            }
          }
        }

        expect(checked).toBeGreaterThan(0)
      } finally {
        player.dispose()
      }
    })

    for (const portal of world.portals.filter((entry) => !entry.seamless)) {
      it(`lets a fitting player and gem pass through ${portal.name}`, () => {
        configurePlanet(name.startsWith('lighting-') ? world.planetSize : 140)
        const player = new PlayerController(quietBrowser())
        player.axis = axisOf(portal.up)
        player.scale = portal.scale
        player.position.set(0, 0, 0.5).applyMatrix4(portal.mesh.matrixWorld)
        const direction = new THREE.Vector3(0, 0, -1).transformDirection(portal.mesh.matrixWorld)

        try {
          for (let i = 0; i < 30 && player.doors === 0; i++) {
            player.velocity.copy(direction).multiplyScalar(8 * portal.scale)
            player.update(FRAME, world.colliders, world.portals)
          }

          expect(player.doors).toBe(1)
          expect(player.scale).toBeCloseTo(portal.target.scale, 6)
        } finally {
          player.dispose()
        }

        const body = new Body(0.18)
        body.scale = portal.scale
        body.up.copy(portal.up)
        body.position.set(0, 1, 0.5).applyMatrix4(portal.mesh.matrixWorld)
        body.velocity.copy(direction).multiplyScalar(26 * portal.scale)
        let crossed = false
        body.onTraverse = () => {
          crossed = true
        }

        for (let i = 0; i < 30; i++) {
          body.step(FRAME, world.colliders, world.portals)
          if (crossed) break
        }

        expect(crossed).toBe(true)
        expect(body.scale).toBeCloseTo(portal.target.scale, 6)
      })
    }
  })
}
