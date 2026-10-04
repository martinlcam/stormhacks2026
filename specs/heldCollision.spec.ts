import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { PlayerController } from '../src/engine/PlayerController'
import { ItemSystem } from '../src/game/items'
import { World } from '../src/world/World'
import { quietBrowser } from './support'

describe('Feature: held gems stay on the reachable side of solid geometry', () => {
  for (const gap of [0.3, 0.4, 0.7]) {
    it(`keeps the whole gem outside a wall ${gap} m from the player`, () => {
      const player = new PlayerController(quietBrowser())
      player.position.set(600, 0, 0)
      const world = new World()
      const wall = world.addCollider([595, 0, -gap - 0.02], [605, 3, -gap])
      const item = world.addItem({
        position: [600, 1.3, 0],
        material: new THREE.MeshBasicMaterial(),
      })
      const items = new ItemSystem(
        { world, player },
        { prompt() {}, charge() {}, thrownThrough() {} },
        item,
      )

      try {
        items.update(1 / 60)
        const closest = wall.clampPoint(item.body.position, new THREE.Vector3())
        expect(item.body.position.distanceTo(closest)).toBeGreaterThanOrEqual(
          item.body.radius - 1e-6,
        )
        items.use()
        items.update(1 / 60)
        expect(item.body.position.z).toBeGreaterThanOrEqual(wall.max.z + item.body.radius - 1e-6)
      } finally {
        items.dispose()
        player.dispose()
      }
    })
  }

  for (const beyond of [false, true]) {
    it(`stops at a wall ${beyond ? 'beyond' : 'before'} a portal`, () => {
      const player = new PlayerController(quietBrowser())
      player.position.set(600, 0, 0)
      const world = new World()
      const material = new THREE.MeshBasicMaterial()
      const entrance = world.addDoor({
        name: 'near',
        position: [600, 0, -0.5],
        facing: 0,
        frameMaterial: material,
      })
      const exit = world.addDoor({
        name: 'far',
        position: [700, 0, 0],
        facing: 0,
        frameMaterial: material,
      })
      world.link(entrance, exit)
      const wall = beyond
        ? world.addCollider([695, 0, 0.25], [705, 3, 0.27])
        : world.addCollider([595, 0, -0.4], [605, 3, -0.38])
      world.finalize()
      const item = world.addItem({ position: [600, 1.3, 0], material })
      const items = new ItemSystem(
        { world, player },
        { prompt() {}, charge() {}, thrownThrough() {} },
        item,
      )

      try {
        items.update(1 / 60)
        expect(Math.abs(item.mesh.position.x - (beyond ? 700 : 600))).toBeLessThan(0.6)
        const closest = wall.clampPoint(item.mesh.position, new THREE.Vector3())
        expect(item.mesh.position.distanceTo(closest)).toBeGreaterThanOrEqual(
          item.body.radius - 1e-6,
        )
        items.use()
        items.update(1 / 60)
        expect(beyond ? item.body.position.z : -item.body.position.z).toBeLessThanOrEqual(
          beyond ? 0.07 + 1e-6 : 0.2 + 1e-6,
        )
      } finally {
        items.dispose()
        player.dispose()
      }
    })
  }
})

it('keeps a gem on this side of a thin wall when the player kicks it against the wall', () => {
  const player = new PlayerController(quietBrowser())
  player.position.set(599.5, 0, 0)
  player.velocity.set(4.5, 0, 0)
  const world = new World()
  const wall = world.addCollider([600, 0, -2], [600.02, 3, 2])
  const item = world.addItem({
    position: [599.82, 0.18, 0],
    material: new THREE.MeshBasicMaterial(),
  })
  item.body.resting = true
  const items = new ItemSystem({ world, player }, { prompt() {}, charge() {}, thrownThrough() {} })

  try {
    for (let i = 0; i < 5; i++) {
      items.update(1 / 60)
      expect(item.body.position.x).toBeLessThanOrEqual(wall.min.x - item.body.radius + 1e-6)
      expect(item.mesh.position.distanceTo(item.body.position)).toBeLessThan(1e-6)
    }
  } finally {
    items.dispose()
    player.dispose()
  }
})
