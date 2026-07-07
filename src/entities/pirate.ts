import { Entity, dist } from './entity'
import { Projectile, Grenade } from './projectile'
import { Building } from './buildings'
import { Player } from './player'
import { Lander } from './lander'
import { Animal } from './animal'
import { Drone } from './drone'
import { OreDrop, FlarePickup } from './loot'
import type { World } from '../world/world'
import { PAL } from '../palette'
import { sfx } from '../audio/sfx'

const SIGHT = 320

export class Pirate extends Entity {
  // guard: holds a node · raider: droppod reinforcement, hunts the lander
  // squad: deathsquad looter — destroys player property, hauls ore to the ship
  role: 'guard' | 'raider' | 'squad'
  postX: number
  carryingOre = 0
  // 5% faster than baseline, plus 10-20% personal spice, rolled at spawn
  private cdScale = 0.95 * (1 - (0.10 + Math.random() * 0.10))
  private cooldown = 1 + Math.random() * 1.5
  private retargetT = Math.random() * 0.4
  private strafeT = 0
  private strafeDir = 0
  private blockedShots = 0 // consecutive shots fired into terrain
  private repositionT = 0  // advancing for a better angle, holding fire
  target: Entity | null = null
  private personalAggro: Entity | null = null
  private lootGoal: OreDrop | null = null

  constructor(x: number, role: 'guard' | 'raider' | 'squad') {
    super()
    this.x = x
    this.role = role
    this.postX = x
    this.w = 12; this.h = 20
    this.hp = this.maxHp = 40
    this.faction = 'pirate'
  }

  update(w: World, dt: number) {
    this.stepPhysics(w, dt)
    this.cooldown -= dt
    this.retargetT -= dt
    if (this.retargetT <= 0) {
      this.retargetT = 0.35
      this.target = this.pickTarget(w)
    }
    // two shots into a hillside = stop shooting the hillside and go around it
    if (this.repositionT > 0) {
      this.repositionT -= dt
      const t0 = this.target
      if (t0 && !t0.dead) {
        this.vx = Math.sign(t0.x - this.x) * 95
        return
      }
    }
    if (this.role === 'squad') {
      this.updateSquad(w)
      return
    }
    // any pirate holding stolen ore hauls it to the ship once one is down
    if (this.carryingOre > 0 && w.pirateShip && !w.pirateShip.dead && w.pirateShip.state === 'landed') {
      const t0 = this.target
      if (t0 && !t0.dead && dist(this.x, this.cy, t0.cx, t0.cy) < SIGHT && this.cooldown <= 0) this.attack(w, t0)
      this.haulToShip(w)
      return
    }
    const t = this.target
    // a drill or hauler drone is loot-in-waiting, not a threat — it can be
    // shot at in passing, but it never outranks grabbing free ore
    const threat = t && !t.dead &&
      !((t instanceof Building && t.item.kind !== 'turret') || t instanceof Drone || t instanceof Lander)
    if (t && !t.dead && this.cooldown <= 0 && dist(this.x, this.cy, t.cx, t.cy) < SIGHT) {
      this.attack(w, t)
    }
    if (t && !t.dead && threat) {
      const d = dist(this.x, this.cy, t.cx, t.cy)
      // raiders close the distance; guards hold their post
      if (this.role === 'raider' && d > 250) this.vx = Math.sign(t.x - this.x) * 95
      else this.vx = 0
    } else if (this.carryingOre === 0 && this.seekOre(w)) {
      // no enemy in sight: stealing comes first
    } else if (t && !t.dead) {
      // passive property target: close in on it
      const d = dist(this.x, this.cy, t.cx, t.cy)
      if (d > 250) this.vx = Math.sign(t.x - this.x) * 95
      else this.vx = 0
    } else if (this.role === 'raider') {
      // march on the lander
      const d = Math.abs(w.lander.x - this.x)
      this.vx = d > 260 ? Math.sign(w.lander.x - this.x) * 95 : 0
    } else {
      // guard: drift back to post, small idle strafes
      if (Math.abs(this.x - this.postX) > 70) this.vx = Math.sign(this.postX - this.x) * 60
      else {
        this.strafeT -= dt
        if (this.strafeT <= 0) { this.strafeT = 1 + Math.random() * 2; this.strafeDir = Math.floor(Math.random() * 3) - 1 }
        this.vx = this.strafeDir * 30
      }
    }
    this.tryGrabOre(w)
  }

