import * as THREE from 'three'
import { onPlanet, planetUniforms, type Site, upAt } from './planet'

/*
  Watercolour on the plaza's canvas floor.

  As the player walks, blots of watercolour are put down just behind their
  feet. Each one runs forward from where it starts as water wicks through
  paper, the distance it has gone growing as the square root of the time:
  fast enough at first to catch up with the player's feet, then slower, so
  that it falls behind while they walk and flows in round them when they
  stop. It dries with a darker line where the pigment was carried to its
  edge. Blots that overlap glaze, as washes do: their colours multiply.

  The paint is kept in one square texture that wraps the whole planet: the
  octahedral map of the direction from the planet's centre. The pole, where
  the structures stand, is the middle of the texture and the point opposite
  it is the four corners. Each texel holds how much of the light's red,
  green and blue the pigment there stops, which adds up as washes overlap,
  and the floor lets through exp(-that) of its colour.

  A blot is drawn in every frame that it is spreading, but each frame draws
  only the ring of it that the wet front has reached since the last, so it
  is added to every texel once however many frames it takes.
*/

/* The landing page's colours: its two greens, two yellows, the water's blue and the sage. */
const COLOURS = ['#cdf075', '#99ff39', '#f5d84a', '#f5c527', '#8fbde6', '#95be94']
/* Metres walked between one blot and the next, for a player of scale 1. */
const STRIDE = 0.9
/* How far behind the feet a blot starts, and how far to either side it can be. */
const BEHIND = 0.5
const SIDEWAYS = 0.35
/* How far a blot runs forward from where it starts, and how wide it is: least and most. */
const LENGTH = [2.2, 3.6] as const
const WIDTH = [0.9, 1.6] as const
/* Seconds the wet front takes to cross most of a blot. */
const SPREAD = [1.1, 1.8] as const
/* How much of its colour one blot puts down. The three or four that overlap give the whole colour. */
const STRENGTH = [0.25, 0.45] as const
/* A step longer than this, in metres, is a door or a respawn and starts a new trail. */
const JUMP = 3
/* The wet front has reached every part of a blot by this many of its spread times. */
const LAST_ARRIVAL = 2
/* How many blots can be spreading at once. */
const POOL = 24
/* Texels each way in the paint texture. */
const SIZE = 2048

/* How much of red, green and blue each colour's pigment stops, at full strength, on white. */
const DENSITIES = COLOURS.map((hex) =>
  [1, 3, 5].map((at) => -Math.log(Math.max(parseInt(hex.slice(at, at + 2), 16) / 255, 0.02))),
)

export interface Blot {
  /* Where the wet front starts: a unit vector from the planet's centre. */
  origin: THREE.Vector3
  /* Unit vectors along the ground at the origin: the way the player was going, and across it. */
  along: THREE.Vector3
  across: THREE.Vector3
  /* How far it runs forward and how wide it is, in metres. */
  length: number
  width: number
  /* How much of red, green and blue its pigment stops. */
  density: [number, number, number]
  seed: number
  /* When it was put down, in seconds, and how long its wet front takes to spread. */
  born: number
  spread: number
}

/*
  Where the player has walked, turned into blots. It only sees where the
  player stands on the planet, so it can be tested without drawing anything.
*/
export class Trail {
  private readonly last = new THREE.Vector3()
  private walking = false
  private walked = 0
  private colour = 0

  constructor(private readonly random: () => number = Math.random) {}

  /*
    The player now stands at `here`, a unit vector from the centre of a
    planet of `radius` metres, or is off its ground (null). Returns the
    blots to put down.
  */
  step(here: THREE.Vector3 | null, radius: number, scale: number, time: number): Blot[] {
    if (!here) {
      this.walking = false
      return []
    }

    if (!this.walking) {
      this.walking = true
      this.walked = 0
      this.last.copy(here)
      return []
    }

    const metres = this.last.angleTo(here) * radius
    // Too small a step to have a direction; it counts once the steps add up.
    if (metres < 1e-4) return []
    if (metres > JUMP) {
      this.walked = 0
      this.last.copy(here)
      return []
    }

    const along = here.clone().sub(this.last)
    along.addScaledVector(here, -along.dot(here)).normalize()
    this.last.copy(here)
    this.walked += metres
    const blots: Blot[] = []
    while (this.walked >= STRIDE * scale) {
      this.walked -= STRIDE * scale
      blots.push(this.blot(here, along, radius, scale, time))
    }
    return blots
  }

