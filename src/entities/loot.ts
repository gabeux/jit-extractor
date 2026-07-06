import { Entity } from './entity'
import type { World } from '../world/world'
import { PAL } from '../palette'

// A distress flare dropped by a pirate when the player is stranded.
// Fire it (E) to bait a pirate ship down — then take the ship.
export class FlarePickup extends Entity {
  constructor(x: number, y: number) {
    super()
    this.x = x; this.y = y
    this.w = 10; this.h = 8
    this.hp = this.maxHp = 999
    this.faction = 'neutral'
  }

  update(w: World, dt: number) {
    this.vx *= 0.9
    this.stepPhysics(w, dt)
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: World) {
    const sx = this.x - camX, sy = this.y - camY
    ctx.strokeStyle = PAL.danger
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sx - 4, sy)
    ctx.lineTo(sx + 4, sy - 7)
    ctx.stroke()
    if (Math.sin(w.time * 6) > 0) {
      ctx.fillStyle = PAL.danger
      ctx.fillRect(sx + 3, sy - 10, 3, 3)
    }
    // bobbing marker: your ticket home should be impossible to miss
    const bob = Math.sin(w.time * 4) * 3
    ctx.fillStyle = PAL.danger
    ctx.beginPath()
    ctx.moveTo(sx - 5, sy - 28 + bob)
    ctx.lineTo(sx + 5, sy - 28 + bob)
    ctx.lineTo(sx, sy - 20 + bob)
    ctx.closePath()
    ctx.fill()
  }
}

// Ore spilled by a destroyed drill/drone. The player collects it by touch
// (banked straight to the lander); pirates will try to steal it.
export class OreDrop extends Entity {
  amount: number
  /** set while a pirate is en route so two don't fight over one pile */
  claimedBy: Entity | null = null

  constructor(x: number, y: number, amount: number) {
    super()
    this.x = x; this.y = y
    this.amount = amount
    this.w = 12; this.h = 8
    this.hp = this.maxHp = 999
    this.faction = 'neutral'
  }

  update(w: World, dt: number) {
    this.vx *= 0.9
    this.stepPhysics(w, dt)
    if (this.claimedBy?.dead) this.claimedBy = null
    // player walks over it -> banked to the lander
    const p = w.player
    if (!p.dead && !p.inLander && Math.abs(p.x - this.x) < 18 && Math.abs(p.y - this.y) < 26) {
      w.lander.ore += this.amount
      w.addFloater(this.x, this.y - 20, `+${this.amount} ORE`, PAL.good)
      this.dead = true
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: World) {
    const sx = this.x - camX, sy = this.y - camY
    ctx.fillStyle = PAL.good
    const tw = Math.sin(w.time * 5 + this.x) * 0.5
    ctx.fillRect(sx - 5, sy - 4 + tw, 4, 4)
    ctx.fillRect(sx + 1, sy - 6 - tw, 4, 4)
    ctx.fillRect(sx - 1, sy - 2, 3, 3)
  }
}
