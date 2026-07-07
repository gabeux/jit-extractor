import type { Game, Stage } from '../game'
import { PAL } from '../palette'
import { VIEW_W, VIEW_H, drawStars, drawPlanetArc, text, textSegments, drawKeyHint } from '../render'
import { Building } from '../entities/buildings'
import { Drone } from '../entities/drone'
import { Animal } from '../entities/animal'
import { Native } from '../entities/native'
import { LOADOUT, EQUIPMENT_COST } from '../entities/lander'
import { getCallsign, setCallsign, submitScore, recordPersonalBest, type SubmitResult } from '../net/leaderboard'
import { sendRunEnd } from '../net/analytics'
import { fmtTime } from '../ui/scoreboard'
import { sfx } from '../audio/sfx'

interface Line { t: string; c: string }

// End of loop: the pod climbs back to the ship, docks, HQ grades your run —
// Fallout-style, they noticed everything. Then the ledger and the leaderboard.
export class DockingStage implements Stage {
  readonly name = 'docking'
  private t = 0
  private docked = false
  private lines: Line[] = []
  private launchProbe = false
  private probeT = -1

  // run accounting
  private oreValue = 0
  private fuelValue = 0
  private fieldValue = 0
  private equipValue = 0 // always <= 0: replacement bill for missing gear
  private salvageValue = 0 // the pirate-ship easter egg pays STUPIDLY well
  private profit = 0
  private timeMs = 0
  private quotaMet = false
  private ending = 'UNKNOWN'

  // leaderboard flow
  private phase: 'anim' | 'entry' | 'submitting' | 'done' = 'anim'
  private nameBuf = ''
  private result: SubmitResult | null = null
  private newTop = false

  constructor(private game: Game) {}

