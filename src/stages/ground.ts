import type { Game, Stage } from '../game'
import type { World } from '../world/world'
import { PAL } from '../palette'
import { VIEW_W, VIEW_H, drawSky, text, textSegments, drawKeyHint } from '../render'
import { drawHpPips, promptAt } from '../ui/hud'
import { clamp } from '../entities/entity'
import { Crate, Building, ITEM_NAMES, BUILD_HOLD, DECON_HOLD, type CrateItem } from '../entities/buildings'
import { Drone } from '../entities/drone'
import { Pirate } from '../entities/pirate'
import { Flare } from '../entities/pirateship'
import { FlarePickup } from '../entities/loot'
import { WORLD_W, ORE_QUOTA, MIN_LAUNCH_FUEL } from '../world/world'
import { sfx } from '../audio/sfx'

const GROUND_LEVEL = 1560
const SLOT = 36

type Deconstructable = Building | Drone

// Everything E could act on. V cycles focus when several overlap, so the
// lander's menu never traps a crate/flare/building interaction.
type FocusKind = 'flare' | 'crate' | 'decon' | 'ship' | 'lander'
interface Focusable { kind: FocusKind; e: import('../entities/entity').Entity | null }

// Starbound-lite on foot: fill the quota (or don't — HQ will have opinions),
// keep the lander alive, get out.
export class GroundStage implements Stage {
  readonly name = 'ground'
  private selIdx = 0
  private lastMx = -1
  private lastMy = -1
  private bHold = 0
  private heldTarget: Deconstructable | null = null
  private zoom = 0.55 // eases in from flight zoom
  private focusables: Focusable[] = []
  private focusIdx = 0
  private lastFocusSig = ''

  constructor(private game: Game) {}

  private get focus(): Focusable | null {
    return this.focusables[this.focusIdx] ?? null
  }

  /** Gather nearby interactables; the lander menu deliberately goes LAST. */
  private computeFocus(w: World) {
    const { player, lander } = w
    const list: Focusable[] = []
    if (!player.dead && !player.carrying) {
      const flare = w.findNearestEntity(player.x, player.cy, 44, (e) => e instanceof FlarePickup && !e.dead)
      if (flare) list.push({ kind: 'flare', e: flare })
      const crate = w.findNearestEntity(player.x, player.cy, 44, (e) => e instanceof Crate && !e.dead)
      if (crate) list.push({ kind: 'crate', e: crate })
      const decon = w.findNearestEntity(player.x, player.cy, 56, (e) =>
        (e instanceof Building || e instanceof Drone) && !e.dead)
      if (decon) list.push({ kind: 'decon', e: decon })
      if (this.shipStealable(w) && Math.abs(player.x - w.pirateShip!.x) < 70) list.push({ kind: 'ship', e: w.pirateShip })
      if (Math.abs(player.x - lander.x) < 76 && Math.abs(player.y - lander.y) < 70) list.push({ kind: 'lander', e: null })
    }
    const sig = list.map((f) => f.kind).join(',')
    if (sig !== this.lastFocusSig) { this.lastFocusSig = sig; this.focusIdx = 0 }
    if (this.game.input.wasPressed('KeyV') && list.length > 1) {
      this.focusIdx = (this.focusIdx + 1) % list.length
      sfx.blip()
    }
    if (this.focusIdx >= list.length) this.focusIdx = 0
    this.focusables = list
  }

  private camXS = -1 // smoothed camera, so killcam pans instead of teleporting
  private camYS = -1

  enter() {
    const w = this.game.world!
    if (w.player.inLander) {
      w.player.inLander = false
      w.player.x = w.lander.x + 36
      w.player.y = w.terrain.heightAt(w.lander.x + 36) - 1
      w.player.vx = 0; w.player.vy = 0
    }
  }

  private view(w: World) {
    const vw = VIEW_W / this.zoom, vh = VIEW_H / this.zoom
    return { vw, vh, camX: this.camXS, camY: this.camYS }
  }

