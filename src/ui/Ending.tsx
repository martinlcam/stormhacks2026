import { type ReactNode, useEffect, useRef, useState } from 'react'
import { discoveries } from '../game/discoveries'
import { useGame } from '../game/store'
import { PAGE_GRAIN, type Rect, percent, place } from '../landing/art'
import { FRAME } from '../landing/timeline'
import { PaperButton } from './PaperButton'

const TOTAL = Object.keys(discoveries).length
/* How long the last card is left to be read, and how long the fade to white takes. */
const WAIT_SECONDS = 4
const FADE_SECONDS = 3

const dir = `${import.meta.env.BASE_URL}ending/`

/*
  Textures-2 1, as the Figma file shows it: its fill brightens the texture
  with an exposure filter (+0.52) before laying it over the frame at 17%.
  This is the landing page's grain.jpg put through that filter, matched
  against Figma's own render of it.
*/
const GRAIN = `${dir}grain.jpg`

/* The four drawings of the girl at her desk from the Figma file's ending frames, in order. */
const GIRL = [1, 2, 3, 4].map((i) => `${dir}girl-${i}.jpg`)
const GIRL_RECT: Rect = { x: 134, y: 289, w: 1245, h: 830 }
/* The drawings turn over once a second, like the pages of a flipbook. */
const GIRL_SECONDS = 1

/*
  The heading and the line of the sentence in each of the four frames. A line
  stays up for a whole turn of the drawings, long enough to be read.
*/
const LINES = [
  { heading: '無', caption: 'the world we create within ourselves,' },
  { heading: 'wú', caption: 'we can only wish would be our reality sometimes.' },
  { heading: '無', caption: 'when we drift away into our lives, maybe we can' },
  { heading: 'wú', caption: 'just let our minds wander and express.' },
] as const
const LINE_SECONDS = GIRL_SECONDS * GIRL.length

const NAMES = ['martin cam', 'owen skippen', 'alexander ng', 'johnny ho']

/* The right edge of the heading and the credits, and the middles of the caption and the score. */
const RIGHT = 1915
const CAPTION_X = 1079.5
const SCORE_X = 544.5

/* The green light as it is in the first frame, and how far its blur reaches past that box. */
const BLOB: Rect = { x: 1440, y: 314, w: 401.63, h: 424.48 }
const BLOB_BLEED = { top: 41.48, right: 49.53, bottom: 47.12, left: 49.8 }
/*
  Where the light is in each of the four frames, measured from where it is in
  the first: how far its middle has moved and how far it has turned, in
  degrees. It floats through them in turn, reaching each as its line comes up.
*/
const BLOB_PATH = [
  [0, 0, 0],
  [111, 211, 0],
  [136, 455, 0],
  [29.4, 209.7, -84.3],
] as const

export type EndingPhase = 'waiting' | 'fading' | 'shown' | 'dismissed'

/*
  The ending. Once every point is scored, the last card is left up for a
  moment to be read; when the player ends the game (P, or credits in the
  pause menu), it comes at once, with the score as it is. Either way the
  world fades to white, and then the ending screen appears.
*/
export function useEnding(enabled: boolean) {
  const complete = useGame((s) => s.found.length === TOTAL)
  const ends = useGame((s) => s.ends)
  const [phase, setPhase] = useState<EndingPhase>('waiting')
  // How many of the player's asks for the end have been answered.
  const answered = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const asked = ends > answered.current
    answered.current = ends
    if (!asked && !complete) return
    const wait = asked ? 0 : WAIT_SECONDS
    const fade = setTimeout(() => setPhase('fading'), wait * 1000)
    const show = setTimeout(
      () => {
        setPhase('shown')
        // Give the mouse back, for the buttons.
        document.exitPointerLock()
      },
      (wait + FADE_SECONDS) * 1000,
    )
    return () => {
      clearTimeout(fade)
      clearTimeout(show)
    }
  }, [enabled, complete, ends])

  return { phase, dismiss: () => setPhase('dismissed') }
}

