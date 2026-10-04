import * as THREE from 'three'

/*
  Drawing on the planet itself. A place on the planet is a direction from
  its centre, a unit vector, with the pole straight up. Lines that are
  straight on a sphere, the great circles, are simple in those terms and
  bent on the flat map, so what is drawn along them is worked out on the
  sphere and then put on the map point by point. The planet shader carries
  each point back, so it is drawn exactly where it was worked out.
*/

/* The place a map point stands for. */
export function onSphere(x: number, z: number, radius: number, out = new THREE.Vector3()) {
  const d = Math.hypot(x, z)
  if (d < 1e-9) return out.set(0, 1, 0)
  const angle = d / radius
  const outward = Math.sin(angle) / d
  return out.set(x * outward, Math.cos(angle), z * outward)
}

/* The map point of a place, `height` metres above the ground. */
export function onMap(place: THREE.Vector3, radius: number, height = 0, out = new THREE.Vector3()) {
  const flat = Math.hypot(place.x, place.z)
  // Straight up is the pole. Straight down is the point opposite, which is the whole rim of the map.
  if (flat < 1e-9) return out.set(place.y > 0 ? 0 : Math.PI * radius, height, 0)
  const d = Math.acos(Math.max(-1, Math.min(1, place.y))) * radius
  return out.set((place.x / flat) * d, height, (place.z / flat) * d)
}

/* The direction at the pole that a compass bearing on the map points in, in degrees from +x towards +z. */
export function bearing(degrees: number, out = new THREE.Vector3()) {
  const angle = (degrees * Math.PI) / 180
  return out.set(Math.cos(angle), 0, Math.sin(angle))
}

/*
  Where a walker is after going `metres` in a straight line from `from`,
  setting off towards `heading`, which is at right angles to `from`.
*/
export function walk(
  from: THREE.Vector3,
  heading: THREE.Vector3,
  metres: number,
  radius: number,
  out = new THREE.Vector3(),
) {
  const angle = metres / radius
  return out.copy(from).multiplyScalar(Math.cos(angle)).addScaledVector(heading, Math.sin(angle))
}

/* Which way that walker is then facing. */
export function headingAfter(
  from: THREE.Vector3,
  heading: THREE.Vector3,
  metres: number,
  radius: number,
  out = new THREE.Vector3(),
) {
  const angle = metres / radius
  return out.copy(heading).multiplyScalar(Math.cos(angle)).addScaledVector(from, -Math.sin(angle))
}

/* The straight line from one place to another, as `steps` + 1 places along it. */
export function straight(from: THREE.Vector3, to: THREE.Vector3, steps: number): THREE.Vector3[] {
  const angle = from.angleTo(to)
  const heading = to.clone().addScaledVector(from, -from.dot(to)).normalize()
  return Array.from({ length: steps + 1 }, (_, i) => walk(from, heading, (i / steps) * angle, 1))
}

/* Metres between two places, along the ground. */
export function apart(a: THREE.Vector3, b: THREE.Vector3, radius: number): number {
  return a.angleTo(b) * radius
}

const along = new THREE.Vector3()
const aside = new THREE.Vector3()
const edge = new THREE.Vector3()
const point = new THREE.Vector3()

/*
  Flat strips laid on the ground along paths of places: chalk lines, rails.
  All the strips added become one mesh.
*/
export class Strips {
  private readonly positions: number[] = []
  private readonly indices: number[] = []

  constructor(private readonly radius: number) {}

  /* A strip `width` metres wide along `path`, `height` metres above the ground. */
  add(path: readonly THREE.Vector3[], width: number, height: number): this {
    const first = this.positions.length / 3
    path.forEach((place, i) => {
      const before = path[Math.max(0, i - 1)]
      const after = path[Math.min(path.length - 1, i + 1)]
      along.subVectors(after, before)
      aside.crossVectors(place, along).normalize()
      for (const side of [-1, 1]) {
        edge
          .copy(place)
          .addScaledVector(aside, (side * width) / 2 / this.radius)
          .normalize()
        onMap(edge, this.radius, height, point)
        this.positions.push(point.x, point.y, point.z)
      }
      if (i > 0) {
        const a = first + i * 2
        this.indices.push(a - 2, a - 1, a, a, a - 1, a + 1)
      }
    })
    return this
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    const up = new Float32Array(this.positions.length)
    for (let i = 1; i < up.length; i += 3) up[i] = 1
    geometry.setAttribute('normal', new THREE.BufferAttribute(up, 3))
    geometry.setIndex(this.indices)
    return geometry
  }

  /* The strips as a mesh that shows from both sides. */
  mesh(material: THREE.Material): THREE.Mesh {
    material.side = THREE.DoubleSide
    return new THREE.Mesh(this.geometry(), material)
  }
}
