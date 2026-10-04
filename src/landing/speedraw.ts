/*
  `?draw=speedraw` (#3): a drawing's pencil lines are put down as if by a
  quick hand, moving along the lines from one to the next, before its colour
  comes in. The order is worked out once from the lines image: the inked
  cells of a coarse grid are joined into one long path, each step going to
  the nearest cell not yet drawn.
*/

/* Drawing pixels in each cell of the grid. */
const CELL = 6
/* How dark a cell must be, from 0 to 1, to be part of a line. */
const INK = 0.22
/* More pixels than this for each CSS pixel costs speed and shows no difference. */
const MAX_PIXEL_RATIO = 1.5

export interface Speedraw {
  /* Show the lines put down by progress `t`, from 0 to 1. */
  draw(t: number): void
  dispose(): void
}

export function createSpeedraw(canvas: HTMLCanvasElement, src: string): Speedraw {
  const ctx = canvas.getContext('2d')!
  const mask = document.createElement('canvas')
  const pen = mask.getContext('2d')!
  const image = new Image()
  let order: Int32Array | null = null
  let cols = 0
  let rows = 0
  let drawn = 0
  let wanted = 0
  let alive = true

  image.src = src
  image
    .decode()
    .then(() => {
      if (!alive) return
      cols = Math.ceil(image.naturalWidth / CELL)
      rows = Math.ceil(image.naturalHeight / CELL)
      const small = document.createElement('canvas')
      small.width = cols
      small.height = rows
      const read = small.getContext('2d', { willReadFrequently: true })!
      read.drawImage(image, 0, 0, cols, rows)
      order = walk(read.getImageData(0, 0, cols, rows).data, cols, rows)
      draw(wanted)
    })
    .catch(() => {})

  // Match the canvas to its size on the page. True if it changed, which clears it.
  function fit(): boolean {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio))
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio))
    if (canvas.width === w && canvas.height === h) return false
    canvas.width = mask.width = w
    canvas.height = mask.height = h
    return true
  }

  function draw(t: number) {
    wanted = t
    if (!order) return
    const refit = fit()
    const target = Math.round(order.length * Math.min(1, Math.max(0, t)))
    if (target === drawn && !refit) return

    if (target < drawn || refit) {
      pen.clearRect(0, 0, mask.width, mask.height)
      drawn = 0
    }

    const sx = mask.width / cols
    const sy = mask.height / rows
    const radius = Math.max(sx, sy) * 1.1
    pen.fillStyle = '#000'
    pen.beginPath()
    for (let i = drawn; i < target; i++) {
      const x = ((order[i] % cols) + 0.5) * sx
      const y = (Math.floor(order[i] / cols) + 0.5) * sy
      pen.moveTo(x + radius, y)
      pen.arc(x, y, radius, 0, Math.PI * 2)
    }
    pen.fill()
    drawn = target

    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(mask, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  }

  return {
    draw,
    dispose() {
      alive = false
    },
  }
}

/*
  The inked cells of a `cols` by `rows` grid of RGBA `pixels`, in the order a
  hand would draw them: from the topmost, always on to the nearest cell not
  yet drawn. Nearest is looked for in growing square rings, so a stroke is
  followed cell by cell and a jump goes to the closest other line.
*/
export function walk(pixels: ArrayLike<number>, cols: number, rows: number): Int32Array {
  const ink = new Uint8Array(cols * rows)
  let count = 0
  for (let i = 0; i < cols * rows; i++) {
    const lum =
      (pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114) / 255
    if (1 - lum > INK) {
      ink[i] = 1
      count++
    }
  }

  const order = new Int32Array(count)
  let current = ink.indexOf(1)
  let n = 0
  while (current >= 0) {
    ink[current] = 0
    order[n++] = current
    current = nearest(ink, cols, rows, current)
  }
  return order
}

function nearest(ink: Uint8Array, cols: number, rows: number, from: number): number {
  const cx = from % cols
  const cy = Math.floor(from / cols)
  const reach = Math.max(cols, rows)
  for (let r = 1; r < reach; r++) {
    let best = -1
    let bestDistance = Infinity
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy
      if (y < 0 || y >= rows) continue
      // Along the top and bottom of the ring every cell; down its sides only the two ends.
      const step = Math.abs(dy) === r ? 1 : 2 * r
      for (let dx = -r; dx <= r; dx += step) {
        const x = cx + dx
        if (x < 0 || x >= cols || !ink[y * cols + x]) continue
        const distance = dx * dx + dy * dy
        if (distance < bestDistance) {
          bestDistance = distance
          best = y * cols + x
        }
      }
    }
    if (best >= 0) return best
  }
  return -1
}
