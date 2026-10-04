import { useEffect, useState } from 'react'
import { discoveries } from '../game/discoveries'
import { useGame } from '../game/store'

const CARD_SECONDS = 12
const TOTAL = Object.keys(discoveries).length
/* The ending: how long the last card is left to be read, and how long the fade to white takes. */
const ENDING_WAIT_SECONDS = 4
const ENDING_FADE_SECONDS = 3

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
    <div className="pointer-events-none absolute inset-0 select-none font-sans text-bone">
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

function Ending({ phase, onContinue }: { phase: EndingPhase; onContinue: () => void }) {
  const found = useGame((s) => s.found)
  const white = phase === 'fading' || phase === 'shown'
  const shown = phase === 'shown'
  return (
    <div
      className={`absolute inset-0 bg-white transition-opacity ease-in ${white ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: `${phase === 'dismissed' ? 1 : ENDING_FADE_SECONDS}s` }}
    >
      <div
        className={`flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-4 py-8 text-night transition-all duration-1000 ${shown ? 'pointer-events-auto translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
      >
        <h1 className="bg-linear-to-r from-purple to-cyan bg-clip-text text-6xl font-bold tracking-tight text-transparent">
          WÚ 無
        </h1>
        <p className="text-xl font-semibold">Nothing left to find.</p>
        <p className="font-mono text-sm tracking-widest text-purple uppercase">
          {found.length} / {TOTAL} points
        </p>
        <ul className="grid max-w-2xl grid-cols-1 gap-x-8 gap-y-1 text-sm text-night/70 sm:grid-cols-2">
          {found.map((id) => (
            <li key={id}>
              <span className="text-purple">✓</span> {discoveries[id].title}
            </li>
          ))}
        </ul>
        <p className="max-w-md text-center text-sm text-night/60">
          Every room here was ordinary. Only the way they were joined together was not.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onContinue}
            tabIndex={shown ? 0 : -1}
            className="cursor-pointer rounded-full border border-night/20 px-5 py-2 text-sm font-semibold hover:bg-night/5"
          >
            Keep exploring
          </button>
          <button
            type="button"
            onClick={() => location.reload()}
            tabIndex={shown ? 0 : -1}
            className="cursor-pointer rounded-full bg-night px-5 py-2 text-sm font-semibold text-bone hover:bg-night/85"
          >
            Play again
          </button>
        </div>
      </div>
    </div>
  )
}

/* The score: a point for everything found, out of everything there is to find. */
function Points() {
  const found = useGame((s) => s.found.length)
  return (
    <div className="absolute top-3 left-4 rounded-2xl border border-bone/15 bg-night/75 px-4 py-2 backdrop-blur">
      <div className="text-[0.65rem] font-semibold tracking-widest text-cyan uppercase">Points</div>
      <div className="font-mono text-2xl leading-tight font-bold">
        {/* Keyed by the score, so that each new point plays the pulse again. */}
        <span key={found} className={found > 0 ? 'inline-block animate-[point_0.6s_ease-out]' : ''}>
          {found}
        </span>
        <span className="text-base font-normal text-bone/50"> / {TOTAL}</span>
      </div>
      <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-bone/15">
        <div
          className="h-full bg-linear-to-r from-purple to-cyan transition-[width] duration-700"
          style={{ width: `${(found / TOTAL) * 100}%` }}
        />
      </div>
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
        <div className="absolute top-4 left-1/2 h-1.5 w-28 -translate-x-1/2 overflow-hidden rounded-full bg-black/50 ring-1 ring-bone/20">
          <div
            className="h-full bg-linear-to-r from-cyan to-purple"
            style={{ width: `${charge * 100}%` }}
          />
        </div>
      )}
      {prompt && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-sm whitespace-nowrap">
          {prompt}
        </div>
      )}
    </div>
  )
}

/* The goals of the puzzles the player is standing at. */
function Goal() {
  const goal = useGame((s) => s.goal)
  if (!goal) return null
  return (
    <div className="absolute top-3 left-1/2 flex w-max max-w-[min(36rem,calc(100%-20rem))] -translate-x-1/2 flex-col items-center gap-1.5">
      {goal.split('\n').map((line) => (
        <div
          key={line}
          className="rounded-2xl border border-bone/15 bg-night/75 px-4 py-1.5 text-center text-sm text-bone/90 backdrop-blur"
        >
          {line}
        </div>
      ))}
    </div>
  )
}

function StartScreen({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="pointer-events-auto absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-6 bg-night/70 backdrop-blur-sm"
    >
      <h1 className="bg-linear-to-r from-purple to-cyan bg-clip-text text-6xl font-bold tracking-tight text-transparent">
        WÚ 無
      </h1>
      <p className="text-lg text-bone/80">Click to enter</p>
      <p className="max-w-sm px-4 text-center text-sm text-bone/80">
        You start holding the amber lamp. Carry its light through the doorways, press E to put it
        down, or hold Q to throw it.
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-left text-sm text-bone/60">
        <dt className="font-medium text-cyan">WASD</dt>
        <dd>move</dd>
        <dt className="font-medium text-cyan">Mouse</dt>
        <dd>look</dd>
        <dt className="font-medium text-cyan">Shift</dt>
        <dd>run</dd>
        <dt className="font-medium text-cyan">Space</dt>
        <dd>jump</dd>
        <dt className="font-medium text-cyan">E</dt>
        <dd>pick up / put down</dd>
        <dt className="font-medium text-cyan">Q</dt>
        <dd>throw (hold to charge)</dd>
        <dt className="font-medium text-cyan">R</dt>
        <dd>back to the start</dd>
        <dt className="font-medium text-cyan">M</dt>
        <dd>sound off / on</dd>
        <dt className="font-medium text-cyan">Esc</dt>
        <dd>release mouse</dd>
      </dl>
    </button>
  )
}

function Stats() {
  const fps = useGame((s) => s.fps)
  const passes = useGame((s) => s.passes)
  const scale = useGame((s) => s.scale)
  return (
    <div className="absolute top-3 right-4 text-right text-xs text-bone/50 tabular-nums">
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
    <div className="absolute bottom-8 left-1/2 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-purple/40 bg-night/85 p-5 shadow-2xl backdrop-blur">
      <div className="text-xs font-semibold tracking-widest text-cyan uppercase">Discovered</div>
      <h2 className="mt-1 text-xl font-bold">{card.title}</h2>
      <p className="mt-2 text-bone/90">{card.body}</p>
      <p className="mt-2 text-sm text-bone/60">{card.maths}</p>
    </div>
  )
}
