import { type RefObject, createRef } from 'react'
import { INK } from './art'
import { GATHER, ramp } from './timeline'

/* Where the title's baseline is in the frame, which its reflection is mirrored about. */
const BASELINE = 787
/* The word's letter spacing, as in the Figma file, and how much tighter it gets as it gathers. */
const SPACING = -44
const SQUEEZE = 160
/* The grey of the type, and the black it darkens to as it becomes the ball (0 to 255). */
const GREY = 0x43
const BLACK = 0x14

/* The parts of the title that change as it gathers into the ball. */
export interface TitleParts {
  group: RefObject<SVGGElement | null>
  word: RefObject<SVGTextElement | null>
  reflection: RefObject<SVGTextElement | null>
  definition: RefObject<SVGTextElement | null>
}

export function titleParts(): TitleParts {
  return { group: createRef(), word: createRef(), reflection: createRef(), definition: createRef() }
}

/*
  "nullspace", its reflection fading below it, and what WÚ means. The
  reflection is the word turned upside down about its baseline. The lights
  behind it are drawn by the watercolour shader (`fx.ts`), so that they can
  grow and join.
*/
export function TitleText({ parts }: { parts: TitleParts }) {
  const { group, word, reflection, definition } = parts
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
      <g ref={group}>
        <text
          ref={word}
          x="1080"
          y={BASELINE}
          textAnchor="middle"
          fontSize="400"
          letterSpacing={SPACING}
          {...type}
        >
          nullspace
        </text>
        <text
          ref={reflection}
          x="1080"
          y={BASELINE}
          transform={`translate(0 ${BASELINE * 2}) scale(1 -1)`}
          textAnchor="middle"
          fontSize="400"
          letterSpacing={SPACING}
          fontWeight={700}
          fill="url(#title-reflection)"
          aria-hidden
        >
          nullspace
        </text>
        <text
          ref={definition}
          x="1123"
          y="947"
          textAnchor="middle"
          fontSize="40"
          letterSpacing="-4.4"
          {...type}
        >
          WÚ (無): negative, void, nothingness, non-being; can imply 'neither yes nor no'.
        </text>
      </g>
    </svg>
  )
}

/*
  Draw the title's words `amount` of the way (0 to 1) into a point: they
  crowd together, shrink towards where they gather and darken to black, and
  the reflection and the line under them go first. It starts slowly and
  quickens, as if pulled in.
*/
export function gatherTitle(parts: TitleParts, amount: number) {
  const pull = amount * amount
  const size = 1 - 0.985 * pull
  const spacing = String(SPACING - SQUEEZE * pull)
  const grey = Math.round(GREY + (BLACK - GREY) * pull)
  parts.group.current!.setAttribute(
    'transform',
    `translate(${GATHER.x} ${GATHER.y}) scale(${size}) translate(${-GATHER.x} ${-GATHER.y})`,
  )
  parts.word.current!.setAttribute('letter-spacing', spacing)
  parts.word.current!.setAttribute('fill', `rgb(${grey},${grey},${grey})`)
  parts.reflection.current!.setAttribute('letter-spacing', spacing)
  parts.reflection.current!.style.opacity = String(1 - ramp(0, 0.4, amount))
  parts.definition.current!.style.opacity = String(1 - ramp(0, 0.5, amount))
}
