import { useEffect, useRef } from 'react'
import { TRACK_HEIGHTS, beat, beats, ramp } from './timeline'
import { createCompositor } from './water'

/* How much of the story a subtitle takes to come in or go out. */
const FADE = 0.03

/* How long the page takes to scroll itself through the story when asked to. */
const AUTO_SECONDS = 45
/* What the reader does to stop it. */
const TAKE_OVER = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

interface Caption {
  /* Where in the story the subtitle is on screen, as progress from 0 to 1. */
  from: number
  to: number
  text: string
}

const captions: Caption[] = [
  { from: 0.1, to: 0.26, text: 'She was taught that parallel lines never meet.' },
  { from: 0.3, to: 0.44, text: 'Then it rained.' },
  { from: 0.47, to: 0.6, text: 'The water gathered.' },
  { from: 0.63, to: 0.74, text: 'The straight lines ran together.' },
  { from: 0.79, to: 0.88, text: 'Under the water, space is curved.' },
]

/*
  The landing page: a story told by scrolling. The page is a tall, empty
  track; the stage stays fixed in the window and is drawn again for wherever
  the reader is on the track. Nothing remembers the last frame, so scrolling
  up plays the story backwards.

  Add `?p=0.5` to the address to open it part of the way through, or `?auto`
  to have the page scroll by itself (`?auto=60` to take 60 seconds over it).
*/
export function Landing({ onEnter }: { onEnter: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const title = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLParagraphElement | null)[]>([])
  const white = useRef<HTMLDivElement>(null)
  const launch = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const track = scroller.current!
    const compositor = createCompositor(canvas.current!)
    let w = 0
    let h = 0
    let drawn = -1

    const travel = () => track.scrollHeight - track.clientHeight
    const query = new URLSearchParams(location.search)
    const start = Number(query.get('p'))
    // How many seconds the page takes to scroll itself from top to bottom, or 0 to leave it to the reader.
    let auto = query.has('auto') ? Number(query.get('auto')) || AUTO_SECONDS : 0
    let place = 0
    let before = 0
    // The reader takes over as soon as they scroll.
    const takeOver = () => {
      auto = 0
    }
    for (const event of TAKE_OVER) track.addEventListener(event, takeOver, { passive: true })
    if (start > 0) track.scrollTop = Math.min(1, start) * travel()
    track.focus()

    let request = requestAnimationFrame(function draw(now) {
      request = requestAnimationFrame(draw)
      if (auto && before) {
        place = Math.max(place, track.scrollTop) + (travel() * (now - before)) / 1000 / auto
        track.scrollTop = place
      }
      before = now
      const resized = track.clientWidth !== w || track.clientHeight !== h
      if (resized) {
        w = track.clientWidth
        h = track.clientHeight
        compositor.resize(w, h)
        // The track is as tall as the window allows, so keep the reader's place in the story.
        if (drawn > 0) track.scrollTop = drawn * travel()
      }
      const p = travel() > 0 ? track.scrollTop / travel() : 0
      // Only the water moves by itself. The rest is still until the page is scrolled.
      const moving = p > beats.wet[0] && p < beats.launch[1]
      if (p === drawn && !resized && !moving) return
      drawn = p
      compositor.render({ w, h, p, scroll: track.scrollTop / h }, now / 1000)

      title.current!.style.opacity = String(1 - ramp(0.03, 0.08, p))
      captions.forEach(({ from, to }, i) => {
        const coming = ramp(from, from + FADE, p)
        const going = ramp(to - FADE, to, p)
        const card = cards.current[i]!
        card.style.opacity = String(coming * (1 - going))
      })
      white.current!.style.opacity = String(beat('white', p))
      const arrived = beat('launch', p)
      launch.current!.style.opacity = String(arrived)
      launch.current!.style.pointerEvents = arrived > 0.5 ? 'auto' : 'none'
      rail.current!.style.transform = `scaleY(${p})`
    })

    return () => {
      cancelAnimationFrame(request)
      for (const event of TAKE_OVER) track.removeEventListener(event, takeOver)
      compositor.dispose()
    }
  }, [])

  return (
    <div
      ref={scroller}
      tabIndex={-1}
      className="fixed inset-0 overflow-x-hidden overflow-y-auto overscroll-none outline-none"
    >
      <div style={{ height: `${TRACK_HEIGHTS * 100}dvh` }}>
        <div className="sticky top-0 h-dvh overflow-hidden font-sans text-bone select-none">
          <canvas ref={canvas} className="absolute inset-0 block h-full w-full" />

          <div
            ref={title}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 text-center"
          >
            <p className="text-xs tracking-[0.4em] text-bone/70 uppercase">A web experience</p>
            <h1 className="font-serif text-6xl tracking-tight italic sm:text-8xl">
              WÚ <span className="not-italic">無</span>
            </h1>
            <p className="font-serif text-2xl text-bone/80 italic sm:text-3xl">
              ‘neither up or down’
            </p>
            <p className="mt-10 text-sm tracking-widest text-bone/70 uppercase">Scroll, slowly ↓</p>
          </div>

          {captions.map((caption, i) => (
            <p
              key={caption.text}
              ref={(card) => {
                cards.current[i] = card
              }}
              style={{ opacity: 0 }}
              className="pointer-events-none absolute inset-x-0 bottom-[8dvh] px-6 text-center text-lg text-bone"
            >
              <span className="rounded bg-night/60 px-3 py-1">{caption.text}</span>
            </p>
          ))}

          <div
            ref={white}
            style={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 bg-[#f7f4ee]"
          />

          {/* The launch page. Its design is still to come: this is a stand-in. */}
          <div
            ref={launch}
            style={{ opacity: 0, pointerEvents: 'none' }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center text-night"
          >
            <p className="text-xs tracking-[0.4em] text-night/60 uppercase">Now walk through it</p>
            <h2 className="font-serif text-6xl tracking-tight italic sm:text-8xl">
              WÚ <span className="not-italic">無</span>
            </h2>
            <p className="font-serif text-2xl text-night/80 italic sm:text-3xl">
              ‘neither up or down’
            </p>
            <p className="max-w-md px-6 text-night/70">
              Wú (無): negative, void, nothingness, non-being; it can imply ‘neither yes nor no’. A
              sandbox of impossible rooms: doors that change your size, corridors that loop, floors
              that become walls.
            </p>
            <button
              type="button"
              onClick={onEnter}
              className="mt-4 cursor-pointer rounded-full bg-night px-10 py-4 text-sm tracking-widest text-bone uppercase transition-transform hover:scale-105"
            >
              Enter the world
            </button>
          </div>

          <div className="pointer-events-none absolute top-1/2 right-4 h-32 w-px -translate-y-1/2 bg-bone/20 mix-blend-difference">
            <div ref={rail} className="h-full w-full origin-top bg-bone" />
          </div>
        </div>
      </div>
    </div>
  )
}