  /** Ease the camera toward its focus (player, or the killcam point). */
  private updateCamera(w: World, dt: number) {
    const vw = VIEW_W / this.zoom, vh = VIEW_H / this.zoom
    const kc = w.killCam
    const fx = kc ? kc.x : w.player.x
    const fy = kc ? kc.y : w.player.y
    const tx = clamp(fx - vw / 2, 0, WORLD_W - vw)
    const ty = clamp(fy - vh * (kc ? 0.5 : 0.61), 0, 1820 - vh)
    if (this.camXS < 0) { this.camXS = tx; this.camYS = ty; return }
    const k = Math.min(1, dt * 6)
    this.camXS += (tx - this.camXS) * k
    this.camYS += (ty - this.camYS) * k
  }

  update(dt: number) {
    const w = this.game.world!
    const kc = w.killCam
    // kill cam (triples and up): slow the sim, glide the zoom in, ease back
    this.zoom += ((kc ? 2.1 : 1) - this.zoom) * Math.min(1, dt * (kc ? 5 : 3))
    this.updateCamera(w, dt) // real dt: the camera itself is never in slow-mo
    dt *= kc ? 0.25 : 1
    const { player, lander } = w
    const input = this.game.input

    const { camX, camY } = this.view(w)
    const aimX = camX + input.mouseX / this.zoom
    const aimY = camY + input.mouseY / this.zoom

    const nearLander = Math.abs(player.x - lander.x) < 76 && Math.abs(player.y - lander.y) < 70
    this.computeFocus(w)
    const menuOpen = this.focus?.kind === 'lander'
    const slots = this.slotRects(w)
    const menuHover = menuOpen && slots.some((r) => this.mouseIn(r))

    if (!player.dead) {
      player.control(w, dt, input, aimX, aimY, !menuHover)
      this.handleInteractions(w, dt, menuOpen, slots)
    }

    // a full cargo bay next to a warm lander is exactly what pirates wait for
    if (nearLander && lander.ore >= ORE_QUOTA) w.triggerShipEvent(null)

    w.update(dt)

    if (player.dead) {
      // dying under the meteor storm isn't a game over — it's a rude awakening
      if (w.meteorStorm) this.game.wakeFromDream()
      else this.game.terminate('EXTRACTOR DOWN')
    } else if (lander.dead && !w.meteorStorm) {
      // during the storm the lander is already forfeit; play to the bitter end
      this.game.terminate('LANDER DESTROYED')
    }
  }

