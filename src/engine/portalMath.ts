import * as THREE from 'three'

const HALF_TURN = new THREE.Matrix4().makeRotationY(Math.PI)
const scratch = new THREE.Matrix4()

/**
 * World-space transform that carries anything entering the source portal to
 * where it leaves the destination portal.
 *
 * Both portals share one local convention: the opening lies in the local XY
 * plane and +Z is the front (the side you stand on to look in). Walking in
 * means moving along local -Z; you must come out of the destination moving
 * along its +Z, hence the half turn between the two frames:
 *
 *   T = M_dst · R_y(π) · M_src⁻¹
 *
 * A point at source-local (x, y, z) lands at destination-local (-x, y, -z).
 * If the two portals differ in scale, T scales too, which is all a
 * "shrinking doorway" needs.
 */
export function portalTransform(
  source: THREE.Matrix4,
  destination: THREE.Matrix4,
  out = new THREE.Matrix4(),
): THREE.Matrix4 {
  scratch.copy(source).invert()
  return out.copy(destination).multiply(HALF_TURN).multiply(scratch)
}

const dir = new THREE.Vector3()

/** How much a transform turns a heading about the vertical axis (radians). */
export function yawDelta(transform: THREE.Matrix4): number {
  // Push the yaw-0 forward vector (0, 0, -1) through and read its new heading.
  dir.set(0, 0, -1).transformDirection(transform)
  return Math.atan2(-dir.x, -dir.z)
}
