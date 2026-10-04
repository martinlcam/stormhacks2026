import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/*
  What makes a doorway look old and overgrown.

  It is pieced together, since no single asset has all of it:

    wood     "Rough Wood" texture, Poly Haven, CC0 (Rob Tuytel)
    ferns    "Fern 02" model, Poly Haven, CC0 (Rob Tuytel, Rico Cilliers)
    sorrel   "Shrub Sorrel 01" model, Poly Haven, CC0 (Rico Cilliers)
    ivy      made here: stems that climb the posts, run along the top and
             hang down into the opening, with a leaf every few centimetres

  The files are in public/textures and public/models.
*/

const assets = (path: string) => `${import.meta.env.BASE_URL}${path}`

let wood: THREE.MeshStandardMaterial | undefined

/* Aged timber. One copy of the texture covers half a metre. */
export const WOOD_TILE = 0.5
export function woodMaterial(): THREE.MeshStandardMaterial {
  if (wood) return wood
  const load = (file: string, colour: boolean) => {
    const texture = new THREE.TextureLoader().load(assets(`textures/rough_wood/${file}`))
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = 8
    if (colour) texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }
  wood = new THREE.MeshStandardMaterial({
    map: load('diffuse.jpg', true),
    normalMap: load('normal.jpg', false),
    roughness: 0.95,
  })
  return wood
}

const loader = new GLTFLoader()
const models = new Map<string, Promise<THREE.Object3D[]>>()

/*
  The plants in a model file. Each file holds several versions of the plant
  side by side; they are returned separately, each standing at its own origin.
*/
function plants(name: string): Promise<THREE.Object3D[]> {
  let loading = models.get(name)
  if (!loading) {
    loading = loader.loadAsync(assets(`models/${name}/${name}.gltf`)).then((gltf) =>
      gltf.scene.children.map((plant) => {
        plant.position.set(0, 0, 0)
        return plant
      }),
    )
    models.set(name, loading)
  }
  return loading
}

/* A repeatable stream of numbers from 0 to 1, so a door always grows the same way. */
function seeded(text: string): () => number {
  let state = 2166136261
  for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 16777619)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LEAF_GREENS = [0x2f6b2a, 0x3f8a33, 0x57a53c, 0x79c24e, 0x4a7a2c]

/* An ivy leaf lying in the XY plane, stalk at the origin, tip towards +Y, one unit long. */
const LEAF_OUTLINE = [
  [0, 0],
  [0.34, 0.16],
  [0.46, 0.5],
  [0.2, 0.62],
  [0, 1],
  [-0.2, 0.62],
  [-0.46, 0.5],
  [-0.34, 0.16],
]

const turn = new THREE.Quaternion()
const lean = new THREE.Euler()
const corner = new THREE.Vector3()
const tint = new THREE.Color()

interface Growth {
  leaves: number[]
  colours: number[]
  stems: THREE.BufferGeometry[]
}

/* One leaf at a point, roughly flat against the door's front, turned and tipped at random. */
function addLeaf(
  growth: Growth,
  at: THREE.Vector3,
  size: number,
  random: () => number,
  shade: number,
) {
  // Mostly flat against the door's front, each one turned its own way.
  lean.set((random() - 0.5) * 1.3, (random() - 0.5) * 1.3, random() * Math.PI * 2)
  turn.setFromEuler(lean)
  tint.setHex(LEAF_GREENS[Math.floor(random() * LEAF_GREENS.length)]).multiplyScalar(shade)
  for (let i = 1; i < LEAF_OUTLINE.length - 1; i++) {
    for (const index of [0, i, i + 1]) {
      const [x, y] = LEAF_OUTLINE[index]
      corner
        .set(x * size, y * size, 0)
        .applyQuaternion(turn)
        .add(at)
      growth.leaves.push(corner.x, corner.y, corner.z)
      growth.colours.push(tint.r, tint.g, tint.b)
    }
  }
}

/* A stem through some points, with leaves along it. */
function addVine(
  growth: Growth,
  points: THREE.Vector3[],
  random: () => number,
  options: { spacing: number; leaf: number; spread: number; shade?: number },
) {
  const curve = new THREE.CatmullRomCurve3(points)
  const length = curve.getLength()
  growth.stems.push(new THREE.TubeGeometry(curve, Math.max(4, Math.ceil(length / 0.08)), 0.006, 5))
  const count = Math.max(2, Math.floor(length / options.spacing))
  const at = new THREE.Vector3()
  for (let i = 0; i <= count; i++) {
    curve.getPointAt(Math.min(1, (i + random() * 0.6) / count), at)
    at.x += (random() - 0.5) * options.spread
    at.y += (random() - 0.5) * options.spread
    at.z += random() * 0.03
    addLeaf(growth, at, options.leaf * (0.6 + random() * 0.7), random, options.shade ?? 1)
  }
}

export interface Doorway {
  /* Names the door, and so fixes how its ivy grows. */
  name: string
  /* The opening, and how wide the posts round it are, before `scale`. */
  width: number
  height: number
  post: number
}

