import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PLANK_TILE, plankMaterial, woodMaterial } from '../foliage'
import type { Structure } from '../World'
import { glow, matte, palette } from '../materials'

/* Detached rooms live far from the hub so they are never seen directly. */
const ROOM_X = 600
/* The classroom inside: how wide (x), how deep (z) and how high it is. */
const WIDTH = 9
const DEPTH = 11
const HEIGHT = 3.2
const WALL = 0.3
/* Where the door is along the back wall. */
const DOOR_X = -3
/* The windows: three in the +x wall, each this wide, from sill to head. */
const WINDOWS = [-3, 0, 3]
const WINDOW_WIDTH = 2.2
const SILL = 0.9
const HEAD = 2.5

type Vec3 = [number, number, number]

/* What is written on the blackboard, in chalk. */
function blackboard(): THREE.Texture | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#24382f'
  ctx.fillRect(0, 0, 1024, 256)
  // Old chalk that was never quite wiped off.
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.01 + 0.02 * ((i * 37) % 5)})`
    ctx.fillRect((i * 173) % 1024, (i * 59) % 256, 180, 26)
  }
  ctx.strokeStyle = ctx.fillStyle = 'rgba(240,240,230,0.9)'
  ctx.lineWidth = 3
  ctx.font = '34px "Comic Sans MS", "Segoe Print", cursive'
  ctx.fillText('Euclid, postulate 5:', 30, 50)
  ctx.font = '26px "Comic Sans MS", "Segoe Print", cursive'
  ctx.fillText('through a point not on a line', 30, 95)
  ctx.fillText('there is exactly one parallel.', 30, 130)
  ctx.font = '40px "Comic Sans MS", "Segoe Print", cursive'
  ctx.fillText('Always?', 60, 205)
  ctx.beginPath()
  ctx.ellipse(135, 192, 100, 34, -0.05, 0, Math.PI * 2)
  ctx.stroke()

  // A flat triangle, and one drawn on a sphere with its sides bowed out.
  ctx.beginPath()
  ctx.moveTo(470, 200)
  ctx.lineTo(650, 200)
  ctx.lineTo(540, 60)
  ctx.closePath()
  ctx.stroke()
  ctx.font = '24px "Comic Sans MS", "Segoe Print", cursive'
  ctx.fillText('a + b + c = 180°', 460, 238)
  ctx.beginPath()
  ctx.arc(860, 128, 105, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(800, 190)
  ctx.quadraticCurveTo(870, 215, 935, 170)
  ctx.quadraticCurveTo(925, 95, 860, 45)
  ctx.quadraticCurveTo(805, 105, 800, 190)
  ctx.stroke()
  ctx.fillText('> 180° !', 815, 135)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/*
  The classroom: a floor of boards, plastered walls, a blackboard at the
  front, sixteen desks, and three windows that look out on nothing but sky.

  Most of it is furniture that is only looked at. To keep that cheap to
  draw, everything of one material is joined into a single mesh; the boxes
  that are solid are added separately, with nothing to draw.
*/
function classroom(world: Parameters<Structure['build']>[0]) {
  const halfX = WIDTH / 2
  const halfZ = DEPTH / 2
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
  /* A box of this size with its middle here, measured from the middle of the floor. */
  const piece = (material: THREE.Material, size: Vec3, at: Vec3) => {
    const geometry = new THREE.BoxGeometry(...size).translate(...at)
    const list = parts.get(material)
    if (list) list.push(geometry)
    else parts.set(material, [geometry])
  }
  /* Something solid, measured the same way. */
  const solid = (size: Vec3, at: Vec3) => {
    world.addCollider(
      [ROOM_X + at[0] - size[0] / 2, at[1] - size[1] / 2, at[2] - size[2] / 2],
      [ROOM_X + at[0] + size[0] / 2, at[1] + size[1] / 2, at[2] + size[2] / 2],
    )
  }
  const built = (material: THREE.Material, size: Vec3, at: Vec3) => {
    piece(material, size, at)
    solid(size, at)
  }

  // One material for each colour, however many things have it.
  const paints = new Map<number, THREE.Material>()
  const paint = (colour: number) => {
    let material = paints.get(colour)
    if (!material) paints.set(colour, (material = matte(colour)))
    return material
  }
  const plaster = matte(0xd9cfb8)
  const trim = matte(0xf2efe6)
  const steel = matte(0x3a3d42)
  const desk = matte(0xb98a56)
  const seat = matte(0x2f5d73)

  // Floor and ceiling. The floor's boards are laid with the game's own box, for its tiling.
  world.addBox({
    size: [WIDTH + WALL * 2, 1, DEPTH + WALL * 2],
    position: [ROOM_X, -0.5, 0],
    material: plankMaterial(),
    tile: PLANK_TILE,
  })
  // Nothing in the world shines upwards, so the ceiling is given a light of its own.
  const ceiling = new THREE.MeshStandardMaterial({
    color: 0xf2efe6,
    emissive: 0xf2efe6,
    emissiveIntensity: 0.45,
    roughness: 0.9,
  })
  built(ceiling, [WIDTH + WALL * 2, WALL, DEPTH + WALL * 2], [0, HEIGHT + WALL / 2, 0])
  // Strip lights.
  const lamp = glow(0xfff1cf, 1.1)
  for (const x of [-2.4, 2.4]) {
    for (const z of [-3.2, 0, 3.2]) piece(lamp, [0.5, 0.05, 1.6], [x, HEIGHT - 0.025, z])
  }

  // Three plain walls, with a skirting board along each.
  built(plaster, [WIDTH + WALL * 2, HEIGHT, WALL], [0, HEIGHT / 2, -halfZ - WALL / 2])
  built(plaster, [WIDTH + WALL * 2, HEIGHT, WALL], [0, HEIGHT / 2, halfZ + WALL / 2])
  built(plaster, [WALL, HEIGHT, DEPTH], [-halfX - WALL / 2, HEIGHT / 2, 0])
  piece(desk, [WIDTH, 0.12, 0.03], [0, 0.06, -halfZ + 0.015])
  piece(desk, [WIDTH, 0.12, 0.03], [0, 0.06, halfZ - 0.015])
  piece(desk, [0.03, 0.12, DEPTH], [-halfX + 0.015, 0.06, 0])

  // The window wall: a band under the sills, a band over the heads, and
  // the piers between the windows.
  const wallX = halfX + WALL / 2
  built(plaster, [WALL, SILL, DEPTH], [wallX, SILL / 2, 0])
  built(plaster, [WALL, HEIGHT - HEAD, DEPTH], [wallX, (HEIGHT + HEAD) / 2, 0])
  const edges = [
    -halfZ,
    ...WINDOWS.flatMap((z) => [z - WINDOW_WIDTH / 2, z + WINDOW_WIDTH / 2]),
    halfZ,
  ]
  for (let i = 0; i < edges.length; i += 2) {
    const length = edges[i + 1] - edges[i]
    built(
      plaster,
      [WALL, HEAD - SILL, length],
      [wallX, (HEAD + SILL) / 2, (edges[i] + edges[i + 1]) / 2],
    )
  }
  const glass = new THREE.MeshStandardMaterial({
    color: 0xcfe6f2,
    transparent: true,
    opacity: 0.14,
    roughness: 0.1,
    depthWrite: false,
  })
  const tall = HEAD - SILL
  for (const z of WINDOWS) {
    // The glass is solid, so nobody leaves by the window.
    built(glass, [0.02, tall, WINDOW_WIDTH], [wallX, (HEAD + SILL) / 2, z])
    // A frame round the opening, one bar up the middle and one across.
    piece(trim, [WALL + 0.04, 0.07, WINDOW_WIDTH], [wallX, SILL + 0.035, z])
    piece(trim, [WALL + 0.04, 0.07, WINDOW_WIDTH], [wallX, HEAD - 0.035, z])
    for (const side of [-1, 0, 1]) {
      piece(
        trim,
        [0.06, tall, 0.06],
        [wallX, (HEAD + SILL) / 2, z + (side * (WINDOW_WIDTH - 0.06)) / 2],
      )
    }
    piece(trim, [0.06, 0.05, WINDOW_WIDTH], [wallX, SILL + tall * 0.6, z])
    // The sill, wide enough to lean on.
    piece(trim, [0.22, 0.04, WINDOW_WIDTH + 0.1], [halfX - 0.08, SILL + 0.02, z])
  }

  // The blackboard, in a wooden frame with a tray for the chalk.
  const chalk = blackboard()
  const board = new THREE.MeshStandardMaterial({
    color: chalk ? 0xffffff : 0x24382f,
    map: chalk,
    roughness: 0.9,
  })
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.2), board)
  boardMesh.position.set(ROOM_X, 1.7, -halfZ + 0.035)
  world.scene.add(boardMesh)
  piece(desk, [5, 1.4, 0.03], [0, 1.7, -halfZ + 0.015])
  piece(desk, [5, 0.04, 0.1], [0, 1.02, -halfZ + 0.05])
  // A clock over it.
  piece(trim, [0.34, 0.34, 0.04], [3.4, 2.7, -halfZ + 0.02])
  piece(steel, [0.02, 0.13, 0.01], [3.4, 2.75, -halfZ + 0.045])
  piece(steel, [0.09, 0.02, 0.01], [3.44, 2.7, -halfZ + 0.045])

  // A pinboard on the wall opposite the windows, with papers on it.
  piece(matte(0xa87c4f), [0.03, 1.1, 3], [-halfX + 0.015, 1.6, -1])
  const papers = [0xf2efe6, 0xf6d86b, 0x9fd3c7, 0xf2a7a0, 0xf2efe6, 0xb9c8f5]
  papers.forEach((colour, i) => {
    piece(
      paint(colour),
      [0.01, 0.3 + (i % 2) * 0.08, 0.22],
      [-halfX + 0.035, 1.45 + (i % 3) * 0.18, -2.2 + i * 0.47],
    )
  })
  // A bookcase at the back.
  built(desk, [1.8, 1.4, 0.35], [2.6, 0.7, halfZ - 0.175])
  const books = [0x7a2f4f, 0x1f5f7a, 0x623e84, 0xf6b26b, 0x2f5d73, 0x8a4aa0, 0x546488]
  for (let shelf = 0; shelf < 3; shelf++) {
    books.forEach((colour, i) => {
      piece(
        paint(books[(i + shelf * 2) % books.length] ?? colour),
        [0.14, 0.26 + ((i + shelf) % 3) * 0.03, 0.02],
        [1.85 + i * 0.22, 0.3 + shelf * 0.44, halfZ - 0.36],
      )
    })
  }

  /* A table on four legs, its top `height` above the floor. */
  const table = (x: number, z: number, width: number, depth: number, height: number) => {
    piece(desk, [width, 0.04, depth], [x, height - 0.02, z])
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        piece(
          steel,
          [0.03, height - 0.04, 0.03],
          [x + sx * (width / 2 - 0.04), (height - 0.04) / 2, z + sz * (depth / 2 - 0.04)],
        )
      }
    }
    solid([width, height, depth], [x, height / 2, z])
  }
  /* A chair facing the front of the room. */
  const chair = (x: number, z: number) => {
    piece(seat, [0.4, 0.04, 0.4], [x, 0.45, z])
    piece(seat, [0.4, 0.34, 0.03], [x, 0.78, z + 0.2])
    for (const sx of [-1, 1]) {
      piece(steel, [0.03, 0.43, 0.03], [x + sx * 0.17, 0.215, z - 0.17])
      piece(steel, [0.03, 0.95, 0.03], [x + sx * 0.17, 0.475, z + 0.2])
    }
    solid([0.4, 0.95, 0.44], [x, 0.475, z + 0.01])
  }

  // Sixteen desks in four rows, each with its chair behind it.
  for (const x of [-2.7, -0.9, 0.9, 2.7]) {
    for (const z of [-2.2, -0.6, 1, 2.6]) {
      table(x, z, 0.65, 0.45, 0.74)
      chair(x, z + 0.48)
    }
  }
  // The teacher's desk, with a globe on it.
  table(-2.2, -4.1, 1.6, 0.7, 0.78)
  piece(steel, [0.16, 0.03, 0.16], [-2.7, 0.795, -4.1])
  piece(steel, [0.02, 0.14, 0.02], [-2.7, 0.87, -4.1])

  const furniture = new THREE.Group()
  furniture.position.set(ROOM_X, 0, 0)
  for (const [material, geometries] of parts) {
    furniture.add(new THREE.Mesh(mergeGeometries(geometries), material))
  }
  world.scene.add(furniture)

  // The globe turns, slowly.
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x3f7fb0, roughness: 0.6, emissive: 0x16324a }),
  )
  globe.position.set(ROOM_X - 2.7, 1.08, -4.1)
  world.scene.add(globe)
  world.onUpdate((_dt, time) => {
    globe.rotation.y = time * 0.3
  })

  world.addItem({ position: [ROOM_X - 1, 0.18, 4.3], material: glow(palette.cyan, 1.2) })
}

/*
  A booth two metres across whose door opens onto a classroom far too large
  to fit inside it. Walk around the booth, then walk in.
*/
export function biggerInside(onEnter: () => void): Structure {
  return {
    name: 'bigger-inside',
    build(world) {
      // The booth: a solid block with a door on its front face.
      world.addBox({ size: [2, 2.8, 2], position: [0, 1.4, -8.1], overgrown: true })
      world.addRoof([0, -8.1], 2.8, 2, 2)
      // A light on the top of the roof, so the booth can be found from far off.
      world.addBox({
        size: [0.3, 0.3, 0.3],
        position: [0, 3.43, -8.1],
        material: glow(palette.purple, 0.8),
        collide: false,
      })
      const outside = world.addDoor({
        name: 'booth',
        position: [0, 0, -7],
        facing: 0,
        overgrown: true,
      })

      classroom(world)

      const inside = world.addDoor({
        name: 'hall',
        position: [ROOM_X + DOOR_X, 0, DEPTH / 2 - 0.16],
        facing: 2,
        frameMaterial: woodMaterial(),
      })
      world.link(outside, inside)
      outside.onTraverse = onEnter
    },
  }
}
