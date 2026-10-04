import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/*
  What makes a doorway look old and overgrown.

  It is pieced together, since no single asset has all of it:

    wood     "Rough Wood" texture, Poly Haven, CC0 (Rob Tuytel)
    ferns    "Fern 02" model, Poly Haven, CC0 (Rob Tuytel, Rico Cilliers)
    sorrel   "Shrub Sorrel 01" model, Poly Haven, CC0 (Rico Cilliers)
    planks   "Old Planks 02" texture, Poly Haven, CC0 (Rob Tuytel)
    ivy      photographed leaves from "Leaf Set 017", ambientCG, CC0, set
             on stems that are grown here: up the posts, along the top and
             hanging down into the opening

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
  wood = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.95 })
  if (canLoadImages()) {
    wood.color.set(0xffffff)
    wood.map = load('diffuse.jpg', true)
    wood.normalMap = load('normal.jpg', false)
  }
  return wood
}

let planks: THREE.MeshStandardMaterial | undefined

/* A wall of old upright boards. One copy of the texture covers 2 m. */
export const PLANK_TILE = 2
export function plankMaterial(): THREE.MeshStandardMaterial {
  if (planks) return planks
  planks = new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.95 })
  if (canLoadImages()) {
    const load = (file: string, colour: boolean) => {
      const texture = new THREE.TextureLoader().load(assets(`textures/old_planks_02/${file}`))
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.anisotropy = 8
      if (colour) texture.colorSpace = THREE.SRGBColorSpace
      return texture
    }
    planks.color.set(0xffffff)
    planks.map = load('diffuse.jpg', true)
    planks.normalMap = load('normal.jpg', false)
  }
  return planks
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

/* Start loading everything in this file that comes from a file. The results are kept. */
export function preloadFoliage() {
  woodMaterial()
  plankMaterial()
  ivyLeafMaterial()
  void plants('fern_02')
  void plants('shrub_sorrel_01')
}

/* Where one plant from a model file stands, in the frame of the group it grows in. */
interface PlantSpot {
  model: string
  at: THREE.Vector3
  size: number
  /* Which version of the plant, from 0 to 1. */
  pick: number
  turn: number
}

/*
  Add plants to a group once their models have arrived. They are joined
  into one mesh for each material, since every mesh is a draw in every view
  of the world, and a doorway has a dozen plants each made of several.
*/
function plantAll(group: THREE.Group, spots: readonly PlantSpot[]) {
  if (!canLoadImages() || spots.length === 0) return
  void Promise.all(spots.map((spot) => plants(spot.model))).then((loaded) => {
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
    loaded.forEach((versions, i) => {
      const spot = spots[i]
      const plant = versions[Math.floor(spot.pick * versions.length)].clone()
      plant.position.copy(spot.at)
      plant.rotation.y = spot.turn
      plant.scale.setScalar(spot.size)
      plant.updateMatrixWorld(true)
      plant.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh || Array.isArray(mesh.material)) return
        const list = parts.get(mesh.material) ?? []
        list.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld))
        parts.set(mesh.material, list)
      })
    })

    for (const [material, geometries] of parts) {
      // Parts that cannot be joined are added as they are.
      const merged = mergeGeometries(geometries)
      for (const geometry of merged ? [merged] : geometries) {
        const mesh = new THREE.Mesh(geometry, material)
        // The stored bounds are not where a mesh on the planet is drawn.
        mesh.frustumCulled = false
        group.add(mesh)
      }

      if (merged) for (const geometry of geometries) geometry.dispose()
    }
  })
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

/*
  Where each of the six leaves is on the ivy leaf image, as [left, top,
  right, bottom] in pixels of the 1024 square. Every leaf has its stalk at
  the bottom and its tip at the top.
*/
const LEAF_CELLS = [
  [45, 12, 395, 335],
  [630, 50, 900, 325],
  [60, 375, 420, 695],
  [635, 400, 935, 655],
  [40, 705, 445, 1012],
  [600, 705, 925, 1005],
]
const ATLAS = 1024

