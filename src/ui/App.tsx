import { useEffect, useRef } from 'react'
import { bootstrap } from '../game/bootstrap'
import { Hud } from './Hud'

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => bootstrap(canvas.current!), [])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvas} className="block h-full w-full" />
      <Hud onPlay={() => void canvas.current?.requestPointerLock()} />
    </div>
  )
}
