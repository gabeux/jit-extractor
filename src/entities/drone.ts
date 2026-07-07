import { Entity } from './entity'
import { Building } from './buildings'
import { OreDrop } from './loot'
import type { World } from '../world/world'
import { PAL } from '../palette'
import { sfx } from '../audio/sfx'

const SPEED = 170
const CARRY_MAX = 30

// Auto-hauler: flies (in tidy cardinal legs) to extractors, takes ore,
// brings it home to the lander. Fragile, and pirates like shooting it.
export class Drone extends Entity {
  carrying = 0
  deconstructT = 0 // hold-E recall, same interaction as buildings
  turbo = false    // lightning-struck: twice the speed, same tinfoil
  private phase: 'up' | 'across' | 'down' | 'act' = 'up'
  private target: Building | null = null
  private actT = 0
  private bob = Math.random() * 6

  constructor(x: number, y: number) {
    super()
    this.x = x; this.y = y
    this.w = 14; this.h = 10
    this.hp = this.maxHp = 40
    this.faction = 'player'
  }

  update(w: World, dt: number) {
    if (this.flashT > 0) this.flashT -= dt
    this.bob += dt
    const home = w.lander
    // pick a job (also while idling in 'act' with nothing to do):
    // always go for the FULLEST drill — production never waits, and it
    // naturally round-robins instead of camping one extractor
    if (this.carrying === 0 && (!this.target || this.target.dead || this.target.item.fill < 1)) {
      let found: Building | null = null
      for (const e of w.entities) {
        if (e instanceof Building && !e.dead && e.item.kind === 'drill' && e.item.fill >= 8) {
          if (!found || e.item.fill > found.item.fill) found = e
        }
      }
      if (found !== this.target) {
        this.target = found
        if (found && this.phase === 'act') this.phase = 'up'
      }
    }
    const destX = this.carrying > 0 ? home.x : this.target ? this.target.x : home.x
    const destY = (this.carrying > 0 ? home.y - 52 : this.target ? this.target.y - 44 : home.y - 70)
    const cruiseY = Math.min(w.terrain.heightAt(this.x), w.terrain.heightAt(destX)) - 130
    const sp = this.turbo ? SPEED * 2 : SPEED
    if (this.turbo && Math.random() < 0.12) w.burst(this.x, this.y, 1, PAL.accent, 30)

    this.vx = 0; this.vy = 0
    switch (this.phase) {
      case 'up':
        if (this.y > cruiseY) this.vy = -sp
        else this.phase = 'across'
        break
      case 'across':
        if (Math.abs(destX - this.x) > 6) this.vx = Math.sign(destX - this.x) * sp
        else this.phase = 'down'
        break
      case 'down':
        if (Math.abs(destX - this.x) > 40) { this.phase = 'up'; break } // target moved/died
        if (this.y < destY) this.vy = sp * 0.8
        else { this.phase = 'act'; this.actT = 0 }
        break
      case 'act': {
        this.actT += dt
        if (this.carrying > 0) {
          // deposit
          w.lander.ore += this.carrying
          w.addFloater(home.x, home.y - 64, `+${this.carrying} ORE`, PAL.good)
          this.carrying = 0
          sfx.pickup()
          this.phase = 'up'
        } else if (this.target && !this.target.dead && this.actT > 0.9) {
          const take = Math.min(CARRY_MAX, Math.floor(this.target.item.fill))
          this.target.item.fill -= take
          this.carrying = take
          if (take > 0) sfx.blip()
          this.target = null // re-pick the fullest drill fresh every trip
          this.phase = 'up'
        } else if (!this.target) {
          // no extractors to service: come home and set down
          if (Math.abs(home.x - this.x) > 70) this.phase = 'up'
          else if (this.y < w.terrain.heightAt(this.x) - 8) this.vy = sp * 0.5
          // else: parked next to the lander
        } else if (this.actT > 1.2) {
          this.phase = 'up'
        }
        break
      }
    }
    this.x += this.vx * dt
    this.y += this.vy * dt
    const gy = w.terrain.heightAt(this.x)
    // parked = wants to be on the ground (idle at home), so the clamp lets it settle
    const parked = this.phase === 'act' && !this.target && this.carrying === 0
    if (!parked) this.y += Math.sin(this.bob * 4) * 5 * dt
    const minClear = parked ? 6 : 14
    if (this.y > gy - minClear) this.y = gy - minClear
  }

  protected onDeath(w: World, _src: Entity | null) {
    w.burst(this.x, this.y, 12, PAL.accent, 130)
    sfx.boom()
    if (this.carrying > 0) {
      const drop = new OreDrop(this.x, this.y, this.carrying)
      drop.vy = -60
      w.spawn(drop)
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: World) {
    const sx = this.x - camX, sy = this.y - camY
    const c = this.flashT > 0 ? PAL.white : this.turbo ? PAL.accent : PAL.pale
    ctx.fillStyle = c
    ctx.strokeStyle = c
    ctx.lineWidth = 2
    // body + rotors
    ctx.fillRect(sx - 6, sy - 4, 12, 6)
    const spin = Math.sin(w.time * 40) * 5
    ctx.beginPath()
    ctx.moveTo(sx - 8 - spin, sy - 7); ctx.lineTo(sx - 2 + spin, sy - 7)
    ctx.moveTo(sx + 2 - spin, sy - 7); ctx.lineTo(sx + 8 + spin, sy - 7)
    ctx.stroke()
    // eye
    ctx.fillStyle = PAL.accent
    ctx.fillRect(sx - 1.5, sy - 2.5, 3, 3)
    // cargo
    if (this.carrying > 0) {
      ctx.fillStyle = PAL.good
      ctx.fillRect(sx - 4, sy + 3, 8, 6)
    }
    if (this.deconstructT > 0) {
      ctx.strokeStyle = PAL.accent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(sx, sy, 14, -Math.PI / 2, -Math.PI / 2 + (this.deconstructT / 1.9) * Math.PI * 2)
      ctx.stroke()
    }
  }
}