  enter() {
    const w = this.game.world!
    const ore = Math.round(w.lander.ore)
    const fuel = Math.round(w.lander.fuel)
    const propertyLeft = w.entities.filter((e) => (e instanceof Building || e instanceof Drone) && !e.dead).length
    const lifeLeft = w.entities.filter((e) => (e instanceof Animal || e instanceof Native) && !e.dead).length

    this.oreValue = ore * 10
    // fuel is a bonus on SUCCESSFUL runs, not a business model: touch-and-go
    // "runs" that never mined pay nothing for a full tank
    const quotaDone = ore >= w.quota
    this.fuelValue = quotaDone && !w.escapedInPirateShip ? fuel * 10 : 0
    this.fieldValue = Math.round(w.money)
    // equipment audit: anything not back in the bay is billed — destroyed,
    // abandoned or used, corporate doesn't care which. On a pirate-ship
    // escape only crates stowed ABOARD THAT SHIP count; the lander's
    // inventory stayed on the planet with the lander.
    this.equipValue = 0
    const returnedBag = w.escapedInPirateShip ? (w.pirateShip?.stowed ?? []) : w.lander.inventory
    for (const [kind, expected] of LOADOUT) {
      // medikits aren't carriable, so a pirate escape conveniently loses the
      // paperwork on them — corporate never bills what it can't audit
      if (kind === 'medikit' && w.escapedInPirateShip) continue
      const returned = returnedBag.filter((i) => i.kind === kind).length
      this.equipValue -= Math.max(0, expected - returned) * EQUIPMENT_COST[kind]
    }
    // a destroyed lander is written off the run (largely plating with
    // bolted thrusters, but corporate keeps receipts)
    if (w.lander.dead) this.equipValue -= 3000
    this.salvageValue = w.escapedInPirateShip ? 18000 : 0
    this.profit = this.oreValue + this.fuelValue + this.fieldValue + this.equipValue + this.salvageValue
    // pirate-ship escapes count on BOTH boards: quota or not, corporate
    // clocks a completed extraction the moment the salvage docks
    this.quotaMet = ore >= w.quota || w.escapedInPirateShip
    this.timeMs = this.game.runTimeMs()
    this.nameBuf = getCallsign()

    this.ending =
      w.escapedInPirateShip ? 'STRANDED_ESCAPE' :
      ore === 0 ? 'EMPTY_CARGO' :
      this.quotaMet && propertyLeft === 0 && w.nativesKilledByPlayer === 0 ? 'QUOTA_MET_PERFECTLY' :
      this.quotaMet && propertyLeft > 0 ? 'QUOTA_MET_LEFT_EQUIPMENT' :
      this.quotaMet ? 'QUOTA_MET' :
      ore >= w.quota / 2 ? 'QUOTA_HALF' : 'QUOTA_MISSED'

    // simulated (tutorial) run: no ledger, no records — draw() shows the
    // TRAINING RUN COMPLETE card instead
    if (w.simulated) {
      this.game.endTutorial('done')
      this.launchProbe = false
      return
    }
    sendRunEnd(this.ending)
    // veterancy: from the tenth contract on, the debrief salutes (and we
    // remember it, in case future builds want to reward it)
    if (this.game.runsCompleted + 1 >= 10) {
      this.lines.push({ t: "★ You're a seasoned dropper.", c: '#e8c35a' })
      try { localStorage.setItem('jit-seasoned-v1', '1') } catch { /* ok */ }
    }

    if (w.escapedInPirateShip) {
      this.launchProbe = false
      this.lines.push(
        { t: 'Extractor, corporate would like to know why you have returned without', c: PAL.warm },
        { t: 'completing your quota... AND in a Pirate Ship.', c: PAL.warm },
        { t: 'You had one job... and you completed it with flying colors.', c: PAL.warm },
        { t: "We're very proud of you - RTB.", c: PAL.warm },
      )
      this.lines.push({ t: 'Salvage division appraisal: one (1) Pirate Cutter — $18,000. Not bad, Extractor.', c: PAL.good })
      if (w.lander.dead) {
        this.lines.push({ t: 'Asset write-off: one (1) Lander, destroyed in the field — $3,000 deducted.', c: PAL.danger })
      }
      const abandoned = propertyLeft + (w.lander.dead ? 0 : 1)
      if (abandoned > 0) {
        this.lines.push({ t: `CORPORATE NOTICE: ${abandoned} company asset(s) abandoned on-site. Costs will be deducted.`, c: PAL.danger })
      }
      if (w.nativesKilledByPlayer > 0) {
        this.lines.push({ t: `Field report: ${w.nativesKilledByPlayer} native casualties logged. Legal has been notified.`, c: PAL.danger })
      }
      return
    }
    this.launchProbe = ore > 0
    if (ore === 0) {
      this.lines.push(
        { t: 'Uh. Empty cargo bay? Do you need to go to the bathroom?', c: PAL.warm },
        { t: 'Return to the ground, Extractor. Profit awaits.', c: PAL.warm },
      )
    } else if (this.quotaMet) {
      this.lines.push(
        { t: 'Great work, Extractor.', c: PAL.accent },
        { t: "We're processing your payment - delivery probe has been launched.", c: PAL.accent },
        { t: 'Feel free to launch and fulfill the next quota.', c: PAL.accent },
      )
    } else if (ore >= w.quota / 2) {
      this.lines.push(
        { t: 'Half a quota, Extractor. We are processing half a payment.', c: PAL.accent },
        { t: 'Delivery probe launched. HQ notices these things.', c: PAL.dim },
      )
    } else {
      this.lines.push(
        { t: "That is... not a quota. Payment docked accordingly.", c: PAL.warm },
        { t: 'Delivery probe launched, mostly empty. Try harder next drop.', c: PAL.warm },
      )
    }
    if (propertyLeft > 0) {
      this.lines.push({ t: `CORPORATE NOTICE: ${propertyLeft} company asset(s) abandoned on-site. Costs will be deducted.`, c: PAL.danger })
    }
    if (w.pirateShipEscaped > 0) {
      this.lines.push({ t: `Pirates escaped with ${w.pirateShipEscaped} units of Company ore. Also deducted.`, c: PAL.danger })
    }
    if (w.nativesKilledByPlayer > 0) {
      this.lines.push({ t: `Field report: ${w.nativesKilledByPlayer} native casualties logged. Legal has been notified.`, c: PAL.danger })
    }
    if (lifeLeft === 0) {
      this.lines.push({ t: 'Biosphere scan: NO LIFE DETECTED. Impressive. Horrifying, but impressive.', c: PAL.dim })
    }
    if (w.pirateShipDestroyed) {
      this.lines.push({ t: 'Outstanding work neutralizing the local Pirate threat: you are in for a promotion.', c: PAL.good })
    }
  }

