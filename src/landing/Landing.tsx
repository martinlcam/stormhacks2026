import { type Ref, type RefObject, createRef, useEffect, useRef, useState } from 'react'
import { readFlag } from '../flags'
import {
  CAPTION,
  CAPTION_INK,
  DROP_SPRITE,
  FONT,
  LAST_CAPTION,
  PAGE_GRAIN,
  SPLASH_CENTRE,
  SPLASH_RECT,
  type Slide,
  TITLE_GRAIN,
  WATER_LINE,
  art,
  desk,
  lightSlide,
  percent,
  place,
} from './art'
import { createFx } from './fx'
import { holdScroll } from './hold'
import { type LandingSound, createLandingSound } from './sound'
import { type Speedraw, createSpeedraw } from './speedraw'
import {
  DROP_X,
  FRAME,
  TRACK_HEIGHTS,
  beat,
  bloomAt,
  dropAt,
  linear,
  ramp,
  splashAt,
} from './timeline'
import { TitleText } from './Title'

/* How long the page takes to scroll itself through the story when asked to. */
const AUTO_SECONDS = 45
/* What the reader does to stop it. */
const TAKE_OVER = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
/* #9: seconds the water takes to cover the page after the button, before the game starts. */
const LEAVE_SECONDS = 1.6
/* How far the last caption rises to reach the middle of the frame (#8), in frame pixels. */
const LAST_CAPTION_RISE = 600
/* The button's type size, in frame pixels. */
const BUTTON_SIZE = 44

const speedraw = readFlag('draw') === 'speedraw'
const glows = readFlag('glow') === 'on'
const grainy = readFlag('grain') === 'on'
const paintedWater = readFlag('water') === 'texture'
const withSound = readFlag('sound') === 'on'

/* A caption shows everything left of `--wipe` (0 to 1), so it wipes in from the left (#4). */
const WIPE =
  'linear-gradient(90deg, #000 calc(var(--wipe) * 125% - 25%), transparent calc(var(--wipe) * 125%))'
/* The warm wash round a glowing gem, and the white of its light at the middle. */
const HALO =
  'radial-gradient(circle closest-side, rgba(255,176,32,0.85), rgba(255,198,80,0.42) 38%, rgba(255,214,120,0.12) 70%, rgba(255,214,120,0) 100%)'
const BLOOM =
  'radial-gradient(circle closest-side, #fff, rgba(255,252,236,0.7) 28%, rgba(255,255,255,0) 62%)'
/* How far the glow reaches, as a multiple of the reach of the gem's own yellow wash. */
const GLOW_SPAN = 3.4

/* The parts of a drawing that the page changes as it scrolls. */
interface SlideParts {
  root: RefObject<HTMLDivElement | null>
  colour: RefObject<HTMLImageElement | null>
  lines: RefObject<HTMLCanvasElement | null>
  halo: RefObject<HTMLDivElement | null>
  bloom: RefObject<HTMLDivElement | null>
  gem: RefObject<HTMLImageElement | null>
}

function slideParts(): SlideParts {
  return {
    root: createRef(),
    colour: createRef(),
    lines: createRef(),
    halo: createRef(),
    bloom: createRef(),
    gem: createRef(),
  }
}

