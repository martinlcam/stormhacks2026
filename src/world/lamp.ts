import * as THREE from 'three'
import { siteUniform } from '../engine/planet'
import { PortalItemView, splitEmitter } from '../engine/PortalItemView'
import type { World } from './World'

/* The same carryable emitter powers the game and the isolated lighting lab. */
export function addLamp(
  world: World,
  position: readonly [number, number, number],
  name = 'amber-lamp',
) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffbf75,
    emissive: 0xffa342,
    emissiveIntensity: 2,
    roughness: 0.35,
  })
  const lamp = world.addItem({ position, radius: 0.25, material })
  lamp.mesh.name = name
  const lampView = new PortalItemView(lamp.mesh, material, lamp.body.baseRadius, world.portals)
  siteUniform(lampView.material).value = lamp.body.site.motion

  const light = new THREE.PointLight(0xffb45e, 40, 12, 2)
  const crossingLight = new THREE.PointLight(0xffb45e, 0, 12, 2)
  light.name = `${name}-light`
  crossingLight.name = `${name}-crossing-light`
  const lights = [light, crossingLight]
  world.scene.add(...lights)

  return {
    lamp,
    light,
    lights,
    lampView,

    /* Run after ItemSystem has placed the displayed mesh and chosen its site. */
    update(enabled = true) {
      material.emissiveIntensity = enabled ? 2 : 0
      lampView.update()
      const size = lamp.mesh.scale.x
      light.position.copy(lampView.center)
      // Resizing the lamp preserves brightness at the same relative distance.
      light.intensity = enabled ? 40 * size ** light.decay : 0
      light.distance = 12 * size
      crossingLight.intensity = 0

      const portal = lampView.crossing
      if (!portal) return

      const { front, frontOffset, backOffset } = splitEmitter(lampView.distance, lampView.radius)
      const scale = portal.target.scale / portal.scale
      const intensity = light.intensity
      light.position.addScaledVector(portal.spacePlane.normal, frontOffset)
      light.intensity = intensity * front
      crossingLight.position
        .copy(lampView.center)
        .addScaledVector(portal.spacePlane.normal, backOffset)
        .applyMatrix4(portal.view)
      crossingLight.intensity = intensity * (1 - front) * scale ** crossingLight.decay
      crossingLight.distance = light.distance * scale
    },

    dispose() {
      lampView.dispose()
      for (const source of lights) source.removeFromParent()
    },
  }
}

/* A reachable fixture beside the starting path, clear of the player's body. */
export function addWorldLamp(world: World) {
  world.addBox({
    size: [0.7, 0.7, 0.7],
    position: [0.9, 0.35, 0.4],
    material: new THREE.MeshStandardMaterial({ color: 0x544459, roughness: 0.9 }),
  })
  return addLamp(world, [0.9, 0.95, 0.4])
}
