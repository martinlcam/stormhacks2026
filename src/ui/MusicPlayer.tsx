import { MUSIC_TRACKS, musicControls, useMusic } from '../game/music'
import { Wash } from './Wash'

/* A small scrap of the same watercolour paper as the rest of the HUD. */
export function MusicPlayer() {
  const current = useMusic((state) => state.current)
  const playing = useMusic((state) => state.playing)
  const ready = useMusic((state) => state.ready)
  const track = MUSIC_TRACKS[current]

  return (
    <aside
      aria-label="music player"
      className="pointer-events-auto absolute right-2 bottom-2 z-20 w-[min(19rem,calc(100%-1rem))] px-7 pt-5 pb-5 font-light text-caption transition-opacity duration-700 starting:opacity-0"
    >
      <Wash rough={11} seed={53} radius={20} blooms={['blue']} />
      <div className="relative">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[0.65rem] tracking-[0.08em] lowercase opacity-65">
              {playing ? (ready ? 'now playing' : 'plays when you enter') : 'paused'}
            </p>
            <p
              aria-live="polite"
              className="mt-0.5 mb-0 truncate text-sm tracking-[-0.03em] text-ink"
              title={track.title}
            >
              {track.title}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 text-ink">
            <Control label="previous song" onClick={musicControls.previous}>
              <path d="M6.5 5v10M15 5.5 8.5 10l6.5 4.5z" />
            </Control>
            <Control label={playing ? 'pause music' : 'play music'} onClick={musicControls.toggle}>
              {playing ? <path d="M7.5 5.5v9M12.5 5.5v9" /> : <path d="m7.5 5 7 5-7 5z" />}
            </Control>
            <Control label="next song" onClick={musicControls.next}>
              <path d="M13.5 5v10M5 5.5l6.5 4.5L5 14.5z" />
            </Control>
          </div>
        </div>

        <a
          href="https://soundcloud.com/grace_chiang"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[0.65rem] tracking-[-0.01em] text-caption/70 underline decoration-caption/35 underline-offset-2 transition-colors hover:text-ink"
        >
          music by grace chiang
        </a>
      </div>
    </aside>
  )
}

function Control({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors hover:bg-caption/10 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-caption/60"
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="size-4 fill-none stroke-current stroke-[1.35] [stroke-linecap:round] [stroke-linejoin:round]"
      >
        {children}
      </svg>
    </button>
  )
}
