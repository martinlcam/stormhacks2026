import * as THREE from 'three'
import { frameFor } from '../engine/gravity'
import type { PlayerController } from '../engine/PlayerController'
import { PORTAL_ONLY_LAYER } from '../engine/PortalRenderer'
import { palette } from '../world/materials'
import type { Item } from '../world/World'

/* All lengths are for a player of scale 1, feet at the origin, facing -Z. */
const HEM = 0.34
const SHOULDER = 1.3
const HEAD = 1.43
const HAT_BRIM = 1.5
const HAT_HEIGHT = 0.4
const ARM_REST = 0.4
/* The furthest the arm stretches towards something held. */
const ARM_REACH = 0.75
/* Radians of walk cycle per metre walked. */
const STRIDE = 2.2
const LEG_SWING = 0.5
/* The speed at which the legs reach their full swing. */
const FULL_SWING_SPEED = 4.5

const DOWN = new THREE.Vector3(0, -1, 0)
const target = new THREE.Vector3()
const aim = new THREE.Quaternion()
const turn = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)

/*
  Paper-like: one flat tone per face, no gloss. It gives off a little of its
  own colour so the figure stays white in the plaza's dim violet light.
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

/*
  The player's own body: a small faceless figure in white, a cone of a dress
  under a tall pointed hat, on thin legs.

  The game stays first person. The body is drawn where the player stands, so
  they see the dress and their feet when they look down, an arm when they
  carry something, and the whole figure when a doorway shows them themselves.
  The head and hat would be in the eye's way, so those are only drawn in views
  through portals.
*/
export class Avatar {
  private readonly group = new THREE.Group()
  private readonly arms: THREE.Mesh[] = []
  private readonly armRest: THREE.Quaternion[] = []
  private readonly legs: THREE.Mesh[] = []
  private phase = 0
  private swing = 0

  constructor(
    scene: THREE.Scene,
    private readonly player: PlayerController,
  ) {
    const cloth = paper(0xffffff)
    const skin = paper(palette.bone)

    const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.29, SHOULDER - HEM, 10), cloth)
    dress.position.y = (SHOULDER + HEM) / 2
    this.group.add(dress)

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), skin)
    head.position.y = HEAD
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.17, HAT_HEIGHT, 10), cloth)
    hat.position.y = HAT_BRIM + HAT_HEIGHT / 2
    for (const mesh of [head, hat]) {
      mesh.layers.set(PORTAL_ONLY_LAYER)
      this.group.add(mesh)
    }

    // Limbs hang down from their pivot, one unit long, and are scaled to length.
    const limb = new THREE.CylinderGeometry(0.024, 0.018, 1, 6).translate(0, -0.5, 0)
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(limb, skin)
      arm.position.set(side * 0.1, SHOULDER - 0.06, 0)
      const rest = new THREE.Quaternion().setFromUnitVectors(
        DOWN,
        new THREE.Vector3(side * 0.3, -1, 0).normalize(),
      )
      arm.quaternion.copy(rest)
      arm.scale.y = ARM_REST
      this.arms.push(arm)
      this.armRest.push(rest)
      this.group.add(arm)

      const leg = new THREE.Mesh(limb, skin)
      leg.position.set(side * 0.07, HEM + 0.06, 0)
      leg.scale.y = HEM + 0.06
      this.legs.push(leg)
      this.group.add(leg)
    }

    // The stored bounds are not where a bent mesh is drawn.
    for (const mesh of this.group.children) mesh.frustumCulled = false
    scene.add(this.group)
  }

  /* Follow the player. `holding` is what they are carrying, if anything. */
  update(dt: number, holding: Item | null) {
    const { player, group } = this
    group.position.copy(player.position)
    // Stand on whatever surface the player stands on, turned to face their way.
    group.quaternion
      .setFromRotationMatrix(frameFor(player.axis))
      .multiply(turn.setFromAxisAngle(UP, player.yaw))
    group.scale.setScalar(player.scale)
    group.updateMatrixWorld(true)

    // Legs: small quick steps, in time with the ground covered.
    const rising = player.velocity.dot(player.up)
    const along = Math.sqrt(Math.max(0, player.velocity.lengthSq() - rising * rising))
    const speed = along / player.scale
    const wanted = player.onGround ? Math.min(1, speed / FULL_SWING_SPEED) : 0
    this.swing += (wanted - this.swing) * (1 - Math.exp(-10 * dt))
    this.phase += speed * STRIDE * dt
    const angle = Math.sin(this.phase) * LEG_SWING * this.swing
    this.legs[0].rotation.x = angle
    this.legs[1].rotation.x = -angle

    // Right arm: out to whatever is held, otherwise back at the side.
    const arm = this.arms[1]
    let length = ARM_REST
    aim.copy(this.armRest[1])
    if (holding) {
      group.worldToLocal(target.copy(holding.body.position)).sub(arm.position)
      const distance = target.length()
      if (distance > 1e-6) {
        aim.setFromUnitVectors(DOWN, target.divideScalar(distance))
        const radius = holding.body.radius / player.scale
        length = Math.max(0.1, Math.min(ARM_REACH, distance - radius))
      }
    }
    const ease = 1 - Math.exp(-14 * dt)
    arm.quaternion.slerp(aim, ease)
    arm.scale.y += (length - arm.scale.y) * ease
  }
}
