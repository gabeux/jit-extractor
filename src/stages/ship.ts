import type { Game, Stage } from '../game'
import { PAL } from '../palette'
import { VIEW_W, VIEW_H, drawStars, drawPlanetArc, text, drawKeyHint } from '../render'
import { promptAt } from '../ui/hud'
import { sfx } from '../audio/sfx'
import { patIntro, tutorialState, PAT_INTRO_KEY } from '../ui/patscript'

// Orbit view: your ship above the spinning planet. Walk to the console, hit E.
const FLOOR_Y = 330
const HULL_L = 270
const HULL_R = 700
const CONSOLE_X = 620
const HELP_X = 520 // P.A.T. terminal: retake the tutorial (offset so E never clashes)
const POD_X = 745

export class ShipStage implements Stage {
  readonly name = 'ship'
  private px = 340
  private facing = 1
  private walkPhase = 0
  private time = 0
  private launching = -1
  private introChecked = false

  constructor(private game: Game) {}

  enter() {}

  update(dt: number) {
    this.time += dt
    const input = this.game.input
    // P.A.T. hails until the tutorial is either taken or explicitly declined
    if (!this.introChecked && this.time > 1.4 && this.launching < 0 &&
        this.game.runsCompleted === 0 && !this.game.dreamWake && !this.game.tutorial) {
      this.introChecked = true
      if (tutorialState() === null) {
        let seen = false
        try { seen = localStorage.getItem(PAT_INTRO_KEY) === '1' } catch { /* private mode */ }
        try { localStorage.setItem(PAT_INTRO_KEY, '1') } catch { /* ok */ }
        this.game.pat.show(patIntro(this.game, seen))
      }
    }
    if (this.launching >= 0) {
      this.launching += dt
      if (this.launching > 1.1) this.game.startDescent()
      return
    }
    const ax = input.axisX()
    this.px += ax * 170 * dt
    if (ax !== 0) { this.facing = ax; this.walkPhase += dt * 10 }
    this.px = Math.max(HULL_L + 20, Math.min(HULL_R - 20, this.px))
    if (Math.abs(this.px - CONSOLE_X) < 34 && input.wasPressed('KeyE')) {
      this.launching = 0
      sfx.launch()
    }
    // P.A.T. terminal: bring the tutorial offer back up anytime
    if (Math.abs(this.px - HELP_X) < 30 && input.wasPressed('KeyE') && !this.game.tutorial) {
      let seen = true
      try { seen = localStorage.getItem(PAT_INTRO_KEY) === '1' } catch { /* default returning */ }
      this.game.pat.show(patIntro(this.game, seen))
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PAL.bgSpace
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    drawStars(ctx, this.time * 4, 0)
    // the planet below, edge-on, slowly turning
    drawPlanetArc(ctx, this.time, VIEW_W / 2, VIEW_H + 620, 760)

    this.drawShip(ctx)

    // player figure inside
    if (this.launching < 0) this.drawFigure(ctx, this.px, FLOOR_Y)

    if (this.launching < 0 && Math.abs(this.px - CONSOLE_X) < 34) {
      promptAt(ctx, CONSOLE_X, FLOOR_Y - 58, 'E — LAUNCH POD')
    }
    if (this.launching < 0 && Math.abs(this.px - HELP_X) < 30) {
      promptAt(ctx, HELP_X, FLOOR_Y - 58, 'E — P.A.T. TERMINAL')
    }

    // pod drops away on launch
    if (this.launching >= 0) {
      const t = this.launching
      this.drawPod(ctx, POD_X, FLOOR_Y + 26 + t * t * 500)
      text(ctx, 'POD AWAY', VIEW_W / 2, 120, { size: 14, color: PAL.accent, alpha: Math.min(1, t * 3) })
    } else {
      this.drawPod(ctx, POD_X, FLOOR_Y + 26)
    }

    text(ctx, `CONTRACT #${this.game.runsCompleted + 1}${this.game.dreamWake ? '?' : ''}`, VIEW_W / 2, 40, { size: 13, color: PAL.dim })
    text(ctx, 'IN ORBIT — LOW PLANET ORBIT', VIEW_W / 2, 58, { size: 10, color: PAL.faint })
    // cinematic planet card, bottom-right (music credit owns bottom-left)
    {
      const a = Math.max(0, Math.min(1, this.time / 1.2, (10 - this.time) / 1.6))
      if (a > 0) {
        const slide = (1 - Math.min(1, this.time / 1.2)) * 14
        const x = VIEW_W - 16 + slide
        text(ctx, 'NOW ORBITING', x, 438, { size: 9, color: PAL.accent, align: 'right', alpha: a * 0.9 })
        ctx.save()
        ctx.globalAlpha = a * 0.6
        ctx.fillStyle = PAL.accent
        ctx.fillRect(x - 74, 443, 74, 1)
        // system in bold, the body itself big beneath — stars and planets differ
        ctx.globalAlpha = a
        ctx.font = 'bold 11px "Courier New", monospace'
        ctx.fillStyle = PAL.pale
        ctx.textAlign = 'right'
        ctx.fillText(`${this.game.planet.system} SYSTEM`, x, 458)
        ctx.restore()
        text(ctx, this.game.planet.name, x, 478, { size: 17, color: PAL.white, align: 'right', alpha: a })
        text(ctx, 'Just in Time, Extractor.', x, 494, { size: 10, color: PAL.warm, align: 'right', alpha: a * 0.9 })
      }
    }
    // author credit: first orbit only, after the system name has had its moment
    if (this.game.runsCompleted === 0 && !this.game.dreamWake) {
      const a = Math.max(0, Math.min(1, (this.time - 2.1) / 1.2, (12.5 - this.time) / 1.8))
      if (a > 0) {
        text(ctx, 'MADE BY', 16, 398, { size: 9, color: PAL.accent, align: 'left', alpha: a * 0.9 })
        ctx.save()
        ctx.globalAlpha = a * 0.6
        ctx.fillStyle = PAL.accent
        ctx.fillRect(16, 403, 46, 1)
        ctx.restore()
        text(ctx, '@Gabeux.', 16, 422, { size: 14, color: PAL.pale, align: 'left', alpha: a })
      }
    }
    if (this.game.dreamWake) {
      // slow, uneasy fade in and out
      const a = Math.max(0, Math.min(1, this.time / 2.5, (9 - this.time) / 2.5))
      text(ctx, 'Was that just a dream?', VIEW_W / 2, 96, { size: 14, color: PAL.warm, alpha: a })
    }
    drawKeyHint(ctx, '[A/D] MOVE · [E] USE · [M] MUSIC · [N/B] TRACK · [TAB] SCOREBOARD', VIEW_W / 2, 524)
  }

  private drawShip(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PAL.bgSky
    ctx.strokeStyle = PAL.pale
    ctx.lineWidth = 2.5
    // hull with a rounded nose (left) and engine block (right)
    ctx.beginPath()
    ctx.moveTo(HULL_L - 60, FLOOR_Y + 18)
    ctx.quadraticCurveTo(HULL_L - 110, FLOOR_Y - 30, HULL_L - 40, FLOOR_Y - 66)
    ctx.lineTo(HULL_R + 30, FLOOR_Y - 66)
    ctx.lineTo(HULL_R + 70, FLOOR_Y - 40)
    ctx.lineTo(HULL_R + 70, FLOOR_Y + 18)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // engine glow
    ctx.fillStyle = PAL.accent
    ctx.globalAlpha = 0.5 + Math.sin(this.time * 3) * 0.2
    ctx.fillRect(HULL_R + 70, FLOOR_Y - 30, 8, 40)
    ctx.globalAlpha = 1
    // interior cutaway
    ctx.fillStyle = PAL.bgSpace
    ctx.fillRect(HULL_L, FLOOR_Y - 52, HULL_R - HULL_L, 52)
    ctx.strokeStyle = PAL.dim
    ctx.lineWidth = 2
    ctx.strokeRect(HULL_L, FLOOR_Y - 52, HULL_R - HULL_L, 52)
    // floor
    ctx.strokeStyle = PAL.pale
    ctx.beginPath()
    ctx.moveTo(HULL_L, FLOOR_Y)
    ctx.lineTo(HULL_R, FLOOR_Y)
    ctx.stroke()
    // little viewport windows in the hull
    ctx.fillStyle = PAL.faint
    for (let i = 0; i < 4; i++) ctx.fillRect(HULL_L + 40 + i * 90, FLOOR_Y - 46, 14, 8)
    // the console
    ctx.fillStyle = PAL.faint
    ctx.fillRect(CONSOLE_X - 10, FLOOR_Y - 26, 20, 26)
    ctx.fillStyle = Math.sin(this.time * 4) > 0 ? PAL.accent : PAL.dim
    ctx.fillRect(CONSOLE_X - 7, FLOOR_Y - 38, 14, 10)
    // P.A.T. terminal: same body, a gently pulsing ? on the screen
    ctx.fillStyle = PAL.faint
    ctx.fillRect(HELP_X - 10, FLOOR_Y - 26, 20, 26)
    ctx.fillStyle = '#0d1620'
    ctx.fillRect(HELP_X - 7, FLOOR_Y - 38, 14, 10)
    text(ctx, '?', HELP_X, FLOOR_Y - 30, {
      size: 9, color: PAL.accent, alpha: 0.6 + Math.sin(this.time * 2.2) * 0.4,
    })
    // pod bay clamp under the hull
    ctx.strokeStyle = PAL.dim
    ctx.beginPath()
    ctx.moveTo(POD_X - 14, FLOOR_Y + 18)
    ctx.lineTo(POD_X - 8, FLOOR_Y + 30)
    ctx.moveTo(POD_X + 14, FLOOR_Y + 18)
    ctx.lineTo(POD_X + 8, FLOOR_Y + 30)
    ctx.stroke()
  }

  private drawPod(ctx: CanvasRenderingContext2D, x: number, y: number) {
    // tutorial drop: the pod is a hologram — nothing real leaves the ship
    if (this.game.tutorial) {
      ctx.save()
      ctx.strokeStyle = PAL.accent
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.globalAlpha = 0.6 + Math.sin(this.time * 5) * 0.25
      ctx.beginPath()
      ctx.moveTo(x - 10, y + 14)
      ctx.lineTo(x - 10, y - 2)
      ctx.quadraticCurveTo(x, y - 14, x + 10, y - 2)
      ctx.lineTo(x + 10, y + 14)
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])
      text(ctx, 'SIM', x, y + 28, { size: 8, color: PAL.accent, alpha: 0.8 })
      ctx.restore()
      return
    }
    ctx.fillStyle = PAL.faint
    ctx.strokeStyle = PAL.pale
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 10, y + 14)
    ctx.lineTo(x - 10, y - 2)
    ctx.quadraticCurveTo(x, y - 14, x + 10, y - 2)
    ctx.lineTo(x + 10, y + 14)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    if (this.launching >= 0) {
      ctx.fillStyle = PAL.warm
      ctx.beginPath()
      ctx.moveTo(x - 5, y - 12)
      ctx.lineTo(x + 5, y - 12)
      ctx.lineTo(x, y - 24 - Math.random() * 8)
      ctx.closePath()
      ctx.fill()
    }
  }

  private drawFigure(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const spread = Math.abs(Math.sin(this.walkPhase)) * 4
    ctx.strokeStyle = PAL.pale
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - 1.5, y - 8); ctx.lineTo(x - 1.5 - spread, y - 1)
    ctx.moveTo(x + 1.5, y - 8); ctx.lineTo(x + 1.5 + spread, y - 1)
    ctx.stroke()
    ctx.lineCap = 'butt'
    // backpack + rounded suit + dome helmet, matching the field model
    ctx.fillStyle = PAL.dim
    ctx.fillRect(x - this.facing * 7.5 - 2.2, y - 18, 4.5, 8)
    ctx.fillStyle = PAL.pale
    ctx.beginPath()
    ctx.moveTo(x - 4.5, y - 8)
    ctx.lineTo(x - 4.5, y - 15)
    ctx.quadraticCurveTo(x - 4.5, y - 18.5, x, y - 18.5)
    ctx.quadraticCurveTo(x + 4.5, y - 18.5, x + 4.5, y - 15)
    ctx.lineTo(x + 4.5, y - 8)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y - 22.5, 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAL.accent
    ctx.beginPath()
    ctx.ellipse(x + this.facing * 1.8, y - 22.7, 3.2, 2.6, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}
