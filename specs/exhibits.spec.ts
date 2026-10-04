import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { bearing, onMap } from '../src/world/sphere'
import { BEARINGS, chalkTriangle } from '../src/world/structures/chalkTriangle'
import { diskTable, drawnAt, slide } from '../src/world/structures/diskTable'
import { linkedRings, passage } from '../src/world/structures/linkedRings'
import { BEARING, rails } from '../src/world/structures/rails'
import { sculpture } from '../src/world/structures/sculpture'
import { type Structure, World } from '../src/world/World'
import { FRAME } from './support'

const ROUND = 140
const RADIUS = ROUND / (2 * Math.PI)

/* A planet with one exhibit on it, and how many times it has been found. */
function planetWith(exhibit: (found: () => void) => Structure) {
  let found = 0
  const world = new World()
  world.planetSize = ROUND
  world.build(exhibit(() => found++))
  world.finalize()
  /* Stand at a place on the map. */
  const stand = (x: number, z: number) => world.checkTriggers(new THREE.Vector3(x, 0, z))
  /* Stand at a handle and hold F for a while. */
  const hold = (x: number, z: number, seconds: number) => {
    for (let i = 0; i < seconds / FRAME; i++) {
      world.update(FRAME, i * FRAME)
      world.handleAt(new THREE.Vector3(x, 0, z))?.hold(FRAME)
    }
  }
  const wait = (seconds: number) => {
    for (let i = 0; i < seconds / FRAME; i++) world.update(FRAME, i * FRAME)
  }
  return { world, stand, hold, wait, found: () => found }
}

/* The map point a quarter of the way round on this bearing. */
function corner(degrees: number) {
  return onMap(bearing(degrees), RADIUS)
}

describe('Feature: the chalk triangle is found by walking it', () => {
  const out = corner(BEARINGS[0])
  const back = corner(BEARINGS[1])
  const across = corner((BEARINGS[0] + BEARINGS[1]) / 2)

  it('Given I only stand at the start, then nothing is found', () => {
    const { stand, found } = planetWith(chalkTriangle)
    stand(0, 2)
    expect(found()).toBe(0)
  })

  it('Given I walk out along one side, along the far side and back down the third, then the triangle is found', () => {
    const { stand, found } = planetWith(chalkTriangle)
    stand(0, 2)
    stand(out.x, out.z)
    stand(across.x, across.z)
    stand(back.x, back.z)
    expect(found()).toBe(0)
    stand(0, 0)
    expect(found()).toBe(1)
  })

  it('Given I visit both far corners but come back to the start between them, then I have not walked a triangle', () => {
    const { stand, found } = planetWith(chalkTriangle)
    stand(out.x, out.z)
    stand(0, 0)
    stand(back.x, back.z)
    stand(0, 0)
    expect(found()).toBe(0)
  })
})

describe('Feature: the rails are found where they meet', () => {
  it('Given I stand where the rails begin, then nothing is found', () => {
    const { stand, found } = planetWith(rails)
    const begin = onMap(bearing(BEARING), RADIUS).multiplyScalar(6 / (ROUND / 4))
    stand(begin.x, begin.z)
    expect(found()).toBe(0)
  })

  it('Given I follow the rails a quarter of the way round, then I am where they cross, and it is found once', () => {
    const { stand, found } = planetWith(rails)
    const crossing = corner(BEARING)
    stand(crossing.x, crossing.z)
    stand(0, 0)
    stand(crossing.x, crossing.z)
    expect(found()).toBe(1)
  })
})

describe('Feature: the endless plane on a table top', () => {
  describe('Scenario: things on the table', () => {
    it('Given a bead ever further from the middle of the plane, then it is drawn ever nearer the rim and never on it', () => {
      expect(drawnAt(1)).toBeLessThan(drawnAt(3))
      expect(drawnAt(3)).toBeLessThan(drawnAt(12))
      expect(drawnAt(12)).toBeLessThan(1)
    })

    it('Given the plane is slid, then every point of the picture is still inside the rim', () => {
      const by = new THREE.Vector2(0.5, -0.5)
      for (let i = 0; i < 12; i++) {
        const point = new THREE.Vector2(Math.cos(i), Math.sin(i)).multiplyScalar(0.97)
        expect(slide(point, by).length()).toBeLessThan(1)
      }
    })

    it('Given the plane is slid one way and then back, then every point is where it was', () => {
      const by = new THREE.Vector2(0.3, 0.6)
      const point = new THREE.Vector2(-0.4, 0.2)
      const there = slide(point, by)
      const again = slide(there, by.clone().negate())
      expect(again.x).toBeCloseTo(point.x, 9)
      expect(again.y).toBeCloseTo(point.y, 9)
    })
  })

  it('Given I walk up to the table, then it is found', () => {
    const { stand, found } = planetWith(diskTable)
    stand(0, 2)
    expect(found()).toBe(0)
    stand(-5, 1.5)
    expect(found()).toBe(1)
  })
})

describe('Feature: turning the hypercube the fourth way', () => {
  const exhibit = (found: () => void) => sculpture(() => {}, found)

  it('Given I stand at the wheel without holding it, then nothing is found', () => {
    const { wait, found } = planetWith(exhibit)
    wait(2)
    expect(found()).toBe(0)
  })

  it('Given I hold the wheel, then the turn is found, once', () => {
    const { hold, found } = planetWith(exhibit)
    hold(6.7, -3, 2)
    expect(found()).toBe(1)
  })

  it('Given I am nowhere near the wheel, then there is no handle to hold', () => {
    const { world } = planetWith(exhibit)
    expect(world.handleAt(new THREE.Vector3(0, 0, 2))).toBeUndefined()
  })
})

describe('Feature: two linked rings come apart along the fourth axis', () => {
  describe('Scenario: the way the ring goes', () => {
    it('Given the ring where it starts and where it ends, then it is in the room with the other ring: not off along the fourth axis', () => {
      expect(passage(0).fourth).toBe(0)
      expect(passage(1).fourth).toBe(0)
    })

    it('Given the ring is moving across the other, then it is away along the fourth axis the whole time', () => {
      let crossing = 0
      for (let t = 0; t <= 1; t += 0.01) {
        const before = passage(Math.max(0, t - 0.01)).along
        const { along, fourth } = passage(t)
        if (along === before) continue
        crossing++
        expect(fourth).toBe(1)
      }
      expect(crossing).toBeGreaterThan(10)
    })
  })

  it('Given I hold the handle until the ring has come back, then the rings are apart, and that is found', () => {
    const { hold, found } = planetWith(linkedRings)
    hold(8, -5.5, 2)
    expect(found()).toBe(0)
    hold(8, -5.5, 4)
    expect(found()).toBe(1)
  })

  it('Given the rings are apart, when I let go and hold the handle again, then the ring goes back the way it came', () => {
    const { world, hold, wait } = planetWith(linkedRings)
    const moving = world.scene.children.filter((child) => (child as THREE.Mesh).isMesh).at(-1)!
    const start = moving.position.x
    hold(8, -5.5, 6)
    const apart = moving.position.x
    wait(0.1)
    hold(8, -5.5, 6)
    expect(apart).toBeGreaterThan(start)
    expect(moving.position.x).toBeCloseTo(start, 6)
  })
})