  private handleInteractions(w: World, dt: number, menuOpen: boolean, slots: DOMRect[]) {
    const { player, lander } = w
    const input = this.game.input
    const focus = this.focus

    // ---- E acts on the FOCUSED interactable (V switches focus) ----
    const shipDock = w.pirateShip && !w.pirateShip.dead && w.pirateShip.state === 'landed' &&
      Math.abs(player.x - w.pirateShip.x) < 76
    if (player.carrying && Math.abs(player.x - lander.x) < 76) {
      if (input.wasPressed('KeyE')) this.storeCrate(w, player.carrying)
    } else if (player.carrying && shipDock && input.wasPressed('KeyE')) {
      // ferrying gear onto your soon-to-be ship: it escapes with you
      w.pirateShip!.stowed.push(player.carrying)
      w.addFloater(w.pirateShip!.x, w.pirateShip!.y - 56, 'CRATE STOWED', PAL.good)
      player.carrying = null
      sfx.pickup()
    } else if (focus?.kind === 'flare' && input.wasPressed('KeyE')) {
      focus.e!.dead = true
      w.spawn(new Flare(player.x, player.y - 24))
      w.flareFiredByPlayer = true
      w.summonShipForced()
      w.addFloater(player.x, player.cy - 30, 'FLARE FIRED', PAL.danger)
      return
    } else if (focus?.kind === 'ship' && input.wasPressed('KeyE')) {
      w.escapedInPirateShip = true
      // cargo in stowed drill/drone crates comes home as ore
      for (const it of w.pirateShip!.stowed) {
        if ((it.kind === 'drill' || it.kind === 'drone') && it.fill > 0) {
          lander.ore += it.fill // the "cargo you hold" bucket, lander or not
          it.fill = 0
        }
      }
      player.inLander = true
      sfx.launch()
      this.game.gotoDocking()
      return
    } else if (focus?.kind === 'crate' && input.wasPressed('KeyE')) {
      player.carrying = (focus.e as Crate).item
      focus.e!.dead = true
      sfx.pickup()
    } else if (focus?.kind === 'decon' && input.isDown('KeyE')) {
      const decon = focus.e as Deconstructable
      if (this.heldTarget !== decon) { if (this.heldTarget) this.heldTarget.deconstructT = 0; this.heldTarget = decon }
      decon.deconstructT += dt
      if (decon.deconstructT >= DECON_HOLD) this.deconstruct(w, decon)
    } else {
      if (this.heldTarget) { this.heldTarget.deconstructT = 0; this.heldTarget = null }
      if (menuOpen) {
        const count = lander.inventory.length + 1
        // ONE selection cursor: moving the mouse over a slot claims it,
        // Q/E move it from the keyboard — no flip-flopping between the two
        const mouseMoved = input.mouseX !== this.lastMx || input.mouseY !== this.lastMy
        const hover = slots.findIndex((r) => this.mouseIn(r))
        if (hover >= 0 && mouseMoved) this.selIdx = hover
        if (input.wasPressed('KeyE')) { this.selIdx = (this.selIdx + 1) % count; sfx.blip() }
        if (input.wasPressed('KeyQ')) { this.selIdx = (this.selIdx + count - 1) % count; sfx.blip() }
        if (input.wasPressed('KeyF')) this.activateSlot(w, this.selIdx)
        if (input.mousePressed && hover >= 0) { this.selIdx = hover; this.activateSlot(w, hover) }
        this.selIdx = Math.min(this.selIdx, count - 1)
      }
      this.lastMx = input.mouseX
      this.lastMy = input.mouseY
    }

    // ---- Z (hold, near lander): vent ore to shed launch weight ----
    if (input.isDown('KeyZ') && Math.abs(player.x - lander.x) < 90 && lander.ore > 0) {
      lander.ore = Math.max(0, lander.ore - 35 * dt)
      w.burst(lander.x, lander.y - 8, 1, PAL.good, 60)
    }

    // ---- Q: drop the crate ----
    if (player.carrying && input.wasPressed('KeyQ')) {
      const c = new Crate(player.x + player.facing * 16, player.y - 6, player.carrying)
      c.vy = -60
      w.spawn(c)
      player.carrying = null
      sfx.drop()
    }

    // ---- B (hold): build ----
    if (player.carrying) {
      const item = player.carrying
      const node = item.kind === 'drill'
        ? w.nodes.find((n) => !n.taken && Math.abs(n.x - player.x) < 48) ?? null
        : null
      const valid = item.kind !== 'drill' || node !== null
      if (input.wasPressed('KeyB') && !valid) {
        w.addFloater(player.x, player.cy - 24, 'NEEDS AN ORE NODE', PAL.danger)
        sfx.deny()
      }
      if (input.isDown('KeyB') && valid) {
        this.bHold += dt
        if (this.bHold >= BUILD_HOLD) {
          if (item.kind === 'drone') {
            const d = new Drone(player.x, player.y - 40)
            w.spawn(d)
          } else {
            const x = node ? node.x : player.x
            w.terrain.flatten(x, 14)
            const b = new Building(x, item, node)
            b.y = w.terrain.heightAt(x)
            if (node) { node.taken = true; w.rearmShipEvent() } // fresh loot re-arms the deathsquad
            w.spawn(b)
            w.burst(x, b.y - 10, 10, PAL.accent, 90)
          }
          player.carrying = null
          this.bHold = 0
          sfx.build()
        }
      } else {
        this.bHold = 0
      }
    } else {
      this.bHold = 0
    }
  }

