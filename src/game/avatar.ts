import * as THREE from 'three'
import { frameFor } from '../engine/gravity'
import type { PlayerController } from '../engine/PlayerController'
import { PORTAL_ONLY_LAYER } from '../engine/PortalRenderer'
import { palette } from '../world/materials'

/*
  All lengths are for a player of scale 1, feet at the origin. The figure is
  squat: as wide at the ground as the player's collision shape, only a
  little narrower at the top, and about half the player's height.
*/
const BASE_RADIUS = 0.3
const RIM_RADIUS = 0.24
const RIM_HEIGHT = 0.62
const HEAD_RADIUS = 0.22
/* The slot is a bowl cut from a larger ball, so the head sits in it with a gap all round. */
const SLOT_RADIUS = 0.28
/* How many faces go round the body, and how many steps the bowl is cut in. */
const SIDES = 64
const SLOT_STEPS = 16
/* The plant on the head: a stalk, and one leaf on each side of its top. */
const STALK_HEIGHT = 0.17
const LEAF_LENGTH = 0.13
const LEAF_WIDTH = 0.06
const LEAF_THICKNESS = 0.012
/* How far the leaves lift above level, in radians. */
const LEAF_LIFT = 0.45
const STALK_GREEN = 0x5aa846
const LEAF_GREEN = 0x86e05a

const turn = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)

/*
  Paper-like: smooth and matt, no gloss. It gives off a little of its own
  colour so the figure stays light in the plaza's dim violet light.
*/
function paper(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    roughness: 1,
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
  The player's own body: a short, wide cylinder, flat on the bottom and a
  little narrower towards the top, with a bowl-shaped slot in the top and a
  ball held in the slot for a head. There are no arms or legs. A small plant
  grows from the top of the head: a stalk with a leaf on each side.

  The head is fixed in its slot. It turns only as the player looks: left and
  right with the body, up and down with the view. The plant is part of the
  head and turns with it.

  The game stays first person. The body is drawn where the player stands, so
  they see it when they look down, and the whole figure when a doorway shows
  them themselves. The head and its plant are only drawn in views through
  portals, so the player never looks down on the top of their own head.
*/
export class Avatar {
  readonly body: THREE.Mesh
  readonly head: THREE.Mesh
  readonly stalk: THREE.Mesh
  /* Left leaf, then right leaf. */
  readonly leaves: THREE.Mesh[] = []
  private readonly group = new THREE.Group()

  constructor(
    scene: THREE.Scene,
    private readonly player: PlayerController,
  ) {
    this.body = new THREE.Mesh(new THREE.LatheGeometry(outline(), SIDES), paper(0xffffff))
    this.head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 48, 32), paper(palette.bone))
    this.head.position.y = RIM_HEIGHT + SLOT_RISE
    this.group.add(this.body, this.head)

    // The plant is built in the head's own frame, growing from its top.
    const stalkGeometry = new THREE.CylinderGeometry(0.007, 0.012, STALK_HEIGHT, 12)
    this.stalk = new THREE.Mesh(stalkGeometry, paper(STALK_GREEN))
    this.stalk.position.y = HEAD_RADIUS + STALK_HEIGHT / 2 - 0.005
    this.head.add(this.stalk)

    // A leaf is a flattened ball, stretched along its length, which runs out
    // from the stalk along +X before it is turned to its side.
    const leafGeometry = new THREE.SphereGeometry(0.5, 24, 16)
      .scale(LEAF_LENGTH, LEAF_THICKNESS, LEAF_WIDTH)
      .translate(LEAF_LENGTH / 2, 0, 0)
    const leafMaterial = paper(LEAF_GREEN)
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial)
      leaf.position.y = HEAD_RADIUS + STALK_HEIGHT - 0.012
      // Point away from the stalk on its own side, tipped up a little.
      leaf.rotation.set(0, side < 0 ? Math.PI : 0, LEAF_LIFT, 'YXZ')
      this.leaves.push(leaf)
      this.head.add(leaf)
    }

    this.group.traverse((object) => {
      // The stored bounds are not where a mesh on the planet is drawn.
      object.frustumCulled = false
    })
    for (const mesh of [this.head, this.stalk, ...this.leaves]) {
      mesh.layers.set(PORTAL_ONLY_LAYER)
    }
    scene.add(this.group)
  }

  /* Follow the player. */
  update() {
    const { player, group, head } = this
    group.position.copy(player.position)
    // Stand on whatever surface the player stands on, turned to face their way.
    group.quaternion
      .setFromRotationMatrix(frameFor(player.axis))
      .multiply(turn.setFromAxisAngle(UP, player.yaw))
    group.scale.setScalar(player.scale)
    // The body has already turned left or right; the head adds looking up or down.
    head.rotation.set(player.pitch, 0, 0)
  }
}
