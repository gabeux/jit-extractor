import { Entity, dist } from './entity'
import { Player } from './player'
import type { World, GrassTuft } from '../world/world'
import { PAL } from '../palette'
import { sfx } from '../audio/sfx'

export type AnimalKind = 'passive' | 'aggro'

export class Animal extends Entity {
  kind: AnimalKind
  target: Entity | null = null
  /** attacked the player's side on its OWN initiative (not retaliation) —
   * killing it then is self-defence, no wildlife fine */
  huntingPlayerSide = false
  private wanderX: number
  private wanderT = 0
  private attackCd = 0
  private lungeT = 0
  private lungeDir = 1
  private proximityT = 2
  private fleeT = 0
  private fleeDir = 1
  private hungerT: number
  private eatT = 0
  private grazeTuft: GrassTuft | null = null
  private grazeT = 0

  constructor(x: number, kind: AnimalKind) {
    super()
    this.x = x
    this.kind = kind
    this.wanderX = x
    if (kind === 'passive') {
      this.w = 16; this.h = 10
      this.hp = this.maxHp = 20
      this.faction = 'passive'
      this.hungerT = 6 + Math.random() * 18
    } else {
      this.w = 18; this.h = 14
      this.hp = this.maxHp = 55
      this.faction = 'aggro'
      this.hungerT = 40 + Math.random() * 50 // randomized at start, per spec
    }
  }

  update(w: World, dt: number) {
    this.stepPhysics(w, dt)
    this.attackCd -= dt
    if (this.lungeT > 0) this.lungeT -= dt
    if (this.kind === 'passive') this.updatePassive(w, dt)
    else this.updateAggro(w, dt)
  }

  private wander(dt: number, speed: number) {
    this.wanderT -= dt
    if (this.wanderT <= 0) {
      this.wanderT = 2 + Math.random() * 4
      this.wanderX = this.x + (Math.random() * 400 - 200)
    }
    this.vx = Math.abs(this.wanderX - this.x) > 14 ? Math.sign(this.wanderX - this.x) * speed : 0
  }

  private updatePassive(w: World, dt: number) {
    if (this.fleeT > 0) {
      this.fleeT -= dt
      this.vx = this.fleeDir * 150
      return
    }
    this.hungerT -= dt
    if (this.grazeTuft) {
      if (this.grazeTuft.eaten) { this.grazeTuft = null; return }
      if (Math.abs(this.grazeTuft.x - this.x) > 10) {
        this.vx = Math.sign(this.grazeTuft.x - this.x) * 90
      } else {
        this.vx = 0
        this.grazeT += dt
        if (this.grazeT > 1.5) {
          this.grazeTuft.eaten = true
          this.grazeTuft.regrowT = 20 + Math.random() * 25
          this.grazeTuft = null
          this.hungerT = 10 + Math.random() * 20
          sfx.eat()
        }
      }
      return
    }
    if (this.hungerT <= 0) {
      // find grass
      let best: GrassTuft | null = null
      let bestD = 420
      for (const tuft of w.tufts) {
        if (tuft.eaten) continue
        const d = Math.abs(tuft.x - this.x)
        if (d < bestD) { bestD = d; best = tuft }
      }
      if (best) { this.grazeTuft = best; this.grazeT = 0 }
      else this.hungerT = 5
      return
    }
    this.wander(dt, 60)
  }

