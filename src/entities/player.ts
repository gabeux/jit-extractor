import { Entity } from './entity'
import { Projectile, Grenade } from './projectile'
import { drawCrate, type CrateItem } from './buildings'
import type { World } from '../world/world'
import type { Input } from '../input'
import { PAL } from '../palette'
import { sfx } from '../audio/sfx'

const GRAV = 900

export class Player extends Entity {
  inLander = true // riding the lander (ship/flight stages)
  carrying: CrateItem | null = null
  stamina = 100
  facing = 1
  aimX = 0; aimY = 0
  private shootCd = 0
  private grenCd = 0
  gHold = 0 // seconds G has been held (>=0.25 = aiming an arc)
  private muzzleT = 0
  private walkPhase = 0

  constructor() {
    super()
    this.w = 10; this.h = 22
    this.hp = this.maxHp = 100
    this.faction = 'player'
  }

  get gAiming(): boolean { return this.gHold >= 0.25 }
  get gunX(): number { return this.x }
  get gunY(): number { return this.y - 14 }

  update(w: World, dt: number) {
    if (this.inLander) {
      this.x = w.lander.x
      this.y = w.lander.y
      return
    }
    this.stepPhysics(w, dt, GRAV)
    if (Math.abs(this.vx) > 5 && this.grounded) this.walkPhase += dt * 11
    this.shootCd -= dt
    this.grenCd -= dt
    this.muzzleT -= dt
  }

  /** Called by the ground stage before world.update. aim* are world coords. */
  control(w: World, dt: number, input: Input, aimX: number, aimY: number, allowShoot = true) {
    this.aimX = aimX; this.aimY = aimY
    // shift to sprint while stamina holds out
    const moving = input.axisX() !== 0
    const sprinting = moving && this.stamina > 0 && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'))
    if (sprinting) this.stamina = Math.max(0, this.stamina - 28 * dt)
    else this.stamina = Math.min(100, this.stamina + 16 * dt)
    const speed = 210 * (this.carrying ? 0.8 : 1) * (sprinting ? 1.5 : 1)
    this.vx = input.axisX() * speed
    if ((input.wasPressed('Space') || input.wasPressed('KeyW') || input.wasPressed('ArrowUp')) && this.grounded) {
      this.vy = -420
    }
    this.facing = aimX >= this.x ? 1 : -1

    if (!this.carrying) {
      // pew pew toward the mouse (hold to autofire)
      if (allowShoot && input.mouseDown && !this.gAiming && this.shootCd <= 0) {
        const dx = aimX - this.gunX, dy = aimY - this.gunY
        const m = Math.hypot(dx, dy) || 1
        w.spawn(new Projectile(this.gunX + (dx / m) * 12, this.gunY + (dy / m) * 12, (dx / m) * 700, (dy / m) * 700, 'player', 12 * w.mods.dmgOut, PAL.accent, this))
        sfx.pew()
        this.shootCd = 0.16
        this.muzzleT = 0.05
      }
      // G tap = default lob toward aim; hold = cook + arc to cursor
      if (input.isDown('KeyG') && this.grenCd <= 0) this.gHold += dt
      if (input.wasReleased('KeyG') && this.gHold > 0 && this.grenCd <= 0) {
        const { vx, vy, fuse } = this.throwVelocity()
        const g = new Grenade(this.gunX, this.gunY, vx, vy, 'player', fuse, 52 * w.mods.dmgOut, 70, this)
        g.impact = this.gAiming // aimed throws detonate on contact
        w.spawn(g)
        sfx.drop()
        this.grenCd = 1.2
        this.gHold = 0
      }
    } else {
      this.gHold = 0
    }
  }

  /** Grenade throw solved to land near the cursor when aiming, or a default lob. */
  throwVelocity(): { vx: number; vy: number; fuse: number } {
    if (!this.gAiming) {
      const dx = this.aimX - this.gunX
      const dir = dx >= 0 ? 1 : -1
      return { vx: dir * 260, vy: -260, fuse: 2.0 }
    }
    const T = 0.85
    let vx = (this.aimX - this.gunX) / T
    let vy = (this.aimY - this.gunY) / T - 0.5 * GRAV * T
    const m = Math.hypot(vx, vy)
    if (m > 560) { vx *= 560 / m; vy *= 560 / m }
    return { vx, vy, fuse: 2.0 } // aimed throws are impact grenades, fuse unused

  }

