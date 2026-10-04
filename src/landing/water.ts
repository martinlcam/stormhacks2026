import { paintScene, puddleCentre } from './scene'
import { type Frame, beats } from './timeline'

const VERTEX = `
attribute vec2 corner;
varying vec2 vUv;
void main() {
  vUv = corner * 0.5 + 0.5;
  gl_Position = vec4(corner, 0.0, 1.0);
}`

/* Write a beat as the two arguments of smoothstep. */
const range = (name: keyof typeof beats) => `${beats[name][0]}, ${beats[name][1]}`

/*
  The fragment shader takes the painted scene and puts the water on it, in
  three steps that follow each other as the page is scrolled:

  1. Paper. The picture has a paper grain and its lines are a little uneven
     from the start, as if drawn by hand. When the paper gets wet the picture
     is pushed about much more.
  2. The wash. Dark blue pigment spreads out from the puddle. Its front is
     uneven, the pigment is darker at the front where it would collect, and
     it is laid over the picture the way watercolour is: it darkens what is
     under it and does not hide it.
  3. Under the water. Deep blue, light from above, and bubbles that go up
     only as the page is scrolled down.
*/
const FRAGMENT = `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform vec2 uFocus;
uniform float uP;
uniform float uScroll;
uniform float uTime;
varying vec2 vUv;

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

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  // The same point with the middle of the screen at zero and a height of one.
  vec2 q = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float wet = smoothstep(${range('wet')}, uP);
  float wash = smoothstep(${range('wash')}, uP);
  float under = smoothstep(${range('under')}, uP);

  // 1. Paper, dry and then wet.
  vec2 bleed = vec2(fbm(q * 3.0 + 3.0), fbm(q * 3.0 + 11.0)) - 0.5;
  vec2 sway = vec2(sin(q.y * 9.0 + uTime * 0.8), cos(q.x * 7.0 + uTime * 0.6)) * 0.004 * under;
  vec3 scene = texture2D(uScene, uv + bleed * (0.006 + 0.03 * wet) * (1.0 - under * 0.6) + sway).rgb;
  vec3 col = scene * mix(1.0, 0.86 + 0.28 * fbm(q * 90.0), max(0.6, wet) * (1.0 - under));

  // 2. The wash.
  vec2 focus = vec2((uFocus.x - 0.5) * aspect, uFocus.y - 0.5);
  float reach = length(vec2(0.5 * aspect, 0.5)) + length(focus) + 0.4;
  float uneven = (fbm(q * 2.5) - 0.5) * 0.5 + (fbm(q * 14.0) - 0.5) * 0.08;
  float front = wash * (reach + uneven) - length(q - focus);
  float cover = smoothstep(0.0, 0.18, front);
  float pooled = smoothstep(0.0, 0.05, front) * (1.0 - smoothstep(0.05, 0.22, front));
  vec3 pigment = mix(vec3(0.16, 0.30, 0.58), vec3(0.05, 0.11, 0.30), smoothstep(0.0, 0.6, front));
  pigment *= 1.0 - 0.22 * fbm(q * 38.0);
  pigment *= 1.0 - 0.35 * pooled;
  vec3 stained = scene * pigment * 1.6;
  col = mix(col, stained + pigment * 0.35, cover);

  // 3. Under the water.
  vec3 deep = mix(vec3(0.02, 0.05, 0.16), vec3(0.10, 0.30, 0.55), pow(uv.y, 1.5));
  float rays = pow(fbm(vec2(q.x * 4.0 - q.y * 1.2, uTime * 0.06)), 3.0) * smoothstep(0.1, 1.0, uv.y) * 2.2;
  col = mix(col, deep + vec3(0.35, 0.6, 0.8) * rays + stained * 0.8, under);

  // Bubbles. Each column has one, and it goes up as the page goes down.
  for (int layer = 1; layer <= 2; layer++) {
    float columns = 9.0 * float(layer);
    float id = floor(q.x * columns);
    float seed = hash(vec2(id, float(layer)));
    float height = fract(seed * 7.0 + uScroll * (0.35 + seed * 0.5)) * 1.2 - 0.6;
    float radius = (0.006 + 0.012 * hash(vec2(seed, 3.0))) / float(layer);
    vec2 centre = vec2((id + 0.5 + 0.25 * sin(height * 9.0 + seed * 6.0)) / columns, height);
    float d = length(q - centre);
    float ring = smoothstep(radius, radius - 0.003, d) - 0.7 * smoothstep(radius - 0.003, radius - 0.007, d);
    col += vec3(0.6, 0.8, 1.0) * ring * 0.3 * under * step(0.4, seed);
  }

  gl_FragColor = vec4(col, 1.0);
}`

export interface Compositor {
  /* Make the drawing surface `w` by `h` CSS pixels. */
  resize(w: number, h: number): void
  render(frame: Frame, seconds: number): void
  dispose(): void
}

/* More pixels than this for each CSS pixel costs speed and shows no difference. */
const MAX_PIXEL_RATIO = 1.5

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'The landing page shader did not compile.')
  }
  return shader
}

/*
  Draws the landing page into `canvas`. The scene is painted on a second,
  hidden canvas, and the shader above puts the water on it. Where WebGL is
  not available the scene is shown as it is, without the water.
*/
export function createCompositor(canvas: HTMLCanvasElement): Compositor {
  const painted = document.createElement('canvas')
  const paint = painted.getContext('2d')!
  let ratio = 1

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
  if (!gl) {
    const plain = canvas.getContext('2d')!
    return {
      resize(w, h) {
        canvas.width = painted.width = w
        canvas.height = painted.height = h
      },
      render(frame) {
        paintScene(paint, frame)
        plain.drawImage(painted, 0, 0)
      },
      dispose() {},
    }
  }

  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  gl.useProgram(program)

  // One triangle that covers the whole screen.
  const corners = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, corners)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const corner = gl.getAttribLocation(program, 'corner')
  gl.enableVertexAttribArray(corner)
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)

  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  // The canvas has its first row at the top; the shader has it at the bottom.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const uRes = uniform('uRes')
  const uFocus = uniform('uFocus')
  const uP = uniform('uP')
  const uScroll = uniform('uScroll')
  const uTime = uniform('uTime')

  return {
    resize(w, h) {
      ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      canvas.width = painted.width = Math.round(w * ratio)
      canvas.height = painted.height = Math.round(h * ratio)
      gl.viewport(0, 0, canvas.width, canvas.height)
    },
    render(frame, seconds) {
      paint.setTransform(ratio, 0, 0, ratio, 0, 0)
      paintScene(paint, frame)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, painted)
      const [x, y] = puddleCentre(frame)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uFocus, x, 1 - y)
      gl.uniform1f(uP, frame.p)
      gl.uniform1f(uScroll, frame.scroll)
      gl.uniform1f(uTime, seconds)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