  /** Deathsquad loop: haul ore -> grab ore -> wreck property -> board & leave. */
  private updateSquad(w: World) {
    const ship = w.pirateShip && !w.pirateShip.dead ? w.pirateShip : null
    // 0. shoot back / clear threats and property on the way
    const t = this.target
    if (t && !t.dead && dist(this.x, this.cy, t.cx, t.cy) < SIGHT && this.cooldown <= 0) {
      this.attack(w, t)
    }
    // 1. carrying ore -> bring it to the ship
    if (this.carryingOre > 0 && ship && ship.state === 'landed') {
      this.haulToShip(w)
      return
    }
    // 2. free ore on the ground -> claim & fetch it
    if (this.carryingOre === 0) {
      if (!this.lootGoal || this.lootGoal.dead || (this.lootGoal.claimedBy && this.lootGoal.claimedBy !== this)) {
        this.lootGoal = (w.findNearestEntity(this.x, this.y, 4000, (e) =>
          e instanceof OreDrop && !e.dead && (!e.claimedBy || e.claimedBy === this)) as OreDrop | null)
        if (this.lootGoal) this.lootGoal.claimedBy = this
      }
      if (this.lootGoal) {
        const g = this.lootGoal
        if (Math.abs(g.x - this.x) > 14) {
          this.vx = Math.sign(g.x - this.x) * 95
        } else {
          this.vx = 0
          g.dead = true
          this.carryingOre = g.amount
          this.lootGoal = null
          sfx.pickup()
          w.onOreLooted(this)
        }
        return
      }
    }
    // 3. property still standing -> walk into range of it
    const prop = w.findNearestEntity(this.x, this.y, 4000, (e) =>
      (e instanceof Building || e instanceof Drone) && !e.dead)
    if (prop) {
      const d = dist(this.x, this.cy, prop.cx, prop.cy)
      this.vx = d > 240 ? Math.sign(prop.x - this.x) * 95 : 0
      return
    }
    // 4. nothing left -> board the ship
    if (w.squadBoarding && ship && ship.state === 'landed') {
      if (Math.abs(ship.x - this.x) > 22) {
        this.vx = Math.sign(ship.x - this.x) * 95
      } else {
        this.dead = true // walked up the ramp (direct removal, no death effects)
        ship.aboard++
      }
      return
    }
    this.vx = 0
  }

  /** Walk toward the nearest unclaimed ore pile. True while en route. */
  private seekOre(w: World): boolean {
    if (!this.lootGoal || this.lootGoal.dead || (this.lootGoal.claimedBy && this.lootGoal.claimedBy !== this)) {
      this.lootGoal = (w.findNearestEntity(this.x, this.y, 450, (e) =>
        e instanceof OreDrop && !e.dead && (!e.claimedBy || e.claimedBy === this)) as OreDrop | null)
      if (this.lootGoal) this.lootGoal.claimedBy = this
    }
    if (!this.lootGoal) return false
    this.vx = Math.abs(this.lootGoal.x - this.x) > 12 ? Math.sign(this.lootGoal.x - this.x) * 95 : 0
    return true
  }

  private haulToShip(w: World) {
    const ship = w.pirateShip!
    if (Math.abs(ship.x - this.x) > 34) {
      this.vx = Math.sign(ship.x - this.x) * 95
    } else {
      this.vx = 0
      ship.looted += this.carryingOre
      w.addFloater(ship.x, ship.y - 50, `PIRATES LOOTED ${this.carryingOre} ORE`, PAL.danger)
      this.carryingOre = 0
    }
  }

  /** Guards/raiders opportunistically pocket ore they're standing on. */
  private tryGrabOre(w: World) {
    if (this.carryingOre > 0) return
    const drop = w.findNearestEntity(this.x, this.y, 20, (e) => e instanceof OreDrop && !e.dead) as OreDrop | null
    if (drop) {
      drop.dead = true
      this.carryingOre = drop.amount
      sfx.pickup()
      w.onOreLooted(this)
    }
  }

  private pickTarget(w: World): Entity | null {
    if (w.peaceful) return null // tutorial calm: holograms don't hold grudges
    if (this.personalAggro && !this.personalAggro.dead &&
        dist(this.x, this.y, this.personalAggro.x, this.personalAggro.y) < SIGHT + 80) {
      return this.personalAggro
    }
    let best: Entity | null = null
    let bestD = this.role === 'squad' ? SIGHT + 60 : SIGHT
    for (const e of w.entities) {
      if (e.dead || e === this) continue
      let hostile = false
      if (e instanceof Player && !e.inLander) hostile = true
      else if (e instanceof Building || e instanceof Drone) hostile = true
      else if (e instanceof Lander && this.role === 'raider') hostile = true
      else if (e.faction === 'native' && w.atWar('pirate', 'native')) hostile = true
      else if (e instanceof Animal && e.kind === 'aggro' && dist(this.x, this.y, e.x, e.y) < 130) hostile = true
      if (!hostile) continue
      let d = dist(this.x, this.cy, e.cx, e.cy)
      // the deathsquad is here for your stuff first
      if (this.role === 'squad' && (e instanceof Building || e instanceof Drone)) d *= 0.5
      if (d < bestD) { bestD = d; best = e }
    }
    return best
  }

