import { Entity } from './entity'
import type { CrateItem, ItemKind } from './buildings'
import type { World } from '../world/world'
import { PAL } from '../palette'

// What the lander ships out with — and what corporate expects back.
export const LOADOUT: [ItemKind, number][] = [
  ['fuelgen', 1],
  ['drill', 3],
  ['turret', 2],
  ['drone', 1],
  ['medikit', 2],
]

// Replacement cost billed for each item not returned (lost, left, or used).
export const EQUIPMENT_COST: Record<ItemKind, number> = {
  fuelgen: 1000,
  drill: 100,
  turret: 350,
  drone: 150,
  medikit: 50,
}

// The lander is both the flight-stage vehicle and the ground-stage home base.
// Flight stages integrate its physics directly; on the ground it just sits.
export class Lander extends Entity {
  fuel = 67 // tight on purpose: descent + ascent barely fit, refueling matters
  ore = 0
  inventory: CrateItem[] = LOADOUT.flatMap(([kind, n]) =>
    Array.from({ length: n }, () => ({ kind, fill: 0 })))
  flying = true
  thrustMain = false // set by flight stages for the flame
  thrustSide = 0

  constructor() {
    super()
    this.w = 44; this.h = 38
    this.hp = this.maxHp = 400
    this.faction = 'player'
  }

  update(w: World, dt: number) {
    if (this.flashT > 0) this.flashT -= dt
    if (!this.flying) {
      // settle onto (possibly cratered) terrain
      this.y = w.terrain.heightAt(this.x)
      this.vx = 0; this.vy = 0
    }
  }

  protected onDeath(w: World, _src: Entity | null) {
    w.explode(this.x, this.y - 15, 90, 60, null, { craterDepth: 20, big: true })
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: World) {
    const sx = this.x - camX, sy = this.y - camY
    const c = this.flashT > 0 ? PAL.white : PAL.pale
    ctx.strokeStyle = c
    ctx.lineWidth = 2
    // splayed tripod legs with foot pads (Astroneer-style stance)
    ctx.beginPath()
    ctx.moveTo(sx - 12, sy - 12); ctx.lineTo(sx - 22, sy - 1)
    ctx.moveTo(sx + 12, sy - 12); ctx.lineTo(sx + 22, sy - 1)
    ctx.stroke()
    ctx.fillStyle = c
    ctx.fillRect(sx - 26, sy - 2, 9, 3)
    ctx.fillRect(sx + 17, sy - 2, 9, 3)
    // engine bell under the belly
    ctx.fillStyle = PAL.dim
    ctx.beginPath()
    ctx.moveTo(sx - 6, sy - 10)
    ctx.lineTo(sx + 6, sy - 10)
    ctx.lineTo(sx + 9, sy - 5)
    ctx.lineTo(sx - 9, sy - 5)
    ctx.closePath()
    ctx.fill()
    // chunky rounded lower hull
    ctx.fillStyle = PAL.faint
    ctx.beginPath()
    ctx.moveTo(sx - 18, sy - 10)
    ctx.quadraticCurveTo(sx - 21, sy - 22, sx - 14, sy - 26)
    ctx.lineTo(sx + 14, sy - 26)
    ctx.quadraticCurveTo(sx + 21, sy - 22, sx + 18, sy - 10)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // side pods
    ctx.fillStyle = PAL.bgSky
    ctx.strokeStyle = this.flashT > 0 ? PAL.white : PAL.dim
    ctx.lineWidth = 1.5
    ctx.strokeRect(sx - 21, sy - 22, 6, 9)
    ctx.fillRect(sx - 21, sy - 22, 6, 9)
    ctx.strokeRect(sx + 15, sy - 22, 6, 9)
    ctx.fillRect(sx + 15, sy - 22, 6, 9)
    // dome canopy with a big friendly visor
    ctx.strokeStyle = c
    ctx.lineWidth = 2
    ctx.fillStyle = PAL.faint
    ctx.beginPath()
    ctx.moveTo(sx - 13, sy - 26)
    ctx.quadraticCurveTo(sx - 13, sy - 43, sx, sy - 44)
    ctx.quadraticCurveTo(sx + 13, sy - 43, sx + 13, sy - 26)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = PAL.accent
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.moveTo(sx - 9, sy - 29)
    ctx.quadraticCurveTo(sx - 9, sy - 39, sx, sy - 40)
    ctx.quadraticCurveTo(sx + 9, sy - 39, sx + 9, sy - 29)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
    // antenna + blinking nav light
    ctx.strokeStyle = c
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(sx + 10, sy - 42); ctx.lineTo(sx + 14, sy - 50)
    ctx.stroke()
    if (Math.sin(w.time * 5) > 0.2) {
      ctx.fillStyle = PAL.warm
      ctx.fillRect(sx + 13, sy - 53, 3, 3)
    }
    // main thruster flame
    if (this.thrustMain) {
      ctx.fillStyle = PAL.warm
      const f = 12 + Math.random() * 10
      ctx.beginPath()
      ctx.moveTo(sx - 8, sy - 5)
      ctx.lineTo(sx + 8, sy - 5)
      ctx.lineTo(sx, sy - 5 + f)
      ctx.closePath()
      ctx.fill()
    }
    if (this.thrustSide !== 0) {
      ctx.fillStyle = PAL.warm
      const dir = -this.thrustSide
      ctx.fillRect(sx + dir * 16, sy - 20, dir * (5 + Math.random() * 5), 3)
    }
    // damage smoke when badly hurt
    if (this.hp < this.maxHp * 0.4 && Math.random() < 0.15) {
      w.burst(this.x + (Math.random() * 20 - 10), this.y - 30, 1, PAL.dim, 30)
    }
  }
}
