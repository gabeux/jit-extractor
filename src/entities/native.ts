import { Entity, dist } from './entity'
import { Player } from './player'
import { Building } from './buildings'
import { Animal } from './animal'
import type { World } from '../world/world'
import { PAL } from '../palette'
import { sfx } from '../audio/sfx'

const LEASH = 520
const LUNGE_DUR = 0.38

export class Native extends Entity {
  campX: number
  /** vengeance-raid natives: no camp leash, march on the player's side */
  vengeful: boolean
  private wanderX: number
  private wanderT = 0
  private attackCd = 0
  private lungeT = 0
  private lungeDir = 1
  private standing = false // hysteresis: don't flap between walk/stop at the range edge
  private hopCd = 0
  private escorting = false
  private retargetT = Math.random() * 0.4
  target: Entity | null = null
  private personalAggro: Entity | null = null

  constructor(x: number, campX: number, vengeful = false) {
    super()
    this.x = x
    this.campX = campX
    this.vengeful = vengeful
    this.wanderX = x
    this.w = 11; this.h = 20
    this.hp = this.maxHp = 35
    this.faction = 'native'
  }

  update(w: World, dt: number) {
    this.stepPhysics(w, dt)
    this.attackCd -= dt
    this.hopCd -= dt
    if (this.lungeT > 0) this.lungeT -= dt
    this.retargetT -= dt
    if (this.retargetT <= 0) {
      // sticky targeting: a committed target doesn't flip-flop with every
      // step — but it must still QUALIFY (wars end, grudges expire)
      const cur = this.target
      const keep = cur && !cur.dead && dist(this.x, this.y, cur.x, cur.y) < 460 &&
        (cur === this.personalAggro || this.hostileTo(w, cur))
      this.target = keep ? cur : this.pickTarget(w)
      this.retargetT = keep ? 1.2 : 0.4
    }
    const t = this.target
    if (t && !t.dead && (this.vengeful || Math.abs(this.x - this.campX) < LEASH)) {
      const dx = t.x - this.x
      // walk in to spear range, then STAND until the gap really reopens —
      // the two thresholds stop the walk/stop shake at the range edge
      if (this.lungeT > 0) this.vx = 0 // feet planted mid-lunge
      else if (Math.abs(dx) > (this.standing ? 44 : 26)) {
        this.standing = false
        this.vx = Math.sign(dx) * 170
      } else {
        this.standing = true
        this.vx = 0
      }
      if (Math.abs(dx) < 34 && Math.abs(t.cy - this.cy) < 38 && this.attackCd <= 0) {
        t.damage(w, 10, this)
        this.attackCd = 1.0
        this.lungeT = LUNGE_DUR
        this.lungeDir = Math.sign(dx) || 1
        sfx.spear()
      } else if (this.grounded && this.hopCd <= 0 && Math.abs(dx) < 70 && this.cy - t.cy > 32) {
        // target perched above (ledge, steep incline): leap at them instead
        // of jittering underneath, forever out of spear reach
        this.vy = -340
        this.hopCd = 1.1
      }
    } else if (this.vengeful) {
      // march toward the player's landing site
      const goal = !w.player.dead && !w.player.inLander ? w.player.x : w.lander.x
      this.vx = Math.abs(goal - this.x) > 120 ? Math.sign(goal - this.x) * 95 : 0
    } else if (this.escort(w)) {
      // shadowing a trespasser: loom close, never swing first
    } else {
      // wander around camp
      this.wanderT -= dt
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 3
        this.wanderX = this.campX + (Math.random() * 360 - 180)
      }
      this.vx = Math.abs(this.wanderX - this.x) > 12 ? Math.sign(this.wanderX - this.x) * 80 : 0
    }
  }

  /** What justifies a spear. Trespassing alone doesn't — that gets an escort. */
  private hostileTo(w: World, e: Entity): boolean {
    if (e.faction === 'player' && w.atWar('native', 'player') &&
        (e instanceof Player ? !e.inLander : e instanceof Building)) return true
    if (e.faction === 'pirate' && w.atWar('native', 'pirate')) return true
    if (e instanceof Animal && e.kind === 'aggro' && dist(this.x, this.y, e.x, e.y) < 130) return true
    if (e instanceof Animal && w.time < w.nativeHuntUntil && dist(this.x, this.y, e.x, e.y) < 600) return true
    return false
  }

  private pickTarget(w: World): Entity | null {
    if (w.peaceful) return null // tutorial calm before the wave
    if (this.personalAggro && !this.personalAggro.dead &&
        dist(this.x, this.y, this.personalAggro.x, this.personalAggro.y) < 480) {
      return this.personalAggro
    }
    let best: Entity | null = null
    let bestD = 460
    for (const e of w.entities) {
      if (e.dead || e === this || !this.hostileTo(w, e)) continue
      const d = dist(this.x, this.cy, e.cx, e.cy)
      if (d < bestD) { bestD = d; best = e }
    }
    return best
  }

  /** Trespasser in camp territory: follow and loom until they leave. */
  private escort(w: World): boolean {
    const p = w.player
    if (w.peaceful || p.dead || p.inLander) { this.escorting = false; return false }
    // hysteresis on the territory edge so they don't dither at the border —
    // and they never pursue beyond it once the trespasser leaves
    if (Math.abs(p.x - this.campX) > (this.escorting ? 175 : 140)) {
      this.escorting = false
      return false
    }
    this.escorting = true
    const dx = p.x - this.x
    this.vx = Math.abs(dx) > 30 ? Math.sign(dx) * 120 : 0
    return true
  }

  protected onDamaged(w: World, src: Entity | null) {
    if (src && src.faction !== 'native') {
      this.personalAggro = src
      this.target = src // whoever just stabbed/shot us outranks stickiness
      this.retargetT = 1.2
      if (src.faction === 'player') w.declareWar('native', 'player')
      if (src.faction === 'pirate') w.declareWar('native', 'pirate')
    }
  }

  /** Attack motion: jab out fast, overshoot back past the start, settle. */
  private lungeOffset(): number {
    if (this.lungeT <= 0) return 0
    const p = 1 - this.lungeT / LUNGE_DUR
    if (p < 0.35) return (p / 0.35) * 12
    if (p < 0.7) return 12 - ((p - 0.35) / 0.35) * 17
    return -5 + ((p - 0.7) / 0.3) * 5
  }

  protected onDeath(w: World, src: Entity | null) {
    w.burst(this.x, this.cy, 10, PAL.native, 120)
    sfx.die()
    if (src && src.faction === 'player') w.onNativeKilled()
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    // attack lunge: dart toward the target, recoil back, settle
    const off = this.lungeOffset()
    const lunge = off * this.lungeDir
    const sx = this.x - camX + lunge, sy = this.y - camY
    const c = this.flashT > 0 ? PAL.white : PAL.native
    ctx.strokeStyle = c
    ctx.fillStyle = c
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx, sy - 8); ctx.lineTo(sx - 3, sy)
    ctx.moveTo(sx, sy - 8); ctx.lineTo(sx + 3, sy)
    ctx.stroke()
    ctx.fillRect(sx - 3.5, sy - 16, 7, 9)
    ctx.beginPath()
    ctx.arc(sx, sy - 19, 3.5, 0, Math.PI * 2)
    ctx.fill()
    // spear: carried diagonally, levels into a horizontal jab mid-lunge
    const dir = this.target && !this.target.dead ? Math.sign(this.target.x - this.x) || 1 : 1
    const jab = Math.max(0, off) / 12
    ctx.beginPath()
    ctx.moveTo(sx - dir * (5 - jab * 2), sy - 6 - jab * 5)
    ctx.lineTo(sx + dir * (9 + jab * 7), sy - 22 + jab * 9)
    ctx.stroke()
  }
}
