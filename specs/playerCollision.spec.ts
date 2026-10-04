import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { frameFor, inverseFrameFor } from '../src/engine/gravity'
import { PlayerController } from '../src/engine/PlayerController'
import { FRAME, quietBrowser } from './support'

describe('Feature: a ceiling stops a jump without pushing the player sideways', () => {
  for (const axis of ['y+', 'y-', 'x+', 'x-', 'z+', 'z-'] as const) {
    for (const scale of [1, 0.25, 1 / 16]) {
      it(`Given up is ${axis} at scale ${scale}, when I hit my head, then I stop rising and land back on the platform`, () => {
        const player = new PlayerController(quietBrowser())
        const frame = frameFor(axis)
        // Keep the fixture in a detached room, clear of the curved planet.
        const origin = new THREE.Vector3(600, 0, 0)
        const boxes = [
          new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 0.95, 5)),
          new THREE.Box3(new THREE.Vector3(-5, 3.2, -5), new THREE.Vector3(5, 3.5, 5)),
        ].map((box) => {
          box.min.multiplyScalar(scale)
          box.max.multiplyScalar(scale)
          return box.applyMatrix4(frame).translate(origin)
        })
        player.axis = axis
        player.scale = scale
        player.position.set(0, 0.95, 0).multiplyScalar(scale).applyMatrix4(frame).add(origin)
        player.velocity.set(3, 5.2, 0).multiplyScalar(scale).applyMatrix4(frame)
        let bumped = false

        try {
          for (let time = 0; time < 1; time += FRAME) {
            const before = player.position.clone()
            player.update(FRAME, boxes, [])
            const local = player.position.clone().sub(origin).applyMatrix4(inverseFrameFor(axis))

            expect(player.position.distanceTo(before)).toBeLessThan(0.12 * scale)
            expect(local.y + 1.8 * scale).toBeLessThanOrEqual(3.2 * scale + 1e-6)

            if (Math.abs(local.y - 1.4 * scale) < 1e-6) {
              bumped = true
              expect(player.velocity.dot(player.up)).toBeCloseTo(0, 8)
              expect(player.onGround).toBe(false)
              expect(local.x).toBeGreaterThan(0.1 * scale)
            }
          }

          expect(bumped).toBe(true)
          expect(player.onGround).toBe(true)
          expect(player.position.clone().sub(origin).dot(player.up)).toBeCloseTo(0.95 * scale, 6)
        } finally {
          player.dispose()
        }
      })
    }
  }
})

describe('Feature: stepping up requires space for the whole body', () => {
  it('Given a low ceiling over a step, when I walk at it, then I stay below the ceiling instead of stepping into it', () => {
    const player = new PlayerController(quietBrowser())
    const boxes = [
      new THREE.Box3(new THREE.Vector3(595, -1, -5), new THREE.Vector3(605, 0, 5)),
      new THREE.Box3(new THREE.Vector3(601, 0, -1), new THREE.Vector3(604, 0.3, 1)),
      new THREE.Box3(new THREE.Vector3(600, 2, -2), new THREE.Vector3(605, 2.2, 2)),
    ]
    player.position.set(600.6, 0, 0)
    player.onGround = true

    try {
      for (let i = 0; i < 30; i++) {
        player.velocity.x = 4.5
        player.update(FRAME, boxes, [])

        expect(player.position.x).toBeLessThanOrEqual(600.7 + 1e-6)
        expect(player.position.y).toBeCloseTo(0, 6)
      }
    } finally {
      player.dispose()
    }
  })
})

describe('Feature: moving solids follow the current gravity frame', () => {
  it('Given I stand on a wall, when a barrier moves without replacing its collider, then it blocks me at its new position', () => {
    const player = new PlayerController(quietBrowser())
    player.axis = 'x-'
    const frame = frameFor(player.axis)
    const origin = new THREE.Vector3(600, 0, 0)
    const barrier = new THREE.Box3(new THREE.Vector3(2, 0, -1), new THREE.Vector3(2.1, 3, 1))
      .applyMatrix4(frame)
      .translate(origin)
    const boxes = [barrier]
    player.position.copy(origin)

    try {
      player.update(FRAME, boxes, [])
      barrier.translate(new THREE.Vector3(-1, 0, 0).applyMatrix4(frame))
      player.position.copy(origin)

      for (let i = 0; i < 20; i++) {
        player.velocity.set(4.5, 0, 0).applyMatrix4(frame)
        player.update(FRAME, boxes, [])
        const local = player.position.clone().sub(origin).applyMatrix4(inverseFrameFor(player.axis))

        expect(local.x).toBeLessThanOrEqual(0.7 + 1e-6)
      }
    } finally {
      player.dispose()
    }
  })
})
