import { Terrain } from './terrain'
import { Entity, dist, type Faction } from '../entities/entity'
import { Projectile } from '../entities/projectile'
import { Player } from '../entities/player'
import { Lander } from '../entities/lander'
import { Building, Crate } from '../entities/buildings'
import { Drone } from '../entities/drone'
import { Animal } from '../entities/animal'
import { Native } from '../entities/native'
import { DropPod } from '../entities/droppod'
import { PirateShip, Flare } from '../entities/pirateship'
import { Meteor } from '../entities/meteor'
import { warKey, factionsHostile } from '../systems/factions'
import { mulberry32, range, irange, type Rng } from '../rng'
import { PAL } from '../palette'
import { sfx } from '../audio/sfx'

export const WORLD_W = 3600
export const ORE_QUOTA = 200 // the baseline; each world rolls its own quota
export const MIN_LAUNCH_FUEL = 40

export type Weather = 'clear' | 'wind' | 'rain' | 'hail' | 'storm'

// tiny stateless hash for precipitation streaks (rng must stay untouched)
function whash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export interface GrassTuft { x: number; eaten: boolean; regrowT: number }
export interface ResourceNode { x: number; taken: boolean }
export interface Tree { x: number; size: number; seed: number }
export interface Tent { x: number; alive: boolean }

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string }
interface Floater { x: number; y: number; text: string; t: number; color: string; size: number }

export class World {
  rng: Rng
  terrain: Terrain
  entities: Entity[] = []
  player!: Player
  lander!: Lander
  tufts: GrassTuft[] = []
  trees: Tree[] = []
  nodes: ResourceNode[] = []
  campX: number | null = null
  tents: Tent[] = []
  campfireAlive = true
  wars = new Set<string>()
  time = 0
  shake = 0

  // tutorial "simulated drop": friendlier stats, no leaderboard/analytics
  simulated = false
  mods = { dmgOut: 1, dmgIn: 1, mine: 1, fuelBurn: 1 }
  /** Nothing hunts the player (tutorial calm, until the scripted wave). */
  peaceful = false
  /** Global pirate grenade throttle so stacked pirates can't nade-spam. */
  pirateGrenadeCd = 0

  // per-contract conditions, rolled in worldgen
  quota = ORE_QUOTA
  weather: Weather = 'clear'
  windX = 0
  private strikeT = 8
  private bolts: { x: number; gy: number; t: number }[] = []

  // pirate raid state (triggered by player kills)
  private raidQueued = false
  private raidCountdown = -1
  private raidPirates = 0

  // native vengeance raids (triggered by player killing natives)
  private nativeRaidQueued = false
  private nativeRaidCountdown = -1
  private nativeRaidCount = 0
  nativesKilledByPlayer = 0

  // pirate loot economy: stolen ore (or a juicy full lander) summons the
  // deathsquad ship. One ship per arming; deploying a new extractor re-arms it.
  pirateShip: PirateShip | null = null
  squadBoarding = false
  pirateShipDestroyed = false
  pirateShipEscaped = 0
  shipEventArmed = true
  private shipCountdown = -1
  escapedInPirateShip = false
  flareFiredByPlayer = false

  // shoot down your own rescue while stranded and the planet responds
  meteorStorm = false
  private meteorT = 0
  private meteorStormT = 0 // the storm only escalates

  // multikill cam: set on 2+ player kills in a tight window, ticked by Game
  killCam: { x: number; y: number; count: number; t: number } | null = null
  private recentKills: { x: number; y: number; t: number }[] = []

  // running field profit/losses (kills, collateral). Ore+fuel added at docking.
  money = 0
  private inExplosion = false

  nativeHuntUntil = -1
  private nextHuntAt: number
  private nextRoamAt: number

  private particles: Particle[] = []
  private floaters: Floater[] = []

  constructor(seed: number) {
    this.rng = mulberry32(seed)
    this.terrain = new Terrain(WORLD_W, this.rng)
    this.nextHuntAt = range(this.rng, 100, 170)
    this.nextRoamAt = range(this.rng, 15, 30)
  }

