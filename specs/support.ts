import { expect } from 'bun:test'
import * as THREE from 'three'
import { Body } from '../src/engine/Body'
import type { Axis } from '../src/engine/gravity'
import { Portal } from '../src/engine/Portal'

export const FRAME = 1 / 60

export const floor = new THREE.Box3(new THREE.Vector3(-50, -1, -50), new THREE.Vector3(50, 0, 50))

/* Which way a door's front faces, as the yaw to build it with. */
export const FACING = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }

export function door(x: number, z: number, yaw: number, scale = 1): Portal {
  return new Portal({
    name: `door at ${x},${z}`,
    position: new THREE.Vector3(x, 0, z),
    yaw,
    width: 1.2,
    height: 2.2,
    scale,
  })
}

/* A door standing on some surface other than the floor. */
export function doorOn(up: Axis, position: [number, number, number], yaw: number): Portal {
  return new Portal({
    name: `door on ${up}`,
    position: new THREE.Vector3(...position),
    yaw,
    up,
    width: 1.2,
    height: 2.2,
  })
}

export function linked(a: Portal, b: Portal): [Portal, Portal] {
  a.link(b)
  b.link(a)
  return [a, b]
}

export function gem(x: number, y: number, z: number, radius = 0.2): Body {
  const body = new Body(radius)
  body.position.set(x, y, z)
  return body
}

export function simulate(
  body: Body,
  seconds: number,
  colliders: THREE.Box3[] = [],
  portals: Portal[] = [],
) {
  for (let i = 0; i < seconds / FRAME; i++) body.step(FRAME, colliders, portals)
}

export function expectAt(v: THREE.Vector3, x: number, y: number, z: number, digits = 5) {
  expect(v.x).toBeCloseTo(x, digits)
  expect(v.y).toBeCloseTo(y, digits)
  expect(v.z).toBeCloseTo(z, digits)
}