/*
  The world fades to white and the ending frames of the Figma file play on
  it by themselves: the drawings of the girl turn over, the sentence goes by
  a line at a time under them, and the green light floats round the credits.
*/
export function Ending({ phase, onContinue }: { phase: EndingPhase; onContinue: () => void }) {
  const found = useGame((s) => s.found.length)
  const white = phase === 'fading' || phase === 'shown'
  const shown = phase === 'shown'
  const beat = useBeat(shown, GIRL_SECONDS)
  const girl = beat % GIRL.length
  const line = Math.floor((beat * GIRL_SECONDS) / LINE_SECONDS) % LINES.length

  return (
    <div
      className={`absolute inset-0 bg-white transition-opacity ease-in ${white ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: `${phase === 'dismissed' ? 1 : FADE_SECONDS}s` }}
    >
      {/* The frame is as large as fits in the window, and centred, as on the landing page. */}
      <div
        className={`@container absolute top-1/2 left-1/2 aspect-[3/2] w-[min(100%,150dvh)] -translate-x-1/2 -translate-y-1/2 font-light text-caption transition-opacity duration-1000 ${shown ? 'pointer-events-auto opacity-100' : 'opacity-0'}`}
      >
        {GIRL.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            className="absolute block"
            style={{ ...place(GIRL_RECT), opacity: i === girl ? 1 : 0 }}
          />
        ))}

        <Blob active={shown} />

        <Type x={SCORE_X} y={368} size={36} lineHeight={1.2}>
          <span style={{ letterSpacing: frameUnits(-3.6) }}>score:</span>
          <br />
          <span style={{ letterSpacing: frameUnits(-1.44) }}>
            {found}/{TOTAL}
          </span>
        </Type>

        {LINES.map(({ heading }, i) => (
          <Type
            key={i}
            x={RIGHT}
            y={367}
            size={128}
            spacing={-14.08}
            align="right"
            hidden={i !== line}
            className={`font-bold text-ink transition-opacity duration-700 ${i === line ? 'opacity-100' : 'opacity-0'}`}
          >
            {heading}
          </Type>
        ))}

        <Type x={RIGHT} y={498} size={64} spacing={-6.4} align="right">
          a visual experience
        </Type>

        <Type x={RIGHT} y={567} size={36} spacing={-3.6} align="right">
          curated at stormhacks ‘26
        </Type>

        <Type x={RIGHT} y={641} size={64} spacing={-6.4} align="right" lineHeight={1.25}>
          {NAMES.map((name, i) => (
            <span key={name}>
              {i > 0 && <br />}
              {name}
            </span>
          ))}
        </Type>

        {LINES.map(({ caption }, i) => (
          <Type
            key={caption}
            x={CAPTION_X}
            y={1119}
            size={64}
            spacing={-6.4}
            hidden={i !== line}
            className={`transition-opacity duration-700 ${i === line ? 'opacity-100' : 'opacity-0'}`}
          >
            {caption}
          </Type>
        ))}

        <div
          className="absolute left-1/2 flex -translate-x-1/2 gap-3"
          style={{ top: percent(1240, FRAME.h) }}
        >
          <PaperButton onClick={onContinue} focusable={shown} seed={31}>
            keep exploring
          </PaperButton>
          <PaperButton onClick={() => location.reload()} focusable={shown} seed={37} bloom>
            play again
          </PaperButton>
        </div>
      </div>

      {/* The grain, over everything, as it is in the Figma file. */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${GRAIN})`, opacity: PAGE_GRAIN }}
      />
    </div>
  )
}

/* A count that goes up by one every `seconds` while `active`, from 0. */
function useBeat(active: boolean, seconds: number) {
  const [beat, setBeat] = useState(0)

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setBeat((b) => b + 1), seconds * 1000)
    return () => clearInterval(timer)
  }, [active, seconds])

  return beat
}

/*
  The green light, floating. It drifts smoothly through where it is in each
  of the four frames, and sways and swells a little on its own as it goes, at
  rates that do not divide into each other, so that it never quite repeats.
*/
function Blob({ active }: { active: boolean }) {
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const start = performance.now()
    let frame = 0

    const draw = (now: number) => {
      const t = (now - start) / 1000
      const sway = (period: number, phase: number) => Math.sin((2 * Math.PI * t) / period + phase)
      const [x, y, turn] = loop(BLOB_PATH, t / LINE_SECONDS)
      const dx = x + 18 * sway(5.3, 0)
      const dy = y + 14 * sway(6.1, 1.7)
      const angle = turn + 10 * sway(9.7, 0.4)
      const size = 1 + 0.06 * sway(7.3, 2.9)
      element.current!.style.transform = `translate(${(dx / BLOB.w) * 100}%, ${(dy / BLOB.h) * 100}%) rotate(${angle}deg) scale(${size})`
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [active])

  return (
    <div ref={element} className="absolute will-change-transform" style={place(BLOB)}>
      <div
        className="absolute"
        style={{
          top: `-${BLOB_BLEED.top}%`,
          right: `-${BLOB_BLEED.right}%`,
          bottom: `-${BLOB_BLEED.bottom}%`,
          left: `-${BLOB_BLEED.left}%`,
        }}
      >
        <img alt="" src={`${dir}blob.svg`} className="block size-full max-w-none" />
      </div>
    </div>
  )
}

/*
  The point `t` of the way round a smooth closed curve through `points`, one
  unit of `t` from each point to the next (a Catmull-Rom spline, so that it
  passes through every point and never stops or turns sharply at one).
*/
function loop(points: readonly (readonly number[])[], t: number): number[] {
  const n = points.length
  const i = Math.floor(t)
  const u = t - i
  const at = (k: number) => points[((k % n) + n) % n]
  const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]

  return p1.map((b, d) => {
    const a = p0[d]
    const c = p2[d]
    const e = p3[d]
    return (
      0.5 *
      (2 * b +
        (c - a) * u +
        (2 * a - 5 * b + 4 * c - e) * u * u +
        (3 * b - a - 3 * c + e) * u * u * u)
    )
  })
}

/* A length in the frame's pixels, as a length that scales with the frame. */
function frameUnits(px: number) {
  return `${(px / FRAME.w) * 100}cqw`
}

/*
  Type set in the frame as in the Figma file, in its pixels: `x` is the
  middle of the text, or its right edge when it is aligned right, and `y`
  is its top. `hidden` keeps a copy that is faded out from screen readers.
*/
function Type({
  x,
  y,
  size,
  spacing = 0,
  align = 'center',
  lineHeight,
  hidden = false,
  className = '',
  children,
}: {
  x: number
  y: number
  size: number
  spacing?: number
  align?: 'center' | 'right'
  lineHeight?: number
  hidden?: boolean
  className?: string
  children: ReactNode
}) {
  const across =
    align === 'right'
      ? { right: percent(FRAME.w - x, FRAME.w), textAlign: 'right' as const }
      : { left: percent(x, FRAME.w), transform: 'translateX(-50%)', textAlign: 'center' as const }

  return (
    <p
      aria-hidden={hidden || undefined}
      className={`absolute m-0 whitespace-nowrap ${className}`}
      style={{
        ...across,
        top: percent(y, FRAME.h),
        fontSize: frameUnits(size),
        letterSpacing: frameUnits(spacing),
        lineHeight: lineHeight ?? 'normal',
      }}
    >
      {children}
    </p>
  )
}
