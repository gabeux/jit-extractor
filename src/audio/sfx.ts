// All SFX are synthesized with WebAudio — no audio asset files.
let ctx: AudioContext | null = null
let master: GainNode | null = null

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.22
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

function env(duration: number, peak = 1): GainNode {
  const g = ctx!.createGain()
  const t = ctx!.currentTime
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  g.connect(master!)
  return g
}

function tone(type: OscillatorType, from: number, to: number, duration: number, peak = 1) {
  if (!ctx) return
  const o = ctx.createOscillator()
  o.type = type
  const t = ctx.currentTime
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration)
  o.connect(env(duration, peak))
  o.start(t)
  o.stop(t + duration + 0.02)
}

function noise(duration: number, peak = 1, lowpass = 1200) {
  if (!ctx) return
  const len = Math.floor(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = lowpass
  src.connect(f)
  f.connect(env(duration, peak))
  src.start()
}

// Weather ambience: one looping filtered-noise bed, gain-faded per weather.
// Deliberately very quiet — atmosphere, not a soundtrack.
let ambSrc: AudioBufferSourceNode | null = null
let ambGain: GainNode | null = null
export function setWeatherAmbience(level: number) {
  if (!ctx || !master) return
  if (level <= 0) {
    if (ambGain) ambGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    if (ambSrc) {
      const s = ambSrc
      setTimeout(() => { try { s.stop() } catch { /* already stopped */ } }, 900)
      ambSrc = null
      ambGain = null
    }
    return
  }
  if (!ambSrc) {
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    ambSrc = ctx.createBufferSource()
    ambSrc.buffer = buf
    ambSrc.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 550
    ambGain = ctx.createGain()
    ambGain.gain.value = 0.0001
    ambSrc.connect(f)
    f.connect(ambGain)
    ambGain.connect(master)
    ambSrc.start()
  }
  ambGain!.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.8)
}

// Tribal war drums: synthesized 6/8 stomp, gain driven by distance to the
// angry tribe and panned toward them. Deliberately very low in the mix.
const DRUM_PATTERN = [1, 0, 0, 0.65, 0, 0, 1, 0, 0.55, 0.8, 0, 0]
let drumGain: GainNode | null = null
let drumPan: StereoPannerNode | null = null
let drumTimer: ReturnType<typeof setInterval> | null = null
let drumStep = 0
let drumLevel = 0

function drumHit(accent: number) {
  if (!ctx || !drumPan) return
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(accent >= 1 ? 130 : 165, t)
  o.frequency.exponentialRampToValueAtTime(44, t + 0.16)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(accent, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
  o.connect(g)
  g.connect(drumPan)
  o.start(t)
  o.stop(t + 0.25)
}

export function setWarDrums(level: number, pan = 0) {
  if (!ctx || !master) return
  if (level <= 0.015) {
    if (drumLevel > 0 && drumGain) {
      drumGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.2)
      drumLevel = 0
    }
    if (drumTimer !== null) {
      clearInterval(drumTimer)
      drumTimer = null
      drumStep = 0
    }
    return
  }
  if (!drumGain) {
    drumGain = ctx.createGain()
    drumGain.gain.value = 0.0001
    drumPan = ctx.createStereoPanner()
    drumPan.connect(drumGain)
    drumGain.connect(master)
  }
  if (drumTimer === null) {
    drumTimer = setInterval(() => {
      const a = DRUM_PATTERN[drumStep % DRUM_PATTERN.length]
      drumStep++
      if (a > 0 && Math.random() > 0.06) drumHit(a) // human hands miss sometimes
    }, 190)
  }
  if (Math.abs(level - drumLevel) > 0.02) {
    drumLevel = level
    drumGain.gain.linearRampToValueAtTime(level * 1.1, ctx.currentTime + 0.5)
  }
  drumPan!.pan.value = Math.max(-0.85, Math.min(0.85, pan))
}

// Optional meme: drop a scream at public/sfx/wilhelm.mp3 and it plays
// (very quietly) when the lander squashes someone. Missing file = silence.
let wilhelmEl: HTMLAudioElement | null = null
export function wilhelm() {
  if (!wilhelmEl) {
    wilhelmEl = new Audio('sfx/wilhelm.mp3')
    wilhelmEl.volume = 0.12
  }
  wilhelmEl.currentTime = 0
  wilhelmEl.play().catch(() => { /* no file, no scream */ })
}

export const sfx = {
  pew: () => tone('square', 900, 220, 0.12, 0.5),
  enemyPew: () => tone('square', 420, 120, 0.16, 0.45),
  turret: () => tone('sawtooth', 700, 260, 0.1, 0.4),
  spear: () => noise(0.08, 0.5, 2500),
  hurt: () => tone('sawtooth', 200, 60, 0.18, 0.6),
  boom: () => { noise(0.5, 1.0, 700); tone('sine', 120, 30, 0.5, 0.9) },
  bigBoom: () => { noise(0.9, 1.2, 500); tone('sine', 90, 24, 0.9, 1.1) },
  thud: () => { noise(0.12, 0.7, 500); tone('sine', 90, 40, 0.15, 0.6) },
  blip: () => tone('square', 660, 880, 0.06, 0.3),
  deny: () => tone('square', 220, 160, 0.12, 0.35),
  thrust: () => noise(0.09, 0.18, 900),
  build: () => { tone('square', 300, 600, 0.15, 0.4); noise(0.15, 0.3, 3000) },
  pickup: () => tone('square', 440, 700, 0.09, 0.35),
  drop: () => noise(0.1, 0.45, 800),
  launch: () => { noise(0.8, 0.8, 600); tone('sawtooth', 60, 180, 0.8, 0.5) },
  dock: () => { tone('sine', 300, 450, 0.3, 0.4); tone('sine', 450, 600, 0.3, 0.3) },
  alarm: () => { tone('square', 520, 520, 0.1, 0.4); setTimeout(() => tone('square', 390, 390, 0.12, 0.4), 120) },
  eat: () => noise(0.15, 0.3, 900),
  die: () => { tone('sawtooth', 300, 40, 0.5, 0.7); noise(0.4, 0.6, 900) },
  thunder: () => { noise(1.4, 0.5, 260); tone('sine', 60, 28, 1.6, 0.45) },
}
