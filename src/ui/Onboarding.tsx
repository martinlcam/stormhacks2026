import { useEffect, useState } from 'react'
import { discoveries } from '../game/discoveries'
import { type Lesson, useGame } from '../game/store'
import { CAPTION_INK, INK } from '../landing/art'
import { Wash } from './Wash'

const TOTAL = Object.keys(discoveries).length

const LESSONS: { lesson: Lesson; keys: string; what: string }[] = [
  { lesson: 'move', keys: 'WASD', what: 'move' },
  { lesson: 'look', keys: 'mouse', what: 'look around' },
  { lesson: 'jump', keys: 'space', what: 'jump' },
  { lesson: 'pickUp', keys: 'E', what: 'put the lamp down, pick it up' },
]

/* Seconds the panel stays with everything ticked, and then takes to fade. */
const LINGER = 1.2
const FADE = 0.8

type Phase = 'showing' | 'fading' | 'gone'

/*
  The controls, in the top left under the score, for a player who has just
  come in, written on a wash of watercolour paper like the landing page.
  Each is struck through and ticked the first time it is used, and once all
  of them are, the panel fades away and does not come back. It also fades
  once everything in the world is found or the player ends the game, so it
  is gone before the ending.
*/
export function Onboarding() {
  const playing = useGame((s) => s.playing)
  const learned = useGame((s) => s.learned)
  const complete = useGame((s) => s.found.length === TOTAL)
  const ended = useGame((s) => s.ends > 0)
  const done = complete || ended || Object.values(learned).every(Boolean)
  const [phase, setPhase] = useState<Phase>('showing')

  useEffect(() => {
    if (!done) return
    const fade = setTimeout(() => setPhase('fading'), LINGER * 1000)
    const gone = setTimeout(() => setPhase('gone'), (LINGER + FADE) * 1000)
    return () => {
      clearTimeout(fade)
      clearTimeout(gone)
    }
  }, [done])

  if (phase === 'gone' || !playing) return null
  return (
    <div
      className={`pointer-events-none absolute top-28 left-2 w-[22.5rem] px-8 pt-7 pb-8 transition-[opacity,scale] duration-1000 starting:scale-95 starting:opacity-0 ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <Wash blooms={['green', 'blue']} />
      <div className="relative">
        <p
          className="m-0 text-2xl leading-none font-light tracking-[-0.07em]"
          style={{ color: INK }}
        >
          find your feet
        </p>
        <ul className="mt-4 mb-0 list-none space-y-1.5 p-0">
          {LESSONS.map(({ lesson, keys, what }) => (
            <li
              key={lesson}
              className="flex items-center gap-3 text-[0.95rem] font-light tracking-[-0.04em]"
              style={{ color: CAPTION_INK }}
            >
              <span className="w-12 shrink-0 font-medium tracking-[-0.03em]" style={{ color: INK }}>
                {keys}
              </span>
              <span
                className={`relative transition-opacity duration-500 ${learned[lesson] ? 'opacity-45' : ''}`}
              >
                {what}
                {/* A pencil line through it, drawn from the left once it has been done. */}
                <span
                  className={`absolute top-[55%] -right-1 -left-1 h-px origin-left -rotate-1 transition-transform duration-500 ease-out ${
                    learned[lesson] ? 'scale-x-100' : 'scale-x-0'
                  }`}
                  style={{ background: CAPTION_INK }}
                />
              </span>
              <Tick done={learned[lesson]} />
            </li>
          ))}
        </ul>
        <p
          className="mt-4 mb-0 text-xs leading-snug font-light tracking-[-0.02em] opacity-75"
          style={{ color: CAPTION_INK }}
        >
          shift run · hold Q throw · M sound
          <br />R back to the start · esc free the mouse
        </p>
      </div>
    </div>
  )
}

/* A tick as if by pencil, drawn in once the control has been used. */
function Tick({ done }: { done: boolean }) {
  return (
    <svg viewBox="0 0 16 14" className="ml-auto h-3.5 w-4 shrink-0 overflow-visible" aria-hidden>
      <path
        d="M1.5 7.6 C3 8.5 4.3 9.9 5.5 12.2 C7.5 7.5 10.4 3.9 14.6 1.3"
        fill="none"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        className="transition-[stroke-dashoffset] duration-500 ease-out"
        style={{ strokeDashoffset: done ? 0 : 1, opacity: done ? 1 : 0 }}
      />
    </svg>
  )
}
