import type { Input } from './input'
import type { MusicPlayer } from './audio/music'
import { text } from './render'
import { PAL } from './palette'
import { Scoreboard } from './ui/scoreboard'
import { PatDialogue } from './ui/dialogue'
import { sendRunEnd } from './net/analytics'
import { generatePlanet, type Planet } from './planetname'
import { WarpStage } from './stages/warp'
import { World } from './world/world'
import { generateWorld } from './world/worldgen'
import { ShipStage } from './stages/ship'
import { FlightStage } from './stages/flight'
import { GroundStage } from './stages/ground'
import { DockingStage, GameOverStage } from './stages/docking'

export interface Stage {
  readonly name: string
  enter(): void
  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
}

// SHIP -> descent -> GROUND -> ascent -> DOCKING -> SHIP (new map each loop).
export class Game {
  world: World | null = null
  runsCompleted = 0
  /** woke up from the meteor-storm "dream" — the ship stage plays it up */
  dreamWake = false
  /** docking name-entry is capturing keys; TAB etc. must not react */
  typingName = false
  scoreboard = new Scoreboard()
  pat = new PatDialogue()
  planet: Planet = { system: '', name: '' }
  stage: Stage
  private seed = Math.floor(Math.random() * 0x7fffffff)
  private runStartMs = 0

  constructor(public input: Input, public music: MusicPlayer) {
    this.planet = generatePlanet(this.seed)
    this.stage = new ShipStage(this)
    this.stage.enter()
  }

  private setStage(s: Stage) {
    this.stage = s
    s.enter()
  }

  startDescent() {
    this.dreamWake = false // whatever it was, work resumes
    this.runStartMs = performance.now()
    this.world = generateWorld(this.seed)
    this.setStage(new FlightStage(this, 'descent'))
  }

  runTimeMs(): number {
    return Math.round(performance.now() - this.runStartMs)
  }

  /** Killed by the meteor storm: wake in orbit as if nothing happened. Did it? */
  wakeFromDream() {
    sendRunEnd('DREAM_RUN')
    this.runsCompleted++
    this.freshSeed()
    this.dreamWake = true
    this.setStage(new ShipStage(this))
  }

  gotoGround() { this.setStage(new GroundStage(this)) }
  gotoAscent() { this.setStage(new FlightStage(this, 'ascent')) }
  gotoDocking() { this.setStage(new DockingStage(this)) }

  completeRun() {
    this.runsCompleted++
    this.freshSeed()
    // new contract, new planet: jump there properly
    this.setStage(new WarpStage(this))
  }

  gotoShip() {
    this.setStage(new ShipStage(this))
  }

  terminate(reason: string) {
    sendRunEnd('TERMINATED')
    this.setStage(new GameOverStage(this, reason))
  }

  newRun() {
    this.freshSeed()
    this.setStage(new ShipStage(this))
  }

  private freshSeed() {
    this.seed = Math.floor(Math.random() * 0x7fffffff)
    this.planet = generatePlanet(this.seed)
    this.world = null
  }

  update(dt: number) {
    if (this.input.wasPressed('KeyM')) this.music.toggle()
    if (this.input.wasPressed('KeyN') && !this.typingName) this.music.next()
    // B doubles as BUILD while carrying a crate — music only when it's free
    const buildingContext = this.world !== null && !this.world.player.inLander && this.world.player.carrying !== null
    if (this.input.wasPressed('KeyB') && !this.typingName && !buildingContext) this.music.prev()
    if (this.music.creditT > 0) this.music.creditT -= dt
    // TAB leaderboard (pauses the sim while open)
    if (this.input.wasPressed('Tab') && !this.typingName && !this.pat.open) this.scoreboard.toggle()
    if (this.scoreboard.open) {
      this.scoreboard.update(this.input)
      return
    }
    // P.A.T. communicator also pauses the sim and owns input while open
    if (this.pat.open) {
      this.pat.update(dt, this.input)
      return
    }
    // kill cam runs on real time regardless of sim slow-mo
    if (this.world?.killCam) {
      this.world.killCam.t -= dt
      if (this.world.killCam.t <= 0) this.world.killCam = null
    }
    this.stage.update(dt)
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.stage.draw(ctx)
    this.drawMusicCredit(ctx)
    this.scoreboard.draw(ctx)
    this.pat.draw(ctx)
  }

  /** Cinematic "NOW PLAYING" fade, bottom-left, just above the HP pips. */
  private drawMusicCredit(ctx: CanvasRenderingContext2D) {
    const m = this.music
    if (m.creditT <= 0 || !m.creditTitle) return
    const a = Math.max(0, Math.min(1, (6.5 - m.creditT) / 0.7, m.creditT / 1.4))
    const slide = (1 - Math.min(1, (6.5 - m.creditT) / 0.7)) * -14
    text(ctx, 'NOW PLAYING', 16 + slide, 468, { size: 9, color: PAL.accent, align: 'left', alpha: a * 0.9 })
    ctx.save()
    ctx.globalAlpha = a * 0.6
    ctx.fillStyle = PAL.accent
    ctx.fillRect(16 + slide, 473, 74, 1)
    ctx.restore()
    text(ctx, `♪ ${m.creditTitle}`, 16 + slide, 490, { size: 13, color: PAL.pale, align: 'left', alpha: a })
  }
}
