import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/*
  What makes a doorway look old and overgrown.

  It is pieced together, since no single asset has all of it:

    wood     "Rough Wood" texture, Poly Haven, CC0 (Rob Tuytel)
    ferns    "Fern 02" model, Poly Haven, CC0 (Rob Tuytel, Rico Cilliers)
    sorrel   "Shrub Sorrel 01" model, Poly Haven, CC0 (Rico Cilliers)
    ivy      "Ivy" model by dangry, Sketchfab, CC Attribution, hung in
             curtains along the top, from the corners and down the posts

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

/* False outside a browser, where there are no models to load and nothing is drawn. */
function canLoadModels(): boolean {
  return typeof document !== 'undefined' && typeof document.createElementNS === 'function'
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
  One curtain of ivy, hung by the middle of its top edge. It hangs `drop`
  below that point and stands out of the front of the door.
*/
export interface Drape {
  x: number
  y: number
  z: number
  width: number
  drop: number
  /* A turn about the vertical, so no two curtains line up. */
  turn: number
  mirrored: boolean
}

/* How far a curtain hangs, for each metre of its width, when it is not stretched. */
const IVY_DROP = 1.18

/*
  Where ivy hangs on a doorway, in the door's own frame: x across the
  opening, y up from the threshold, z out of the front. Short curtains hang
  along the top and a little way into the opening; a long one hangs from
  each top corner; more hang one below another down each post to the ground.
*/
export function ivyDrapes({ name, width, height, post }: Doorway): Drape[] {
  const random = seeded(name)
  const between = (a: number, b: number) => a + (b - a) * random()
  const half = width / 2
  const top = height + post
  const drapes: Drape[] = []
  /* `stretch` pulls a curtain longer than it is made, to trail down a post. */
  const hang = (x: number, y: number, size: number, stretch = 1) => {
    drapes.push({
      x,
      y,
      z: between(0, 0.03),
      width: size,
      drop: Math.min(size * IVY_DROP * stretch, y),
      turn: between(-0.25, 0.25),
      mirrored: random() < 0.5,
    })
  }
  // Beside the opening, a curtain keeps this far out, so the way through stays clear.
  const beside = (size: number) =>
    Math.max(half + post / 2 + between(0, 0.08), half * 0.7 + size / 2)

  // Along the top. These are short, so they only fringe the opening.
  const across = Math.max(2, Math.round((width + post * 2) / 0.32))
  for (let i = 0; i < across; i++) {
    const x = -half - post + ((i + between(0.3, 0.7)) / across) * (width + post * 2)
    hang(x, top + between(0, 0.04), Math.min(between(0.32, 0.44), height * 0.2))
  }

  for (const side of [-1, 1]) {
    // From each top corner.
    const corner = between(0.55, 0.7)
    hang(side * beside(corner), top + between(0, 0.04), corner, between(1.2, 1.5))

    // Down the post, each curtain starting well inside the one above.
    for (let y = top - between(0.25, 0.4); y > 0.35; y -= between(0.28, 0.42)) {
      const size = between(0.4, 0.54)
      hang(side * beside(size), y, size, between(1.3, 1.8))
    }
  }
  return drapes
}

interface IvyModel {
  /* One geometry for each material, a metre wide, hung from the origin. */
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[]
}

let ivyModel: Promise<IvyModel> | undefined

/*
  The ivy curtain: "Ivy" by dangry, from Sketchfab
  (sketchfab.com/3d-models/ivy-d8991bd2a8c84e96b15a721a833bd4c3), licensed
  CC Attribution. It is re-based here to hang from the origin, one metre
  wide, with its back at z = 0.
*/
function loadIvy(): Promise<IvyModel> {
  ivyModel ??= loader.loadAsync(assets('models/ivy/ivy.glb')).then((gltf) => {
    gltf.scene.updateMatrixWorld(true)
    const parts: IvyModel['parts'] = []
    const bounds = new THREE.Box3()
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
      geometry.computeBoundingBox()
      bounds.union(geometry.boundingBox!)
      const material = mesh.material as THREE.MeshStandardMaterial
      // Cut the leaves out rather than blend them, so they hide what is behind.
      material.transparent = false
      material.alphaTest = 0.4
      material.depthWrite = true
      material.roughness = 0.75
      // The leaves are photographed dark; lift them to sit with the ferns.
      material.color.setScalar(1.6)
      parts.push({ geometry, material })
    })
    const size = 1 / (bounds.max.x - bounds.min.x)
    const rebase = new THREE.Matrix4()
      .makeScale(size, size, size)
      .multiply(
        new THREE.Matrix4().makeTranslation(
          -(bounds.min.x + bounds.max.x) / 2,
          -bounds.max.y,
          -bounds.min.z,
        ),
      )
    for (const part of parts) part.geometry.applyMatrix4(rebase)
    return { parts }
  })
  return ivyModel
}

/* A copy of a geometry, hung where a drape is. */
function hung(geometry: THREE.BufferGeometry, drape: Drape): THREE.BufferGeometry {
  const copy = geometry.clone()
  if (drape.mirrored) {
    copy.scale(-1, 1, 1)
    // Mirroring turns every triangle inside out; turn them back.
    const index = copy.getIndex()!
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i)
      index.setX(i, index.getX(i + 2))
      index.setX(i + 2, a)
    }
  }
  copy.rotateY(drape.turn)
  // Turning swings one edge backwards; keep the whole curtain in front of the frame.
  copy.computeBoundingBox()
  const back = Math.min(0, copy.boundingBox!.min.z)
  copy.translate(0, 0, -back)
  copy.scale(drape.width, drape.drop / IVY_DROP, drape.width)
  copy.translate(drape.x, drape.y, drape.z)
  return copy
}

/*
  Ivy for a doorway, as a group in the door's own frame. The model arrives
  later than the door is built; the group is filled when it does.
*/
export function ivy(doorway: Doorway): THREE.Group {
  const group = new THREE.Group()
  const drapes = ivyDrapes(doorway)
  if (!canLoadModels()) return group
  void loadIvy().then(({ parts }) => {
    for (const { geometry, material } of parts) {
      const mesh = new THREE.Mesh(
        mergeGeometries(drapes.map((drape) => hung(geometry, drape))),
        material,
      )
      // The stored bounds are not where a mesh on the planet is drawn.
      mesh.frustumCulled = false
      group.add(mesh)
    }
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