  private updateAggro(w: World, dt: number) {
    if (this.eatT > 0) {
      this.eatT -= dt
      this.vx = 0
      if (Math.random() < 0.1) w.burst(this.x, this.y - 4, 1, PAL.danger, 30)
      return
    }
    this.hungerT -= dt
    this.proximityT -= dt

    if (this.target && !this.target.dead) {
      // chase to bite range, then hold — don't burrow into the target
      const t = this.target
      const dx = t.x - this.x
      this.vx = Math.abs(dx) > 24 ? Math.sign(dx) * 170 : 0
      if (dist(this.x, this.cy, t.cx, t.cy) < 34 && this.attackCd <= 0) {
        t.damage(w, 12, this)
        this.attackCd = 0.9
        this.lungeT = 0.18
        this.lungeDir = Math.sign(dx) || 1
        this.vy = this.grounded ? -120 : this.vy // little pounce
        if (t.dead) {
          this.eatT = 3
          this.hungerT = 40 + Math.random() * 50
          this.target = null
        }
      }
      if (dist(this.x, this.y, t.x, t.y) > 800) this.target = null
      return
    }

    if (this.hungerT <= 0) {
      // hungry: hunt passive prey first, then any human
      this.target = this.findPrey(w)
      if (this.isPlayerSide(this.target)) this.huntingPlayerSide = true
      if (!this.target) this.hungerT = 4 // retry soon
      return
    }

    // chill, but always a chance to snap at whatever wanders close
    if (this.proximityT <= 0) {
      this.proximityT = 2
      const near = w.findNearestEntity(this.x, this.y, 90, (e) =>
        e !== this && !e.dead &&
        (e.faction === 'passive' || e.faction === 'pirate' || e.faction === 'native' ||
         (e instanceof Player && !e.inLander)))
      if (near && Math.random() < 0.22) {
        this.target = near
        if (this.isPlayerSide(near)) this.huntingPlayerSide = true
      }
    }
    this.wander(dt, 80)
  }

  private isPlayerSide(e: Entity | null): boolean {
    return e !== null && (e instanceof Player || e.faction === 'player')
  }

  private findPrey(w: World): Entity | null {
    const prey = w.findNearestEntity(this.x, this.y, 700, (e) => e !== this && !e.dead && e.faction === 'passive')
    if (prey) return prey
    return w.findNearestEntity(this.x, this.y, 700, (e) =>
      e !== this && !e.dead &&
      (e.faction === 'pirate' || e.faction === 'native' || (e instanceof Player && !e.inLander)))
  }

  protected onDamaged(_w: World, src: Entity | null) {
    if (!src) return
    if (this.kind === 'aggro') {
      this.target = src
    } else {
      this.fleeT = 3
      this.fleeDir = Math.sign(this.x - src.x) || 1
    }
  }

  protected onDeath(w: World, _src: Entity | null) {
    w.burst(this.x, this.cy, 8, this.kind === 'passive' ? PAL.animalPassive : PAL.animalAggro, 100)
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: World) {
    const lunge = this.lungeT > 0 ? Math.sin((1 - this.lungeT / 0.18) * Math.PI) * 7 * this.lungeDir : 0
    const sx = this.x - camX + lunge, sy = this.y - camY
    const c = this.flashT > 0 ? PAL.white : this.kind === 'passive' ? PAL.animalPassive : PAL.animalAggro
    ctx.fillStyle = c
    ctx.strokeStyle = c
    ctx.lineWidth = 2
    const step = Math.abs(this.vx) > 5 ? Math.sin(w.time * 14) * 2 : 0
    if (this.kind === 'passive') {
      // round grazer
      ctx.beginPath()
      ctx.ellipse(sx, sy - 6, 8, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(sx + (this.vx >= 0 ? 8 : -8), sy - 9, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(sx - 4, sy - 3); ctx.lineTo(sx - 4 - step, sy)
      ctx.moveTo(sx + 4, sy - 3); ctx.lineTo(sx + 4 + step, sy)
      ctx.stroke()
    } else {
      // spiky predator
      const dir = this.vx >= 0 ? 1 : -1
      ctx.beginPath()
      ctx.moveTo(sx - 9, sy - 2)
      ctx.lineTo(sx - 5, sy - 11)
      ctx.lineTo(sx - 1, sy - 6)
      ctx.lineTo(sx + 3, sy - 13)
      ctx.lineTo(sx + 7, sy - 6)
      ctx.lineTo(sx + 10, sy - 2)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(sx + dir * 10, sy - 6, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(sx - 5, sy - 2); ctx.lineTo(sx - 5 - step, sy)
      ctx.moveTo(sx + 5, sy - 2); ctx.lineTo(sx + 5 + step, sy)
      ctx.stroke()
      // eye glints red while hunting
      if (this.target) {
        ctx.fillStyle = PAL.danger
        ctx.fillRect(sx + dir * 10, sy - 7, 2, 2)
      }
    }
  }
}
