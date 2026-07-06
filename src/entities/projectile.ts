import { Entity, type Faction } from './entity'
import type { World } from '../world/world'
import { PAL } from '../palette'

// Lasers (player/turret) and slugs (pirates). No gravity, dies on hit.
export class Projectile extends Entity {
  life = 1.4
  dmg: number
  color: string
  len: number
  width: number
  shooter: Entity | null

  constructor(x: number, y: number, vx: number, vy: number, faction: Faction, dmg: number, color: string, shooter: Entity | null = null, len = 10, width = 2) {
    super()
    this.x = x; this.y = y; this.vx = vx; this.vy = vy
    this.faction = faction
    this.dmg = dmg
    this.color = color
    this.shooter = shooter
    this.len = len
    this.width = width
    this.h = 0
  }

  update(w: World, dt: number) {
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.life -= dt
    if (this.life <= 0 || this.x < 0 || this.x > w.terrain.width) { this.dead = true; return }
    if (this.y >= w.terrain.heightAt(this.x)) {
      w.burst(this.x, this.y, 4, this.color, 60)
      this.dead = true
      return
    }
    for (const e of w.entities) {
      if (e === this || e === this.shooter || e.dead) continue
      if (e instanceof Projectile || e.faction === this.faction) continue
      if (e.faction === 'neutral') continue
      if (e.containsPoint(this.x, this.y)) {
        e.damage(w, this.dmg, this.shooter ?? this)
        w.burst(this.x, this.y, 5, this.color, 90)
        this.dead = true
        return
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const m = Math.hypot(this.vx, this.vy) || 1
    const nx = this.vx / m, ny = this.vy / m
    ctx.strokeStyle = this.color
    ctx.lineWidth = this.width
    ctx.beginPath()
    ctx.moveTo(this.x - camX, this.y - camY)
    ctx.lineTo(this.x - nx * this.len - camX, this.y - ny * this.len - camY)
    ctx.stroke()
  }
}

export class Grenade extends Entity {
  fuse: number
  dmg: number
  radius: number
  thrower: Entity | null
  /** cooked grenades become impact grenades: no fuse, pops on contact */
  impact = false
  private age = 0

  constructor(x: number, y: number, vx: number, vy: number, faction: Faction, fuse = 2.0, dmg = 45, radius = 70, thrower: Entity | null = null) {
    super()
    this.x = x; this.y = y; this.vx = vx; this.vy = vy
    this.faction = faction
    this.fuse = fuse
    this.dmg = dmg
    this.radius = radius
    this.thrower = thrower
    this.w = 6; this.h = 6
  }

  update(w: World, dt: number) {
    this.age += dt
    this.vy += 900 * dt
    this.x += this.vx * dt
    this.y += this.vy * dt
    const armed = this.age > 0.12
    const gy = w.terrain.heightAt(this.x)
    if (this.y >= gy) {
      if (this.impact && armed) { this.boom(w); return }
      this.y = gy
      if (this.vy > 40) { this.vy *= -0.35; this.vx *= 0.6 } else { this.vy = 0; this.vx *= 0.85 }
    }
    if (this.impact) {
      if (armed) {
        for (const e of w.entities) {
          if (e === this || e === this.thrower || e.dead) continue
          if (e instanceof Projectile || e instanceof Grenade || e.faction === 'neutral') continue
          if (e.containsPoint(this.x, this.y - 3)) { this.boom(w); return }
        }
      }
      if (this.age > 5) this.boom(w) // sailed off somewhere pointless
      return
    }
    this.fuse -= dt
    if (this.fuse <= 0) this.boom(w)
  }

  private boom(w: World) {
    this.dead = true
    w.explode(this.x, this.y - 3, this.radius, this.dmg, this.thrower, { craterDepth: 16 })
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    ctx.fillStyle = PAL.pale
    ctx.beginPath()
    ctx.arc(this.x - camX, this.y - 3 - camY, 3, 0, Math.PI * 2)
    ctx.fill()
    // blinking fuse light, faster as it runs out
    if (Math.sin(this.fuse * (this.fuse < 0.7 ? 60 : 18)) > 0) {
      ctx.fillStyle = PAL.danger
      ctx.fillRect(this.x - 1 - camX, this.y - 8 - camY, 2, 2)
    }
  }
}
