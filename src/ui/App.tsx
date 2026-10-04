import { useCallback, useEffect, useRef, useState } from 'react'
import { bootstrap } from '../game/bootstrap'
import { readLightingScene, readLightingView } from '../game/lightingScenes'
import { useGame } from '../game/store'
import { Landing } from '../landing/Landing'
import { preloadAssets } from '../world/preload'
import { FlagsPanel } from './FlagsPanel'
import { Hud } from './Hud'
import { LightingLabPanel } from './LightingLabPanel'
import { Onboarding } from './Onboarding'

const lightingScene = readLightingScene(window.location.search)
const lightingView = readLightingView(window.location.search)

/*
  Where the reader is: on the landing page, going from it into the game (both
  are there, the game under the landing page as it fades), or in the game.
*/
type Stage = 'landing' | 'entering' | 'game'

export function App() {
  // The landing page comes first. `#play` in the address goes straight to the game.
  const [stage, setStage] = useState<Stage>(() =>
    lightingScene || location.hash === '#play' ? 'game' : 'landing',
  )
  const [fromLanding] = useState(stage === 'landing')
  const enter = useCallback(() => setStage('entering'), [])
  const arrive = useCallback(() => setStage('game'), [])

  // While the reader is on the landing page, fetch what the game will need.
  // Wait a moment first, so the landing page itself is not slowed down.
  useEffect(() => {
    if (stage !== 'landing') return
    const timer = setTimeout(preloadAssets, 1500)
    return () => clearTimeout(timer)
  }, [stage])

  return (
    <>
      {stage !== 'landing' && <Game fromLanding={fromLanding} />}
      {stage !== 'game' && <Landing onEnter={enter} onGone={arrive} />}
      <FlagsPanel />
    </>
  )
}

/*
  The game. Coming from the landing page it starts behind it, as the water
  covers it, and the click that left the landing page also captures the
  mouse, so there is no start screen: the controls are shown in the top left
  until the player has used them. If the browser would not capture the
  mouse, a click anywhere does.
*/
function Game({ fromLanding }: { fromLanding: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const playing = useGame((s) => s.playing)
  const everPlayed = useGame((s) => s.everPlayed)
  const waiting = fromLanding && !everPlayed

  const capture = useCallback(() => {
    // Some browsers return a promise that is refused without a click; others return nothing.
    const request = canvas.current?.requestPointerLock() as Promise<void> | undefined
    void request?.catch?.(() => {})
  }, [])

  useEffect(() => {
    const stop = bootstrap(canvas.current!, lightingScene, lightingView)
    if (fromLanding) capture()
    return stop
  }, [fromLanding, capture])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvas} className="block h-full w-full" />
      <Hud
        onPlay={capture}
        showStartScreen={!lightingScene && !waiting}
        showDiscoveries={!lightingScene}
      />
      {!lightingScene && <Onboarding />}
      {waiting && !playing && (
        <button
          type="button"
          onClick={capture}
          className="absolute inset-0 flex cursor-pointer items-end justify-center pb-[14dvh] font-sans text-sm tracking-[0.3em] text-bone/60"
        >
          click to look around
        </button>
      )}
      <LightingLabPanel scene={lightingScene} view={lightingView} onPlay={capture} />
    </div>
  )
}
