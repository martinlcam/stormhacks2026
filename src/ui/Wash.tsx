import { useId, useLayoutEffect, useRef, useState } from 'react'

/* The colours a bloom can be: the title's green, the water's blue and the light's yellow. */
const BLOOMS = { green: '#cdf075', blue: '#8fbde6', yellow: '#f5d84a' } as const

export type Bloom = keyof typeof BLOOMS

/*
  How far the sheet's edge sits inside the panel, as a fraction of its width
  and of its height, and never more than INSET_MOST pixels, so that the
  paper of a tall panel still reaches past the padding round its text.
*/
const INSET = { x: 0.04, y: 0.05 }
const INSET_MOST = 14

/*
  Where the first and second bloom sit in the sheet: the middle, as
  fractions of its size and at most BLOOM_REACH pixels in from its nearer
  corner, and the size, as fractions. A bloom is never taller than it is wide.
*/
const PLACES = [
  { x: 0.18, y: 0.16, rx: 0.2, ry: 0.13 },
  { x: 0.84, y: 0.85, rx: 0.2, ry: 0.13 },
] as const
const BLOOM_REACH = 70

/*
  A sheet of the landing page's watercolour paper, to put behind text: an
  off-white wash with an uneven edge, darker where the pigment collected as
  it dried, a fine grain, and up to two paler blooms of colour. It fills the
  nearest positioned parent, so the parent should be `relative` and have
  room round its text for the edge. It is all SVG filters, so it needs no
  images and stays sharp at any size.
*/
export function Wash({
  rough = 26,
  seed = 3,
  blooms = [],
  radius = 30,
}: {
  /* How far the edge wanders, in pixels. A small panel wants a small number. */
  rough?: number
  /* Changes the shape, so that no two panels are cut alike. */
  seed?: number
  /* Blooms of colour in the paper: the first at the top left, the second at the bottom right. */
  blooms?: readonly Bloom[]
  /* The roundness of the sheet's corners before its edge is roughened, in pixels. */
  radius?: number
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Measured, so that the edge and the blooms can be placed in pixels. Until then, fractions do.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((was) => (was?.width === width && was.height === height ? was : { width, height }))
    })
    observer.observe(svg.current!)
    return () => observer.disconnect()
  }, [])

  const inset = (fraction: number, length: number) => Math.min(fraction * length, INSET_MOST)
  const box = size
    ? {
        x: inset(INSET.x, size.width),
        y: inset(INSET.y, size.height),
        width: size.width - 2 * inset(INSET.x, size.width),
        height: size.height - 2 * inset(INSET.y, size.height),
      }
    : { x: '4%', y: '5%', width: '92%', height: '90%' }

  const place = (i: number) => {
    const { x, y, rx, ry } = PLACES[i]
    if (!size) {
      return { cx: `${x * 100}%`, cy: `${y * 100}%`, rx: `${rx * 100}%`, ry: `${ry * 100}%` }
    }

    const { width, height } = size
    const across = rx * width
    // In from the nearer edge, each way.
    const along = (fraction: number, length: number) =>
      fraction < 0.5
        ? Math.min(fraction * length, BLOOM_REACH)
        : length - Math.min((1 - fraction) * length, BLOOM_REACH)
    return {
      cx: along(x, width),
      cy: along(y, height),
      rx: across,
      ry: Math.min(ry * height, across),
    }
  }

  const sheet = (fill: string, opacity: number) => (
    <rect {...box} rx={radius} fill={fill} fillOpacity={opacity} filter={`url(#${id}paper)`} />
  )

  return (
    // On a layer of its own, so that the text over it changing does not run the filters again.
    <svg
      ref={svg}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ willChange: 'transform' }}
      aria-hidden
    >
      <defs>
        <WashFilter id={`${id}paper`} seed={seed} rough={rough} rim={0.5} />
        <WashFilter id={`${id}bloom`} seed={seed + 18} rough={rough * 1.3} rim={1} />
        {blooms.map((bloom) => (
          <radialGradient key={bloom} id={`${id}${bloom}`}>
            {/* Pale in the middle and stronger at the edge, where the pigment dried. */}
            <stop offset="0" stopColor={BLOOMS[bloom]} stopOpacity="0.18" />
            <stop offset="0.7" stopColor={BLOOMS[bloom]} stopOpacity="0.35" />
            <stop offset="1" stopColor={BLOOMS[bloom]} stopOpacity="0.55" />
          </radialGradient>
        ))}
        {/* The blooms are in the paper, so they stop where it does. */}
        <mask
          id={`${id}inside`}
          maskUnits="userSpaceOnUse"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          {sheet('#fff', 1)}
        </mask>
      </defs>
      {/* Opaque, as paper is, so that nothing in the world shows through the writing. */}
      {sheet('#f7f4ee', 1)}
      {blooms.length > 0 && (
        <g mask={`url(#${id}inside)`} style={{ mixBlendMode: 'multiply' }}>
          {blooms.slice(0, PLACES.length).map((bloom, i) => (
            <ellipse
              key={bloom}
              {...place(i)}
              fill={`url(#${id}${bloom})`}
              filter={`url(#${id}bloom)`}
            />
          ))}
        </g>
      )}
    </svg>
  )
}

/* The filter that makes a shape a wash: a wandering edge, a dried rim and a grain. */
function WashFilter({
  id,
  seed,
  rough,
  rim,
}: {
  id: string
  seed: number
  rough: number
  /* How strongly the rim shows, from nothing at 0 to as strong as the wash itself at 1. */
  rim: number
}) {
  return (
    // The region is generous, so that a thin strip's edge can wander without being cut off.
    <filter id={id} x="-30%" y="-60%" width="160%" height="220%" colorInterpolationFilters="sRGB">
      {/* Watercolour never dries to a straight edge: soft noise pushes the shape about. */}
      <feTurbulence type="fractalNoise" baseFrequency="0.017" numOctaves="3" seed={seed} />
      <feDisplacementMap
        in="SourceGraphic"
        scale={rough}
        xChannelSelector="R"
        yChannelSelector="G"
        result="shape"
      />
      <feGaussianBlur in="shape" stdDeviation="0.7" result="soft" />
      {/*
        The rim, where the pigment collected as it dried. A pale wash is made
        solid first, or all of it would count as edge and be darkened.
      */}
      <feComponentTransfer in="soft" result="solid">
        <feFuncA type="linear" slope="8" />
      </feComponentTransfer>
      <feMorphology in="solid" operator="erode" radius="2" result="inside" />
      <feComposite in="soft" in2="inside" operator="out" result="rim" />
      <feColorMatrix
        in="rim"
        type="matrix"
        values={`0.62 0 0 0 0  0 0.6 0 0 0  0 0 0.56 0 0  0 0 0 ${rim} 0`}
        result="darkRim"
      />
      {/* Grain: faint dark specks, only where the wash is. */}
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed + 7} />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.3  0 0 0 0 0.27  0 0 0 0 0.24  0.6 0 0 0 -0.22"
        result="specks"
      />
      <feComposite in="specks" in2="soft" operator="in" result="grain" />
      <feMerge>
        <feMergeNode in="soft" />
        <feMergeNode in="darkRim" />
        <feMergeNode in="grain" />
      </feMerge>
    </filter>
  )
}
