/*
  The watercolour on the landing page, drawn by one shader over the whole
  window:

  1. The title, painted on a woven canvas. Its four lights, with the colours
     of the Figma file, start as small blots at their centres and spread
     like watercolour as the page is scrolled: uneven, darker at their wet
     front, running together where they meet, with the heavy grain coming
     in where the paint goes. Once they cover the page it all fades to white
     (#1).
  2. #8: blue watercolour rises up the page from the bottom, uneven along
     its top and darker where it collects there, with light moving in it.
  3. #9: after the click, the water covers everything, and the game shows
     through the blue as the page fades.
*/

const VERTEX = `
attribute vec2 corner;
void main() {
  gl_Position = vec4(corner, 0.0, 1.0);
}`

const FRAGMENT = `
precision highp float;
uniform vec2 uSize;
uniform float uRatio;
uniform float uTime;
uniform float uBloom;
uniform float uBloomAlpha;
uniform vec4 uBox;
uniform sampler2D uGrainTex;
uniform float uGrain;
uniform float uWash;
uniform float uWaterTop;
uniform float uFlood;
uniform sampler2D uWater;
uniform float uPainted;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float gain = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += gain * noise(p);
    p = p * 2.03 + 17.0;
    gain *= 0.5;
  }
  return sum;
}

// Premultiplied colour \`top\` laid over \`under\`.
vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// The canvas the title is painted on: warm white, woven, with long fibres in both directions.
vec3 canvasGround(vec2 px) {
  float weave = sin(px.x * 1.9) * sin(px.y * 1.9);
  float fibres = (noise(vec2(px.x * 0.9, px.y * 0.06)) + noise(vec2(px.x * 0.06, px.y * 0.9))) * 0.5;
  float shade = 1.0 + 0.018 * weave + 0.035 * (fibres - 0.5) + 0.03 * (fbm(px * 0.01) - 0.5);
  return vec3(0.975, 0.968, 0.95) * shade;
}

// One light of the title, in frame pixels: how far outside its edge the point is, once the
// edge has been made uneven by \`warp\` and \`fringe\`, and its premultiplied colour there. The
// colour is a gradient between two points, and like the edge it grows by s about the centre.
vec4 pigment(vec2 f, vec2 centre, float radius, vec2 from, vec4 c0, vec2 to, vec4 c1, float opacity, float s, vec2 warp, float fringe, out float d) {
  d = length(f + warp - centre) - radius * s + fringe;
  vec2 a = centre + (from - centre) * s;
  vec2 b = centre + (to - centre) * s;
  vec2 ab = b - a;
  float t = clamp(dot(f - a, ab) / dot(ab, ab), 0.0, 1.0);
  return mix(vec4(c0.rgb * c0.a, c0.a), vec4(c1.rgb * c1.a, c1.a), t) * opacity;
}

// 1. The title. Its lights' centres, sizes, gradients and opacities are the Figma file's.
vec4 title(vec2 px) {
  vec2 f = (px - uBox.xy) / uBox.zw * vec2(2160.0, 1440.0);
  float s = uBloom;
  // Watercolour never spreads in circles: the paper pulls it further one way than another.
  vec2 warp = (vec2(fbm(f * 0.003 + 1.3), fbm(f * 0.003 + 8.6)) - 0.5) * 300.0 * s;
  float fringe = (fbm(f * 0.02) - 0.5) * 24.0 * min(s, 1.5);
  float d1; float d2; float d3; float d4;
  vec4 p1 = pigment(f, vec2(524.74, 670.8), 703.69, vec2(524.74, -32.89), vec4(0.114, 0.247, 0.0, 1.0), vec2(524.74, 1374.49), vec4(0.804, 0.941, 0.459, 0.46), 0.64, s, warp, fringe, d1);
  vec4 p2 = pigment(f, vec2(766.74, 397.91), 514.9, vec2(766.74, -116.99), vec4(0.6, 1.0, 0.224, 1.0), vec2(766.74, 912.8), vec4(0.584, 0.745, 0.58, 0.0), 0.81, s, warp, fringe, d2);
  vec4 p3 = pigment(f, vec2(1483.2, 737.35), 621.76, vec2(1670.78, 1330.14), vec4(0.961, 0.773, 0.153, 1.0), vec2(1295.61, 144.57), vec4(0.961, 0.933, 0.114, 0.46), 0.64, s, warp, fringe, d3);
  vec4 p4 = pigment(f, vec2(1352.09, 1031.74), 454.95, vec2(1489.35, 1465.49), vec4(1.0, 0.867, 0.0, 1.0), vec2(1214.84, 598.0), vec4(0.584, 0.745, 0.58, 0.0), 0.81, s, warp, fringe, d4);

  // Wet washes that meet run into one: one edge round them all, the colour of the nearest.
  float k = 220.0 * s;
  float inside = -smin(smin(d1, d2, k), smin(d3, d4, k), k);
  float reach = 180.0 * s + 12.0;
  float w1 = exp(-clamp(d1, -3.0 * reach, 6.0 * reach) / reach);
  float w2 = exp(-clamp(d2, -3.0 * reach, 6.0 * reach) / reach);
  float w3 = exp(-clamp(d3, -3.0 * reach, 6.0 * reach) / reach);
  float w4 = exp(-clamp(d4, -3.0 * reach, 6.0 * reach) / reach);
  vec4 paint = (p1 * w1 + p2 * w2 + p3 * w3 + p4 * w4) / (w1 + w2 + w3 + w4);
  vec3 hue = paint.rgb / max(paint.a, 0.001);

  // A crisp front, a dark line where the pigment has collected at it, and paler blooms behind.
  float feather = 2.0 + 4.0 * min(s, 1.5);
  float painted = smoothstep(-feather, feather, inside);
  float collected = smoothstep(0.0, 4.0, inside) * (1.0 - smoothstep(4.0, 26.0 + 30.0 * min(s, 1.0), inside));
  float blooms = 0.85 + 0.3 * fbm(f * 0.006 + 2.0);
  float settled = 0.88 + 0.24 * noise(px * 0.7);
  float density = clamp(paint.a * painted * blooms * settled * (1.0 + 0.6 * collected), 0.0, 0.95);

  // The grain comes in with the paint, under it, as it is in the Figma file.
  float side = max(uSize.x, uSize.y);
  vec3 grain = texture2D(uGrainTex, (px + (vec2(side) - uSize) * 0.5) / side).rgb;
  vec3 ground = mix(canvasGround(px), grain, uGrain * painted);

  // The paint lies over the grain as the Figma file's lights do, darker where it collected.
  vec3 colour = mix(ground, hue * (1.0 - 0.25 * collected), density);
  return vec4(mix(vec3(1.0), colour, uBloomAlpha), 1.0);
}

// 2 and 3. The water and the flood. px is in CSS pixels from the top left.
vec4 water(vec2 px, vec2 q, vec2 uv) {
  float top = uWaterTop / uSize.y;
  float level = mix(1.02, top, uWash);
  level = mix(level, -0.35, uFlood);
  // The top of a wash is never ruled: it rises and falls, creeps up in fingers where
  // the paper drank it, and is feathered where the water bled into the fibres.
  float swell = (fbm(vec2(q.x * 1.4, 3.1)) - 0.5) * 0.12 + (fbm(vec2(q.x * 4.5, 8.7)) - 0.5) * 0.05;
  float fingers = pow(fbm(vec2(q.x * 7.0, 1.7)), 2.0) * 0.04;
  float feather = (fbm(vec2(q.x * 26.0, uv.y * 26.0)) - 0.5) * 0.014;
  float depth = uv.y - (level + swell - fingers + feather);
  if (depth < -0.01) return vec4(0.0);
  // How far below the smooth surface, which the colour follows, so the uneven edge does not streak it.
  float below = max(0.0, uv.y - level);

  float covered = smoothstep(0.0, 0.015, depth);
  // Pigment collects in a thin dark line at the edge, with a paler, wetter band under it.
  float pooled = smoothstep(0.0, 0.003, depth) * (1.0 - smoothstep(0.003, 0.018, depth));
  float bloom = smoothstep(0.018, 0.04, depth) * (1.0 - smoothstep(0.04, 0.14, depth));
  float deep = smoothstep(0.0, 0.5, below);
  vec3 c = mix(vec3(0.7, 0.84, 0.95), vec3(0.3, 0.52, 0.8), deep);
  if (uPainted > 0.5) {
    vec3 tex = texture2D(uWater, clamp(px / max(uSize.x, uSize.y), 0.0, 1.0)).rgb;
    c = mix(c, tex * mix(1.15, 0.85, deep), 0.45);
  } else {
    c *= 0.9 + 0.2 * fbm(q * 28.0);
  }
  // Watercolour dries unevenly, in large soft blotches.
  c *= 0.92 + 0.16 * fbm(q * 3.5 + 5.0);
  c *= 1.0 - 0.28 * pooled;
  c = mix(c, min(c * 1.1, vec3(1.0)), bloom * 0.5);

  // Light moving in the water, most near its top.
  float drift = fbm(vec2(q.x * 4.0 + uTime * 0.1, below * 22.0 - uTime * 0.3));
  float glints = smoothstep(0.6, 0.68, drift) * smoothstep(0.0, 0.03, depth) * (1.0 - smoothstep(0.02, 0.25, below));
  float web = 1.0 - smoothstep(0.0, 0.015, abs(fbm(q * 6.0 + vec2(uTime * 0.04, -uTime * 0.03)) - 0.5));
  c += vec3(0.9, 0.95, 1.0) * (glints * 0.18 + web * 0.03);

  float a = covered * mix(0.6, 0.9, deep);
  a = mix(a, covered, smoothstep(0.2, 0.8, uFlood));
  return vec4(c * a, a);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y * uRatio - gl_FragCoord.y) / uRatio;
  vec2 uv = px / uSize;
  vec2 q = px / uSize.y;
  vec4 colour = vec4(0.0);
  if (uBloomAlpha > 0.0) colour = title(px);
  if (uWash > 0.0 || uFlood > 0.0) colour = over(water(px, q, uv), colour);
  gl_FragColor = colour;
}`

