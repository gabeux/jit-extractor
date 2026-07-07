import { Entity } from './entity'
import { Pirate } from './pirate'
import { Native } from './native'
import { Animal } from './animal'
import { Player } from './player'
import { Building } from './buildings'
import { Drone } from './drone'
import { OreDrop } from './loot'
import type { World } from '../world/world'
import { PAL } from '../palette'
import { sfx, wilhelm } from '../audio/sfx'

// Fired by the first pirate to grab spilled ore. Pure signal: rises, pops red.
export class Flare extends Entity {
  private t = 0
  constructor(x: number, y: number) {
    super()
    this.x = x; this.y = y
    this.vy = -260
    this.faction = 'neutral'
    this.h = 0
  }

  update(w: World, dt: number) {
    this.t += dt
    this.y += this.vy * dt
    this.vy *= 1 - 0.4 * dt
    w.burst(this.x, this.y, 1, PAL.danger, 20)
    if (this.t > 1.3) {
      this.dead = true
      w.burst(this.x, this.y, 18, PAL.danger, 120)
      sfx.alarm()
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    ctx.fillStyle = PAL.danger
    ctx.beginPath()
    ctx.arc(this.x - camX, this.y - camY, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

// The deathsquad lander: lands nearby, unloads 5-10 pirates who loot every
// piece of player property, haul the ore aboard, then leave. Killable.
export class PirateShip extends Entity {
  state: 'inbound' | 'landed' | 'leaving' = 'inbound'
  looted = 0
  aboard = 0
  /** crates the player hauled aboard — they escape with the ship */
  stowed: import('./buildings').CrateItem[] = []
  private squadSize: number
  private checkT = 0
  private landedT = 0

  constructor(targetX: number, targetY: number, squadSize: number) {
    super()
    this.squadSize = squadSize
    this.w = 72; this.h = 40
    this.hp = this.maxHp = 600
    this.faction = 'pirate'
    this.vy = 300
    this.vx = targetX > 1800 ? -90 : 90
    const t = 1200 / this.vy
    this.x = targetX - this.vx * t
    this.y = targetY - 1200
  }

  update(w: World, dt: number) {
    if (this.flashT > 0) this.flashT -= dt
    if (this.state === 'inbound') {
      this.x += this.vx * dt
      this.y += this.vy * dt
      w.burst(this.x, this.y - 24, 2, PAL.warm, 50)
      const gy = w.terrain.heightAt(this.x)
      if (this.y >= gy) {
        this.y = gy
        this.vx = 0; this.vy = 0
        w.terrain.flatten(this.x, 40)
        this.state = 'landed'
        w.shake = Math.max(w.shake, 8)
        sfx.thud()
        // anyone standing in the landing zone gets flattened with the terrain
        let squishedTribal = false
        for (const e of w.entities) {
          if (e.dead || !(e instanceof Native || e instanceof Animal || e instanceof Player)) continue
          if (e instanceof Player && e.inLander) continue
          if (Math.abs(e.x - this.x) < 52 && Math.abs(e.y - gy) < 40) {
            w.burst(e.x, e.cy, 16, PAL.danger, 160)
            e.damage(w, 999, null)
            if (e instanceof Native) squishedTribal = true
          }
        }
        if (squishedTribal) wilhelm()
        for (let i = 0; i < this.squadSize; i++) {
          const p = new Pirate(this.x + (i % 2 === 0 ? -1 : 1) * (30 + i * 9), 'squad')
          p.y = this.y - 4
          w.spawn(p)
        }
      }
      return
    }
    if (this.state === 'landed') {
      this.y = w.terrain.heightAt(this.x)
      this.landedT += dt
      this.checkT -= dt
      // generous ground stay: a stranded player needs real time to fight
      // their way over before the crew packs up and leaves
      if (this.checkT <= 0 && this.landedT > 24) {
        this.checkT = 0.7
        // job done? nothing left to loot, no pirate anywhere still hauling
        const lootLeft = w.entities.some((e) => e instanceof OreDrop && !e.dead)
        const propLeft = w.entities.some((e) => (e instanceof Building || e instanceof Drone) && !e.dead)
        const hauling = w.entities.some((e) => e instanceof Pirate && !e.dead && e.carryingOre > 0)
        if (!lootLeft && !propLeft && !hauling) w.squadBoarding = true
        if (w.squadBoarding) {
          const squadAlive = w.entities.some((e) => e instanceof Pirate && e.role === 'squad' && !e.dead)
          // only lifts off if someone actually made it aboard — a ship whose
          // whole crew died stays derelict on the pad (and can be stolen)
          if (!squadAlive && this.aboard > 0) {
            this.state = 'leaving'
            this.vy = -40
            sfx.launch()
          }
        }
      }
      return
    }
    // leaving
    this.vy -= 260 * dt
    this.y += this.vy * dt
    w.burst(this.x, this.y + 4, 2, PAL.warm, 60)
    if (this.y < -100) {
      this.dead = true // direct removal: it got away (no explosion)
      w.pirateShipEscaped = this.looted
    }
  }

  protected onDeath(w: World, _src: Entity | null) {
    w.explode(this.x, this.y - 16, 110, 70, null, { craterDepth: 18, big: true })
    w.pirateShipDestroyed = true
    w.addMoney(1000, this.x, this.y - 70)
    // stranded, flared for rescue, then shot the rescue down? the planet objects.
    if (w.flareFiredByPlayer && w.isStranded()) {
      w.meteorStorm = true
      w.addFloater(this.x, this.y - 90, 'THE SKY IS FALLING', PAL.danger)
      sfx.alarm()
    }
    // the loot rains back out
    let rest = this.looted
    while (rest > 0) {
      const chunk = Math.min(30, rest)
      rest -= chunk
      const drop = new OreDrop(this.x + (Math.random() * 100 - 50), this.y - 30, chunk)
      drop.vy = -180 - Math.random() * 80
      drop.vx = Math.random() * 160 - 80
      w.spawn(drop)
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const sx = this.x - camX, sy = this.y - camY
    const c = this.flashT > 0 ? PAL.white : PAL.pirate
    ctx.strokeStyle = c
    ctx.fillStyle = PAL.faint
    ctx.lineWidth = 2.5
    // wide brutal hull
    ctx.beginPath()
    ctx.moveTo(sx - 36, sy - 6)
    ctx.lineTo(sx - 30, sy - 30)
    ctx.lineTo(sx + 24, sy - 30)
    ctx.lineTo(sx + 36, sy - 12)
    ctx.lineTo(sx + 32, sy - 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // legs / ramp
    ctx.beginPath()
    ctx.moveTo(sx - 28, sy - 6); ctx.lineTo(sx - 32, sy)
    ctx.moveTo(sx + 26, sy - 6); ctx.lineTo(sx + 30, sy)
    ctx.stroke()
    // menacing viewport
    ctx.fillStyle = PAL.danger
    ctx.fillRect(sx - 14, sy - 24, 18, 5)
    // thrusters while moving
    if (this.state !== 'landed') {
      ctx.fillStyle = PAL.warm
      const f = 8 + Math.random() * 8
      ctx.beginPath()
      ctx.moveTo(sx - 16, sy - 4); ctx.lineTo(sx - 8, sy - 4); ctx.lineTo(sx - 12, sy - 4 + f)
      ctx.moveTo(sx + 8, sy - 4); ctx.lineTo(sx + 16, sy - 4); ctx.lineTo(sx + 12, sy - 4 + f)
      ctx.fill()
    }
  }
}
