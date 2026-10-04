import * as THREE from 'three'
import { frameFor } from '../engine/gravity'
import type { PlayerController } from '../engine/PlayerController'
import { PORTAL_ONLY_LAYER } from '../engine/PortalRenderer'
import { palette } from '../world/materials'

/*
  All lengths are for a player of scale 1, feet at the origin. They follow
  the player's collision shape: 0.3 m in radius at the ground, 1.8 m tall,
  with the eye at the middle of the head.
*/
const BASE_RADIUS = 0.3
const RIM_RADIUS = 0.14
const RIM_HEIGHT = 1.48
const HEAD_RADIUS = 0.17
/* The slot is a bowl cut from a slightly larger ball, so the head sits in it with a gap. */
const SLOT_RADIUS = 0.185
/* How many flat faces go round the body, and how many steps the bowl is cut in. */
const SIDES = 20
const SLOT_STEPS = 5

const turn = new THREE.Quaternion()
const roll = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/*
  Paper-like: one flat tone per face, no gloss. It gives off a little of its
  own colour so the figure stays light in the plaza's dim violet light.
*/
function paper(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    roughness: 1,
    flatShading: true,
  })
}

/* How far the centre of the slot's ball is above the rim. */
const SLOT_RISE = Math.sqrt(SLOT_RADIUS ** 2 - RIM_RADIUS ** 2)

/*
  The body's outline from the axis outwards, to be spun round the axis:
  across the flat bottom, up the tapering side to the rim, then down into
  the bowl of the slot and back to the axis.
*/
function outline(): THREE.Vector2[] {
  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(BASE_RADIUS, 0),
    new THREE.Vector2(RIM_RADIUS, RIM_HEIGHT),
  ]
  for (let i = 1; i <= SLOT_STEPS; i++) {
    const r = RIM_RADIUS * (1 - i / SLOT_STEPS)
    points.push(new THREE.Vector2(r, RIM_HEIGHT + SLOT_RISE - Math.sqrt(SLOT_RADIUS ** 2 - r ** 2)))
  }
  return points
}

/*
  The player's own body: a tapering cylinder, flat on the bottom and narrower
  towards the top, with a bowl-shaped slot in the top and a ball resting in
  the slot for a head. There are no arms or legs.

  The game stays first person. The body is drawn where the player stands, so
  they see the rim and the slot when they look down, and the whole figure
  when a doorway shows them themselves. The eye is inside the head, so the
  head is only drawn in views through portals.
*/
export class Avatar {
  readonly body: THREE.Mesh
  readonly head: THREE.Mesh
  private readonly group = new THREE.Group()

  constructor(
    scene: THREE.Scene,
    private readonly player: PlayerController,
  ) {
    this.body = new THREE.Mesh(new THREE.LatheGeometry(outline(), SIDES), paper(0xffffff))
    this.head = new THREE.Mesh(new THREE.IcosahedronGeometry(HEAD_RADIUS, 1), paper(palette.bone))
    this.head.position.y = RIM_HEIGHT + SLOT_RISE
    this.head.layers.set(PORTAL_ONLY_LAYER)

    for (const mesh of [this.body, this.head]) {
      // The stored bounds are not where a mesh on the planet is drawn.
      mesh.frustumCulled = false
      this.group.add(mesh)
    }
    scene.add(this.group)
  }

  /* Follow the player. */
  update(dt: number) {
    const { player, group, head } = this
    group.position.copy(player.position)
    // Stand on whatever surface the player stands on, turned to face their way.
    group.quaternion
      .setFromRotationMatrix(frameFor(player.axis))
      .multiply(turn.setFromAxisAngle(UP, player.yaw))
    group.scale.setScalar(player.scale)
    group.updateMatrixWorld(true)

    // The head is loose in its slot, so it rolls like a ball as the body moves.
    const rising = player.velocity.dot(player.up)
    roll.copy(player.velocity).addScaledVector(player.up, -rising)
    const speed = roll.length()
    if (speed > 1e-4) {
      roll.crossVectors(player.up, roll).normalize()
      group.worldToLocal(roll.add(group.position)).normalize()
      head.rotateOnWorldAxis(roll, (speed * dt) / (HEAD_RADIUS * player.scale))
    }
  }
}
