import { useEffect, useRef, useState } from 'react'
import { bootstrap } from '../game/bootstrap'
import { Landing } from '../landing/Landing'
import { Hud } from './Hud'

export function App() {
  // The landing page comes first. `#play` in the address goes straight to the game.
  const [entered, setEntered] = useState(() => location.hash === '#play')

  return entered ? <Game /> : <Landing onEnter={() => setEntered(true)} />
}

function Game() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => bootstrap(canvas.current!), [])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvas} className="block h-full w-full" />
      <Hud onPlay={() => void canvas.current?.requestPointerLock()} />
    </div>
  )
}
