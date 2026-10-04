import * as THREE from 'three'
import type { Structure } from '../World'
import { glow, matte, palette } from '../materials'

/* Where the table stands in the plaza. */
const X = -5
const Z = -0.5
/* How high its top is, and how wide across the picture on it is, in metres. */
const TOP = 0.9
const RADIUS = 1.25
/* The tiles: this many sides each, and this many of them round every corner. */
const SIDES = 5
const MEETING = 4
/* How near the table the player must be for the picture to follow them. */
const NEAR = 5
/* How far towards the rim the middle of the picture is pushed, out of 1. */
const LEAN = 0.72
/* How far each bead goes from the middle before turning back, as a distance in the plane itself. */
const SWING = 3.6
/* How fast the beads go, by the same measure, a second. */
const PACE = 0.9

/*
  One side of the tile that the middle of the picture is in. In the picture
  a straight line is an arc of a circle that meets the rim squarely: this
  one has its centre at (CENTRE, 0) and radius REACH.
*/
const REACH = Math.sqrt(
  Math.sin(Math.PI / SIDES) ** 2 /
    (Math.cos(Math.PI / MEETING) ** 2 - Math.sin(Math.PI / SIDES) ** 2),
)
const CENTRE = (REACH * Math.cos(Math.PI / MEETING)) / Math.sin(Math.PI / SIDES)

/*
  Slide the whole plane so that its middle goes to `by`, as seen in the
  picture. It is the plane's version of a step sideways: nothing in the
  plane changes shape or size, though everything in the picture does.
*/
export function slide(point: THREE.Vector2, by: THREE.Vector2, out = new THREE.Vector2()) {
  // (z + a) / (1 + ā z), with points as complex numbers.
  const realTop = point.x + by.x
  const imagTop = point.y + by.y
  const realUnder = 1 + by.x * point.x + by.y * point.y
  const imagUnder = by.x * point.y - by.y * point.x
  const size = realUnder * realUnder + imagUnder * imagUnder
  return out.set(
    (realTop * realUnder + imagTop * imagUnder) / size,
    (imagTop * realUnder - realTop * imagUnder) / size,
  )
}

/* How far from the middle of the picture a point is drawn that is `distance` away in the plane. */
export function drawnAt(distance: number): number {
  return Math.tanh(distance / 2)
}

const TILES = /* glsl */ `
uniform vec2 uDiskSlide;

// The colour of the tiling at a point of the picture, which is a disk of radius 1.
vec3 diskTiles(vec2 z) {
  vec3 light = vec3(${new THREE.Color(palette.bone).toArray().join(', ')});
  vec3 dark = vec3(${new THREE.Color(palette.purple).multiplyScalar(0.55).toArray().join(', ')});
  float rim = dot(z, z);
  if (rim >= 1.0) return vec3(0.02);
  // Slide the plane, so that the tiles nearest whoever is looking come to the middle.
  vec2 under = vec2(1.0 + dot(uDiskSlide, z), uDiskSlide.x * z.y - uDiskSlide.y * z.x);
  vec2 top = z + uDiskSlide;
  z = vec2(top.x * under.x + top.y * under.y, top.y * under.x - top.x * under.y) / dot(under, under);

  // Fold the point into one slice of the middle tile, by mirrors: the two
  // straight edges of the slice, and the side of the tile. Each time it is
  // turned back across a side it has come in by one tile.
  vec2 mirror = vec2(-sin(PI / ${SIDES}.0), cos(PI / ${SIDES}.0));
  vec2 centre = vec2(${CENTRE}, 0.0);
  float reach = ${REACH * REACH};
  float tiles = 0.0;
  for (int i = 0; i < 48; i++) {
    z.y = abs(z.y);
    float over = dot(z, mirror);
    if (over > 0.0) z -= 2.0 * over * mirror;
    vec2 from = z - centre;
    float away = dot(from, from);
    if (away < reach) {
      z = centre + from * reach / away;
      tiles += 1.0;
    }
  }
  vec3 colour = mod(tiles, 2.0) < 0.5 ? light : dark;
  // A line along the side of every tile.
  float side = abs(length(z - centre) - sqrt(reach));
  colour = mix(vec3(0.03), colour, smoothstep(0.012, 0.03, side));
  // By the rim the tiles are too small to draw: let them run together.
  return mix(colour, mix(light, dark, 0.5), smoothstep(0.93, 0.995, rim));
}
`

