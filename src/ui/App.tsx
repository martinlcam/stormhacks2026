import { useCallback, useEffect, useRef, useState } from 'react'
import { type Game as RunningGame, bootstrap } from '../game/bootstrap'
import { readLightingScene, readLightingView } from '../game/lightingScenes'
import { useGame } from '../game/store'
import { Landing } from '../landing/Landing'
import { preloadAssets } from '../world/preload'
import { FlagsPanel } from './FlagsPanel'
import { Hud } from './Hud'
import { LightingLabPanel } from './LightingLabPanel'
import { Onboarding } from './Onboarding'
import { Wash } from './Wash'

const lightingScene = readLightingScene(window.location.search)
const lightingView = readLightingView(window.location.search)

/* Milliseconds after the landing page opens before the game is built behind it, once the page is idle. */
const BUILD_AFTER = 2500

/*
  Where the reader is: on the landing page, going from it into the game (both
  are there, the game under the landing page as it fades), or in the game.
*/
type Stage = 'landing' | 'entering' | 'game'

/* What the app asks of the game: to capture the mouse, from inside the click that leaves the landing page. */
interface GameHandle {
  capture(): void
}

export function App() {
  // The landing page comes first. `#play` in the address goes straight to the game.
  const [stage, setStage] = useState<Stage>(() =>
    lightingScene || location.hash === '#play' ? 'game' : 'landing',
  )
  const [fromLanding] = useState(stage === 'landing')
  // Whether the game has been built yet. On the landing page it is built behind it, paused.
  const [built, setBuilt] = useState(stage !== 'landing')
  const game = useRef<GameHandle | null>(null)

  const enter = useCallback(() => {
    // This runs inside the click itself, which is when a browser lets a page capture the mouse.
    game.current?.capture()
    setBuilt(true)
    setStage('entering')
  }, [])

  const arrive = useCallback(() => setStage('game'), [])
  const register = useCallback((handle: GameHandle | null) => {
    game.current = handle
  }, [])

  // While the reader is on the landing page, fetch what the game will need, and then build it
  // behind the page, so that going in does not stall on it. Wait a moment first, so that the
  // landing page itself is not slowed down, and build it when the page is idle.
  useEffect(() => {
    if (stage !== 'landing') return
    const timer = setTimeout(preloadAssets, 1500)
    const cancel = whenIdle(() => setBuilt(true), BUILD_AFTER)
    return () => {
      clearTimeout(timer)
      cancel()
    }
  }, [stage])

  return (
    <>
      {built && (
        <Game
          fromLanding={fromLanding}
          active={stage !== 'landing'}
          showMusicPlayer={stage === 'game'}
          register={register}
        />
      )}
      {stage !== 'game' && <Landing onEnter={enter} onGone={arrive} />}
      <FlagsPanel />
    </>
  )
}

/* Call `then` once the page is idle, and not before `after` milliseconds. Returns a way to cancel it. */
function whenIdle(then: () => void, after: number): () => void {
  let idle = 0
  const timer = setTimeout(() => {
    idle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(then, { timeout: 2000 })
        : window.setTimeout(then, 0)
  }, after)
  return () => {
    clearTimeout(timer)
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle)
    else clearTimeout(idle)
  }
}

/*
  The game. Coming from the landing page it is built behind it ahead of time,
  paused, and starts as the water covers the page. The click that left the
  landing page also captures the mouse, so there is no start screen: the
  controls are shown in the top left until the player has used them. If the
  browser would not capture the mouse, a click anywhere does.
*/
function Game({
  fromLanding,
  active,
  showMusicPlayer,
  register,
}: {
  fromLanding: boolean
  active: boolean
  /* Hidden behind the landing and its transition; shown only once the game has arrived. */
  showMusicPlayer: boolean
  /* Tells the app how to capture the mouse, or that it no longer can. */
  register: (handle: GameHandle | null) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const running = useRef<RunningGame | null>(null)
  // Whether the game was already wanted when it was built, rather than built ahead of time.
  const wantedAtOnce = useRef(active)
  const playing = useGame((s) => s.playing)
  const everPlayed = useGame((s) => s.everPlayed)
  const waiting = fromLanding && !everPlayed

  const capture = useCallback(() => {
    // Some browsers return a promise that is refused without a click; others return nothing.
    const request = canvas.current?.requestPointerLock() as Promise<void> | undefined
    void request?.catch?.(() => {})
  }, [])

  useEffect(() => {
    const game = bootstrap(canvas.current!, lightingScene, lightingView, {
      paused: !wantedAtOnce.current,
    })
    running.current = game
    register({ capture })
    // Gone in before it had been built, so the click that left the landing page could not capture
    // the mouse: try now, which most browsers still allow so soon after the click.
    if (fromLanding && wantedAtOnce.current) capture()
    return () => {
      register(null)
      running.current = null
      game.dispose()
    }
  }, [fromLanding, register, capture])

  useEffect(() => {
    if (active) running.current?.play()
  }, [active])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvas} className="block h-full w-full" />
      <Hud
        onPlay={capture}
        showStartScreen={!lightingScene && !waiting}
        showDiscoveries={!lightingScene}
        showMusicPlayer={showMusicPlayer}
      />
      {!lightingScene && <Onboarding />}
      {waiting && active && !playing && (
        <button
          type="button"
          onClick={capture}
          className="absolute inset-0 flex cursor-pointer items-end justify-center border-0 bg-transparent pb-[12dvh]"
        >
          <span className="relative px-8 py-4 text-sm font-light tracking-[-0.02em] text-ink">
            <Wash rough={10} seed={23} radius={14} />
            <span className="relative">click to look around</span>
          </span>
        </button>
      )}
      <LightingLabPanel scene={lightingScene} view={lightingView} onPlay={capture} />
    </div>
  )
}
