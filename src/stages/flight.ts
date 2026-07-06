import type { Game, Stage } from '../game'
import { PAL } from '../palette'
import { VIEW_W, VIEW_H, drawSky, text, drawKeyHint } from '../render'
import { labeledBar } from '../ui/hud'
import { clamp } from '../entities/entity'
import { Pirate } from '../entities/pirate'
import { Native } from '../entities/native'
import { WORLD_W } from '../world/world'
import { sfx, wilhelm } from '../audio/sfx'

const GRAV = 240
const SAFE_VY = 140
const GROUND_LEVEL = 1560
const FLIGHT_ZOOM = 0.55

// Descent: classic lander — burn fuel, touch down gently, you can't afford
// to be picky about the spot. Ascent: same physics, goal is straight up.
export class FlightStage implements Stage {
  readonly name: string
  private thrustSfxT = 0
  private t = 0
  private zoom: number

  constructor(private game: Game, private mode: 'descent' | 'ascent') {
    this.name = mode
    // ascent starts at ground-stage zoom and eases out to flight zoom
    this.zoom = mode === 'ascent' ? 1 : FLIGHT_ZOOM
  }

  enter() {
    const w = this.game.world!
    w.player.inLander = true
    w.lander.flying = true
    if (this.mode === 'descent') {
      w.lander.y = 150
      w.lander.vy = 20
      w.lander.vx = 0
    } else {
      // launch kick + grace period so takeoff doesn't instantly re-land
      w.lander.vy = -150
      w.lander.vx = 0
      sfx.launch()
      w.burst(w.lander.x, w.lander.y, 14, '#ff9f43', 120)
    }
  }

  update(dt: number) {
    this.t += dt
    this.zoom += (FLIGHT_ZOOM - this.zoom) * Math.min(1, dt * 3)
    const w = this.game.world!
    const lander = w.lander
    const input = this.game.input

    // cargo mass: the first 200 ore is free, everything past it drags the
    // TWR down — at ~500 ore total the lander physically cannot climb
    const massFactor = 1 + Math.max(0, lander.ore - 200) / 200
    lander.vy += GRAV * dt
    lander.thrustMain = false
    lander.thrustSide = 0
    const hasFuel = lander.fuel > 0
    if (hasFuel && (input.isDown('KeyW') || input.isDown('Space') || input.isDown('ArrowUp'))) {
      lander.vy -= (600 / massFactor) * dt
      lander.fuel = Math.max(0, lander.fuel - 6.5 * dt)
      lander.thrustMain = true
      this.thrustSfxT -= dt
      if (this.thrustSfxT <= 0) { sfx.thrust(); this.thrustSfxT = 0.09 }
    }
    const ax = input.axisX()
    if (hasFuel && ax !== 0) {
      lander.vx += ax * (380 / massFactor) * dt
      lander.fuel = Math.max(0, lander.fuel - 2.2 * dt)
      lander.thrustSide = ax
    }
    // Z vents ore overboard to shed weight
    if (input.isDown('KeyZ') && lander.ore > 0) {
      lander.ore = Math.max(0, lander.ore - 35 * dt)
      w.burst(lander.x, lander.y - 4, 1, PAL.good, 70)
    }
    lander.vx *= 1 - 0.5 * dt
    lander.vx = clamp(lander.vx, -260, 260)
    lander.vy = clamp(lander.vy, -320, 420)
    lander.x = clamp(lander.x + lander.vx * dt, 40, WORLD_W - 40)
    lander.y += lander.vy * dt

    w.update(dt)

    if (this.mode === 'ascent' && lander.y <= 240) {
      this.game.gotoDocking()
      return
    }
    // chickening out of the descent is allowed — HQ will have words
    if (this.mode === 'descent' && this.t > 2 && lander.y <= 240) {
      this.game.gotoDocking()
      return
    }

    const gy = w.terrain.heightAt(lander.x)
    if (lander.y >= gy && (this.mode === 'descent' || this.t > 1)) {
      lander.y = gy
      const impact = lander.vy
      const slope = Math.abs(w.terrain.slopeAt(lander.x))
      lander.flying = false
      lander.thrustMain = false
      lander.thrustSide = 0
      lander.vx = 0; lander.vy = 0
      sfx.thud()
      if (impact > SAFE_VY) {
        // free-fall is lethal: sensitivity high enough that terminal velocity kills
        const dmg = Math.round((impact - SAFE_VY) * 2.0)
        lander.damage(w, dmg, null)
        w.addFloater(lander.x, gy - 60, `HARD LANDING -${dmg}`, PAL.danger)
        w.shake = Math.max(w.shake, 8)
      }
      if (slope > 0.42 && !lander.dead) {
        lander.damage(w, 25, null)
        w.addFloater(lander.x, gy - 74, 'ROUGH GROUND -25', PAL.danger)
      }
      w.terrain.flatten(lander.x, 26)
      // anyone under (or hugging) the landing legs has a very bad day
      for (const e of w.entities) {
        if ((e instanceof Pirate || e instanceof Native) && !e.dead &&
            Math.abs(e.x - lander.x) < 48 && Math.abs(e.y - gy) < 40) {
          w.burst(e.x, e.cy, 16, PAL.danger, 160)
          e.damage(w, 999, null)
          wilhelm()
        }
      }
      if (lander.dead) {
        this.game.terminate('LANDER DESTROYED ON IMPACT')
      } else {
        this.game.gotoGround()
      }
      return
    }

    if (lander.dead) this.game.terminate('LANDER SHOT DOWN')
  }