/* The picture on the table top: it is worked out for every pixel, so it can move. */
function tiling(slideBy: { value: THREE.Vector2 }): THREE.MeshStandardMaterial {
  // Only there so that the shader is given the top's coordinates.
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  blank.needsUpdate = true
  const material = new THREE.MeshStandardMaterial({ map: blank, roughness: 0.6 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDiskSlide = slideBy
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TILES}`)
      .replace(
        '#include <map_fragment>',
        'vec3 diskColour = diskTiles((vMapUv - 0.5) * 2.0);\ndiffuseColor.rgb *= diskColour;',
      )
      // It glows a little, to be seen at night.
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diskColour * 0.3;',
      )
  }
  material.customProgramCacheKey = () => 'disk-table'
  return material
}

const target = new THREE.Vector2()
const placed = new THREE.Vector2()

/*
  A table with the hyperbolic plane on it, as Poincaré drew it: the whole
  endless plane inside a circle. It is tiled with five-sided tiles, four to
  a corner, all the same size; the picture draws them smaller the nearer
  they are to the rim. Beads cross it at a steady pace and are seen to
  shrink and slow as they go out, and never reach the edge.

  The picture follows the player. The tiles on their side of the table are
  slid to the middle, so walking round it brings every part of the rim out
  to full size in turn.
*/
export function diskTable(onFind: () => void): Structure {
  return {
    name: 'disk table',
    build(world) {
      const stone = matte(palette.stone)
      world.addBox({
        size: [0.5, TOP - 0.1, 0.5],
        position: [X, (TOP - 0.1) / 2, Z],
        material: stone,
        collide: false,
      })
      const slab = new THREE.Mesh(
        new THREE.CylinderGeometry(RADIUS + 0.1, RADIUS + 0.1, 0.1, 48),
        stone,
      )
      slab.position.set(X, TOP - 0.05, Z)
      world.add(slab)
      const reach = RADIUS * 0.8
      world.addCollider([X - reach, 0, Z - reach], [X + reach, TOP, Z + reach])

      const slideBy = { value: new THREE.Vector2() }
      // Laid flat, the picture's x is the map's x and its y is the map's -z.
      const top = new THREE.Mesh(
        new THREE.CircleGeometry(RADIUS, 64).rotateX(-Math.PI / 2),
        tiling(slideBy),
      )
      top.position.set(X, TOP + 0.005, Z)
      world.add(top)

      // Three beads, each going straight out from the middle of the plane and back.
      const beads = [0.3, 2.4, 4.5].map((angle, i) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), glow(palette.cyan, 1.6))
        world.add(mesh)
        return { mesh, angle, phase: i * 2.7 }
      })

      world.addTrigger([X - 3.2, -1, Z - 3.2], [X + 3.2, 4, Z + 3.2], onFind)

      world.onUpdate((dt, time) => {
        const dx = world.visitor.x - X
        const dz = world.visitor.z - Z
        const away = Math.hypot(dx, dz)
        // Push the middle of the plane away from the player, which brings their side of it in.
        if (away < NEAR && away > 1e-3) target.set(-dx / away, dz / away).multiplyScalar(LEAN)
        else target.set(0, 0)
        slideBy.value.lerp(target, 1 - Math.exp(-2.5 * dt))

        for (const { mesh, angle, phase } of beads) {
          // Out and back at a steady pace, by the plane's own measure.
          const lap = (time * PACE + phase) % (SWING * 4)
          const distance = lap < SWING * 2 ? lap - SWING : SWING * 3 - lap
          const drawn = drawnAt(distance)
          slide(placed.set(Math.cos(angle) * drawn, Math.sin(angle) * drawn), slideBy.value, placed)
          // The picture draws a thing smaller by this much, the nearer the rim it is.
          const size = Math.max(0.04, 1 - placed.lengthSq())
          mesh.position.set(X + placed.x * RADIUS, TOP + 0.005 + 0.09 * size, Z - placed.y * RADIUS)
          mesh.scale.setScalar(size)
        }
      })
    },
  }
}
