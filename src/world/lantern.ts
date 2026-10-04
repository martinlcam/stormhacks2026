import * as THREE from 'three'
import template from '../../assets/minecraft-lantern/template_lantern.json'
import animation from '../../assets/minecraft-lantern/lantern.png.mcmeta.json'
import { addLamp } from './lamp'
import type { World } from './World'

const PIXEL = 0.055
const FRAME_COUNT = 3
const FRAME_SECONDS = animation.animation.frametime / 20
const UP = new THREE.Vector3(0, 1, 0)

/* Minecraft faces list UVs from the top-left. Keep the original face layout,
   including the two crossed, alpha-cut handle planes. */
export function lanternGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (const element of template.elements) {
    const [x0, y0, z0] = element.from
    const [x1, y1, z1] = element.to
    const corners: Record<string, number[][]> = {
      east: [
        [x1, y1, z1],
        [x1, y0, z1],
        [x1, y1, z0],
        [x1, y0, z0],
      ],
      west: [
        [x0, y1, z0],
        [x0, y0, z0],
        [x0, y1, z1],
        [x0, y0, z1],
      ],
      up: [
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
      down: [
        [x0, y0, z1],
        [x0, y0, z0],
        [x1, y0, z1],
        [x1, y0, z0],
      ],
      south: [
        [x0, y1, z1],
        [x0, y0, z1],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
      north: [
        [x1, y1, z0],
        [x1, y0, z0],
        [x0, y1, z0],
        [x0, y0, z0],
      ],
    }

    for (const [direction, face] of Object.entries(element.faces)) {
      if (!face || !corners[direction]) throw new Error(`Invalid lantern face: ${direction}`)
      const start = positions.length / 3

      for (const corner of corners[direction]) {
        const point = new THREE.Vector3(...corner)
        if (element.rotation) {
          if (element.rotation.axis !== 'y') throw new Error('Unsupported lantern rotation')
          const origin = new THREE.Vector3(...element.rotation.origin)
          point
            .sub(origin)
            .applyAxisAngle(UP, THREE.MathUtils.degToRad(element.rotation.angle))
            .add(origin)
        }

        point.sub(new THREE.Vector3(8, 5.5, 8)).multiplyScalar(PIXEL)
        positions.push(point.x, point.y, point.z)
      }

      const [u0, v0, u1, v1] = face.uv
      uvs.push(
        u0 / 16,
        1 - v0 / 16,
        u0 / 16,
        1 - v1 / 16,
        u1 / 16,
        1 - v0 / 16,
        u1 / 16,
        1 - v1 / 16,
      )
      indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/* A second carryable light, using the imported vanilla texture at its original
   pixel resolution. The same texture animation drives its visible emission. */
export function loadLanternTexture(): THREE.Texture {
  return new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}textures/minecraft-lantern/lantern.png`,
  )
}

export function addLantern(
  world: World,
  position: readonly [number, number, number],
  texture = new THREE.Texture(),
) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.repeat.set(1, 1 / FRAME_COUNT)
  texture.offset.y = (FRAME_COUNT - 1) / FRAME_COUNT
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: 0xffffff,
    emissiveIntensity: 0.8,
    roughness: 0.9,
    alphaTest: 0.5,
  })
  const geometry = lanternGeometry()
  const emitter = addLamp(world, position, 'minecraft-lantern', {
    geometry,
    material,
    radius: geometry.boundingSphere!.radius,
  })
  let elapsed = 0

  return {
    ...emitter,

    update(enabled = true, dt = 0) {
      elapsed += dt
      const frame = Math.floor(elapsed / FRAME_SECONDS) % FRAME_COUNT
      texture.offset.y = (FRAME_COUNT - 1 - frame) / FRAME_COUNT
      emitter.update(enabled)
    },

    dispose() {
      emitter.dispose()
      texture.dispose()
      material.dispose()
      geometry.dispose()
    },
  }
}
