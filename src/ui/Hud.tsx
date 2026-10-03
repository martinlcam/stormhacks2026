import { useEffect } from 'react'
import { discoveries } from '../game/discoveries'
import { useGame } from '../game/store'

const CARD_SECONDS = 12
const TOTAL = Object.keys(discoveries).length

export function Hud({ onPlay }: { onPlay: () => void }) {
  const playing = useGame((s) => s.playing)

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans text-bone">
      {playing ? <Crosshair /> : <StartScreen onPlay={onPlay} />}
      <Stats />
      <DiscoveryCard />
    </div>
  )
}

function Crosshair() {
  const prompt = useGame((s) => s.prompt)
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="size-1.5 rounded-full bg-bone/80 ring-1 ring-black/40" />
      {prompt && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-sm whitespace-nowrap">
          {prompt}
        </div>
      )}
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
        Beyond Euclid
      </h1>
      <p className="text-lg text-bone/80">Click to enter</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-left text-sm text-bone/60">
        <dt className="font-mono text-cyan">WASD</dt>
        <dd>move</dd>
        <dt className="font-mono text-cyan">Mouse</dt>
        <dd>look</dd>
        <dt className="font-mono text-cyan">Shift</dt>
        <dd>run</dd>
        <dt className="font-mono text-cyan">Space</dt>
        <dd>jump</dd>
        <dt className="font-mono text-cyan">Esc</dt>
        <dd>release mouse</dd>
      </dl>
    </button>
  )
}

function Stats() {
  const fps = useGame((s) => s.fps)
  const passes = useGame((s) => s.passes)
  const found = useGame((s) => s.found.length)
  return (
    <div className="absolute top-3 right-4 text-right font-mono text-xs text-bone/50">
      <div>
        {fps} fps · {passes} views
      </div>
      <div className="text-cyan/80">
        {found} / {TOTAL} discovered
      </div>
    </div>
  )
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
