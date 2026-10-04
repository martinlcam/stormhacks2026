import * as THREE from 'three'

/*
  Which way is up.

  Gravity always points along one of the six world axes, so "up" is named by
  an axis. Each axis has one fixed frame: the rotation that stands a
  y-up thing upright for that axis. A walker's whole orientation is then
  that frame plus a yaw about its own up, the same as on flat ground.

  Because every frame is a quarter-turn rotation, the world's axis-aligned
  boxes are still axis-aligned when seen from inside any frame. The player
  collides in their own frame, where gravity is always -y.
*/
export type Axis = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-'

const QUARTER = Math.PI / 2

const frames: Record<Axis, THREE.Matrix4> = {
  'y+': new THREE.Matrix4(),
  'y-': new THREE.Matrix4().makeRotationX(Math.PI),
  'x+': new THREE.Matrix4().makeRotationZ(-QUARTER),
  'x-': new THREE.Matrix4().makeRotationZ(QUARTER),
  'z+': new THREE.Matrix4().makeRotationX(QUARTER),
  'z-': new THREE.Matrix4().makeRotationX(-QUARTER),
}

const inverses = Object.fromEntries(
  Object.entries(frames).map(([axis, frame]) => [axis, frame.clone().invert()]),
) as Record<Axis, THREE.Matrix4>

const ups: Record<Axis, THREE.Vector3> = {
  'x+': new THREE.Vector3(1, 0, 0),
  'x-': new THREE.Vector3(-1, 0, 0),
  'y+': new THREE.Vector3(0, 1, 0),
  'y-': new THREE.Vector3(0, -1, 0),
  'z+': new THREE.Vector3(0, 0, 1),
  'z-': new THREE.Vector3(0, 0, -1),
}

/* Local (y-up) → world, for something standing with this axis as up. Do not modify. */
export function frameFor(axis: Axis): THREE.Matrix4 {
  return frames[axis]
}

/* World → local (y-up). Do not modify. */
export function inverseFrameFor(axis: Axis): THREE.Matrix4 {
  return inverses[axis]
}

/* The unit vector for an axis. Do not modify. */
export function upVector(axis: Axis): THREE.Vector3 {
  return ups[axis]
}

/* The axis a direction is closest to. */
export function axisOf(direction: THREE.Vector3): Axis {
  const x = Math.abs(direction.x)
  const y = Math.abs(direction.y)
  const z = Math.abs(direction.z)
  if (y >= x && y >= z) return direction.y >= 0 ? 'y+' : 'y-'
  if (x >= z) return direction.x >= 0 ? 'x+' : 'x-'
  return direction.z >= 0 ? 'z+' : 'z-'
}

const up = new THREE.Vector3()
const heading = new THREE.Vector3()

/*
  Carry a walker's up and heading through a transform, such as a portal's.
  The transform may turn them onto a wall: their new up is whichever axis
  their old up lands on, and their yaw is re-read in that axis's frame so
  that they keep facing the same way in space.
*/
export function reorient(
  axis: Axis,
  yaw: number,
  transform: THREE.Matrix4,
): { axis: Axis; yaw: number } {
  up.copy(ups[axis]).transformDirection(transform)
  const next = axisOf(up)
  heading
    .set(-Math.sin(yaw), 0, -Math.cos(yaw))
    .applyMatrix4(frames[axis])
    .transformDirection(transform)
    .applyMatrix4(inverses[next])
  return { axis: next, yaw: Math.atan2(-heading.x, -heading.z) }
}
