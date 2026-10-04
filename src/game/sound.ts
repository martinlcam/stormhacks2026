import type { PlayerController } from '../engine/PlayerController'

/* Metres walked between footsteps, per unit of the player's scale. */
const STRIDE = 2.1
/* The low note under each sky, in hertz. Every door moves to the next. */
const ROOTS = [55, 49, 61.7, 65.4, 73.4, 46.2]

/* How long the rain is before it comes round again. */
const RAIN_SECONDS = 8
/* Small drops, and heavy drips into standing water, in each second of rain. */
const DROPS = 380
const DRIPS = 5

/*
  The sound of rain falling, as samples from -1 to 1 that can be played
  round and round without a join. It is built one drop at a time.

  A small drop is a tick: a few thousandths of a second of a high note and
  noise, dying away at once. Most are faint and a few are loud, as drops
  near the ear are. A drip into a puddle is rarer, longer and lower, and
  its note rises as it dies, which is what makes it sound like water.
*/
export function rainDrops(
  rate: number,
  seconds: number,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * seconds))
  const add = (start: number, length: number, at: (t: number) => number) => {
    for (let k = 0; k < length; k++) {
      // A drop that runs off the end carries on at the beginning.
      samples[(start + k) % samples.length] += at(k / rate)
    }
  }
  for (let i = 0; i < DROPS * seconds; i++) {
    const pitch = 1800 + random() ** 2 * 7000
    const fade = 0.0015 + random() * 0.005
    const loud = 0.015 + random() ** 4 * 0.4
    add(Math.floor(random() * samples.length), Math.ceil(fade * 6 * rate), (t) => {
      const tick = Math.sin(2 * Math.PI * pitch * t) * 0.6 + (random() * 2 - 1) * 0.4
      return loud * Math.exp(-t / fade) * tick
    })
  }
  for (let i = 0; i < DRIPS * seconds; i++) {
    const pitch = 700 + random() * 1100
    const length = 0.03 + random() * 0.05
    const loud = 0.12 + random() * 0.25
    add(Math.floor(random() * samples.length), Math.ceil(length * rate), (t) => {
      // The note climbs by half as much again while it lasts.
      const turns = pitch * (t + (0.25 * t * t) / length)
      return loud * Math.exp((-4 * t) / length) * Math.sin(2 * Math.PI * turns)
    })
  }
  return samples
}

/*
  Every sound in the game, made here from oscillators and noise; there are
  no sound files. Nothing plays until `start`, which must follow a click,
  because a browser will not make sound before one.
*/
export class Sound {
  private context?: AudioContext
  private master?: GainNode
  private noise?: AudioBuffer
  private drone: OscillatorNode[] = []
  private muted = false
  private walked = 0
  private doors = 0
  private wasOnGround = true
  private fallSpeed = 0

  start() {
    if (this.context) {
      void this.context.resume()
      return
    }
    const context = new AudioContext()
    this.context = context
    this.master = context.createGain()
    this.master.gain.value = this.muted ? 0 : 0.6
    this.master.connect(context.destination)

    // One second of noise, used for steps, wind and throws.
    this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const samples = this.noise.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1

    // A quiet chord that is always there: a note, the fifth above it, and
    // the note again an octave up, a little out of tune so that it moves.
    const hum = context.createGain()
    hum.gain.value = 0.09
    const soften = context.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 420
    hum.connect(soften).connect(this.master)
    this.drone = [1, 1.5, 2.01].map((ratio) => {
      const voice = context.createOscillator()
      voice.type = ratio === 1 ? 'triangle' : 'sine'
      voice.frequency.value = ROOTS[0] * ratio
      voice.connect(hum)
      voice.start()
      return voice
    })

    // Rain that never stops. What makes rain sound like rain and not like
    // hiss is that it is made of separate drops, so most of it is drops:
    // eight seconds of them, different in each ear, played round and round.
    // It takes a moment to make, so it is made just after the click that
    // starts the sound and not during it.
    const master = this.master
    setTimeout(() => {
      if (this.context !== context) return
      const drops = rainDrops(context.sampleRate, RAIN_SECONDS)
      const rain = context.createBuffer(2, drops.length, context.sampleRate)
      rain.copyToChannel(drops, 0)
      // The other ear hears the same rain from a different moment, which
      // is as good as different rain and takes half as long to make.
      const later = Math.floor(drops.length * 0.47)
      const other = new Float32Array(drops.length)
      other.set(drops.subarray(later))
      other.set(drops.subarray(0, later), drops.length - later)
      rain.copyToChannel(other, 1)
      const falling = context.createBufferSource()
      falling.buffer = rain
      falling.loop = true
      const lift = context.createBiquadFilter()
      lift.type = 'highpass'
      lift.frequency.value = 500
      const wet = context.createGain()
      wet.gain.value = 0.55
      falling.connect(lift).connect(wet).connect(master)
      falling.start()
    }, 0)

    // Under the drops, the far-off wash of all the rain too distant to
    // hear as drops. It is kept quiet, and it swells and sinks like gusts.
    const wash = context.createBufferSource()
    wash.buffer = this.noise
    wash.loop = true
    const band = context.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2400
    band.Q.value = 0.6
    const far = context.createGain()
    far.gain.value = 0.035
    const gust = context.createOscillator()
    gust.frequency.value = 0.11
    const sway = context.createGain()
    sway.gain.value = 0.015
    gust.connect(sway).connect(far.gain)
    gust.start()
    wash.connect(band).connect(far).connect(this.master)
    wash.start()
  }