  private blot(
    here: THREE.Vector3,
    along: THREE.Vector3,
    radius: number,
    scale: number,
    time: number,
  ): Blot {
    const random = this.random
    const across = new THREE.Vector3().crossVectors(here, along)
    const side = (random() * 2 - 1) * SIDEWAYS
    const origin = here
      .clone()
      .addScaledVector(along, (-BEHIND * scale) / radius)
      .addScaledVector(across, (side * scale) / radius)
      .normalize()
    // The same directions, laid along the ground where the blot starts.
    const alongThere = along.clone().addScaledVector(origin, -along.dot(origin)).normalize()

    // Now and then the colour moves on to one of its neighbours.
    if (random() < 0.3) {
      this.colour = (this.colour + (random() < 0.5 ? 1 : COLOURS.length - 1)) % COLOURS.length
    }

    const strength = between(STRENGTH, random())
    const [r, g, b] = DENSITIES[this.colour]
    return {
      origin,
      along: alongThere,
      across: new THREE.Vector3().crossVectors(origin, alongThere),
      length: between(LENGTH, random()) * scale,
      width: between(WIDTH, random()) * scale,
      density: [r * strength, g * strength, b * strength],
      seed: random() * 100,
      born: time,
      spread: between(SPREAD, random()),
    }
  }
}

function between([least, most]: readonly [number, number], t: number) {
  return least + (most - least) * t
}

/* Where a unit vector from the planet's centre is kept in the paint texture, 0 to 1 each way. */
export function octEncode(dir: THREE.Vector3, target = new THREE.Vector2()): THREE.Vector2 {
  const sum = Math.abs(dir.x) + Math.abs(dir.y) + Math.abs(dir.z)
  let u = dir.x / sum
  let v = dir.z / sum
  // The far half of the planet is folded out into the corners.
  if (dir.y < 0) {
    const folded = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1)
    v = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1)
    u = folded
  }
  return target.set(u * 0.5 + 0.5, v * 0.5 + 0.5)
}

/* The unit vector from the planet's centre kept at this place in the paint texture. */
export function octDecode(uv: THREE.Vector2, target = new THREE.Vector3()): THREE.Vector3 {
  const x = uv.x * 2 - 1
  const z = uv.y * 2 - 1
  const y = 1 - Math.abs(x) - Math.abs(z)
  const fold = Math.max(-y, 0)
  return target.set(x + (x >= 0 ? -fold : fold), y, z + (z >= 0 ? -fold : fold)).normalize()
}

const corner = new THREE.Vector3()
const middle = new THREE.Vector3()
const at = new THREE.Vector2()

/*
  The part of the paint texture a blot can reach, as [left, bottom, right,
  top] from 0 to 1. Near the fold on the far side of the planet, where a
  blot can land in two places at once, it is the whole texture.
*/
export function blotBox(blot: Blot, radius: number): [number, number, number, number] {
  middle
    .copy(blot.origin)
    .addScaledVector(blot.along, blot.length / 2 / radius)
    .normalize()
  // Room for the edge to wander well outside the blot's oval.
  const reach = (Math.hypot(blot.length, blot.width) * 0.8) / radius
  const box: [number, number, number, number] = [1, 1, 0, 0]
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2
    corner
      .copy(middle)
      .addScaledVector(blot.along, Math.cos(angle) * reach)
      .addScaledVector(blot.across, Math.sin(angle) * reach)
      .normalize()
    octEncode(corner, at)
    box[0] = Math.min(box[0], at.x)
    box[1] = Math.min(box[1], at.y)
    box[2] = Math.max(box[2], at.x)
    box[3] = Math.max(box[3], at.y)
  }

  const pad = 4 / SIZE
  const folded = box[2] - box[0] > 0.25 || box[3] - box[1] > 0.25
  if (folded || box[0] - pad < 0 || box[1] - pad < 0 || box[2] + pad > 1 || box[3] + pad > 1) {
    return [0, 0, 1, 1]
  }

  return [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad]
}

/* For any shader that reads the paint: the texture, and where a direction is kept in it. */
export const PAINT_PARS = /* glsl */ `
uniform sampler2D uPaint;

vec2 paintUv(vec3 n) {
  n /= abs(n.x) + abs(n.y) + abs(n.z);
  vec2 p = n.xz;
  if (n.y < 0.0) p = (1.0 - abs(p.yx)) * vec2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
  return p * 0.5 + 0.5;
}
`

/* Shared by every material that shows the paint. Until there is paint, nothing is painted. */
export const paintUniforms = {
  uPaint: { value: blank() as THREE.Texture },
}

function blank() {
  const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1)
  texture.needsUpdate = true
  return texture
}