  /** Incoming damage scaled by world mods (tutorial sim bruises less). */
  damage(w: World, amt: number, src: Entity | null = null) {
    super.damage(w, amt * w.mods.dmgIn, src)
  }

  protected onDamaged(_w: World, _src: Entity | null) {
    sfx.hurt()
  }

  protected onDeath(w: World, _src: Entity | null) {
    w.burst(this.x, this.cy, 14, PAL.pale, 140)
    sfx.die()
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    if (this.inLander || this.dead) return
    const sx = this.x - camX, sy = this.y - camY
    const c = this.flashT > 0 ? PAL.white : PAL.pale
    // stubby rounded legs with walk swing (Astroneer-style suit)
    const spread = Math.abs(this.vx) > 5 && this.grounded ? Math.sin(this.walkPhase) * 4 : 2
    ctx.strokeStyle = c
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx - 1.5, sy - 8); ctx.lineTo(sx - 1.5 - spread, sy - 1)
    ctx.moveTo(sx + 1.5, sy - 8); ctx.lineTo(sx + 1.5 + spread, sy - 1)
    ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.lineWidth = 2
    // backpack behind the shoulders
    ctx.fillStyle = PAL.dim
    ctx.fillRect(sx - this.facing * 7.5 - 2.2, sy - 18, 4.5, 8)
    // rounded torso
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(sx - 4.5, sy - 8)
    ctx.lineTo(sx - 4.5, sy - 15)
    ctx.quadraticCurveTo(sx - 4.5, sy - 18.5, sx, sy - 18.5)
    ctx.quadraticCurveTo(sx + 4.5, sy - 18.5, sx + 4.5, sy - 15)
    ctx.lineTo(sx + 4.5, sy - 8)
    ctx.closePath()
    ctx.fill()
    // big dome helmet with a wide friendly visor
    ctx.beginPath()
    ctx.arc(sx, sy - 22.5, 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAL.accent
    ctx.beginPath()
    ctx.ellipse(sx + this.facing * 1.8, sy - 22.7, 3.2, 2.6, 0, 0, Math.PI * 2)
    ctx.fill()
    if (this.carrying) {
      drawCrate(ctx, sx, sy - 30)
    } else {
      // gun toward aim
      const a = Math.atan2(this.aimY - this.gunY, this.aimX - this.gunX)
      ctx.strokeStyle = c
      ctx.beginPath()
      ctx.moveTo(sx, sy - 14)
      ctx.lineTo(sx + Math.cos(a) * 11, sy - 14 + Math.sin(a) * 11)
      ctx.stroke()
      if (this.muzzleT > 0) {
        ctx.fillStyle = PAL.accent
        ctx.fillRect(sx + Math.cos(a) * 13 - 2, sy - 14 + Math.sin(a) * 13 - 2, 4, 4)
      }
    }
  }

  /** The original stick-figure model, kept around in case we want it back. */
  protected drawClassic(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    if (this.inLander || this.dead) return
    const sx = this.x - camX, sy = this.y - camY
    const c = this.flashT > 0 ? PAL.white : PAL.pale
    ctx.strokeStyle = c
    ctx.fillStyle = c
    ctx.lineWidth = 2
    const spread = Math.abs(this.vx) > 5 && this.grounded ? Math.sin(this.walkPhase) * 4 : 2
    ctx.beginPath()
    ctx.moveTo(sx, sy - 9); ctx.lineTo(sx - spread, sy)
    ctx.moveTo(sx, sy - 9); ctx.lineTo(sx + spread, sy)
    ctx.stroke()
    ctx.fillRect(sx - 3.5, sy - 18, 7, 10)
    ctx.beginPath()
    ctx.arc(sx, sy - 21, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAL.accent
    ctx.fillRect(sx + this.facing * 1, sy - 22.5, this.facing * 3, 2)
  }
}
