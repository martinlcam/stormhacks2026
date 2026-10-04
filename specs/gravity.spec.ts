import { describe, expect, it } from 'bun:test'
import * as THREE from 'three'
import { frameFor, reorient, upVector } from '../src/engine/gravity'
import { FACING, door, doorOn, gem, linked, simulate } from './support'

/* Which way a walker faces in the world, given their up and yaw. */
function facing(axis: Parameters<typeof frameFor>[0], yaw: number) {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).applyMatrix4(frameFor(axis))
}

describe('Feature: a door can stand you on a wall', () => {
  // A door on the floor against the east wall, joined to a door that stands
  // on that wall with its back to the ceiling.
  const [floorDoor, wallDoor] = linked(
    door(4.9, -2, FACING.west),
    doorOn('x-', [5, 9.9, 2], FACING.west),
  )

  describe('Scenario: walking through the floor door', () => {
    const before = { axis: 'y+' as const, yaw: FACING.west }
    const after = reorient(before.axis, before.yaw, floorDoor.transform)

    it('Given I stand on the floor, when I walk through the door, then the wall is my floor', () => {
      expect(after.axis).toBe('x-')
    })

    it('Then I am walking down the wall, away from the ceiling', () => {
      const heading = facing(after.axis, after.yaw)

      expect(heading.y).toBeCloseTo(-1, 6)
    })

    it('Then my feet are on the wall just in front of the far door', () => {
      // Half a step short of the floor door, heading into it.
      const feet = new THREE.Vector3(4.9 - 1e-3, 0, -2).applyMatrix4(floorDoor.transform)

      expect(feet.x).toBeCloseTo(5, 3)
      expect(feet.y).toBeCloseTo(9.9, 2)
      expect(feet.z).toBeCloseTo(2, 3)
    })
  })

  describe('Scenario: coming back the same way', () => {
    it('Given I stand on the wall, when I walk back through the wall door, then the floor is my floor again and I face the way I came from', () => {
      const out = reorient('y+', FACING.west, floorDoor.transform)
      const turned = out.yaw + Math.PI
      const back = reorient(out.axis, turned, wallDoor.transform)

      expect(back.axis).toBe('y+')
      const heading = facing(back.axis, back.yaw)
      expect(heading.x).toBeCloseTo(-1, 6)
    })
  })

  describe('Scenario: an ordinary upright door', () => {
    it('Given two upright doors, when I walk through, then up is still up and I am only turned', () => {
      const [a] = linked(door(0, 0, FACING.south), door(10, 0, FACING.east))

      const after = reorient('y+', 0, a.transform)

      expect(after.axis).toBe('y+')
      expect(facing(after.axis, after.yaw).x).toBeCloseTo(1, 6)
    })
  })
})

describe('Feature: gems fall towards whatever is the floor where they are', () => {
  const eastWall = new THREE.Box3(new THREE.Vector3(5, 0, -5), new THREE.Vector3(5.3, 10, 5))
  const floor = new THREE.Box3(new THREE.Vector3(-5.3, -0.3, -5), new THREE.Vector3(5.3, 0, 5))

  describe('Scenario: letting go of a gem while standing on the wall', () => {
    it('Given a gem whose up points away from the east wall, when it is let go in mid-air, then it falls sideways onto that wall and rests there', () => {
      const body = gem(2, 5, 0)
      body.up.copy(upVector('x-'))

      simulate(body, 5, [floor, eastWall])

      expect(body.resting).toBe(true)
      expect(body.position.x).toBeCloseTo(5 - 0.2, 2)
      expect(body.position.y).toBeCloseTo(5, 1)
    })
  })

  describe('Scenario: throwing a gem through the floor door', () => {
    it('Given a floor door joined to a door on the wall, when I roll a gem into the floor door, then it comes out falling towards the wall', () => {
      const [floorDoor, wallDoor] = linked(
        door(4.9, -2, FACING.west),
        doorOn('x-', [5, 9.9, 2], FACING.west),
      )
      const body = gem(3, 0.5, -2)
      body.velocity.set(6, 0, 0)

      for (let i = 0; i < 60 && body.up.y === 1; i++) {
        body.step(1 / 60, [floor], [floorDoor, wallDoor])
      }

      expect(body.up.x).toBe(-1)
      // It was moving into the door; now it moves out of the far one, down the wall.
      expect(body.velocity.y).toBeLessThan(0)
      expect(body.position.z).toBeCloseTo(2, 1)
    })
  })
})