  private storeCrate(w: World, item: CrateItem) {
    const { lander, player } = w
    const fill = Math.round(item.fill)
    if ((item.kind === 'drill' || item.kind === 'drone') && fill > 0) {
      lander.ore += fill
      w.addFloater(lander.x, lander.y - 60, `+${fill} ORE`, PAL.good)
    } else if (item.kind === 'fuelgen' && fill > 0) {
      const added = Math.min(fill, 100 - Math.round(lander.fuel))
      lander.fuel = Math.min(100, lander.fuel + fill)
      w.addFloater(lander.x, lander.y - 60, `+${added} FUEL`, PAL.warm)
    }
    item.fill = 0
    lander.inventory.push(item)
    player.carrying = null
    sfx.pickup()
  }

  private deconstruct(w: World, target: Deconstructable) {
    target.dead = true // direct removal: no explosion, progress is preserved
    let item: CrateItem
    if (target instanceof Building) {
      if (target.node) target.node.taken = false
      item = target.item
    } else {
      item = { kind: 'drone', fill: target.carrying }
    }
    const c = new Crate(target.x, w.terrain.heightAt(target.x) - 2, item)
    w.spawn(c)
    w.burst(target.x, target.cy, 8, PAL.dim, 70)
    this.heldTarget = null
    sfx.build()
  }

  private activateSlot(w: World, i: number) {
    const { lander, player } = w
    if (i < lander.inventory.length) {
      const item = lander.inventory[i]
      if (item.kind === 'medikit') {
        if (player.hp >= player.maxHp) {
          w.addFloater(lander.x, lander.y - 78, 'HP ALREADY FULL', PAL.dim)
          sfx.deny()
          return
        }
        player.hp = player.maxHp
        lander.inventory.splice(i, 1)
        w.addFloater(player.x, player.cy - 26, 'FULL HP', PAL.good)
        sfx.pickup()
      } else {
        player.carrying = lander.inventory.splice(i, 1)[0]
        sfx.pickup()
      }
      this.selIdx = Math.max(0, Math.min(this.selIdx, lander.inventory.length))
      return
    }
    // LAUNCH slot: leave whenever you like — HQ grades the cargo bay, not you
    const needFuel = Math.max(0, MIN_LAUNCH_FUEL - Math.round(lander.fuel))
    if (needFuel > 0) {
      w.addFloater(lander.x, lander.y - 78, `NEED ${needFuel} MORE FUEL`, PAL.danger)
      sfx.deny()
      return
    }
    player.inLander = true
    lander.flying = true
    this.game.gotoAscent()
  }

  private slotRects(w: World): DOMRect[] {
    const { lander } = w
    const { camX, camY } = this.view(w)
    const count = lander.inventory.length + 1
    const totalW = count * SLOT + (count - 1) * 4
    const cx = (lander.x - camX) * this.zoom
    const x0 = clamp(cx - totalW / 2, 8, VIEW_W - totalW - 8)
    const y = (lander.y - camY) * this.zoom - 118
    const rects: DOMRect[] = []
    for (let i = 0; i < count; i++) rects.push(new DOMRect(x0 + i * (SLOT + 4), y, SLOT, SLOT))
    return rects
  }

  /** Landed pirate ship with a fully dead crew = the player's new ride. */
  private shipStealable(w: World): boolean {
    const ship = w.pirateShip
    if (!ship || ship.dead || ship.state !== 'landed') return false
    return !w.entities.some((e) => e instanceof Pirate && !e.dead && Math.abs(e.x - ship.x) < 450)
  }

  private mouseIn(r: DOMRect): boolean {
    const { mouseX, mouseY } = this.game.input
    return mouseX >= r.x && mouseX <= r.x + r.width && mouseY >= r.y && mouseY <= r.y + r.height
  }

