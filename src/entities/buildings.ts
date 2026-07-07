import { Entity, dist } from './entity'
import { Projectile } from './projectile'
import { OreDrop } from './loot'
import type { World, ResourceNode } from '../world/world'
import { PAL } from '../palette'
import { sfx } from '../audio/sfx'

export type ItemKind = 'fuelgen' | 'drill' | 'turret' | 'medikit' | 'drone'

// A crate item: what it builds + its preserved internal progress (0-100).
// Drills store ore, fuel generators store fuel; turrets ignore fill.
export interface CrateItem {
  kind: ItemKind
  fill: number
}

export const ITEM_NAMES: Record<ItemKind, string> = {
  fuelgen: 'FUEL GEN',
  drill: 'EXTRACTOR',
  turret: 'TURRET',
  medikit: 'MEDIKIT',
  drone: 'PICKUP DRONE',
}

export const FUELGEN_RATE = 1.7  // fuel/sec -> full in ~60s
export const DRILL_RATE = 1.12   // ore/sec  -> short and sweet matches
export const BUILD_HOLD = 1.0    // seconds holding B to deploy
export const DECON_HOLD = 1.9    // seconds holding E to deconstruct

// A crate sitting in the world (dropped or deconstructed).
export class Crate extends Entity {
  item: CrateItem
  constructor(x: number, y: number, item: CrateItem) {
    super()
    this.x = x; this.y = y
    this.item = item
    this.w = 16; this.h = 14
    this.hp = this.maxHp = 60
    this.faction = 'neutral'
  }

  update(w: World, dt: number) {
    this.vx *= 0.9
    this.stepPhysics(w, dt)
  }

  /** Sim fuel gens can't be lost — the stranded path doesn't exist there. */
  damage(w: World, amt: number, src: Entity | null = null) {
    if (w.simulated && this.item.kind === 'fuelgen') return
    super.damage(w, amt, src)
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    drawCrate(ctx, this.x - camX, this.y - camY, this.flashT > 0)
  }
}

export function drawCrate(ctx: CanvasRenderingContext2D, sx: number, sy: number, flash = false) {
  ctx.fillStyle = flash ? PAL.white : PAL.dim
  ctx.fillRect(sx - 8, sy - 14, 16, 14)
  ctx.strokeStyle = PAL.pale
  ctx.lineWidth = 1.5
  ctx.strokeRect(sx - 8, sy - 14, 16, 14)
  ctx.beginPath()
  ctx.moveTo(sx - 8, sy - 14); ctx.lineTo(sx + 8, sy)
  ctx.moveTo(sx + 8, sy - 14); ctx.lineTo(sx - 8, sy)
  ctx.stroke()
}

export class Building extends Entity {
  item: CrateItem
  node: ResourceNode | null // drills occupy a node
  deconstructT = 0          // player's hold-E progress, managed by ground stage
  turbo = false             // lightning-blessed turret: laser pulses, double rate
  private cooldown = 0
  private puffT = 0

  constructor(x: number, item: CrateItem, node: ResourceNode | null = null) {
    super()
    this.x = x
    this.item = item
    this.node = node
    this.faction = 'player'
    this.w = 22
    this.h = item.kind === 'turret' ? 26 : 30
    this.maxHp = item.kind === 'fuelgen' ? 100 : item.kind === 'drill' ? 120 : 140
    this.hp = this.maxHp
  }

  update(w: World, dt: number) {
    this.y = w.terrain.heightAt(this.x) // buildings sit on (possibly cratered) ground
    if (this.flashT > 0) this.flashT -= dt
    this.puffT -= dt
    const it = this.item
    if (it.kind === 'fuelgen' && it.fill < 100) {
      it.fill = Math.min(100, it.fill + FUELGEN_RATE * dt)
      if (this.puffT <= 0) { w.burst(this.x + 6, this.y - this.h, 1, PAL.warm, 25); this.puffT = 0.5 }
    } else if (it.kind === 'drill' && it.fill < 100) {
      it.fill = Math.min(100, it.fill + DRILL_RATE * w.mods.mine * dt)
      if (this.puffT <= 0) { w.burst(this.x, this.y - 4, 2, PAL.dim, 40); this.puffT = 0.7 }
    } else if (it.kind === 'turret') {
      this.cooldown -= dt
      if (this.cooldown <= 0) {
        const target = w.findTurretTarget(this.x, this.y - 14, 400)
        if (target) {
          const dx = target.cx - this.x, dy = target.cy - (this.y - 14)
          const m = Math.hypot(dx, dy) || 1
          const spd = this.turbo ? 950 : 620
          w.spawn(new Projectile(this.x + (dx / m) * 12, this.y - 14 + (dy / m) * 12,
            (dx / m) * spd, (dy / m) * spd, 'player',
            this.turbo ? 28 : 14, this.turbo ? PAL.white : PAL.accent, this, 15, 3.5))
          sfx.turret()
          this.cooldown = this.turbo ? 0.4 : 0.8
        } else {
          this.cooldown = 0.15
        }
      }
    }
  }