  /** Coarse terrain sample along the firing line. */
  private hasLOS(w: World, t: Entity): boolean {
    const x0 = this.x, y0 = this.y - 13
    const steps = Math.ceil(Math.abs(t.cx - x0) / 18) + 1
    for (let i = 1; i < steps; i++) {
      const f = i / steps
      if (y0 + (t.cy - y0) * f > w.terrain.heightAt(x0 + (t.cx - x0) * f) - 2) return false
    }
    return true
  }

  private attack(w: World, t: Entity) {
    this.cooldown = (1.6 + Math.random() * 0.9) * this.cdScale
    const gx = this.x, gy = this.y - 13
    // firing without line of sight is on-brand, but only twice — then either
    // lob a grenade over the hill or move for a real angle
    if (!(t instanceof Building) && !this.hasLOS(w, t)) {
      this.blockedShots++
      if (this.blockedShots >= 2) {
        this.blockedShots = 0
        if (Math.random() < 0.3 && w.pirateGrenadeCd <= 0) {
          w.pirateGrenadeCd = 4 // one lobbed grenade per crew at a time
          const T = 1.1
          w.spawn(new Grenade(gx, gy, (t.x - gx) / T, (t.cy - gy) / T - 0.5 * 900 * T, 'pirate', 1.6, 40, 65, this))
          sfx.drop()
          return
        }
        this.repositionT = 1.2 + Math.random() * 0.8
        return
      }
    } else this.blockedShots = 0
    if (Math.random() < 0.02 && w.pirateGrenadeCd <= 0) {
      // the dreaded 2% grenade — one per crew at a time
      w.pirateGrenadeCd = 4
      const T = 0.9
      const vx = (t.x - gx) / T
      const vy = (t.cy - gy) / T - 0.5 * 900 * T
      w.spawn(new Grenade(gx, gy, vx, vy, 'pirate', 1.6, 40, 65, this))
      sfx.drop()
      return
    }
    const err = (Math.random() - 0.5) * 40
    const dx = t.cx - gx, dy = t.cy + err - gy
    const m = Math.hypot(dx, dy) || 1
    w.spawn(new Projectile(gx + (dx / m) * 12, gy + (dy / m) * 12, (dx / m) * 340, (dy / m) * 340, 'pirate', 8, PAL.danger, this))
    sfx.enemyPew()
  }

  protected onDamaged(w: World, src: Entity | null) {
    if (src && src.faction !== 'pirate') {
      this.personalAggro = src
      if (src.faction === 'native') w.declareWar('pirate', 'native')
    }
  }

  protected onDeath(w: World, src: Entity | null) {
    w.burst(this.x, this.cy, 10, PAL.pirate, 120)
    sfx.die()
    if (this.carryingOre > 0) {
      const drop = new OreDrop(this.x, this.y - 10, this.carryingOre)
      drop.vy = -100
      w.spawn(drop)
    }
    // a stranded player's ticket home: pirates carry distress flares
    if (w.isStranded() && !w.pirateShip && !w.shipPending &&
        !w.entities.some((e) => e instanceof FlarePickup && !e.dead)) {
      const f = new FlarePickup(this.x, this.y - 6)
      f.vy = -80
      w.spawn(f)
      w.addFloater(this.x, this.cy - 20, 'DISTRESS FLARE DROPPED', PAL.danger)
    }
    if (src && src.faction === 'player') w.onPirateKilled()
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const sx = this.x - camX, sy = this.y - camY
    const c = this.flashT > 0 ? PAL.white : PAL.pirate
    ctx.strokeStyle = c
    ctx.fillStyle = c
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx, sy - 8); ctx.lineTo(sx - 3, sy)
    ctx.moveTo(sx, sy - 8); ctx.lineTo(sx + 3, sy)
    ctx.stroke()
    ctx.fillRect(sx - 3.5, sy - 16, 7, 9)
    // angular helmet
    ctx.beginPath()
    ctx.moveTo(sx - 4, sy - 16); ctx.lineTo(sx - 4, sy - 21); ctx.lineTo(sx + 5, sy - 19); ctx.lineTo(sx + 4, sy - 16)
    ctx.closePath()
    ctx.fill()
    // stolen goods on their back
    if (this.carryingOre > 0) {
      ctx.fillStyle = PAL.good
      ctx.fillRect(sx - 8, sy - 22, 6, 6)
    }
    // gun toward target
    const t = this.target
    const a = t && !t.dead ? Math.atan2(t.cy - (this.y - 13), t.cx - this.x) : 0
    ctx.strokeStyle = c
    ctx.beginPath()
    ctx.moveTo(sx, sy - 13)
    ctx.lineTo(sx + Math.cos(a) * 10, sy - 13 + Math.sin(a) * 10)
    ctx.stroke()
  }
}
