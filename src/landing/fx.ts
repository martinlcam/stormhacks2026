/*
  The watercolour on the landing page, drawn by one shader over the whole
  window:

  1. #1: when the reader scrolls off the title, wet paper spreads over it
     from a few places at once. The pigment it pushes collects at its front
     in the title's greens and yellows, and then it dries to plain white.
  2. #8: blue watercolour rises up the page from the bottom, uneven along
     its top and darker where it collects there, with light moving in it.
  3. #10: once the drop lands, rings spread from where it fell, squashed
     because the water is seen from the side, and small rings of rain come
     and go on the water.
  4. #9: after the button, the water covers everything and darkens to the
     night of the game.
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
uniform float uDissolve;
uniform float uWash;
uniform float uWaterTop;
uniform float uRipple;
uniform vec2 uCentre;
uniform float uFrame;
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

// 1. Wet paper spreading over the title. q has a height of one; uv runs 0 to 1 both ways.
vec4 dissolve(vec2 q, vec2 uv) {
  float aspect = uSize.x / uSize.y;
  float covered = 0.0;
  float front = 0.0;
  for (int i = 0; i < 5; i++) {
    float k = float(i);
    vec2 seed = vec2(hash(vec2(k, 1.0)) * aspect, hash(vec2(k, 2.0)));
    float delay = hash(vec2(k, 3.0)) * 0.3;
    // By the end every patch reaches past the far corner of the window.
    float reach = clamp((uDissolve - delay) / (1.0 - delay), 0.0, 1.0) * (aspect + 1.6);
    float d = length(q - seed) + (fbm(q * 3.0 + k * 7.0) - 0.5) * 0.5 + (fbm(q * 15.0 + k) - 0.5) * 0.06;
    float f = reach - d;
    covered = max(covered, smoothstep(0.0, 0.03, f));
    front = max(front, smoothstep(-0.004, 0.01, f) * (1.0 - smoothstep(0.01, 0.08, f)));
  }
  float dry = smoothstep(0.7, 1.0, uDissolve);
  vec3 pigment = mix(vec3(0.52, 0.66, 0.28), vec3(0.94, 0.8, 0.26), smoothstep(0.25, 0.85, uv.x));
  float tint = front * 0.6 * (1.0 - dry);
  vec3 paper = vec3(1.0 - 0.04 * (1.0 - dry) * fbm(q * 40.0));
  float a = max(covered, tint);
  vec3 c = mix(paper, pigment, tint / max(a, 0.001));
  return vec4(c * a, a);
}

// 2 to 4. The water, its rings and the flood. px is in CSS pixels from the top left.
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

  if (uRipple >= 0.0) {
    // Rings from where the drop fell, measured in frame heights.
    vec2 d = (px - uCentre) / uFrame;
    d.y /= 0.3;
    float r = length(d);
    float rings = 0.0;
    for (int k = 0; k < 4; k++) {
      float t = uRipple - float(k) * 0.24;
      if (t > 0.0) {
        float edge = r - t * 0.2;
        float fade = exp(-t * 0.8);
        rings += exp(-(edge * edge) / 0.00006) * fade;
        rings -= 0.5 * exp(-((edge + 0.014) * (edge + 0.014)) / 0.00006) * fade;
      }
    }

    // Rain on the water: small rings that come and go.
    vec2 cells = vec2(q.x * 8.0, q.y * 16.0);
    vec2 id = floor(cells);
    float seed = hash(id);
    float phase = fract(uTime * 0.4 + seed * 7.0);
    vec2 local = fract(cells) - 0.5 - (vec2(hash(id + 3.0), hash(id + 5.0)) - 0.5) * 0.4;
    float ring = abs(length(local) - phase * 0.42);
    float rain = (1.0 - smoothstep(0.0, 0.035, ring)) * (1.0 - phase) * step(0.6, seed);
    rain *= smoothstep(0.0, 1.5, uRipple) * smoothstep(0.02, 0.08, depth);
    c += vec3(0.88, 0.94, 1.0) * (rings * 0.4 + rain * 0.18);
  }

  float a = covered * mix(0.6, 0.9, deep);
  c = mix(c, vec3(0.071, 0.039, 0.11), smoothstep(0.5, 1.0, uFlood));
  a = mix(a, covered, smoothstep(0.2, 0.8, uFlood));
  return vec4(c * a, a);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y * uRatio - gl_FragCoord.y) / uRatio;
  vec2 uv = px / uSize;
  vec2 q = px / uSize.y;
  vec4 colour = vec4(0.0);
  if (uDissolve > 0.0 && uDissolve < 1.0) colour = dissolve(q, uv);
  if (uWash > 0.0 || uFlood > 0.0) colour = over(water(px, q, uv), colour);
  gl_FragColor = colour;
}`

export interface FxFrame {
  /* Seconds, for what moves by itself. */
  time: number
  /* 0 to 1: the wet paper spreading over the title. */
  dissolve: number
  /* 0 to 1: the water rising to its line. */
  wash: number
  /* Where the top of the water is once it has risen, in CSS pixels from the top. */
  waterTop: number
  /* Seconds since the drop hit the water, or -1 before. */
  ripple: number
  /* Where the rings spread from, in CSS pixels from the top left. */
  centre: readonly [number, number]
  /* The height of the scaled Figma frame in CSS pixels, which the rings are sized by. */
  frame: number
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

/* Draws the watercolour into `canvas`. `water` is the blue texture to paint the water from, if any. */
export function createFx(canvas: HTMLCanvasElement, water: string | null): Fx {
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
    dissolve: uniform('uDissolve'),
    wash: uniform('uWash'),
    waterTop: uniform('uWaterTop'),
    ripple: uniform('uRipple'),
    centre: uniform('uCentre'),
    frame: uniform('uFrame'),
    flood: uniform('uFlood'),
    painted: uniform('uPainted'),
  }

  // The blue texture, once it has loaded. Until then the water is painted plain.
  let painted = false
  const texture = gl.createTexture()
  if (water) {
    const image = new Image()
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
      painted = true
    }
    image.src = water
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
      gl.uniform1f(u.dissolve, frame.dissolve)
      gl.uniform1f(u.wash, frame.wash)
      gl.uniform1f(u.waterTop, frame.waterTop)
      gl.uniform1f(u.ripple, frame.ripple)
      gl.uniform2f(u.centre, frame.centre[0], frame.centre[1])
      gl.uniform1f(u.frame, frame.frame)
      gl.uniform1f(u.flood, frame.flood)
      gl.uniform1f(u.painted, painted ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    // The context goes with its canvas. Losing it here would break a canvas that React keeps
    // and hands to the next effect, as it does when the page is reloaded in place.
    dispose() {
      gl.deleteProgram(program)
      gl.deleteTexture(texture)
    },
  }
}
