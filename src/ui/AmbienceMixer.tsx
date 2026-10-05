import { useAmbience } from '../game/ambience'
import { AudioSlider } from './AudioSlider'
import { Wash } from './Wash'

/* A separate paper scrap for the sounds that live underneath the music and effects. */
export function AmbienceMixer() {
  const drone = useAmbience((state) => state.drone)
  const rain = useAmbience((state) => state.rain)
  const setDrone = useAmbience((state) => state.setDrone)
  const setRain = useAmbience((state) => state.setRain)

  return (
    <aside
      aria-label="ambient sound mixer"
      className="pointer-events-auto relative w-[min(13rem,calc(100vw-1rem))] px-6 pt-4 pb-5 font-light transition-opacity duration-700 starting:opacity-0"
    >
      <Wash rough={11} seed={71} radius={20} blooms={['green']} />
      <div className="relative">
        <p className="mt-0 mb-2 text-[0.65rem] tracking-[0.08em] lowercase text-caption/65">
          ambience
        </p>
        <div className="space-y-1">
          <AudioSlider label="rain" value={rain} onChange={setRain} />
          <AudioSlider label="drone" value={drone} onChange={setDrone} />
        </div>
      </div>
    </aside>
  )
}
