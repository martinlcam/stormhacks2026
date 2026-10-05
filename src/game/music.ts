import { create } from 'zustand'

export interface MusicTrack {
  title: string
  artist: string
  src: string
}

const ARTIST = 'Grace Chiang'
const files = [
  'Grace Chiang - adore Him.mp3',
  'Grace Chiang - biking to the beach.mp3',
  'Grace Chiang - dinner on the moon.mp3',
  'Grace Chiang - flipping through channels.mp3',
  'Grace Chiang - jamming in the car.mp3',
  'Grace Chiang - midnight.mp3',
  'Grace Chiang - staying in on Sunday (it is well).mp3',
  'Grace Chiang - sunbathing in the dark.mp3',
  'Grace Chiang - waiting for that damn 99.mp3',
] as const

const musicFile = (file: string) =>
  `${import.meta.env.BASE_URL}music/${file
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`

export const MUSIC_TRACKS: readonly MusicTrack[] = files.map((file) => ({
  title: file.slice(`${ARTIST} - `.length, -'.mp3'.length),
  artist: ARTIST,
  src: musicFile(file),
}))

export function trackBy(index: number, offset: number): number {
  return (((index + offset) % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length
}

interface MusicState {
  current: number
  /* What the listener asked for. It can be true before the first click lets audio begin. */
  playing: boolean
  ready: boolean
  /* Listener volume from silent at 0 to the still-background maximum at 1. */
  volume: number
}

/* Slightly louder than the first version, while remaining well below the effects. */
const DEFAULT_VOLUME = 0.6
const MAX_MUSIC_LEVEL = 0.12

export const useMusic = create<MusicState>(() => ({
  current: 0,
  playing: true,
  ready: false,
  volume: DEFAULT_VOLUME,
}))

/* The end of one piece and the start of the next share this many seconds. */
const TRACK_BLEND = 6
/* A requested skip is quicker, but is still a blend rather than a cut. */
const SKIP_BLEND = 1.5
const PLAY_FADE = 0.45
const CURVE_STEPS = 64

const fadeIn = Float32Array.from({ length: CURVE_STEPS }, (_, i) =>
  Math.sin((i / (CURVE_STEPS - 1)) * (Math.PI / 2)),
)
const fadeOut = Float32Array.from({ length: CURVE_STEPS }, (_, i) =>
  Math.cos((i / (CURVE_STEPS - 1)) * (Math.PI / 2)),
)

interface Deck {
  audio: HTMLAudioElement
  gain: GainNode
  source: MediaElementAudioSourceNode
  track: number
}

interface Transition {
  from: number
  to: number
  ends: number
}

let player: Music | null = null

function registerPlayer(next: Music | null) {
  player = next
}

/* The React controls can reach the one music player owned by the running game. */
export const musicControls = {
  previous: () => player?.previous(),
  toggle: () => player?.toggle(),
  next: () => player?.next(),
  setVolume: (volume: number) => {
    if (player) player.setVolume(volume)
    else useMusic.setState({ volume: clampVolume(volume) })
  },
}

const clampVolume = (volume: number) => Math.max(0, Math.min(1, volume))

/*
  Two audio elements act as decks. The next recording is loaded while the
  current one plays, then equal-power gain curves overlap their ends. Once
  the last track reaches the first, the same process continues forever.
*/
export class Music {
  private context?: AudioContext
  private bus?: GainNode
  private decks: Deck[] = []
  private active = 0
  private current = useMusic.getState().current
  private wantsPlayback = useMusic.getState().playing
  private volume = useMusic.getState().volume
  private transition?: Transition
  private transitionPending = false
  private playRequest = 0
  private pauseTimer = 0
  private frame = 0

  constructor() {
    registerPlayer(this)
    this.publish(false)
  }

  start(context: AudioContext, destination: AudioNode) {
    if (this.context) return
    this.context = context
    this.bus = context.createGain()
    this.bus.gain.value = this.volume * MAX_MUSIC_LEVEL
    this.bus.connect(destination)
    this.decks = [this.makeDeck(0), this.makeDeck(1)]
    this.load(0, this.current)
    this.load(1, trackBy(this.current, 1))
    this.publish(true)
    this.frame = requestAnimationFrame(this.update)
    if (this.wantsPlayback) this.playActive()
  }

  previous() {
    this.change(-1)
  }

  next() {
    this.change(1)
  }

  toggle() {
    this.wantsPlayback = !this.wantsPlayback
    this.publish(Boolean(this.context))
    if (!this.context) return
    if (this.wantsPlayback) this.playActive()
    else this.pause()
  }

  setVolume(volume: number) {
    this.volume = clampVolume(volume)
    if (this.context && this.bus) {
      this.bus.gain.setTargetAtTime(this.volume * MAX_MUSIC_LEVEL, this.context.currentTime, 0.03)
    }
    this.publish(Boolean(this.context))
  }

  dispose() {
    this.playRequest++
    cancelAnimationFrame(this.frame)
    clearTimeout(this.pauseTimer)
    for (const deck of this.decks) {
      deck.audio.pause()
      deck.audio.removeAttribute('src')
      deck.audio.load()
      deck.source.disconnect()
      deck.gain.disconnect()
    }
    this.bus?.disconnect()
    this.decks = []
    this.context = undefined
    this.transition = undefined
    if (player === this) registerPlayer(null)
    this.publish(false)
  }

  private makeDeck(index: number): Deck {
    const context = this.context!
    const audio = new Audio()
    audio.preload = 'auto'
    const source = context.createMediaElementSource(audio)
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(gain).connect(this.bus!)
    audio.addEventListener('ended', () => {
      if (index === this.active && !this.transition && !this.transitionPending) {
        this.beginTransition(trackBy(this.current, 1), PLAY_FADE)
      }
    })
    return { audio, source, gain, track: -1 }
  }

  private load(deckIndex: number, track: number) {
    const deck = this.decks[deckIndex]
    deck.audio.pause()
    deck.audio.src = MUSIC_TRACKS[track].src
    deck.audio.load()
    deck.track = track
    this.setGain(deck, 0)
  }

  private change(offset: number) {
    this.finishTransition()
    const track = trackBy(this.current, offset)
    if (!this.context) {
      this.current = track
      this.publish(false)
      return
    }
    if (!this.wantsPlayback) {
      this.current = track
      this.load(this.active, track)
      this.load(1 - this.active, trackBy(track, 1))
      this.publish(true)
      return
    }
    this.beginTransition(track, SKIP_BLEND)
  }

  private playActive() {
    const context = this.context
    if (!context) return
    clearTimeout(this.pauseTimer)
    const request = ++this.playRequest
    const deck = this.decks[this.active]
    void deck.audio
      .play()
      .then(() => {
        if (request !== this.playRequest || !this.wantsPlayback) {
          deck.audio.pause()
          return
        }
        this.ramp(deck, 1, PLAY_FADE)
        this.publish(true)
      })
      .catch(() => {
        if (request !== this.playRequest) return
        this.wantsPlayback = false
        this.publish(true)
      })
  }

  private pause() {
    this.finishTransition()
    this.playRequest++
    clearTimeout(this.pauseTimer)
    const deck = this.decks[this.active]
    this.ramp(deck, 0, PLAY_FADE)
    this.pauseTimer = window.setTimeout(() => {
      if (!this.wantsPlayback) deck.audio.pause()
    }, PLAY_FADE * 1000)
  }

  private beginTransition(track: number, seconds: number) {
    const context = this.context
    if (!context || this.transition || this.transitionPending) return
    const from = this.active
    const to = 1 - from
    if (this.decks[to].track !== track) this.load(to, track)
    const incoming = this.decks[to]
    this.transitionPending = true
    const request = ++this.playRequest

    void incoming.audio
      .play()
      .then(() => {
        if (request !== this.playRequest || !this.wantsPlayback) {
          incoming.audio.pause()
          this.transitionPending = false
          return
        }
        const now = context.currentTime
        this.curve(this.decks[from], fadeOut, now, seconds)
        this.curve(incoming, fadeIn, now, seconds)
        this.current = track
        this.transition = { from, to, ends: now + seconds }
        this.transitionPending = false
        this.publish(true)
      })
      .catch(() => {
        if (request !== this.playRequest) return
        this.transitionPending = false
      })
  }

  private finishTransition() {
    const transition = this.transition
    if (!transition) return
    const outgoing = this.decks[transition.from]
    const incoming = this.decks[transition.to]
    outgoing.audio.pause()
    outgoing.audio.currentTime = 0
    this.setGain(outgoing, 0)
    this.setGain(incoming, 1)
    this.active = transition.to
    this.transition = undefined
    this.load(transition.from, trackBy(this.current, 1))
  }

  private readonly update = () => {
    const context = this.context
    if (!context) return
    if (this.transition && context.currentTime >= this.transition.ends) this.finishTransition()

    if (this.wantsPlayback && !this.transition && !this.transitionPending) {
      const audio = this.decks[this.active].audio
      const remaining = audio.duration - audio.currentTime
      if (Number.isFinite(remaining) && remaining > 0 && remaining <= TRACK_BLEND) {
        this.beginTransition(trackBy(this.current, 1), Math.min(TRACK_BLEND, remaining))
      }
    }
    this.frame = requestAnimationFrame(this.update)
  }

  private curve(deck: Deck, values: Float32Array, at: number, seconds: number) {
    deck.gain.gain.cancelScheduledValues(at)
    deck.gain.gain.setValueCurveAtTime(values, at, seconds)
  }

  private ramp(deck: Deck, value: number, seconds: number) {
    const context = this.context!
    const gain = deck.gain.gain
    const now = context.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(value, now + seconds)
  }

  private setGain(deck: Deck, value: number) {
    const now = this.context?.currentTime ?? 0
    deck.gain.gain.cancelScheduledValues(now)
    deck.gain.gain.setValueAtTime(value, now)
  }

  private publish(ready: boolean) {
    useMusic.setState({
      current: this.current,
      playing: this.wantsPlayback,
      ready,
      volume: this.volume,
    })
  }
}
