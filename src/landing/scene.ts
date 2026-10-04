import { type Frame, beat } from './timeline'

type RGB = readonly [number, number, number]
type Point = readonly [number, number]

/* The most drops on screen at once. */
const MAX_DROPS = 260
/* How many places in the puddle the small ripples spread from. */
const RIPPLE_SOURCES = 6
/* How many large rings spread from the middle of the puddle. */
const PUDDLE_RINGS = 4
/* The pencil that every outline is drawn with. */
const INK = 'rgba(38,28,58,0.75)'
/* How far, in pixels, a pencil line can miss the place it was meant for. */
const WOBBLE = 1.6

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function css(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`
}

/* A fixed number from 0 to 1 for each pair, so nothing changes between frames. */
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function fract(x: number): number {
  return x - Math.floor(x)
}

/*
  The hand that draws is not steady, but it is the same in every frame: the
  lines are drawn in the same order each time, and each takes the next
  numbers from this list. So the picture looks drawn by hand and does not
  shake when the page is scrolled.
*/
let stroke = 0
function shake(amount = WOBBLE): number {
  return (rand(++stroke, 13) - 0.5) * 2 * amount
}

/* One pencil line: it starts and ends a little off, and bends a little between. */
function pencil(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
  ctx.moveTo(a[0] + shake(), a[1] + shake())
  ctx.quadraticCurveTo(
    (a[0] + b[0]) / 2 + shake(WOBBLE * 1.5),
    (a[1] + b[1]) / 2 + shake(WOBBLE * 1.5),
    b[0] + shake(),
    b[1] + shake(),
  )
}

function trace(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath()
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

/*
  A shape as it would be drawn by hand: colour first, then pencil lines for
  shadow if `hatch` is given (the distance between them), then the outline
  gone over twice so the two lines do not quite agree.
*/
function sketch(ctx: CanvasRenderingContext2D, points: Point[], fill: string, hatch = 0) {
  trace(ctx, points)
  ctx.fillStyle = fill
  ctx.fill()

  if (hatch) {
    const xs = points.map((point) => point[0])
    const ys = points.map((point) => point[1])
    const left = Math.min(...xs)
    const right = Math.max(...xs)
    const top = Math.min(...ys)
    // The page is never taller than this, so lines below it are not needed.
    const bottom = Math.min(Math.max(...ys), top + 2400)
    const width = right - left
    ctx.save()
    ctx.clip()
    ctx.beginPath()
    for (let y = top - width; y < bottom; y += hatch) {
      pencil(ctx, [left, y + width * 0.6], [right, y])
    }
    ctx.lineWidth = 0.8
    ctx.strokeStyle = 'rgba(38,28,58,0.22)'
    ctx.stroke()
    ctx.restore()
  }

  ctx.lineWidth = 1.2
  ctx.strokeStyle = INK
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath()
    points.forEach((point, i) => pencil(ctx, point, points[(i + 1) % points.length]))
    ctx.stroke()
  }
}

/*
  A ring drawn by hand: not quite round, and the pencil lifts before the end
  meets the start. `k` makes each ring different.
*/
function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  k: number,
) {
  const STEPS = 28
  ctx.beginPath()
  for (let i = 0; i <= STEPS * 0.94; i++) {
    const angle = k + (i / STEPS) * Math.PI * 2
    const r = 1 + 0.05 * Math.sin(angle * 3 + k * 5) + 0.03 * Math.sin(angle * 5 + k)
    ctx.lineTo(x + Math.cos(angle) * rx * r, y + Math.sin(angle) * ry * r)
  }
}

/* Where the terrace is: the centre of its top face and half its width. */
function terrace(f: Frame) {
  const near = (1 - beat('rise', f.p)) * f.h * 0.8 - beat('sink', f.p) * f.h * 1.1
  return { x: f.w / 2, y: f.h * 0.66 + near, half: Math.min(f.w * 0.46, f.h * 0.75) }
}

/* The centre of the puddle, as a fraction of the stage from its top left. */
export function puddleCentre(f: Frame): [number, number] {
  const t = terrace(f)
  return [t.x / f.w, t.y / f.h]
}

/*
  A block seen from above and to one side: a diamond for the top and two
  faces that go down to `floor`. The faces away from the light are hatched.
*/
function block(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  floor: number,
  top: RGB,
  left: RGB,
  right: RGB,
) {
  const rise = half / 2
  sketch(
    ctx,
    [
      [x - half, y],
      [x, y + rise],
      [x, floor],
      [x - half, floor],
    ],
    css(left),
    16,
  )
  sketch(
    ctx,
    [
      [x, y + rise],
      [x + half, y],
      [x + half, floor],
      [x, floor],
    ],
    css(right),
    8,
  )
  sketch(
    ctx,
    [
      [x - half, y],
      [x, y - rise],
      [x + half, y],
      [x, y + rise],
    ],
    css(top),
  )
}

/*
  The girl: a pointed white hat, a small face, a white dress that widens to
  the hem, and two thin legs. (x, y) is the ground between her feet and `s`
  is her height.
*/
function girl(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, cloth: RGB) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const shade = 'rgba(96,84,150,0.28)'
  ctx.strokeStyle = INK
  ctx.lineJoin = 'round'

  ctx.lineWidth = 0.018
  ctx.beginPath()
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 0.035, -0.16)
    ctx.lineTo(side * 0.04, 0)
  }
  ctx.stroke()
  ctx.lineWidth = 0.009

  ctx.beginPath()
  ctx.moveTo(-0.06, -0.66)
  ctx.lineTo(0.06, -0.66)
  ctx.quadraticCurveTo(0.12, -0.4, 0.21, -0.14)
  ctx.quadraticCurveTo(0, -0.07, -0.21, -0.14)
  ctx.quadraticCurveTo(-0.12, -0.4, -0.06, -0.66)
  ctx.fillStyle = css(cloth)
  ctx.fill()
  ctx.stroke()
  // The side of the dress away from the light.
  ctx.beginPath()
  ctx.moveTo(0.015, -0.66)
  ctx.lineTo(0.06, -0.66)
  ctx.quadraticCurveTo(0.12, -0.4, 0.21, -0.14)
  ctx.quadraticCurveTo(0.13, -0.105, 0.05, -0.1)
  ctx.closePath()
  ctx.fillStyle = shade
  ctx.fill()

  ctx.beginPath()
  ctx.arc(0, -0.725, 0.075, 0, Math.PI * 2)
  ctx.fillStyle = css(mix([243, 221, 208], cloth, 0.3))
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-0.118, -0.77)
  ctx.quadraticCurveTo(0, -0.735, 0.118, -0.77)
  ctx.lineTo(0.004, -1)
  ctx.closePath()
  ctx.fillStyle = css(cloth)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0.02, -0.752)
  ctx.quadraticCurveTo(0.07, -0.755, 0.118, -0.77)
  ctx.lineTo(0.004, -1)
  ctx.closePath()
  ctx.fillStyle = shade
  ctx.fill()

  ctx.restore()
}

/*
  Draw the picture for one frame: the sky, the towers, the terrace with the
  girl on it, the puddle and the rain. The water that covers it later is
  added by the compositor.
*/
export function paintScene(ctx: CanvasRenderingContext2D, f: Frame) {
  const { w, h, p, scroll } = f
  const small = Math.min(w, h)
  const rise = beat('rise', p)
  const storm = beat('storm', p)
  const sink = beat('sink', p)
  const puddle = beat('puddle', p)
  const tone = (dusk: RGB, rain: RGB) => mix(dusk, rain, storm)
  stroke = 0
  ctx.lineCap = 'round'

  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, css(tone([26, 18, 51], [14, 17, 32])))
  sky.addColorStop(0.55, css(tone([98, 62, 132], [38, 48, 78])))
  sky.addColorStop(1, css(tone([242, 167, 160], [84, 100, 136])))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // Things far away move less than things close by.
  const far = (1 - rise) * h * 0.25 - sink * h * 0.5
  const mid = (1 - rise) * h * 0.5 - sink * h * 0.8

  const moon = small * 0.06
  ring(ctx, w * 0.5, h * 0.2 + far * 0.2, moon, moon, 1)
  ctx.closePath()
  ctx.fillStyle = css([255, 236, 214], 0.9 - storm * 0.75)
  ctx.fill()
  ctx.lineWidth = 1.2
  ctx.strokeStyle = css([38, 28, 58], 0.6 - storm * 0.4)
  ctx.stroke()

  const towers = [
    { x: 0.84, y: 0.5, half: 0.1, spire: true },
    { x: 0.1, y: 0.62, half: 0.075, spire: false },
  ]
  for (const tower of towers) {
    const x = w * tower.x
    const y = h * tower.y + mid
    const half = small * tower.half
    block(
      ctx,
      x,
      y,
      half,
      h * 2,
      tone([214, 150, 170], [84, 98, 134]),
      tone([150, 100, 150], [58, 68, 104]),
      tone([98, 68, 124], [40, 48, 80]),
    )
    if (tower.spire) {
      const tip = y - half * 1.5
      sketch(
        ctx,
        [
          [x - half * 0.5, y],
          [x, y + half * 0.25],
          [x, tip],
        ],
        css(tone([236, 176, 180], [96, 110, 146])),
      )
      sketch(
        ctx,
        [
          [x, y + half * 0.25],
          [x + half * 0.5, y],
          [x, tip],
        ],
        css(tone([170, 116, 160], [66, 78, 112])),
        7,
      )
    }
  }

  const t = terrace(f)
  block(
    ctx,
    t.x,
    t.y,
    t.half,
    h * 3,
    tone([240, 204, 196], [104, 118, 152]),
    tone([188, 134, 160], [70, 82, 118]),
    tone([128, 90, 144], [48, 58, 92]),
  )

  // She goes down with the reader, so she does not leave with the terrace.
  const girlX = t.x
  const girlY = h * 0.66 + (1 - rise) * h * 0.8 - sink * h * 0.08
  const girlSize = h * 0.2
  const cloth = tone([255, 255, 255], [226, 230, 244])

  /*
    The puddle has no drawn edge. It is a wet stain of no regular shape,
    darker towards the middle, and what shows that it is water is the rings
    on it. The rings move out as the page is scrolled down, and back in when
    it is scrolled up.
  */
  if (puddle > 0) {
    const rx = t.half * 0.74 * puddle
    const ry = rx * 0.44
    const stain = (size: number) => {
      ctx.beginPath()
      for (let i = 0; i < 48; i++) {
        const angle = (i / 48) * Math.PI * 2
        const r =
          size *
          (1 +
            0.13 * Math.sin(angle * 3 + 1) +
            0.08 * Math.sin(angle * 5 + 2.3) +
            0.05 * Math.sin(angle * 8 + size * 9))
        ctx.lineTo(t.x + Math.cos(angle) * rx * r, t.y + Math.sin(angle) * ry * r)
      }
      ctx.closePath()
    }
    ctx.fillStyle = 'rgba(40,62,120,0.2)'
    for (const size of [1, 0.9, 0.78, 0.62, 0.42]) {
      stain(size)
      ctx.fill()
    }

    ctx.save()
    stain(1)
    ctx.clip()

    // Her reflection: the same figure upside down, squashed and faint.
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.translate(girlX, t.y)
    ctx.scale(1, -0.55)
    girl(ctx, 0, 0, girlSize, cloth)
    ctx.restore()

    ctx.lineWidth = 1.3
    for (let i = 0; i < PUDDLE_RINGS; i++) {
      const phase = fract(scroll * 0.8 + i / PUDDLE_RINGS)
      ring(ctx, t.x, t.y, rx * phase, ry * phase, i * 1.7)
      ctx.strokeStyle = `rgba(226,238,255,${Math.sin(phase * Math.PI) * 0.7})`
      ctx.stroke()
    }
    for (let i = 0; i < RIPPLE_SOURCES; i++) {
      const angle = rand(i, 5) * Math.PI * 2
      const reach = Math.sqrt(rand(i, 6)) * 0.7
      const x = t.x + Math.cos(angle) * rx * reach
      const y = t.y + Math.sin(angle) * ry * reach
      for (let n = 0; n < 2; n++) {
        const phase = fract(rand(i, 7) + scroll * 1.3 + n * 0.4)
        const r = phase * t.half * 0.16
        ring(ctx, x, y, r, r * 0.44, i + n * 2.1)
        ctx.strokeStyle = `rgba(226,238,255,${(1 - phase) * 0.6})`
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  girl(ctx, girlX, girlY, girlSize, cloth)

  /*
    The rain is not animated by time. Each drop's place depends only on how
    far the page is scrolled, so the rain falls when the reader scrolls down,
    stops when they stop and goes back up when they scroll up. As the ground
    starts to curve, the drops stop falling side by side and drift apart,
    the way parallel lines do in hyperbolic space.
  */
  const drops = Math.floor(MAX_DROPS * beat('rain', p) * (1 - beat('rainStops', p)))
  const bend = beat('bend', p) * 0.55
  const path = (x: number, y: number) => x + (x - w / 2) * bend * (y / h) ** 2
  for (let i = 0; i < drops; i++) {
    const x = (rand(i, 1) * 1.2 - 0.1) * w
    const length = h * (0.04 + rand(i, 3) * 0.06)
    const speed = 0.7 + rand(i, 2) * 0.9
    const y = fract(rand(i, 4) + scroll * speed) * (h + length) - length
    ctx.beginPath()
    ctx.moveTo(path(x, y), y)
    // A drop is a quick pencil mark, so it is not quite straight.
    ctx.quadraticCurveTo(
      path(x, y + length / 2) + (rand(i, 10) - 0.5) * 3,
      y + length / 2,
      path(x, y + length),
      y + length,
    )
    ctx.lineWidth = 1 + rand(i, 8) * 0.8
    ctx.strokeStyle = `rgba(206,224,255,${0.25 + rand(i, 9) * 0.35})`
    ctx.stroke()
  }
}
