import { lightingScenes, type LightingScene, type LightingView } from '../game/lightingScenes'
import { useLightingSettings } from '../game/lightingSettings'
import { useGame } from '../game/store'

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
        className="absolute top-4 left-4 rounded border border-cyan/40 bg-night/90 px-4 py-2 text-sm text-cyan hover:bg-cyan/10"
        href="?scene=lighting-flat"
      >
        Open lighting lab →
      </a>
    )
  }

  return (
    <aside className="absolute top-4 left-4 max-h-[calc(100%-2rem)] w-72 max-w-[calc(100%-8rem)] overflow-y-auto rounded-lg border border-bone/20 bg-night/95 p-4 text-sm text-bone shadow-lg">
      <p className="text-xs font-semibold tracking-widest text-cyan uppercase">Lighting lab</p>
      <p className="mt-2 font-semibold">{scene.title}</p>
      {playing ? (
        <p className="mt-2 text-xs text-bone/65">
          E to lift either light · Esc for lighting controls
        </p>
      ) : (
        <>
          <p className="mt-2 text-bone/75">
            {view === 'lantern'
              ? 'The Minecraft lantern is lit on the left pedestal. Pick it up with E and carry its light through the doorway.'
              : view === 'threshold'
                ? 'The lamp is suspended halfway through the doorway. Toggle it to compare both floors, or pick it up with E.'
                : scene.description}
          </p>
          <button
            type="button"
            className="mt-4 w-full cursor-pointer rounded bg-cyan px-3 py-2 font-semibold text-night hover:bg-bone"
            onClick={onPlay}
          >
            Enter scene
          </button>
          <LightingControls />
          <a
            href={`?scene=${scene.id}&view=lantern`}
            className="mt-3 block rounded border border-cyan/40 px-3 py-2 text-center text-cyan hover:bg-cyan/10"
          >
            Minecraft lantern test
          </a>
          {scene.portals && (
            <a
              href={`?scene=${scene.id}${view === 'doorway' ? '' : '&view=doorway'}`}
              className="mt-3 block rounded border border-cyan/40 px-3 py-2 text-center text-cyan hover:bg-cyan/10"
            >
              {view === 'doorway' ? 'Return to starting view' : 'Doorway light test'}
            </a>
          )}
          {scene.portals && (
            <a
              href={`?scene=${scene.id}&view=threshold`}
              className="mt-2 block rounded border border-cyan/40 px-3 py-2 text-center text-cyan hover:bg-cyan/10"
            >
              Lamp halfway through portal
            </a>
          )}
          <nav aria-label="Lighting test scenes" className="mt-4 flex flex-col gap-2">
            {lightingScenes.map((preset) => (
              <a
                key={preset.id}
                href={`?scene=${preset.id}`}
                aria-current={preset.id === scene.id ? 'page' : undefined}
                className="rounded border border-bone/15 px-3 py-2 hover:border-cyan/60 aria-[current=page]:border-cyan aria-[current=page]:text-cyan"
              >
                {preset.title}
              </a>
            ))}
          </nav>
          <p className="mt-4 text-xs text-bone/60">
            WASD move · Mouse look · Shift run · Space jump · E pick up / drop · Hold Q to throw.
            Each scene starts fresh.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-cyan">
            <button
              type="button"
              className="cursor-pointer underline"
              onClick={() => window.location.reload()}
            >
              Restart scene
            </button>
            <a className="underline" href={window.location.pathname}>
              Full game
            </a>
          </div>
        </>
      )}
    </aside>
  )
}

function LightingControls() {
  const lampEnabled = useLightingSettings((s) => s.lampEnabled)
  const lanternEnabled = useLightingSettings((s) => s.lanternEnabled)
  const referenceEnabled = useLightingSettings((s) => s.referenceEnabled)
  const setLampEnabled = useLightingSettings((s) => s.setLampEnabled)
  const setLanternEnabled = useLightingSettings((s) => s.setLanternEnabled)
  const setReferenceEnabled = useLightingSettings((s) => s.setReferenceEnabled)

  return (
    <fieldset className="mt-4 space-y-2 rounded border border-bone/15 p-3">
      <legend className="px-1 text-xs text-cyan">Compare lighting</legend>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="accent-cyan"
          checked={lampEnabled}
          onChange={(event) => setLampEnabled(event.target.checked)}
        />
        Amber lamp
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="accent-cyan"
          checked={lanternEnabled}
          onChange={(event) => setLanternEnabled(event.target.checked)}
        />
        Minecraft lantern
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="accent-cyan"
          checked={referenceEnabled}
          onChange={(event) => setReferenceEnabled(event.target.checked)}
        />
        Reference light
      </label>
      <p className="text-xs leading-relaxed text-bone/65">
        Switch each light on its own to compare its light on the floor. Leave the reference light
        off to isolate it. Cast shadows and light beams come next.
      </p>
    </fieldset>
  )
}