const turn = new THREE.Quaternion()
const lean = new THREE.Euler()
const corner = new THREE.Vector3()

interface Growth {
  /* Carries what is grown from the frame it is worked out in to where it goes. */
  place: THREE.Matrix4
  leaves: number[]
  uvs: number[]
  colours: number[]
  stems: THREE.BufferGeometry[]
}

/*
  One leaf at a point: a flat card showing one of the photographed leaves,
  stalk at the point, roughly flat against the door's front, turned and
  tipped at random. `size` is its length from stalk to tip.
*/
function addLeaf(
  growth: Growth,
  at: THREE.Vector3,
  size: number,
  random: () => number,
  shade: number,
) {
  const [left, top, right, bottom] = LEAF_CELLS[Math.floor(random() * LEAF_CELLS.length)]
  const half = (size * (right - left)) / (bottom - top) / 2
  lean.set((random() - 0.5) * 1.3, (random() - 0.5) * 1.3, random() * Math.PI * 2)
  turn.setFromEuler(lean)
  // Each leaf is a little lighter or darker than the next.
  const light = shade * (0.8 + random() * 0.35)

  // Two triangles. Image rows count down from the top; v counts up from the bottom.
  const card = [
    [-half, 0, left, bottom],
    [half, 0, right, bottom],
    [half, size, right, top],
    [-half, size, left, top],
  ]
  for (const index of [0, 1, 2, 0, 2, 3]) {
    const [x, y, px, py] = card[index]
    corner.set(x, y, 0).applyQuaternion(turn).add(at).applyMatrix4(growth.place)
    growth.leaves.push(corner.x, corner.y, corner.z)
    growth.uvs.push(px / ATLAS, 1 - py / ATLAS)
    // The photographs are pale; bring them towards a deeper green.
    growth.colours.push(light * 0.82, light, light * 0.7)
  }
}

/* False outside a browser, where there are no images to load and nothing is drawn. */
function canLoadImages(): boolean {
  return typeof document !== 'undefined' && typeof document.createElementNS === 'function'
}

let leafMaterial: THREE.MeshStandardMaterial | undefined
let stemMaterial: THREE.MeshStandardMaterial | undefined

/* Photographed ivy leaves: "Leaf Set 017" from ambientCG, CC0. */
function ivyLeafMaterial(): THREE.MeshStandardMaterial {
  if (leafMaterial) return leafMaterial
  leafMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.7,
  })
  if (canLoadImages()) {
    const load = (file: string) =>
      new THREE.TextureLoader().load(assets(`textures/ivy_leaves/${file}`))
    leafMaterial.map = load('colour.jpg')
    leafMaterial.map.colorSpace = THREE.SRGBColorSpace
    leafMaterial.map.anisotropy = 8
    leafMaterial.alphaMap = load('opacity.jpg')
    leafMaterial.normalMap = load('normal.jpg')
    // Cut the leaf's outline out of its card.
    leafMaterial.alphaTest = 0.5
  }
  return leafMaterial
}

/* Woody stems, using the same aged timber as the frame. */
function ivyStemMaterial(): THREE.MeshStandardMaterial {
  if (stemMaterial) return stemMaterial
  stemMaterial = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1 })
  if (canLoadImages()) {
    const bark = woodMaterial().map!.clone()
    // A tube's UVs run 0 to 1 along it and round it.
    bark.repeat.set(6, 1)
    bark.needsUpdate = true
    stemMaterial.map = bark
  }
  return stemMaterial
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
  growth.stems.push(
    new THREE.TubeGeometry(curve, Math.max(4, Math.ceil(length / 0.08)), 0.008, 6).applyMatrix4(
      growth.place,
    ),
  )
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
  const growth: Growth = {
    place: new THREE.Matrix4(),
    leaves: [],
    uvs: [],
    colours: [],
    stems: [],
  }
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

  return grown(growth)
}