  /* M: turn all sound off or back on. */
  toggle() {
    this.muted = !this.muted
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.context.currentTime, 0.05)
    }
  }

  dispose() {
    void this.context?.close()
    this.context = undefined
  }

  /* Listen to the player: footsteps, landings and doors. */
  update(dt: number, player: PlayerController) {
    if (player.doors !== this.doors) {
      this.doors = player.doors
      this.walked = 0
      this.door(player.doors)
    }
    const speed = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z)
    if (player.onGround) {
      if (!this.wasOnGround && this.fallSpeed > 3 * player.scale) this.step(player.scale, 1.6)
      if (speed > 1 * player.scale) this.walked += speed * dt
      if (this.walked > STRIDE * player.scale) {
        this.walked = 0
        this.step(player.scale, 1)
      }
    } else {
      this.fallSpeed = speed
    }
    this.wasOnGround = player.onGround
  }

  /* A footstep. A small player's steps are higher and quieter. */
  private step(scale: number, weight: number) {
    const pitch = 1 / Math.sqrt(scale)
    this.burst({
      from: (380 + Math.random() * 120) * pitch,
      to: 160 * pitch,
      seconds: 0.09,
      volume: 0.22 * weight * Math.min(1, Math.sqrt(scale) + 0.3),
    })
  }

  /* Going through a door: a rush of air, and the chord moves to the next sky's note. */
  private door(doors: number) {
    this.burst({ from: 250, to: 1800, seconds: 0.45, volume: 0.3 })
    const context = this.context
    if (!context) return
    const root = ROOTS[((doors % ROOTS.length) + ROOTS.length) % ROOTS.length]
    const ratios = [1, 1.5, 2.01]
    this.drone.forEach((voice, i) => {
      voice.frequency.setTargetAtTime(root * ratios[i], context.currentTime, 0.4)
    })
  }

  pickUp() {
    this.note(520, 0.07, 0.16)
    this.note(780, 0.1, 0.16, 0.06)
  }

  putDown() {
    this.note(420, 0.1, 0.14)
  }

  /* A throw; `level` is how full the charge was, 0 to 1. */
  throw(level: number) {
    this.burst({ from: 500 + 900 * level, to: 250, seconds: 0.18 + 0.12 * level, volume: 0.25 })
  }

  /* Something new was discovered. */
  chime() {
    ;[659.3, 830.6, 987.8, 1318.5].forEach((pitch, i) => this.note(pitch, 0.9, 0.12, i * 0.09))
  }

  /* Noise through a filter that slides from one pitch to another. */
  private burst({
    from,
    to,
    seconds,
    volume,
  }: {
    from: number
    to: number
    seconds: number
    volume: number
  }) {
    const { context, master, noise } = this
    if (!context || !master || !noise) return
    const now = context.currentTime
    const source = context.createBufferSource()
    source.buffer = noise
    // Start somewhere different each time, so no two bursts are the same.
    const offset = Math.random() * (1 - Math.min(seconds, 0.9))
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.2
    filter.frequency.setValueAtTime(from, now)
    filter.frequency.exponentialRampToValueAtTime(to, now + seconds)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(volume, now + seconds * 0.2)
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds)
    source.connect(filter).connect(gain).connect(master)
    source.start(now, offset, seconds + 0.05)
  }

  /* A soft bell note that dies away over `seconds`, starting after `delay`. */
  private note(pitch: number, seconds: number, volume: number, delay = 0) {
    const { context, master } = this
    if (!context || !master) return
    const at = context.currentTime + delay
    const voice = context.createOscillator()
    voice.type = 'sine'
    voice.frequency.value = pitch
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(volume, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds)
    voice.connect(gain).connect(master)
    voice.start(at)
    voice.stop(at + seconds + 0.05)
  }
}
