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
    if (this.lungeT > 0) this.lungeT -= dt
    this.retargetT -= dt
    if (this.retargetT <= 0) {
      // sticky targeting: a committed target doesn't flip-flop with every step
      const cur = this.target
      const keep = cur && !cur.dead && dist(this.x, this.y, cur.x, cur.y) < 460
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
      }
    } else if (this.vengeful) {
      // march toward the player's landing site
      const goal = !w.player.dead && !w.player.inLander ? w.player.x : w.lander.x
      this.vx = Math.abs(goal - this.x) > 120 ? Math.sign(goal - this.x) * 95 : 0
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

  private pickTarget(w: World): Entity | null {
    if (this.personalAggro && !this.personalAggro.dead &&
        dist(this.x, this.y, this.personalAggro.x, this.personalAggro.y) < 480) {
      return this.personalAggro
    }
    let best: Entity | null = null
    let bestD = 460
    const huntActive = w.time < w.nativeHuntUntil
    for (const e of w.entities) {
      if (e.dead || e === this) continue
      let hostile = false
      if (e.faction === 'player' && w.atWar('native', 'player') && (e instanceof Player ? !e.inLander : e instanceof Building)) hostile = true
      else if (e.faction === 'pirate' && w.atWar('native', 'pirate')) hostile = true
      else if (e instanceof Player && !e.inLander && Math.abs(e.x - this.campX) < 140) hostile = true // territorial
      else if (e instanceof Animal && e.kind === 'aggro' && dist(this.x, this.y, e.x, e.y) < 130) hostile = true
      else if (e instanceof Animal && huntActive && dist(this.x, this.y, e.x, e.y) < 600) hostile = true
      if (!hostile) continue
      const d = dist(this.x, this.cy, e.cx, e.cy)
      if (d < bestD) { bestD = d; best = e }
    }
    return best
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
