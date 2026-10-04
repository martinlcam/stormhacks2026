import { INK, art } from './art'

/* Where the title's baseline is in the frame, which its reflection is mirrored about. */
const BASELINE = 787

/*
  The two soft lights behind the title, green and yellow, placed as in the
  Figma file. They fill the window, so they are cut off rather than shrunk
  when its shape is not the frame's.
*/
export function TitleBackdrop() {
  return (
    <svg
      viewBox="0 0 2160 1440"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 block h-full w-full"
      aria-hidden
    >
      <image href={art.gradientGreen} x={-378.95} y={-232.89} width={1807.38} height={1807.38} />
      <g transform="translate(1471.96 779.85) rotate(162.44)">
        <image href={art.gradientYellow} x={-845.3} y={-784.63} width={1643.52} height={1643.52} />
      </g>
    </svg>
  )
}

/*
  "nullspace", its reflection fading below it, and what WÚ means. The
  reflection is the word turned upside down about its baseline.
*/
export function TitleText() {
  const type = { fontWeight: 700, fill: INK } as const

  return (
    <svg viewBox="0 0 2160 1440" className="absolute inset-0 block h-full w-full">
      <defs>
        {/* In the reflection's own coordinates, which are upside down: 657 is below the baseline. */}
        <linearGradient
          id="title-reflection"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={BASELINE}
          x2="0"
          y2="657"
        >
          <stop offset="0" stopColor={INK} stopOpacity="0.24" />
          <stop offset="1" stopColor={INK} stopOpacity="0" />
        </linearGradient>
      </defs>
      <text x="1080" y={BASELINE} textAnchor="middle" fontSize="400" letterSpacing="-44" {...type}>
        nullspace
      </text>
      <text
        x="1080"
        y={BASELINE}
        transform={`translate(0 ${BASELINE * 2}) scale(1 -1)`}
        textAnchor="middle"
        fontSize="400"
        letterSpacing="-44"
        fontWeight={700}
        fill="url(#title-reflection)"
        aria-hidden
      >
        nullspace
      </text>
      <text x="1123" y="947" textAnchor="middle" fontSize="40" letterSpacing="-4.4" {...type}>
        WÚ (無): negative, void, nothingness, non-being; can imply 'neither yes nor no'.
      </text>
    </svg>
  )
}
