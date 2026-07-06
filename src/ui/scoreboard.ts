import { PAL } from '../palette'
import { VIEW_W, VIEW_H, text, drawKeyHint } from '../render'
import type { Input } from '../input'
import { fetchBoard, type Board, type ScoreEntry } from '../net/leaderboard'
import { sfx } from '../audio/sfx'

const MEDALS = ['#e8c35a', '#c0c8d0', '#c08a5a'] // gold, silver, bronze
const TABS = ['profit', 'time', 'losses'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = { profit: 'PROFIT', time: 'TIME', losses: 'LOSSES' }
const TAB_HEADERS: Record<Tab, string> = {
  profit: 'MOST PROFITABLE EXTRACTORS',
  time: 'FASTEST QUOTA-MEETING EXTRACTORS',
  losses: 'MOST CATASTROPHIC EXTRACTORS',
}
const RAMBO_KEY = 'jit-show-rambos'

export function fmtTime(ms: number): string {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

/** "BR" -> 🇧🇷 (renders as letter-glyphs on Windows, real flags elsewhere). */
function flagEmoji(cc?: string): string {
  if (!cc || !/^[A-Z]{2}$/.test(cc) || cc === 'XX') return ''
  return String.fromCodePoint(0x1f1e6 + cc.charCodeAt(0) - 65, 0x1f1e6 + cc.charCodeAt(1) - 65)
}

// TAB overlay: PROFIT / TIME / LOSSES, plus the Show Rambos filter — hide the
// pirate-ship easter-egg runs to see who won legitimately.
export class Scoreboard {
  open = false
  private tab: Tab = 'profit'
  private board: Board | null = null
  private loading = false
  private showRambos = true
  private ramboBox = new DOMRect(0, 0, 0, 0)
  private tabBoxes: DOMRect[] = []

  constructor() {
    try { this.showRambos = localStorage.getItem(RAMBO_KEY) !== '0' } catch { /* default on */ }
  }

  toggle() {
    this.open = !this.open
    if (this.open) this.refresh()
    sfx.blip()
  }

  refresh() {
    this.loading = true
    void fetchBoard().then((b) => {
      this.board = b
      this.loading = false
    })
  }

  private toggleRambos() {
    this.showRambos = !this.showRambos
    try { localStorage.setItem(RAMBO_KEY, this.showRambos ? '1' : '0') } catch { /* ok */ }
    sfx.blip()
  }

  update(input: Input) {
    if (!this.open) return
    const dir =
      (input.wasPressed('KeyE') || input.wasPressed('ArrowRight') ? 1 : 0) -
      (input.wasPressed('KeyQ') || input.wasPressed('ArrowLeft') ? 1 : 0)
    if (dir !== 0) {
      this.tab = TABS[(TABS.indexOf(this.tab) + dir + TABS.length) % TABS.length]
      sfx.blip()
    }
    if (input.wasPressed('KeyR')) this.toggleRambos()
    if (input.mousePressed) {
      for (let i = 0; i < TABS.length; i++) {
        const b = this.tabBoxes[i]
        if (b && input.mouseX >= b.x && input.mouseX <= b.x + b.width &&
            input.mouseY >= b.y && input.mouseY <= b.y + b.height && TABS[i] !== this.tab) {
          this.tab = TABS[i]
          sfx.blip()
        }
      }
    }
    if (input.mousePressed &&
        input.mouseX >= this.ramboBox.x && input.mouseX <= this.ramboBox.x + this.ramboBox.width &&
        input.mouseY >= this.ramboBox.y && input.mouseY <= this.ramboBox.y + this.ramboBox.height) {
      this.toggleRambos()
    }
  }

  private rows(): ScoreEntry[] {
    if (!this.board) return []
    const all = this.board[this.tab]
    return this.showRambos ? all : all.filter((e) => e.ending !== 'STRANDED_ESCAPE')
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.open) return
    ctx.fillStyle = 'rgba(6,8,13,0.88)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    const px = 180, pw = VIEW_W - 360
    ctx.strokeStyle = PAL.dim
    ctx.lineWidth = 1.5
    ctx.strokeRect(px, 50, pw, 440)

    // tab headers
    for (let i = 0; i < TABS.length; i++) {
      const t = TABS[i]
      const x = VIEW_W / 2 + (i - 1) * 130
      const active = t === this.tab
      this.tabBoxes[i] = new DOMRect(x - 55, 66, 110, 30)
      text(ctx, TAB_LABELS[t], x, 82, { size: 14, color: active ? PAL.accent : PAL.dim })
      if (active) {
        ctx.fillStyle = PAL.accent
        ctx.fillRect(x - 30, 90, 60, 2)
      }
    }
    text(ctx, TAB_HEADERS[this.tab], VIEW_W / 2, 114, { size: 11, color: PAL.pale })

    const rows = this.rows()
    if (this.loading) {
      text(ctx, 'CONTACTING HQ…', VIEW_W / 2, 260, { size: 12, color: PAL.dim })
    } else if (rows.length === 0) {
      const empty = this.tab === 'losses' ? 'NO DISASTERS YET. DISAPPOINTING.' : 'NO RECORDS YET — GO MAKE MONEY'
      text(ctx, empty, VIEW_W / 2, 260, { size: 12, color: PAL.dim })
    } else {
      for (let i = 0; i < Math.min(rows.length, 12); i++) {
        const e = rows[i]
        const y = 148 + i * 25
        if (i < 3) {
          ctx.fillStyle = MEDALS[i]
          ctx.beginPath()
          ctx.arc(px + 34, y - 4, 7, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = PAL.bgSpace
          ctx.font = '9px "Courier New", monospace'
          ctx.textAlign = 'center'
          ctx.fillText(String(i + 1), px + 34, y - 1)
        } else {
          text(ctx, `${i + 1}.`, px + 34, y, { size: 11, color: PAL.dim })
        }
        const flag = flagEmoji(e.country)
        const label = `${flag ? flag + ' ' : ''}${e.name}`
        text(ctx, label, px + 60, y, { size: 13, color: i === 0 ? PAL.white : PAL.pale, align: 'left' })
        // pirate skull: this Extractor came home in a stolen ship
        if (e.ending === 'STRANDED_ESCAPE') {
          ctx.font = '13px "Courier New", monospace'
          const w = ctx.measureText(label).width
          text(ctx, '☠', px + 66 + w, y, { size: 13, color: PAL.pirate, align: 'left' })
        }
        const value =
          this.tab === 'time' ? fmtTime(e.timeMs) : `${e.profit < 0 ? '-' : ''}$${Math.abs(e.profit)}`
        const vColor =
          this.tab === 'time' ? PAL.accent :
          this.tab === 'losses' ? PAL.danger :
          e.profit >= 0 ? PAL.good : PAL.danger
        text(ctx, value, px + pw - 30, y, { size: 13, color: vColor, align: 'right' })
      }
    }

    // Show Rambos checkbox (bottom-left of the panel)
    const bx = px + 26, by = 446
    this.ramboBox = new DOMRect(bx - 4, by - 12, 150, 18)
    ctx.strokeStyle = PAL.pale
    ctx.lineWidth = 1.5
    ctx.strokeRect(bx, by - 9, 10, 10)
    if (this.showRambos) {
      ctx.fillStyle = PAL.accent
      ctx.fillRect(bx + 2, by - 7, 6, 6)
    }
    text(ctx, 'SHOW SURVIVORS ☠', bx + 18, by, { size: 10, color: PAL.pale, align: 'left' })

    if (this.board?.offline) {
      text(ctx, 'OFFLINE — LOCAL RECORDS ONLY', px + pw - 26, 446, { size: 9, color: PAL.warm, align: 'right' })
    }
    drawKeyHint(ctx, 'CLICK OR [Q]/[E] SWITCH TAB · [R] SURVIVORS · [TAB] CLOSE', VIEW_W / 2, 474, 10)
  }
}