  draw(ctx: CanvasRenderingContext2D) {
    const w = this.game.world!
    const { player } = w
    const { vw, vh, camX: baseCamX, camY: baseCamY } = this.view(w)
    const camX = baseCamX + (Math.random() - 0.5) * w.shake
    const camY = baseCamY + (Math.random() - 0.5) * w.shake

    ctx.save()
    ctx.scale(this.zoom, this.zoom)
    drawSky(ctx, camY, GROUND_LEVEL, vw, vh)
    w.terrain.draw(ctx, camX, camY, vw, vh)
    w.draw(ctx, camX, camY, vw, vh)

    // grenade arc preview while cooking
    if (player.gAiming && !player.dead) {
      const { vx, vy } = player.throwVelocity()
      let px = player.gunX, py = player.gunY, pvx = vx, pvy = vy
      ctx.fillStyle = PAL.accent
      for (let i = 0; i < 26; i++) {
        pvy += 900 * 0.045
        px += pvx * 0.045
        py += pvy * 0.045
        if (py > w.terrain.heightAt(px)) break
        if (i % 2 === 0) ctx.fillRect(px - camX - 1.5, py - camY - 1.5, 3, 3)
      }
    }

    // build progress ring over the player
    if (this.bHold > 0) {
      ctx.strokeStyle = PAL.accent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(player.x - camX, player.cy - camY, 17, -Math.PI / 2, -Math.PI / 2 + (this.bHold / BUILD_HOLD) * Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()

    this.drawPromptsAndMenu(ctx, w, baseCamX, baseCamY)
    this.drawHud(ctx, w)
  }

  private toScreen(wx: number, wy: number, camX: number, camY: number): [number, number] {
    return [(wx - camX) * this.zoom, (wy - camY) * this.zoom]
  }

  /** World -> screen with the current camera; used by tutorial pointers. */
  screenPoint(wx: number, wy: number): [number, number] {
    return this.toScreen(wx, wy, this.camXS, this.camYS)
  }

  private drawPromptsAndMenu(ctx: CanvasRenderingContext2D, w: World, camX: number, camY: number) {
    const { player, lander } = w
    const nearLander = Math.abs(player.x - lander.x) < 76 && Math.abs(player.y - lander.y) < 70

    if (player.carrying) {
      if (nearLander) promptAt(ctx, ...this.toScreen(lander.x, lander.y - 96, camX, camY), 'E — STORE CRATE')
      const ship = w.pirateShip
      if (ship && !ship.dead && ship.state === 'landed' && Math.abs(player.x - ship.x) < 76) {
        promptAt(ctx, ...this.toScreen(ship.x, ship.y - 56, camX, camY), 'E — STOW CRATE')
      }
      drawKeyHint(ctx, '[Q] DROP · HOLD [B] BUILD', VIEW_W / 2, 524)
    } else {
      // one prompt: whatever E is focused on (V cycles when things overlap)
      const focus = this.focus
      // the V hint rides directly under whatever prompt it applies to —
      // parked at the bottom of the screen nobody ever saw it
      const vHint = this.focusables.length > 1
        ? `[V] SWITCH TARGET (${this.focusIdx + 1}/${this.focusables.length})`
        : null
      if (focus && focus.e) {
        const e = focus.e
        const label =
          focus.kind === 'flare' ? 'E — FIRE FLARE' :
          focus.kind === 'crate' ? 'E — PICK UP' :
          focus.kind === 'ship' ? 'E — ESCAPE TO ORBIT' :
          'HOLD E — DECONSTRUCT'
        const [px2, py2] = this.toScreen(e.x, e.y - e.h - 14, camX, camY)
        promptAt(ctx, px2, py2, label)
        if (vHint) drawKeyHint(ctx, vHint, px2, py2 + 15, 9)
      }
      if (focus?.kind !== 'lander') drawKeyHint(ctx, '[CLICK] SHOOT · [G] GRENADE · [SPACE] JUMP · [SHIFT] SPRINT', VIEW_W / 2, 524)
    }

    // landed pirate ship off-screen: time-critical, point the way
    const ship = w.pirateShip
    if (ship && !ship.dead && ship.state === 'landed') {
      const [shipSx] = this.toScreen(ship.x, ship.y - 20, camX, camY)
      if ((shipSx < -10 || shipSx > VIEW_W + 10) && Math.sin(w.time * 6) > -0.4) {
        const left = shipSx < 0
        const ex = left ? 26 : VIEW_W - 26
        ctx.fillStyle = PAL.danger
        ctx.beginPath()
        ctx.moveTo(ex + (left ? -12 : 12), 300)
        ctx.lineTo(ex + (left ? 4 : -4), 291)
        ctx.lineTo(ex + (left ? 4 : -4), 309)
        ctx.closePath()
        ctx.fill()
        text(ctx, 'PIRATE SHIP', ex + (left ? 10 : -10), 322, { size: 9, color: PAL.danger, align: left ? 'left' : 'right' })
      }
    }

    // lander item menu — only when the lander itself is the focused target
    if (this.focus?.kind === 'lander' && !player.carrying && !player.dead) {
      const slots = this.slotRects(w)
      const inv = lander.inventory
      // selIdx is the single source of truth (mouse hover feeds it in update)
      for (let i = 0; i < slots.length; i++) {
        const r = slots[i]
        const selected = i === this.selIdx
        ctx.fillStyle = 'rgba(6,8,13,0.85)'
        ctx.fillRect(r.x, r.y, r.width, r.height)
        ctx.strokeStyle = selected ? PAL.accent : PAL.dim
        ctx.lineWidth = selected ? 2 : 1
        ctx.strokeRect(r.x, r.y, r.width, r.height)
        const cx = r.x + r.width / 2
        if (i < inv.length) {
          this.drawItemIcon(ctx, inv[i], cx, r.y + r.height / 2)
          if (selected) text(ctx, ITEM_NAMES[inv[i].kind], cx, r.y - 6, { size: 10, color: PAL.accent })
        } else {
          const ready = lander.fuel >= MIN_LAUNCH_FUEL
          const quotaMet = lander.ore >= ORE_QUOTA
          ctx.fillStyle = ready ? (quotaMet ? PAL.good : PAL.warm) : PAL.dim
          ctx.beginPath()
          ctx.moveTo(cx - 8, r.y + 24)
          ctx.lineTo(cx + 8, r.y + 24)
          ctx.lineTo(cx, r.y + 10)
          ctx.closePath()
          ctx.fill()
          if (selected) {
            const color = ready ? (quotaMet ? PAL.good : PAL.warm) : PAL.dim
            const sub = !ready ? '(NO FUEL)' : quotaMet ? null : '(QUOTA SHORT)'
            text(ctx, 'BOARD & LAUNCH', cx, r.y - (sub ? 17 : 6), { size: 10, color })
            if (sub) text(ctx, sub, cx, r.y - 6, { size: 9, color })
          }
        }
      }
      const r0 = slots[0]
      const hx = r0.x + (slots.length * (SLOT + 4)) / 2
      drawKeyHint(ctx, '[Q]/[E] SELECT · [F] OR [CLICK] USE', hx, r0.y + SLOT + 14, 9)
      if (this.focusables.length > 1) {
        drawKeyHint(ctx, `[V] SWITCH TARGET (${this.focusIdx + 1}/${this.focusables.length})`, hx, r0.y + SLOT + 27, 9)
      }
    }
  }

  private drawItemIcon(ctx: CanvasRenderingContext2D, item: CrateItem, cx: number, cy: number) {
    ctx.strokeStyle = PAL.pale
    ctx.fillStyle = PAL.faint
    ctx.lineWidth = 1.5
    if (item.kind === 'fuelgen') {
      ctx.fillRect(cx - 7, cy - 8, 14, 16)
      ctx.strokeRect(cx - 7, cy - 8, 14, 16)
      ctx.fillStyle = PAL.warm
      ctx.fillRect(cx - 3, cy - 4, 6, 8)
    } else if (item.kind === 'drill') {
      ctx.fillRect(cx - 7, cy - 4, 14, 12)
      ctx.strokeRect(cx - 7, cy - 4, 14, 12)
      ctx.beginPath()
      ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx, cy - 12); ctx.lineTo(cx + 4, cy - 4)
      ctx.stroke()
      ctx.fillStyle = PAL.good
      ctx.fillRect(cx - 2, cy - 1, 4, 4)
    } else if (item.kind === 'turret') {
      ctx.fillRect(cx - 6, cy, 12, 8)
      ctx.strokeRect(cx - 6, cy, 12, 8)
      ctx.beginPath()
      ctx.arc(cx, cy - 2, 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy - 2); ctx.lineTo(cx + 8, cy - 8)
      ctx.stroke()
    } else if (item.kind === 'medikit') {
      ctx.fillRect(cx - 8, cy - 6, 16, 12)
      ctx.strokeRect(cx - 8, cy - 6, 16, 12)
      ctx.fillStyle = PAL.danger
      ctx.fillRect(cx - 1.5, cy - 4, 3, 8)
      ctx.fillRect(cx - 4, cy - 1.5, 8, 3)
    } else {
      // drone
      ctx.fillRect(cx - 5, cy - 2, 10, 6)
      ctx.strokeRect(cx - 5, cy - 2, 10, 6)
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy - 6); ctx.lineTo(cx - 1, cy - 6)
      ctx.moveTo(cx + 1, cy - 6); ctx.lineTo(cx + 8, cy - 6)
      ctx.stroke()
      ctx.fillStyle = PAL.accent
      ctx.fillRect(cx - 1, cy - 0.5, 2, 2)
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, w: World) {
    const { player, lander } = w
    drawHpPips(ctx, player.hp, player.maxHp)
    // stamina bar just above the HP pips
    ctx.fillStyle = PAL.faint
    ctx.fillRect(14, 507, 97, 4)
    ctx.fillStyle = player.stamina < 25 ? PAL.warm : PAL.accent
    ctx.fillRect(14, 507, 97 * (player.stamina / 100), 4)
    const oreDone = lander.ore >= ORE_QUOTA
    text(ctx, `ORE ${Math.min(999, Math.round(lander.ore))}/${ORE_QUOTA}`, VIEW_W - 16, 26, {
      size: 13, color: oreDone ? PAL.good : PAL.pale, align: 'right',
    })
    text(ctx, `FUEL ${Math.round(lander.fuel)}`, VIEW_W - 16, 44, {
      size: 13, color: lander.fuel >= MIN_LAUNCH_FUEL ? PAL.pale : PAL.warm, align: 'right',
    })
    // projected payout so far (banked ore + field events)
    const proj = w.money + Math.round(lander.ore) * 10
    text(ctx, `${proj < 0 ? '-' : ''}$${Math.abs(proj)}`, VIEW_W - 16, 62, {
      size: 13, color: proj >= 0 ? PAL.good : PAL.danger, align: 'right',
    })
    let hudY = 80
    if (Math.round(lander.ore) > 200) {
      text(ctx, `OVERWEIGHT +${Math.round(lander.ore) - 200} · Z VENT`, VIEW_W - 16, hudY, {
        size: 10, color: PAL.warm, align: 'right',
      })
      hudY += 18
    }
    if (lander.hp < lander.maxHp) {
      text(ctx, `LANDER ${Math.round((lander.hp / lander.maxHp) * 100)}%`, VIEW_W - 16, hudY, {
        size: 11, color: lander.hp < 140 ? PAL.danger : PAL.dim, align: 'right',
      })
    }

    // multikill banner
    if (w.killCam) {
      const names = ['DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'PENTAKILL', 'ACE', 'KILLAMANJARO']
      const label = names[Math.min(w.killCam.count - 2, names.length - 1)]
      const pulse = 30 + Math.sin(w.killCam.t * 18) * 2
      text(ctx, label, VIEW_W / 2, 150, { size: pulse, color: PAL.danger })
    }

    // tutorial owns the guidance: no objective line to fight P.A.T. for attention
    if (w.simulated) {
      text(ctx, '— SIMULATED DROP —', VIEW_W / 2, 26, {
        size: 11, color: PAL.accent, alpha: 0.7 + Math.sin(w.time * 2.5) * 0.3,
      })
      return
    }
    // one-line objective with the load-bearing words in color
    if (w.meteorStorm) {
      textSegments(ctx, [['THE SKY IS FALLING', PAL.danger]], VIEW_W / 2, 26, 12)
      textSegments(ctx, [['THERE IS NO ESCAPE', PAL.danger]], VIEW_W / 2, 42, 10)
      return
    }
    if (w.isStranded()) {
      textSegments(ctx, [['STEAL A PIRATE SHIP TO ESCAPE', PAL.warm]], VIEW_W / 2, 26, 12)
      let sub: [string, string][]
      if (this.shipStealable(w)) sub = [['BOARD THE SHIP', PAL.good]]
      else if (w.pirateShip) sub = [['CLEAR THE CREW', PAL.danger]]
      else if (w.shipPending) sub = [['PIRATE SHIP INBOUND', PAL.danger]]
      else if (w.entities.some((e) => e instanceof FlarePickup && !e.dead)) sub = [['FIRE THE FLARE', PAL.danger]]
      else sub = [['KILL A PIRATE TO GET A ', PAL.pale], ['DISTRESS FLARE', PAL.danger]]
      textSegments(ctx, sub, VIEW_W / 2, 42, 10)
      return
    }
    // all extractors destroyed below quota: nothing left to mine with
    const drillsExist =
      lander.inventory.some((i) => i.kind === 'drill') ||
      w.player.carrying?.kind === 'drill' ||
      w.entities.some((e) =>
        ((e instanceof Crate || e instanceof Building) && !e.dead && e.item.kind === 'drill'))
    if (!drillsExist && !oreDone) {
      textSegments(ctx, [
        ['EXTRACTION FAILED', PAL.danger],
        [': ', PAL.pale],
        ['ALL EXTRACTORS', PAL.accent],
        [' DESTROYED — RETURN TO ORBIT', PAL.pale],
      ], VIEW_W / 2, 26, 11)
      return
    }
    const drills = w.entities.filter((e) => e instanceof Building && (e as Building).item.kind === 'drill').length
    let segs: [string, string][]
    if (oreDone && lander.fuel >= MIN_LAUNCH_FUEL) {
      segs = [['READY — BOARD THE LANDER', PAL.good]]
    } else if (oreDone) {
      segs = [['QUOTA MET — GET ', PAL.pale], ['FUEL', PAL.warm], [' TO THE LANDER', PAL.pale]]
    } else if (drills === 0) {
      segs = [['TAKE ', PAL.pale], ['EXTRACTORS', PAL.accent], [' FROM THE LANDER — BUILD ON ', PAL.pale], ['ORE NODES', PAL.good]]
    } else {
      segs = [['RETURN ', PAL.pale], ['FULL EXTRACTORS', PAL.good], [' TO THE LANDER', PAL.pale]]
      // second line: nudge toward automation until a drone is in the air
      const droneUp = w.entities.some((e) => e instanceof Drone && !e.dead)
      if (!droneUp) {
        textSegments(ctx, [['USE THE ', PAL.pale], ['PICKUP DRONE', PAL.accent], [' TO AUTOMATE', PAL.pale]], VIEW_W / 2, 42, 10)
      }
    }
    textSegments(ctx, segs, VIEW_W / 2, 26, 11)
  }
}
