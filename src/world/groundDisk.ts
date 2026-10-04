import * as THREE from 'three'

/*
  The whole ground as one disk on the flat map. The planet shader closes it
  into a sphere: the centre is the pole and the rim is the point opposite.
*/
export function groundDisk(radius: number, rings: number, sectors: number): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= rings; ring++) {
    const r = (ring / rings) * radius

    for (let sector = 0; sector <= sectors; sector++) {
      const angle = (sector / sectors) * Math.PI * 2
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r
      positions.push(x, 0, z)
      normals.push(0, 1, 0)
      // One grid square every two metres of map.
      uvs.push(x / 2, z / 2)
    }
  }

  const row = sectors + 1

  for (let ring = 0; ring < rings; ring++) {
    for (let sector = 0; sector < sectors; sector++) {
      const a = ring * row + sector
      const b = a + row
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}