/*
  Ivy for a doorway, in the door's own frame: x across the opening, y up
  from the threshold, z out of the front. It climbs both posts, thickest at
  the foot and at the top corners, runs along the top, and hangs down into
  the opening in strands.
*/
export function ivy({ name, width, height, post }: Doorway): THREE.Group {
  const random = seeded(name)
  const growth: Growth = { leaves: [], colours: [], stems: [] }
  const half = width / 2
  const front = 0.012
  const between = (a: number, b: number) => a + (b - a) * random()

  // Up each post, wandering across its face, and round onto the top.
  for (const side of [-1, 1]) {
    for (let strand = 0; strand < 3; strand++) {
      const reach = strand === 0 ? height + post * 0.6 : between(height * 0.35, height * 0.95)
      const points: THREE.Vector3[] = []
      for (let y = 0; y <= reach; y += 0.22) {
        const x = side * (half + between(0.01, post - 0.01))
        points.push(new THREE.Vector3(x, y, front + random() * 0.01))
      }
      if (strand === 0) {
        // The longest strand turns the corner and creeps along the top.
        const along = between(width * 0.25, width * 0.6)
        for (let x = half; x >= half - along; x -= 0.2) {
          points.push(new THREE.Vector3(side * x, height + between(0.02, post - 0.02), front))
        }
      }
      addVine(growth, points, random, { spacing: 0.05, leaf: 0.085, spread: 0.07 })
    }

    // Thick at the foot of each post, spilling onto the ground and outwards.
    const foot = new THREE.Vector3()
    for (let i = 0; i < 46; i++) {
      foot.set(
        side * (half + between(-0.06, post + 0.22)),
        Math.abs(between(-0.02, 0.42)) * (1 - random() * random()),
        front + between(0, 0.16),
      )
      addLeaf(growth, foot, between(0.06, 0.11), random, between(0.75, 1))
    }

    // And thick in each top corner.
    const top = new THREE.Vector3()
    for (let i = 0; i < 34; i++) {
      top.set(
        side * (half + between(-0.18, post + 0.05)),
        height + between(-0.2, post + 0.08),
        front + between(0, 0.07),
      )
      addLeaf(growth, top, between(0.06, 0.1), random, 1)
    }
  }

  // Along the top, with strands hanging down into the opening.
  const lintel: THREE.Vector3[] = []
  for (let x = -half - post; x <= half + post + 0.001; x += 0.2) {
    lintel.push(new THREE.Vector3(x, height + between(0.03, post - 0.02), front))
  }
  addVine(growth, lintel, random, { spacing: 0.04, leaf: 0.09, spread: 0.1 })

  const strands = 5 + Math.floor(random() * 3)
  for (let i = 0; i < strands; i++) {
    const x = between(-half, half)
    // Longest near the corners, shortest in the middle, so the way through stays clear.
    const drop = between(0.12, 0.3) + 0.5 * Math.abs(x / half) ** 2 * random()
    const sway = between(-0.05, 0.05)
    const points = [0, 0.35, 0.7, 1].map(
      (t) =>
        new THREE.Vector3(
          x + sway * t * t,
          height + post * 0.4 - (drop + post * 0.4) * t,
          front + 0.02,
        ),
    )
    addVine(growth, points, random, { spacing: 0.055, leaf: 0.075, spread: 0.035 })
  }

  const leafGeometry = new THREE.BufferGeometry()
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(growth.leaves, 3))
  leafGeometry.setAttribute('color', new THREE.Float32BufferAttribute(growth.colours, 3))
  leafGeometry.computeVertexNormals()
  const leaves = new THREE.Mesh(
    leafGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }),
  )
  const stems = new THREE.Mesh(
    mergeGeometries(growth.stems),
    new THREE.MeshStandardMaterial({ color: 0x3d3220, roughness: 1 }),
  )
  const group = new THREE.Group()
  group.add(stems, leaves)
  return group
}

/*
  Ferns and sorrel round the foot of a doorway, in the door's own frame. The
  models arrive later than the door is built; they are added when they do.
*/
function undergrowth(group: THREE.Group, { name, width, post }: Doorway) {
  const random = seeded(`${name}/undergrowth`)
  const half = width / 2
  const between = (a: number, b: number) => a + (b - a) * random()
  // Decide everything now, so the result does not depend on loading order.
  const spots = [-1, 1]
    .flatMap((side) => [
      {
        model: 'fern_02',
        x: side * (half + post + between(0.05, 0.3)),
        z: between(0.1, 0.3),
        size: between(0.55, 0.8),
      },
      {
        model: 'fern_02',
        x: side * (half + between(-0.05, 0.12)),
        z: between(0.25, 0.45),
        size: between(0.35, 0.5),
      },
      {
        model: 'shrub_sorrel_01',
        x: side * (half + between(0, 0.25)),
        z: between(0.12, 0.4),
        size: between(3, 4.5),
      },
      {
        model: 'shrub_sorrel_01',
        x: side * (half + post + between(0, 0.3)),
        z: between(0.05, 0.3),
        size: between(3, 4.5),
      },
      {
        model: 'shrub_sorrel_01',
        x: side * between(0.15, half),
        z: between(0.3, 0.5),
        size: between(2.5, 3.5),
      },
    ])
    .map((spot) => ({ ...spot, pick: random(), turn: between(0, Math.PI * 2) }))

  for (const spot of spots) {
    void plants(spot.model).then((versions) => {
      const plant = versions[Math.floor(spot.pick * versions.length)].clone()
      plant.position.set(spot.x, 0, spot.z)
      plant.rotation.y = spot.turn
      plant.scale.setScalar(spot.size)
      // The stored bounds are not where a mesh on the planet is drawn.
      plant.traverse((object) => {
        object.frustumCulled = false
      })
      group.add(plant)
    })
  }
}

/*
  Everything that grows on a doorway, as one group in the door's own frame.
  The caller places it where the door is.
*/
export function overgrowth(doorway: Doorway): THREE.Group {
  const group = ivy(doorway)
  undergrowth(group, doorway)
  group.traverse((object) => {
    object.frustumCulled = false
  })
  return group
}
