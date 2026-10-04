import * as THREE from 'three'
import { onPlanet, planetMaterial, planetMotion, siteUniform } from './planet'
import type { Portal } from './Portal'

/* A crossing object has one clipped surface in each room, even while its
   physics body belongs to just one. Bend the copy before transporting it so
   both cut edges agree when a curved space connects to a flat one. */
export class PortalItemView {
  readonly copy: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  readonly center = new THREE.Vector3()
  readonly material: THREE.MeshStandardMaterial
  crossing: Portal | undefined
  distance = 0
  radius = 0

  private readonly nearClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6)
  private readonly farClip = new THREE.Plane()
  private readonly transfer = { value: new THREE.Matrix4() }
  private readonly motion = new THREE.Matrix4()
  private readonly local = new THREE.Vector3()

  constructor(
    private readonly mesh: THREE.Mesh,
    private readonly original: THREE.MeshStandardMaterial,
    private readonly baseRadius: number,
    private readonly portals: readonly Portal[],
  ) {
    this.material = original.clone()
    this.material.clippingPlanes = [this.nearClip]
    mesh.material = this.material

    const farMaterial = original.clone()
    farMaterial.clippingPlanes = [this.farClip]
    planetMaterial(farMaterial, this.transfer)
    this.copy = new THREE.Mesh(mesh.geometry, farMaterial)
    this.copy.name = `${mesh.name}-through-portal`
    this.copy.frustumCulled = false
    this.copy.matrixAutoUpdate = false
    this.copy.visible = false
    mesh.parent!.add(this.copy)
  }

  update() {
    this.crossing = undefined
    this.copy.visible = false
    this.nearClip.normal.set(0, 1, 0)
    this.nearClip.constant = 1e6
    this.material.emissiveIntensity = this.original.emissiveIntensity
    this.copy.material.emissiveIntensity = this.original.emissiveIntensity
    const site = siteUniform(this.material).value
    siteUniform(this.copy.material).value = site
    this.center.copy(this.mesh.position).applyMatrix4(planetMotion(this.mesh.position, this.motion))
    if (onPlanet(this.mesh.position)) this.center.applyMatrix4(site)

    this.radius = this.baseRadius * this.mesh.scale.x

    for (const portal of this.portals) {
      const distance = portal.spacePlane.distanceToPoint(this.center)
      if (Math.abs(distance) >= this.radius) continue

      this.local.copy(this.center).applyMatrix4(portal.spaceInverse)
      if (
        Math.abs(this.local.x) > portal.width / 2 ||
        this.local.y < 0 ||
        this.local.y > portal.height ||
        !portal.fits(this.radius * 2, this.radius * 2)
      )
        continue

      this.crossing = portal
      this.distance = distance
      this.nearClip.copy(portal.spacePlane)
      this.farClip.copy(portal.target.spacePlane)
      this.transfer.value.copy(portal.view)
      this.mesh.updateMatrix()
      this.copy.matrix.copy(this.mesh.matrix)
      this.copy.visible = this.mesh.visible
      break
    }
  }

  dispose() {
    this.copy.removeFromParent()
    this.copy.material.dispose()
    this.material.dispose()
    this.mesh.material = this.original
  }
}

/* Approximate a finite emitter by the centroids of its two spherical caps.
   Their weights sum to one and meet continuously at the portal plane. */
export function splitEmitter(distance: number, radius: number) {
  const t = THREE.MathUtils.clamp(distance / radius, -1, 1)
  const front = 0.5 + 0.75 * t - 0.25 * t ** 3
  const moment = radius * (3 / 16) * (1 - t * t) ** 2

  return {
    front,
    frontOffset: front > 0 ? moment / front : 0,
    backOffset: front < 1 ? -moment / (1 - front) : 0,
  }
}