  spawn(e: Entity) { this.entities.push(e) }

  declareWar(a: Faction, b: Faction) {
    if (!this.wars.has(warKey(a, b))) {
      this.wars.add(warKey(a, b))
      sfx.alarm()
    }
  }

  atWar(a: Faction, b: Faction): boolean { return factionsHostile(this.wars, a, b) }

  reportDamage(victim: Entity, src: Entity | null) {
    // war flags live in entity onDamaged hooks; here: combat feel
    if (victim === this.player) this.shake = Math.max(this.shake, 5)
    else if (src === this.player) this.shake = Math.max(this.shake, 2.4)
  }

  addMoney(delta: number, x?: number, y?: number) {
    this.money += delta
    if (x !== undefined && y !== undefined && delta !== 0) {
      this.addFloater(x, y, `${delta > 0 ? '+' : '-'}$${Math.abs(delta)}`, delta > 0 ? PAL.good : PAL.danger)
    }
  }

  reportKill(victim: Entity, src: Entity | null) {
    // corporate accounting: turret kills pay out (and cost) same as your own
    const playerSide = src !== null && (src === (this.player as Entity) || src.faction === 'player')
    if (playerSide) {
      let delta = 0
      if (victim.faction === 'pirate') delta = 100
      else if (victim.faction === 'native') delta = -10
      else if (victim.faction === 'passive') delta = -50
      else if (victim instanceof Animal && victim.kind === 'aggro') {
        // retaliation doesn't count: only animals that came at YOU are free
        delta = victim.huntingPlayerSide ? 0 : -20
      }
      if (delta !== 0) this.addMoney(delta, victim.x, victim.cy - 22)
    }

    // multikill cam: only the player's EXPLOSIVE kills — guns don't multikill
    if (src !== (this.player as Entity) || !this.inExplosion) return
    if (!['pirate', 'native', 'aggro', 'passive'].includes(victim.faction)) return
    this.recentKills = this.recentKills.filter((k) => this.time - k.t < 1.5)
    this.recentKills.push({ x: victim.x, y: victim.cy, t: this.time })
    const n = this.recentKills.length
    if (n === 2) {
      // doubles are routine: just a tag over the bodies, no cinema
      this.addFloater(victim.x, victim.cy - 36, 'DOUBLE KILL', PAL.danger, 14)
    } else if (n >= 3) {
      this.killCam = {
        x: victim.x, y: victim.cy, count: n,
        t: Math.max(this.killCam?.t ?? 0, 2.0),
      }
    }
  }

  onPirateKilled() {
    if (this.simulated) return // no revenge raids in the training sim
    if (this.raidQueued || this.raidPirates > 10) return
    this.raidQueued = true
    this.raidCountdown = range(this.rng, 16, 34)
  }

  onNativeKilled() {
    this.nativesKilledByPlayer++
    if (this.simulated) return
    if (this.nativeRaidQueued || this.nativeRaidCount > 12) return
    this.nativeRaidQueued = true
    this.nativeRaidCountdown = range(this.rng, 15, 25)
  }

  /** A pirate pocketed spilled ore: fire the flare, call in the deathsquad. */
  onOreLooted(byPirate: Entity) {
    this.triggerShipEvent(byPirate)
  }

  /** Summon the deathsquad ship (once per arming). flareFrom = who signals. */
  triggerShipEvent(flareFrom: Entity | null) {
    if (this.simulated) return // the sim schedules no surprises
    if (!this.shipEventArmed || this.pirateShip || this.shipCountdown > 0) return
    this.shipEventArmed = false
    if (flareFrom) this.spawn(new Flare(flareFrom.x, flareFrom.y - 24))
    else {
      this.addFloater(this.lander.x, this.lander.y - 90, 'PIRATE SIGNAL DETECTED', PAL.danger)
      sfx.alarm()
    }
    this.shipCountdown = range(this.rng, 6, 10)
  }

