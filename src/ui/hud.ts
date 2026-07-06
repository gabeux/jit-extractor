import { PAL } from '../palette'
import { text } from '../render'

/** Player HP as pips (10 x 10hp) — minimal, bottom-left. */
export function drawHpPips(ctx: CanvasRenderingContext2D, hp: number, maxHp: number) {
  const pips = 10
  const filled = Math.ceil((hp / maxHp) * pips)
  for (let i = 0; i < pips; i++) {
    ctx.fillStyle = i < filled ? (filled <= 3 ? PAL.danger : PAL.pale) : PAL.faint
    ctx.fillRect(14 + i * 10, 516, 7, 10)
  }
}

export function labeledBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number, label: string, color: string) {
  ctx.fillStyle = PAL.faint
  ctx.fillRect(x, y, w, 8)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, t)), 8)
  ctx.strokeStyle = PAL.dim
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 7)
  text(ctx, label, x, y - 4, { size: 10, color: PAL.pale, align: 'left' })
}

/** Floating "E — DO THING" prompt, screen space. */
export function promptAt(ctx: CanvasRenderingContext2D, sx: number, sy: number, s: string) {
  ctx.font = '11px "Courier New", monospace'
  const w = ctx.measureText(s).width + 10
  ctx.fillStyle = 'rgba(6,8,13,0.75)'
  ctx.fillRect(sx - w / 2, sy - 12, w, 16)
  text(ctx, s, sx, sy, { size: 11, color: PAL.accent })
}