  draw(ctx: CanvasRenderingContext2D) {
    const w = this.game.world!
    const lander = w.lander
    const zoom = this.zoom
    const vw = VIEW_W / zoom, vh = VIEW_H / zoom
    const camX = clamp(lander.x - vw / 2, 0, WORLD_W - vw) + (Math.random() - 0.5) * w.shake
    const camY = clamp(lander.y - vh * 0.32, 0, 1820 - vh) + (Math.random() - 0.5) * w.shake

    ctx.save()
    ctx.scale(zoom, zoom)
    drawSky(ctx, camY, GROUND_LEVEL, vw, vh)
    w.terrain.draw(ctx, camX, camY, vw, vh)
    w.draw(ctx, camX, camY, vw, vh)
    ctx.restore()

    // HUD
    labeledBar(ctx, 14, 24, 120, lander.fuel / 100, 'FUEL', lander.fuel < 25 ? PAL.danger : PAL.warm)
    labeledBar(ctx, 14, 48, 120, lander.hp / lander.maxHp, 'HULL', lander.hp < 120 ? PAL.danger : PAL.pale)
    // overweight readout: thrust-to-weight sinks as cargo passes 200 ore
    const over = Math.max(0, Math.round(lander.ore) - 200)
    if (over > 0) {
      const twr = (600 / (1 + over / 200)) / 240
      text(ctx, `OVERWEIGHT +${over} · TWR ${twr.toFixed(2)}`, 14, 74, {
        size: 11, color: twr <= 1.05 ? PAL.danger : PAL.warm, align: 'left',
      })
      drawKeyHint(ctx, 'HOLD [Z] — VENT ORE', 14 + 62, 90, 10)
    }

    if (this.mode === 'descent') {
      const fast = lander.vy > SAFE_VY
      text(ctx, `▼ ${Math.max(0, Math.round(lander.vy))}`, VIEW_W - 40, 30, {
        size: 14, color: fast ? PAL.danger : PAL.good, align: 'right',
      })
      drawKeyHint(ctx, '[W] THRUST · [A/D] STEER — LAND SOFTLY', VIEW_W / 2, 524)
    } else {
      // blinking TO ORBIT arrow
      const blink = Math.sin(performance.now() / 180) > -0.3
      if (blink) {
        ctx.fillStyle = PAL.accent
        ctx.beginPath()
        ctx.moveTo(VIEW_W / 2 - 10, 46)
        ctx.lineTo(VIEW_W / 2 + 10, 46)
        ctx.lineTo(VIEW_W / 2, 28)
        ctx.closePath()
        ctx.fill()
        text(ctx, 'TO ORBIT', VIEW_W / 2, 62, { size: 12, color: PAL.accent })
      }
      if (lander.fuel <= 0) text(ctx, 'OUT OF FUEL', VIEW_W / 2, 90, { size: 12, color: PAL.danger })
    }
  }
}