export interface FxFrame {
  /* Seconds, for what moves by itself. */
  time: number
  /* How large the title's lights are, as a multiple of their size in the Figma file. */
  bloom: number
  /* How much of the lights' colour shows, 0 to 1: it fades to white at the end of the title. */
  bloomAlpha: number
  /* The scaled Figma frame in CSS pixels: left, top, width and height. */
  box: readonly [number, number, number, number]
  /* How strong the grain is where the title's paint has spread, 0 for none. */
  grain: number
  /* 0 to 1: the water rising to its line. */
  wash: number
  /* Where the top of the water is once it has risen, in CSS pixels from the top. */
  waterTop: number
  /* 0 to 1: the water covering everything on the way into the game. */
  flood: number
}

export interface Fx {
  /* False where there is no WebGL, and nothing is drawn. */
  readonly ok: boolean
  resize(w: number, h: number): void
  /* Draw one frame, or clear the canvas when given null. */
  render(frame: FxFrame | null): void
  dispose(): void
}

/* The watercolour is soft, so it is drawn at one pixel for each CSS pixel. */
const RATIO = 1

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'The watercolour shader did not compile.')
  }
  return shader
}

/*
  Draws the watercolour into `canvas`. `textures.water` is the blue texture to
  paint the water from and `textures.grain` the grain for the title's paint,
  if any.
*/
export function createFx(
  canvas: HTMLCanvasElement,
  textures: { water: string | null; grain: string | null },
): Fx {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
  if (!gl) return { ok: false, resize() {}, render() {}, dispose() {} }

  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  gl.useProgram(program)

  // One triangle that covers the whole canvas.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const corner = gl.getAttribLocation(program, 'corner')
  gl.enableVertexAttribArray(corner)
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const u = {
    size: uniform('uSize'),
    ratio: uniform('uRatio'),
    time: uniform('uTime'),
    bloom: uniform('uBloom'),
    bloomAlpha: uniform('uBloomAlpha'),
    box: uniform('uBox'),
    wash: uniform('uWash'),
    waterTop: uniform('uWaterTop'),
    flood: uniform('uFlood'),
    painted: uniform('uPainted'),
    grain: uniform('uGrain'),
  }

  // The textures, once they have loaded: the blue for the water on unit 0, the grain on unit 1.
  // Until then the water is painted plain and the paint has no grain.
  const loaded = { water: false, grain: false }
  const waterTexture = gl.createTexture()
  const grainTexture = gl.createTexture()
  const load = (src: string, unit: number, texture: WebGLTexture, done: () => void) => {
    const image = new Image()
    image.onload = () => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
      done()
    }
    image.src = src
  }

  gl.uniform1i(uniform('uWater'), 0)
  gl.uniform1i(uniform('uGrainTex'), 1)
  if (textures.water) {
    load(textures.water, 0, waterTexture, () => {
      loaded.water = true
    })
  }

  if (textures.grain) {
    load(textures.grain, 1, grainTexture, () => {
      loaded.grain = true
    })
  }

  let w = 0
  let h = 0
  let blank = false

  return {
    ok: true,
    resize(width, height) {
      w = width
      h = height
      canvas.width = Math.round(w * RATIO)
      canvas.height = Math.round(h * RATIO)
      gl.viewport(0, 0, canvas.width, canvas.height)
      blank = false
    },
    render(frame) {
      if (!frame) {
        if (!blank) {
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT)
          blank = true
        }
        return
      }
      blank = false
      gl.uniform2f(u.size, w, h)
      gl.uniform1f(u.ratio, canvas.width / Math.max(1, w))
      gl.uniform1f(u.time, frame.time)
      gl.uniform1f(u.bloom, frame.bloom)
      gl.uniform1f(u.bloomAlpha, frame.bloomAlpha)
      gl.uniform4f(u.box, frame.box[0], frame.box[1], frame.box[2], frame.box[3])
      gl.uniform1f(u.wash, frame.wash)
      gl.uniform1f(u.waterTop, frame.waterTop)
      gl.uniform1f(u.flood, frame.flood)
      gl.uniform1f(u.painted, loaded.water ? 1 : 0)
      gl.uniform1f(u.grain, loaded.grain ? frame.grain : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    // The context goes with its canvas. Losing it here would break a canvas that React keeps
    // and hands to the next effect, as it does when the page is reloaded in place.
    dispose() {
      gl.deleteProgram(program)
      gl.deleteTexture(waterTexture)
      gl.deleteTexture(grainTexture)
    },
  }
}