/* The leaves and stems of a growth, as two meshes in one group. */
function grown(growth: Growth): THREE.Group {
  const group = new THREE.Group()
  if (growth.stems.length === 0) return group
  const leafGeometry = new THREE.BufferGeometry()
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(growth.leaves, 3))
  leafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(growth.uvs, 2))
  leafGeometry.setAttribute('color', new THREE.Float32BufferAttribute(growth.colours, 3))
  leafGeometry.computeVertexNormals()
  const leaves = new THREE.Mesh(leafGeometry, ivyLeafMaterial())
  const stems = new THREE.Mesh(mergeGeometries(growth.stems), ivyStemMaterial())
  group.add(stems, leaves)
  return group
}

/* A wall narrower than this grows nothing; one at least `PLANTED` wide has plants at its foot. */
const BARE = 0.5
const PLANTED = 2
/* Ivy climbs no higher than this. */
const CLIMB = 4.5

/*
  Ivy and plants for an upright box, in the box's own frame: the origin is
  the middle of its base. Ivy climbs each of the four sides from the ground,
  thick at the foot, and ferns and sorrel grow at the foot of the wide
  sides. All of a box's ivy is two meshes, however many sides it has.
*/
export function wallGrowth(name: string, size: readonly [number, number, number]): THREE.Group {
  const random = seeded(name)
  const between = (a: number, b: number) => a + (b - a) * random()
  const [width, height, depth] = size
  const growth: Growth = {
    place: new THREE.Matrix4(),
    leaves: [],
    uvs: [],
    colours: [],
    stems: [],
  }
  const spots: PlantSpot[] = []
  const front = 0.012

  // The four sides: how far the side is from the middle, how wide it is, and its turn.
  const sides = [
    [depth / 2, width, 0],
    [width / 2, depth, Math.PI / 2],
    [depth / 2, width, Math.PI],
    [width / 2, depth, -Math.PI / 2],
  ]
  for (const [out, across, turned] of sides) {
    if (across < BARE) continue
    // Side frame: x across the side, y up, z out of it.
    growth.place.makeRotationY(turned).multiply(new THREE.Matrix4().makeTranslation(0, 0, out))
    const half = across / 2
    const strands = Math.max(2, Math.round(across * between(1.6, 2.4)))
    for (let strand = 0; strand < strands; strand++) {
      const reach = Math.min(CLIMB, height) * between(0.3, 1)
      let x = between(-half + 0.05, half - 0.05)
      const points: THREE.Vector3[] = []
      for (let y = 0; y <= reach; y += 0.22) {
        points.push(new THREE.Vector3(x, y, front + random() * 0.01))
        x = Math.max(-half + 0.03, Math.min(half - 0.03, x + between(-0.09, 0.09)))
      }
      if (points.length < 2) continue
      addVine(growth, points, random, { spacing: 0.04, leaf: 0.095, spread: 0.1 })

      // Thick where it comes out of the ground.
      const foot = new THREE.Vector3()
      for (let i = 0; i < 16; i++) {
        foot.set(
          Math.max(-half, Math.min(half, points[0].x + between(-0.25, 0.25))),
          Math.abs(between(-0.02, 0.4)) * (1 - random() * random()),
          front + between(0, 0.14),
        )
        addLeaf(growth, foot, between(0.06, 0.11), random, between(0.75, 1))
      }
    }

    if (across < PLANTED) continue
    const plantCount = Math.round(across / 1.3)
    for (let i = 0; i < plantCount; i++) {
      const fern = random() < 0.4
      spots.push({
        model: fern ? 'fern_02' : 'shrub_sorrel_01',
        at: new THREE.Vector3(between(-half, half), 0, between(0.12, 0.4)).applyMatrix4(
          growth.place,
        ),
        size: fern ? between(0.4, 0.75) : between(2.8, 4.5),
        pick: random(),
        turn: between(0, Math.PI * 2),
      })
    }
  }

  const group = grown(growth)
  plantAll(group, spots)
  group.traverse((object) => {
    object.frustumCulled = false
  })
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
    .map(({ model, x, z, size }) => ({
      model,
      at: new THREE.Vector3(x, 0, z),
      size,
      pick: random(),
      turn: between(0, Math.PI * 2),
    }))

  plantAll(group, spots)
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
