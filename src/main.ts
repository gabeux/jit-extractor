import { Input } from './input'
import { MusicPlayer } from './audio/music'
import { unlockAudio } from './audio/sfx'
import { Game } from './game'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

// Hi-DPI: back the canvas at device resolution, draw in 960x540 logical units.
function resize() {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))
}
window.addEventListener('resize', resize)
resize()

const input = new Input(canvas)
const music = new MusicPlayer()
input.onFirstGesture = () => {
  unlockAudio()
  music.start()
}

const game = new Game(input, music)
// debug/automation handle (harmless in a prototype)
;(window as unknown as { __game: Game }).__game = game

// Fixed 60Hz simulation, render every animation frame.
const STEP = 1 / 60
let last = performance.now()
let acc = 0

function frame(now: number) {
  acc += Math.min(0.1, (now - last) / 1000)
  last = now
  let consumedEvents = false
  while (acc >= STEP) {
    game.update(STEP)
    acc -= STEP
    // one-frame events (key presses, clicks) must only be seen by one tick
    if (!consumedEvents) { input.endFrame(); consumedEvents = true }
  }
  ctx.setTransform(canvas.width / 960, 0, 0, canvas.height / 540, 0, 0)
  game.draw(ctx)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