const STAMP_VERTEX = /* glsl */ `
uniform vec4 uBox;

void main() {
  vec2 p = mix(uBox.xy, uBox.zw, position.xy + 0.5);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

const STAMP_FRAGMENT = /* glsl */ `
uniform float uSize;
uniform float uRadius;
// The cosine of the furthest angle from the start that the blot can reach.
uniform float uNear;
uniform vec3 uOrigin;
uniform vec3 uAlong;
uniform vec3 uAcross;
uniform vec2 uShape;
uniform vec3 uDensity;
uniform float uSeed;
// The part of the spread to draw this frame, in spread times since the blot was put down.
uniform vec2 uWindow;

float paintHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float paintNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(paintHash(i), paintHash(i + vec2(1.0, 0.0)), u.x),
    mix(paintHash(i + vec2(0.0, 1.0)), paintHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Noise with detail at four sizes, from 0 to about 1 and 0.47 on average.
float paintFbm(vec2 p) {
  float sum = 0.0;
  float amount = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amount * paintNoise(p);
    p = p * 2.03 + 17.1;
    amount *= 0.5;
  }
  return sum;
}

vec3 paintDirection(vec2 uv) {
  vec2 f = uv * 2.0 - 1.0;
  vec3 n = vec3(f.x, 1.0 - abs(f.x) - abs(f.y), f.y);
  float fold = max(-n.y, 0.0);
  n.x += n.x >= 0.0 ? -fold : fold;
  n.z += n.z >= 0.0 ? -fold : fold;
  return normalize(n);
}

