import { Entity, dist } from './entity'
import { Pirate } from './pirate'
import { Native } from './native'
import type { World } from '../world/world'
import { PAL } from '../palette'
import { wilhelm } from '../audio/sfx'

// Ballistic pirate reinforcement pod (rimworld-style raid). Comes in at an
// angle, breaks on landing, kills anything it lands on. Never targets the lander.
export class DropPod extends Entity {
  count: number

  constructor(targetX: number, targetY: number, count: number, angleVx: number) {
    super()
    this.count = count
    this.faction = 'neutral' // projectiles pass through; it's scenery until it hits
    this.w = 18; this.h = 26
    this.vy = 420
    this.vx = angleVx
    const t = 1300 / this.vy
    this.x = targetX - this.vx * t
    this.y = targetY - 1300
    this.hp = this.maxHp = 999
  }

  update(w: World, dt: number) {
    this.vy += 40 * dt
    this.x += this.vx * dt
    this.y += this.vy * dt
    w.burst(this.x, this.y - 20, 1, PAL.warm, 40)
    const gy = w.terrain.heightAt(this.x)
    if (this.y >= gy) {
      this.dead = true
      // squash landing: lethal directly underneath, then pop open
      const squishedTribal = w.entities.some((e) =>
        e instanceof Native && !e.dead && dist(this.x, gy - 4, e.cx, e.cy) < 42 + e.w / 2)
      w.explode(this.x, gy - 4, 42, 220, null, { craterDepth: 14, big: true })
      if (squishedTribal) wilhelm()
      for (let i = 0; i < this.count; i++) {
        const p = new Pirate(this.x + (i - (this.count - 1) / 2) * 14, 'raider')
        p.y = gy - 10
        w.spawn(p)
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const sx = this.x - camX, sy = this.y - camY
    const ang = Math.atan2(this.vy, this.vx) - Math.PI / 2
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(ang)
    ctx.fillStyle = PAL.faint
    ctx.strokeStyle = PAL.pirate
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-8, 12)
    ctx.lineTo(-8, -6)
    ctx.quadraticCurveTo(0, -16, 8, -6)
    ctx.lineTo(8, 12)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // entry flame behind it
    ctx.fillStyle = PAL.warm
    ctx.beginPath()
    ctx.moveTo(-5, -10)
    ctx.lineTo(5, -10)
    ctx.lineTo(0, -20 - Math.random() * 10)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}
