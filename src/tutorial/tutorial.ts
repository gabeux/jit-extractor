import type { Game } from '../game'
import { TUT } from '../ui/patscript'
import { Building } from '../entities/buildings'
import { Drone } from '../entities/drone'
import { Grenade } from '../entities/projectile'
import { Pirate } from '../entities/pirate'
import { Native } from '../entities/native'
import { WORLD_W } from '../world/world'
import { warKey } from '../systems/factions'
import type { Entity } from '../entities/entity'

// The guided first drop. A linear list of steps; each step opens a P.A.T.
// dialogue (blocking) or hint (sim keeps running), optionally aims the gold
// arrow, and advances when its condition is met. Ends at the docking stage,
// which marks the tutorial done.
//
// The sim starts PEACEFUL (nothing hunts the player) so the early steps are
// calm; the wave step flips that off and throws one scripted two-front
// attack, after which normal planet danger resumes.

/** Stat modifiers for the simulated drop (world.mods when tutorial is on). */
export const SIM_MODS = { dmgOut: 1.25, dmgIn: 0.5, mine: 1.33, fuelBurn: 0.65 }

/** Ground stage exposes this so hints can point at world objects. */
interface GroundLike { screenPoint(wx: number, wy: number): [number, number] }

interface Step {
  /** Open the dialogue/hint for this step. */
  enter(game: Game): void
  /** Advance when true (checked every tick the sim runs). */
  done(game: Game): boolean
  /** Gold-arrow target in screen coords, re-evaluated per tick. */
  pointer?(game: Game): [number, number] | null
}

const onGround = (game: Game) => game.stage.name === 'ground'

function groundPoint(game: Game, wx: number, wy: number): [number, number] | null {
  if (!onGround(game)) return null
  return (game.stage as unknown as GroundLike).screenPoint(wx, wy)
}

function landerPoint(game: Game): [number, number] | null {
  const w = game.world
  return w ? groundPoint(game, w.lander.x, w.lander.y - 50) : null
}

function hasBuilding(game: Game, kind: string): boolean {
  return game.world?.entities.some((e) => e instanceof Building && !e.dead && e.item.kind === kind) ?? false
}

// The scripted two-front attack (one Tutorial at a time, module state is fine).
let waveUnits: Entity[] = []

function spawnWave(game: Game) {
  const w = game.world!
  w.peaceful = false
  w.declareWar('native', 'player') // lifted again once the wave is cleared
  waveUnits = []
  const pirateSide = Math.random() < 0.5 ? 30 : WORLD_W - 30
  const nativeSide = pirateSide === 30 ? WORLD_W - 30 : 30
  for (let i = 0; i < 3; i++) {
    const p = new Pirate(pirateSide + Math.sign(WORLD_W / 2 - pirateSide) * i * 14, 'raider')
    p.y = w.terrain.heightAt(p.x) - 4
    w.spawn(p)
    waveUnits.push(p)
  }
  for (let i = 0; i < 4; i++) {
    const n = new Native(nativeSide + Math.sign(WORLD_W / 2 - nativeSide) * i * 12, w.campX ?? WORLD_W / 2, true)
    n.y = w.terrain.heightAt(n.x) - 4
    w.spawn(n)
    waveUnits.push(n)
  }
}

const STEPS: Step[] = [
  { // walk to the ship console and drop
    enter: (g) => g.pat.hint(TUT().board),
    pointer: () => [620, 292], // the ship console screen (CONSOLE_X, FLOOR_Y-38)
    done: (g) => g.stage.name === 'descent',
  },
  { // controls briefing — blocking, so the lander hangs safely while reading
    enter: (g) => g.pat.show(TUT().flightIntro),
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.hint(TUT().descent),
    pointer: () => [908, 32], // the ▼ velocity readout
    done: onGround,
  },
  {
    enter: (g) => g.pat.show(TUT().groundIntro),
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.hint(TUT().turretGrab),
    pointer: landerPoint,
    done: (g) => g.world?.player.carrying?.kind === 'turret',
  },
  {
    enter: (g) => g.pat.hint(TUT().turretBuild),
    done: (g) => hasBuilding(g, 'turret'),
  },
  {
    enter: (g) => g.pat.show(TUT().grenadeTalk),
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.hint(TUT().grenadeThrow),
    done: (g) => g.world?.entities.some((e) => e instanceof Grenade) ?? false,
  },
  { // the scripted two-front attack: enemies hang frozen while this is read
    enter: (g) => { spawnWave(g); g.pat.show(TUT().wave) },
    done: (g) => !g.pat.open,
  },
  { // the fight itself: no arrow, just the reminder that retreat exists
    enter: (g) => g.pat.hint(TUT().waveFight),
    done: (g) => waveUnits.every((e) => e.dead) || !onGround(g),
  },
  {
    enter: (g) => {
      g.world?.wars.delete(warKey('native', 'player')) // the grudge was scripted
      g.pat.show(TUT().waveDone)
    },
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.hint(TUT().fuelgen),
    pointer: (g) => (g.world?.player.carrying ? null : landerPoint(g)),
    done: (g) => hasBuilding(g, 'fuelgen'),
  },
  {
    enter: (g) => g.pat.hint(TUT().drill),
    pointer: (g) => {
      const w = g.world
      if (!w) return null
      if (w.player.carrying?.kind !== 'drill') return landerPoint(g)
      const node = w.nodes
        .filter((n) => !n.taken)
        .sort((a, b) => Math.abs(a.x - w.player.x) - Math.abs(b.x - w.player.x))[0]
      return node ? groundPoint(g, node.x, w.terrain.heightAt(node.x) - 16) : null
    },
    done: (g) => hasBuilding(g, 'drill'),
  },
  {
    enter: (g) => g.pat.hint(TUT().drone),
    pointer: (g) => (g.world?.player.carrying ? null : landerPoint(g)),
    done: (g) => g.world?.entities.some((e) => e instanceof Drone && !e.dead) ?? false,
  },
  {
    enter: (g) => g.pat.show(TUT().medikit),
    done: (g) => !g.pat.open,
  },
  { // pack-up lesson: a pause, not a task — the drone may already have done it
    enter: (g) => g.pat.show(TUT().harvest),
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.show(TUT().audits),
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.hint(TUT().launch),
    pointer: landerPoint,
    done: (g) => g.stage.name === 'ascent',
  },
  {
    enter: (g) => g.pat.hint(TUT().ascent),
    done: (g) => g.stage.name === 'docking', // docking marks the tutorial done
  },
]

export class Tutorial {
  private idx = -1

  update(game: Game) {
    if (this.idx >= STEPS.length) return
    if (this.idx >= 0 && !STEPS[this.idx].done(game)) {
      game.pat.setPointer(STEPS[this.idx].pointer?.(game) ?? null)
      return
    }
    // advance by ENTERING each step, then re-checking: blocking steps open
    // their dialogue first (so `!pat.open` can't skip them), while hint steps
    // whose condition is already met fall through
    while (++this.idx < STEPS.length) {
      STEPS[this.idx].enter(game)
      if (!STEPS[this.idx].done(game)) break
    }
    if (this.idx >= STEPS.length) {
      game.pat.close()
      return
    }
    game.pat.setPointer(STEPS[this.idx].pointer?.(game) ?? null)
  }
}
