import type { Game, Stage } from '../game'
import { PAL } from '../palette'
import { VIEW_W, VIEW_H, text } from '../render'
import { sfx } from '../audio/sfx'

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

// Between contracts: the ship jumps. Stars streak, screen breathes, new sky.
export class WarpStage implements Stage {
  readonly name = 'warp'
  private t = 0

  constructor(private game: Game) {}

  enter() {
    sfx.launch()
  }

  update(dt: number) {
    this.t += dt
    if (this.t > 2.7) this.game.gotoShip()
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PAL.bgSpace
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    // streaking starfield: speed ramps up, then collapses before arrival
    const ramp = this.t < 1.9 ? Math.min(1, this.t / 1.2) : Math.max(0, (2.7 - this.t) / 0.8)
    const speed = 40 + ramp * 2200
    for (let i = 0; i < 90; i++) {
      const y = hash(i) * VIEW_H
      const x = ((hash(i + 500) * 3000 - this.t * speed * (0.4 + hash(i + 300) * 0.6)) % VIEW_W + VIEW_W) % VIEW_W
      const len = 2 + ramp * (30 + hash(i + 700) * 90)
      ctx.strokeStyle = PAL.pale
      ctx.globalAlpha = 0.25 + hash(i + 900) * 0.6
      ctx.lineWidth = hash(i + 100) < 0.15 ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // the ship, riding it out
    const sx = VIEW_W / 2 + Math.sin(this.t * 7) * ramp * 2
    const sy = VIEW_H / 2 + Math.sin(this.t * 5) * ramp * 2
    ctx.fillStyle = PAL.bgSky
    ctx.strokeStyle = PAL.pale
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx - 90, sy + 14)
    ctx.quadraticCurveTo(sx - 120, sy - 4, sx - 76, sy - 16)
    ctx.lineTo(sx + 64, sy - 16)
    ctx.lineTo(sx + 84, sy - 4)
    ctx.lineTo(sx + 84, sy + 14)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // drive plume
    ctx.fillStyle = PAL.accent
    ctx.globalAlpha = 0.4 + ramp * 0.5
    ctx.beginPath()
    ctx.moveTo(sx + 84, sy - 4)
    ctx.lineTo(sx + 84, sy + 12)
    ctx.lineTo(sx + 100 + ramp * (60 + Math.random() * 30), sy + 4)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    text(ctx, `JUMPING TO ${this.game.planet.system} SYSTEM…`, VIEW_W / 2, 430, {
      size: 12, color: PAL.accent, alpha: Math.min(1, this.t * 2),
    })

    // fade from the docking screen, flash white into arrival
    if (this.t < 0.35) {
      ctx.fillStyle = PAL.bgSpace
      ctx.globalAlpha = 1 - this.t / 0.35
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    } else if (this.t > 2.45) {
      ctx.fillStyle = PAL.white
      ctx.globalAlpha = Math.min(0.9, (this.t - 2.45) / 0.25)
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    }
    ctx.globalAlpha = 1
  }
}
