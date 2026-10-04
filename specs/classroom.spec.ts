import { describe, expect, it } from 'bun:test'
import { biggerInside } from '../src/world/structures/biggerInside'
import { World } from '../src/world/World'
import { FRAME } from './support'

/* The desks, as the classroom lays them out: columns across the room, rows from the front. */
const COLUMNS = [-2.7, -0.9, 0.9, 2.7]
const ROWS = [-2.2, -0.6, 1, 2.6]

/* The classroom, its four chalk gems, and a way to put one down on a desk. */
function classroom() {
  let learnt = 0
  const goals: (string | null)[] = []
  const world = new World()
  world.build(
    biggerInside(
      () => {},
      { hint() {}, solved() {} },
      { hint: (text) => goals.push(text), solved: () => learnt++ },
    ),
  )
  world.finalize()
  const chalks = world.items.slice(-4)
  const seat = (gem: number, row: number, column: number) => {
    const { body } = chalks[gem]
    body.position.set(600 + COLUMNS[column], 1.2, ROWS[row])
    body.velocity.set(0, 0, 0)
    body.resting = false
  }
  const wait = (seconds: number) => {
    for (let i = 0; i < seconds / FRAME; i++) {
      world.update(FRAME, 0)
      for (const { body } of chalks) body.step(FRAME, world.colliders, world.portals)
    }
  }
  // The player is in the room, so the goal is being shown.
  world.checkTriggers(chalks[0].body.position)
  return { seat, wait, learnt: () => learnt, goal: () => goals.at(-1) }
}

describe('Feature: the seating plan', () => {
  it('Given the chalk gems lie on the floor, then nobody is seated', () => {
    const { wait, learnt, goal } = classroom()

    wait(1)

    expect(learnt()).toBe(0)
    expect(goal()).toContain('Seated: 0 of 4')
  })

  it('Given four gems on desks, when two are in the same row, then the lesson is not learnt', () => {
    const { seat, wait, learnt, goal } = classroom()
    seat(0, 0, 0)
    seat(1, 0, 1)
    seat(2, 2, 2)
    seat(3, 3, 3)

    wait(3)

    expect(learnt()).toBe(0)
    expect(goal()).toContain('Seated: 4 of 4, and two share')
  })

  it('Given four gems on desks, when no two share a row or a column, then the lesson is learnt', () => {
    const { seat, wait, learnt, goal } = classroom()
    seat(0, 0, 2)
    seat(1, 1, 0)
    seat(2, 2, 3)
    seat(3, 3, 1)

    wait(3)

    expect(learnt()).toBe(1)
    expect(goal()).toBe('Solved: a seating plan')
  })
})