  /** Fresh extractors on the ground make the site worth hitting again. */
  rearmShipEvent() {
    if (!this.pirateShip && this.shipCountdown <= 0) this.shipEventArmed = true
  }

  get shipPending(): boolean { return this.shipCountdown > 0 }

  /** Stranded flare: summons the ship regardless of the armed flag. */
  summonShipForced() {
    if (this.simulated) return
    if (this.pirateShip || this.shipCountdown > 0) return
    this.shipEventArmed = false
    this.shipCountdown = range(this.rng, 4, 7)
    sfx.alarm()
  }

  /** No way home: dead lander, or launch gate unreachable with no fuel gen. */
  isStranded(): boolean {
    if (this.lander.flying) return false
    if (this.lander.dead) return true
    if (this.lander.fuel >= MIN_LAUNCH_FUEL) return false
    const hasGen =
      this.lander.inventory.some((i) => i.kind === 'fuelgen') ||
      this.player.carrying?.kind === 'fuelgen' ||
      this.entities.some((e) =>
        ((e instanceof Crate || e instanceof Building) && !e.dead && e.item.kind === 'fuelgen'))
    return !hasGen
  }

  findNearestEntity(x: number, y: number, maxDist: number, pred: (e: Entity) => boolean): Entity | null {
    let best: Entity | null = null
    let bestD = maxDist
    for (const e of this.entities) {
      if (!pred(e)) continue
      const d = dist(x, y, e.cx, e.cy)
      if (d < bestD) { bestD = d; best = e }
    }
    return best
  }

  /** What a friendly turret is allowed to shoot: hostiles only, never neutrals. */
  findTurretTarget(x: number, y: number, rangePx: number): Entity | null {
    return this.findNearestEntity(x, y, rangePx, (e) => {
      if (e.dead) return false
      if (e.faction === 'pirate') return true
      if (e.faction === 'native' && this.atWar('native', 'player')) return true
      if (e instanceof Animal && e.target && (e.target.faction === 'player')) return true
      return false
    })
  }

  explode(x: number, y: number, radius: number, dmg: number, src: Entity | null, opts: { craterDepth?: number; big?: boolean } = {}) {
    this.terrain.crater(x, radius * 0.75, opts.craterDepth ?? 14)
    const playerSide = src !== null && (src === (this.player as Entity) || src.faction === 'player')
    // flora and tents don't survive blasts
    for (const tent of this.tents) {
      if (tent.alive && Math.abs(tent.x - x) < radius + 14 && Math.abs(this.terrain.heightAt(tent.x) - y) < radius + 30) {
        tent.alive = false
        this.burst(tent.x, this.terrain.heightAt(tent.x) - 12, 12, PAL.native, 120)
        if (playerSide) this.addMoney(-100, tent.x, this.terrain.heightAt(tent.x) - 40)
      }
    }
    if (this.campfireAlive && this.campX !== null &&
        Math.abs(this.campX - x) < radius + 10 && Math.abs(this.terrain.heightAt(this.campX) - y) < radius + 30) {
      this.campfireAlive = false
      this.burst(this.campX, this.terrain.heightAt(this.campX) - 6, 10, PAL.warm, 110)
      if (playerSide) this.addMoney(-50, this.campX, this.terrain.heightAt(this.campX) - 30)
    }
    this.trees = this.trees.filter((tr) => {
      const hit = Math.abs(tr.x - x) < radius * 0.9 && Math.abs(this.terrain.heightAt(tr.x) - y) < radius + 40
      if (hit) this.burst(tr.x, this.terrain.heightAt(tr.x) - 20, 8, PAL.faint, 100)
      return !hit
    })
    for (const t of this.tufts) {
      if (!t.eaten && Math.abs(t.x - x) < radius) { t.eaten = true; t.regrowT = 60 + this.rng() * 60 }
    }
    this.inExplosion = true
    for (const e of this.entities) {
      if (e.dead || e instanceof Projectile || e instanceof DropPod) continue
      const d = dist(x, y, e.cx, e.cy)
      const reach = radius + e.w / 2
      if (d < reach) {
        e.damage(this, Math.max(6, dmg * (1 - d / reach)), src)
        const m = d || 1
        e.vx += ((e.cx - x) / m) * 190
        e.vy -= 130
      }
    }
    this.inExplosion = false
    this.burst(x, y, opts.big ? 30 : 16, PAL.warm, opts.big ? 260 : 170)
    this.burst(x, y, 8, PAL.dim, 90)
    this.shake = Math.max(this.shake, opts.big ? 10 : 6)
    if (opts.big) sfx.bigBoom(); else sfx.boom()
  }