  update(dt: number) {
    this.t += dt
    if (!this.docked && this.t >= 2.4) {
      this.docked = true
      sfx.dock()
    }
    if (this.docked && this.launchProbe && this.probeT < 0 && this.t > 3.9) {
      this.probeT = 0
      sfx.launch()
    }
    if (this.probeT >= 0) this.probeT += dt
    if (!this.docked || this.t <= 3.4) return

    const input = this.game.input
    if (this.phase === 'anim') {
      // nothing extracted, nothing stolen = nothing worth a leaderboard line —
      // and simulated (tutorial) profits never touch the board
      const submittable = !this.game.world?.simulated && (this.oreValue > 0 || this.salvageValue > 0)
      this.phase = submittable ? 'entry' : 'done'
      this.game.typingName = submittable
    }
    if (this.phase === 'entry') {
      const typed = input.consumeTyped().replace(/[^A-Za-z0-9 _\-.]/g, '')
      if (typed) this.nameBuf = (this.nameBuf + typed).slice(0, 10)
      if (input.wasPressed('Backspace')) this.nameBuf = this.nameBuf.slice(0, -1)
      if (input.wasPressed('Enter')) {
        this.game.typingName = false
        const name = this.nameBuf.trim()
        if (!name) {
          this.phase = 'done' // skipped — no submission
        } else {
          setCallsign(name)
          this.phase = 'submitting'
          void submitScore({
            name, profit: this.profit, timeMs: this.timeMs,
            quotaMet: this.quotaMet, ending: this.ending,
          }).then((res) => {
            this.result = res
            this.newTop = res.rankProfit === 1 || recordPersonalBest(this.profit)
            this.phase = 'done'
            if (this.newTop) sfx.dock()
          })
        }
      }
    } else if (this.phase === 'done' && input.wasPressed('KeyE')) {
      this.game.completeRun()
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PAL.bgSpace
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    drawStars(ctx, this.t * 4, 0)
    drawPlanetArc(ctx, this.t, VIEW_W / 2, VIEW_H + 620, 760)

    // the ship, seen from outside
    const shipY = 130
    ctx.fillStyle = PAL.bgSky
    ctx.strokeStyle = PAL.pale
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(330, shipY + 26)
    ctx.quadraticCurveTo(290, shipY - 10, 350, shipY - 30)
    ctx.lineTo(610, shipY - 30)
    ctx.lineTo(645, shipY - 8)
    ctx.lineTo(645, shipY + 26)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = PAL.faint
    for (let i = 0; i < 4; i++) ctx.fillRect(370 + i * 60, shipY - 16, 12, 7)

    // pod (or borrowed pirate ship) climbing to the docking clamp
    const t = Math.min(1, this.t / 2.4)
    const ease = 1 - Math.pow(1 - t, 2)
    const podY = shipY + 40 + (1 - ease) * 330
    const podX = 480 + (1 - ease) * 30
    if (this.game.world?.escapedInPirateShip) {
      ctx.fillStyle = PAL.faint
      ctx.strokeStyle = PAL.pirate
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(podX - 26, podY + 12)
      ctx.lineTo(podX - 21, podY - 6)
      ctx.lineTo(podX + 17, podY - 6)
      ctx.lineTo(podX + 26, podY + 6)
      ctx.lineTo(podX + 23, podY + 12)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = PAL.danger
      ctx.fillRect(podX - 10, podY - 2, 13, 4)
    } else {
      ctx.fillStyle = PAL.faint
      ctx.strokeStyle = PAL.pale
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(podX - 10, podY + 14)
      ctx.lineTo(podX - 10, podY - 2)
      ctx.quadraticCurveTo(podX, podY - 14, podX + 10, podY - 2)
      ctx.lineTo(podX + 10, podY + 14)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    if (!this.docked) {
      ctx.fillStyle = PAL.warm
      ctx.beginPath()
      ctx.moveTo(podX - 5, podY + 14)
      ctx.lineTo(podX + 5, podY + 14)
      ctx.lineTo(podX, podY + 26 + Math.random() * 6)
      ctx.closePath()
      ctx.fill()
    }

    // delivery probe: creeps off the ship then really commits to it
    if (this.probeT >= 0) {
      const pt = this.probeT
      const px = 650 + 18 * pt + 95 * pt * pt
      const py = shipY - 40 - 14 * pt
      if (px < VIEW_W + 40) {
        ctx.fillStyle = PAL.faint
        ctx.strokeStyle = PAL.good
        ctx.lineWidth = 1.5
        ctx.fillRect(px - 7, py - 6, 14, 12)
        ctx.strokeRect(px - 7, py - 6, 14, 12)
        ctx.fillStyle = PAL.warm
        const flame = 4 + pt * 10 + Math.random() * 4
        ctx.beginPath()
        ctx.moveTo(px - 7, py - 3)
        ctx.lineTo(px - 7, py + 3)
        ctx.lineTo(px - 7 - flame, py)
        ctx.closePath()
        ctx.fill()
      }
    }

    if (!this.docked) {
      text(ctx, 'DOCKING…', VIEW_W / 2, 300, { size: 12, color: PAL.dim })
      return
    }

    // training sim: a clean congratulations card replaces the whole debrief
    if (this.game.world?.simulated) {
      if (this.t > 2.8) {
        text(ctx, 'TRAINING RUN COMPLETE', VIEW_W / 2, 258, { size: 24, color: PAL.good })
        const congrats = [
          'Congratulations on finishing the training sim.',
          'The company looks forward to profiting with you.',
        ]
        let budget = Math.floor((this.t - 3.1) * 55)
        let cy = 292
        for (const line of congrats) {
          if (budget <= 0) break
          text(ctx, line.slice(0, budget), VIEW_W / 2, cy, { size: 11, color: PAL.pale })
          budget -= line.length
          cy += 19
        }
        if (this.phase === 'done' && Math.sin(this.t * 4) > -0.2) {
          drawKeyHint(ctx, '[E] NEXT CONTRACT', VIEW_W / 2, 348, 11)
        }
      }
      text(ctx, 'Made by @Gabeux.', VIEW_W - 16, 528, { size: 10, color: PAL.pale, align: 'right', alpha: 0.85 })
      return
    }

    // HQ transmission, typed out
    let budget = Math.floor((this.t - 2.8) * 55)
    let y = 244
    for (const line of this.lines) {
      if (budget <= 0) break
      text(ctx, line.t.slice(0, budget), VIEW_W / 2, y, { size: 11, color: line.c })
      budget -= line.t.length
      y += 19
    }
    if (this.t <= 3.4) return

    // the ledger
    y += 12
    const pc = this.profit >= 0 ? PAL.good : PAL.danger
    text(ctx, `PROFIT: ${this.profit < 0 ? '-' : ''}$${Math.abs(this.profit)}`, VIEW_W / 2, y, { size: 20, color: pc })
    y += 20
    const fieldStr = `${this.fieldValue < 0 ? '-' : ''}$${Math.abs(this.fieldValue)}`
    textSegments(ctx, [
      [`ORE $${this.oreValue}`, PAL.pale], ['  ·  ', PAL.dim],
      ...(this.fuelValue > 0
        ? [[`FUEL $${this.fuelValue}`, PAL.pale] as [string, string], ['  ·  ', PAL.dim] as [string, string]]
        : [['FUEL BONUS — QUOTA ONLY', PAL.dim] as [string, string], ['  ·  ', PAL.dim] as [string, string]]),
      [`FIELD ${fieldStr}`, this.fieldValue >= 0 ? PAL.pale : PAL.danger],
      ...(this.equipValue < 0
        ? [['  ·  ', PAL.dim] as [string, string], [`EQUIPMENT -$${-this.equipValue}`, PAL.danger] as [string, string]]
        : []),
      ...(this.salvageValue > 0
        ? [['  ·  ', PAL.dim] as [string, string], [`SALVAGE $${this.salvageValue}`, PAL.good] as [string, string]]
        : []),
      ...(this.quotaMet ? [['  ·  ', PAL.dim] as [string, string], [`TIME ${fmtTime(this.timeMs)}`, PAL.accent] as [string, string]] : []),
    ], VIEW_W / 2, y, 11)
    y += 30

    if (this.phase === 'entry') {
      const cursor = Math.sin(this.t * 6) > 0 ? '_' : ' '
      text(ctx, `CALLSIGN: ${this.nameBuf}${cursor}`, VIEW_W / 2, y, { size: 14, color: PAL.white })
      drawKeyHint(ctx, 'TYPE NAME · [ENTER] SUBMIT TO LEADERBOARD (EMPTY = SKIP)', VIEW_W / 2, y + 20, 9)
    } else if (this.phase === 'submitting') {
      text(ctx, 'TRANSMITTING TO HQ…', VIEW_W / 2, y, { size: 12, color: PAL.dim })
    } else if (this.phase === 'done') {
      if (this.newTop) {
        const glow = 0.6 + Math.sin(this.t * 6) * 0.4
        text(ctx, 'NEW TOP PROFIT!', VIEW_W / 2, y, { size: 22, color: PAL.good, alpha: glow })
        y += 24
      }
      if (this.result) {
        const off = this.result.offline ? ' (OFFLINE)' : ''
        const rank = this.result.rankProfit ? `LEADERBOARD RANK #${this.result.rankProfit}${off}` : `RECORDED${off}`
        text(ctx, rank, VIEW_W / 2, y, { size: 11, color: PAL.pale })
        y += 18
      }
      if (Math.sin(this.t * 4) > -0.2) {
        drawKeyHint(ctx, '[E] NEXT CONTRACT · [TAB] LEADERBOARD', VIEW_W / 2, y + 8, 11)
      }
    }

    // author credit lives permanently on the ending screen
    text(ctx, 'Made by @Gabeux.', VIEW_W - 16, 528, { size: 10, color: PAL.pale, align: 'right', alpha: 0.85 })
  }
}

export class GameOverStage implements Stage {
  readonly name = 'gameover'
  private t = 0

  constructor(private game: Game, private reason: string) {}

  enter() {
    sfx.die()
  }

  update(dt: number) {
    this.t += dt
    if (this.t > 1 && this.game.input.wasPressed('KeyE')) this.game.newRun()
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PAL.bgSpace
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    drawStars(ctx, 0, 0, 0.4)
    text(ctx, 'CONTRACT TERMINATED', VIEW_W / 2, 240, { size: 26, color: PAL.danger })
    text(ctx, this.reason, VIEW_W / 2, 274, { size: 13, color: PAL.pale })
    if (this.t > 1 && Math.sin(this.t * 4) > -0.2) {
      drawKeyHint(ctx, '[E] NEW CONTRACT · [TAB] LEADERBOARD', VIEW_W / 2, 340, 12)
    }
  }
}
