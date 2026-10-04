import { useEffect, useState } from 'react'
import { discoveries } from '../game/discoveries'
import { useGame } from '../game/store'
import { PAGE_GRAIN, art } from '../landing/art'
import { Wash } from './Wash'

const CARD_SECONDS = 12
const TOTAL = Object.keys(discoveries).length
/* The ending: how long the last card is left to be read, and how long the fade to white takes. */
const ENDING_WAIT_SECONDS = 4
const ENDING_FADE_SECONDS = 3
/* A stroke of watercolour from the title's green to the water's blue, for anything that fills up. */
const STROKE = 'linear-gradient(90deg, rgba(205,240,117,0.9), rgba(143,189,230,0.9))'

/*
  Everything written over the game, each on a sheet of the landing page's
  watercolour paper, in its inks and Helvetica.
*/
export function Hud({
  onPlay,
  showStartScreen = true,
  showDiscoveries = true,
}: {
  onPlay: () => void
  showStartScreen?: boolean
  showDiscoveries?: boolean
}) {
  const playing = useGame((s) => s.playing)
  const ending = useEnding(showDiscoveries)
  const ended = ending.phase === 'shown'

  return (
    <div className="pointer-events-none absolute inset-0 font-sans select-none">
      {playing ? <Crosshair /> : showStartScreen && !ended && <StartScreen onPlay={onPlay} />}
      {playing && <Goal />}
      <Stats />
      {showDiscoveries && <Points />}
      {showDiscoveries && <DiscoveryCard />}
      {showDiscoveries && (
        <Ending
          phase={ending.phase}
          onContinue={() => {
            ending.dismiss()
            onPlay()
          }}
        />
      )}
    </div>
  )
}

type EndingPhase = 'waiting' | 'fading' | 'shown' | 'dismissed'

/*
  The ending, once every point is scored: the last card is left up for a
  moment, the world fades to white, and then the ending screen appears.
*/
function useEnding(enabled: boolean) {
  const complete = useGame((s) => s.found.length === TOTAL)
  const [phase, setPhase] = useState<EndingPhase>('waiting')

  useEffect(() => {
    if (!enabled || !complete) return
    const fade = setTimeout(() => setPhase('fading'), ENDING_WAIT_SECONDS * 1000)
    const show = setTimeout(
      () => {
        setPhase('shown')
        // Give the mouse back, for the buttons.
        document.exitPointerLock()
      },
      (ENDING_WAIT_SECONDS + ENDING_FADE_SECONDS) * 1000,
    )
    return () => {
      clearTimeout(fade)
      clearTimeout(show)
    }
  }, [enabled, complete])

  return { phase, dismiss: () => setPhase('dismissed') }
}

/* The world fades to the landing page's paper, and the ending is written on it. */
function Ending({ phase, onContinue }: { phase: EndingPhase; onContinue: () => void }) {
  const found = useGame((s) => s.found)
  const white = phase === 'fading' || phase === 'shown'
  const shown = phase === 'shown'
  return (
    <div
      className={`absolute inset-0 bg-paper transition-opacity ease-in ${white ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: `${phase === 'dismissed' ? 1 : ENDING_FADE_SECONDS}s` }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${art.grain})`, opacity: PAGE_GRAIN }}
      />
      <div
        className={`relative flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-4 py-8 font-light text-caption transition-all duration-1000 ${shown ? 'pointer-events-auto translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
      >
        <h1 className="m-0 text-6xl font-bold tracking-[-0.08em] text-ink">WÚ 無</h1>
        <p className="m-0 text-2xl tracking-[-0.05em]">nothing left to find.</p>
        <p className="m-0 text-sm tracking-[-0.02em] tabular-nums">
          {found.length} / {TOTAL} points
        </p>
        <ul className="m-0 grid max-w-2xl list-none grid-cols-1 gap-x-8 gap-y-1 p-0 text-sm tracking-[-0.02em] sm:grid-cols-2">
          {found.map((id) => (
            <li key={id}>
              <span className="text-ink">✓</span> {discoveries[id].title}
            </li>
          ))}
        </ul>
        <p className="m-0 max-w-md text-center text-sm tracking-[-0.02em] opacity-80">
          every room here was ordinary. only the way they were joined together was not.
        </p>
        <div className="flex gap-3">
          <PaperButton onClick={onContinue} focusable={shown} seed={31}>
            keep exploring
          </PaperButton>
          <PaperButton onClick={() => location.reload()} focusable={shown} seed={37} bloom>
            play again
          </PaperButton>
        </div>
      </div>
    </div>
  )
}

/* A button written on a scrap of watercolour paper. */
function PaperButton({
  onClick,
  focusable,
  seed,
  bloom = false,
  children,
}: {
  onClick: () => void
  focusable: boolean
  seed: number
  bloom?: boolean
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={focusable ? 0 : -1}
      className="relative cursor-pointer border-0 bg-transparent px-8 py-4 text-sm font-light tracking-[-0.03em] text-ink transition-transform hover:scale-105"
    >
      <Wash rough={9} seed={seed} radius={16} blooms={bloom ? ['blue'] : []} />
      <span className="relative">{children}</span>
    </button>
  )
}

/* The score: a point for everything found, out of everything there is to find. */
function Points() {
  const found = useGame((s) => s.found.length)
  return (
    <div className="absolute top-2 left-2 px-7 pt-4 pb-5">
      <Wash rough={14} seed={5} radius={22} blooms={['green']} />
      <div className="relative">
        <div className="text-xs font-light tracking-[-0.02em] text-caption">points</div>
        <div className="text-3xl leading-tight font-light tracking-[-0.06em] text-ink tabular-nums">
          {/* Keyed by the score, so that each new point plays the pulse again. */}
          <span
            key={found}
            className={found > 0 ? 'inline-block animate-[point_0.6s_ease-out]' : ''}
          >
            {found}
          </span>
          <span className="text-base text-caption opacity-70"> / {TOTAL}</span>
        </div>
        <Stroke fill={found / TOTAL} className="mt-1.5 w-28" track="bg-caption/30" eased />
      </div>
    </div>
  )
}

/*
  A pencil line, with a stroke of watercolour along it as far as `fill` (0 to 1).
  `eased` glides to a new length, for a value that changes now and then. A
  value that changes every frame must not be: each change would start the
  glide again from its slow beginning, and the stroke would hang back and
  then jump.
*/
function Stroke({
  fill,
  className,
  track,
  eased = false,
}: {
  fill: number
  className: string
  track: string
  eased?: boolean
}) {
  return (
    <div className={`relative h-1.5 ${className}`}>
      <div className={`absolute inset-x-0 top-1/2 h-px ${track}`} />
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${eased ? 'transition-[width] duration-700' : ''}`}
        style={{ width: `${fill * 100}%`, background: STROKE }}
      />
    </div>
  )
}