  burst(x: number, y: number, n: number, color: string, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.3 + Math.random() * 0.7)
      const life = 0.3 + Math.random() * 0.45
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life, maxLife: life, color })
    }
  }

  addFloater(x: number, y: number, text: string, color: string = PAL.pale, size = 11) {
    this.floaters.push({ x, y, text, t: 1.6, color, size })
  }

  update(dt: number) {
    this.time += dt
    this.pirateGrenadeCd = Math.max(0, this.pirateGrenadeCd - dt)
    for (const e of this.entities) if (!e.dead) e.update(this, dt)
    this.entities = this.entities.filter((e) => !e.dead)

    for (const p of this.particles) {
      p.vy += 350 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    for (const f of this.floaters) { f.t -= dt; f.y -= 18 * dt }
    this.floaters = this.floaters.filter((f) => f.t > 0)

    for (const t of this.tufts) {
      if (t.eaten) {
        t.regrowT -= dt
        if (t.regrowT <= 0) t.eaten = false
      }
    }

    // raid countdown
    if (this.raidQueued && this.raidCountdown > 0) {
      this.raidCountdown -= dt
      if (this.raidCountdown <= 0) {
        this.spawnRaid()
        this.raidQueued = false
      }
    }

    // native vengeance countdown
    if (this.nativeRaidQueued && this.nativeRaidCountdown > 0) {
      this.nativeRaidCountdown -= dt
      if (this.nativeRaidCountdown <= 0) {
        this.spawnNativeRaid()
        this.nativeRaidQueued = false
      }
    }

    // deathsquad ship en route
    if (this.shipCountdown > 0) {
      this.shipCountdown -= dt
      if (this.shipCountdown <= 0) {
        let tx = WORLD_W / 2
        for (let tries = 0; tries < 24; tries++) {
          tx = range(this.rng, 150, WORLD_W - 150)
          if (Math.abs(tx - this.lander.x) > 350) break
        }
        this.pirateShip = new PirateShip(tx, this.terrain.heightAt(tx), irange(this.rng, 5, 10))
        this.spawn(this.pirateShip)
        sfx.alarm()
      }
    }
    if (this.pirateShip?.dead) this.pirateShip = null

    // meteor storm: closes in on the player, never lets up — and over the
    // next minute the sky loses its patience entirely, sending trackers
    if (this.meteorStorm) {
      this.meteorStormT += dt
      this.meteorT -= dt
      if (this.meteorT <= 0) {
        const heat = Math.min(1, this.meteorStormT / 60)
        this.meteorT = range(this.rng, 0.35, 0.9) * (1 - 0.85 * heat)
        const tx = Math.max(40, Math.min(WORLD_W - 40, this.player.x + range(this.rng, -1, 1) * 340))
        const m = new Meteor(tx, this.terrain.heightAt(tx))
        if (this.rng() < 0.12 + 0.5 * heat) m.homing = true
        this.spawn(m)
      }
    }

    // thunderstorms strike things; trees are natural lightning rods
    if (this.weather === 'storm') {
      this.strikeT -= dt
      if (this.strikeT <= 0) {
        this.strikeT = range(this.rng, 6, 14)
        this.lightningStrike()
      }
    }
    for (const b of this.bolts) b.t -= dt
    this.bolts = this.bolts.filter((b) => b.t > 0)

    // periodic faction-wide native hunt (not in the sim: minimal stimulation)
    if (this.time > this.nextHuntAt && !this.simulated) {
      this.nativeHuntUntil = this.time + 22
      this.nextHuntAt = this.time + range(this.rng, 120, 200)
    }

    // animals roam in from the map edges
    if (this.time > this.nextRoamAt && !this.simulated) {
      this.nextRoamAt = this.time + range(this.rng, 15, 32)
      const count = this.entities.filter((e) => e instanceof Animal).length
      if (count < 9) {
        const a = new Animal(this.rng() < 0.5 ? 20 : WORLD_W - 20, this.rng() < 0.7 ? 'passive' : 'aggro')
        a.y = this.terrain.heightAt(a.x) - 4
        this.spawn(a)
      }
    }

    this.shake = Math.max(0, this.shake - dt * 22)
  }

  /** Storm strike: mostly scenery, occasionally an upgrade nobody asked for. */
  private lightningStrike() {
    interface Mark { x: number; hit: () => void }
    const marks: Mark[] = []
    const addN = (n: number, m: Mark) => { for (let i = 0; i < n; i++) marks.push(m) }
    for (const tr of this.trees) {
      addN(3, { x: tr.x, hit: () => {
        this.trees = this.trees.filter((t2) => t2 !== tr)
        this.burst(tr.x, this.terrain.heightAt(tr.x) - 20, 14, PAL.warm, 140)
      } })
    }
    for (const e of this.entities) {
      if (e.dead) continue
      if (e instanceof Building) {
        addN(1, { x: e.x, hit: () => {
          if (e.item.kind === 'turret' && !e.turbo) {
            e.turbo = true
            this.addFloater(e.x, e.cy - 26, 'TURBO TURRET', PAL.accent)
          } else e.damage(this, 35, null)
        } })
      } else if (e instanceof Drone) {
        addN(1, { x: e.x, hit: () => {
          if (!e.turbo) {
            e.turbo = true
            this.addFloater(e.x, e.y - 18, 'TURBO DRONE', PAL.accent)
          } else e.damage(this, 25, null)
        } })
      } else if (e === (this.player as Entity) && !this.player.inLander) {
        addN(1, { x: e.x, hit: () => e.damage(this, 25, null) })
      }
    }
    addN(6, { x: range(this.rng, 60, WORLD_W - 60), hit: () => { /* empty ground */ } })
    const m = marks[irange(this.rng, 0, marks.length - 1)]
    const gy = this.terrain.heightAt(m.x)
    this.bolts.push({ x: m.x, gy, t: 0.28 })
    this.burst(m.x, gy - 6, 12, PAL.accent, 150)
    this.shake = Math.max(this.shake, 6)
    sfx.thunder()
    m.hit()
  }

  private spawnRaid() {
    const total = irange(this.rng, 3, 5)
    const podCount = total >= 4 && this.rng() < 0.7 ? 2 : 1
    const per = Math.ceil(total / podCount)
    let remaining = total
    for (let i = 0; i < podCount; i++) {
      const n = Math.min(per, remaining)
      remaining -= n
      let tx = WORLD_W / 2
      for (let tries = 0; tries < 24; tries++) {
        tx = range(this.rng, 100, WORLD_W - 100)
        if (Math.abs(tx - this.lander.x) > 280) break // never on the lander
      }
      // the 5% pod: pirate targeting computers occasionally pick a warm body
      if (this.rng() < 0.05) {
        const beings = this.entities.filter((e) =>
          !e.dead && e.faction !== 'pirate' && e !== (this.player as Entity) &&
          (e.faction === 'native' || e.faction === 'passive' || e.faction === 'aggro') &&
          Math.abs(e.x - this.lander.x) > 280)
        const mark = beings[irange(this.rng, 0, beings.length - 1)]
        if (mark) tx = mark.x
      }
      const pod = new DropPod(tx, this.terrain.heightAt(tx), n, range(this.rng, -1, 1) * 200)
      this.spawn(pod)
      this.raidPirates += n
    }
    sfx.alarm()
  }

  /** 5-7 vengeful natives walk in from the map edges, in up to two groups. */
  private spawnNativeRaid() {
    const total = irange(this.rng, 5, 7)
    const twoGroups = total >= 4
    for (let i = 0; i < total; i++) {
      const side = twoGroups ? (i % 2 === 0 ? 0 : 1) : this.rng() < 0.5 ? 0 : 1
      const x = side === 0 ? 24 + i * 6 : WORLD_W - 24 - i * 6
      const n = new Native(x, this.campX ?? WORLD_W / 2, true)
      n.y = this.terrain.heightAt(n.x) - 4
      this.spawn(n)
      this.nativeRaidCount++
    }
    sfx.alarm()
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number) {
    // background props first
    for (const tr of this.trees) {
      if (tr.x < camX - 60 || tr.x > camX + viewW + 60) continue
      this.drawTree(ctx, tr, camX, camY)
    }
    if (this.campX !== null) this.drawCamp(ctx, camX, camY)
    for (const nd of this.nodes) {
      if (nd.x < camX - 60 || nd.x > camX + viewW + 60) continue
      this.drawNode(ctx, nd, camX, camY)
    }
    for (const t of this.tufts) {
      if (t.x < camX - 20 || t.x > camX + viewW + 20) continue
      this.drawTuft(ctx, t, camX, camY)
    }

    for (const e of this.entities) e.draw(ctx, camX, camY, this)

    ctx.save()
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - camX - 1.5, p.y - camY - 1.5, 3, 3)
    }
    ctx.restore()

    // incoming droppod/meteor warnings while above the view
    for (const e of this.entities) {
      if ((e instanceof DropPod || e instanceof Meteor) && e.y < camY - 10) {
        const sx = e.x + e.vx * ((camY - e.y) / e.vy) - camX
        ctx.fillStyle = PAL.danger
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 10)
        ctx.beginPath()
        ctx.moveTo(sx - 7, 14); ctx.lineTo(sx + 7, 14); ctx.lineTo(sx, 26)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // precipitation (screen-space streaks; deterministic, rng untouched)
    if (this.weather === 'rain' || this.weather === 'hail' || this.weather === 'storm') {
      ctx.save()
      const hail = this.weather === 'hail'
      ctx.strokeStyle = PAL.accent
      ctx.fillStyle = PAL.white
      ctx.globalAlpha = hail ? 0.5 : 0.3
      ctx.lineWidth = 1
      const fall = hail ? 500 : 660
      for (let i = 0; i < 70; i++) {
        const px = (((whash(i) * 4200 + this.time * this.windX * 1.5) % viewW) + viewW) % viewW
        const py = (((whash(i + 99) * 2600 + this.time * fall) % viewH) + viewH) % viewH
        if (hail) ctx.fillRect(px - 1, py - 1, 2.5, 2.5)
        else {
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px - this.windX * 0.03, py - 9)
          ctx.stroke()
        }
      }
      ctx.restore()
    } else if (this.weather === 'wind') {
      ctx.save()
      ctx.strokeStyle = PAL.dim
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 1
      for (let i = 0; i < 16; i++) {
        const px = (((whash(i) * 3800 + this.time * this.windX * 4) % viewW) + viewW) % viewW
        const py = whash(i + 7) * viewH
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px - Math.sign(this.windX) * 12, py)
        ctx.stroke()
      }
      ctx.restore()
    }

    // lightning bolts + sky flash
    for (const b of this.bolts) {
      const a = b.t / 0.28
      ctx.save()
      ctx.strokeStyle = PAL.white
      ctx.globalAlpha = a
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(b.x - camX + (Math.random() - 0.5) * 8, 0)
      for (let y = camY + 50; y < b.gy - 30; y += 46) {
        ctx.lineTo(b.x - camX + (Math.random() - 0.5) * 34, y - camY)
      }
      ctx.lineTo(b.x - camX, b.gy - camY)
      ctx.stroke()
      ctx.globalAlpha = a * 0.15
      ctx.fillStyle = PAL.white
      ctx.fillRect(0, 0, viewW, viewH)
      ctx.restore()
    }

    ctx.textAlign = 'center'
    for (const f of this.floaters) {
      ctx.font = `${f.size}px "Courier New", monospace`
      ctx.globalAlpha = Math.min(1, f.t)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, f.x - camX, f.y - camY)
    }
    ctx.globalAlpha = 1
  }

  private drawTree(ctx: CanvasRenderingContext2D, tr: Tree, camX: number, camY: number) {
    const gy = this.terrain.heightAt(tr.x)
    const sx = tr.x - camX, sy = gy - camY
    const h = 34 * tr.size
    ctx.strokeStyle = PAL.faint
    ctx.fillStyle = PAL.faint
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx, sy - h)
    ctx.stroke()
    // thin sci-fi canopy: stacked slanted lines (interstellaria-ish)
    for (let i = 0; i < 3; i++) {
      const ly = sy - h + i * 7 * tr.size
      const lw = (16 - i * 4) * tr.size
      const tilt = Math.sin(tr.seed * 9 + i) * 3
      ctx.beginPath()
      ctx.moveTo(sx - lw, ly + tilt)
      ctx.lineTo(sx + lw, ly - tilt)
      ctx.stroke()
    }
  }

  private drawTuft(ctx: CanvasRenderingContext2D, t: GrassTuft, camX: number, camY: number) {
    const gy = this.terrain.heightAt(t.x)
    const sx = t.x - camX, sy = gy - camY
    ctx.strokeStyle = PAL.good
    ctx.globalAlpha = t.eaten ? 0.25 : 0.8
    ctx.lineWidth = 1.5
    const h = t.eaten ? 2 : 6
    ctx.beginPath()
    ctx.moveTo(sx - 3, sy); ctx.lineTo(sx - 4, sy - h)
    ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - h - 2)
    ctx.moveTo(sx + 3, sy); ctx.lineTo(sx + 4, sy - h)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  private drawNode(ctx: CanvasRenderingContext2D, nd: ResourceNode, camX: number, camY: number) {
    const gy = this.terrain.heightAt(nd.x)
    const sx = nd.x - camX, sy = gy - camY
    ctx.fillStyle = PAL.terrainDeep
    ctx.beginPath()
    ctx.moveTo(sx - 20, sy + 2)
    ctx.quadraticCurveTo(sx, sy - 14, sx + 20, sy + 2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = PAL.dim
    ctx.lineWidth = 1.5
    ctx.stroke()
    // ore glints
    ctx.fillStyle = PAL.good
    ctx.fillRect(sx - 8, sy - 4, 3, 3)
    ctx.fillRect(sx + 2, sy - 8, 3, 3)
    ctx.fillRect(sx + 9, sy - 3, 3, 3)
  }

  private drawCamp(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const cx = this.campX!
    for (const tent of this.tents) {
      if (!tent.alive) continue
      const gy = this.terrain.heightAt(tent.x)
      const sx = tent.x - camX, sy = gy - camY
      ctx.fillStyle = PAL.faint
      ctx.strokeStyle = PAL.native
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sx - 18, sy)
      ctx.lineTo(sx, sy - 24)
      ctx.lineTo(sx + 18, sy)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    // campfire (until someone grenades it)
    if (!this.campfireAlive) return
    const gy = this.terrain.heightAt(cx)
    const sx = cx - camX, sy = gy - camY
    ctx.strokeStyle = PAL.dim
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy - 3)
    ctx.moveTo(sx + 6, sy); ctx.lineTo(sx - 6, sy - 3)
    ctx.stroke()
    const f = 6 + Math.sin(this.time * 9) * 2
    ctx.fillStyle = PAL.warm
    ctx.beginPath()
    ctx.moveTo(sx - 4, sy - 3)
    ctx.lineTo(sx + 4, sy - 3)
    ctx.lineTo(sx, sy - 3 - f)
    ctx.closePath()
    ctx.fill()
  }
}
