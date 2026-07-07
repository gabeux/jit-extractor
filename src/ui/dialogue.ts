import { PAL } from '../palette'
import { drawKeyHint, text } from '../render'
import { sfx } from '../audio/sfx'
import type { Input } from '../input'

// P.A.T. communicator: portrait console (CRT-treated) + dialogue console +
// choices console. Opens anywhere on screen, pauses the sim while open
// (Game early-returns like it does for the scoreboard).

export interface DialogueChoice {
  label: string
  /** Next node to show; omit to close the channel after onPick. */
  next?: DialogueNode
  onPick?: () => void
}

export interface DialogueNode {
  text: string
  choices: DialogueChoice[]
}

const PANEL_W = 560
const PORTRAIT = 92
const HEADER_H = 20
const PAD = 12
const TEXT_SIZE = 11
const LINE_H = 15
const CHOICE_H = 18
const CHARS_PER_SEC = 55

export class PatDialogue {
  open = false
  private node: DialogueNode | null = null
  private x = 0
  private y = 0
  private time = 0
  private openT = 0
  private shownChars = 0
  private sel = 0
  private lines: string[] = []
  private choiceBoxes: DOMRect[] = []
  private portrait: HTMLImageElement | null = null
  private off = document.createElement('canvas')

  constructor() {
    // Drop a portrait at public/pat/portrait.png to override the code-drawn face.
    const im = new Image()
    im.onload = () => { this.portrait = im }
    im.src = '/pat/portrait.png'
    this.off.width = PORTRAIT
    this.off.height = PORTRAIT
  }

  /** Open the communicator. pos = top-left corner; defaults to bottom-center. */
  show(node: DialogueNode, pos?: { x?: number; y?: number }) {
    this.node = node
    this.open = true
    this.openT = 0
    this.shownChars = 0
    this.sel = 0
    this.lines = []
    this.choiceBoxes = []
    const h = this.panelH(node)
    this.x = pos?.x ?? (960 - PANEL_W) / 2
    this.y = pos?.y ?? 540 - h - 26
    sfx.dock()
  }

  close() {
    this.open = false
    this.node = null
    sfx.blip()
  }

  private panelH(node: DialogueNode): number {
    // dialogue console height is estimated at ~63 chars/line (measured in draw)
    const estLines = Math.max(2, Math.ceil(node.text.length / 60))
    const dlgH = estLines * LINE_H + PAD
    const chH = node.choices.length * CHOICE_H + PAD
    const right = dlgH + 6 + chH
    const left = PORTRAIT + 24 // portrait + name row
    return HEADER_H + PAD + Math.max(right, left) + PAD + 12
  }

  private textDone(): boolean {
    return this.node !== null && this.shownChars >= this.node.text.length
  }

  private pick(i: number) {
    const c = this.node?.choices[i]
    if (!c) return
    sfx.blip()
    c.onPick?.()
    if (c.next) this.show(c.next, { x: this.x, y: this.y })
    else this.close()
  }

  update(dt: number, input: Input) {
    if (!this.open || !this.node) return
    this.time += dt
    this.openT = Math.min(1, this.openT + dt / 0.18)

    const confirm = input.wasPressed('Enter') || input.wasPressed('Space') || input.wasPressed('KeyE')
    if (!this.textDone()) {
      this.shownChars += dt * CHARS_PER_SEC
      // impatient click/key reveals the whole line
      if (confirm || input.mousePressed) this.shownChars = this.node.text.length
      return
    }

    const n = this.node.choices.length
    if (input.wasPressed('KeyS') || input.wasPressed('ArrowDown')) { this.sel = (this.sel + 1) % n; sfx.blip() }
    if (input.wasPressed('KeyW') || input.wasPressed('ArrowUp')) { this.sel = (this.sel + n - 1) % n; sfx.blip() }
    for (let i = 0; i < Math.min(n, 9); i++) {
      if (input.wasPressed(`Digit${i + 1}`)) { this.pick(i); return }
    }
    for (let i = 0; i < this.choiceBoxes.length; i++) {
      const b = this.choiceBoxes[i]
      if (input.mouseX >= b.x && input.mouseX <= b.x + b.width &&
          input.mouseY >= b.y && input.mouseY <= b.y + b.height) {
        if (this.sel !== i) this.sel = i
        if (input.mousePressed) { this.pick(i); return }
      }
    }
    if (confirm) { this.pick(this.sel); return }
    if (input.wasPressed('Escape')) this.close()
  }

