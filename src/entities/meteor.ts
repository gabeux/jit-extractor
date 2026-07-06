import { Entity } from './entity'
import type { World } from '../world/world'
import { PAL } from '../palette'

// Divine punishment for shooting down your own rescue. Falls until it
// finds ground (or you), then makes a very strong argument.
export class Meteor extends Entity {
  private spin = Math.random() * Math.PI * 2
  private size = 7 + Math.random() * 7

  constructor(targetX: number, targetY: number) {
    super()
    this.faction = 'neutral'
    this.vy = 520 + Math.random() * 200
    this.vx = (Math.random() - 0.5) * 260
    const t = 1300 / this.vy
    this.x = targetX - this.vx * t
    this.y = targetY - 1300
    this.w = this.size * 2; this.h = this.size * 2
    this.hp = this.maxHp = 999
  }

  update(w: World, dt: number) {
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.spin += dt * 6
    w.burst(this.x, this.y - 8, 1, Math.random() < 0.6 ? PAL.warm : PAL.danger, 40)
    const gy = w.terrain.heightAt(this.x)
    if (this.y >= gy) {
      this.dead = true
      w.explode(this.x, gy - 4, 46 + this.size * 2, 65, this, { craterDepth: 15, big: this.size > 11 })
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const sx = this.x - camX, sy = this.y - camY
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(this.spin)
    ctx.fillStyle = PAL.terrainDeep
    ctx.strokeStyle = PAL.warm
    ctx.lineWidth = 2
    const s = this.size
    ctx.beginPath()
    ctx.moveTo(-s, -s * 0.4)
    ctx.lineTo(-s * 0.3, -s)
    ctx.lineTo(s * 0.8, -s * 0.6)
    ctx.lineTo(s, s * 0.3)
    ctx.lineTo(s * 0.1, s)
    ctx.lineTo(-s * 0.8, s * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}
