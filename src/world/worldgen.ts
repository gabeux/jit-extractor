import { World, WORLD_W, rollWeather, rollWindFor } from './world'
import { Player } from '../entities/player'
import { Lander } from '../entities/lander'
import { Pirate } from '../entities/pirate'
import { Native } from '../entities/native'
import { Animal } from '../entities/animal'
import { range, irange } from '../rng'

// Builds a fresh planet from one seed: terrain, flora, resource nodes with
// pirate guards, native camp(s), roaming animals, and the player + lander.
// `runs` = completed contracts: it widens the dice — quotas vary, weather
// rolls in, and planet quirks get likelier up to mission 10.
export function generateWorld(seed: number, runs = 0): World {
  const w = new World(seed)
  const rng = w.rng
  const diff = Math.min(1, runs / 9)

  // contract quota: the first drop is the standard 200, then 100..400 in 50s
  w.quota = runs === 0 ? 200 : 100 + irange(rng, 0, 6) * 50

  // weather (the tutorial overrides this back to clear skies; it also
  // drifts over time — see World.update)
  w.weather = rollWeather(rng)
  w.windX = rollWindFor(w.weather, rng)
  w.wxTargetWind = w.windX

  // planet quirks: rare on early contracts, expected by mission 10.
  // dying re-rolls the seed, so conditions re-randomize on every new run.
  const pool = ['fauna', 'lush', 'tribes', 'pirates']
  const quirks = new Set<string>()
  const quirkCount = rng() < 0.2 + 0.55 * diff ? (rng() < 0.35 * diff ? 2 : 1) : 0
  while (quirks.size < quirkCount) quirks.add(pool[irange(rng, 0, pool.length - 1)])

  // resource nodes: 3-10, spread out — some maps are easier than others
  const nodeCount = irange(rng, 3, 10)
  const nodeXs: number[] = []
  let tries = 0
  while (nodeXs.length < nodeCount && tries++ < 300) {
    const x = range(rng, 200, WORLD_W - 200)
    if (nodeXs.every((nx) => Math.abs(nx - x) > 220)) nodeXs.push(x)
  }
  nodeXs.sort((a, b) => a - b)
  for (const x of nodeXs) {
    w.terrain.flatten(x, 26)
    w.nodes.push({ x, taken: false })
  }

  // native camp: keep some distance from nodes so factions start apart
  let campX = range(rng, 300, WORLD_W - 300)
  for (let i = 0; i < 60; i++) {
    campX = range(rng, 300, WORLD_W - 300)
    if (nodeXs.every((nx) => Math.abs(nx - campX) > 320)) break
  }
  w.terrain.flatten(campX, 70)
  w.campX = campX
  w.tents = [{ x: campX - 45, alive: true }, { x: campX + 45, alive: true }]

  // flora
  for (let x = 100; x < WORLD_W - 100; x += range(rng, 160, 420)) {
    w.trees.push({ x, size: range(rng, 0.7, 1.4), seed: rng() })
  }
  for (let x = 60; x < WORLD_W - 60; x += range(rng, 50, 140)) {
    w.tufts.push({ x, eaten: false, regrowT: 0 })
  }

  // pirates guard ~60% of the nodes, sometimes in pairs — a pirate-haven
  // quirk turns every post into a small crew
  for (const x of nodeXs) {
    if (rng() < (quirks.has('pirates') ? 0.85 : 0.6)) {
      const n = (rng() < 0.3 ? 2 : 1) * (quirks.has('pirates') ? irange(rng, 2, 3) : 1)
      for (let i = 0; i < n; i++) {
        const p = new Pirate(x + range(rng, -50, 50), 'guard')
        p.y = w.terrain.heightAt(p.x) - 4
        w.spawn(p)
      }
    }
  }

  // natives around their camp
  const nativeCount = irange(rng, 3, 4)
  for (let i = 0; i < nativeCount; i++) {
    const n = new Native(campX + range(rng, -120, 120), campX)
    n.y = w.terrain.heightAt(n.x) - 4
    w.spawn(n)
  }
  // tribal-planet quirk: one or two more camps, each with its own people
  if (quirks.has('tribes')) {
    const extra = irange(rng, 1, 2)
    for (let c = 0; c < extra; c++) {
      let cx = range(rng, 300, WORLD_W - 300)
      for (let i = 0; i < 60; i++) {
        cx = range(rng, 300, WORLD_W - 300)
        if (Math.abs(cx - campX) > 500 && nodeXs.every((nx) => Math.abs(nx - cx) > 300)) break
      }
      w.terrain.flatten(cx, 70)
      w.tents.push({ x: cx - 45, alive: true }, { x: cx + 45, alive: true })
      for (let i = 0; i < irange(rng, 3, 4); i++) {
        const n = new Native(cx + range(rng, -120, 120), cx)
        n.y = w.terrain.heightAt(n.x) - 4
        w.spawn(n)
      }
    }
  }

  // starting fauna — lush planets teem with grazers, feral ones with teeth
  const passives = irange(rng, 3, 5) * (quirks.has('lush') ? 2 : 1)
  for (let i = 0; i < passives; i++) {
    const a = new Animal(range(rng, 150, WORLD_W - 150), 'passive')
    a.y = w.terrain.heightAt(a.x) - 4
    w.spawn(a)
  }
  const aggros = irange(rng, 1, 3) + Math.round(diff * irange(rng, 0, 2)) +
    (quirks.has('fauna') ? 2 + irange(rng, 0, 2) : 0)
  for (let i = 0; i < aggros; i++) {
    const a = new Animal(range(rng, 150, WORLD_W - 150), 'aggro')
    a.y = w.terrain.heightAt(a.x) - 4
    w.spawn(a)
  }

  // player + lander (flight stage positions the lander at the top)
  w.lander = new Lander()
  w.lander.x = WORLD_W / 2
  w.lander.y = 150
  w.spawn(w.lander)

  w.player = new Player()
  w.player.inLander = true
  w.spawn(w.player)

  return w
}
