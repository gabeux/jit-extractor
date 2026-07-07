import { PAL } from '../palette'
import { VIEW_W, text } from '../render'
import { LANGS, LANG_LABELS, hasChosenLang, setLang, type Lang } from '../i18n'
import { sfx } from '../audio/sfx'
import type { Input } from '../input'

// One-time language select: four flags top-center, a countdown bar draining
// cyan -> red underneath (no numbers). Click a flag or press 1-4; when the
// bar empties, English wins. Never shown again once a choice is stored.

const FLAG_W = 64
const FLAG_H = 42
const GAP = 26
const TOTAL = 8 // seconds

export class LangPicker {
  active = !hasChosenLang()
  private t = TOTAL
  private time = 0
  private boxes: DOMRect[] = []

  update(dt: number, input: Input) {
    if (!this.active) return
    this.time += dt
    this.t -= dt
    if (this.t <= 0) { this.pick('en', false); return }
    for (let i = 0; i < LANGS.length; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) { this.pick(LANGS[i]); return }
    }
    if (input.mousePressed) {
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i]
        if (input.mouseX >= b.x && input.mouseX <= b.x + b.width &&
            input.mouseY >= b.y && input.mouseY <= b.y + b.height) {
          this.pick(LANGS[i])
          return
        }
      }
    }
  }

  private pick(l: Lang, blip = true) {
    setLang(l)
    this.active = false
    if (blip) sfx.blip()
  }

  draw(ctx: CanvasRenderingContext2D, input: Input) {
    if (!this.active) return
    const rowW = LANGS.length * FLAG_W + (LANGS.length - 1) * GAP
    const x0 = (VIEW_W - rowW) / 2
    const y = 64
    ctx.save()
    ctx.fillStyle = 'rgba(6,8,13,0.85)'
    ctx.fillRect(x0 - 30, y - 34, rowW + 60, FLAG_H + 96)
    ctx.strokeStyle = PAL.accent
    ctx.globalAlpha = 0.5
    ctx.strokeRect(x0 - 30, y - 34, rowW + 60, FLAG_H + 96)
    ctx.globalAlpha = 1

    this.boxes = []
    for (let i = 0; i < LANGS.length; i++) {
      const fx = x0 + i * (FLAG_W + GAP)
      this.boxes[i] = new DOMRect(fx - 6, y - 6, FLAG_W + 12, FLAG_H + 30)
      const hover = input.mouseX >= this.boxes[i].x && input.mouseX <= this.boxes[i].x + this.boxes[i].width &&
        input.mouseY >= this.boxes[i].y && input.mouseY <= this.boxes[i].y + this.boxes[i].height
      drawFlag(ctx, LANGS[i], fx, y, FLAG_W, FLAG_H)
      ctx.strokeStyle = hover ? PAL.white : PAL.dim
      ctx.lineWidth = hover ? 2 : 1
      ctx.strokeRect(fx, y, FLAG_W, FLAG_H)
      text(ctx, LANG_LABELS[LANGS[i]], fx + FLAG_W / 2, y + FLAG_H + 16, {
        size: 10, color: hover ? PAL.white : PAL.pale,
      })
    }

    // the silent countdown: cyan drains into red, then English it is
    const frac = Math.max(0, this.t / TOTAL)
    const bw = rowW
    const by = y + FLAG_H + 30
    const r = Math.round(0x53 + (0xff - 0x53) * (1 - frac))
    const g = Math.round(0xd8 * frac + 0x5a * (1 - frac))
    const b = Math.round(0xe8 * frac + 0x5a * (1 - frac))
    ctx.fillStyle = PAL.faint
    ctx.fillRect(x0, by, bw, 5)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(x0, by, bw * frac, 5)
    ctx.restore()
  }
}

/** Simplified code-drawn flags — recognizable at 64x42, zero assets. */
export function drawFlag(ctx: CanvasRenderingContext2D, lang: Lang, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  if (lang === 'en') {
    // US-style: stripes + canton
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#c43a3a' : '#e8e8e8'
      ctx.fillRect(x, y + (h / 7) * i, w, h / 7)
    }
    ctx.fillStyle = '#2a3f8f'
    ctx.fillRect(x, y, w * 0.42, h * 0.5)
    ctx.fillStyle = '#e8e8e8'
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) ctx.fillRect(x + 4 + c * 6, y + 4 + r * 6, 2, 2)
    }
  } else if (lang === 'pt') {
    // Brazil: green field, yellow diamond, blue circle
    ctx.fillStyle = '#2d9c46'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#e8c832'
    ctx.beginPath()
    ctx.moveTo(x + w / 2, y + 5)
    ctx.lineTo(x + w - 7, y + h / 2)
    ctx.lineTo(x + w / 2, y + h - 5)
    ctx.lineTo(x + 7, y + h / 2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#2a3f8f'
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h / 2, h * 0.2, 0, Math.PI * 2)
    ctx.fill()
  } else if (lang === 'es') {
    // Spain: red / wide yellow / red
    ctx.fillStyle = '#c43a3a'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#e8c832'
    ctx.fillRect(x, y + h * 0.25, w, h * 0.5)
  } else {
    // France: blue / white / red verticals
    ctx.fillStyle = '#2a3f8f'
    ctx.fillRect(x, y, w / 3, h)
    ctx.fillStyle = '#e8e8e8'
    ctx.fillRect(x + w / 3, y, w / 3, h)
    ctx.fillStyle = '#c43a3a'
    ctx.fillRect(x + (2 * w) / 3, y, w / 3, h)
  }
  ctx.restore()
}
