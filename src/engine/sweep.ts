import * as THREE from 'three'

const hit = new THREE.Vector3()

/*
  First contact of a moving sphere with a box, as a fraction of its path.
  The expanded box is only a broad phase: its corners are square, while
  the sphere's contact boundary has round edges and corners.
*/
export function sweepSphereBox(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  box: THREE.Box3,
  normal: THREE.Vector3,
): number {
  let enter = 0
  let leave = 1

  for (let axis = 0; axis < 3; axis++) {
    const start = from.getComponent(axis)
    const motion = to.getComponent(axis) - start
    const low = box.min.getComponent(axis) - radius
    const high = box.max.getComponent(axis) + radius

    if (motion === 0) {
      if (start < low || start > high) return Infinity
      continue
    }

    const a = (low - start) / motion
    const b = (high - start) / motion
    enter = Math.max(enter, Math.min(a, b))
    leave = Math.min(leave, Math.max(a, b))
    if (enter > leave) return Infinity
  }

  // The closest feature changes only when the centre crosses a box face.
  // Between those crossings, squared distance to the box is a quadratic.
  const cuts = [enter, leave]

  for (let axis = 0; axis < 3; axis++) {
    const start = from.getComponent(axis)
    const motion = to.getComponent(axis) - start
    if (motion === 0) continue

    for (const bound of [box.min, box.max]) {
      const t = (bound.getComponent(axis) - start) / motion
      if (t > enter && t < leave) cuts.push(t)
    }
  }

  cuts.sort((a, b) => a - b)

  for (let i = 0; i < cuts.length - 1; i++) {
    const low = cuts[i]
    const high = cuts[i + 1]
    const middle = (low + high) / 2
    let a = 0
    let b = 0
    let c = -radius * radius

    for (let axis = 0; axis < 3; axis++) {
      const start = from.getComponent(axis)
      const motion = to.getComponent(axis) - start
      const at = start + motion * middle
      const min = box.min.getComponent(axis)
      const max = box.max.getComponent(axis)
      if (at >= min && at <= max) continue

      const gap = start - (at < min ? min : max)
      a += motion * motion
      b += 2 * gap * motion
      c += gap * gap
    }

    let t = low
    if ((a * low + b) * low + c > 0) {
      const discriminant = b * b - 4 * a * c
      if (a === 0 || discriminant < 0) continue
      t = (-b - Math.sqrt(discriminant)) / (2 * a)
      // The broad-phase entry and quadratic root can differ by a few ulps.
      if (t < low - 1e-10 || t > high + 1e-10) continue
      t = Math.max(low, Math.min(high, t))
    }

    hit.copy(from).lerp(to, t)
    box.clampPoint(hit, normal)
    normal.subVectors(hit, normal)
    const distance = normal.length()
    // Existing overlaps are resolved by ordinary penetration correction.
    if (distance === 0) return Infinity
    normal.divideScalar(distance)
    const into =
      (to.x - from.x) * normal.x + (to.y - from.y) * normal.y + (to.z - from.z) * normal.z
    return into < 0 ? t : Infinity
  }

  return Infinity
}
