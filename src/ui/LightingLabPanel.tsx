import { lightingScenes, type LightingScene, type LightingView } from '../game/lightingScenes'
import { useLightingSettings } from '../game/lightingSettings'
import { useGame } from '../game/store'
import { Wash } from './Wash'

export function LightingLabPanel({
  scene,
  view,
  onPlay,
}: {
  scene?: LightingScene
  view: LightingView
  onPlay: () => void
}) {
  const playing = useGame((s) => s.playing)

  if (!scene) {
    return playing ? null : (
      <a
        className="group absolute bottom-3 left-3 px-6 py-3.5 text-sm font-light tracking-[-0.03em] text-ink no-underline"
        href="?scene=lighting-flat"
      >
        <Wash rough={8} seed={17} radius={12} />
        <span className="relative group-hover:underline">open lighting lab →</span>
      </a>
    )
  }

  return (
    <aside className="absolute top-2 left-2 w-80 max-w-[calc(100%-8rem)] px-8 pt-7 pb-8 text-sm font-light tracking-[-0.02em] text-caption">
      <Wash rough={24} seed={6} radius={30} blooms={['yellow']} />
      <div className="relative max-h-[calc(100dvh-5rem)] overflow-y-auto pr-1">
        <p className="m-0 text-xs">lighting lab</p>
        <p className="mt-1 mb-0 text-xl leading-tight tracking-[-0.05em] text-ink">{scene.title}</p>
        {playing ? (
          <p className="mt-2 mb-0 text-xs opacity-80">
            E to lift either light · esc for lighting controls
          </p>
        ) : (
          <>
            <p className="mt-2 mb-0 leading-relaxed">
              {view === 'lantern'
                ? 'The Minecraft lantern is lit on the left pedestal. Pick it up with E and carry its light through the doorway.'
                : view === 'threshold'
                  ? 'The lamp is suspended halfway through the doorway. Toggle it to compare both floors, or pick it up with E.'
                  : scene.description}
            </p>
            <button
              type="button"
              className="mt-4 w-full cursor-pointer rounded-full border-0 bg-ink px-3 py-2 font-light tracking-[-0.02em] text-paper hover:bg-ink/85"
              onClick={onPlay}
            >
              enter scene
            </button>
            <LightingControls />
            <a href={`?scene=${scene.id}&view=lantern`} className={LINK}>
              Minecraft lantern test
            </a>
            {scene.portals && (
              <a
                href={`?scene=${scene.id}${view === 'doorway' ? '' : '&view=doorway'}`}
                className={LINK}
              >
                {view === 'doorway' ? 'back to the starting view' : 'doorway light test'}
              </a>
            )}
            {scene.portals && (
              <a href={`?scene=${scene.id}&view=threshold`} className={LINK}>
                lamp halfway through the doorway
              </a>
            )}
            <nav aria-label="Lighting test scenes" className="mt-4 flex flex-col gap-2">
              {lightingScenes.map((preset) => (
                <a
                  key={preset.id}
                  href={`?scene=${preset.id}`}
                  aria-current={preset.id === scene.id ? 'page' : undefined}
                  className="rounded-full border border-ink/15 px-4 py-2 text-caption no-underline hover:border-ink/40 aria-[current=page]:border-ink/60 aria-[current=page]:text-ink"
                >
                  {preset.title}
                </a>
              ))}
            </nav>
            <p className="mt-4 mb-0 text-xs leading-relaxed opacity-75">
              WASD move · mouse look · shift run · space jump · E pick up / drop · hold Q to throw.
              each scene starts fresh.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-ink">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 font-light text-ink underline"
                onClick={() => window.location.reload()}
              >
                restart scene
              </button>
              <a className="text-ink underline" href={window.location.pathname}>
                full game
              </a>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

/* A link in the panel: a pencil outline round it. */
const LINK =
  'mt-3 block rounded-full border border-ink/25 px-3 py-2 text-center text-ink no-underline hover:bg-ink/5'

function LightingControls() {
  const lampEnabled = useLightingSettings((s) => s.lampEnabled)
  const lanternEnabled = useLightingSettings((s) => s.lanternEnabled)
  const referenceEnabled = useLightingSettings((s) => s.referenceEnabled)
  const setLampEnabled = useLightingSettings((s) => s.setLampEnabled)
  const setLanternEnabled = useLightingSettings((s) => s.setLanternEnabled)
  const setReferenceEnabled = useLightingSettings((s) => s.setReferenceEnabled)

  return (
    <fieldset className="mt-4 space-y-2 rounded-2xl border border-ink/15 p-3">
      <legend className="px-1 text-xs text-ink">compare lighting</legend>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="accent-ink"
          checked={lampEnabled}
          onChange={(event) => setLampEnabled(event.target.checked)}
        />
        amber lamp
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="accent-ink"
          checked={lanternEnabled}
          onChange={(event) => setLanternEnabled(event.target.checked)}
        />
        Minecraft lantern
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="accent-ink"
          checked={referenceEnabled}
          onChange={(event) => setReferenceEnabled(event.target.checked)}
        />
        reference light
      </label>
      <p className="m-0 text-xs leading-relaxed opacity-80">
        switch each light on its own to compare its light on the floor. leave the reference light
        off to isolate it. cast shadows and light beams come next.
      </p>
    </fieldset>
  )
}
