import { PAL } from '../palette'
import { drawKeyHint, text } from '../render'
import { sfx } from '../audio/sfx'
import type { Input } from '../input'

// P.A.T. communicator: a compact tablet with a cute screen-face AI, a small
// dialogue console and (optionally) a choices console. Two modes:
//  - conversation (has choices): pauses the sim, owns input
//  - hint (no choices): sim keeps running, input untouched — used by the
//    tutorial, with an optional gold arrow pointing at the thing discussed.

export interface DialogueChoice {
  label: string
  /** Next node; a function makes loops possible (e.g. back to the main tree). */
  next?: DialogueNode | (() => DialogueNode)
  onPick?: () => void
}

export interface DialogueNode {
  text: string
  choices: DialogueChoice[]
}

const GOLD = '#e8c35a'
const TABLET_W = 58
const TABLET_H = 74
const PAD = 10
const TEXT_SIZE = 10
const LINE_H = 13
const CHOICE_H = 16
const CHARS_PER_SEC = 60

export class PatDialogue {
  open = false
  private node: DialogueNode | null = null
  private hintMode = false
  private explicitPos: { x?: number; y?: number } | null = null
  private pointer: [number, number] | null = null
  private px = -1 // smoothed panel position
  private py = -1
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
    this.off.width = 48
    this.off.height = 48
  }

  /** A conversation pauses the sim; a hint (no choices) does not. */
  get blocking(): boolean { return this.open && (this.node?.choices.length ?? 0) > 0 }

  /** Open a conversation. pos = explicit top-left; defaults to bottom-center. */
  show(node: DialogueNode, pos?: { x?: number; y?: number }) {
    this.node = node
    this.hintMode = false
    this.explicitPos = pos ?? null
    this.begin()
    sfx.dock()
  }

  /** Non-blocking tutorial hint. Keep texts short; ~4 lines fit. */
  hint(s: string) {
    this.node = { text: s, choices: [] }
    this.hintMode = true
    this.explicitPos = null
    this.begin()
    sfx.blip()
  }

  /** Where the gold arrow points (screen coords); null hides it. */
  setPointer(p: [number, number] | null) { this.pointer = p }

  close() {
    if (!this.open) return
    this.open = false
    this.node = null
    this.pointer = null
  }

  private begin() {
    this.open = true
    this.openT = 0
    this.shownChars = 0
    this.sel = 0
    this.lines = []
    this.choiceBoxes = []
    this.px = -1
  }

  private panelSize(): [number, number] {
    const w = this.hintMode ? 350 : 430
    const textLines = Math.max(2, this.lines.length || Math.ceil((this.node?.text.length ?? 0) / 48))
    const right = textLines * LINE_H + 8 + (this.node?.choices.length ?? 0) * CHOICE_H
    return [w, Math.max(TABLET_H, right) + PAD * 2]
  }

  private textDone(): boolean {
    return this.node !== null && this.shownChars >= this.node.text.length
  }

  private pick(i: number) {
    const c = this.node?.choices[i]
    if (!c) return
    sfx.blip()
    c.onPick?.()
    const next = typeof c.next === 'function' ? c.next() : c.next
    if (next) {
      this.node = next
      this.shownChars = 0
      this.sel = 0
      this.lines = []
      this.choiceBoxes = []
    } else this.close()
  }

  update(dt: number, input: Input) {
    if (!this.open || !this.node) return
    this.time += dt
    this.openT = Math.min(1, this.openT + dt / 0.15)
    if (!this.textDone()) this.shownChars += dt * CHARS_PER_SEC
    if (this.hintMode) return // hints never touch input

    const confirm = input.wasPressed('Enter') || input.wasPressed('Space') || input.wasPressed('KeyE')
    if (!this.textDone()) {
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
    if (confirm) this.pick(this.sel)
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

  /** Panel top-left: explicit > beside the pointer target > bottom-center. */
  private targetPos(w: number, h: number): [number, number] {
    if (this.explicitPos?.x !== undefined || this.explicitPos?.y !== undefined) {
      return [this.explicitPos.x ?? (960 - w) / 2, this.explicitPos.y ?? 540 - h - 26]
    }
    if (this.pointer) {
      const [tx, ty] = this.pointer
      const left = tx > 480 // box sits on the roomier side
      const x = left ? tx - w - 60 : tx + 60
      // below the target, so the box never covers what the arrow points at
      return [Math.max(8, Math.min(952 - w, x)), Math.max(28, Math.min(506 - h, ty + 24))]
    }
    return [(960 - w) / 2, 540 - h - 26]
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.open || !this.node) return
    // measure text first so panel height is exact
    const textW = (this.hintMode ? 350 : 430) - TABLET_W - PAD * 3
    if (this.lines.length === 0) this.lines = this.wrap(ctx, this.node.text, textW)
    const [w, h] = this.panelSize()
    const [tx, ty] = this.targetPos(w, h)
    if (this.px < 0) { this.px = tx; this.py = ty }
    this.px += (tx - this.px) * 0.18
    this.py += (ty - this.py) * 0.18
    const x = this.px
    const y = this.py + (1 - this.openT) * 8

    ctx.save()
    ctx.globalAlpha = this.openT
    ctx.fillStyle = 'rgba(6,8,13,0.92)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = PAL.accent
    ctx.globalAlpha = this.openT * 0.5
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, w, h)
    ctx.globalAlpha = this.openT

    this.drawTablet(ctx, x + PAD, y + (h - TABLET_H) / 2)

    // dialogue text (typewriter)
    const dx = x + PAD * 2 + TABLET_W
    let budget = Math.floor(this.shownChars)
    for (let i = 0; i < this.lines.length && budget > 0; i++) {
      const chunk = this.lines[i].slice(0, budget)
      budget -= this.lines[i].length + 1
      const cursor = !this.textDone() && budget <= 0 && Math.sin(this.time * 14) > 0 ? '▌' : ''
      text(ctx, chunk + cursor, dx, y + PAD + 9 + i * LINE_H, { size: TEXT_SIZE, color: PAL.pale, align: 'left' })
    }

    // choices
    this.choiceBoxes = []
    if (!this.hintMode && this.textDone()) {
      const cy = y + PAD + this.lines.length * LINE_H + 8
      for (let i = 0; i < this.node.choices.length; i++) {
        const ly = cy + i * CHOICE_H
        this.choiceBoxes[i] = new DOMRect(dx - 4, ly - 4, w - (dx - x) - PAD + 4, CHOICE_H)
        const active = i === this.sel
        if (active) {
          ctx.fillStyle = 'rgba(83,216,232,0.10)'
          ctx.fillRect(dx - 4, ly - 4, w - (dx - x) - PAD + 4, CHOICE_H)
        }
        text(ctx, `${active ? '>' : ' '} ${i + 1}. ${this.node.choices[i].label}`, dx, ly + 8,
          { size: TEXT_SIZE, color: active ? PAL.accent : PAL.pale, align: 'left' })
      }
      drawKeyHint(ctx, `[1-${this.node.choices.length}]/[E]`, x + w - 34, y + h - 6, 8)
    }
    ctx.restore()

    this.drawArrow(ctx)
  }

  /** Blinking gold arrow bouncing toward the pointer target. */
  private drawArrow(ctx: CanvasRenderingContext2D) {
    if (!this.pointer) return
    const [tx, ty] = this.pointer
    // arrow flies in from the panel side, bobbing along its own axis
    const fromX = this.px + (tx > this.px ? 0 : 1) * 0 + (tx > this.px + 175 ? 350 : 0)
    const ang = Math.atan2(ty - (this.py + 40), tx - fromX)
    const bob = 6 + Math.sin(this.time * 7) * 5
    const bx = tx - Math.cos(ang) * (22 + bob)
    const by = ty - Math.sin(ang) * (22 + bob)
    ctx.save()
    ctx.globalAlpha = 0.65 + Math.sin(this.time * 7) * 0.35
    ctx.fillStyle = GOLD
    ctx.translate(bx, by)
    ctx.rotate(ang)
    ctx.beginPath()
    ctx.moveTo(10, 0)
    ctx.lineTo(-6, -7)
    ctx.lineTo(-2, 0)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  /** Small tablet: bezel, camera dot, CRT screen with the face, name plate. */
  private drawTablet(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.fillStyle = '#10161f'
    ctx.strokeStyle = PAL.dim
    ctx.lineWidth = 1.5
    roundRect(ctx, x, y, TABLET_W, TABLET_H, 5)
    ctx.fill()
    ctx.stroke()
    // camera dot
    ctx.fillStyle = PAL.faint
    ctx.beginPath()
    ctx.arc(x + TABLET_W / 2, y + 4.5, 1.5, 0, Math.PI * 2)
    ctx.fill()

    // screen
    const sx = x + 5, sy = y + 9, S = 48
    const o = this.off.getContext('2d')!
    o.clearRect(0, 0, S, S)
    if (this.portrait) o.drawImage(this.portrait, 0, 0, S, S)
    else this.drawFace(o, S)
    // occasional glitch slice
    if (Math.random() < 0.09) {
      const gy = Math.floor(Math.random() * (S - 4))
      const gh = 2 + Math.floor(Math.random() * 3)
      o.putImageData(o.getImageData(0, gy, S, gh), (Math.random() - 0.5) * 6, gy)
    }
    ctx.drawImage(this.off, sx, sy)
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    for (let i = 0; i < S; i += 3) ctx.fillRect(sx, sy + i, S, 1)
    ctx.fillStyle = 'rgba(83,216,232,0.05)'
    ctx.fillRect(sx, sy, S, S)
    const v = ctx.createRadialGradient(sx + S / 2, sy + S / 2, S * 0.3, sx + S / 2, sy + S / 2, S * 0.72)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = v
    ctx.fillRect(sx, sy, S, S)
    ctx.strokeStyle = PAL.accent
    ctx.globalAlpha = 0.4
    ctx.lineWidth = 1
    ctx.strokeRect(sx, sy, S, S)
    ctx.restore()

    text(ctx, 'P.A.T.', x + TABLET_W / 2, y + TABLET_H - 5, { size: 8, color: PAL.accent })
  }

  /** Cute round screen-face: big eyes, tiny waveform mouth while talking. */
  private drawFace(o: CanvasRenderingContext2D, S: number) {
    const g = o.createLinearGradient(0, 0, 0, S)
    g.addColorStop(0, '#0a1119')
    g.addColorStop(1, '#06080d')
    o.fillStyle = g
    o.fillRect(0, 0, S, S)
    const cx = S / 2
    const cy = S / 2 + 2 + Math.sin(this.time * 2) * 1.2
    const tilt = Math.sin(this.time * 0.9) * 0.06
    o.save()
    o.translate(cx, cy)
    o.rotate(tilt)
    // round head, almost all screen
    o.fillStyle = '#0d1824'
    o.strokeStyle = PAL.pale
    o.lineWidth = 1.6
    o.beginPath()
    o.ellipse(0, 0, 16, 14.5, 0, 0, Math.PI * 2)
    o.fill()
    o.stroke()
    // big friendly eyes (blink every few seconds)
    const blink = (this.time % 3.4) > 3.28 ? 0.12 : 1
    o.fillStyle = PAL.accent
    o.shadowColor = PAL.accent
    o.shadowBlur = 5
    o.beginPath(); o.ellipse(-6, -2.5, 3.4, 4.4 * blink, 0, 0, Math.PI * 2); o.fill()
    o.beginPath(); o.ellipse(6, -2.5, 3.4, 4.4 * blink, 0, 0, Math.PI * 2); o.fill()
    // little waveform mouth: wiggles while talking, smiles at rest
    o.shadowBlur = 0
    o.strokeStyle = PAL.accent
    o.lineWidth = 1.4
    o.beginPath()
    const talking = !this.textDone()
    for (let i = 0; i <= 8; i++) {
      const mx = -7 + i * 1.75
      const my = talking
        ? 6.5 + Math.sin(i * 1.9 + this.time * 24) * (1 + Math.random() * 1.6)
        : 6 + Math.sin((i / 8) * Math.PI) * 2 // gentle smile
      if (i === 0) o.moveTo(mx, my)
      else o.lineTo(mx, my)
    }
    o.stroke()
    o.restore()
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
