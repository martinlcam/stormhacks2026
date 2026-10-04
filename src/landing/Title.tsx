import { INK } from './art'

/* Where the title's baseline is in the frame, which its reflection is mirrored about. */
const BASELINE = 787

/*
  "nullspace", its reflection fading below it, and what WÚ means. The
  reflection is the word turned upside down about its baseline. The lights
  behind it are drawn by the watercolour shader (`fx.ts`), so that they can
  grow and join.
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
