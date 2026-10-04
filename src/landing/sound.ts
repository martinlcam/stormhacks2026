import { RAIN_FILE, seamless } from '../game/sound'

/*
  `?sound=on` (#11): wind that is always there, the rain recording once the
  water comes up, a chime when a light starts to glow and a drip when the
  drop lands. All but the rain are made here. The sound is on from the start,
  but a browser makes no sound before a click or a key, so it is first heard
  at the reader's first one.
*/
export interface LandingSound {
  setOn(on: boolean): void
  /* `glow`, `wash` and `leaving` run from 0 to 1; `ripple` is negative until the drop lands. */
  update(state: { glow: number; wash: number; ripple: number; leaving: number }): void
  dispose(): void
}

const VOLUME = 0.7
const WIND = 0.16
const RAIN = 0.12
/* Seconds that the rain recording's end is faded into its start, so it loops without a join. */
const RAIN_BLEND = 2
/* What a browser takes as the reader asking for sound. */
const WAKE = ['pointerdown', 'pointerup', 'keydown'] as const

export function createLandingSound(): LandingSound {
  let context: AudioContext | undefined
  let master: GainNode | undefined
  let rain: GainNode | undefined
  let on = false
  let glowing = false
  let landed = false

  // Sound that was turned on before the browser allowed it starts here.
  const wake = () => {
    if (on) void context?.resume()
  }
  for (const event of WAKE) window.addEventListener(event, wake)

  function start(): AudioContext {
    const audio = new AudioContext()
    context = audio
    master = audio.createGain()
    master.gain.value = 0
    master.connect(audio.destination)

    // Wind: noise through a low filter that opens and closes slowly.
    const noise = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate)
    const samples = noise.getChannelData(0)
    let last = 0
    for (let i = 0; i < samples.length; i++) {
      // Brown noise: each sample a small step from the last, so it rumbles rather than hisses.
      last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02
      samples[i] = last * 3.5
    }
    const wind = audio.createBufferSource()
    wind.buffer = noise
    wind.loop = true
    const filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    const gust = audio.createOscillator()
    gust.frequency.value = 0.07
    const gustDepth = audio.createGain()
    gustDepth.gain.value = 260
    gust.connect(gustDepth).connect(filter.frequency)
    const windGain = audio.createGain()
    windGain.gain.value = WIND
    wind.connect(filter).connect(windGain).connect(master)
    wind.start()
    gust.start()

    // Rain: the game's recording, silent until the water comes up.
    const rainGain = audio.createGain()
    rainGain.gain.value = 0
    rainGain.connect(master)
    rain = rainGain
    void fetch(RAIN_FILE)
      .then((response) => response.arrayBuffer())
      .then((data) => audio.decodeAudioData(data))
      .then((decoded) => {
        const loop = seamless(decoded.getChannelData(0), decoded.sampleRate, RAIN_BLEND, 0.2)
        const buffer = audio.createBuffer(1, loop.length, decoded.sampleRate)
        buffer.copyToChannel(loop, 0)
        const source = audio.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(rainGain)
        source.start()
      })
      .catch(() => {})
    return audio
  }

  // A soft bell: three partials that ring and die away, with a short echo.
  function chime(audio: AudioContext, out: AudioNode) {
    const now = audio.currentTime
    const echo = audio.createDelay()
    echo.delayTime.value = 0.23
    const feedback = audio.createGain()
    feedback.gain.value = 0.35
    echo.connect(feedback).connect(echo)
    echo.connect(out)
    for (const [frequency, level] of [
      [880, 0.06],
      [1320, 0.035],
      [1975, 0.02],
    ]) {
      const tone = audio.createOscillator()
      tone.frequency.value = frequency
      const envelope = audio.createGain()
      envelope.gain.setValueAtTime(0, now)
      envelope.gain.linearRampToValueAtTime(level, now + 0.02)
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 2.6)
      tone.connect(envelope)
      envelope.connect(out)
      envelope.connect(echo)
      tone.start(now)
      tone.stop(now + 2.7)
    }
  }

  // A drop landing: a quick falling note.
  function drip(audio: AudioContext, out: AudioNode) {
    const now = audio.currentTime
    const tone = audio.createOscillator()
    tone.frequency.setValueAtTime(1500, now)
    tone.frequency.exponentialRampToValueAtTime(420, now + 0.14)
    const envelope = audio.createGain()
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(0.25, now + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)
    tone.connect(envelope).connect(out)
    tone.start(now)
    tone.stop(now + 0.32)
  }

  return {
    setOn(value) {
      on = value
      const audio = context ?? (on ? start() : undefined)
      if (!audio || !master) return
      void audio.resume()
      master.gain.setTargetAtTime(on ? VOLUME : 0, audio.currentTime, 0.25)
    },
    update({ glow, wash, ripple, leaving }) {
      // Nothing is played into a context that is still waiting, or it would all sound at once later.
      const audio = on && context?.state === 'running' ? context : undefined
      if (audio && master && rain) {
        rain.gain.setTargetAtTime(wash * RAIN * (1 - leaving), audio.currentTime, 0.3)
        master.gain.setTargetAtTime(VOLUME * (1 - leaving), audio.currentTime, 0.3)
      }

      if (glow > 0.5 && !glowing && audio && master) chime(audio, master)
      if (ripple >= 0 && !landed && audio && master) drip(audio, master)
      // Each plays again only after the page has been scrolled back before it.
      if (glow > 0.5) glowing = true
      else if (glow < 0.2) glowing = false
      landed = ripple >= 0
    },
    dispose() {
      for (const event of WAKE) window.removeEventListener(event, wake)
      void context?.close()
    },
  }
}
