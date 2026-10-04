import { useEffect, useState } from 'react'
import { type Lesson, useGame } from '../game/store'

const LESSONS: { lesson: Lesson; keys: string; what: string }[] = [
  { lesson: 'move', keys: 'WASD', what: 'move' },
  { lesson: 'look', keys: 'Mouse', what: 'look around' },
  { lesson: 'jump', keys: 'Space', what: 'jump' },
  { lesson: 'pickUp', keys: 'E', what: 'put the lamp down, pick it up' },
]

/* Seconds the panel stays with everything ticked, and then takes to fade. */
const LINGER = 1.2
const FADE = 0.8

type Phase = 'showing' | 'fading' | 'gone'

/*
  The controls, in the top left, for a player who has just come in. Each is
  ticked off the first time it is used, and once all of them are, the panel
  fades away and does not come back.
*/
export function Onboarding() {
  const playing = useGame((s) => s.playing)
  const learned = useGame((s) => s.learned)
  const done = Object.values(learned).every(Boolean)
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
      className={`pointer-events-none absolute top-3 left-4 w-72 rounded-2xl border border-bone/15 bg-night/70 p-4 text-sm text-bone/90 backdrop-blur transition-opacity duration-1000 starting:opacity-0 ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <p className="mb-2 text-xs tracking-widest text-cyan uppercase">Find your feet</p>
      <ul className="space-y-1.5">
        {LESSONS.map(({ lesson, keys, what }) => (
          <li
            key={lesson}
            className={`flex items-baseline gap-3 transition-opacity duration-500 ${
              learned[lesson] ? 'opacity-40' : ''
            }`}
          >
            <span className="w-12 shrink-0 font-mono text-cyan">{keys}</span>
            <span className={learned[lesson] ? 'line-through' : ''}>{what}</span>
            {learned[lesson] && <span className="ml-auto text-cyan">✓</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-bone/50">
        Shift run · hold Q throw · R back to the start · Esc release mouse
      </p>
    </div>
  )
}
