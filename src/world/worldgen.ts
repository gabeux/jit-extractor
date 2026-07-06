import { World, WORLD_W } from './world'
import { Player } from '../entities/player'
import { Lander } from '../entities/lander'
import { Pirate } from '../entities/pirate'
import { Native } from '../entities/native'
import { Animal } from '../entities/animal'
import { range, irange } from '../rng'

// Builds a fresh planet from one seed: terrain, flora, resource nodes with
// pirate guards, one native camp, roaming animals, and the player + lander.
export function generateWorld(seed: number): World {
  const w = new World(seed)
  const rng = w.rng

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

  // pirates guard ~60% of the nodes, sometimes in pairs
  for (const x of nodeXs) {
    if (rng() < 0.6) {
      const n = rng() < 0.3 ? 2 : 1
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

  // starting fauna
  const passives = irange(rng, 3, 5)
  for (let i = 0; i < passives; i++) {
    const a = new Animal(range(rng, 150, WORLD_W - 150), 'passive')
    a.y = w.terrain.heightAt(a.x) - 4
    w.spawn(a)
  }
  const aggros = irange(rng, 1, 3)
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