  private wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
    ctx.font = `${TEXT_SIZE}px "Courier New", monospace`
    const out: string[] = []
    let line = ''
    for (const word of s.split(' ')) {
      const probe = line ? `${line} ${word}` : word
      if (ctx.measureText(probe).width > maxW && line) {
        out.push(line)
        line = word
      } else line = probe
    }
    if (line) out.push(line)
    return out
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.open || !this.node) return
    const h = this.panelH(this.node)
    const x = this.x
    const y = this.y + (1 - this.openT) * 12
    ctx.save()
    ctx.globalAlpha = this.openT

    // panel + header
    ctx.fillStyle = 'rgba(6,8,13,0.94)'
    ctx.fillRect(x, y, PANEL_W, h)
    ctx.strokeStyle = PAL.accent
    ctx.globalAlpha = this.openT * 0.55
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, PANEL_W, h)
    ctx.globalAlpha = this.openT
    ctx.fillStyle = 'rgba(83,216,232,0.09)'
    ctx.fillRect(x + 1, y + 1, PANEL_W - 2, HEADER_H)
    const carrier = Math.sin(this.time * 8) > -0.6 ? '▮' : ' '
    text(ctx, `${carrier} INCOMING TRANSMISSION`, x + 10, y + 14, { size: 9, color: PAL.accent, align: 'left' })
    text(ctx, 'SHIPNET // CHANNEL 7', x + PANEL_W - 10, y + 14, { size: 9, color: PAL.dim, align: 'right' })

    // portrait console
    const px = x + PAD, py = y + HEADER_H + PAD
    this.drawPortrait(ctx, px, py)
    text(ctx, 'P.A.T.', px + PORTRAIT / 2, py + PORTRAIT + 15, { size: 12, color: PAL.accent })

    // dialogue console
    const dx = px + PORTRAIT + PAD, dw = x + PANEL_W - PAD - dx
    if (this.lines.length === 0) this.lines = this.wrap(ctx, this.node.text, dw - 16)
    const dlgH = Math.max(2, this.lines.length) * LINE_H + PAD
    ctx.strokeStyle = PAL.dim
    ctx.lineWidth = 1
    ctx.strokeRect(dx, py, dw, dlgH)
    let budget = Math.floor(this.shownChars)
    for (let i = 0; i < this.lines.length && budget > 0; i++) {
      const chunk = this.lines[i].slice(0, budget)
      budget -= this.lines[i].length + 1
      const cursor = !this.textDone() && budget <= 0 && Math.sin(this.time * 14) > 0 ? '▌' : ''
      text(ctx, chunk + cursor, dx + 8, py + 14 + i * LINE_H, { size: TEXT_SIZE, color: PAL.pale, align: 'left' })
    }

    // choices console
    const cy = py + dlgH + 6
    const chH = this.node.choices.length * CHOICE_H + PAD
    ctx.strokeStyle = PAL.dim
    ctx.strokeRect(dx, cy, dw, chH)
    this.choiceBoxes = []
    if (this.textDone()) {
      for (let i = 0; i < this.node.choices.length; i++) {
        const ly = cy + 8 + i * CHOICE_H
        this.choiceBoxes[i] = new DOMRect(dx + 2, ly, dw - 4, CHOICE_H)
        const active = i === this.sel
        if (active) {
          ctx.fillStyle = 'rgba(83,216,232,0.10)'
          ctx.fillRect(dx + 2, ly, dw - 4, CHOICE_H)
        }
        const col = active ? PAL.accent : PAL.pale
        text(ctx, `${active ? '>' : ' '} ${i + 1}. ${this.node.choices[i].label}`, dx + 8, ly + 13, { size: TEXT_SIZE, color: col, align: 'left' })
      }
      drawKeyHint(ctx, `[1-${this.node.choices.length}] OR [E] RESPOND`, x + PANEL_W - 78, y + h - 7, 8)
    } else {
      text(ctx, '· · ·', dx + dw / 2, cy + chH / 2 + 4, { size: TEXT_SIZE, color: PAL.faint })
    }
    ctx.restore()
  }

  /** Portrait rendered offscreen, then blitted with glitch slices, scanlines and vignette. */
  private drawPortrait(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const o = this.off.getContext('2d')!
    const S = PORTRAIT
    o.clearRect(0, 0, S, S)
    if (this.portrait) {
      o.drawImage(this.portrait, 0, 0, S, S)
    } else {
      this.drawFallbackFace(o, S)
    }

    // occasional horizontal glitch slice
    if (Math.random() < 0.12) {
      const gy = Math.floor(Math.random() * (S - 6))
      const gh = 2 + Math.floor(Math.random() * 4)
      const dxoff = (Math.random() - 0.5) * 8
      const slice = o.getImageData(0, gy, S, gh)
      o.putImageData(slice, dxoff, gy)
    }
    ctx.drawImage(this.off, x, y)

    ctx.save()
    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    for (let sy = 0; sy < S; sy += 3) ctx.fillRect(x, y + sy, S, 1)
    // cyan phosphor tint + vignette
    ctx.fillStyle = 'rgba(83,216,232,0.05)'
    ctx.fillRect(x, y, S, S)
    const v = ctx.createRadialGradient(x + S / 2, y + S / 2, S * 0.3, x + S / 2, y + S / 2, S * 0.75)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = v
    ctx.fillRect(x, y, S, S)
    ctx.strokeStyle = PAL.accent
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, S, S)
    ctx.restore()
  }

  /** Code-drawn P.A.T.: a chipper little screen-face AI. Talks while text types. */
  private drawFallbackFace(o: CanvasRenderingContext2D, S: number) {
    const g = o.createLinearGradient(0, 0, 0, S)
    g.addColorStop(0, '#0a1119')
    g.addColorStop(1, '#06080d')
    o.fillStyle = g
    o.fillRect(0, 0, S, S)
    // faint console grid behind him
    o.strokeStyle = 'rgba(83,216,232,0.07)'
    o.lineWidth = 1
    for (let i = 1; i < 6; i++) {
      o.beginPath(); o.moveTo((S / 6) * i, 0); o.lineTo((S / 6) * i, S); o.stroke()
      o.beginPath(); o.moveTo(0, (S / 6) * i); o.lineTo(S, (S / 6) * i); o.stroke()
    }
    const cx = S / 2
    const bob = Math.sin(this.time * 1.8) * 1.5
    const cy = S / 2 + 4 + bob
    // antenna, blinking tip
    o.strokeStyle = PAL.dim
    o.lineWidth = 2
    o.beginPath(); o.moveTo(cx, cy - 26); o.lineTo(cx, cy - 34); o.stroke()
    o.fillStyle = Math.sin(this.time * 5) > 0 ? PAL.accent : PAL.dim
    o.fillRect(cx - 2, cy - 38, 4, 4)
    // head: rounded screen
    o.fillStyle = '#0d1620'
    o.strokeStyle = PAL.pale
    o.lineWidth = 2
    const hw = 27, hh = 22, r = 7
    o.beginPath()
    o.moveTo(cx - hw + r, cy - hh)
    o.arcTo(cx + hw, cy - hh, cx + hw, cy + hh, r)
    o.arcTo(cx + hw, cy + hh, cx - hw, cy + hh, r)
    o.arcTo(cx - hw, cy + hh, cx - hw, cy - hh, r)
    o.arcTo(cx - hw, cy - hh, cx + hw, cy - hh, r)
    o.closePath()
    o.fill()
    o.stroke()
    // eyes: cyan, blink every few seconds
    const blink = (this.time % 3.7) > 3.55 ? 0.15 : 1
    o.fillStyle = PAL.accent
    o.save()
    o.shadowColor = PAL.accent
    o.shadowBlur = 6
    o.beginPath(); o.ellipse(cx - 11, cy - 5, 4, 4.5 * blink, 0, 0, Math.PI * 2); o.fill()
    o.beginPath(); o.ellipse(cx + 11, cy - 5, 4, 4.5 * blink, 0, 0, Math.PI * 2); o.fill()
    // mouth: waveform that jitters while he talks
    const talking = !this.textDone()
    o.strokeStyle = PAL.accent
    o.lineWidth = 1.5
    o.beginPath()
    for (let i = 0; i <= 12; i++) {
      const mx = cx - 12 + i * 2
      const amp = talking ? Math.sin(i * 1.7 + this.time * 22) * (2 + Math.random() * 2.5) : Math.sin(i * 0.9) * 1
      const my = cy + 10 + amp
      if (i === 0) o.moveTo(mx, my)
      else o.lineTo(mx, my)
    }
    o.stroke()
    o.restore()
  }
}
