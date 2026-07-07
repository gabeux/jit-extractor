import type { Game } from '../game'
import { TUT } from '../ui/patscript'
import { Building } from '../entities/buildings'
import { Drone } from '../entities/drone'
import { Grenade } from '../entities/projectile'

// The guided first drop. A linear list of steps; each step opens a P.A.T.
// dialogue (blocking) or hint (sim keeps running), optionally aims the gold
// arrow, and advances when its condition is met. Ends at the docking stage,
// which marks the tutorial done.

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

const STEPS: Step[] = [
  { // walk to the ship console and drop
    enter: (g) => g.pat.hint(TUT.board),
    pointer: () => [620, 292], // the ship console screen (CONSOLE_X, FLOOR_Y-38)
    done: (g) => g.stage.name === 'descent',
  },
  { // controls briefing — blocking, so the lander hangs safely while reading
    enter: (g) => g.pat.show(TUT.flightIntro),
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.hint(TUT.descent),
    pointer: () => [908, 32], // the ▼ velocity readout
    done: onGround,
  },
  {
    enter: (g) => g.pat.show(TUT.groundIntro),
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.hint(TUT.turretGrab),
    pointer: landerPoint,
    done: (g) => g.world?.player.carrying?.kind === 'turret',
  },
  {
    enter: (g) => g.pat.hint(TUT.turretBuild),
    done: (g) => hasBuilding(g, 'turret'),
  },
  {
    enter: (g) => g.pat.show(TUT.grenadeTalk),
    done: (g) => !g.pat.open,
  },
  {
    enter: (g) => g.pat.hint(TUT.grenadeThrow),
    done: (g) => g.world?.entities.some((e) => e instanceof Grenade) ?? false,
  },
  {
    enter: (g) => g.pat.hint(TUT.fuelgen),
    pointer: (g) => (g.world?.player.carrying ? null : landerPoint(g)),
    done: (g) => hasBuilding(g, 'fuelgen'),
  },
  {
    enter: (g) => g.pat.hint(TUT.drill),
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
    enter: (g) => g.pat.hint(TUT.drone),
    pointer: (g) => (g.world?.player.carrying ? null : landerPoint(g)),
    done: (g) => g.world?.entities.some((e) => e instanceof Drone && !e.dead) ?? false,
  },
  {
    enter: (g) => g.pat.show(TUT.medikit),
    done: (g) => !g.pat.open,
  },
  { // pack up a full extractor (or let the drone beat you to it)
    enter: (g) => g.pat.hint(TUT.harvest),
    pointer: (g) => {
      const w = g.world
      if (!w) return null
      const drill = w.entities
        .filter((e): e is Building => e instanceof Building && !e.dead && e.item.kind === 'drill')
        .sort((a, b) => b.item.fill - a.item.fill)[0]
      return drill ? groundPoint(g, drill.x, drill.y - 40) : null
    },
    done: (g) => (g.world?.lander.ore ?? 0) >= 1,
  },
  {
    enter: (g) => g.pat.hint(TUT.launch),
    pointer: landerPoint,
    done: (g) => g.stage.name === 'ascent',
  },
  {
    enter: (g) => g.pat.hint(TUT.ascent),
    done: (g) => g.stage.name === 'docking', // docking marks the tutorial done
  },
]

export class Tutorial {
  private idx = -1

  update(game: Game) {
    if (this.idx >= STEPS.length) return
    if (this.idx < 0 || STEPS[this.idx].done(game)) {
      // advance past every already-satisfied step (e.g. drone built early)
      do { this.idx++ } while (this.idx < STEPS.length && STEPS[this.idx].done(game))
      if (this.idx >= STEPS.length) {
        game.pat.close()
        return
      }
      STEPS[this.idx].enter(game)
    }
    game.pat.setPointer(STEPS[this.idx].pointer?.(game) ?? null)
  }
}