void main() {
  vec3 n = paintDirection(gl_FragCoord.xy / uSize);
  float facing = dot(n, uOrigin);
  if (facing < uNear) discard;
  // Metres from where the blot starts, forward and across, on the ground there.
  vec2 q = vec2(dot(n, uAlong), dot(n, uAcross)) * uRadius / facing;

  // An oval from the start forward, pushed about by the paper so it is never an oval.
  vec2 warp = vec2(paintFbm(q * 1.1 + uSeed), paintFbm(q * 1.1 + uSeed + 19.7)) - 0.47;
  vec2 e = (q + warp * uShape.y * 0.7 - vec2(uShape.x * 0.5, 0.0)) / (uShape * 0.5);
  float edge = length(e) + (paintFbm(q * 9.0 + uSeed) - 0.47) * 0.12;
  if (edge >= 1.0) discard;

  // When the wet front reaches here: from the start outward, the distance growing as the
  // square root of the time, and further in some directions than others.
  float far = length(q / vec2(uShape.x, uShape.y * 0.5));
  float arrives = pow(min(far, 1.3), 2.0) * (0.85 + 0.3 * paintFbm(q * 2.3 + uSeed + 7.0));
  if (arrives <= uWindow.x || arrives > uWindow.y) discard;

  // Uneven inside, and darker in a line where the pigment was carried to the edge.
  float body = 0.6 + 0.5 * paintFbm(q * 1.7 + uSeed + 31.0);
  float tide = smoothstep(0.7, 0.97, edge);
  float feather = 1.0 - smoothstep(0.9, 1.0, edge);
  gl_FragColor = vec4(uDensity * (body + tide * 0.9) * feather, feather);
}
`

interface Slot {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  blot: Blot | null
  /* How far the blot has been drawn, in spread times since it was put down. */
  drawn: number
  /* Draw the rest of it this frame, to make room. */
  finish: boolean
}

/* What the paint needs to know about the player. */
export interface Painter {
  readonly position: THREE.Vector3
  readonly site: Site
  readonly onGround: boolean
  readonly scale: number
}

/* Keeps the paint texture, and lays the player's trail into it. */
export class Paint {
  readonly trail: Trail
  private readonly target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    // Smaller copies, remade after each frame that paints, so the paint does not
    // flicker in the distance or where the ground is seen edge on.
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    anisotropy: 4,
  })
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.Camera()
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  private readonly slots: Slot[] = []
  private readonly waiting: Blot[] = []
  private readonly here = new THREE.Vector3()
  private readonly clearColour = new THREE.Color()
  private cleared = false

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    random: () => number = Math.random,
  ) {
    this.trail = new Trail(random)
    for (let i = 0; i < POOL; i++) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uBox: { value: new THREE.Vector4() },
          uSize: { value: SIZE },
          uRadius: { value: 1 },
          uNear: { value: 1 },
          uOrigin: { value: new THREE.Vector3() },
          uAlong: { value: new THREE.Vector3() },
          uAcross: { value: new THREE.Vector3() },
          uShape: { value: new THREE.Vector2() },
          uDensity: { value: new THREE.Vector3() },
          uSeed: { value: 0 },
          uWindow: { value: new THREE.Vector2() },
        },
        vertexShader: STAMP_VERTEX,
        fragmentShader: STAMP_FRAGMENT,
        // Each blot adds its pigment to whatever is there already.
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      })
      const mesh = new THREE.Mesh(this.geometry, material)
      mesh.frustumCulled = false
      mesh.visible = false
      this.scene.add(mesh)
      this.slots.push({ mesh, blot: null, drawn: 0, finish: false })
    }

    paintUniforms.uPaint.value = this.target.texture
  }

  /* Follow the player, and spread whatever is still wet. `time` is in seconds. */
  update(time: number, painter: Painter) {
    const k = planetUniforms.uPlanetK.value
    if (k <= 0) return
    const radius = 1 / k
    // Only on the plaza's own ground, not on top of anything standing on it.
    const standing = painter.onGround && painter.position.y < 0.05 && onPlanet(painter.position)
    const here = standing
      ? upAt(painter.position, this.here).applyQuaternion(painter.site.rotation)
      : null
    this.waiting.push(...this.trail.step(here, radius, painter.scale, time))
    this.draw(time, radius)
  }

  /* Put a blot down directly, as the trail would. For trying the paint out. */
  add(blot: Blot) {
    this.waiting.push(blot)
  }

  dispose() {
    paintUniforms.uPaint.value = blank()
    this.target.dispose()
    this.geometry.dispose()
    for (const slot of this.slots) slot.mesh.material.dispose()
  }

  private draw(time: number, radius: number) {
    for (const slot of this.slots) {
      if (slot.blot || this.waiting.length === 0) continue
      this.fill(slot, this.waiting.shift()!, radius)
    }

    // Too many at once: the oldest are finished now, so there is room next frame.
    if (this.waiting.length > 0) {
      const busy = this.slots.filter((slot) => slot.blot && !slot.finish)
      busy.sort((a, b) => a.blot!.born - b.blot!.born)
      for (const slot of busy.slice(0, this.waiting.length)) slot.finish = true
    }

    let any = false
    for (const slot of this.slots) {
      const blot = slot.blot
      slot.mesh.visible = blot !== null
      if (!blot) continue
      any = true
      const until = slot.finish ? LAST_ARRIVAL : (time - blot.born) / blot.spread
      slot.mesh.material.uniforms.uWindow.value.set(slot.drawn, until)
      slot.drawn = until
    }

    if (!any && this.cleared) return
    this.render()

    for (const slot of this.slots) {
      if (slot.blot && slot.drawn >= LAST_ARRIVAL) {
        slot.blot = null
        slot.finish = false
        slot.mesh.visible = false
      }
    }
  }

  private fill(slot: Slot, blot: Blot, radius: number) {
    const uniforms = slot.mesh.material.uniforms
    uniforms.uBox.value.fromArray(blotBox(blot, radius))
    uniforms.uRadius.value = radius
    uniforms.uNear.value = Math.cos(
      Math.min(Math.PI / 2, (Math.hypot(blot.length, blot.width) * 1.5) / radius),
    )
    uniforms.uOrigin.value.copy(blot.origin)
    uniforms.uAlong.value.copy(blot.along)
    uniforms.uAcross.value.copy(blot.across)
    uniforms.uShape.value.set(blot.length, blot.width)
    uniforms.uDensity.value.fromArray(blot.density)
    uniforms.uSeed.value = blot.seed
    slot.blot = blot
    // Just before the start, so the very first point is drawn too.
    slot.drawn = -1
    slot.finish = false
  }

  /* Draw into the paint texture, and leave the renderer as it was found. */
  private render() {
    const renderer = this.renderer
    const target = renderer.getRenderTarget()
    const autoClear = renderer.autoClear
    const scissor = renderer.getScissorTest()
    renderer.getClearColor(this.clearColour)
    const clearAlpha = renderer.getClearAlpha()

    renderer.setRenderTarget(this.target)
    renderer.setScissorTest(false)
    if (!this.cleared) {
      renderer.setClearColor(0x000000, 0)
      renderer.clear(true, false, false)
      this.cleared = true
    }

    renderer.autoClear = false
    renderer.render(this.scene, this.camera)

    renderer.autoClear = autoClear
    renderer.setClearColor(this.clearColour, clearAlpha)
    renderer.setScissorTest(scissor)
    renderer.setRenderTarget(target)
  }
}