/*
  The landing page: a story told by scrolling. The page is a tall, empty
  track; the stage stays fixed in the window and is drawn again for wherever
  the reader is on the track, so scrolling up plays the story backwards.

  Add `?p=0.5` to the address to open it part of the way through, `?auto` to
  have the page scroll by itself (`?auto=60` to take 60 seconds), or `?flags`
  for the panel of things we are still choosing between.
*/
export function Landing({ onEnter }: { onEnter: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLDivElement>(null)
  const titleFrame = useRef<HTMLDivElement>(null)
  const fxCanvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [deskParts] = useState(slideParts)
  const [lightParts] = useState(slideParts)
  const drops = useRef<(HTMLImageElement | null)[]>([])
  const splashes = useRef<(HTMLImageElement | null)[]>([])
  const captions = useRef<(HTMLParagraphElement | null)[]>([])
  const button = useRef<HTMLButtonElement>(null)
  const pageGrain = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLParagraphElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const sound = useRef<LandingSound | null>(null)
  const leaving = useRef<number | null>(null)
  const [soundOn, setSoundOn] = useState(false)

  useEffect(() => {
    const track = scroller.current!
    const fx = createFx(fxCanvas.current!, {
      water: paintedWater ? art.water : null,
      grain: grainy ? art.grain : null,
    })
    const draws: [Speedraw, Speedraw] | null = speedraw
      ? [
          createSpeedraw(deskParts.lines.current!, desk.lines),
          createSpeedraw(lightParts.lines.current!, lightSlide.lines),
        ]
      : null
    sound.current = withSound ? createLandingSound() : null

    const box = { x: 0, y: 0, w: 0, h: 0 }
    let w = 0
    let h = 0
    let scale = 1
    let drawn = -1
    let held = 0
    let release: (() => void) | null = null
    let entered = false

    const travel = () => track.scrollHeight - track.clientHeight
    const query = new URLSearchParams(location.search)
    const start = Number(query.get('p'))
    // How many seconds the page takes to scroll itself from top to bottom, or 0 to leave it to the reader.
    let auto = query.has('auto') ? Number(query.get('auto')) || AUTO_SECONDS : 0
    let travelled = 0
    let before = 0
    // The reader takes over as soon as they scroll.
    const takeOver = () => {
      auto = 0
    }

    for (const event of TAKE_OVER) track.addEventListener(event, takeOver, { passive: true })
    if (start > 0) track.scrollTop = Math.min(1, start) * travel()
    track.focus()

    // The frame is as large as fits in the window, and centred.
    const layout = () => {
      w = track.clientWidth
      h = track.clientHeight
      box.w = Math.min(w, (h * FRAME.w) / FRAME.h)
      box.h = (box.w * FRAME.h) / FRAME.w
      box.x = (w - box.w) / 2
      box.y = (h - box.h) / 2
      scale = box.w / FRAME.w
      for (const element of [frame.current!, titleFrame.current!]) {
        element.style.left = `${box.x}px`
        element.style.top = `${box.y}px`
        element.style.width = `${box.w}px`
        element.style.height = `${box.h}px`
      }
      for (const caption of captions.current) caption!.style.fontSize = `${CAPTION.size * scale}px`
      button.current!.style.fontSize = `${BUTTON_SIZE * scale}px`
      fx.resize(w, h)
    }

    let request = requestAnimationFrame(function draw(now) {
      request = requestAnimationFrame(draw)
      const seconds = now / 1000
      const leftAt = leaving.current
      if (auto && before && leftAt === null) {
        travelled = Math.max(travelled, track.scrollTop) + (travel() * (now - before)) / 1000 / auto
        track.scrollTop = travelled
      }
      before = now

      const resized = track.clientWidth !== w || track.clientHeight !== h
      if (resized) {
        layout()
        // The track is as tall as the window allows, so keep the reader's place in the story.
        if (drawn > 0) track.scrollTop = drawn * travel()
      }

      // After the button the page holds still while the water covers it.
      if (leftAt !== null) {
        if (!release) {
          release = holdScroll(track)
          held = track.scrollTop
        }
        track.scrollTop = held
      }

      const p = travel() > 0 ? track.scrollTop / travel() : 0
      const wash = beat('wash', p)
      // Only the water moves by itself. The rest is still until the page is scrolled.
      if (p === drawn && !resized && wash === 0 && leftAt === null) return
      drawn = p

      const leave = leftAt === null ? 0 : linear(0, LEAVE_SECONDS, seconds - leftAt)
      const bloom = bloomAt(p)
      const titleFade = beat('titleFade', p)
      const splash = splashAt(p)
      const deskShown = beat('deskIn', p) * (1 - beat('deskOut', p))
      const lightShown = beat('lightIn', p) * (1 - beat('lightOut', p))

      // The title, and its heavy grain, until they fade to the white paper of the drawings (#1).
      title.current!.style.opacity = String(1 - titleFade)
      title.current!.style.visibility = titleFade >= 1 ? 'hidden' : 'visible'
      hint.current!.style.opacity = String(1 - beat('hint', p))
      if (pageGrain.current) pageGrain.current.style.opacity = String(PAGE_GRAIN * titleFade)

      // The two drawings (#2, #3, #5) and their gems (#6).
      showSlide(
        deskParts,
        draws?.[0],
        beat('deskIn', p),
        beat('deskOut', p),
        beat('deskGlow', p),
        p,
        scale,
      )

      showSlide(
        lightParts,
        draws?.[1],
        beat('lightIn', p),
        beat('lightOut', p),
        beat('lightGlow', p),
        p,
        scale,
      )

      // The captions wipe in (#4), and the last one rises to the middle, grows and goes (#8).
      const [deskCaption, lightCaption, lastCaption] = captions.current
      wipe(deskCaption!, beat('deskCaption', p), 1 - beat('deskOut', p))
      wipe(lightCaption!, beat('lightCaption', p), 1 - beat('lightOut', p))
      const lift = beat('lift', p)
      wipe(lastCaption!, beat('lastCaption', p), 1 - ramp(0.4, 1, lift))
      lastCaption!.style.transform = `translate(-50%, ${-LAST_CAPTION_RISE * lift * scale}px) scale(${1 + 1.4 * lift})`

      // The drop falls through every slide, then the splash takes over from it (#10).
      const drop = dropAt(p)
      drops.current.forEach((element, i) => {
        const shown = i === drop.frame && splash.frame < 0 && drop.alpha > 0
        element!.style.visibility = shown ? 'visible' : 'hidden'
        if (!shown) return
        element!.style.top = percent(drop.y - DROP_SPRITE.h / 2, FRAME.h)
        element!.style.opacity = String(drop.alpha)
      })

      splashes.current.forEach((element, i) => {
        element!.style.visibility = i === splash.frame ? 'visible' : 'hidden'
      })

      // The button comes in from the rings, and goes when it is pressed.
      const ready = splash.button > 0.6 && leftAt === null
      button.current!.style.opacity = String(splash.button * (1 - leave))
      button.current!.style.transform = `translate(-50%, -50%) scale(${0.85 + 0.15 * splash.button})`
      button.current!.style.pointerEvents = ready ? 'auto' : 'none'
      button.current!.disabled = !ready

      const painting = bloom.alpha > 0 || wash > 0 || leave > 0
      fx.render(
        painting
          ? {
              time: seconds,
              bloom: bloom.scale,
              bloomAlpha: bloom.alpha,
              box: [box.x, box.y, box.w, box.h],
              grain: TITLE_GRAIN,
              wash,
              waterTop: box.y + WATER_LINE * scale,
              flood: leave,
            }
          : null,
      )

      rail.current!.style.transform = `scaleY(${p})`
      sound.current?.update({
        glow: Math.max(beat('deskGlow', p) * deskShown, beat('lightGlow', p) * lightShown),
        wash,
        ripple: splash.ripple,
        leaving: leave,
      })

      if (leave >= 1 && !entered) {
        entered = true
        onEnter()
      }
    })

    return () => {
      cancelAnimationFrame(request)
      for (const event of TAKE_OVER) track.removeEventListener(event, takeOver)
      release?.()
      fx.dispose()
      draws?.forEach((d) => d.dispose())
      sound.current?.dispose()
      sound.current = null
    }
  }, [deskParts, lightParts, onEnter])

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    sound.current?.setOn(next)
  }

  return (
    <div
      ref={scroller}
      tabIndex={-1}
      className="fixed inset-0 overflow-x-hidden overflow-y-auto overscroll-none bg-white outline-none"
    >
      <div style={{ height: `${TRACK_HEIGHTS * 100}dvh` }}>
        <div
          className="sticky top-0 h-dvh overflow-hidden bg-white select-none"
          style={{ fontFamily: FONT }}
        >
          {/* The title's canvas and paint, with the grain that comes in with the paint, and later the water. */}
          <canvas
            ref={fxCanvas}
            className="pointer-events-none absolute inset-0 block h-full w-full"
          />

          <div ref={title} className="pointer-events-none absolute inset-0">
            <div ref={titleFrame} className="absolute">
              <TitleText />
            </div>
          </div>

          {/*
            The drawings are paper multiplied onto the white page. They never sit over
            the canvas while it is painting, because browsers do not always blend an
            image onto a WebGL canvas. The drop and the splash are pencil on nothing,
            so they need no blending and can go over the water.
          */}
          <div ref={frame} className="absolute">
            <SlideArt slide={desk} parts={deskParts} />
            <SlideArt slide={lightSlide} parts={lightParts} />

            {art.drops.map((src, i) => (
              <img
                key={src}
                ref={(element) => {
                  drops.current[i] = element
                }}
                src={src}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{
                  left: percent(DROP_X - DROP_SPRITE.w / 2, FRAME.w),
                  width: percent(DROP_SPRITE.w, FRAME.w),
                  height: percent(DROP_SPRITE.h, FRAME.h),
                  visibility: 'hidden',
                }}
              />
            ))}

            {art.splashes.map((src, i) => (
              <img
                key={src}
                ref={(element) => {
                  splashes.current[i] = element
                }}
                src={src}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{ ...place(SPLASH_RECT), visibility: 'hidden' }}
              />
            ))}

            {[desk.caption, lightSlide.caption, LAST_CAPTION].map((text, i) => (
              <p
                key={text}
                ref={(element) => {
                  captions.current[i] = element
                }}
                className="pointer-events-none absolute m-0 whitespace-nowrap"
                style={{
                  left: '50%',
                  top: percent(CAPTION.top, FRAME.h),
                  color: CAPTION_INK,
                  fontWeight: 300,
                  letterSpacing: '-0.1em',
                  transform: 'translateX(-50%)',
                  maskImage: WIPE,
                  WebkitMaskImage: WIPE,
                  visibility: 'hidden',
                }}
              >
                {text}
              </p>
            ))}

            <button
              ref={button}
              type="button"
              aria-label="enter the world"
              onClick={() => {
                leaving.current ??= performance.now() / 1000
              }}
              className="absolute cursor-pointer rounded-full border-0 transition-shadow hover:shadow-[0_0_0_1px_rgba(88,71,71,0.45),0_8px_28px_rgba(30,60,110,0.28)]"
              style={{
                left: percent(SPLASH_CENTRE.x, FRAME.w),
                top: percent(SPLASH_CENTRE.y, FRAME.h),
                padding: '0.45em 1.6em',
                color: CAPTION_INK,
                background: 'rgba(255,255,255,0.88)',
                boxShadow: '0 0 0 1px rgba(88,71,71,0.25), 0 6px 24px rgba(30,60,110,0.18)',
                fontFamily: FONT,
                fontWeight: 300,
                letterSpacing: '-0.04em',
                opacity: 0,
                pointerEvents: 'none',
              }}
            >
              enter
            </button>
          </div>

          {grainy && <Grain ref={pageGrain} opacity={0} />}

          <p
            ref={hint}
            className="pointer-events-none absolute inset-x-0 bottom-[5dvh] m-0 text-center text-xs tracking-[0.3em]"
            style={{ color: 'rgba(67,67,67,0.6)' }}
          >
            scroll
          </p>

          {withSound && (
            <button
              type="button"
              onClick={toggleSound}
              className="absolute bottom-4 left-4 cursor-pointer rounded-full border-0 bg-white/70 px-3 py-1 text-xs tracking-[0.15em]"
              style={{ color: CAPTION_INK, fontFamily: FONT }}
            >
              {soundOn ? 'sound on' : 'sound off'}
            </button>
          )}

          <div
            className="pointer-events-none absolute top-1/2 right-4 h-32 w-px -translate-y-1/2"
            style={{ background: 'rgba(88,71,71,0.15)' }}
          >
            <div
              ref={rail}
              className="h-full w-full origin-top"
              style={{ background: CAPTION_INK }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/* Textures-2 1 from the Figma file, over the whole window. */
function Grain({ opacity, ref }: { opacity: number; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 bg-cover bg-center"
      style={{ backgroundImage: `url(${art.grain})`, opacity }}
    />
  )
}

/*
  One drawing, with its gem on a layer of its own over a warm wash and a
  white light. The whole drawing is multiplied onto the page like paint, so
  the white of its paper drops away.
*/
function SlideArt({ slide, parts }: { slide: Slide; parts: SlideParts }) {
  const { root, colour, lines, halo, bloom, gem: gemLayer } = parts
  const { gem } = slide
  const span = gem.reach * GLOW_SPAN
  const glow = {
    x: gem.rect.x + gem.rect.w / 2 - span / 2,
    y: gem.rect.y + gem.rect.h / 2 - span / 2,
    w: span,
    h: span,
  }

  return (
    <div
      ref={root}
      className="pointer-events-none absolute inset-0 mix-blend-multiply"
      style={{ visibility: 'hidden' }}
    >
      <img
        ref={colour}
        src={slide.image}
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={place(slide.rect)}
      />
      {speedraw && <canvas ref={lines} className="absolute block" style={place(slide.rect)} />}
      {glows && (
        <>
          <div
            ref={halo}
            className="absolute rounded-full mix-blend-multiply"
            style={{ ...place(glow), background: HALO, opacity: 0 }}
          />
          <div
            ref={bloom}
            className="absolute rounded-full"
            style={{ ...place(glow), background: BLOOM, opacity: 0 }}
          />
        </>
      )}
      <img
        ref={gemLayer}
        src={gem.image}
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={place(gem.rect)}
      />
    </div>
  )
}

/*
  Show a drawing that is `enter` of the way in and `leave` of the way out,
  with its gem glowing `glow` (#6). The glow grows as the page goes down and
  breathes with the scroll, not with time, so it stops when the reader does.
*/
function showSlide(
  parts: SlideParts,
  draw: Speedraw | undefined,
  enter: number,
  leave: number,
  glow: number,
  p: number,
  scale: number,
) {
  const root = parts.root.current!
  // A speed-drawn drawing is there from its first line; a faded one is as there as it is faded in.
  const shown = (draw ? Math.ceil(enter) : enter) * (1 - leave)
  root.style.visibility = shown > 0 ? 'visible' : 'hidden'
  if (shown <= 0) return
  root.style.opacity = String(shown)
  root.style.transform = `translateY(${(1 - enter) * 1.2 - leave * 2}%)`

  if (draw) {
    draw.draw(linear(0, 0.7, enter))
    const colour = ramp(0.55, 1, enter)
    parts.colour.current!.style.opacity = String(colour)
    parts.gem.current!.style.opacity = String(colour)
    parts.lines.current!.style.opacity = String(1 - ramp(0.85, 1, enter))
  }

  const g = glows ? glow : 0
  const breath = 0.5 + 0.5 * Math.sin(p * Math.PI * 2 * 14)
  const halo = parts.halo.current
  const bloom = parts.bloom.current
  if (halo && bloom) {
    halo.style.opacity = String(g * (0.7 + 0.3 * breath))
    halo.style.transform = `scale(${0.55 + 0.45 * g + 0.12 * breath})`
    bloom.style.opacity = String(g * (0.55 + 0.45 * breath))
    bloom.style.transform = `scale(${0.35 + 0.25 * g + 0.05 * breath})`
  }

  // The gem lifts a little off the page as it lights up.
  parts.gem.current!.style.transform = `translateY(${-12 * g}%) scale(${1 + 0.1 * g})`
  parts.gem.current!.style.filter =
    g > 0
      ? `drop-shadow(0 0 ${(6 + 16 * g) * scale}px rgba(255,170,30,${g})) brightness(${1 + 0.15 * g})`
      : 'none'
}

/* Wipe a caption in to `amount` (0 to 1) and show it at `opacity`. */
function wipe(caption: HTMLElement, amount: number, opacity: number) {
  caption.style.setProperty('--wipe', String(amount))
  caption.style.opacity = String(opacity)
  caption.style.visibility = amount > 0 && opacity > 0 ? 'visible' : 'hidden'
}