function Crosshair() {
  const prompt = useGame((s) => s.prompt)
  const charge = useGame((s) => s.charge)
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="size-1.5 rounded-full bg-bone/80 ring-1 ring-black/40" />
      {charge !== null && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2">
          <Stroke fill={charge} className="w-28" track="bg-bone/50" />
        </div>
      )}
      {prompt && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 px-5 py-2.5 whitespace-nowrap">
          <Wash rough={7} seed={9} radius={12} />
          <span className="relative text-sm font-light tracking-[-0.03em] text-ink">{prompt}</span>
        </div>
      )}
    </div>
  )
}

/* The goals of the puzzles the player is standing at, each on a strip of paper. */
function Goal() {
  const goal = useGame((s) => s.goal)
  if (!goal) return null
  return (
    <div className="absolute top-2 left-1/2 flex w-max max-w-[min(38rem,calc(100%-20rem))] -translate-x-1/2 flex-col items-center">
      {goal.split('\n').map((line, i) => (
        <div key={line} className="relative px-7 py-3 text-center">
          <Wash rough={9} seed={11 + i * 4} radius={14} />
          <span className="relative text-sm font-light tracking-[-0.03em] text-ink">{line}</span>
        </div>
      ))}
    </div>
  )
}

/* What the game is and how to play it, while the mouse is free. A click anywhere goes on. */
function StartScreen({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="pointer-events-auto absolute inset-0 flex cursor-pointer items-center justify-center border-0 bg-night/55 p-4 backdrop-blur-[2px]"
    >
      <div className="relative w-[min(30rem,100%)] px-14 pt-12 pb-14 text-left font-light text-caption">
        <Wash rough={34} seed={2} radius={40} blooms={['green', 'blue']} />
        <div className="relative">
          <h1 className="m-0 text-5xl font-bold tracking-[-0.08em] text-ink">WÚ 無</h1>
          <p className="mt-2 mb-0 text-lg tracking-[-0.04em]">click to enter</p>
          <p className="mt-4 mb-0 text-sm leading-relaxed tracking-[-0.02em]">
            you start holding the amber lamp. carry its light through the doorways, press E to put
            it down, or hold Q to throw it. there’s also a Minecraft lantern on the ground to your
            left.
          </p>
          <dl className="mt-5 mb-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-sm tracking-[-0.02em]">
            {CONTROLS.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt className="font-medium text-ink">{keys}</dt>
                <dd className="m-0">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </button>
  )
}

const CONTROLS = [
  ['WASD', 'move'],
  ['mouse', 'look'],
  ['shift', 'run'],
  ['space', 'jump'],
  ['E', 'pick up / put down'],
  ['Q', 'throw (hold to charge)'],
  ['F', 'turn a wheel (hold)'],
  ['R', 'back to the start'],
  ['M', 'sound off / on'],
  ['esc', 'free the mouse'],
] as const

function Stats() {
  const fps = useGame((s) => s.fps)
  const passes = useGame((s) => s.passes)
  const scale = useGame((s) => s.scale)
  return (
    <div className="absolute top-3 right-4 text-right text-xs font-light text-bone/50 tabular-nums">
      <div>
        {fps} fps · {passes} views
      </div>
      {scale !== 1 && <div className="text-purple">size {formatScale(scale)}</div>}
    </div>
  )
}

function formatScale(scale: number) {
  return scale < 1 ? `1/${Math.round(1 / scale)}` : `×${Math.round(scale)}`
}

/* What the player has just found, and the maths of it, on a sheet of paper at the bottom. */
function DiscoveryCard() {
  const card = useGame((s) => s.card)
  const dismiss = useGame((s) => s.dismissCard)

  useEffect(() => {
    if (!card) return
    const timer = setTimeout(dismiss, CARD_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [card, dismiss])

  if (!card) return null
  return (
    <div className="absolute bottom-5 left-1/2 w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 px-11 pt-9 pb-10 font-light text-caption transition-opacity duration-700 starting:opacity-0">
      <Wash rough={28} seed={14} radius={34} blooms={['yellow', 'blue']} />
      <div className="relative">
        <div className="text-xs tracking-[-0.01em]">discovered</div>
        <h2 className="mt-1 mb-0 text-2xl leading-tight font-light tracking-[-0.06em] text-ink">
          {card.title}
        </h2>
        <p className="mt-2 mb-0 text-[0.95rem] leading-relaxed tracking-[-0.02em]">{card.body}</p>
        <p className="mt-2 mb-0 text-sm leading-relaxed tracking-[-0.01em] opacity-75">
          {card.maths}
        </p>
      </div>
    </div>
  )
}