  /** Sim fuel gens are invincible — the stranded path doesn't exist there. */
  damage(w: World, amt: number, src: Entity | null = null) {
    if (w.simulated && this.item.kind === 'fuelgen') return
    super.damage(w, amt, src)
  }

  protected onDeath(w: World, _src: Entity | null) {
    if (this.node) this.node.taken = false
    w.explode(this.x, this.y - 8, 40, 20, null, { craterDepth: 6 })
    // extracted ore survives the wreck — and pirates know it
    if (this.item.kind === 'drill' && this.item.fill >= 1) {
      const drop = new OreDrop(this.x, this.y - 20, Math.round(this.item.fill))
      drop.vy = -120
      w.spawn(drop)
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: World) {
    const sx = this.x - camX, sy = this.y - camY
    const flash = this.flashT > 0
    ctx.strokeStyle = flash ? PAL.white : PAL.pale
    ctx.fillStyle = flash ? PAL.white : PAL.faint
    ctx.lineWidth = 2
    const it = this.item
    if (it.kind === 'fuelgen') {
      ctx.fillRect(sx - 11, sy - 26, 22, 26)
      ctx.strokeRect(sx - 11, sy - 26, 22, 26)
      ctx.strokeRect(sx + 4, sy - 34, 4, 8) // chimney
      bar(ctx, sx, sy - 40, it.fill / 100, PAL.warm)
    } else if (it.kind === 'drill') {
      ctx.fillRect(sx - 11, sy - 22, 22, 22)
      ctx.strokeRect(sx - 11, sy - 22, 22, 22)
      // animated drill arm
      const bob = it.fill < 100 ? Math.sin(w.time * 10) * 3 : 0
      ctx.beginPath()
      ctx.moveTo(sx, sy - 22)
      ctx.lineTo(sx, sy - 30 - bob)
      ctx.stroke()
      bar(ctx, sx, sy - 40, it.fill / 100, PAL.good)
      if (it.fill >= 100) {
        ctx.fillStyle = PAL.good
        ctx.fillRect(sx - 2, sy - 48 + Math.sin(w.time * 4) * 2, 4, 4) // "done" blip
      }
    } else {
      // turret: base + barrel toward last known threat side
      if (this.turbo) {
        // lightning-blessed: charged tip blip
        ctx.fillStyle = PAL.accent
        ctx.fillRect(sx - 2, sy - 30 + Math.sin(w.time * 6) * 2, 4, 4)
        ctx.fillStyle = flash ? PAL.white : PAL.faint
      }
      ctx.fillRect(sx - 8, sy - 14, 16, 14)
      ctx.strokeRect(sx - 8, sy - 14, 16, 14)
      ctx.beginPath()
      ctx.arc(sx, sy - 16, 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(sx, sy - 16)
      const t = w.findTurretTarget(this.x, this.y - 14, 400)
      const ang = t ? Math.atan2(t.cy - (this.y - 16), t.cx - this.x) : -Math.PI / 4
      ctx.lineTo(sx + Math.cos(ang) * 13, sy - 16 + Math.sin(ang) * 13)
      ctx.stroke()
    }
    // deconstruct progress ring
    if (this.deconstructT > 0) {
      ctx.strokeStyle = PAL.accent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(sx, sy - this.h / 2, 16, -Math.PI / 2, -Math.PI / 2 + (this.deconstructT / DECON_HOLD) * Math.PI * 2)
      ctx.stroke()
    }
  }
}

// Tiny diegetic progress bar drawn on/over the building itself.
export function bar(ctx: CanvasRenderingContext2D, cx: number, y: number, t: number, color: string, w = 24) {
  ctx.fillStyle = PAL.bgSky
  ctx.fillRect(cx - w / 2, y, w, 4)
  ctx.fillStyle = color
  ctx.fillRect(cx - w / 2, y, w * Math.min(1, t), 4)
  ctx.strokeStyle = PAL.dim
  ctx.lineWidth = 1
  ctx.strokeRect(cx - w / 2 + 0.5, y + 0.5, w - 1, 3)
}
