import { useEffect, useRef, useState } from 'react'
import { bootstrap } from '../game/bootstrap'
import { readLightingScene, readLightingView } from '../game/lightingScenes'
import { Landing } from '../landing/Landing'
import { Hud } from './Hud'
import { LightingLabPanel } from './LightingLabPanel'

const lightingScene = readLightingScene(window.location.search)
const lightingView = readLightingView(window.location.search)

export function App() {
  // The landing page comes first. `#play` in the address goes straight to the game.
  const [entered, setEntered] = useState(() => Boolean(lightingScene) || location.hash === '#play')

  return entered ? <Game /> : <Landing onEnter={() => setEntered(true)} />
}

function Game() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => bootstrap(canvas.current!, lightingScene, lightingView), [])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvas} className="block h-full w-full" />
      <Hud
        onPlay={() => void canvas.current?.requestPointerLock()}
        showStartScreen={!lightingScene}
        showDiscoveries={!lightingScene}
      />
      <LightingLabPanel
        scene={lightingScene}
        view={lightingView}
        onPlay={() => void canvas.current?.requestPointerLock()}
      />
    </div>
  )
}
