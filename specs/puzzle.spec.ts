import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { addRegion, addSocket, ramp } from '../src/world/puzzle'
import { World } from '../src/world/World'

const material = new THREE.MeshStandardMaterial()

function worldWithGem(x: number, y: number, z: number) {
  const world = new World()
  const gem = world.addItem({ position: [x, y, z], material })
  return { world, gem }
}

describe('Feature: a socket takes a gem that rests in it', () => {
  describe('Scenario: a gem on the floor', () => {
    it('Given a gem lying on the socket, then the socket holds it', () => {
      const { world, gem } = worldWithGem(2, 0.18, 3)
      const socket = addSocket(world, { position: [2, 0, 3], colour: 0xffffff, items: [gem] })
      expect(socket.holds()).toBe(gem)
    })

    it('Given a gem lying beside the socket, then the socket is empty', () => {
      const { world, gem } = worldWithGem(3, 0.18, 3)
      const socket = addSocket(world, { position: [2, 0, 3], colour: 0xffffff, items: [gem] })
      expect(socket.holds()).toBeNull()
    })

    it('Given a gem flying over the socket, then the socket is empty', () => {
      const { world, gem } = worldWithGem(2, 0.18, 3)
      const socket = addSocket(world, { position: [2, 0, 3], colour: 0xffffff, items: [gem] })
      gem.body.velocity.set(4, 0, 0)
      expect(socket.holds()).toBeNull()
    })

    it('Given a gem that is not one of the socket’s own, then the socket is empty', () => {
      const { world } = worldWithGem(2, 0.18, 3)
      const socket = addSocket(world, { position: [2, 0, 3], colour: 0xffffff, items: [] })
      expect(socket.holds()).toBeNull()
    })
  })

  describe('Scenario: a socket for a gem that a door has shrunk', () => {
    it('Given a quarter-size socket, when a full-size gem lies on it, then the socket is empty', () => {
      const { world, gem } = worldWithGem(0, 0.18, 0)
      const socket = addSocket(world, {
        position: [0, 0, 0],
        size: 0.25,
        colour: 0xffffff,
        items: [gem],
      })
      expect(socket.holds()).toBeNull()
    })

    it('Given a sixteenth-size socket, when a gem that went through the door twice lies on it, then the socket holds it', () => {
      const { world, gem } = worldWithGem(0, 0, 0)
      gem.body.scale = 0.25 * 0.25
      gem.body.position.y = gem.body.radius
      const socket = addSocket(world, {
        position: [0, 0, 0],
        width: 0.2,
        size: 1 / 16,
        colour: 0xffffff,
        items: [gem],
      })
      expect(socket.holds()).toBe(gem)
    })
  })

  describe('Scenario: a socket on a wall', () => {
    it('Given a gem against the wall that still falls towards the floor, then the socket is empty', () => {
      const { world, gem } = worldWithGem(4.82, 3, 0)
      const socket = addSocket(world, {
        position: [5, 3, 0],
        up: 'x-',
        colour: 0xffffff,
        items: [gem],
      })
      expect(socket.holds()).toBeNull()
    })

    it('Given a gem that a door has turned to fall towards the wall, then the socket holds it', () => {
      const { world, gem } = worldWithGem(4.82, 3, 0)
      gem.body.up.set(-1, 0, 0)
      const socket = addSocket(world, {
        position: [5, 3, 0],
        up: 'x-',
        colour: 0xffffff,
        items: [gem],
      })
      expect(socket.holds()).toBe(gem)
    })
  })
})

describe('Feature: a puzzle shows its goal while the player is at it', () => {
  it('Given two boxes side by side, when the player steps from one into the other and then away, then the goal stays up until they have left both', () => {
    const world = new World()
    const shown: (string | null)[] = []
    addRegion(
      world,
      [
        // The second box is listed first, so it is left after the other is entered.
        [
          [10, -1, -1],
          [12, 3, 1],
        ],
        [
          [-1, -1, -1],
          [1, 3, 1],
        ],
      ],
      { hint: (text) => shown.push(text), solved() {} },
      () => 'goal',
    )
    world.checkTriggers(new THREE.Vector3(0, 0, 0))
    world.checkTriggers(new THREE.Vector3(11, 0, 0))
    expect(shown.at(-1)).toBe('goal')
    world.checkTriggers(new THREE.Vector3(30, 0, 0))
    expect(shown.at(-1)).toBeNull()
  })
})

describe('Feature: colours run smoothly from one to the next', () => {
  it('Given a row of colours, then its ends are the first and last and its middle is between', () => {
    const stops = [0xff0000, 0x0000ff]
    expect(ramp(stops, 0)).toBe(0xff0000)
    expect(ramp(stops, 1)).toBe(0x0000ff)
    const middle = new THREE.Color(ramp(stops, 0.5))
    expect(middle.r).toBeGreaterThan(0)
    expect(middle.b).toBeGreaterThan(0)
  })
})
